/**
 * Application entry point
 */

var express = require('express');
var path = require('path');
var app = express();
var partygame = require('./partygame');

// app.use(express.logger('dev'));
app.use(express.static(path.join(__dirname, 'static')));

var server = require('http').createServer(app).listen(process.env.PORT || 8080);
var io = require('socket.io').listen(server);

io.sockets.on('connection', function(socket) {
    console.log('client connected');
    partygame.initGame(io, socket);
});
