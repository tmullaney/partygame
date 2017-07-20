/**
 * Server-side game logic
 * 
 * Flow:
 *  1)  Everybody starts on Title Screen
 *  2)  Host (big screen) creates new game 
 *  3)  Players (mobile devices) join game
 *  4)  A player indicates that everybody is ready
 *  5)  Host displays leaderboard (5 sec)
 *  6)  Host displays prompt (30 sec)
 *  7)  Players input answers
 *  8)  Host displays answers
 *  9)  Players vote on best answers
 *  10) Host displays voting results
 *  11) Return to #5 and loop for full game
 *  12) Host displays winner
 *  13) A player clicks 'Restart'
 */

// Global references
var io; // Sockets.IO instance for whole application
var gameSocket; // Socket for this connection/game (is this necessary?)

// Global data structure to keep track of ongoing games states
// This is hacky and not designed to scale to many concurrent games!
// {
//     gameId: {
//         hostId: guid,
//         players: { 
//              playerId: {
//                  playerName: string, 
//                  score: int
//              }, ... 
//         },
//         currentRound: int,
//         whoHasVoted: [playerId, playerId, ...],
//         currentAnswers: [ {answer: string, playerId: guid, votes: int}, ... ],
//         currentPrompt: {title, prompt},
//         promptIds: [int, int, int]
//     }, ...
// }
var games = {};

var NUM_ROUNDS = 3;

/**
 * Prompt pool is a list of string prompts
 */
// TODO: Put prompts into a database that can be queried easily
// Potential sources of trivia questions: 
// https://github.com/atbaker/wikipedia-question-generator
// https://raw.githubusercontent.com/joebandenburg/fibbage-questions/master/questions.json
// https://www.cardcastgame.com/
var promptPool = require('./data/sample.json');

/**
 * Called by index.js to initialize a new game.
 * @param sio The Socket.IO library
 * @param socket The socket object for the connected client
 */
exports.initGame = function(sio, socket) {
    console.log('initGame');
    io = sio;
    gameSocket = socket;
    gameSocket.emit('connected', { message: "You are connected!" });

    // Host events
    gameSocket.on('hostCreateNewGame', hostCreateNewGame);
    gameSocket.on('hostPreRoundCountdownFinished', hostStartRound);
    gameSocket.on('hostNextRound', hostNextRound);
    gameSocket.on('hostPromptCountdownFinished', hostDisplayAnswers);
    gameSocket.on('hostPostRoundCountdownFinished', hostNextRound);

    // Player events
    gameSocket.on('playerJoinGame', playerJoinGame);
    gameSocket.on('playerStartGame', hostNextRound);
    gameSocket.on('playerAnswer', playerAnswer);
    gameSocket.on('playerVote', playerVote);
    gameSocket.on('playerRestart', playerRestart);
    gameSocket.on('playerRestartNewPlayers', playerRestartNewPlayers);
}

/************************************/
/* Host functions                   */
/************************************/

/**
 * New Host connected. Create a new game room.
 */
function hostCreateNewGame() {
    console.log('hostCreateNewGame');
    var thisGameId = ( Math.random() * 1000000 ) | 0; // TODO: Ensure no collisions with ongoing games
    this.emit('newGameCreated', { gameId: thisGameId, mySocketId: this.id });
    this.join(thisGameId.toString());
    games[thisGameId] = {
        hostId: this.id,
        currentRound: 0,
        players: {}
    };
}

/**
 * Pre-round countdown has finished, so start the round (show a prompt).
 */
function hostStartRound(gameId) {
    console.log('hostStartRound');
    games[gameId]['currentRound'] += 1;
    games[gameId]['whoHasVoted'] = [];
    games[gameId]['currentAnswers'] = [];
    sendPrompt(games[gameId]['currentRound'], gameId);
}

/**
 * Prompt countdown has finished. Display the answers to vote on.
 */
