// =========================================================
//  Dino Moto Runner  -  Chrome-Dino-style game (custom skin)
// =========================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const W = canvas.width;   // 900
const H = canvas.height;  // 300

const GROUND_Y = 235;          // y coordinate of the ground line
const SKY_COLOR = '#90C7DC';
const GROUND_COLOR = '#F5A574';
const GROUND_COLOR_DARK = '#E08A55';
const LINE_COLOR = '#7a5230';

const overlay = document.getElementById('overlay');
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');

// ---------------------------------------------------------
// Asset loading
// ---------------------------------------------------------
const ASSET_LIST = {
  dino: 'assets/dino.png',
  ptero1: 'assets/ptero1.png',
  ptero2: 'assets/ptero2.png',
  cow1: 'assets/cow1.png',
  cow2: 'assets/cow2.png',
  cow3: 'assets/cow3.png',
  cow4: 'assets/cow4.png',
  cow5: 'assets/cow5.png',
  egg1: 'assets/egg1.png',
  egg2: 'assets/egg2.png',
  egg3: 'assets/egg3.png',
  egg4: 'assets/egg4.png',
  egg5: 'assets/egg5.png',
};

const images = {};
let assetsLoaded = 0;
const assetKeys = Object.keys(ASSET_LIST);

function loadAssets(onDone) {
  assetKeys.forEach((key) => {
    const img = new Image();
    img.src = ASSET_LIST[key];
    img.onload = () => {
      assetsLoaded++;
      if (assetsLoaded === assetKeys.length) onDone();
    };
    images[key] = img;
  });
}

const COW_KEYS = ['cow1', 'cow2', 'cow3', 'cow4', 'cow5'];
const EGG_KEYS = ['egg1', 'egg2', 'egg3', 'egg4', 'egg5'];

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

// ---------------------------------------------------------
// Player (motorcycle dino)
// ---------------------------------------------------------
const PLAYER_H = 92;
const PLAYER_ASPECT = 450 / 310; // width / height from source crop
const PLAYER_W = PLAYER_H * PLAYER_ASPECT;
const PLAYER_X = 70;

const GRAVITY = 0.62;
const JUMP_VELOCITY = -12.6;

const player = {
  x: PLAYER_X,
  y: GROUND_Y - PLAYER_H,
  w: PLAYER_W,
  h: PLAYER_H,
  vy: 0,
  jumping: false,
  bob: 0,
};

function resetPlayer() {
  player.y = GROUND_Y - PLAYER_H;
  player.vy = 0;
  player.jumping = false;
  player.bob = 0;
}

function jump() {
  if (!player.jumping && state === 'playing') {
    player.vy = JUMP_VELOCITY;
    player.jumping = true;
  }
}

// ---------------------------------------------------------
// Obstacles
// ---------------------------------------------------------
let obstacles = [];

const GROUND_OBSTACLE_H = { min: 62, max: 96 };
const FLY_OBSTACLE_H = 60;
const FLY_HEIGHTS = [GROUND_Y - 70, GROUND_Y - 150]; // low (must jump) / high (pass under)

function spawnObstacle() {
  const isFlying = Math.random() < 0.28;

  if (isFlying) {
    const aspect = images.ptero1.width / images.ptero1.height;
    const h = FLY_OBSTACLE_H;
    const w = h * aspect;
    const flyY = pick(FLY_HEIGHTS);
    obstacles.push({
      type: 'fly',
      x: W + 20,
      y: flyY,
      w, h,
      passed: false,
      flapTimer: 0,
      flapFrame: 0,
    });
  } else {
    const useCow = Math.random() < 0.55;
    const key = useCow ? pick(COW_KEYS) : pick(EGG_KEYS);
    const img = images[key];
    const aspect = img.width / img.height;
    const h = randInt(GROUND_OBSTACLE_H.min, GROUND_OBSTACLE_H.max) * (useCow ? 1.05 : 0.85);
    const w = h * aspect;
    obstacles.push({
      type: 'ground',
      key,
      x: W + 20,
      y: GROUND_Y - h,
      w, h,
      passed: false,
    });
  }
}

// ---------------------------------------------------------
// World state
// ---------------------------------------------------------
let state = 'ready'; // ready | playing | gameover
let speed = 6.2;
const SPEED_MAX = 15;
let distance = 0;
let score = 0;
let best = Number(localStorage.getItem('dinoMotoHighScore') || 0);
let groundOffset = 0;
let nextSpawnDist = 0;
let clouds = [];

function initClouds() {
  clouds = [];
  for (let i = 0; i < 4; i++) {
    clouds.push({
      x: rand(0, W),
      y: rand(20, 100),
      scale: rand(0.6, 1.3),
    });
  }
}

function resetGame() {
  obstacles = [];
  speed = 6.2;
  distance = 0;
  score = 0;
  groundOffset = 0;
  nextSpawnDist = 220;
  resetPlayer();
  initClouds();
}

// ---------------------------------------------------------
// Drawing
// ---------------------------------------------------------
function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, 8, 40, 10);
  ctx.fillRect(8, 0, 26, 10);
  ctx.fillRect(-6, 12, 8, 6);
  ctx.fillRect(40, 12, 8, 6);
  ctx.restore();
}

