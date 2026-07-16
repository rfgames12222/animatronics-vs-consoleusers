// ============================================================
// CLIENT: Animatronics vs Console User - Modo Multiplayer 3D
// Cooperativo: até 5 guardas dividem o mesmo escritório e o
// mesmo estado de jogo. Não existe mais o papel de "Diretor" -
// os animatrônicos são controlados pela IA do servidor.
// Este arquivo roda só no navegador de quem está jogando.
// Ninguém que abre esta página tem acesso ao servidor/terminal -
// eles só trocam mensagens de jogo através do WebSocket.
//
// O mapa 3D abaixo é 100% original (geometria + texturas geradas
// por código), sem nenhum asset do jogo FNAF de verdade.
// ============================================================

const game = {
  ws: null,
  code: null,
  isHost: false,
  state: null,
  controlScheme: 'pc', // 'pc' ou 'mobile' - escolhido pelos botões no menu

  connect() {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    this.ws = new WebSocket(proto + location.host);
    this.ws.onmessage = (evt) => this.handleMessage(JSON.parse(evt.data));
    this.ws.onclose = () => this.showError('Conexão perdida com o servidor.');
  },

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  },

  createRoom() {
    const night = parseInt(document.getElementById('night-select').value, 10);
    const key = document.getElementById('host-key-input').value;
    this.send({ type: 'create_room', night, key });
  },

  joinRoom() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!code) return;
    this.send({ type: 'join_room', code });
  },

  startGame() {
    this.send({ type: 'start_game' });
  },

  handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        this.code = msg.code;
        this.isHost = true;
        showScreen('screen-waiting');
        document.getElementById('room-code-display').textContent = msg.code;
        document.getElementById('host-controls').style.display = 'flex';
        document.getElementById('waiting-hint').style.display = 'none';
        break;

      case 'joined':
        this.code = msg.code;
        this.isHost = false;
        showScreen('screen-waiting');
        document.getElementById('room-code-display').textContent = msg.code;
        break;

      case 'lobby_update':
        document.getElementById('lobby-count').textContent = `Guardas conectados: ${msg.count}/${msg.max}`;
        break;

      case 'game_start':
        this.state = msg.state;
        showScreen('screen-game');
        initThreeIfNeeded();
        this.render();
        break;

      case 'state':
        this.state = msg.state;
        this.render();
        break;

      case 'game_over':
        this.showOverlay('💥 JUMPSCARE 💥', `Os guardas foram pegos por: ${msg.reason}`, '#ff3333');
        break;

      case 'game_win':
        this.showOverlay('⏰ 06:00 AM ⏰', `A equipe sobreviveu à Noite ${msg.night}!`, '#22ff55');
        break;

      case 'guard_left':
        flashHint(`Um guarda saiu da partida. Restam ${msg.count}/5.`);
        break;

      case 'error':
        this.showError(msg.message);
        break;
    }
  },

  showError(text) {
    const el = document.getElementById('menu-error');
    if (el) el.textContent = text;
  },

  showOverlay(title, subtitle, color) {
    document.exitPointerLock && document.exitPointerLock();
    showScreen('screen-overlay');
    document.getElementById('overlay-content').innerHTML =
      `<h1 style="color:${color};">${title}</h1><p>${subtitle}</p>
       <div class="row"><button class="btn" onclick="location.reload()">VOLTAR AO MENU</button></div>`;
  },

  // ---- Ações do guarda (qualquer um dos 5 pode chamar) ----
  toggleLight() { this.send({ type: 'action', action: 'toggleLight' }); },
  toggleLeftDoor() { this.send({ type: 'action', action: 'toggleLeftDoor' }); },
  toggleRightDoor() { this.send({ type: 'action', action: 'toggleRightDoor' }); },
  toggleMask() { this.send({ type: 'action', action: 'toggleMask' }); },

  // ---- Renderização ----
  render() {
    if (!this.state) return;
    const s = this.state;
    updateHUD(s);
    applyStateToScene(s);
    document.body.classList.toggle('mask-on', !!s.mask);
  }
};

