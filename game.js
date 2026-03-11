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

    let gameWidth, gameHeight;

    // Параметры игрока
    const player = {
        x: 0, y: 0,
        radius: 14,
        hp: 90,
        maxHp: 90
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
    const baseSpeed = 2;
    const enemyDamage = 7;
    const healerMinHeal = 15;
    const healerMaxHeal = 19;

    // Параметры для нового врага (оранжевый, вытянутый)
    const BOUNCER_FALL_DISTANCE = 0.15;        // 15% пути до остановки
    const BOUNCER_RISE_DISTANCE = 0.07;        // 7% пути вверх
    const BOUNCER_WAIT_TIME = 90;               // 1.5 сек при 60fps
    const BOUNCER_RISE_SPEED_MULT = 1.5;        // скорость подъёма выше
    const BOUNCER_ACCELERATION = 0.05;          // ускорение при падении после отскока

    // Флаги
    let paused = false;
    let gameOver = false;

    // ---------- Инициализация и ресайз ----------
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

    // ---------- Функции спавна ----------
    function getRandomX() {
        const margin = 40;
        return Math.random() * (gameWidth + 2 * margin) - margin;
    }

    function spawnEnemy() {
        enemies.push({
            x: getRandomX(),
            y: -20,
            radius: 14,
            speed: baseSpeed,
            type: 'enemy'
        });
    }

    function spawnHealer() {
        healers.push({
            x: getRandomX(),
            y: -20,
            radius: 12,
            speed: baseSpeed,
            type: 'healer'
        });
    }

    function spawnBouncer() {
        bouncers.push({
            x: getRandomX(),
            y: -20,
            radius: 12,           // чуть меньше для вытянутой формы
            speed: baseSpeed,
            type: 'bouncer',
            state: 'falling',
            waitTimer: 0,
            riseDistance: 0,
            startY: 0,
            trail: [],
            currentSpeed: baseSpeed, // текущая скорость (для ускорения)
            acceleration: 0        // накопленное ускорение
        });
    }

    // ---------- Обновление ----------
    function updatePlayerPosition() {
        const speed = 5;
        player.x += joystick.dx * speed;
        player.y += joystick.dy * speed;
        player.x = Math.max(player.radius, Math.min(gameWidth - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(gameHeight - player.radius, player.y));
    }

    function checkCollisions() {
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < player.radius + e.radius) {
                player.hp = Math.max(0, player.hp - enemyDamage);
                healthSpan.innerText = player.hp;
                floatingTexts.push({
                    x: player.x,
                    y: player.y - 20,
                    text: `-${enemyDamage}`,
                    color: '#ff6b6b',
                    life: 120
                });
                enemies.splice(i, 1);
                if (player.hp <= 0) gameOver = true;
            }
        }

        for (let i = healers.length - 1; i >= 0; i--) {
            const h = healers[i];
            const dx = player.x - h.x;
            const dy = player.y - h.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < player.radius + h.radius) {
                const healAmount = Math.floor(Math.random() * (healerMaxHeal - healerMinHeal + 1)) + healerMinHeal;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                healthSpan.innerText = player.hp;
                floatingTexts.push({
                    x: player.x,
                    y: player.y - 20,
                    text: `+${healAmount}`,
                    color: '#2ecc71',
                    life: 120
                });
                healers.splice(i, 1);
            }
        }

        for (let i = bouncers.length - 1; i >= 0; i--) {
            const b = bouncers[i];
            // для проверки столкновения используем bounding circle приблизительно
            const dx = player.x - b.x;
            const dy = player.y - b.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            // из-за эллиптической формы используем радиус как среднее
            const collisionRadius = b.radius * 1.2;
            if (dist < player.radius + collisionRadius) {
                player.hp = Math.max(0, player.hp - enemyDamage);
                healthSpan.innerText = player.hp;
                floatingTexts.push({
                    x: player.x,
                    y: player.y - 20,
                    text: `-${enemyDamage}`,
                    color: '#ff6b6b',
                    life: 120
                });
                bouncers.splice(i, 1);
                if (player.hp <= 0) gameOver = true;
            }
        }
    }

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
            // Сохраняем след
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 5) b.trail.shift();

            switch (b.state) {
                case 'falling':
                    b.y += b.speed;
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
                    b.y -= b.speed * BOUNCER_RISE_SPEED_MULT;
                    if (b.startY - b.y > b.riseDistance) {
                        b.state = 'falling2';
                        // Сброс скорости для падения с ускорением
                        b.currentSpeed = b.speed;
                        b.acceleration = BOUNCER_ACCELERATION;
                    }
                    break;
                case 'falling2':
                    // Ускоренное падение
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

    // ---------- Отрисовка с обводкой и свечением ----------
    function drawGame() {
        if (!ctx || !gameWidth || !gameHeight) return;

        ctx.clearRect(0, 0, gameWidth, gameHeight);

        // Функция отрисовки объекта с обводкой и свечением
        function drawObject(x, y, radius, color, strokeColor = null, isBouncer = false) {
            // Свечение
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;

            if (isBouncer) {
                // Вытянутый эллипс для bouncer
                ctx.save();
                ctx.translate(x, y);
                ctx.scale(1, 1.5); // вытягиваем по вертикали
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, 2 * Math.PI);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, 2 * Math.PI);
            }
            ctx.fillStyle = color;
            ctx.fill();

            // Обводка (аккуратная, сочетающаяся)
            ctx.shadowBlur = 10;
            ctx.strokeStyle = strokeColor || color;
            ctx.lineWidth = 2;
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

            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }

        // Игрок
        drawObject(player.x, player.y, player.radius, '#4a3aff', '#a09bff');

        // Обычные враги
        for (let e of enemies) {
            drawObject(e.x, e.y, e.radius, '#ff6b6b', '#ffa0a0');
        }

        // Лекари
        for (let h of healers) {
            drawObject(h.x, h.y, h.radius, '#2ecc71', '#a0e0a0');
        }

        // Новые враги (оранжевые, вытянутые)
        for (let b of bouncers) {
            // След
            for (let i = 0; i < b.trail.length; i++) {
                const t = b.trail[i];
                const alpha = 0.3 * (i / b.trail.length);
                ctx.globalAlpha = alpha;
                drawObject(t.x, t.y, b.radius, '#ff8c42', '#ffb07c', true);
            }
            ctx.globalAlpha = 1.0;
            drawObject(b.x, b.y, b.radius, '#ff8c42', '#ffb07c', true);
        }

        // Тексты
        for (let t of floatingTexts) {
            ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillStyle = t.color;
            ctx.shadowColor = t.color;
            ctx.shadowBlur = 10;
            ctx.globalAlpha = t.life / 120;
            ctx.fillText(t.text, t.x - 20, t.y);
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1.0;

        // Состояния игры
        if (gameOver) {
            ctx.font = 'bold 40px -apple-system, sans-serif';
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 15;
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', gameWidth/2, gameHeight/2);
        } else if (paused) {
            ctx.font = 'bold 40px -apple-system, sans-serif';
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 15;
            ctx.textAlign = 'center';
            ctx.fillText('ПАУЗА', gameWidth/2, gameHeight/2);
        }
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
    }

    // ---------- Игровой цикл ----------
    function gameLoop() {
        if (!paused && !gameOver && gameWidth && gameHeight) {
            if (Math.random() < enemySpawnRate) spawnEnemy();
            if (Math.random() < bouncerSpawnRate) spawnBouncer();
            if (Math.random() < healerSpawnRate) spawnHealer();

            updatePlayerPosition();
            updateObjects();
            checkCollisions();
            updateFloatingTexts();
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
            enemies = [];
            healers = [];
            bouncers = [];
            floatingTexts = [];
            gameOver = false;
            paused = false;
        } else {
            paused = !paused;
        }
        pauseIcon.className = paused ? 'fas fa-play' : 'fas fa-pause';
    });

    // ---------- Service Worker ----------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW not registered'));
        });
    }
})();