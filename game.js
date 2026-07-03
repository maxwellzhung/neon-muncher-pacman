const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const levelEl = document.querySelector("#level");
const livesEl = document.querySelector("#lives");
const statusEl = document.querySelector("#status");
const progressEl = document.querySelector("#progress");
const progressBar = document.querySelector("#progressBar");
const overlay = document.querySelector("#overlay");
const overlayText = document.querySelector("#overlayText");
const startButton = document.querySelector("#startButton");
const soundButton = document.querySelector("#soundButton");
const pauseButton = document.querySelector("#pauseButton");
const resetButton = document.querySelector("#resetButton");

const tile = 20;
const rows = 31;
const cols = 28;
const width = cols * tile;
const height = rows * tile;
const turnGrace = tile * 0.62;
const laneAssist = 300;

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  none: { x: 0, y: 0 },
};

const opposite = { left: "right", right: "left", up: "down", down: "up", none: "none" };

const rawMap = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "     #.##          ##.#     ",
  "     #.## ###--### ##.#     ",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "     #.## ######## ##.#     ",
  "     #.##          ##.#     ",
  "######.## ######## ##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o........................o#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "############################",
];

let map;
let pelletsLeft = 0;
let totalPellets = 0;
let score = 0;
let best = Number(localStorage.getItem("neonMuncherBest") || 0);
let level = 1;
let lives = 3;
let running = false;
let paused = false;
let gameOver = false;
let frightenedTimer = 0;
let combo = 0;
let tick = 0;
let lastTime = 0;
let pelletsEaten = 0;
let fruit = null;
let floatingTexts = [];
let sparks = [];
let screenShake = 0;
let touchStart = null;
let countdownTimer = 0;
let countdownText = "";
let invulnerableTimer = 0;
let audioCtx = null;
let musicTimer = null;
let musicStep = 0;
let nextBeatTime = 0;
let musicOn = localStorage.getItem("neonMuncherMusic") !== "off";
let musicMood = "idle";

let player;
let ghosts;

function makeMap() {
  pelletsLeft = 0;
  pelletsEaten = 0;
  fruit = null;
  const newMap = rawMap.map((row) =>
    [...row].map((cell) => {
      if (cell === "." || cell === "o") pelletsLeft += 1;
      return cell;
    }),
  );
  totalPellets = pelletsLeft;
  return newMap;
}

function makeActor(x, y, color, dir = "left") {
  return {
    x: x * tile + tile / 2,
    y: y * tile + tile / 2,
    dir,
    nextDir: dir,
    color,
    spawn: { x: x * tile + tile / 2, y: y * tile + tile / 2 },
  };
}

function resetActors() {
  player = {
    ...makeActor(13, 23, "#ffd75f", "left"),
    speed: 142,
    mouth: 0,
    canUseDoor: false,
  };
  ghosts = [
    { ...makeActor(13, 11, "#ff5fa8", "left"), name: "blush", speed: 86, canUseDoor: true },
    { ...makeActor(14, 11, "#35e6ff", "right"), name: "spark", speed: 82, canUseDoor: true },
    { ...makeActor(13, 13, "#ffb84c", "up"), name: "ember", speed: 80, canUseDoor: true },
    { ...makeActor(14, 13, "#64f299", "down"), name: "mint", speed: 78, canUseDoor: true },
  ];
}

function startGame(fresh = true) {
  if (fresh) {
    score = 0;
    level = 1;
    lives = 3;
    gameOver = false;
    map = makeMap();
  }
  frightenedTimer = 0;
  combo = 0;
  floatingTexts = [];
  sparks = [];
  screenShake = 0;
  countdownTimer = 1.15;
  countdownText = "READY";
  invulnerableTimer = 1.6;
  resetActors();
  running = true;
  paused = false;
  overlay.classList.add("hidden");
  canvas.focus({ preventScroll: true });
  startMusic();
  playStartJingle();
  updateHud();
}

function nextLevel() {
  level += 1;
  map = makeMap();
  frightenedTimer = 0;
  combo = 0;
  countdownTimer = 1.15;
  countdownText = `LEVEL ${level}`;
  invulnerableTimer = 1.4;
  resetActors();
  playSfx("level");
  addFloatingText(`LEVEL ${level}`, width / 2, height / 2, "#35e6ff", 1.7, 0);
  updateHud();
}

