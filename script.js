// ==================== CONFIGURACIÓN ====================
const CONFIG = {
    width: 900,
    height: 600,
    fighterRadius: 16,
    bulletRadius: 5,
    bulletSpeed: 4.8,
    basePlayerSpeed: 2.0,
    baseAISpeed: 1.5,
    shootDelayFrames: 34,
    obstacleCount: 4,
    mobileObstacleCount: 3,
    powerUpSpawnInterval: 180,      // cada 3 segundos (60fps)
    invincibilityFrames: 45,
    powerUpBaseDuration: 360,        // 6 segundos base
    powerUpExtraDuration: 180,       // +3 segundos por cada power-up extra
    maxPowerUpDuration: 900,         // 15 segundos máximo
    maxSpeedMult: 2.5,
    maxShield: 5,
    minShootMult: 0.2
};

// ==================== ELEMENTOS DOM ====================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startScreen = document.getElementById('startScreen');
const gameUI = document.getElementById('gameUI');
const playerNameInput = document.getElementById('playerName');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const winsSpan = document.getElementById('wins');
const livesSpan = document.getElementById('lives');
const powerSpan = document.getElementById('power');
const remainingSpan = document.getElementById('remaining');
const gameOverMsgDiv = document.getElementById('gameOverMsg');

// ==================== ESTADO GLOBAL ====================
let gameRunning = false;
let fighters = [];
let bullets = [];
let obstacles = [];
let mobileObstacles = [];
let powerups = [];
let playerIndex = -1;
let wins = 0;
let currentPlayer = '';
let powerUpCounter = 30;   // para que aparezca uno rápido al empezar

let touchX = 0, touchY = 0;
let aimX = 0, aimY = 0;

// ==================== FUNCIONES AUXILIARES ====================
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}
function circlesCollide(a, b) {
    return distance(a, b) < a.radius + b.radius;
}
function resolveCollision(a, b) {
    let dx = a.x - b.x, dy = a.y - b.y;
    let dist = Math.hypot(dx, dy);
    let overlap = (a.radius + b.radius) - dist;
    if (overlap > 0) {
        let angle = Math.atan2(dy, dx);
        let moveX = Math.cos(angle) * overlap;
        let moveY = Math.sin(angle) * overlap;
        if (b.isStatic === false) { // ambos se mueven
            a.x += moveX * 0.5; a.y += moveY * 0.5;
            b.x -= moveX * 0.5; b.y -= moveY * 0.5;
        } else {
            a.x += moveX; a.y += moveY;
        }
    }
}

// Posición aleatoria dentro del mapa (evitando bordes extremos)
function getRandomPosition() {
    const margin = 50;
    return {
        x: margin + Math.random() * (CONFIG.width - margin * 2),
        y: margin + Math.random() * (CONFIG.height - margin * 2)
    };
}

// Posición en borde para enemigos
function getSpawnOnEdge() {
    const side = Math.floor(Math.random() * 4);
    const isCorner = Math.random() < 0.5;
    let x, y;
    const margin = 35;
    if (side === 0) { x = isCorner ? margin : CONFIG.width / 2; y = -margin; }
    else if (side === 1) { x = CONFIG.width + margin; y = isCorner ? margin : CONFIG.height / 2; }
    else if (side === 2) { x = isCorner ? CONFIG.width - margin : CONFIG.width / 2; y = CONFIG.height + margin; }
    else { x = -margin; y = isCorner ? CONFIG.height - margin : CONFIG.height / 2; }
    return { x, y };
}

// ==================== CREAR ENTIDADES ====================
function createFighter(x, y, isPlayer, health = 3, name = '') {
    return {
        x, y, radius: CONFIG.fighterRadius, health, isPlayer, name,
        color: isPlayer ? "#3ac9ff" : "#ff884d",
        shootCd: 0,
        speedMult: 1.0,
        shootMult: 1.0,
        shield: 0,
        powerTimers: { speed: 0, shoot: 0, shield: 0 }, // frames restantes
        invTimer: 0
    };
}
function createBullet(x, y, vx, vy, owner) {
    return { x, y, radius: CONFIG.bulletRadius, vx, vy, owner };
}
function createObstacle(x, y, radius, isStatic = true) {
    return { x, y, radius, isStatic, color: "#8a6a4a" };
}
function createMobileObstacle(x, y, radius, vx, vy) {
    return { x, y, radius, isStatic: false, vx, vy, color: "#cc8866", damage: true };
}
function createPowerUp(x, y, type) {
    return { x, y, radius: 18, type }; // más grandes
}