function updateHUD(s) {
  document.getElementById('time-display').textContent =
    `${s.hour === 0 ? 12 : s.hour}:00 AM | Noite ${s.currentNight}`;
  document.getElementById('power-display').textContent = `Bateria: ${Math.floor(s.power)}%`;

  const musicHUD = document.getElementById('music-box');
  if (s.positions.fred === 'OFFICE') {
    musicHUD.textContent = 'Música do Fred: MUITO PERTO!';
    musicHUD.style.color = '#ff3333';
  } else {
    musicHUD.textContent = 'Música do Fred: Silêncio...';
    musicHUD.style.color = 'gold';
  }

  const alertas = [];
  if (s.positions.chuck === 'DOOR' && !s.leftDoor) alertas.push('⚠️ ALGO NA PORTA ESQUERDA (E perto dela)');
  if (s.positions.bone === 'DOOR' && !s.rightDoor) alertas.push('⚠️ ALGO NA PORTA DIREITA (E perto dela)');
  if (s.positions.fred === 'OFFICE' && !s.mask) alertas.push('⚠️ FRED NA SUA FRENTE! USE Q');
  if (s.positions.raw === 'OFFICE') alertas.push('⚠️ RAW NA SALA! PISQUE A LANTERNA (F)');
  document.getElementById('alert-box').textContent = alertas.join('  |  ');
}