function updateHud() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  levelEl.textContent = level;
  livesEl.textContent = lives;
  const progress = totalPellets ? Math.round(((totalPellets - pelletsLeft) / totalPellets) * 100) : 0;
  progressEl.textContent = `${progress}%`;
  progressBar.style.width = `${progress}%`;
  if (frightenedTimer > 0) {
    statusEl.textContent = `反击 ${Math.ceil(frightenedTimer)}`;
  } else if (fruit) {
    statusEl.textContent = `奖励 ${Math.ceil(fruit.timer)}`;
  } else if (countdownTimer > 0) {
    statusEl.textContent = "准备";
  } else if (invulnerableTimer > 0) {
    statusEl.textContent = "护盾";
  } else if (running && nearestGhostDistance() < tile * 4.2) {
    statusEl.textContent = "危险";
  } else {
    statusEl.textContent = running ? "追逐" : "待机";
  }
}

function nearestGhostDistance() {
  if (!ghosts?.length || !player) return Infinity;
  return ghosts.reduce((closest, ghost) => Math.min(closest, Math.hypot(player.x - ghost.x, player.y - ghost.y)), Infinity);
}

function awardScore(points, label, x = player.x, y = player.y, color = "#ffd75f") {
  score += points;
  if (score > best) {
    best = score;
    localStorage.setItem("neonMuncherBest", String(best));
  }
  if (label) addFloatingText(label, x, y, color);
  updateHud();
}

function addFloatingText(text, x, y, color = "#ffd75f", life = 0.9, drift = -28) {
  floatingTexts.push({ text, x, y, color, life, maxLife: life, drift });
}

function emitSparks(x, y, color, count = 9) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
    const speed = 45 + Math.random() * 75;
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      life: 0.38 + Math.random() * 0.28,
      maxLife: 0.66,
    });
  }
}

function spawnFruit() {
  if (fruit) return;
  const fruits = [
    { name: "CHERRY", color: "#ff5f6d", leaf: "#64f299", points: 500 },
    { name: "LEMON", color: "#ffd75f", leaf: "#35e6ff", points: 700 },
    { name: "PLUM", color: "#ff5fa8", leaf: "#64f299", points: 900 },
  ];
  const type = fruits[(level - 1) % fruits.length];
  fruit = {
    ...type,
    x: 14 * tile,
    y: 15 * tile + tile / 2,
    timer: 9,
    points: type.points + (level - 1) * 100,
  };
  addFloatingText(type.name, fruit.x, fruit.y - 12, type.color, 1.2, -12);
  updateHud();
}

function cellAtPx(x, y) {
  return {
    c: Math.floor(x / tile),
    r: Math.floor(y / tile),
  };
}

function isBlockedCell(r, c, actor) {
  if (c < 0 || c >= cols) return false;
  if (r < 0 || r >= rows) return true;
  return map[r][c] === "#" || (map[r][c] === "-" && !actor.canUseDoor);
}

function canMove(actor, dirName) {
  const dir = DIRS[dirName];
  const margin = tile * 0.36;
  const nx = actor.x + dir.x * margin;
  const ny = actor.y + dir.y * margin;
  const { r, c } = cellAtPx(nx, ny);
  return !isBlockedCell(r, c, actor);
}

function nearCenter(actor, allowance = 2.2) {
  const cx = Math.floor(actor.x / tile) * tile + tile / 2;
  const cy = Math.floor(actor.y / tile) * tile + tile / 2;
  return Math.abs(actor.x - cx) <= allowance && Math.abs(actor.y - cy) <= allowance;
}

function snapToCenter(actor) {
  const cx = Math.floor(actor.x / tile) * tile + tile / 2;
  const cy = Math.floor(actor.y / tile) * tile + tile / 2;
  actor.x = cx;
  actor.y = cy;
}

function getTileCenter(actor) {
  return {
    x: Math.floor(actor.x / tile) * tile + tile / 2,
    y: Math.floor(actor.y / tile) * tile + tile / 2,
  };
}

function approach(current, target, amount) {
  if (Math.abs(target - current) <= amount) return target;
  return current + Math.sign(target - current) * amount;
}

function canTurnAtNextCenter(actor, dirName) {
  const dir = DIRS[dirName];
  const center = getTileCenter(actor);
  if (dir.x !== 0 && Math.abs(actor.y - center.y) > turnGrace) return false;
  if (dir.y !== 0 && Math.abs(actor.x - center.x) > turnGrace) return false;

  const preview = { ...actor, x: center.x, y: center.y };
  return canMove(preview, dirName);
}