// ==================== INICIALIZAR PARTIDA ====================
function initGame() {
    gameRunning = true;
    fighters = [];
    bullets = [];
    powerups = [];
    powerUpCounter = 30;  // aparece pronto

    // Jugador
    const player = createFighter(CONFIG.width/2, CONFIG.height/2, true, 3, currentPlayer);
    fighters.push(player);
    playerIndex = 0;
    touchX = player.x; touchY = player.y;
    aimX = player.x; aimY = player.y;

    // 3 enemigos en bordes
    const enemyNames = ["Cazador", "Sombra", "Destructor"];
    for (let i = 0; i < 3; i++) {
        let pos, attempts = 0;
        do {
            pos = getSpawnOnEdge();
            attempts++;
        } while (attempts < 10 && fighters.some(f => distance(f, pos) < 100));
        fighters.push(createFighter(pos.x, pos.y, false, 3, enemyNames[i]));
    }

    // Obstáculos fijos
    obstacles = [];
    for (let i = 0; i < CONFIG.obstacleCount; i++) {
        let x, y, ok;
        do {
            ok = true;
            x = 50 + Math.random() * (CONFIG.width - 100);
            y = 50 + Math.random() * (CONFIG.height - 100);
            if (distance({x,y,radius:20}, fighters[playerIndex]) < 80) ok = false;
            for (let obs of obstacles) if (distance({x,y,radius:20}, obs) < 40) ok = false;
        } while (!ok);
        obstacles.push(createObstacle(x, y, 14 + Math.random() * 10, true));
    }

    // Obstáculos móviles (ruedas peligrosas)
    mobileObstacles = [];
    for (let i = 0; i < CONFIG.mobileObstacleCount; i++) {
        let side = Math.floor(Math.random() * 4);
        let x, y, vx, vy;
        if (side === 0 || side === 2) {
            x = 50 + Math.random() * (CONFIG.width - 100);
            y = 100 + Math.random() * (CONFIG.height - 200);
            vx = (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.5);
            vy = 0;
        } else {
            x = 100 + Math.random() * (CONFIG.width - 200);
            y = 50 + Math.random() * (CONFIG.height - 100);
            vx = 0;
            vy = (Math.random() < 0.5 ? 1 : -1) * (1.2 + Math.random() * 1.5);
        }
        mobileObstacles.push(createMobileObstacle(x, y, 12, vx, vy));
    }

    updateUI();
    hideGameOver();
}

// ==================== GUARDAR VICTORIAS ====================
function loadWins(name) {
    const saved = localStorage.getItem(`wins_${name}`);
    wins = saved ? parseInt(saved) : 0;
    winsSpan.textContent = wins;
}
function saveWins() {
    localStorage.setItem(`wins_${currentPlayer}`, wins);
    winsSpan.textContent = wins;
}

// ==================== UI CON CUENTA REGRESIVA ====================
function formatTime(frames) {
    return (frames / 60).toFixed(1) + "s";
}
function updateUI() {
    if (playerIndex >= 0 && fighters[playerIndex]) {
        livesSpan.textContent = fighters[playerIndex].health;
    } else livesSpan.textContent = "0";
    remainingSpan.textContent = fighters.length;
    winsSpan.textContent = wins;

    const p = fighters[playerIndex];
    if (p) {
        let effects = [];
        if (p.powerTimers.speed > 0) effects.push(`🏃 x${p.speedMult.toFixed(1)} (${formatTime(p.powerTimers.speed)})`);
        if (p.powerTimers.shoot > 0) effects.push(`⚡ x${(1/p.shootMult).toFixed(1)} (${formatTime(p.powerTimers.shoot)})`);
        if (p.powerTimers.shield > 0) effects.push(`🛡️ x${p.shield} (${formatTime(p.powerTimers.shield)})`);
        powerSpan.textContent = effects.length ? effects.join(" | ") : "-";
    } else powerSpan.textContent = "-";
}

