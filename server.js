require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./db');
const authRoutes = require('./auth');
const { disconnect } = require('process');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/api/auth', authRoutes);
 
const server = http.createServer(app);
 
const io = new Server(server, {
    cors:{
        origin: '*',
        methods:['GET', 'POST']
    }
})
 
const connectedUsers = {}
 
io.on('connection', (socket) => {
    console.log('Usuario conectado', socket.id)
    socket.on('autheticate', (token) =>{
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            const username = decoded.username

            connectedUsers[username] = socket.id
            socket.username = username

            io.emit('update-user-list', Object.keys(connectedUsers))
            console.log(`Usuário '${username}' autenticado. Usuários conectados:`, Object.keys(connectedUsers));
        } catch (error) {
           console.log("Autenticação falhou!")
            socket.disconnect()
        }
    })

    socket.on('private-message', async ({recipient, message}) => {
        const recipientSocketId = connectedUsers[recipient]
        const sender = socket.username

        if(recipientSocketId){
            await db.query('INSERT INTO messages (sender, recipient, message) VALUES (?,?,?)', [sender, recipient, message])

            const messageData = {sender, message, createAt: new Date()}

            io.to(recipientSocketId).emit('private-message', messageData)
            socket.emit('private-message', messageData)
        }
    })

    socket.on('load-history', async (recipient) => {
        const sender = socket.username
        const [history] = await db.query(
            `SELECT sender, message, createdAt FROM messages WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?) ORDER BY createdAt ASC`,
            [sender, recipient, recipient, sender]
        )
        socket.emit('history', history);
    })

    socket.on('disconnect', () =>{
        if(socket.username){
            delete connectedUsers[socket.username]
            io.emit('update-user-list', Object.keys(connectedUsers))
            console.log('Usuário desconectado');
        }
        console.log('Usuário desconectado');
    })
})
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));