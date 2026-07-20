const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Uma página inicial simples pra gente ver que tá online
app.get('/', (req, res) => res.send('🚀 Servidor do Bot rodando liso e sem limites!'));

io.on('connection', (socket) => {
  
  // 1. Quando o celular liga o bot, ele manda o email
  socket.on('entrar', (email) => {
    socket.join(email); // Entra numa "sala VIP" com o nome do e-mail dele
    socket.email = email;

    // A MÁGICA: Conta quantas pessoas estão nessa sala VIP agora
    const qtdOnline = io.sockets.adapter.rooms.get(email).size;

    // Manda um rádio pra todos os celulares com esse e-mail: "Temos X aparelhos ON"
    io.to(email).emit('atualizar_qtd', qtdOnline);
    console.log(`🟢 ${email} conectou. Total ON: ${qtdOnline}`);
  });

  // 2. Quando a internet do cliente cai, ele fecha o app ou desliga o celular
  socket.on('disconnect', () => {
    if (socket.email) {
      // O Socket.io tira ele da sala automaticamente. Vamos contar quantos sobraram:
      const room = io.sockets.adapter.rooms.get(socket.email);
      const qtdOnline = room ? room.size : 0;

      // Avisa os aparelhos que sobraram que o amigo caiu
      io.to(socket.email).emit('atualizar_qtd', qtdOnline);
      console.log(`🔴 ${socket.email} desconectou. Restam: ${qtdOnline}`);
    }
  });

  // 3. O SEU GATILHO DE ADMIN: Quando você clicar em "Bloquear" no seu painel
  socket.on('admin_bloquear_cliente', (email_caloteiro) => {
     // Manda um raio na sala do cara banindo todos os celulares dele na mesma hora
     io.to(email_caloteiro).emit('ordem_de_bloqueio');
     console.log(`☠️ Ordem de bloqueio enviada para: ${email_caloteiro}`);
  });

});

// Liga a turbina na porta que o Render mandar
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🔥 Servidor voando na porta ${PORT}`));