function showScreen(id) {
  ['screen-menu', 'screen-waiting', 'screen-game', 'screen-overlay'].forEach(s => {
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
}

document.getElementById('btn-create').addEventListener('click', () => game.createRoom());
document.getElementById('btn-join').addEventListener('click', () => game.joinRoom());
document.getElementById('btn-start').addEventListener('click', () => game.startGame());

document.getElementById('btn-device-pc').addEventListener('click', () => setControlScheme('pc'));
document.getElementById('btn-device-mobile').addEventListener('click', () => setControlScheme('mobile'));

function setControlScheme(scheme) {
  game.controlScheme = scheme;
  document.getElementById('btn-device-pc').classList.toggle('btn-active', scheme === 'pc');
  document.getElementById('btn-device-mobile').classList.toggle('btn-active', scheme === 'mobile');
}

// ============================================================
// CENA 3D (Three.js) - escritório original, feito por código
// ============================================================
let three = null;
const keysDown = {};
let yaw = 0, pitch = 0;
let jumping = false, jumpVel = 0;

const EYE_HEIGHT = 1.6;
const MOVE_SPEED = 4.2;
const ROOM = { minX: -4.6, maxX: 4.6, minZ: -2.6, maxZ: 2.6 };
const DOOR_ZONE = 3.0; // distância em X a partir da qual "E" mexe numa porta
const DOOR_HEIGHT = 2.3;

// ---- texturas geradas por código (sem depender de nenhuma imagem externa) ----
function makeCheckerTexture(colorA, colorB, tiles) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cell = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 3);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

function makeStripeTexture(colorA, colorB, stripeCount) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = colorB;
  const stripeW = size / stripeCount;
  for (let i = 0; i < stripeCount; i += 2) {
    ctx.fillRect(i * stripeW, 0, stripeW, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

function initThreeIfNeeded() {
  if (three) return;

  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030303);
  scene.fog = new THREE.Fog(0x030303, 3, 13);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, EYE_HEIGHT, 2.2);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.AmbientLight(0x1c1c2a, 0.4));

  // ---------- chão (ladrilho xadrez, tipo pizzaria antiga) ----------
  const floorTex = makeCheckerTexture('#241b12', '#2e2013', 8);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 6),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // ---------- teto ----------
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshStandardMaterial({ color: 0x0d0d0d }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 3;
  scene.add(ceiling);

  // luminárias no teto (emissivas, com leve tremulação no animate())
  const lightFixtures = [];
  [-2.5, 2.5].forEach((x) => {
    const fixture = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.08, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2c0, emissiveIntensity: 1.2 })
    );
    fixture.position.set(x, 2.94, 0);
    scene.add(fixture);
    lightFixtures.push(fixture);
  });
  const ceilingLight = new THREE.PointLight(0xfff2c0, 1.1, 9, 2);
  ceilingLight.position.set(0, 2.7, 0.5);
  scene.add(ceilingLight);

  // ---------- paredes (papel de parede listrado, gerado por código) ----------
  const wallTex = makeStripeTexture('#1c2a22', '#223528', 10);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });

  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 3), wallMat);
  backWall.position.set(0, 1.5, -3);
  scene.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat.clone());
  leftWall.position.set(-5, 1.5, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat.clone());
  rightWall.position.set(5, 1.5, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  // rodapé simples pra quebrar a monotonia da parede
  const baseboard = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.15, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a })
  );
  baseboard.position.set(0, 0.08, -2.98);
  scene.add(baseboard);

  // ---------- mesa com monitor e ventilador ----------
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x33241a }));
  desk.position.set(0, 0.45, 2.7);
  scene.add(desk);

  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.35, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x113311, emissiveIntensity: 0.6 })
  );
  monitor.position.set(-0.6, 1.05, 2.55);
  monitor.rotation.x = -0.15;
  scene.add(monitor);

  const fanBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  fanBase.position.set(0.7, 1.05, 2.5);
  scene.add(fanBase);
  const fanBlades = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.02, 3),
    new THREE.MeshStandardMaterial({ color: 0x888888, side: THREE.DoubleSide })
  );
  fanBlades.position.set(0.7, 1.22, 2.5);
  fanBlades.rotation.x = Math.PI / 2;
  scene.add(fanBlades);

  // ---------- portas de correr com moldura + luz indicadora ----------
  function buildDoorway(x) {
    const group = new THREE.Group();

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, DOOR_HEIGHT + 0.2, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.6 })
    );
    frame.position.set(x, DOOR_HEIGHT / 2, 0);
    group.add(frame);

    const shutter = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, DOOR_HEIGHT, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x8a1f1f, metalness: 0.5, roughness: 0.4 })
    );
    shutter.position.set(x, DOOR_HEIGHT / 2, 0);
    group.add(shutter);

    const indicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0x330000, emissiveIntensity: 1 })
    );
    indicator.position.set(x, DOOR_HEIGHT + 0.35, 0.9);
    group.add(indicator);

    scene.add(group);
    return { shutter, indicator };
  }

  const leftDoorParts = buildDoorway(-4.6);
  const rightDoorParts = buildDoorway(4.6);

  // ---------- animatrônicos (formas simples e originais - corpo + cabeça) ----------
  function buildCharacter(bodyColor, glowColor, bodyH) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, bodyH, 0.6),
      new THREE.MeshStandardMaterial({ color: bodyColor, emissive: glowColor, emissiveIntensity: 0.5 })
    );
    body.position.y = bodyH / 2;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 12, 12),
      new THREE.MeshStandardMaterial({ color: bodyColor, emissive: glowColor, emissiveIntensity: 0.5 })
    );
    head.position.y = bodyH + 0.2;
    group.add(head);

    [-0.12, 0.12].forEach((ex) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffee88, emissiveIntensity: 2 })
      );
      eye.position.set(ex, bodyH + 0.2, 0.28);
      group.add(eye);
    });

    group.visible = false;
    scene.add(group);
    return group;
  }

  const chuck = buildCharacter(0xaa3333, 0x330000, 1.6);
  chuck.position.set(-4.2, 0, 0);

  const bone = buildCharacter(0x3a5aa0, 0x000033, 1.6);
  bone.position.set(4.2, 0, 0);

  const fred = buildCharacter(0x3fa060, 0x113311, 1.8);
  fred.position.set(0, 0, -1.8);

  const raw = buildCharacter(0xd68a20, 0x331a00, 1.3);
  raw.position.set(0, 0, 0.9);

  // ---------- lanterna presa na câmera ----------
  const flashlight = new THREE.SpotLight(0xffffee, 0, 8, Math.PI / 6, 0.4);
  camera.add(flashlight);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight.target);
  scene.add(camera);

  three = {
    renderer, scene, camera,
    lightFixtures, ceilingLight, fanBlades,
    doors: { left: leftDoorParts, right: rightDoorParts },
    doorProgress: { left: 0, right: 0 },
    meshes: { chuck, bone, fred, raw, flashlight }
  };

  window.addEventListener('resize', onWindowResize);
  setupPointerLock();
  setupKeyboard();
  setupMobileControlsIfNeeded();
  requestAnimationFrame(animate);
}

