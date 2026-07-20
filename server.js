const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const admin = require("firebase-admin");

let serviceAccount;
if (process.env.FIREBASE_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
    } catch (error) {
        console.error("⚠️ Erro ao ler o texto do Firebase nas variáveis:", error);
    }
}

let db;
if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://seofast-3b0ab-default-rtdb.firebaseio.com"
    });
    db = admin.database();
    console.log("✅ Super Servidor conectado ao Firebase!");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.send('🚀 Painel Master PRO - Rodando liso!'));

// Caches Inteligentes
let cacheUsuarios = {};
let cacheEmails = {};

if (db) {
    db.ref("Usuarios").on("value", (snapshot) => {
        cacheUsuarios = snapshot.val() || {};
        enviarPainelAgrupado();
    });
    db.ref("EmailsAutorizados").on("value", (snapshot) => {
        cacheEmails = snapshot.val() || {};
        enviarPainelAgrupado();
    });
}

function enviarPainelAgrupado() {
    let painelAgrupado = {};

    for (const [idNode, dados] of Object.entries(cacheUsuarios)) {
        // Pega as configurações (baseado na estrutura do seu Firebase)
        let config = dados.configuracoes || dados; 
        let email = config.email || "sem_email@cliente.com";
        let emailLimpo = email.replace(/\./g, '_');

        if (!painelAgrupado[email]) {
            let limiteAtual = cacheEmails[emailLimpo] ? cacheEmails[emailLimpo].limite : 0;
            let room = io.sockets.adapter.rooms.get(email);
            
            painelAgrupado[email] = {
                email: email,
                email_limpo: emailLimpo,
                limite: limiteAtual,
                total_online: room ? room.size : 0,
                aparelhos: []
            };
        }

        painelAgrupado[email].aparelhos.push({
            id_node: idNode,
            nome_celular: config.nome_celular || "Celular Desconhecido",
            ip: config.ip_rede || "IP não registrado",
            localizacao: config.localizacao || "Desconhecida",
            versao: config.versao_bot || "v?",
            status_firebase: config.status || "Ativo",
            token: config.token_sessao || "N/A"
        });
    }

    io.to('sala_dos_chefes').emit('atualizar_painel_pro', painelAgrupado);
}

io.on('connection', (socket) => {
  
  socket.on('entrar_admin', () => {
    socket.join('sala_dos_chefes');
    enviarPainelAgrupado(); 
  });

  // BLOQUEIO CUSTOMIZADO
  socket.on('admin_bloquear_cliente_com_motivo', (dados) => {
     console.log(`☠️ Banindo ${dados.id_node}. Motivo: ${dados.motivo}`);
     // Escreve o motivo exato no Firebase!
     if (db) db.ref("Usuarios").child(dados.id_node).child("status").set(dados.motivo);
     
     io.to(dados.email).emit('ordem_de_bloqueio');
     io.to(dados.email + '_espiando').emit('ordem_de_bloqueio');
  });

  // DESBANIMENTO
  socket.on('admin_desbanir_cliente', (idNode) => {
     if (db) db.ref("Usuarios").child(idNode).child("status").set("Ativo");
  });

  // ALTERAR LIMITE DE TELAS
  socket.on('admin_alterar_limite', (dados) => {
      console.log(`⚙️ Alterando limite de ${dados.email_limpo} para ${dados.novo_limite}`);
      if (db) db.ref("EmailsAutorizados").child(dados.email_limpo).child("limite").set(parseInt(dados.novo_limite));
  });

  // FUNÇÕES DO RADAR (Motor)
  socket.on('espiar_radar', (email) => {
    socket.join(email + '_espiando');
    const qtd = io.sockets.adapter.rooms.get(email)?.size || 0;
    socket.emit('atualizar_qtd', qtd);
  });

  socket.on('ligar_motor', (email) => {
    socket.join(email);
    socket.email = email;
    const qtd = io.sockets.adapter.rooms.get(email).size;
    io.to(email).emit('atualizar_qtd', qtd);
    io.to(email + '_espiando').emit('atualizar_qtd', qtd);
    enviarPainelAgrupado();
  });

  socket.on('desligar_motor', () => {
    if (socket.email) {
        socket.leave(socket.email); 
        const qtd = io.sockets.adapter.rooms.get(socket.email)?.size || 0;
        io.to(socket.email).emit('atualizar_qtd', qtd);
        io.to(socket.email + '_espiando').emit('atualizar_qtd', qtd);
        enviarPainelAgrupado();
        delete socket.email; 
    }
  });

  socket.on('disconnect', () => {
    if (socket.email) {
      const qtd = io.sockets.adapter.rooms.get(socket.email)?.size || 0;
      io.to(socket.email).emit('atualizar_qtd', qtd);
      io.to(socket.email + '_espiando').emit('atualizar_qtd', qtd);
      enviarPainelAgrupado();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🔥 Super Servidor na porta ${PORT}`));
