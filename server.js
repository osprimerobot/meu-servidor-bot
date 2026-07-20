const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.send('🚀 Servidor do Bot rodando liso e sem limites!'));

let painelAdminData = {};

io.on('connection', (socket) => {
  
  socket.on('entrar_admin', () => {
    socket.join('sala_dos_chefes');
    socket.emit('atualizar_painel', painelAdminData);
  });

  socket.on('entrar', (email) => {
    socket.join(email);
    socket.email = email;

    const qtdOnline = io.sockets.adapter.rooms.get(email).size;
    io.to(email).emit('atualizar_qtd', qtdOnline);

    painelAdminData[email] = { status: '🟢 ON', aparelhos: qtdOnline };
    io.to('sala_dos_chefes').emit('atualizar_painel', painelAdminData);
  });

  // 🔥 O COMANDO NOVO QUE MATA OS FANTASMAS 🔥
  socket.on('sair', () => {
    if (socket.email) {
        socket.leave(socket.email);
        const room = io.sockets.adapter.rooms.get(socket.email);
        const qtdOnline = room ? room.size : 0;

        io.to(socket.email).emit('atualizar_qtd', qtdOnline);

        if (qtdOnline === 0) {
            painelAdminData[socket.email] = { status: '🔴 OFF', aparelhos: 0 };
        } else {
            painelAdminData[socket.email].aparelhos = qtdOnline;
        }
        io.to('sala_dos_chefes').emit('atualizar_painel', painelAdminData);
    }
  });

  socket.on('disconnect', () => {
    if (socket.email) {
      const room = io.sockets.adapter.rooms.get(socket.email);
      const qtdOnline = room ? room.size : 0;

      io.to(socket.email).emit('atualizar_qtd', qtdOnline);

      if (qtdOnline === 0) {
         painelAdminData[socket.email] = { status: '🔴 OFF', aparelhos: 0 };
      } else {
         painelAdminData[socket.email].aparelhos = qtdOnline;
      }
      io.to('sala_dos_chefes').emit('atualizar_painel', painelAdminData);
    }
  });

  socket.on('admin_bloquear_cliente', (email_caloteiro) => {
     io.to(email_caloteiro).emit('ordem_de_bloqueio');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🔥 Servidor voando na porta ${PORT}`));
