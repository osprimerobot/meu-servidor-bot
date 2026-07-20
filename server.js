const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const admin = require("firebase-admin");

let serviceAccount;
if (process.env.FIREBASE_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_JSON);
    } catch (error) {
        console.error("⚠️ Erro ao ler a chave:", error);
    }
}

let db;
if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://seofast-3b0ab-default-rtdb.firebaseio.com"
    });
    db = admin.database();
    console.log("✅ Super Servidor conectado!");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.get('/', (req, res) => res.send('🚀 Painel Master PRO - Rodando liso!'));

let cacheUsuarios = {};
let cacheEmails = {};
let aparelhosAtivos = new Set(); 

// 🔥 VARIAVEL DA TRAVA GLOBAL
let statusTravaGlobal = "";

if (db) {
    db.ref("Usuarios").on("value", (snapshot) => {
        cacheUsuarios = snapshot.val() || {};
        enviarPainelAgrupado();
    });
    db.ref("EmailsAutorizados").on("value", (snapshot) => {
        cacheEmails = snapshot.val() || {};
        enviarPainelAgrupado();
    });
    
    // 🔥 FICA VIGIANDO O FIREBASE PARA SABER SE A TRAVA ESTÁ ATIVA
    db.ref("TravaGlobal_SeoFast").on("value", (snapshot) => {
        statusTravaGlobal = snapshot.val() || "";
        io.to('sala_dos_chefes').emit('atualizar_trava_global', statusTravaGlobal);
        
        // 🔥 A MÁGICA: Se a trava foi ativada, o servidor grita no megafone para TODOS os celulares!
        if (statusTravaGlobal !== "") {
            io.emit('ordem_trava_global_imediata', statusTravaGlobal);
        }
    });
} // <-- 🔥 Adicionado o fechamento correto dessa chave aqui!

function enviarPainelAgrupado() {
    let painelAgrupado = {};

    for (const [idNode, dados] of Object.entries(cacheUsuarios)) {
        let email = dados.email || (dados.configuracoes && dados.configuracoes.email) || "Sem_Email";
        if (email === "Sem_Email") continue; 

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
            nome_celular: dados.nome_celular || (dados.configuracoes && dados.configuracoes.nome_celular) || "Desconhecido",
            ip: dados.ip_rede || (dados.configuracoes && dados.configuracoes.ip_rede) || "IP Indisponível",
            localizacao: dados.localizacao || (dados.configuracoes && dados.configuracoes.localizacao) || "Local Desconhecido",
            versao: dados.versao_bot || (dados.configuracoes && dados.configuracoes.versao_bot) || "v?",
            status_firebase: dados.status || (dados.configuracoes && dados.configuracoes.status) || "Ativo",
            is_rodando_agora: aparelhosAtivos.has(idNode) 
        });
    }

    io.to('sala_dos_chefes').emit('atualizar_painel_pro', painelAgrupado);
}

io.on('connection', (socket) => {
  socket.on('entrar_admin', () => {
    socket.join('sala_dos_chefes');
    enviarPainelAgrupado(); 
    socket.emit('atualizar_trava_global', statusTravaGlobal); // Manda o status da trava ao logar
  });

  socket.on('admin_bloquear_cliente_com_motivo', (dados) => {
     if (db) db.ref("Usuarios").child(dados.id_node).child("status").set(dados.motivo);
     
     let pacoteMorte = {
         alvo_id: dados.id_node,
         motivo: dados.motivo
     };
     io.to(dados.email).emit('ordem_de_bloqueio', pacoteMorte);
     io.to(dados.email + '_espiando').emit('ordem_de_bloqueio', pacoteMorte);
  });

  socket.on('admin_desbanir_cliente', (idNode) => {
     if (db) db.ref("Usuarios").child(idNode).child("status").set("Ativo");
  });

  socket.on('admin_alterar_limite', (dados) => {
      if (db) db.ref("EmailsAutorizados").child(dados.email_limpo).child("limite").set(parseInt(dados.novo_limite));
  });

  // 🔥 EVENTOS DA TRAVA GLOBAL 🔥
  socket.on('admin_travar_global', (motivo) => {
      if (db) db.ref("TravaGlobal_SeoFast").set(motivo);
  });

  socket.on('admin_destravar_global', () => {
      // 🔥 AQUI ESTÁ A CORREÇÃO: Usando .set("") em vez de .remove()
      if (db) db.ref("TravaGlobal_SeoFast").set("");
  });

  socket.on('espiar_radar', (email) => {
    socket.join(email + '_espiando');
    const qtd = io.sockets.adapter.rooms.get(email)?.size || 0;
    socket.emit('atualizar_qtd', qtd);
  });

  socket.on('ligar_motor', (dados) => {
    let email = typeof dados === 'string' ? dados : dados.email;
    let id_node = typeof dados === 'string' ? null : dados.id_node;

    socket.join(email);
    socket.email = email;
    
    if (id_node) {
        socket.id_node = id_node;
        aparelhosAtivos.add(id_node);
    }

    const qtd = io.sockets.adapter.rooms.get(email).size;
    io.to(email).emit('atualizar_qtd', qtd);
    io.to(email + '_espiando').emit('atualizar_qtd', qtd);
    enviarPainelAgrupado();
  });

  socket.on('desligar_motor', () => {
    if (socket.email) {
        socket.leave(socket.email); 
        if (socket.id_node) aparelhosAtivos.delete(socket.id_node);
        
        const qtd = io.sockets.adapter.rooms.get(socket.email)?.size || 0;
        io.to(socket.email).emit('atualizar_qtd', qtd);
        io.to(socket.email + '_espiando').emit('atualizar_qtd', qtd);
        enviarPainelAgrupado();
        delete socket.email; 
    }
  });

  socket.on('disconnect', () => {
    if (socket.email) {
        if (socket.id_node) aparelhosAtivos.delete(socket.id_node);

        const qtd = io.sockets.adapter.rooms.get(socket.email)?.size || 0;
        io.to(socket.email).emit('atualizar_qtd', qtd);
        io.to(socket.email + '_espiando').emit('atualizar_qtd', qtd);
        enviarPainelAgrupado();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🔥 Servidor na porta ${PORT}`));