function moveActor(actor, speed, dt) {
  if (actor.nextDir === opposite[actor.dir] && canMove(actor, actor.nextDir)) {
    actor.dir = actor.nextDir;
  }

  if (actor.nextDir && canTurnAtNextCenter(actor, actor.nextDir)) {
    snapToCenter(actor);
    actor.dir = actor.nextDir;
  }
  if (nearCenter(actor) && !canMove(actor, actor.dir)) {
    snapToCenter(actor);
    return;
  }

  const dir = DIRS[actor.dir];
  const center = getTileCenter(actor);
  if (dir.x !== 0) actor.y = approach(actor.y, center.y, laneAssist * dt);
  if (dir.y !== 0) actor.x = approach(actor.x, center.x, laneAssist * dt);

  actor.x += dir.x * speed * dt;
  actor.y += dir.y * speed * dt;

  if (actor.x < -tile / 2) actor.x = width + tile / 2;
  if (actor.x > width + tile / 2) actor.x = -tile / 2;
}

function availableDirs(actor) {
  return Object.keys(DIRS).filter((name) => name !== "none" && canMove(actor, name));
}

function chooseGhostDir(ghost) {
  const choices = availableDirs(ghost).filter((name) => name !== opposite[ghost.dir]);
  const dirs = choices.length ? choices : availableDirs(ghost);
  if (!dirs.length) return opposite[ghost.dir];

  if (frightenedTimer > 0) {
    return dirs.sort((a, b) => distanceAfter(ghost, b, player) - distanceAfter(ghost, a, player))[0];
  }

  if (ghost.name === "mint" && Math.random() < 0.45) {
    return dirs[Math.floor(Math.random() * dirs.length)];
  }

  let target = player;
  if (ghost.name === "spark") {
    const ahead = DIRS[player.dir];
    target = { x: player.x + ahead.x * tile * 4, y: player.y + ahead.y * tile * 4 };
  } else if (ghost.name === "ember") {
    target = { x: width - player.x, y: height - player.y };
  }

  return dirs.sort((a, b) => distanceAfter(ghost, a, target) - distanceAfter(ghost, b, target))[0];
}

function distanceAfter(actor, dirName, target) {
  const dir = DIRS[dirName];
  const nx = actor.x + dir.x * tile;
  const ny = actor.y + dir.y * tile;
  return (nx - target.x) ** 2 + (ny - target.y) ** 2;
}

function eatPellet() {
  const { r, c } = cellAtPx(player.x, player.y);
  const cell = map[r]?.[c];
  if (cell === "." || cell === "o") {
    map[r][c] = " ";
    pelletsLeft -= 1;
    pelletsEaten += 1;
    if (cell === "o") {
      awardScore(50, "POWER", player.x, player.y - 10, "#35e6ff");
      frightenedTimer = 8.5;
      combo = 0;
      screenShake = 4;
      emitSparks(player.x, player.y, "#35e6ff", 14);
      playSfx("power");
    } else {
      awardScore(10);
      if (pelletsEaten % 3 === 0) playSfx("pellet");
    }
    if (pelletsEaten % 70 === 0) spawnFruit();
    if (pelletsLeft === 0) nextLevel();
  }
}

function eatFruit() {
  if (!fruit) return;
  if (Math.hypot(player.x - fruit.x, player.y - fruit.y) > tile * 0.75) return;
  awardScore(fruit.points, `+${fruit.points}`, fruit.x, fruit.y - 10, fruit.color);
  emitSparks(fruit.x, fruit.y, fruit.color, 18);
  screenShake = 6;
  fruit = null;
  playSfx("fruit");
  updateHud();
}

function handleCollisions() {
  if (invulnerableTimer > 0 || countdownTimer > 0) return;
  for (const ghost of ghosts) {
    const d = Math.hypot(player.x - ghost.x, player.y - ghost.y);
    if (d > tile * 0.68) continue;

    if (frightenedTimer > 0) {
      combo += 1;
      const points = 200 * combo;
      awardScore(points, `+${points}`, ghost.x, ghost.y - 8, "#f7fbff");
      emitSparks(ghost.x, ghost.y, ghost.color, 16);
      screenShake = 7;
      playSfx("ghost");
      ghost.x = ghost.spawn.x;
      ghost.y = ghost.spawn.y;
      ghost.dir = opposite[ghost.dir];
      ghost.nextDir = ghost.dir;
    } else {
      lives -= 1;
      screenShake = 10;
      emitSparks(player.x, player.y, "#ff5fa8", 20);
      playSfx("hurt");
      updateHud();
      if (lives <= 0) {
        endGame();
      } else {
        frightenedTimer = 0;
        combo = 0;
        countdownTimer = 0.9;
        countdownText = "READY";
        invulnerableTimer = 1.8;
        resetActors();
      }
      break;
    }
  }
}