function hostDisplayAnswers(gameId) {
    console.log('hostDisplayAnswers');
    
    // Display in random order
    games[gameId]['currentAnswers'] = shuffle(games[gameId]['currentAnswers']);
    
    // Send all answers to Host
    var answers = games[gameId]['currentAnswers'].map(function(obj) {
        return {
            'answer': obj['answer'], 
            'shouldHide': false};
        });
    data = {
        'prompt': games[gameId]['currentPrompt']['question'],
        'title': games[gameId]['currentPrompt']['title'],
        'answers': answers
    };
    io.sockets.to(games[gameId]['hostId']).emit('newAnswerData', data);

    // Send customized list of answers to each Player
    // Use 'shouldHide' so players can't vote for their own answer
    // Players don't need the prompt since it's only displayed on Host
    var playerIds = Object.keys(games[gameId]['players']);
    for(var i = 0; i < playerIds.length; i++) {
        answers = games[gameId]['currentAnswers'].map(function(obj) {
            return {
                'answer': obj['answer'], 
                'shouldHide': (obj['playerId'] == playerIds[i])
            };
        });
        var data = {'answers': answers};
        console.log('OKAY HERE"S THE DATA');
        console.log(data);

        // If nobody else submitted an answer, then this player doesn't need to vote
        if(data.answers.length == 0) {
            console.log('one');
            games[gameId]['whoHasVoted'].push(playerIds[i]);
        } else if(data.answers.length == 1 && data.answers[0]['shouldHide']) {
            console.log('two')
            games[gameId]['whoHasVoted'].push(playerIds[i]);
        }

        io.sockets.to(playerIds[i]).emit('newAnswerData', data);
    }
}

/**
 * Done showing round results. Tell Host to display overall leaderboard and
 * start countdown for next round.
 * @param gameId 
 */
function hostNextRound(gameId) {
    console.log(games[gameId]['players']);
    var leaderboard = Object.keys(games[gameId]['players']).map(function(key) {
        return games[gameId]['players'][key];
    });
    function compare(a,b) {
        if(a.score < b.score) {return -1;}
        if(a.score > b.score) {return 1;}
        return 0; 
    }
    leaderboard.sort(compare);

    var sock = this;
    var data = {
        mySocketId: sock.id,
        gameId: gameId,
        leaderboard: leaderboard,
        isGameOver: games[gameId]['currentRound'] >= NUM_ROUNDS,
        numRoundsComplete: games[gameId]['currentRound'],
        numRoundsTotal: NUM_ROUNDS
    };
    io.sockets.in(data.gameId).emit('beginNextRound', data);
}

/************************************/
/* Player functions                 */
/************************************/

/**
 * A player clicked the 'Start game' button.
 * Try to connect them to the room that matches the gameId they specified.
 * @param data {{playerName, gameId}}
 */
function playerJoinGame(data) {
    console.log('Player ' + data.playerName + ' trying to join game ' + data.gameId);
    var sock = this;
    var room = gameSocket.adapter.rooms[data.gameId]; // io.sockets.adapter.rooms

    // Make sure room exists
    if(room != undefined) {
        // Make sure player name isn't already taken
        var playerNamesInRoom = [];
        for (var playerId in games[data.gameId]['players']) {
            if (games[data.gameId]['players'].hasOwnProperty(playerId)) {
                playerNamesInRoom.push(games[data.gameId]['players'][playerId]['playerName']);
            }
        }
        if(playerNamesInRoom.indexOf(data.playerName) >= 0) {
            io.sockets.to(sock.id).emit('error', {'message': 'Player name is already taken.'});
        } else {
            // Join the room
            data.mySocketId = sock.id;
            sock.join(data.gameId);
            games[data.gameId]['players'][data.mySocketId] = {'playerName': data.playerName, 'score': 0};
            console.log('Player ' + data.playerName + ' joined game ' + data.gameId);

            // Notify everyone that player has successfully joined
            io.sockets.in(data.gameId).emit('playerJoinedRoom', data);
        }
    } else {
        io.sockets.to(sock.id).emit('error', {'message': 'Room does not exist.'});
    }
}

/**
 * A player has submitted an answer.
 * @param data{{gameId: int, playerId: *, answer: string, round: int}}
 */
function playerAnswer(data) {
    console.log('playerAnswer');
    games[data.gameId]['currentAnswers'].push({
        'answer': data.answer,
        'playerId': data.playerId,
        'votes': 0
    });
}

