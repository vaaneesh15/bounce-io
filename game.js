(function() {
    // ---------- Настройки темы ----------
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');
    let currentTheme = localStorage.getItem('gameTheme') || 'system';

    function setTheme(theme) {
        currentTheme = theme;
        localStorage.setItem('gameTheme', theme);
        applyTheme();
    }

    function applyTheme() {
        const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        let isDark = false;
        if (currentTheme === 'dark') isDark = true;
        else if (currentTheme === 'system') isDark = systemDark;

        document.body.classList.toggle('dark', isDark);

        if (currentTheme === 'light') themeIcon.className = 'fas fa-sun';
        else if (currentTheme === 'dark') themeIcon.className = 'fas fa-moon';
        else themeIcon.className = 'fas fa-circle-half-stroke';

        const themeColorMeta = document.getElementById('theme-color-meta');
        if (themeColorMeta) {
            themeColorMeta.setAttribute('content', isDark ? '#1a1a2e' : '#4a3aff');
        }

        if (typeof drawJoystick === 'function') {
            drawJoystick();
        }
    }

    themeToggle.addEventListener('click', () => {
        if (currentTheme === 'light') setTheme('dark');
        else if (currentTheme === 'dark') setTheme('system');
        else setTheme('light');
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    // ---------- Игровые переменные ----------
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const joystickCanvas = document.getElementById('joystick-canvas');
    const jCtx = joystickCanvas.getContext('2d');
    const healthSpan = document.getElementById('health-display');
    const pauseBtn = document.getElementById('pause-btn');
    const pauseIcon = document.getElementById('pause-icon');
    const speedBtn = document.getElementById('speed-btn');
    const healthPanel = document.getElementById('health-panel');

    let gameWidth, gameHeight;

    // Параметры игрока
    const player = {
        x: 0, y: 0,
        radius: 14,
        hp: 90,
        maxHp: 90,
        baseSpeed: 3.0,
        speed: 3.0
    };

    // Джойстик
    const joystick = {
        centerX: 100,
        centerY: 100,
        baseRadius: 60,
        handleRadius: 25,
        handleX: 100,
        handleY: 100,
        active: false,
        dx: 0,
        dy: 0
    };

    // Массивы объектов
    let enemies = [];
    let healers = [];
    let bouncers = [];
    let floatingTexts = [];

    // Настройки спавна
    const enemySpawnRate = 0.02;
    const bouncerSpawnRate = 0.005;
    const healerSpawnRate = 0.0024;
    const baseSpeedMin = 2.5;
    const baseSpeedMax = 4.0;
    const enemyDamage = 7;
    const healerMinHeal = 15;
    const healerMaxHeal = 19;

    const HITBOX_SCALE = 0.85;

    const BOUNCER_FALL_DISTANCE = 0.15;
    const BOUNCER_RISE_DISTANCE = 0.03;
    const BOUNCER_WAIT_TIME = 90;
    const BOUNCER_RISE_SPEED_MULT = 1.5;
    const BOUNCER_ACCELERATION = 0.05;

    const speedOptions = [0.5, 1.0, 2.0];
    let speedIndex = 1;
    let gameSpeed = speedOptions[speedIndex];

    // Режим Гендер Вики
    let genderWikiActive = false;
    let tapCount = 0;
    let tapMessageShown = false;
    let tapsAfterActivation = 0;

    let paused = false;
    let gameOver = false;
    let respawnTimer = 0;

    // ---------- Инициализация ----------
    function resizeGame() {
        const gameArea = document.querySelector('.game-area');
        if (!gameArea) return;
        const rect = gameArea.getBoundingClientRect();
        gameWidth = rect.width;
        gameHeight = rect.height;
        canvas.width = gameWidth;
        canvas.height = gameHeight;

        player.x = gameWidth / 2;
        player.y = gameHeight - 80;
    }

    window.addEventListener('load', () => {
        resizeGame();
        drawJoystick();
        applyTheme();
        updateHealthColor();
    });

    window.addEventListener('resize', resizeGame);

    // ---------- Джойстик ----------
    function drawJoystick() {
        jCtx.clearRect(0, 0, 200, 200);
        jCtx.beginPath();
        jCtx.arc(joystick.centerX, joystick.centerY, joystick.baseRadius, 0, 2 * Math.PI);
        jCtx.fillStyle = 'rgba(255,255,255,0.2)';
        jCtx.fill();
        jCtx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4a3aff';
        jCtx.lineWidth = 3;
        jCtx.stroke();

        jCtx.beginPath();
        jCtx.arc(joystick.handleX, joystick.handleY, joystick.handleRadius, 0, 2 * Math.PI);
        jCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--joystick-handle').trim() || '#4a3aff';
        jCtx.shadowColor = 'rgba(0,0,0,0.3)';
        jCtx.shadowBlur = 10;
        jCtx.fill();
        jCtx.shadowBlur = 0;
    }

    function handleJoystickStart(e) {
        e.preventDefault();
        const rect = joystickCanvas.getBoundingClientRect();
        const scaleX = joystickCanvas.width / rect.width;
        const scaleY = joystickCanvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        const dx = canvasX - joystick.centerX;
        const dy = canvasY - joystick.centerY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist <= joystick.baseRadius + 20) {
            joystick.active = true;
            updateJoystickPosition(canvasX, canvasY);
        }
    }

    function handleJoystickMove(e) {
        if (!joystick.active) return;
        e.preventDefault();
        const rect = joystickCanvas.getBoundingClientRect();
        const scaleX = joystickCanvas.width / rect.width;
        const scaleY = joystickCanvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        updateJoystickPosition(canvasX, canvasY);
    }

    function updateJoystickPosition(x, y) {
        let dx = x - joystick.centerX;
        let dy = y - joystick.centerY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const maxDist = joystick.baseRadius;
        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        joystick.handleX = joystick.centerX + dx;
        joystick.handleY = joystick.centerY + dy;
        if (dist > 1) {
            joystick.dx = dx / maxDist;
            joystick.dy = dy / maxDist;
        } else {
            joystick.dx = 0;
            joystick.dy = 0;
        }
        drawJoystick();
    }

    function handleJoystickEnd(e) {
        e.preventDefault();
        joystick.active = false;
        joystick.handleX = joystick.centerX;
        joystick.handleY = joystick.centerY;
        joystick.dx = 0;
        joystick.dy = 0;
        drawJoystick();
    }

    joystickCanvas.addEventListener('touchstart', handleJoystickStart, { passive: false });
    joystickCanvas.addEventListener('touchmove', handleJoystickMove, { passive: false });
    joystickCanvas.addEventListener('touchend', handleJoystickEnd);
    joystickCanvas.addEventListener('mousedown', handleJoystickStart);
    window.addEventListener('mousemove', handleJoystickMove);
    window.addEventListener('mouseup', handleJoystickEnd);

    // ---------- Спавн ----------
    function getRandomX(radius) {
        return Math.random() * (gameWidth - 2 * radius) + radius;
    }

    function spawnEnemy() {
        const speed = (Math.random() * (baseSpeedMax - baseSpeedMin) + baseSpeedMin) * gameSpeed;
        enemies.push({
            x: getRandomX(14),
            y: -20,
            radius: 14,
            speed: speed,
            type: 'enemy'
        });
    }

    function spawnHealer() {
        const speed = (Math.random() * (baseSpeedMax - baseSpeedMin) + baseSpeedMin) * gameSpeed;
        healers.push({
            x: getRandomX(12),
            y: -20,
            radius: 12,
            speed: speed,
            type: 'healer'
        });
    }

    function spawnBouncer() {
        const speed = (Math.random() * (baseSpeedMax - baseSpeedMin) + baseSpeedMin) * gameSpeed;
        bouncers.push({
            x: getRandomX(12),
            y: -20,
            radius: 12,
            speed: speed,
            type: 'bouncer',
            state: 'falling',
            waitTimer: 0,
            riseDistance: 0,
            startY: 0,
            trail: [],
            currentSpeed: speed,
            acceleration: 0
        });
    }

    // ---------- Обновление игрока ----------
    function updatePlayerPosition() {
        player.x += joystick.dx * player.speed;
        player.y += joystick.dy * player.speed;
        player.x = Math.max(player.radius, Math.min(gameWidth - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(gameHeight - player.radius, player.y));
    }

    // ---------- Столкновения ----------
    function checkCollisions() {
        if (gameOver) return;

        const playerRadius = player.radius;

        // Обычные враги
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const hitRadius = e.radius * HITBOX_SCALE;
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < playerRadius + hitRadius) {
                let damage = genderWikiActive ? 1 : enemyDamage;
                player.hp = Math.max(0, player.hp - damage);
                healthSpan.innerText = player.hp;
                updateHealthColor();
                floatingTexts.push({
                    x: player.x,
                    y: player.y - 20,
                    text: `-${damage}`,
                    color: '#ff6b6b',
                    life: 120
                });
                enemies.splice(i, 1);
                if (player.hp <= 0) {
                    gameOver = true;
                    respawnTimer = 5;
                }
            }
        }

        // Лекари
        for (let i = healers.length - 1; i >= 0; i--) {
            const h = healers[i];
            const hitRadius = h.radius * HITBOX_SCALE;
            const dx = player.x - h.x;
            const dy = player.y - h.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < playerRadius + hitRadius) {
                if (genderWikiActive) {
                    // В режиме гендер вики хилки восстанавливают 30 HP
                    player.hp = Math.min(player.maxHp, player.hp + 30);
                    floatingTexts.push({
                        x: player.x,
                        y: player.y - 20,
                        text: `+30`,
                        color: '#2ecc71',
                        life: 120
                    });
                } else {
                    const healAmount = Math.floor(Math.random() * (healerMaxHeal - healerMinHeal + 1)) + healerMinHeal;
                    player.hp = Math.min(player.maxHp, player.hp + healAmount);
                    floatingTexts.push({
                        x: player.x,
                        y: player.y - 20,
                        text: `+${healAmount}`,
                        color: '#2ecc71',
                        life: 120
                    });
                }
                healthSpan.innerText = player.hp;
                updateHealthColor();
                healers.splice(i, 1);
                if (player.hp <= 0) {
                    gameOver = true;
                    respawnTimer = 5;
                }
            }
        }

        // Bouncers
        for (let i = bouncers.length - 1; i >= 0; i--) {
            const b = bouncers[i];
            const hitRadius = b.radius * HITBOX_SCALE * 1.2;
            const dx = player.x - b.x;
            const dy = player.y - b.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < playerRadius + hitRadius) {
                let damage;
                if (genderWikiActive) {
                    damage = 1;
                } else {
                    if (b.state === 'falling2') {
                        if (player.hp > player.maxHp * 0.3) {
                            damage = Math.floor(Math.random() * (17 - 12 + 1)) + 12;
                        } else {
                            damage = Math.floor(Math.random() * (8 - 6 + 1)) + 6;
                        }
                    } else {
                        damage = 5;
                    }
                }
                player.hp = Math.max(0, player.hp - damage);
                healthSpan.innerText = player.hp;
                updateHealthColor();
                floatingTexts.push({
                    x: player.x,
                    y: player.y - 20,
                    text: `-${damage}`,
                    color: '#ff6b6b',
                    life: 120
                });
                bouncers.splice(i, 1);
                if (player.hp <= 0) {
                    gameOver = true;
                    respawnTimer = 5;
                }
            }
        }
    }

    // ---------- Обновление объектов ----------
    function updateObjects() {
        for (let e of enemies) {
            e.y += e.speed;
        }
        enemies = enemies.filter(e => e.y - e.radius < gameHeight + 30);

        for (let h of healers) {
            h.y += h.speed;
        }
        healers = healers.filter(h => h.y - h.radius < gameHeight + 30);

        for (let b of bouncers) {
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 3) b.trail.shift();

            switch (b.state) {
                case 'falling':
                    b.y += b.currentSpeed;
                    if (b.y - b.startY > gameHeight * BOUNCER_FALL_DISTANCE) {
                        b.state = 'waiting';
                        b.waitTimer = BOUNCER_WAIT_TIME;
                        b.riseDistance = gameHeight * BOUNCER_RISE_DISTANCE;
                    }
                    break;
                case 'waiting':
                    b.waitTimer--;
                    if (b.waitTimer <= 0) {
                        b.state = 'rising';
                    }
                    break;
                case 'rising':
                    b.y -= b.currentSpeed * BOUNCER_RISE_SPEED_MULT;
                    if (b.startY - b.y > b.riseDistance) {
                        b.state = 'falling2';
                        b.currentSpeed = b.speed;
                        b.acceleration = BOUNCER_ACCELERATION;
                    }
                    break;
                case 'falling2':
                    b.currentSpeed += b.acceleration;
                    b.y += b.currentSpeed;
                    break;
            }
        }
        bouncers = bouncers.filter(b => b.y - b.radius < gameHeight + 30);
    }

    function updateFloatingTexts() {
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            floatingTexts[i].life--;
            if (floatingTexts[i].life <= 0) {
                floatingTexts.splice(i, 1);
            } else {
                floatingTexts[i].y -= 0.5;
            }
        }
    }

    // ---------- Цвет HP ----------
    function updateHealthColor() {
        const percent = player.hp / player.maxHp;
        const red = Math.min(255, 255 + Math.floor(255 * (1 - percent)));
        const green = Math.min(255, Math.floor(255 * percent));
        healthSpan.style.color = `rgb(${red}, ${green}, 100)`;
    }

    // ---------- Функция для рисования многострочного текста по центру ----------
    function drawWrappedText(text, x, y, maxWidth, lineHeight, color, fontSize = 36) {
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.textAlign = 'center';

        const words = text.split(' ');
        let lines = [];
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            const testLine = currentLine + ' ' + words[i];
            const metrics = ctx.measureText(testLine);
            if (metrics.width > maxWidth) {
                lines.push(currentLine);
                currentLine = words[i];
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);

        const totalHeight = lines.length * lineHeight;
        let startY = y - totalHeight / 2 + lineHeight / 2;

        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, startY + i * lineHeight);
        }

        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
    }

    // ---------- Отрисовка ----------
    function drawGame() {
        if (!ctx || !gameWidth || !gameHeight) return;

        ctx.clearRect(0, 0, gameWidth, gameHeight);

        function drawObject(x, y, radius, color, isBouncer = false) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;

            if (isBouncer) {
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(1, 1.5);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, 2 * Math.PI);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, 2 * Math.PI);
            }
            ctx.fillStyle = color;
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1.2;

            if (isBouncer) {
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(1, 1.5);
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, 2 * Math.PI);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, 2 * Math.PI);
            }
            ctx.stroke();

            ctx.shadowColor = 'transparent';
        }

        // Игрок
        let playerColor = genderWikiActive ? '#ff8c42' : '#4a3aff'; // оранжевый
        drawObject(player.x, player.y, player.radius, playerColor);

        // Обычные враги
        for (let e of enemies) {
            drawObject(e.x, e.y, e.radius, '#ff6b6b');
        }

        // Лекари
        for (let h of healers) {
            drawObject(h.x, h.y, h.radius, '#2ecc71');
        }

        // Bouncers
        for (let b of bouncers) {
            for (let i = 0; i < b.trail.length; i++) {
                const t = b.trail[i];
                const alpha = 0.15 * (i / b.trail.length);
                ctx.globalAlpha = alpha;
                drawObject(t.x, t.y, b.radius, '#ff8c42', true);
            }
            ctx.globalAlpha = 1.0;
            drawObject(b.x, b.y, b.radius, '#ff8c42', true);
        }

        // Тексты (floating)
        for (let t of floatingTexts) {
            ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillStyle = t.color;
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 5;
            ctx.globalAlpha = t.life / 120;
            ctx.fillText(t.text, t.x - 20, t.y);
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1.0;

        // Состояния игры (центрированные надписи с переносом)
        ctx.textAlign = 'center';
        if (gameOver) {
            drawWrappedText('Вы умер', gameWidth/2, gameHeight/2 - 40, gameWidth - 40, 50, getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e', 48);
            ctx.font = 'bold 72px -apple-system, sans-serif';
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 10;
            ctx.fillText(Math.ceil(respawnTimer), gameWidth/2, gameHeight/2 + 50);
            ctx.shadowBlur = 0;
        } else if (paused) {
            drawWrappedText('ПАУЗА', gameWidth/2, gameHeight/2, gameWidth - 40, 50, getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e', 48);
        }
        ctx.textAlign = 'left';
    }

    // ---------- Игровой цикл ----------
    function gameLoop() {
        if (!paused && !gameOver && gameWidth && gameHeight) {
            if (Math.random() < enemySpawnRate * gameSpeed) spawnEnemy();
            if (Math.random() < bouncerSpawnRate * gameSpeed) spawnBouncer();
            if (Math.random() < healerSpawnRate * gameSpeed) spawnHealer();

            updatePlayerPosition();
            updateObjects();
            checkCollisions();
            updateFloatingTexts();
        } else if (gameOver) {
            respawnTimer -= 1/60;
            if (respawnTimer <= 0) {
                player.hp = player.maxHp;
                healthSpan.innerText = player.hp;
                updateHealthColor();
                enemies = [];
                healers = [];
                bouncers = [];
                floatingTexts = [];
                gameOver = false;
                if (genderWikiActive) {
                    genderWikiActive = false;
                    player.maxHp = 90;
                    if (player.hp > 90) player.hp = 90;
                    healthSpan.innerText = player.hp;
                    updateHealthColor();
                    player.speed = player.baseSpeed;
                }
            }
        }

        drawGame();
        requestAnimationFrame(gameLoop);
    }

    gameLoop();

    // ---------- Пауза ----------
    pauseBtn.addEventListener('click', () => {
        if (gameOver) {
            player.hp = player.maxHp;
            healthSpan.innerText = player.hp;
            updateHealthColor();
            enemies = [];
            healers = [];
            bouncers = [];
            floatingTexts = [];
            gameOver = false;
            if (genderWikiActive) {
                genderWikiActive = false;
                player.maxHp = 90;
                if (player.hp > 90) player.hp = 90;
                healthSpan.innerText = player.hp;
                updateHealthColor();
                player.speed = player.baseSpeed;
            }
        } else {
            paused = !paused;
            if (paused) {
                floatingTexts = [];
            }
        }
        pauseIcon.className = paused ? 'fas fa-play' : 'fas fa-pause';
    });

    // ---------- Скорость игры ----------
    speedBtn.addEventListener('click', () => {
        speedIndex = (speedIndex + 1) % speedOptions.length;
        gameSpeed = speedOptions[speedIndex];
        speedBtn.textContent = `x${gameSpeed}`;
    });

    // ---------- Пасхалки ----------
    healthPanel.addEventListener('click', () => {
        if (paused || gameOver) return;
        tapCount++;

        if (tapCount === 10 && !tapMessageShown) {
            tapMessageShown = true;
            floatingTexts.push({
                x: gameWidth / 2,
                y: gameHeight / 2,
                text: 'Тап тап тап',
                color: '#ffffff',
                life: 240
            });
        }

        if (tapCount === 19 && !genderWikiActive) {
            genderWikiActive = true;
            player.maxHp = 160;
            player.hp = 160;
            player.speed = player.baseSpeed * 1.85;
            healthSpan.innerText = player.hp;
            updateHealthColor();
            floatingTexts.push({
                x: gameWidth / 2,
                y: gameHeight / 2,
                text: 'РЕЖИМ ГЕНДЕР ВИКИ АКТИВИРОВАН',
                color: '#ffd700',
                life: 240
            });
            tapsAfterActivation = 0;
        }

        if (genderWikiActive) {
            tapsAfterActivation++;
            if (tapsAfterActivation === 15) {
                genderWikiActive = false;
                player.maxHp = 90;
                if (player.hp > 90) player.hp = 90;
                healthSpan.innerText = player.hp;
                updateHealthColor();
                player.speed = player.baseSpeed;
                floatingTexts.push({
                    x: gameWidth / 2,
                    y: gameHeight / 2,
                    text: 'Вы снова ограниченный непотуга',
                    color: '#ff6b6b',
                    life: 240
                });
            }
        }
    });

    // ---------- Service Worker ----------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW not registered'));
        });
    }
})();