function onWindowResize() {
  if (!three) return;
  three.camera.aspect = window.innerWidth / window.innerHeight;
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(window.innerWidth, window.innerHeight);
}

function setupPointerLock() {
  if (game.controlScheme === 'mobile') return; // no celular usamos o d-pad + arraste pra olhar, sem pointer lock

  const canvas = document.getElementById('game-canvas');
  const hint = document.getElementById('pointer-lock-hint');

  canvas.addEventListener('click', () => canvas.requestPointerLock());

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    hint.style.display = locked ? 'none' : 'flex';
  });

  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    const sensitivity = 0.0022;
    yaw -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  });
}

function setupKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (!game.state) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    const k = e.key.toLowerCase();
    keysDown[k] = true;

    if (k === ' ') { e.preventDefault(); handleJump(); }
    if (k === 'f') game.toggleLight();
    if (k === 'q') game.toggleMask();
    if (k === 'e') handleInteractDoor();
  });

  window.addEventListener('keyup', (e) => { keysDown[e.key.toLowerCase()] = false; });
}

// ---------- Controles touch (celular): d-pad + botão de pular + olhar arrastando ----------
function setupMobileControlsIfNeeded() {
  if (game.controlScheme !== 'mobile') return;

  document.getElementById('mobile-controls').classList.remove('hidden');
  document.getElementById('pointer-lock-hint').style.display = 'none';

  const dpadMap = { 'dpad-up': 'w', 'dpad-down': 's', 'dpad-left': 'a', 'dpad-right': 'd' };
  Object.keys(dpadMap).forEach((id) => {
    const el = document.getElementById(id);
    const key = dpadMap[id];
    el.addEventListener('touchstart', (e) => { e.preventDefault(); keysDown[key] = true; }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); keysDown[key] = false; }, { passive: false });
    el.addEventListener('touchcancel', () => { keysDown[key] = false; });
  });

  bindTap('btn-jump', () => handleJump());
  bindTap('btn-mobile-light', () => game.toggleLight());
  bindTap('btn-mobile-mask', () => game.toggleMask());
  bindTap('btn-mobile-door', () => handleInteractDoor());

  setupLookLayer();
}

function bindTap(id, fn) {
  const el = document.getElementById(id);
  el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
}

let lookTouchId = null, lastLookX = 0, lastLookY = 0;
function setupLookLayer() {
  const layer = document.getElementById('look-layer');

  layer.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    lookTouchId = t.identifier;
    lastLookX = t.clientX;
    lastLookY = t.clientY;
  }, { passive: true });

  layer.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      const dx = t.clientX - lastLookX;
      const dy = t.clientY - lastLookY;
      lastLookX = t.clientX;
      lastLookY = t.clientY;
      const sensitivity = 0.005;
      yaw -= dx * sensitivity;
      pitch -= dy * sensitivity;
      pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
    }
  }, { passive: true });

  layer.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === lookTouchId) lookTouchId = null;
    }
  });
}

function handleJump() {
  if (jumping) return;
  jumping = true;
  jumpVel = 3.2;
}

function handleInteractDoor() {
  if (!three) return;
  const x = three.camera.position.x;
  if (x <= -DOOR_ZONE) game.toggleLeftDoor();
  else if (x >= DOOR_ZONE) game.toggleRightDoor();
  else flashHint('Aproxime-se de uma porta para usar E');
}

let hintTimeout = null;
function flashHint(text) {
  const el = document.getElementById('alert-box');
  if (!el) return;
  el.textContent = text;
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => { if (game.state) updateHUD(game.state); }, 1800);
}

function animate(t) {
  requestAnimationFrame(animate);
  if (!three) return;
  updateMovement();
  updateDoors();
  updateAmbience(t || 0);
  three.camera.rotation.y = yaw;
  three.camera.rotation.x = pitch;
  three.renderer.render(three.scene, three.camera);
}

