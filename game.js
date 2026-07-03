const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const levelEl = document.querySelector("#level");
const livesEl = document.querySelector("#lives");
const overlay = document.querySelector("#overlay");
const overlayText = document.querySelector("#overlayText");
const startButton = document.querySelector("#startButton");

const tile = 20;
const rows = 31;
const cols = 28;
const width = cols * tile;
const height = rows * tile;

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

let player;
let ghosts;

function makeMap() {
  pelletsLeft = 0;
  return rawMap.map((row) =>
    [...row].map((cell) => {
      if (cell === "." || cell === "o") pelletsLeft += 1;
      return cell;
    }),
  );
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
    speed: 118,
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
  resetActors();
  running = true;
  paused = false;
  overlay.classList.add("hidden");
  updateHud();
}

function nextLevel() {
  level += 1;
  map = makeMap();
  frightenedTimer = 0;
  combo = 0;
  resetActors();
  updateHud();
}

function updateHud() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
  levelEl.textContent = level;
  livesEl.textContent = lives;
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

function moveActor(actor, speed, dt) {
  if (nearCenter(actor) && actor.nextDir && canMove(actor, actor.nextDir)) {
    snapToCenter(actor);
    actor.dir = actor.nextDir;
  }
  if (nearCenter(actor) && !canMove(actor, actor.dir)) {
    snapToCenter(actor);
    return;
  }

  const dir = DIRS[actor.dir];
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
    if (cell === "o") {
      score += 50;
      frightenedTimer = 8.5;
      combo = 0;
    } else {
      score += 10;
    }
    if (score > best) {
      best = score;
      localStorage.setItem("neonMuncherBest", String(best));
    }
    updateHud();
    if (pelletsLeft === 0) nextLevel();
  }
}

function handleCollisions() {
  for (const ghost of ghosts) {
    const d = Math.hypot(player.x - ghost.x, player.y - ghost.y);
    if (d > tile * 0.68) continue;

    if (frightenedTimer > 0) {
      combo += 1;
      score += 200 * combo;
      ghost.x = ghost.spawn.x;
      ghost.y = ghost.spawn.y;
      ghost.dir = opposite[ghost.dir];
      ghost.nextDir = ghost.dir;
      updateHud();
    } else {
      lives -= 1;
      updateHud();
      if (lives <= 0) {
        endGame();
      } else {
        frightenedTimer = 0;
        combo = 0;
        resetActors();
      }
      break;
    }
  }
}

function endGame() {
  running = false;
  gameOver = true;
  overlayText.textContent = `游戏结束，最终得分 ${score}。`;
  startButton.textContent = "再来一局";
  overlay.classList.remove("hidden");
}

function update(dt) {
  tick += dt;
  if (frightenedTimer > 0) frightenedTimer = Math.max(0, frightenedTimer - dt);

  moveActor(player, player.speed + Math.min(level - 1, 5) * 4, dt);
  player.mouth += dt * 10;
  eatPellet();

  ghosts.forEach((ghost) => {
    if (nearCenter(ghost, 2.8)) {
      snapToCenter(ghost);
      ghost.nextDir = chooseGhostDir(ghost);
    }
    const speed = (ghost.speed + Math.min(level - 1, 5) * 5) * (frightenedTimer > 0 ? 0.76 : 1);
    moveActor(ghost, speed, dt);
  });

  handleCollisions();
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

function draw() {
  drawMaze();
  drawPlayer();
  ghosts.forEach(drawGhost);

  if (paused) {
    ctx.fillStyle = "rgba(3, 5, 10, 0.58)";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#ffd75f";
    ctx.font = "bold 42px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("PAUSED", width / 2, height / 2);
  }
}

function loop(time = 0) {
  const dt = Math.min((time - lastTime) / 1000 || 0, 0.04);
  lastTime = time;
  if (running && !paused) update(dt);
  draw();
  requestAnimationFrame(loop);
}

function setDirection(dir) {
  if (!running || paused) return;
  player.nextDir = dir;
}

document.addEventListener("keydown", (event) => {
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
  if (keyMap[event.key]) {
    event.preventDefault();
    setDirection(keyMap[event.key]);
  } else if (event.key === "p" || event.key === "P") {
    if (running) paused = !paused;
  } else if (event.key === "Enter") {
    startGame(true);
  }
});

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("pointerdown", () => setDirection(button.dataset.dir));
});

startButton.addEventListener("click", () => startGame(true));

map = makeMap();
resetActors();
updateHud();
draw();
requestAnimationFrame(loop);
