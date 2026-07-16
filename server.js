// ============================================================
// SERVIDOR: Animatronics vs Console User - Modo Multiplayer
// Cooperativo: até 5 guardas noturnos dividem o mesmo escritório.
// Qualquer um pode apertar qualquer botão. Os animatrônicos são
// controlados pela IA do servidor (igual ao jogo original single-player).
// ============================================================
// Este processo Node.js roda SÓ na sua máquina. Quem se conecta
// pelo navegador nunca tem acesso a este terminal nem ao arquivo
// do servidor - eles só trocam mensagens com ele via WebSocket.
//
// Controle de acesso:
//  - Cada sala tem um CÓDIGO. Só quem conhece o código entra.
//  - Se você definir a variável de ambiente HOST_KEY, só quem
//    souber essa chave consegue CRIAR salas (útil se você for
//    hospedar isso publicamente na internet).
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const HOST_KEY = process.env.HOST_KEY || JB8wduTvNZGEz5jyskSNWMR2TYEDAFIaNo3ZxBxzBkn3rHJ4Mhlrv4zxiqYc6xCzqDDkV8w3mSXVrd5AqW2DYhIE47FJgLrlhZbT; // opcional: só você define isso
const MAX_GUARDS = 5;
const TICK_MS = 3000; // frequência do loop principal do jogo
const SECONDS_PER_HOUR = 90; // cada hora do jogo dura 90s reais

// ---------- Servidor HTTP (serve os arquivos do client) ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  filePath = path.join(__dirname, 'public', filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Não encontrado');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// ---------- Estado das salas ----------
// rooms[code] = { code, guards: [ws...], hostWs, started, state, interval }
const rooms = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function freshState(night) {
  return {
    currentNight: night,
    hour: 0,
    power: 100,
    gameOver: false,
    flashlight: false,
    leftDoor: false,
    rightDoor: false,
    mask: false,
    currentView: 'OFFICE',
    rawFlashCount: 0,
    hourTimer: 0,
    positions: { raw: 'CAM1', fred: 'CAM2', chuck: 'CAM3', bone: 'CAM4' }
  };
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.guards.forEach((g) => {
    if (g && g.readyState === WebSocket.OPEN) g.send(data);
  });
}

function sendState(room) {
  broadcast(room, { type: 'state', state: room.state });
}

function sendLobby(room) {
  broadcast(room, {
    type: 'lobby_update',
    count: room.guards.length,
    max: MAX_GUARDS,
    started: room.started
  });
}

// ---------- Loop principal (a cada 3s, igual ao original) ----------
function startTick(code) {
  const room = rooms[code];
  if (!room) return;
  room.interval = setInterval(() => gameTick(code), 3000);
}

function gameTick(code) {
  const room = rooms[code];
  if (!room || room.state.gameOver) return;
  const s = room.state;

  // 1. Energia (taxas recalculadas pra noite de 90s por hora - ver nota abaixo)
  let drain = 0.111;
  if (s.leftDoor) drain += 0.222;
  if (s.rightDoor) drain += 0.222;
  if (s.flashlight) drain += 0.178;
  if (s.currentView !== 'OFFICE') drain += 0.111;
  s.power -= drain;

  if (s.power <= 0) {
    s.power = 0;
    endGame(code, 'FALTA DE ENERGIA');
    return;
  }

  // 2. Passagem do tempo - 1 hora a cada 90 segundos (30 ticks de 3s), sem aleatoriedade
  s.hourTimer += TICK_MS / 1000;
  if (s.hourTimer >= SECONDS_PER_HOUR) {
    s.hourTimer -= SECONDS_PER_HOUR;
    s.hour++;
    if (s.hour >= 6) {
      winGame(code);
      return;
    }
  }

  // 3. IA dos animatrônicos
  processAI(room, code);
  if (room.state.gameOver) return;

  sendState(room);
}

// ---------- IA dos animatrônicos (curva de dificuldade por noite) ----------
// Cada personagem tem sua própria progressão de agressividade (chance por
// tick de agir). Noite 1 é bem calma - alguns quase não se mexem - e vai
// subindo gradualmente até a Noite 5, onde todos ficam bem perigosos.
// Índice do array = currentNight - 1 (Noite 1 -> índice 0).
const NIGHT_CURVES = {
  chuck: [0.04, 0.09, 0.15, 0.23, 0.33],
  bone:  [0.04, 0.08, 0.14, 0.21, 0.31],
  fred:  [0.02, 0.06, 0.11, 0.19, 0.29],
  raw:   [0.00, 0.05, 0.10, 0.18, 0.28]
};

function diffFor(name, night) {
  const curve = NIGHT_CURVES[name];
  const idx = Math.min(Math.max(night, 1), 5) - 1;
  return curve[idx];
}