function showGameOver(message) {
    gameRunning = false;
    gameOverMsgDiv.textContent = message;
    gameOverMsgDiv.classList.remove('hidden');
    gameOverMsgDiv.style.color = message.includes("VICTORIA") ? "#ffdd44" : "#ff5555";
}
function hideGameOver() { gameOverMsgDiv.classList.add('hidden'); }

// ==================== DISPARO ====================
function shootFrom(fighter, targetX, targetY) {
    let dx = targetX - fighter.x, dy = targetY - fighter.y;
    let len = Math.hypot(dx, dy);
    if (len < 0.1) return;
    let dirX = dx / len, dirY = dy / len;
    bullets.push(createBullet(fighter.x, fighter.y, dirX * CONFIG.bulletSpeed, dirY * CONFIG.bulletSpeed, fighter));
}

// ==================== MOVIMIENTO CON COLISIONES ====================
function updatePlayerMovement() {
    const p = fighters[playerIndex];
    if (!p) return;
    let dx = touchX - p.x, dy = touchY - p.y;
    let dist = Math.hypot(dx, dy);
    if (dist > 2) {
        let speed = CONFIG.basePlayerSpeed * p.speedMult;
        let move = Math.min(speed, dist);
        p.x += (dx / dist) * move;
        p.y += (dy / dist) * move;
    }
    p.x = clamp(p.x, p.radius, CONFIG.width - p.radius);
    p.y = clamp(p.y, p.radius, CONFIG.height - p.radius);
    for (let obs of obstacles) if (circlesCollide(p, obs)) resolveCollision(p, obs);
    for (let mob of mobileObstacles) if (circlesCollide(p, mob)) resolveCollision(p, mob);
}

function updateAIMovement() {
    for (let f of fighters) {
        if (f.isPlayer) continue;
        let nearest = null, minDist = Infinity;
        for (let other of fighters) {
            if (other === f) continue;
            let d = distance(f, other);
            if (d < minDist) { minDist = d; nearest = other; }
        }
        if (nearest) {
            let dx = nearest.x - f.x, dy = nearest.y - f.y;
            let dist = Math.hypot(dx, dy);
            if (dist > 1) {
                let speed = CONFIG.baseAISpeed * f.speedMult;
                let move = Math.min(speed, dist - 5);
                f.x += (dx / dist) * move;
                f.y += (dy / dist) * move;
            }
        }
        f.x = clamp(f.x, f.radius, CONFIG.width - f.radius);
        f.y = clamp(f.y, f.radius, CONFIG.height - f.radius);
        for (let obs of obstacles) if (circlesCollide(f, obs)) resolveCollision(f, obs);
        for (let mob of mobileObstacles) if (circlesCollide(f, mob)) resolveCollision(f, mob);
    }
}

function updateMobileObstacles() {
    for (let mob of mobileObstacles) {
        mob.x += mob.vx; mob.y += mob.vy;
        if (mob.x - mob.radius < 0) { mob.x = mob.radius; mob.vx = -mob.vx; }
        if (mob.x + mob.radius > CONFIG.width) { mob.x = CONFIG.width - mob.radius; mob.vx = -mob.vx; }
        if (mob.y - mob.radius < 0) { mob.y = mob.radius; mob.vy = -mob.vy; }
        if (mob.y + mob.radius > CONFIG.height) { mob.y = CONFIG.height - mob.radius; mob.vy = -mob.vy; }
    }
}

function applyMobileObstacleDamage() {
    for (let p of fighters) {
        if (p.invTimer > 0) continue;
        for (let mob of mobileObstacles) {
            if (circlesCollide(p, mob)) {
                if (p.shield > 0) {
                    p.shield--;
                    if (p.shield === 0 && p.powerTimers.shield > 0) p.powerTimers.shield = 0;
                } else {
                    p.health--;
                    p.invTimer = CONFIG.invincibilityFrames;
                }
                if (p.health <= 0) {
                    if (p.isPlayer) { gameRunning = false; showGameOver("💀 GAME OVER 💀"); }
                    else { let idx = fighters.indexOf(p); if (idx !== -1) fighters.splice(idx,1); if (idx < playerIndex) playerIndex--; }
                }
                break;
            }
        }
    }
}