function endGame() {
  running = false;
  gameOver = true;
  stopMusic();
  const rating = score >= 6000 ? "S" : score >= 4000 ? "A" : score >= 2500 ? "B" : score >= 1200 ? "C" : "D";
  overlayText.textContent = `游戏结束，最终得分 ${score}，评级 ${rating}。`;
  startButton.textContent = "再来一局";
  overlay.classList.remove("hidden");
}

function updateMusicButton() {
  soundButton.setAttribute("aria-pressed", String(musicOn));
  soundButton.title = musicOn ? "音乐开" : "音乐关";
  soundButton.setAttribute("aria-label", soundButton.title);
}

function ensureAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return false;
  if (!audioCtx) audioCtx = new AudioCtor();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return true;
}

function playNote(midi, when, duration, type = "square", volume = 0.035) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  osc.type = type;
  osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

function playDrum(when, tone = "kick") {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = tone === "hat" ? "square" : "sine";
  osc.frequency.setValueAtTime(tone === "hat" ? 1400 : 92, when);
  if (tone === "kick") osc.frequency.exponentialRampToValueAtTime(45, when + 0.09);
  gain.gain.setValueAtTime(tone === "hat" ? 0.012 : 0.045, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + (tone === "hat" ? 0.035 : 0.12));
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(when);
  osc.stop(when + 0.14);
}

function playStartJingle() {
  if (!audioCtx || !musicOn) return;
  const now = audioCtx.currentTime + 0.03;
  [72, 76, 79, 84].forEach((note, index) => playNote(note, now + index * 0.085, 0.12, "square", 0.04));
}

function playSfx(kind) {
  if (!audioCtx || !musicOn) return;
  const now = audioCtx.currentTime + 0.01;
  if (kind === "pellet") playNote(88 + (pelletsEaten % 5), now, 0.035, "square", 0.018);
  if (kind === "power") [72, 79, 84].forEach((note, index) => playNote(note, now + index * 0.055, 0.08, "sawtooth", 0.035));
  if (kind === "fruit") [84, 88, 91, 96].forEach((note, index) => playNote(note, now + index * 0.045, 0.08, "square", 0.032));
  if (kind === "ghost") [79, 74, 86].forEach((note, index) => playNote(note, now + index * 0.05, 0.075, "triangle", 0.04));
  if (kind === "hurt") [55, 51, 48].forEach((note, index) => playNote(note, now + index * 0.09, 0.12, "sawtooth", 0.035));
  if (kind === "level") [76, 79, 83, 88].forEach((note, index) => playNote(note, now + index * 0.075, 0.12, "square", 0.032));
}

function scheduleMusic() {
  if (!musicOn || !running || paused || !audioCtx) return;
  musicMood = frightenedTimer > 0 ? "power" : nearestGhostDistance() < tile * 4.2 ? "danger" : "chase";
  const patterns = {
    chase: {
      melody: [72, 76, 79, 76, 71, 74, 77, 74, 72, 76, 81, 79, 77, 74, 71, 74],
      bass: [48, 48, 55, 48, 43, 43, 50, 43],
      beat: 0.17,
    },
    danger: {
      melody: [79, 78, 79, 83, 79, 78, 76, 74, 79, 78, 79, 86, 83, 79, 78, 76],
      bass: [43, 43, 44, 43, 43, 46, 44, 43],
      beat: 0.145,
    },
    power: {
      melody: [84, 83, 81, 79, 84, 83, 81, 76, 88, 86, 84, 83, 81, 79, 76, 72],
      bass: [55, 50, 55, 50, 57, 52, 57, 52],
      beat: 0.13,
    },
  };
  const pattern = patterns[musicMood];
  const now = audioCtx.currentTime;
  while (nextBeatTime < now + 0.42) {
    const step = musicStep % 16;
    playNote(pattern.bass[step % pattern.bass.length], nextBeatTime, 0.09, "triangle", 0.028);
    if (step % 2 === 0) playNote(pattern.melody[step], nextBeatTime + 0.025, 0.105, "square", 0.03);
    if (step % 4 === 1) playNote(pattern.melody[(step + 5) % 16] + 12, nextBeatTime + 0.055, 0.045, "sawtooth", 0.011);
    if (step % 4 === 0) playDrum(nextBeatTime, "kick");
    if (step % 2 === 1) playDrum(nextBeatTime + 0.035, "hat");
    nextBeatTime += pattern.beat;
    musicStep += 1;
  }
}

