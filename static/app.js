;
jQuery(function($) {
    'use strict';

    // Constants
    var NEXT_ROUND_COUNTDOWN = 5; // seconds
    var PROMPT_COUNTDOWN = 15; // seconds

    var IO = {
        /**
         * Called when page is displayed. Connects the Socket.IO client to the Socket.IO server.
         */
        init: function() {
            console.log('IO.init');
            IO.socket = io.connect();
            IO.bindEvents();
        },

        /**
         * While connected, Socket.IO will listen to these events emitted by the Socket.IO server.
         */
        bindEvents: function() {
            IO.socket.on('connected', IO.onConnected);
            IO.socket.on('newGameCreated', IO.onNewGameCreated);
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom);
            IO.socket.on('beginNextRound', IO.beginNextRound);
            IO.socket.on('newPromptData', IO.onNewPromptData);
            IO.socket.on('newAnswerData', IO.onNewAnswerData);
            IO.socket.on('doneVoting', IO.onDoneVoting);
            IO.socket.on('error', IO.error);
            IO.socket.on('restartWithNewPlayers', IO.onRestartWithNewPlayers);
        },

        /**
         * Called when client is successfully connected.
         */
        onConnected: function() {
            console.log('onConnected');
            // Cache a copy of the client's Socket.IO session ID on the App
            // App.mySocketId = IO.socket.socket.sessionid;
            App.mySocketId = IO.socket.io.engine.id;
        },

        /**
         * New game has been created and random game ID was generated.
         * @param data {{ gameId: int, mySocketId: * }}
         */
        onNewGameCreated: function(data) {
            App.Host.gameInit(data);
        },

        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameId: int, mySocketId: int}}
         */
        playerJoinedRoom: function(data) {
            // Call the appropriate updateWaitingScreen function
            // depending on if I am a Host or Player
            App[App.myRole].updateWaitingScreen(data);
        },

        /**
         * Everybody has joined the game. Start countdown.
         * @param data {{ gameId, socketId?, leaderboard }}
         */
        beginNextRound: function(data) {
            App[App.myRole].gameCountdown(data);
        },

        /**
         * A new prompt is returned from the server.
         * Host will display prompt, Players will input answers.
         * @param data {{round: int}}
         */
        onNewPromptData: function(data) {
            console.log('onNewPromptData');
            App[App.myRole].newPrompt(data);
        },

        /**
         * The list of answers is returned from the server.
         * Host will display answers, Players will vote on them.
         * @param data Array of {answer: string, shouldHide: bool}
         */
        onNewAnswerData: function(data) {
            console.log('onNewAnswerData');
            App.$gameArea.html(App.$templateAnswers);
            var numVisibleAnswers = 0;
            for(var i = 0; i < data.length; i++) {
                if(!data[i]['shouldHide']) {
                    numVisibleAnswers++;
                    $('#answersList').append('<li><button class="btnAnswer" + value="' 
                        + data[i]['answer'] + '">' + data[i]['answer'] + '</button></li>');
                }
            }

            // If there aren't any answers to display, then automatically send a null vote to server
            if(numVisibleAnswers == 0) {
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    vote: null
                };
                IO.socket.emit('playerVote', data);
                
                // Disable input
                App.$gameArea.html(App.$templateWaitingPassive);
                $('#waitingPassiveMessage').text('Nothing to vote on. Waiting for other players...');
            }
        },

        /**
         * Host should display round results.
         * @param roundResults [ {votes, playerName, answer}, ... ]
         */
        onDoneVoting: function(roundResults) {
            console.log('onDoneVoting');
            console.log(roundResults);

            // Display the round results
            App.$gameArea.html(App.$templateRoundResults);
            for(var i = 0; i < roundResults.length; i++) {
                $('#roundResultsList').append('<li>' 
                    + '<span>' + roundResults[i]['votes'] + '</span>'
                    + '<span>' + roundResults[i]['answer'] + '</span>'
                    + '<span>' + roundResults[i]['playerName'] + '</span>'
                    + '</li>');
            }

            // Start the countdown to start next round (where we show overall leaderboard)
            var $countdownLabel = $('.countdownLabel');
            App.countDown($countdownLabel, NEXT_ROUND_COUNTDOWN, function() {
                IO.socket.emit('hostPostRoundCountdownFinished', App.gameId);
            });
        },

        /**
         * Host should create a new room, and players should auto-choose Player role.
         * @param gameId
         */
        onRestartWithNewPlayers: function(gameId) {
            App[App.myRole].restartWithNewPlayers(gameId);
        },

        /**
         * An error has occurred.
         * @param data
         */
        error: function(data) {
            alert(data.message);
        }
    };

    var App = {
        gameId: 0, // Socket.IO Room
        myRole: '', // 'Player' or 'Host'

        // Socket.IO socket object ID, unique for each player/host
        // generated when browser connectes to server for first time
        mySocketId: '', 

        /**
         * Runs when page initially loads.
         */
        init: function() {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();
            FastClick.attach(document.body);
        },

        /**
         * Create references to on-screen elements used in game.
         */
        cacheElements: function() {
            App.$doc = $(document);
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$templateWaitingScreen = $('#waiting-template').html();
            App.$templatePlayerEnterAnswer = $('#player-enter-answer-template').html();
            App.$templateDisplayPrompt = $('#host-display-prompt-template').html();
            App.$templateDisplayLeaderboard = $('#host-display-leaderboard-template').html();
            App.$templateAnswers = $('#host-answers-template').html();
            App.$templateRoundResults = $('#host-round-results-template').html();
            App.$templateWaitingPassive = $('#waiting-passive-template').html();
            App.$templatePlayerGameOver = $('#player-game-over-template').html();
            
        },

        /**
         * Create click handlers for buttons.
         */
        bindEvents: function() {
            // Title Screen
            App.$doc.on('click', '#btnSelectRoleHost', App.Host.onSelectRoleHost);
            App.$doc.on('click', '#btnSelectRolePlayer', App.Player.onSelectRolePlayer);

            // Player Screen
            App.$doc.on('click', '#btnJoin', App.Player.onPlayerJoinClick);
            App.$doc.on('click', '#btnEverybodysIn', App.Player.onPlayerStartClick);
            App.$doc.on('click', '#btnSubmitAnswer', App.Player.onPlayerAnswerClick);
            App.$doc.on('click', '#btnPlayAgainSamePlayers', App.Player.onPlayerRestart);
            App.$doc.on('click', '#btnPlayAgainNewPlayers', App.Player.onPlayerRestartNewPlayersClick);
            App.$doc.on('click', '.btnAnswer', App.Player.onPlayerVote);
            
        },

        /**
         * Show initial title screen.
         */
        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
            // App.doTextFit('.title');
        },

        Host: {
            players: [],
            isNewGame: false, // used when players restart post-game

            /**
             * Handler for choosing Host role on the Title Screen.
             */
            onSelectRoleHost: function() {
                console.log('Selected role: HOST');
                IO.socket.emit('hostCreateNewGame');
            },

            /**
             * Display Host screen for first time.
             * @param data{{ gameId: int, mySocketId: * }}
             */
            gameInit: function(data) {
                App.gameId = data.gameId;
                App.mySocketId = data.mySocketId;
                App.myRole = 'Host';
                App.Host.displayNewGameScreen();
                console.log('Game started with ID: ' + App.gameId + ' by host: ' + App.mySocketId);
            },

            /**
             * Show the Host screen containing the game URL and unique game ID
             */
            displayNewGameScreen: function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#gameURL').text(window.location.href);
                // App.doTextFit('#gameURL');
                $('#spanNewGameCode').text(App.gameId);
            },

            /**
             * Update the Host screen when players join
             * @param data({playerName: string, gameId: int, mySocketId: int})
             */
            updateWaitingScreen: function(data) {
                if(App.Host.isNewGame) {
                    App.Host.displayNewGameScreen();
                }

                $('#playersWaiting').append('<p>Player ' + data.playerName + ' joined.</p>');
                App.Host.players.push(data);
                console.log('Player ' + data.playerName + ' joined.');
            },

            /**
             * About to do next round. Show the leaderboard and start the countdown on Host.
             * @param data {{ TODO }}
             */
            gameCountdown: function(data) {
                console.log('gameCountdown. hostData:');
                console.log(data);
                
                // Display the overall leaderboard
                App.$gameArea.html(App.$templateDisplayLeaderboard);
                $('#playerScores').empty();
                for(var i = 0; i < data.leaderboard.length; i++) {
                    $('#playerScores').append('<li>' + data.leaderboard[i].score + ' | ' + data.leaderboard[i].playerName + '</li>');
                }
                
                if(data.isGameOver) {
                    // Game over
                    $('#gameOverLabel').text('Game over');
                } else {
                    // Start countdown for next round
                    var $countdownLabel = $('.countdownLabel');
                    App.countDown($countdownLabel, NEXT_ROUND_COUNTDOWN, function() {
                        IO.socket.emit('hostPreRoundCountdownFinished', App.gameId);
                    });
                }
            },

            /**
             * Show the prompt for the current round on Host.
             * @param data({round: int, prompt: string, title: string})
             */
            newPrompt: function(data) {
                App.$gameArea.html(App.$templateDisplayPrompt);
                $('#prompt').text(data.prompt);
                $('#promptTitle').text(data.title);
                console.log('prompt');
                console.log($('#prompt'));
                console.log(data);

                // Start the countdown
                var $countdownLabel = $('.countdownLabel');
                App.countDown($countdownLabel, PROMPT_COUNTDOWN, function() {
                    IO.socket.emit('hostPromptCountdownFinished', App.gameId);
                    // TODO: Cancel this if everybody answers before countdown ends
                });
            },

            /**
             * Host should start new game.
             */
            restartWithNewPlayers: function() {
                IO.socket.emit('hostCreateNewGame');
            },

            /**
             * A player clicked 'Restart' after end of game.
             */
            restartGame: function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#spanNewGameCode').text(App.gameId);
            }
        },

        Player: {
            hostSocketId: '',
            myName: '',

            /**
             * Handler for clicking 'JOIN' button.
             */
            onSelectRolePlayer: function() {
                console.log('onSelectRolePlayer');
                App.$gameArea.html(App.$templateJoinGame);
            },

            /**
             * Player entered their name and gameId and clicked 'Join'. Tell server. 
             */
            onPlayerJoinClick: function() {
                console.log('onPlayerJoinClick');
                var data = {
                    gameId: +($('#inputGameId').val()),
                    playerName: $('#inputPlayerName').val() || 'Anonymous'
                };
                IO.socket.emit('playerJoinGame', data);
                App.myRole = 'Player';
                App.Player.myName = data.playerName;

                // TODO: How do we handle if this fails? 
            },

            /**
             * Player clicked 'Everybody's In'. Tell server to start game. 
             */
            onPlayerStartClick: function() {
                console.log('onPlayerStartClick');
                IO.socket.emit('playerStartGame', App.gameId);
            },

            /**
             * Player submitted an answer.
             */
            onPlayerAnswerClick: function() {
                console.log('onPlayerAnswerclick');
                var answer = $('#inputPlayerAnswer').val();
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    answer: answer
                };
                IO.socket.emit('playerAnswer', data);
                
                // Disable input
                App.$gameArea.html(App.$templateWaitingPassive);
                $('#waitingPassiveMessage').text('Waiting for other players...');
            },

            /**
             * Player voted for an answer.
             */
            onPlayerVote: function() {
                console.log('onPlayerVote');
                
                if(App.myRole == 'Host') {
                    // Clicking these buttons on the Host is a no-op
                    return;
                }

                var $btn = $(this);
                var vote = $btn.val();
                var data = {
                    gameId: App.gameId,
                    playerId: App.mySocketId,
                    vote: vote
                };
                IO.socket.emit('playerVote', data);
                
                // Disable input
                App.$gameArea.html(App.$templateWaitingPassive);
                $('#waitingPassiveMessage').text('Waiting for other players...');
            },

            /**
             * Player clicked 'Restart' button after game is over.
             */
            onPlayerRestart: function() {
                IO.socket.emit('playerRestart', App.gameId);
                $('#gameArea').html("<h3>Waiting on host to start new game.</h3>");
            },

            /**
             * Player clicked 'Restart with New players' after game is over.
             */
            onPlayerRestartNewPlayersClick: function() {
                IO.socket.emit('playerRestartNewPlayers', App.gameId);
            },

            /**
             * Player should join new game.
             */
            restartWithNewPlayers: function() {
                window.location.reload();
            },

            /**
             * Display the waiting screen for Player
             * @param data({playerName: string, gameId: int, mySocketId: int})
             */
            updateWaitingScreen: function(data) {
                if(IO.socket.io.engine.id === data.mySocketId) {
                    App.myRole = 'Player';
                    App.gameId = data.gameId;
                    App.$gameArea.html(App.$templateWaitingScreen);
                    $('#playerWaitingMessage').text('Joined game ' + data.gameId + '.');
                }
            },

            /**
             * Display 'Get Ready' on Player's device while the Host's countdown timer ticks down.
             * @param data {{mySocketId, leaderboard: [] }}
             */
            gameCountdown: function(data) {
                if(data.isGameOver) {
                    // Game over. Display restart button.
                    App.$gameArea.html(App.$templatePlayerGameOver);
                } else {
                    // TODO: Use a template?
                    $('#gameArea').html('<div class="gameOver">Get Ready!</div>'); 
                }
            },

            /**
             * Display input box on Player's device while Host displays prompt.
             * @param data{{round: int, prompt: string}}
             */
            newPrompt: function(data) {
                console.log('newPrompt');
                App.$gameArea.html(App.$templatePlayerEnterAnswer);
            }
        },

        /**
         * Display the countdown timer on the Host screen.
         * @param $el The container element for the countdown timer
         * @param startTime Number of seconds to start from
         * @param callback The function to call when the timer ends
         */
        countDown: function($el, startTime, callback) {
            console.log('countDown');
            $el.text(startTime);
            var timer = setInterval(doDecrement, 1000);
            function doDecrement() {
                startTime -= 1;
                $el.text(startTime);
                if(startTime <= 0) {
                    clearInterval(timer);
                    callback();
                    return;
                }
            }
        }
    };

    IO.init();
    App.init();

}($));