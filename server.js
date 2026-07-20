const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const admin = require("firebase-admin");
const fs = require('fs');

// 1. INICIALIZA O COFRE DO FIREBASE
let serviceAccount;

// O Render esconde arquivos secretos na pasta /etc/secrets/
const caminhoRender = '/etc/secrets/firebase-key.json';
const caminhoLocal = './firebase-key.json'; // Pra caso você rode no PC depois

try {
    if (fs.existsSync(caminhoRender)) {
        serviceAccount = require(caminhoRender);
    } else if (fs.existsSync(caminhoLocal)) {
        serviceAccount = require(caminhoLocal);
    } else {
        console.error("⚠️ Arquivo firebase-key.json não encontrado no cofre do Render!");
    }
} catch (error) {
    console.error("⚠️ Erro ao ler a chave do Firebase:", error);
}

let db;
if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://seofast-3b0ab-default-rtdb.firebaseio.com" // O link do seu banco!
    });
    db = admin.database();
    console.log("✅ Servidor Master conectado ao Firebase com sucesso!");
} else {
    console.log("❌ Rodando sem Firebase: Chave Mestra não encontrada.");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.send('🚀 Servidor Master rodando com Integração Firebase Total!'));

// Guarda as informações misturadas (HD + RAM)
let cacheUsuariosFirebase = {};

// Fica de olho no Firebase se a conexão deu certo
if (db) {
    db.ref("Usuarios").on("value", (snapshot) => {
        if (snapshot.exists()) {
            cacheUsuariosFirebase = snapshot.val();
            enviarPainelParaAdmin(); // Atualiza a tela do chefe na mesma hora!
        }
    });
}

// O MOTOR QUE MISTURA AS INFORMAÇÕES
function enviarPainelParaAdmin() {
    let painelMisto = {};

    for (const [idNode, dados] of Object.entries(cacheUsuariosFirebase)) {
        let email = dados.email || "Sem Email";
        
        // Pergunta pro radar quantas telas verdes esse e-mail tem abertas agora
        const room = io.sockets.adapter.rooms.get(email);
        const qtdOnline = room ? room.size : 0;

        painelMisto[idNode] = {
            id_node: idNode,
            email: email,
            nome_celular: dados.nome_celular || "Desconhecido",
            status_firebase: dados.status || "Ativo",
            aparelhos_on: qtdOnline,
            is_online: qtdOnline > 0 ? '🟢 ON' : '🔴 OFF'
        };
    }
    // Dispara a tabela completa montada pro seu painel web
    io.to('sala_dos_chefes').emit('atualizar_painel_completo', painelMisto);
}

io.on('connection', (socket) => {
  
  // ==========================================
  // ÁREA DO CHEFE (Painel Web)
  // ==========================================
  socket.on('entrar_admin', () => {
    socket.join('sala_dos_chefes');
    enviarPainelParaAdmin(); 
  });

  socket.on('admin_bloquear_cliente', (dadosAcao) => {
     console.log("☠️ Banindo: " + dadosAcao.email);
     if (db) db.ref("Usuarios").child(dadosAcao.id_node).child("status").set("Banido pelo Admin");
     
     io.to(dadosAcao.email).emit('ordem_de_bloqueio');
     io.to(dadosAcao.email + '_espiando').emit('ordem_de_bloqueio');
  });

  socket.on('admin_desbanir_cliente', (idNode) => {
     console.log("😇 Perdoando: " + idNode);
     if (db) db.ref("Usuarios").child(idNode).child("status").set("Ativo");
  });

  // ==========================================
  // ÁREA DO APP (Celular do Cliente)
  // ==========================================
  socket.on('espiar_radar', (email) => {
    socket.join(email + '_espiando');
    const qtdOnline = io.sockets.adapter.rooms.get(email)?.size || 0;
    socket.emit('atualizar_qtd', qtdOnline);
  });

  socket.on('ligar_motor', (email) => {
    socket.join(email);
    socket.email = email;
    const qtdOnline = io.sockets.adapter.rooms.get(email).size;
    io.to(email).emit('atualizar_qtd', qtdOnline);
    io.to(email + '_espiando').emit('atualizar_qtd', qtdOnline);
    enviarPainelParaAdmin();
  });

  socket.on('desligar_motor', () => {
    if (socket.email) {
        socket.leave(socket.email); 
        const qtdOnline = io.sockets.adapter.rooms.get(socket.email)?.size || 0;
        io.to(socket.email).emit('atualizar_qtd', qtdOnline);
        io.to(socket.email + '_espiando').emit('atualizar_qtd', qtdOnline);
        enviarPainelParaAdmin();
        delete socket.email; 
    }
  });

  socket.on('disconnect', () => {
    if (socket.email) {
      const qtdOnline = io.sockets.adapter.rooms.get(socket.email)?.size || 0;
      io.to(socket.email).emit('atualizar_qtd', qtdOnline);
      io.to(socket.email + '_espiando').emit('atualizar_qtd', qtdOnline);
      enviarPainelParaAdmin();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🔥 Servidor Master voando na porta ${PORT}`));