function updateMovement() {
  const dt = 1 / 60;
  const cam = three.camera;

  const forward = new THREE.Vector3();
  cam.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const move = new THREE.Vector3();
  if (keysDown['w']) move.add(forward);
  if (keysDown['s']) move.sub(forward);
  if (keysDown['d']) move.add(right);
  if (keysDown['a']) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(MOVE_SPEED * dt);
    cam.position.x += move.x;
    cam.position.z += move.z;
  }

  cam.position.x = Math.max(ROOM.minX, Math.min(ROOM.maxX, cam.position.x));
  cam.position.z = Math.max(ROOM.minZ, Math.min(ROOM.maxZ, cam.position.z));

  if (jumping) {
    jumpVel -= 9.8 * dt;
    cam.position.y += jumpVel * dt;
    if (cam.position.y <= EYE_HEIGHT) {
      cam.position.y = EYE_HEIGHT;
      jumping = false;
      jumpVel = 0;
    }
  }
}

// Anima a porta de correr abrindo/fechando suavemente (0 = aberta, 1 = fechada)
function updateDoors() {
  if (!game.state) return;
  const targets = { left: game.state.leftDoor ? 1 : 0, right: game.state.rightDoor ? 1 : 0 };

  ['left', 'right'].forEach((side) => {
    const prog = three.doorProgress;
    prog[side] += (targets[side] - prog[side]) * 0.15;

    const { shutter } = three.doors[side];
    const scaleY = 0.04 + prog[side] * 0.96;
    shutter.scale.y = scaleY;
    shutter.position.y = (DOOR_HEIGHT * scaleY) / 2 + (DOOR_HEIGHT * (1 - scaleY));
  });
}

// Luzes tremulando + ventilador girando + indicadores de porta piscando quando há perigo
function updateAmbience(t) {
  const flicker = 1 + Math.sin(t * 0.006) * 0.08 + (Math.random() - 0.5) * 0.04;
  three.lightFixtures.forEach((f) => { f.material.emissiveIntensity = 1.1 * flicker; });
  three.ceilingLight.intensity = 1.05 * flicker;

  three.fanBlades.rotation.y += 0.09;

  if (!game.state) return;
  const s = game.state;
  const leftDanger = s.positions.chuck === 'DOOR';
  const rightDanger = s.positions.bone === 'DOOR';
  const pulse = 0.6 + Math.abs(Math.sin(t * 0.01)) * 0.4;

  setDoorIndicator(three.doors.left.indicator, s.leftDoor, leftDanger, pulse);
  setDoorIndicator(three.doors.right.indicator, s.rightDoor, rightDanger, pulse);
}

// isClosed: true = porta fechada (leftDoor/rightDoor). danger: algo parado bem na porta.
function setDoorIndicator(indicator, isClosed, danger, pulse) {
  const mat = indicator.material;
  if (danger && !isClosed) {
    // porta aberta com algo na entrada: pisca vermelho forte, precisa fechar agora
    mat.color.setHex(0x661111);
    mat.emissive.setHex(0xff2222);
    mat.emissiveIntensity = pulse * 2.2;
  } else if (isClosed) {
    // porta fechada: vermelho fixo
    mat.color.setHex(0x661111);
    mat.emissive.setHex(0xff2222);
    mat.emissiveIntensity = 0.9;
  } else {
    // porta aberta e sem perigo: verde fixo
    mat.color.setHex(0x116622);
    mat.emissive.setHex(0x22ff55);
    mat.emissiveIntensity = 0.9;
  }
}

function applyStateToScene(s) {
  if (!three) return;
  const m = three.meshes;
  m.chuck.visible = s.positions.chuck === 'DOOR';
  m.bone.visible = s.positions.bone === 'DOOR';
  m.fred.visible = s.positions.fred === 'OFFICE';
  m.raw.visible = s.positions.raw === 'OFFICE';
  m.flashlight.intensity = s.flashlight ? 2.4 : 0;
}

game.connect();
