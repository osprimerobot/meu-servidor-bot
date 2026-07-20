const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.send('🚀 Servidor do Bot rodando liso e sem limites!'));

let painelAdminData = {};

io.on('connection', (socket) => {
  
  // 1. Chefe entra no painel
  socket.on('entrar_admin', () => {
    socket.join('sala_dos_chefes');
    socket.emit('atualizar_painel', painelAdminData);
  });

  // 2. Cliente abre o app (Só olha o radar, NÃO CONTA COMO ON)
  socket.on('espiar_radar', (email) => {
    socket.join(email + '_espiando');
    const qtdOnline = io.sockets.adapter.rooms.get(email)?.size || 0;
    socket.emit('atualizar_qtd', qtdOnline);
  });

  // 3. Cliente clica em LIGAR BOT (Agora sim ele conta!)
  socket.on('ligar_motor', (email) => {
    socket.join(email);
    socket.email = email;

    const qtdOnline = io.sockets.adapter.rooms.get(email).size;
    
    // Avisa quem tá rodando e quem tá só olhando a tela inicial
    io.to(email).emit('atualizar_qtd', qtdOnline);
    io.to(email + '_espiando').emit('atualizar_qtd', qtdOnline);

    // Atualiza a tela do Chefe
    painelAdminData[email] = { status: '🟢 ON', aparelhos: qtdOnline };
    io.to('sala_dos_chefes').emit('atualizar_painel', painelAdminData);
  });

  // 4. Cliente clica em DESLIGAR BOT
  socket.on('desligar_motor', () => {
    if (socket.email) {
        socket.leave(socket.email); // Sai da sala de trabalho
        
        const qtdOnline = io.sockets.adapter.rooms.get(socket.email)?.size || 0;
        
        io.to(socket.email).emit('atualizar_qtd', qtdOnline);
        io.to(socket.email + '_espiando').emit('atualizar_qtd', qtdOnline);

        if (qtdOnline === 0) {
            painelAdminData[socket.email] = { status: '🔴 OFF', aparelhos: 0 };
        } else {
            painelAdminData[socket.email].aparelhos = qtdOnline;
        }
        io.to('sala_dos_chefes').emit('atualizar_painel', painelAdminData);
        
        delete socket.email; // Remove a tag pra não contar duplo no disconnect
    }
  });

  // 5. Cliente fecha o aplicativo ou internet cai
  socket.on('disconnect', () => {
    if (socket.email) {
      const qtdOnline = io.sockets.adapter.rooms.get(socket.email)?.size || 0;

      io.to(socket.email).emit('atualizar_qtd', qtdOnline);
      io.to(socket.email + '_espiando').emit('atualizar_qtd', qtdOnline);

      if (qtdOnline === 0) {
         painelAdminData[socket.email] = { status: '🔴 OFF', aparelhos: 0 };
      } else {
         painelAdminData[socket.email].aparelhos = qtdOnline;
      }
      io.to('sala_dos_chefes').emit('atualizar_painel', painelAdminData);
    }
  });

  // 6. O raio da morte do Chefe
  socket.on('admin_bloquear_cliente', (email_caloteiro) => {
     // Manda o bloqueio tanto pra quem tá farmando quanto pra quem tá com o app só aberto
     io.to(email_caloteiro).emit('ordem_de_bloqueio');
     io.to(email_caloteiro + '_espiando').emit('ordem_de_bloqueio');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🔥 Servidor voando na porta ${PORT}`));
