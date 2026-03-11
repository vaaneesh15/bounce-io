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
    }

    themeToggle.addEventListener('click', () => {
        if (currentTheme === 'light') setTheme('dark');
        else if (currentTheme === 'dark') setTheme('system');
        else setTheme('light');
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    applyTheme();

    // ---------- Игровые переменные ----------
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const joystickCanvas = document.getElementById('joystick-canvas');
    const jCtx = joystickCanvas.getContext('2d');
    const healthSpan = document.getElementById('health-display');
    const pauseBtn = document.getElementById('pause-btn');
    const pauseIcon = document.getElementById('pause-icon');

    // Размеры игрового поля (будут установлены после изменения размера)
    let gameWidth, gameHeight;

    // Параметры игрока
    const player = {
        x: 0, y: 0,
        radius: 25,
        hp: 90,
        maxHp: 90
    };

    // Управление джойстиком
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
    let enemies = [];        // враги (красные)
    let healers = [];        // лекари (зелёные)
    let floatingTexts = [];  // тексты (+15, -7 и т.д.)

    // Настройки спавна
    const enemySpawnRate = 0.02;     // вероятность спавна врага за кадр
    const healerSpawnRate = 0.003;   // вероятность спавна лекаря за кадр
    const enemySpeed = 2;
    const healerSpeed = 2;
    const enemyDamage = 7;
    const healerMinHeal = 15;
    const healerMaxHeal = 19;

    // Флаги
    let paused = false;
    let gameOver = false;
    let gameLoopId = null;

    // ---------- Функции инициализации и изменения размера ----------
    function resizeGame() {
        const gameArea = document.querySelector('.game-area');
        const rect = gameArea.getBoundingClientRect();
        gameWidth = rect.width;
        gameHeight = rect.height;
        canvas.width = gameWidth;
        canvas.height = gameHeight;

        // Позиционируем игрока по центру внизу, но над джойстиком
        player.x = gameWidth / 2;
        player.y = gameHeight - 80;
    }

    window.addEventListener('resize', resizeGame);
    resizeGame();

    // ---------- Джойстик: рисование и события ----------
    function drawJoystick() {
        jCtx.clearRect(0, 0, 200, 200);
        // База
        jCtx.beginPath();
        jCtx.arc(joystick.centerX, joystick.centerY, joystick.baseRadius, 0, 2 * Math.PI);
        jCtx.fillStyle = 'rgba(255,255,255,0.2)';
        jCtx.fill();
        jCtx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4a3aff';
        jCtx.lineWidth = 3;
        jCtx.stroke();

        // Ручка
        jCtx.beginPath();
        jCtx.arc(joystick.handleX, joystick.handleY, joystick.handleRadius, 0, 2 * Math.PI);
        jCtx.fillStyle = getComputedStyle(document.body).getPropertyValue('--joystick-handle').trim() || '#4a3aff';
        jCtx.fill();
        jCtx.shadowColor = 'rgba(0,0,0,0.3)';
        jCtx.shadowBlur = 10;
        jCtx.fill();
        jCtx.shadowBlur = 0;
    }

    // Обработка касаний/мыши на джойстике
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
        // Проверяем, попали ли в область ручки или базы
        const dx = canvasX - joystick.centerX;
        const dy = canvasY - joystick.centerY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist <= joystick.baseRadius + 20) { // захватываем если рядом
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
        // Ограничиваем расстояние от центра радиусом базы
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
        // Сохраняем нормализованное направление
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

    drawJoystick();

    // ---------- Игровая логика ----------
    function spawnEnemy() {
        const x = Math.random() * (gameWidth - 40) + 20;
        enemies.push({
            x: x,
            y: 20,
            radius: 18,
            speed: enemySpeed,
            type: 'enemy'
        });
    }

    function spawnHealer() {
        const x = Math.random() * (gameWidth - 30) + 15;
        healers.push({
            x: x,
            y: 20,
            radius: 15,
            speed: healerSpeed,
            type: 'healer'
        });
    }

    function updatePlayerPosition() {
        // Скорость движения игрока
        const speed = 5;
        player.x += joystick.dx * speed;
        player.y += joystick.dy * speed;
        // Ограничение в пределах canvas с учётом радиуса
        player.x = Math.max(player.radius, Math.min(gameWidth - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(gameHeight - player.radius, player.y));
    }

    function checkCollisions() {
        // Враги
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < player.radius + e.radius) {
                // Урон
                player.hp = Math.max(0, player.hp - enemyDamage);
                healthSpan.innerText = player.hp;
                // Создаём текстовый эффект
                floatingTexts.push({
                    x: player.x,
                    y: player.y - 20,
                    text: `-${enemyDamage}`,
                    color: '#ff6b6b',
                    life: 120 // кадров (2 сек при 60 fps)
                });
                // Удаляем врага
                enemies.splice(i, 1);
                if (player.hp <= 0) {
                    gameOver = true;
                    paused = true; // останавливаем игру
                }
            }
        }
        // Лекари
        for (let i = healers.length - 1; i >= 0; i--) {
            const h = healers[i];
            const dx = player.x - h.x;
            const dy = player.y - h.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < player.radius + h.radius) {
                // Лечение
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
    }

    function updateFloatingTexts() {
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            floatingTexts[i].life--;
            if (floatingTexts[i].life <= 0) {
                floatingTexts.splice(i, 1);
            } else {
                // поднимаем чуть вверх
                floatingTexts[i].y -= 0.5;
            }
        }
    }

    function updateObjects() {
        // Двигаем врагов вниз
        for (let e of enemies) {
            e.y += e.speed;
        }
        // Двигаем лекарей вниз
        for (let h of healers) {
            h.y += h.speed;
        }
        // Удаляем улетевшие за экран
        enemies = enemies.filter(e => e.y - e.radius < gameHeight);
        healers = healers.filter(h => h.y - h.radius < gameHeight);
    }

    // ---------- Отрисовка ----------
    function drawGame() {
        ctx.clearRect(0, 0, gameWidth, gameHeight);

        // Игрок
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#4a3aff';
        ctx.shadowColor = 'rgba(74,58,255,0.5)';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Враги
        for (let e of enemies) {
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#ff6b6b';
            ctx.shadowColor = 'rgba(255,107,107,0.5)';
            ctx.shadowBlur = 10;
            ctx.fill();
        }

        // Лекари
        for (let h of healers) {
            ctx.beginPath();
            ctx.arc(h.x, h.y, h.radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#2ecc71';
            ctx.shadowColor = 'rgba(46,204,113,0.5)';
            ctx.shadowBlur = 10;
            ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Тексты (урон/лечение)
        for (let t of floatingTexts) {
            ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, sans-serif';
            ctx.fillStyle = t.color;
            ctx.globalAlpha = t.life / 120; // затухание
            ctx.fillText(t.text, t.x - 20, t.y);
        }
        ctx.globalAlpha = 1.0;

        // Если game over
        if (gameOver) {
            ctx.font = 'bold 40px -apple-system, sans-serif';
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', gameWidth/2, gameHeight/2);
        } else if (paused) {
            ctx.font = 'bold 40px -apple-system, sans-serif';
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#1a1a2e';
            ctx.textAlign = 'center';
            ctx.fillText('ПАУЗА', gameWidth/2, gameHeight/2);
        }
        ctx.textAlign = 'left';
    }

    // ---------- Игровой цикл ----------
    function gameLoop() {
        if (!paused && !gameOver) {
            // Спавн
            if (Math.random() < enemySpawnRate) spawnEnemy();
            if (Math.random() < healerSpawnRate) spawnHealer();

            updatePlayerPosition();
            updateObjects();
            checkCollisions();
            updateFloatingTexts();
        }

        drawGame();
        requestAnimationFrame(gameLoop);
    }

    // Запуск цикла
    gameLoop();

    // ---------- Пауза ----------
    pauseBtn.addEventListener('click', () => {
        if (gameOver) {
            // Перезапуск игры
            player.hp = player.maxHp;
            healthSpan.innerText = player.hp;
            enemies = [];
            healers = [];
            floatingTexts = [];
            gameOver = false;
            paused = false;
        } else {
            paused = !paused;
        }
        pauseIcon.className = paused ? 'fas fa-play' : 'fas fa-pause';
    });

    // Если игра закончилась, показываем кнопку паузы как рестарт
    function checkGameOver() {
        if (gameOver) {
            pauseIcon.className = 'fas fa-undo-alt'; // иконка перезапуска
        } else {
            pauseIcon.className = paused ? 'fas fa-play' : 'fas fa-pause';
        }
    }

    // Дополнительно обновляем иконку паузы при gameOver
    setInterval(checkGameOver, 100); // или можно вызывать при изменении gameOver

    // ---------- Service Worker (опционально) ----------
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW not registered'));
        });
    }
})();