function processAI(room, code) {
  const s = room.state;
  const night = s.currentNight;

  // CHUCK (porta esquerda)
  if (Math.random() < diffFor('chuck', night)) {
    if (s.positions.chuck === 'CAM3') s.positions.chuck = 'DOOR';
    else if (s.positions.chuck === 'DOOR') {
      if (s.leftDoor) s.positions.chuck = 'CAM3';
      else { endGame(code, 'CHUCK'); return; }
    }
  }

  // BONE (porta direita)
  if (Math.random() < diffFor('bone', night)) {
    if (s.positions.bone === 'CAM4') s.positions.bone = 'DOOR';
    else if (s.positions.bone === 'DOOR') {
      if (s.rightDoor) s.positions.bone = 'CAM4';
      else { endGame(code, 'BONE'); return; }
    }
  }

  // FRED (o leão - máscara)
  if (Math.random() < diffFor('fred', night)) {
    if (s.positions.fred === 'CAM2') s.positions.fred = 'OFFICE';
    else if (s.positions.fred === 'OFFICE') {
      if (s.mask) {
        if (Math.random() < 0.5) s.positions.fred = 'CAM2';
      } else { endGame(code, 'FRED O LEÃO'); return; }
    }
  }

  // RAW (o tigre - cliques de lanterna) - fica inativo na Noite 1
  if (Math.random() < diffFor('raw', night)) {
    if (s.positions.raw === 'CAM1') {
      s.positions.raw = 'OFFICE';
      s.rawFlashCount = 0;
    } else if (s.positions.raw === 'OFFICE') {
      endGame(code, 'RAW O TIGRE');
      return;
    }
  }
}

// ---------- Fim de jogo ----------
function endGame(code, reason) {
  const room = rooms[code];
  if (!room) return;
  room.state.gameOver = true;
  clearInterval(room.interval);
  broadcast(room, { type: 'game_over', reason });
}

function winGame(code) {
  const room = rooms[code];
  if (!room) return;
  room.state.gameOver = true;
  clearInterval(room.interval);
  broadcast(room, { type: 'game_win', night: room.state.currentNight });
}

// ---------- Ações dos guardas (qualquer um dos 5 pode chamar) ----------
function guardAction(code, action, payload) {
  const room = rooms[code];
  if (!room || !room.started || room.state.gameOver) return;
  const s = room.state;

  if (action === 'toggleLight') {
    s.flashlight = !s.flashlight;
    if (s.flashlight && s.positions.raw === 'OFFICE') {
      s.rawFlashCount++;
      if (s.rawFlashCount >= 4) {
        s.positions.raw = 'CAM1';
        s.rawFlashCount = 0;
      }
    }
  } else if (action === 'toggleLeftDoor') {
    s.leftDoor = !s.leftDoor;
  } else if (action === 'toggleRightDoor') {
    s.rightDoor = !s.rightDoor;
  } else if (action === 'toggleMask') {
    s.mask = !s.mask;
  } else if (action === 'setView') {
    s.currentView = payload && payload.view ? payload.view : 'OFFICE';
  } else {
    return;
  }

  sendState(room);
}

// ---------- Conexões WebSocket ----------
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    switch (msg.type) {
      case 'create_room': {
        if (HOST_KEY && msg.key !== HOST_KEY) {
          ws.send(JSON.stringify({ type: 'error', message: 'Chave de anfitrião incorreta.' }));
          return;
        }
        const code = generateCode();
        rooms[code] = {
          code,
          guards: [ws],
          hostWs: ws,
          started: false,
          state: freshState(msg.night && msg.night >= 1 && msg.night <= 5 ? msg.night : 1),
          interval: null
        };
        ws.roomCode = code;
        ws.send(JSON.stringify({ type: 'room_created', code, isHost: true }));
        sendLobby(rooms[code]);
        break;
      }

      case 'join_room': {
        const room = rooms[(msg.code || '').toUpperCase()];
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sala não encontrada.' }));
          return;
        }
        if (room.started) {
          ws.send(JSON.stringify({ type: 'error', message: 'Essa partida já começou.' }));
          return;
        }
        if (room.guards.length >= MAX_GUARDS) {
          ws.send(JSON.stringify({ type: 'error', message: 'Sala já está cheia (máximo 5 guardas).' }));
          return;
        }
        room.guards.push(ws);
        ws.roomCode = room.code;
        ws.send(JSON.stringify({ type: 'joined', code: room.code, isHost: false }));
        sendLobby(room);
        break;
      }

      case 'start_game': {
        const room = rooms[ws.roomCode];
        if (!room || room.started) return;
        if (room.hostWs !== ws) return; // só o anfitrião inicia
        room.started = true;
        broadcast(room, { type: 'game_start', state: room.state });
        startTick(room.code);
        break;
      }

      case 'action': {
        if (!ws.roomCode) return;
        guardAction(ws.roomCode, msg.action, msg.payload);
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    const room = rooms[ws.roomCode];
    if (!room) return;
    room.guards = room.guards.filter((g) => g !== ws);

    if (room.guards.length === 0) {
      clearInterval(room.interval);
      delete rooms[ws.roomCode];
      return;
    }

    if (room.hostWs === ws) room.hostWs = room.guards[0]; // repassa a anfitrionagem

    if (!room.started) {
      sendLobby(room);
    } else {
      broadcast(room, { type: 'guard_left', count: room.guards.length });
    }
  });
});

server.listen(PORT, () => {
  console.log('============================================');
  console.log(' Servidor Animatronics vs Console User rodando');
  console.log(` Local:  http://localhost:${PORT}`);
  console.log(' (Para jogar com alguém na sua rede, compartilhe');
  console.log('  o IP da sua máquina em vez de "localhost")');
  if (HOST_KEY) console.log(' HOST_KEY ativo: só quem tiver a chave cria salas.');
  console.log('============================================');
});