/**
 * A player has submitted a vote.
 * @param data {{gameId, playerId, vote}}
 */
function playerVote(data) {
    console.log('playerVote');
    console.log(data);

    // TODO: Should we have a countdown timer for voting too (and subtract from your score 
    // if you're too slow, or force everyone to vote?
    
    // Prevent player from double-voting
    if(games[data.gameId]['whoHasVoted'].indexOf(data['playerId']) == -1) {
        // Increment vote count
        // Check based on answer text (not id) so we count everybody in case multiple people
        // answered the same thing and it got a vote 
        games[data.gameId]['whoHasVoted'].push(data['playerId']);
        for(var i = 0; i < games[data.gameId]['currentAnswers'].length; i++) {
            if(games[data.gameId]['currentAnswers'][i]['answer'] == data['vote']) {
                games[data.gameId]['currentAnswers'][i]['votes'] += 1;
            }
        }
    }

    // If everybody has voted, then we can determine the winner
    if(games[data.gameId]['whoHasVoted'].length >= Object.keys(games[data.gameId]['players']).length) {
        doneVoting(data.gameId);
    }
}

/**
 * Everybody is done voting. Tell Host to display the winner.
 * @param gameId
 */
function doneVoting(gameId) {
    var roundResults = []; // structure: [ {votes, playerName, answer}, ... ] 
    for(var i = 0; i < games[gameId]['currentAnswers'].length; i++) {
        var answer = games[gameId]['currentAnswers'][i];
        var playerName = games[gameId]['players'][answer.playerId]['playerName'];
        roundResults.push({'votes': answer['votes'], 'playerName': playerName, 'answer': answer['answer']});
        games[gameId]['players'][answer.playerId]['score'] += answer['votes'];
    }

    // TODO: Sort on votes, high to low
    // TODO: Also send the real answer to be displayed

    // Notify Host to display winner
    io.sockets.to(games[gameId]['hostId']).emit('doneVoting', roundResults);
}

/**
 * Game is over and player clicks button to restart game.
 * @param gameId
 */
function playerRestart(gameId) {
    console.log('playerRestart');

    // Reset round and score info
    games[gameId]['currentRound'] = 0;
    playerIds = Object.keys(games[gameId]['players']);
    for(var i = 0; i < playerIds.length; i++) {
        var playerId = playerIds[i];
        if(games[gameId]['players'].hasOwnProperty(playerId)) {
            games[gameId]['players'][playerId]['score'] = 0;
        }
    }

    hostNextRound(gameId);
}

/**
 * Game is over and player clicks button to start a new game.
 * @param data 
 */
function playerRestartNewPlayers(gameId) {
    console.log('playerRestartNewPlayers');
    io.sockets.in(gameId).emit('restartWithNewPlayers', null);
}


/************************************/
/* Game logic                       */
/************************************/

/**
 * Get a prompt for the Host, and tell Players to enter their answers.
 * @param round The round number for this prompt
 * @param gameId The room identifier
 */
function sendPrompt(round, gameId) {
    console.log('sendPrompt');

    if(!games[gameId]['promptIds']) {
        // First prompt request. Generate a random list of prompt IDs.
        // We'll use this list of IDs for the game to ensure no repeat questions. 
        var idList = [];
        for(var i = 0; i < NUM_ROUNDS; i++) {
            idList.push(i);
        }
        shuffle(idList);
        games[gameId]['promptIds'] = idList;
        console.log(games[gameId]['promptIds']);
    }

    var prompt = promptPool[games[gameId]['promptIds']][round];
    var data = {
        round: round, 
        prompt: prompt['question'],
        title: prompt['title']
    };
    games[gameId]['currentPrompt'] = prompt;
    io.sockets.in(gameId).emit('newPromptData', data);
}


/*
 * Javascript implementation of Fisher-Yates shuffle algorithm
 * http://stackoverflow.com/questions/2450954/how-to-randomize-a-javascript-array
 */
function shuffle(array) {
    var currentIndex = array.length;
    var temporaryValue;
    var randomIndex;
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array;
}