function startMusic() {
  if (!musicOn || !running || !ensureAudio()) return;
  nextBeatTime = audioCtx.currentTime + 0.04;
  if (!musicTimer) musicTimer = setInterval(scheduleMusic, 90);
}

function stopMusic() {
  if (!musicTimer) return;
  clearInterval(musicTimer);
  musicTimer = null;
}

function toggleMusic() {
  musicOn = !musicOn;
  localStorage.setItem("neonMuncherMusic", musicOn ? "on" : "off");
  updateMusicButton();
  if (musicOn) {
    startMusic();
  } else {
    stopMusic();
  }
}

function setPaused(nextPaused) {
  if (!running) return;
  paused = nextPaused;
  if (paused) stopMusic();
  else startMusic();
}

function update(dt) {
  tick += dt;
  if (countdownTimer > 0) {
    countdownTimer = Math.max(0, countdownTimer - dt);
    updateEffects(dt);
    updateHud();
    return;
  }
  if (invulnerableTimer > 0) invulnerableTimer = Math.max(0, invulnerableTimer - dt);
  if (frightenedTimer > 0) frightenedTimer = Math.max(0, frightenedTimer - dt);
  if (fruit) {
    fruit.timer -= dt;
    if (fruit.timer <= 0) fruit = null;
  }
  updateEffects(dt);

  moveActor(player, player.speed + Math.min(level - 1, 5) * 4, dt);
  player.mouth += dt * 10;
  eatPellet();
  eatFruit();

  ghosts.forEach((ghost) => {
    if (nearCenter(ghost, 2.8)) {
      snapToCenter(ghost);
      ghost.nextDir = chooseGhostDir(ghost);
    }
    const speed = (ghost.speed + Math.min(level - 1, 5) * 5) * (frightenedTimer > 0 ? 0.76 : 1);
    moveActor(ghost, speed, dt);
  });

  handleCollisions();
  updateHud();
}

function updateEffects(dt) {
  screenShake = Math.max(0, screenShake - dt * 28);
  floatingTexts = floatingTexts
    .map((item) => ({ ...item, y: item.y + item.drift * dt, life: item.life - dt }))
    .filter((item) => item.life > 0);
  sparks = sparks
    .map((spark) => ({
      ...spark,
      x: spark.x + spark.vx * dt,
      y: spark.y + spark.vy * dt,
      vx: spark.vx * 0.92,
      vy: spark.vy * 0.92,
      life: spark.life - dt,
    }))
    .filter((spark) => spark.life > 0);
}

function drawMaze() {
  ctx.fillStyle = "#03050a";
  ctx.fillRect(0, 0, width, height);

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = map[r][c];
      const x = c * tile;
      const y = r * tile;

      if (cell === "#") {
        ctx.fillStyle = "#10244a";
        ctx.fillRect(x, y, tile, tile);
        ctx.strokeStyle = "#35e6ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, tile - 4, tile - 4);
      } else if (cell === ".") {
        ctx.fillStyle = "#ffe8a3";
        ctx.beginPath();
        ctx.arc(x + tile / 2, y + tile / 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell === "o") {
        const pulse = 1 + Math.sin(tick * 8) * 0.18;
        ctx.fillStyle = "#ffd75f";
        ctx.beginPath();
        ctx.arc(x + tile / 2, y + tile / 2, 6.2 * pulse, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell === "-") {
        ctx.fillStyle = "rgba(255, 215, 95, 0.75)";
        ctx.fillRect(x, y + 8, tile, 4);
      }
    }
  }
}