function drawBackground() {
  // sky
  ctx.fillStyle = SKY_COLOR;
  ctx.fillRect(0, 0, W, GROUND_Y);

  // clouds
  clouds.forEach((c) => drawCloud(c.x, c.y, c.scale));

  // ground
  ctx.fillStyle = GROUND_COLOR;
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

  // ground line
  ctx.fillStyle = LINE_COLOR;
  ctx.fillRect(0, GROUND_Y, W, 3);

  // dashed texture on ground
  ctx.fillStyle = GROUND_COLOR_DARK;
  const dashSpacing = 44;
  const offset = groundOffset % dashSpacing;
  for (let x = -dashSpacing; x < W + dashSpacing; x += dashSpacing) {
    const dx = x - offset;
    ctx.fillRect(dx, GROUND_Y + 14, 16, 3);
    ctx.fillRect(dx + 20, GROUND_Y + 30, 8, 3);
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y + player.bob);
  ctx.drawImage(images.dino, 0, 0, player.w, player.h);
  ctx.restore();
}

function drawObstacles() {
  obstacles.forEach((o) => {
    if (o.type === 'fly') {
      const img = o.flapFrame === 0 ? images.ptero1 : images.ptero2;
      ctx.drawImage(img, o.x, o.y, o.w, o.h);
    } else {
      ctx.drawImage(images[o.key], o.x, o.y, o.w, o.h);
    }
  });
}

function drawScore() {
  ctx.fillStyle = 'rgba(40,40,40,0.85)';
  ctx.font = 'bold 20px "Courier New", monospace';
  ctx.textAlign = 'right';
  const scoreStr = String(Math.floor(score)).padStart(6, '0');
  const bestStr = String(Math.floor(best)).padStart(6, '0');
  ctx.fillText(`HI ${bestStr}   ${scoreStr}`, W - 16, 30);
}

// ---------------------------------------------------------
// Update
// ---------------------------------------------------------
function updatePlayer(dt) {
  if (player.jumping) {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y - player.h) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.jumping = false;
    }
  } else {
    player.bob = Math.sin(distance * 0.25) * 2.2;
  }
}

function updateObstacles(dt) {
  obstacles.forEach((o) => {
    o.x -= speed * dt;
    if (o.type === 'fly') {
      o.flapTimer = (o.flapTimer || 0) + dt;
      if (o.flapTimer > 10) {
        o.flapTimer = 0;
        o.flapFrame = o.flapFrame === 0 ? 1 : 0;
      }
    }
  });
  obstacles = obstacles.filter((o) => o.x + o.w > -10);

  distance += speed * dt;
  if (distance >= nextSpawnDist) {
    spawnObstacle();
    const gap = rand(230, 380) - Math.min(speed * 8, 140);
    nextSpawnDist = distance + Math.max(gap, 160);
  }
}

function checkCollisions() {
  const pad = 0.22; // shrink hitboxes for a fairer feel
  const px0 = player.x + player.w * pad;
  const px1 = player.x + player.w * (1 - pad);
  const py0 = player.y + player.h * pad + player.bob;
  const py1 = player.y + player.h * (1 - pad * 0.6) + player.bob;

  for (const o of obstacles) {
    const opad = o.type === 'fly' ? 0.18 : 0.14;
    const ox0 = o.x + o.w * opad;
    const ox1 = o.x + o.w * (1 - opad);
    const oy0 = o.y + o.h * opad;
    const oy1 = o.y + o.h * (1 - opad);

    if (px0 < ox1 && px1 > ox0 && py0 < oy1 && py1 > oy0) {
      return true;
    }
  }
  return false;
}

function updateScore(dt) {
  score += dt * 0.14;
  speed = Math.min(SPEED_MAX, 6.2 + score / 90);
}

function updateClouds(dt) {
  clouds.forEach((c) => {
    c.x -= speed * 0.25 * dt;
    if (c.x < -60) {
      c.x = W + rand(0, 100);
      c.y = rand(20, 100);
      c.scale = rand(0.6, 1.3);
    }
  });
}

// ---------------------------------------------------------
// Game loop
// ---------------------------------------------------------
let lastTime = null;

function loop(ts) {
  if (lastTime === null) lastTime = ts;
  const dtMs = ts - lastTime;
  lastTime = ts;
  const dt = Math.min(dtMs / 16.6667, 3); // normalize to ~60fps steps, clamp spikes

  drawBackground();

  if (state === 'playing') {
    updatePlayer(dt);
    updateObstacles(dt);
    updateClouds(dt);
    updateScore(dt);
    groundOffset += speed * dt;

    if (checkCollisions()) {
      endGame();
    }
  } else {
    updateClouds(dt * 0.3);
  }

  drawObstacles();
  drawPlayer();
  drawScore();

  requestAnimationFrame(loop);
}

// ---------------------------------------------------------
// Game state transitions
// ---------------------------------------------------------
function startGame() {
  resetGame();
  state = 'playing';
  overlay.classList.add('hidden-all');
  startScreen.classList.add('hidden');
  gameoverScreen.classList.add('hidden');
}

function endGame() {
  state = 'gameover';
  if (score > best) {
    best = score;
    localStorage.setItem('dinoMotoHighScore', String(Math.floor(best)));
  }
  finalScoreEl.textContent = Math.floor(score);
  finalBestEl.textContent = Math.floor(best);
  overlay.classList.remove('hidden-all');
  startScreen.classList.add('hidden');
  gameoverScreen.classList.remove('hidden');
}

function handleAction() {
  if (state === 'ready' || state === 'gameover') {
    startGame();
  } else if (state === 'playing') {
    jump();
  }
}

// ---------------------------------------------------------
// Input
// ---------------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    handleAction();
  }
});

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleAction();
});

overlay.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleAction();
});

// ---------------------------------------------------------
// Boot
// ---------------------------------------------------------
loadAssets(() => {
  initClouds();
  finalBestEl.textContent = Math.floor(best);
  requestAnimationFrame(loop);
});
