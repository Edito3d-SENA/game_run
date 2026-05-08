let modalElement;
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const finalScoreElement = document.getElementById('finalScore');
const levelElement = document.getElementById('level');
const timerElement = document.getElementById('timer');

canvas.width = 360;
canvas.height = 640;

let score = 0;
let gameActive = true;
let currentLane = 1;
const laneWidth = canvas.width / 3;

let currentLevel = 1;
let timeLeft = 30; 
let gameSpeed = 6;
let levelTimerInterval;

let player = {
    x: laneWidth + laneWidth / 2 - 22,
    y: canvas.height - 120,
    w: 45,
    h: 45,
    isFlying: false,
    balloonTimer: 0
};

let obstacles = [];

// INICIO SEGURO: Espera a que todo cargue (especialmente Bootstrap)
window.onload = () => {
    modalElement = new bootstrap.Modal(document.getElementById('gameOverModal'));
    startLevelTimer();
    update();
};

// CONTROLES
window.addEventListener('keydown', e => {
    if (!gameActive) return;
    if (e.key === "ArrowLeft" && currentLane > 0) currentLane--;
    if (e.key === "ArrowRight" && currentLane < 2) currentLane++;
});

let startX = 0;
canvas.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    if (e.cancelable) e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
    let diffX = e.changedTouches[0].clientX - startX;
    if (Math.abs(diffX) > 25) {
        if (diffX > 0 && currentLane < 2) currentLane++;
        else if (diffX < 0 && currentLane > 0) currentLane--;
    }
}, { passive: false });

// LÓGICA DE NIVELES
function startLevelTimer() {
    clearInterval(levelTimerInterval);
    levelTimerInterval = setInterval(() => {
        if (gameActive) {
            timeLeft--;
            timerElement.innerText = timeLeft;
            if (timeLeft <= 0) {
                if (currentLevel < 3) nextLevel();
                else victory();
            }
        }
    }, 1000);
}

function nextLevel() {
    currentLevel++;
    timeLeft = 30; 
    gameSpeed += 3; 
    levelElement.innerText = currentLevel;
    obstacles = []; 
    canvas.style.borderColor = currentLevel === 2 ? "#ff00ff" : "#ff0000";
}

function victory() {
    gameActive = false;
    clearInterval(levelTimerInterval);
    alert("¡COMPILACIÓN EXITOSA! Pasaste los 3 niveles.");
    location.reload();
}

function spawnObstacle() {
    if (!gameActive) return;
    const lane = Math.floor(Math.random() * 3);
    const types = ['vaca', 'hueco', 'globo'];
    const type = types[Math.floor(Math.random() * types.length)];
    obstacles.push({
        x: lane * laneWidth + (laneWidth / 2) - 25,
        y: -100, w: 50, h: 50, type: type
    });
}

function update() {
    if (!gameActive) return;
    score++;
    scoreElement.innerText = Math.floor(score / 10);
    let targetX = currentLane * laneWidth + (laneWidth / 2) - player.w / 2;
    player.x += (targetX - player.x) * 0.25;

    if (player.isFlying) {
        player.balloonTimer--;
        if (player.balloonTimer <= 0) player.isFlying = false;
    }

    obstacles.forEach((obs, i) => {
        obs.y += gameSpeed;
        if (player.x < obs.x + obs.w && player.x + player.w > obs.x &&
            player.y < obs.y + obs.h && player.y + player.h > obs.y) {
            if (obs.type === 'globo') {
                player.isFlying = true;
                player.balloonTimer = 180;
                obstacles.splice(i, 1);
            } else if (!player.isFlying) {
                gameOver(); // UNA SOLA VIDA
            }
        }
        if (obs.y > canvas.height) obstacles.splice(i, 1);
    });

    if (score % 60 === 0) spawnObstacle();
    draw();
    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#222";
    for(let i=1; i<3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0); ctx.lineTo(i * laneWidth, canvas.height);
        ctx.stroke();
    }
    obstacles.forEach(obs => {
        ctx.fillStyle = obs.type === 'vaca' ? '#a855f7' : (obs.type === 'globo' ? '#00ffcc' : '#000000');
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
    });
    ctx.fillStyle = player.isFlying ? "#fbbf24" : "#00ccff";
    ctx.fillRect(player.x, player.y, player.w, player.h);
}

function gameOver() {
    gameActive = false;
    clearInterval(levelTimerInterval);
    finalScoreElement.innerText = Math.floor(score / 10);
    modalElement.show();
}

function resetGame() {
    location.reload();
}