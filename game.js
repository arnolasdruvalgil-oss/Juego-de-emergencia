/* =========================================================
   Mochila al Hombro – Lógica del juego
   ========================================================= */
(() => {
  'use strict';

  /* ---------- CONFIGURACIÓN (puedes cambiar estos valores) ---------- */
  const GAME_TIME = 60;          // segundos de la partida
  const PENALTY = 5;             // segundos que se pierden al equivocarse
  const MAX_ERRORS = 3;          // errores que "llenan" la mochila de cosas inútiles
  const SPAWN_EVERY = 750;       // cada cuántos ms aparece un objeto nuevo
  const ITEM_LIFE = 3400;        // cuántos ms permanece un objeto en pantalla
  const POINTS_GOOD = 100;       // puntos por objeto correcto
  const POINTS_BAD = 50;         // puntos que se pierden por error
  const POINTS_TIME_BONUS = 5;   // puntos por cada segundo que sobre al ganar

  /* ---------- OBJETOS ---------- */
  const ITEMS = [
    // ✅ Correctos (obligatorios)
    { id: 'docs',      good: true,  emoji: '📄', name: 'Documentos',
      why: 'Tus documentos de identidad, dentro de una bolsa plástica sellada para que no se mojen ni se pierdan.' },
    { id: 'linterna',  good: true,  emoji: '🔦', name: 'Linterna',
      why: 'Con pilas de repuesto: si se va la luz o evacuas de noche, es tu mejor aliada.' },
    { id: 'radio',     good: true,  emoji: '📻', name: 'Radio portátil',
      why: 'Fundamental para escuchar los reportes oficiales del Servicio Geológico Colombiano.' },
    { id: 'botiquin',  good: true,  emoji: '🩹', name: 'Botiquín',
      why: 'Gasas, desinfectante y medicamentos esenciales para primeros auxilios.' },
    { id: 'agua',      good: true,  emoji: '💧', name: 'Agua embotellada',
      why: 'La ceniza puede afectar las fuentes de agua; lleva agua embotellada para beber.' },
    { id: 'tapabocas', good: true,  emoji: '😷', name: 'Tapabocas',
      why: 'Indispensables por la caída de ceniza volcánica: protegen tus vías respiratorias.' },
    { id: 'comida',    good: true,  emoji: '🥫', name: 'Alimentos no perecederos',
      why: 'Barras de cereal y enlatados: no necesitan nevera ni cocción.' },

    // ❌ Distractores
    { id: 'peluche',   good: false, emoji: '🧸', name: 'Peluche gigante',
      why: 'Ocupa espacio vital y pesa. En una evacuación cada gramo cuenta.' },
    { id: 'tacones',   good: false, emoji: '👠', name: 'Zapatos de tacón',
      why: 'Para evacuar necesitas calzado cómodo y resistente.' },
    { id: 'consola',   good: false, emoji: '🎮', name: 'Consola de videojuegos',
      why: 'Es valiosa, pero no es de primera necesidad en una emergencia volcánica.' },
    { id: 'laptop',    good: false, emoji: '💻', name: 'Laptop',
      why: 'Es valiosa, pero no es de primera necesidad en una emergencia volcánica.' },
    { id: 'ropa',      good: false, emoji: '👕', name: 'Ropa de todo el armario',
      why: 'Demasiado peso. Lleva solo lo necesario.' }
  ];

  const GOOD = ITEMS.filter(i => i.good);
  const BAD = ITEMS.filter(i => !i.good);
  const BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

  const LOSE_MSG =
    '¡Cuidado! Olvidaste elementos vitales como la radio o los documentos, o cargaste demasiado peso ' +
    'con cosas innecesarias. En una emergencia real en Puracé, esto pondría en riesgo tu seguridad. ¡Inténtalo de nuevo!';

  const ENDINGS = {
    win: {
      icon: '🏆',
      title: '¡Sobreviviste y evacuaste a tiempo!',
      reason: '',
      msg: '¡Excelente trabajo! Tu mochila está lista y tienes todo lo necesario para protegerte de la ceniza ' +
           'y los efectos de la alerta naranja. Estás preparado para seguir las rutas de evacuación seguras.'
    },
    time: {
      icon: '⏰',
      title: '¡Tiempo agotado!',
      reason: 'Se acabó el tiempo y tu mochila quedó incompleta.',
      msg: LOSE_MSG
    },
    heavy: {
      icon: '🏋️',
      title: '¡Mochila demasiado pesada!',
      reason: 'Cargaste demasiadas cosas inútiles y ya no podrías evacuar con agilidad.',
      msg: LOSE_MSG
    }
  };

  /* ---------- ELEMENTOS DEL DOM ---------- */
  const $ = id => document.getElementById(id);
  const screens = ['screen-start', 'screen-game', 'screen-result', 'screen-learn'];

  const $room = $('room');
  const $time = $('time-text');
  const $timeBox = $('time-box');
  const $timerFill = $('timer-fill');
  const $goal = $('goal-text');
  const $errors = $('errors-text');
  const $penalty = $('penalty-float');
  const $backpack = $('backpack');
  const $packFill = $('pack-fill');
  const $slots = $('slots');
  const $toast = $('toast');
  const $mute = $('btn-mute');

  /* ---------- ESTADO ---------- */
  let state = null;
  let previousScreen = 'screen-start';
  let toastTimer = null;
  const roomItems = new Map();   // botón -> { life: timeoutId }

  function newState() {
    return {
      running: false,
      ended: false,
      timeLeft: GAME_TIME * 1000,
      collected: new Set(),
      errors: 0,
      score: 0,
      last: 0,
      lastSecond: null,
      tickId: null,
      spawnId: null
    };
  }

  /* ---------- UTILIDADES ---------- */
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function show(id) {
    screens.forEach(s => $(s).classList.toggle('active', s === id));
    window.scrollTo(0, 0);
  }

  function restartAnimation(el, className, duration) {
    el.classList.remove(className);
    void el.offsetWidth;            // fuerza el reinicio de la animación
    el.classList.add(className);
    if (duration) setTimeout(() => el.classList.remove(className), duration);
  }

  function loadBest() {
    try { return parseInt(localStorage.getItem('mochila_best') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('mochila_best', String(v)); } catch (e) { /* sin almacenamiento */ }
  }

  /* ---------- SONIDO (WebAudio, sin archivos) ---------- */
  let audioCtx = null;
  let muted = false;

  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function beep(freq, dur = 0.12, type = 'sine', vol = 0.08, delay = 0) {
    if (muted || !audioCtx) return;
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function sfx(name) {
    switch (name) {
      case 'good': beep(660, 0.1); beep(880, 0.14, 'sine', 0.08, 0.09); break;
      case 'bad':  beep(160, 0.3, 'sawtooth', 0.09); break;
      case 'tick': beep(1000, 0.05, 'square', 0.04); break;
      case 'win':  [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', 0.09, i * 0.14)); break;
      case 'lose': [400, 330, 260, 180].forEach((f, i) => beep(f, 0.22, 'sawtooth', 0.07, i * 0.16)); break;
    }
  }

  /* ---------- HUD ---------- */
  function updateHud() {
    const secs = Math.ceil(state.timeLeft / 1000);
    const pct = Math.max(0, state.timeLeft / (GAME_TIME * 1000));

    $time.textContent = secs;
    $timerFill.style.width = (pct * 100) + '%';
    $timerFill.style.background = 'hsl(' + Math.round(pct * 120) + ', 85%, 48%)';   // verde -> amarillo -> rojo
    $timeBox.classList.toggle('danger', secs <= 10);

    if (secs !== state.lastSecond) {
      state.lastSecond = secs;
      if (secs <= 10 && secs > 0 && state.running) sfx('tick');
    }

    $goal.textContent = state.collected.size + '/' + GOOD.length;
    $errors.textContent = state.errors + '/' + MAX_ERRORS;
  }

  function toast(msg, bad) {
    $toast.textContent = msg;
    $toast.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
  }

  /* ---------- MOCHILA ---------- */
  function buildSlots() {
    $slots.innerHTML = '';
    GOOD.forEach(g => {
      const s = document.createElement('div');
      s.className = 'slot';
      s.dataset.id = g.id;
      s.textContent = '?';
      $slots.appendChild(s);
    });
    $backpack.style.setProperty('--fill', 0);
    $packFill.style.width = '0%';
  }

  function fillSlot(id) {
    const slot = $slots.querySelector('[data-id="' + id + '"]');
    if (!slot) return;
    slot.textContent = BY_ID[id].emoji;
    slot.title = BY_ID[id].name;
    slot.classList.add('full');
  }

  function flyToBackpack(btn, data) {
    const from = btn.getBoundingClientRect();
    const to = $backpack.getBoundingClientRect();

    const fly = document.createElement('div');
    fly.className = 'fly';
    fly.textContent = data.emoji;
    fly.style.left = (from.left + from.width / 2) + 'px';
    fly.style.top = (from.top + from.height / 2) + 'px';
    document.body.appendChild(fly);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      fly.style.left = (to.left + to.width / 2) + 'px';
      fly.style.top = (to.top + to.height / 2) + 'px';
      fly.style.transform = 'translate(-50%, -50%) scale(0.4)';
      fly.style.opacity = '0.5';
    }));

    setTimeout(() => {
      fly.remove();
      fillSlot(data.id);
      restartAnimation($backpack, 'pop', 400);
    }, 650);
  }

  /* ---------- OBJETOS EN LA HABITACIÓN ---------- */
  function spawnItem() {
    if (!state || !state.running) return;

    const maxOnScreen = window.innerWidth < 700 ? 5 : 6;
    if (roomItems.size >= maxOnScreen) return;

    const onScreen = new Set([...roomItems.keys()].map(n => n.dataset.id));
    const needed = GOOD.filter(g => !state.collected.has(g.id) && !onScreen.has(g.id));

    // 60 % de las veces sale un objeto que aún falta; si no, un distractor
    let pool;
    if (needed.length && Math.random() < 0.6) {
      pool = needed;
    } else {
      pool = BAD.filter(b => !onScreen.has(b.id));
      if (!pool.length) pool = needed;
    }
    if (!pool.length) return;

    const data = pick(pool);

    // Posición aleatoria evitando que se encimen
    const itemW = window.innerWidth < 700 ? 80 : 92;
    const itemH = 92;
    const maxX = Math.max(0, $room.clientWidth - itemW);
    const maxY = Math.max(0, $room.clientHeight - itemH);
    let x = 0, y = 0, ok = false;
    for (let t = 0; t < 25 && !ok; t++) {
      x = Math.random() * maxX;
      y = Math.random() * maxY;
      ok = [...roomItems.keys()].every(n => Math.hypot(n.offsetLeft - x, n.offsetTop - y) > 100);
    }
    if (!ok) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item';
    btn.dataset.id = data.id;
    btn.style.left = Math.round(x) + 'px';
    btn.style.top = Math.round(y) + 'px';
    btn.innerHTML = '<span class="emoji">' + data.emoji + '</span><span class="name">' + data.name + '</span>';
    btn.addEventListener('click', () => onItemClick(btn));

    const life = setTimeout(() => expireItem(btn), ITEM_LIFE);
    roomItems.set(btn, { life });
    $room.appendChild(btn);
  }

  function expireItem(btn) {
    if (!roomItems.has(btn)) return;
    roomItems.delete(btn);
    btn.disabled = true;
    btn.classList.add('leaving');
    setTimeout(() => btn.remove(), 380);
  }

  function clearRoom() {
    roomItems.forEach((info, btn) => { clearTimeout(info.life); btn.remove(); });
    roomItems.clear();
  }

  function onItemClick(btn) {
    if (!state || !state.running || btn.disabled) return;
    const info = roomItems.get(btn);
    if (!info) return;

    clearTimeout(info.life);
    roomItems.delete(btn);
    btn.disabled = true;

    const data = BY_ID[btn.dataset.id];
    if (data.good) collect(btn, data);
    else mistake(btn, data);
  }

  function collect(btn, data) {
    state.collected.add(data.id);
    state.score += POINTS_GOOD;
    sfx('good');
    toast('✅ ' + data.name + ': ' + data.why, false);

    flyToBackpack(btn, data);
    btn.remove();

    const fill = state.collected.size / GOOD.length;
    $backpack.style.setProperty('--fill', fill);
    $packFill.style.width = (fill * 100) + '%';
    updateHud();

    if (state.collected.size === GOOD.length) {
      state.running = false;
      stopLoops();
      setTimeout(() => endGame('win'), 900);
    }
  }

  function mistake(btn, data) {
    state.errors++;
    state.score = Math.max(0, state.score - POINTS_BAD);
    state.timeLeft = Math.max(0, state.timeLeft - PENALTY * 1000);

    btn.classList.add('wrong');
    setTimeout(() => btn.remove(), 700);

    sfx('bad');
    toast('❌ ' + data.name + ': ' + data.why, true);
    restartAnimation($penalty, 'show', 900);
    restartAnimation($room, 'shake', 400);
    updateHud();

    if (state.errors >= MAX_ERRORS) {
      state.running = false;
      stopLoops();
      setTimeout(() => endGame('heavy'), 800);
    }
  }

  /* ---------- BUCLE DEL JUEGO ---------- */
  function tick() {
    if (!state.running) return;
    const now = performance.now();
    const dt = Math.min(now - state.last, 250);
    state.last = now;
    state.timeLeft -= dt;

    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      updateHud();
      endGame('time');
      return;
    }
    updateHud();
  }

  function stopLoops() {
    clearInterval(state.tickId);
    clearInterval(state.spawnId);
  }

  function startGame() {
    ensureAudio();
    if (state) { stopLoops(); }
    clearRoom();

    state = newState();
    buildSlots();
    show('screen-game');
    updateHud();

    state.running = true;
    state.last = performance.now();
    state.tickId = setInterval(tick, 100);
    state.spawnId = setInterval(spawnItem, SPAWN_EVERY);
    spawnItem(); spawnItem(); spawnItem();
  }

  /* ---------- FIN DEL JUEGO ---------- */
  function endGame(reason) {
    if (!state || state.ended) return;
    state.ended = true;
    state.running = false;
    stopLoops();
    clearRoom();

    const win = reason === 'win';
    const end = ENDINGS[reason];
    const secsLeft = Math.ceil(state.timeLeft / 1000);

    if (win) state.score += secsLeft * POINTS_TIME_BONUS;

    let best = loadBest();
    if (win && state.score > best) { best = state.score; saveBest(best); }

    $('result-icon').textContent = end.icon;
    $('result-title').textContent = end.title;
    $('result-reason').textContent = end.reason;
    $('result-reason').style.display = end.reason ? '' : 'none';
    $('result-msg').textContent = end.msg;

    $('result-stats').innerHTML =
      '<div class="stat"><b>' + state.score + '</b><span>Puntaje</span></div>' +
      '<div class="stat"><b>' + state.collected.size + '/' + GOOD.length + '</b><span>Objetos vitales</span></div>' +
      '<div class="stat"><b>' + state.errors + '/' + MAX_ERRORS + '</b><span>Errores</span></div>' +
      '<div class="stat"><b>' + secsLeft + ' s</b><span>Tiempo restante</span></div>' +
      (best ? '<div class="stat"><b>' + best + '</b><span>Mejor puntaje</span></div>' : '');

    $('result-review').innerHTML = GOOD.map(g => {
      const got = state.collected.has(g.id);
      return '<li class="' + (got ? 'ok' : 'miss') + '">' +
        '<span>' + (got ? '✅' : '❌') + '</span>' +
        '<div><strong>' + g.emoji + ' ' + g.name + '</strong><small>' + g.why + '</small></div>' +
        '</li>';
    }).join('');

    sfx(win ? 'win' : 'lose');
    show('screen-result');
  }

  /* ---------- NAVEGACIÓN ---------- */
  function openLearn(from) {
    previousScreen = from;
    show('screen-learn');
  }

  $('btn-start').addEventListener('click', startGame);
  $('btn-retry').addEventListener('click', startGame);
  $('btn-learn-start').addEventListener('click', () => openLearn('screen-start'));
  $('btn-learn-result').addEventListener('click', () => openLearn('screen-result'));
  $('btn-learn-back').addEventListener('click', () => show(previousScreen));

  $mute.addEventListener('click', () => {
    muted = !muted;
    $mute.textContent = muted ? '🔇' : '🔊';
    if (!muted) { ensureAudio(); sfx('good'); }
  });
})();