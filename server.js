// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server); 

const PORT = process.env.PORT || 3000;

// Trạng thái game toàn cục
const gameState = {
    players: {},
    playerCount: 0,
    runnerId: null, 
    hunterId: null, 
    isGameOver: false,
    catchDistanceSquared: 3600 // (30 + 30)^2
};

// ===============================================
// **SỬA LỖI CANNOT GET /**
// Phục vụ index.html trực tiếp từ thư mục gốc
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
// ===============================================


// Logic giao tiếp Socket.IO
io.on('connection', (socket) => {
    
    if (gameState.playerCount < 2) {
        gameState.playerCount++;
        let role = (gameState.runnerId === null) ? 'runner' : 'hunter';
        
        if (role === 'runner') gameState.runnerId = socket.id;
        else gameState.hunterId = socket.id;

        // Khởi tạo vị trí
        let startX = 300 + (role === 'runner' ? -100 : 100);
        gameState.players[socket.id] = { x: startX, y: 200, role, vx: 0, vy: 0, size: 30 };

        socket.emit('playerRole', role);
        if (gameState.playerCount === 2) {
             io.emit('readyToStart', 'Game is ready!');
        }
    } else {
        socket.emit('fullServer', 'Server is full (2/2 players).');
        socket.disconnect(true);
        return;
    }

    // Lắng nghe vị trí di chuyển từ Client
    socket.on('playerMovement', (movementData) => {
        const player = gameState.players[socket.id];
        if (player && !gameState.isGameOver) {
            player.x = movementData.x;
            player.y = movementData.y;
            
            // Kiểm tra va chạm (Logic BẮT)
            if (player.role === 'hunter') {
                const runner = gameState.players[gameState.runnerId];
                if (runner) {
                    const dx = player.x - runner.x;
                    const dy = player.y - runner.y;
                    const distanceSquared = dx * dx + dy * dy;

                    if (distanceSquared < gameState.catchDistanceSquared) {
                        gameState.isGameOver = true;
                        io.emit('gameOver', { winner: 'Hunter', message: 'Hunter (Green) caught the Runner (Yellow)!' });
                    }
                }
            }
        }
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
        if (gameState.players[socket.id]) {
            gameState.playerCount--;
            delete gameState.players[socket.id];
            
            socket.broadcast.emit('playerDisconnected', socket.id);
            if (gameState.playerCount < 2) {
                gameState.isGameOver = true;
                if(gameState.playerCount === 1) {
                    io.emit('gameOver', { winner: 'System', message: 'Opponent disconnected. You win!' });
                }
            }
        }
    });
});

// Vòng lặp gửi trạng thái game (60 FPS)
setInterval(() => {
    if (gameState.playerCount > 0) {
        io.emit('stateUpdate', gameState.players);
    }
}, 1000 / 60);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});