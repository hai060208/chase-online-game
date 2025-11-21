const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Dữ liệu game
const MAX_PLAYERS = 2;
let players = {};
let playerRoles = {
    hunter: null, // ID của Hunter
    runner: null  // ID của Runner
};
let isGameRunning = false;

// Thiết lập Express để phục vụ file tĩnh (index.html)
app.use(express.static(__dirname)); 

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Hàm kiểm tra va chạm giữa Hunter và Runner
function checkCollision() {
    const hunter = players[playerRoles.hunter];
    const runner = players[playerRoles.runner];

    if (!hunter || !runner) return false;

    // Tính khoảng cách giữa tâm 2 nhân vật
    const dx = hunter.x - runner.x;
    const dy = hunter.y - runner.y;
    const distance = Math.hypot(dx, dy);

    // Kiểm tra va chạm (tổng bán kính)
    return distance < (hunter.size / 2 + runner.size / 2);
}

// Hàm gán vai trò khi người chơi kết nối
function assignRole(socketId) {
    if (playerRoles.hunter === null) {
        playerRoles.hunter = socketId;
        return 'hunter';
    } else if (playerRoles.runner === null) {
        playerRoles.runner = socketId;
        return 'runner';
    }
    return 'spectator'; // Nếu đã đủ 2 người, gán vai trò khác (nếu cần)
}

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    if (Object.keys(players).length >= MAX_PLAYERS) {
        socket.emit('fullServer', 'Server is full. Please try again later.');
        socket.disconnect();
        return;
    }

    // Gán vai trò mới
    const role = assignRole(socket.id);

    // Khởi tạo trạng thái người chơi
    players[socket.id] = {
        x: (role === 'hunter') ? 300 : 100, // Vị trí khởi đầu khác nhau
        y: (role === 'hunter') ? 200 : 300,
        size: 30,
        role: role
    };

    socket.emit('playerRole', role);

    // Kiểm tra và bắt đầu game
    if (Object.keys(players).length === MAX_PLAYERS) {
        isGameRunning = true;
        io.emit('readyToStart', 'Game is starting!');
        console.log('Game started with Hunter:', playerRoles.hunter, 'and Runner:', playerRoles.runner);
    }
    
    // Xử lý di chuyển
    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;

            // Kiểm tra va chạm sau khi di chuyển
            if (isGameRunning && checkCollision()) {
                io.emit('gameOver', { winner: 'Hunter', message: 'Runner was caught!' });
                isGameRunning = false;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        delete players[socket.id];
        
        // Cập nhật lại vai trò sau khi ngắt kết nối
        if (playerRoles.hunter === socket.id) {
            playerRoles.hunter = null;
        } else if (playerRoles.runner === socket.id) {
            playerRoles.runner = null;
        }

        // Dừng game nếu có người thoát
        if (isGameRunning) {
            io.emit('gameOver', { winner: 'System', message: 'Opponent disconnected!' });
            isGameRunning = false;
        }

        io.emit('playerDisconnected', socket.id);
    });
});

// Vòng lặp game (Gửi trạng thái cập nhật)
setInterval(() => {
    io.emit('stateUpdate', players);
}, 1000 / 60); // Gửi 60 lần mỗi giây (60 FPS)

server.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});