// ==================== COMBATE ====================
function updateShooting() {
    for (let f of fighters) {
        if (f.health <= 0) continue;
        let delay = CONFIG.shootDelayFrames * f.shootMult;
        if (f.shootCd <= 0) {
            if (f.isPlayer) shootFrom(f, aimX, aimY);
            else {
                let nearest = null, minDist = Infinity;
                for (let other of fighters) {
                    if (other === f) continue;
                    let d = distance(f, other);
                    if (d < minDist) { minDist = d; nearest = other; }
                }
                if (nearest) shootFrom(f, nearest.x, nearest.y);
            }
            f.shootCd = delay;
        } else f.shootCd--;
    }
}

function updateBullets() {
    for (let i = 0; i < bullets.length; i++) {
        let b = bullets[i];
        b.x += b.vx; b.y += b.vy;
        if (b.x + b.radius < 0 || b.x - b.radius > CONFIG.width || b.y + b.radius < 0 || b.y - b.radius > CONFIG.height) {
            bullets.splice(i,1); i--; continue;
        }
        let hit = false;
        for (let obs of obstacles) if (circlesCollide(b, obs)) { bullets.splice(i,1); hit = true; break; }
        if (hit) { i--; continue; }
        for (let mob of mobileObstacles) if (circlesCollide(b, mob)) { bullets.splice(i,1); hit = true; break; }
        if (hit) { i--; continue; }
        for (let j = 0; j < fighters.length; j++) {
            let f = fighters[j];
            if (f === b.owner || f.health <= 0) continue;
            if (circlesCollide(b, f)) {
                if (f.invTimer <= 0) {
                    if (f.shield > 0) { f.shield--; if (f.shield===0 && f.powerTimers.shield>0) f.powerTimers.shield=0; }
                    else { f.health--; f.invTimer = CONFIG.invincibilityFrames; }
                    if (f.health <= 0) {
                        if (f.isPlayer) { gameRunning = false; showGameOver("💀 GAME OVER 💀"); }
                        else { fighters.splice(j,1); if (j < playerIndex) playerIndex--; j--; }
                    }
                }
                bullets.splice(i,1); hit = true; break;
            }
        }
        if (hit) i--;
    }
}

function updateInvincibility() {
    for (let f of fighters) if (f.invTimer > 0) f.invTimer--;
}