function drawPlayer() {
  const dir = DIRS[player.dir];
  const base = Math.atan2(dir.y, dir.x);
  const mouth = 0.18 + Math.abs(Math.sin(player.mouth)) * 0.28;
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.arc(player.x, player.y, 8.8, base + mouth, base + Math.PI * 2 - mouth);
  ctx.closePath();
  ctx.fill();
  if (invulnerableTimer > 0) {
    ctx.strokeStyle = `rgba(255, 215, 95, ${0.45 + Math.sin(tick * 16) * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 12.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawFruit() {
  if (!fruit) return;
  const pulse = 1 + Math.sin(tick * 7) * 0.08;
  ctx.save();
  ctx.translate(fruit.x, fruit.y);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = fruit.color;
  ctx.beginPath();
  ctx.arc(-4, 1, 6.2, 0, Math.PI * 2);
  ctx.arc(4, 1, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = fruit.leaf;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.quadraticCurveTo(5, -12, 12, -9);
  ctx.stroke();
  ctx.restore();
}

function drawGhost(ghost) {
  const scared = frightenedTimer > 0;
  const flash = scared && frightenedTimer < 2.3 && Math.floor(tick * 8) % 2 === 0;
  ctx.fillStyle = scared ? (flash ? "#f7fbff" : "#315bff") : ghost.color;
  ctx.beginPath();
  ctx.arc(ghost.x, ghost.y - 2, 8.5, Math.PI, 0);
  ctx.lineTo(ghost.x + 8.5, ghost.y + 8);
  for (let i = 0; i < 3; i += 1) {
    ctx.lineTo(ghost.x + 4 - i * 6, ghost.y + (i % 2 ? 4 : 8));
  }
  ctx.lineTo(ghost.x - 8.5, ghost.y + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ghost.x - 3.2, ghost.y - 2, 2.2, 0, Math.PI * 2);
  ctx.arc(ghost.x + 3.2, ghost.y - 2, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawEffects() {
  sparks.forEach((spark) => {
    const alpha = Math.max(0, spark.life / spark.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  floatingTexts.forEach((item) => {
    const alpha = Math.max(0, item.life / item.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = item.color;
    ctx.font = "bold 16px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(item.text, item.x, item.y);
  });
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
  }
  drawMaze();
  drawFruit();
  drawPlayer();
  ghosts.forEach(drawGhost);
  drawEffects();

  if (countdownTimer > 0) {
    ctx.fillStyle = "rgba(3, 5, 10, 0.38)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffd75f";
    ctx.font = "bold 38px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(countdownText, width / 2, height / 2);
  }

  if (paused) {
    ctx.fillStyle = "rgba(3, 5, 10, 0.58)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffd75f";
    ctx.font = "bold 42px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", width / 2, height / 2);
  }
  ctx.restore();
}

function loop(time = 0) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.04);
  lastTime = time;
  if (running && !paused) update(dt);
  draw();
  requestAnimationFrame(loop);
}

function focusGame() {
  canvas.focus({ preventScroll: true });
}

function setDirection(dir) {
  if (!running) startGame(true);
  if (paused) return;
  focusGame();
  if (dir === opposite[player.dir] && canMove(player, dir)) {
    player.dir = dir;
  }
  if (!canMove(player, player.dir) && canMove(player, dir)) {
    player.dir = dir;
  }
  player.nextDir = dir;
}

function handleKeydown(event) {
  const keyMap = {
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
    ArrowUp: "up",
    w: "up",
    W: "up",
    ArrowDown: "down",
    s: "down",
    S: "down",
  };
  const codeMap = {
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
  };
  const dir = keyMap[event.key] || codeMap[event.code];
  if (dir) {
    event.preventDefault();
    setDirection(dir);
  } else if (event.key === "p" || event.key === "P") {
    setPaused(!paused);
  } else if (event.key === "Enter") {
    startGame(true);
  }
}

window.addEventListener("keydown", handleKeydown, true);

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    setDirection(button.dataset.dir);
  });
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  focusGame();
  touchStart = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointermove", (event) => {
  if (!touchStart) return;
  event.preventDefault();
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  if (Math.hypot(dx, dy) < 18) return;
  setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  touchStart = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointerup", (event) => {
  if (!touchStart) return;
  event.preventDefault();
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.hypot(dx, dy) < 18) return;
  setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
});

canvas.addEventListener("pointercancel", () => {
  touchStart = null;
});

startButton.addEventListener("click", () => startGame(true));
soundButton.addEventListener("click", toggleMusic);
pauseButton.addEventListener("click", () => setPaused(!paused));
resetButton.addEventListener("click", () => startGame(true));

map = makeMap();
resetActors();
updateHud();
updateMusicButton();
draw();
requestAnimationFrame(loop);
