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
// PLAYER_H is the on-screen size we WANT (matches the classic
// Google-dino proportions relative to the ground). The width is
// derived from the real (tightly-cropped) sprite aspect ratio once
// the image is loaded, so the character is never squashed/shrunk
// by leftover transparent padding in the PNG.
const PLAYER_H = 100;
const PLAYER_X = 70;
let PLAYER_W = PLAYER_H; // placeholder until image loads, recalculated below

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

// Call once after the dino image has loaded: sizes the player box from
// the sprite's real aspect ratio so the motorcycle wheels sit exactly
// on the ground line and the character is drawn at full intended size.
function calibratePlayerSize() {
  const img = images.dino;
  const aspect = img.width / img.height;
  PLAYER_W = PLAYER_H * aspect;
  player.w = PLAYER_W;
  player.h = PLAYER_H;
}

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

// Ground obstacles are auto-cropped PNGs now (no leftover transparent
// padding), so h/w map 1:1 onto the visible sprite and `y = GROUND_Y - h`
// always lands them exactly on the ground line.
// Kept comfortably smaller than the player (like classic obstacle/character
// proportions) so every obstacle is realistically jumpable.
const GROUND_OBSTACLE_H = { min: 58, max: 82 };

const FLY_OBSTACLE_H = 66; // display height for the reference (wing-up) frame
// ptero1 (wing-up) and ptero2 (wing-down) sprites are NOT the same native
// scale/aspect, so instead of stretching both into one identical box
// (which made one frame look bigger than the other) each frame is drawn
// at its own correct aspect ratio and anchored by the beak-tip position,
// which is embedded here as a fraction of each sprite's own height.
// This keeps the head fixed in place while the wing swings above/below it.
const PTERO_BEAK_FRAC = { ptero1: 0.6614, ptero2: 0.2246 };

// Heights are derived from the (now correct) PLAYER_H so the "low"
// pterodactyl always forces a jump and the "high" one always clears a
// standing player's head with a safe margin.
function getFlyHeights() {
  const standingTop = GROUND_Y - PLAYER_H;
  const low = GROUND_Y - FLY_OBSTACLE_H - 12;                  // just above ground: must jump
  const high = standingTop - FLY_OBSTACLE_H - 22;               // clears a standing player's head
  return [low, high];
}

function spawnObstacle() {
  const isFlying = Math.random() < 0.28;

  if (isFlying) {
    // Reference box (used for spawn position + collision) is sized from
    // ptero1 (the wing-up frame). ptero2 is drawn using its own aspect at
    // render time - see drawObstacles().
    const aspect = images.ptero1.width / images.ptero1.height;
    const h = FLY_OBSTACLE_H;
    const w = h * aspect;
    const flyY = pick(getFlyHeights());
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
    const h = randInt(GROUND_OBSTACLE_H.min, GROUND_OBSTACLE_H.max) * (useCow ? 1.0 : 0.85);
    const w = h * aspect;
    obstacles.push({
      type: 'ground',
      key,
      x: W + 20,
      y: GROUND_Y - h, // bottom of the (tightly-cropped) sprite sits exactly on the ground
      w, h,
      passed: false,
    });
  }
}

// ---------------------------------------------------------
// World state
// ---------------------------------------------------------
let state = 'ready'; // ready | playing | gameover
const SPEED_START = 6.5;
const SPEED_MAX = 14;
const SPEED_ACCEL = 0.003; // px/frame^2 - reaches max in well under a minute
let speed = SPEED_START;
let distance = 0;
let score = 0;
let best = Number(localStorage.getItem('dinoMotoHighScore') || 0);
let groundOffset = 0;
let nextSpawnDist = 0;
let clouds = [];

// ---------------------------------------------------------
// Obstacle spacing (guarantees every gap is jumpable)
// ---------------------------------------------------------
// Total airtime of a jump (frame-units), from launch back to ground level.
const JUMP_AIR_TIME = (2 * Math.abs(JUMP_VELOCITY)) / GRAVITY;
const GAP_SAFETY_FACTOR = 1.3; // margin so jumps always clear in time, without being empty/sparse
const GAP_EXTRA_BUFFER = 70;   // covers obstacle width + reaction time

function computeSpawnGap(currentSpeed) {
  const minGap = currentSpeed * JUMP_AIR_TIME * GAP_SAFETY_FACTOR + GAP_EXTRA_BUFFER;
  const maxGap = minGap * 1.4; // some variety, but never below the safe minimum
  return rand(minGap, maxGap);
}

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
  speed = SPEED_START;
  distance = 0;
  score = 0;
  groundOffset = 0;
  nextSpawnDist = computeSpawnGap(SPEED_START) + 100; // extra breathing room at the start
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
      // Draw whichever flap frame at ITS OWN aspect ratio (never force-fit
      // both frames into one box - that's what made them look mismatched),
      // scaled so o.h (the ptero1 reference height) sets the common scale,
      // then shifted so the beak-tip anchor lines up between frames.
      const isFrame1 = o.flapFrame === 0;
      const img = isFrame1 ? images.ptero1 : images.ptero2;
      const key = isFrame1 ? 'ptero1' : 'ptero2';
      const scale = o.h / images.ptero1.height;
      const dw = img.width * scale;
      const dh = img.height * scale;
      const beakY = dh * PTERO_BEAK_FRAC[key];
      const refBeakY = o.h * PTERO_BEAK_FRAC.ptero1;
      const dy = o.y + (refBeakY - beakY);
      ctx.drawImage(img, o.x, dy, dw, dh);
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
    nextSpawnDist = distance + computeSpawnGap(speed);
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
}

function updateSpeed(dt) {
  speed = Math.min(SPEED_MAX, speed + SPEED_ACCEL * dt);
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
    updateSpeed(dt);
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
  calibratePlayerSize();
  resetPlayer();
  initClouds();
  finalBestEl.textContent = Math.floor(best);
  requestAnimationFrame(loop);
});