// ==================== POWER-UPS (acumulación de tiempo y efecto) ====================
function spawnPowerUp() {
    if (powerups.length >= 5) return;
    const pos = getRandomPosition();
    const types = ['speed', 'shoot', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    powerups.push(createPowerUp(pos.x, pos.y, type));
    // Mensaje de depuración (visible en consola)
    console.log("¡Power-up generado!", type, "en", pos);
}

function applyPowerUp(player, type) {
    const BASE = CONFIG.powerUpBaseDuration;
    const EXTRA = CONFIG.powerUpExtraDuration;
    const MAX = CONFIG.maxPowerUpDuration;

    if (type === 'speed') {
        // Acumula efecto
        let newMult = player.speedMult + 0.2;
        player.speedMult = Math.min(CONFIG.maxSpeedMult, newMult);
        // Acumula tiempo
        let newTime = (player.powerTimers.speed > 0 ? player.powerTimers.speed : 0) + BASE;
        player.powerTimers.speed = Math.min(MAX, newTime);
    }
    else if (type === 'shoot') {
        let newMult = player.shootMult - 0.1;
        player.shootMult = Math.max(CONFIG.minShootMult, newMult);
        let newTime = (player.powerTimers.shoot > 0 ? player.powerTimers.shoot : 0) + BASE;
        player.powerTimers.shoot = Math.min(MAX, newTime);
    }
    else if (type === 'shield') {
        player.shield = Math.min(CONFIG.maxShield, player.shield + 1);
        let newTime = (player.powerTimers.shield > 0 ? player.powerTimers.shield : 0) + BASE;
        player.powerTimers.shield = Math.min(MAX, newTime);
    }
}

function updatePowerUps() {
    const player = fighters[playerIndex];
    if (player) {
        for (let i = 0; i < powerups.length; i++) {
            if (distance(player, powerups[i]) < player.radius + powerups[i].radius) {
                applyPowerUp(player, powerups[i].type);
                powerups.splice(i,1);
                i--;
            }
        }
    }
    // Spawn periódico
    if (powerUpCounter <= 0) {
        spawnPowerUp();
        powerUpCounter = CONFIG.powerUpSpawnInterval;
    } else {
        powerUpCounter--;
    }
    // Actualizar temporizadores de los efectos
    for (let f of fighters) {
        if (f.powerTimers.speed > 0) {
            f.powerTimers.speed--;
            if (f.powerTimers.speed <= 0) f.speedMult = 1.0;
        }
        if (f.powerTimers.shoot > 0) {
            f.powerTimers.shoot--;
            if (f.powerTimers.shoot <= 0) f.shootMult = 1.0;
        }
        if (f.powerTimers.shield > 0) {
            f.powerTimers.shield--;
            if (f.powerTimers.shield <= 0) f.shield = 0;
        }
    }
}

// ==================== VICTORIA ====================
function checkVictory() {
    if (!gameRunning) return;
    if (fighters.length === 1 && fighters[0].isPlayer) {
        gameRunning = false; wins++; saveWins(); showGameOver("🏆 ¡VICTORIA! 🏆");
    } else if (fighters.length === 0 || (playerIndex < fighters.length && fighters[playerIndex].health <= 0)) {
        if (gameRunning) { gameRunning = false; showGameOver("💀 GAME OVER 💀"); }
    }
}

// ==================== DIBUJADO CON POWER-UPS BRILLANTES ====================
function draw() {
    ctx.clearRect(0, 0, CONFIG.width, CONFIG.height);
    // Fondo de cuadrícula
    ctx.strokeStyle = "#2a3a55";
    for (let i = 0; i < CONFIG.width; i += 50) {
        ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,CONFIG.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,i%CONFIG.height); ctx.lineTo(CONFIG.width,i%CONFIG.height); ctx.stroke();
    }
    // Obstáculos fijos
    for (let obs of obstacles) {
        ctx.beginPath(); ctx.arc(obs.x, obs.y, obs.radius-2, 0, Math.PI*2);
        ctx.fillStyle = obs.color; ctx.fill();
        ctx.fillStyle = "#5a3a2a"; ctx.beginPath(); ctx.arc(obs.x, obs.y, obs.radius-6, 0, Math.PI*2); ctx.fill();
    }
    // Obstáculos móviles (ruedas)
    for (let mob of mobileObstacles) {
        ctx.beginPath(); ctx.arc(mob.x, mob.y, mob.radius-2, 0, Math.PI*2);
        ctx.fillStyle = mob.color; ctx.fill();
        ctx.fillStyle = "#aa5533"; ctx.beginPath(); ctx.arc(mob.x, mob.y, mob.radius-6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 16 monospace"; ctx.fillText("💀", mob.x-6, mob.y+6);
    }
    // POWER-UPS: grandes, brillantes y con pulso
    for (let p of powerups) {
        // Brillo exterior
        ctx.shadowBlur = 15;
        ctx.shadowColor = "white";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2);
        if (p.type === 'speed') ctx.fillStyle = "#66ffcc";
        else if (p.type === 'shoot') ctx.fillStyle = "#ffff66";
        else ctx.fillStyle = "#aa88ff";
        ctx.fill();
        ctx.shadowBlur = 0;
        // Icono grande
        ctx.fillStyle = "#000";
        ctx.font = "bold 22 monospace";
        let icon = p.type === 'speed' ? "🏃" : (p.type === 'shoot' ? "⚡" : "🛡️");
        ctx.fillText(icon, p.x-11, p.y+9);
    }
    // Balas
    for (let b of bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, b.radius-1, 0, Math.PI*2); ctx.fillStyle = "#ffaa44"; ctx.fill(); }
    // Combatientes
    for (let f of fighters) {
        let angle;
        if (f.isPlayer) angle = Math.atan2(aimY - f.y, aimX - f.x);
        else {
            let nearest = null, minDist = Infinity;
            for (let other of fighters) {
                if (other === f) continue;
                let d = distance(f, other);
                if (d < minDist) { minDist = d; nearest = other; }
            }
            angle = nearest ? Math.atan2(nearest.y - f.y, nearest.x - f.x) : 0;
        }
        let nose = { x: f.x + Math.cos(angle)*f.radius, y: f.y + Math.sin(angle)*f.radius };
        let left = { x: f.x + Math.cos(angle+2.2)*(f.radius*0.85), y: f.y + Math.sin(angle+2.2)*(f.radius*0.85) };
        let right = { x: f.x + Math.cos(angle-2.2)*(f.radius*0.85), y: f.y + Math.sin(angle-2.2)*(f.radius*0.85) };
        ctx.beginPath(); ctx.moveTo(nose.x, nose.y); ctx.lineTo(left.x, left.y); ctx.lineTo(right.x, right.y);
        ctx.fillStyle = f.color; ctx.fill();
        if (f.isPlayer) { ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.stroke(); }
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 12 monospace"; ctx.shadowBlur = 3; ctx.shadowColor = "black";
        ctx.fillText(f.name, f.x-15, f.y-18);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff"; ctx.font = "bold 14 monospace";
        let txt = "❤️"+f.health;
        if (f.shield > 0) txt += " 🛡️"+f.shield;
        ctx.fillText(txt, f.x-18, f.y-6);
        if (f.invTimer > 0 && (Math.floor(Date.now()/80)%2===0)) {
            ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(f.x, f.y, f.radius+4, 0, Math.PI*2);
            ctx.fillStyle = "white"; ctx.fill(); ctx.globalAlpha = 1;
        }
    }
}

// ==================== BUCLE PRINCIPAL ====================
function gameLoop() {
    if (gameRunning) {
        updateMobileObstacles();
        updatePlayerMovement();
        updateAIMovement();
        applyMobileObstacleDamage();
        updateShooting();
        updateBullets();
        updateInvincibility();
        updatePowerUps();
        checkVictory();
        updateUI();
    }
    draw();
    requestAnimationFrame(gameLoop);
}

// ==================== RESET Y CONTROLES ====================
function resetGame() {
    if (!currentPlayer) { startScreen.classList.remove('hidden'); gameUI.classList.add('hidden'); return; }
    initGame();
}
function handleTouchStart(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = CONFIG.width / rect.width, sy = CONFIG.height / rect.height;
    let tx = (e.touches[0].clientX - rect.left) * sx;
    let ty = (e.touches[0].clientY - rect.top) * sy;
    tx = clamp(tx, 0, CONFIG.width); ty = clamp(ty, 0, CONFIG.height);
    touchX = tx; touchY = ty; aimX = tx; aimY = ty;
}
function handleTouchMove(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const sx = CONFIG.width / rect.width, sy = CONFIG.height / rect.height;
    let tx = (e.touches[0].clientX - rect.left) * sx;
    let ty = (e.touches[0].clientY - rect.top) * sy;
    tx = clamp(tx, 0, CONFIG.width); ty = clamp(ty, 0, CONFIG.height);
    touchX = tx; touchY = ty; aimX = tx; aimY = ty;
}
canvas.addEventListener('touchstart', handleTouchStart);
canvas.addEventListener('touchmove', handleTouchMove);
canvas.addEventListener('touchend', e => e.preventDefault());
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = CONFIG.width / rect.width, sy = CONFIG.height / rect.height;
    let mx = (e.clientX - rect.left) * sx, my = (e.clientY - rect.top) * sy;
    mx = clamp(mx, 0, CONFIG.width); my = clamp(my, 0, CONFIG.height);
    aimX = mx; aimY = my;
    if (e.buttons === 1) { touchX = mx; touchY = my; }
});

// ==================== INICIALIZACIÓN ====================
function startGame() {
    currentPlayer = playerNameInput.value.trim();
    if (currentPlayer === "") return;
    loadWins(currentPlayer);
    startScreen.classList.add('hidden');
    gameUI.classList.remove('hidden');
    initGame();
}
startBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', resetGame);
function resizeCanvas() { canvas.width = CONFIG.width; canvas.height = CONFIG.height; }
resizeCanvas();
window.addEventListener('resize', resizeCanvas);
gameLoop();