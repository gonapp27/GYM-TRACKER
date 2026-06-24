(() => {
  'use strict';

  const APP_VERSION = '5.0.0';
  const DB_NAME = 'gonzaloGymTrackerV5DB';
  const STORE = 'kv';
  const STATE_KEY = 'state';
  const LS_MIRROR = 'gonzaloGymTrackerV5_mirror';
  const LEGACY_KEYS = ['gonzaloGymTrackerV4', 'gonzaloGymTrackerV3'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const view = $('#view');
  const onlineStatus = $('#onlineStatus');

  let state = null;
  let currentTab = 'today';
  let currentGymDraft = null;
  let timerInterval = null;
  let timerRemaining = 0;
  let saveQueue = Promise.resolve();

  const todayISO = () => new Date().toISOString().slice(0, 10);
  const nowISO = () => new Date().toISOString();
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const num = (v, fallback = 0) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  };
  const fmt = (n, digits = 0) => Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const escapeHtml = (str) => String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const dateLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
  const downloadNameDate = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  function defaultRoutine() {
    return {
      A: {
        name: 'Full body fuerza',
        notes: 'Día fuerte pero limpio. Técnica > ego. Deja 1-2 reps en recámara si vienes cargado de tenis.',
        exercises: [
          { name: 'Sentadilla / prensa', target: '3-4 x 6-10', rest: 120, notes: 'Controla bajada y apoyo.' },
          { name: 'Press banca / mancuernas', target: '3-4 x 6-10', rest: 120, notes: 'Escápulas firmes.' },
          { name: 'Remo barra / mancuerna', target: '3-4 x 8-12', rest: 90, notes: 'Tira con espalda, no con cuello.' },
          { name: 'Peso muerto rumano', target: '3 x 8-10', rest: 120, notes: 'Isquios y glúteo, espalda neutra.' },
          { name: 'Elevaciones laterales', target: '3 x 12-20', rest: 60, notes: 'Ligero y controlado.' },
          { name: 'Core: plancha / dead bug', target: '3 series', rest: 60, notes: 'Sin arquear lumbar.' }
        ]
      },
      B: {
        name: 'Full body atlético',
        notes: 'Más volumen y trabajo funcional. Ideal si no quieres machacar pierna antes de tenis.',
        exercises: [
          { name: 'Zancadas / split squat', target: '3 x 8-12', rest: 90, notes: 'Control de rodilla y equilibrio.' },
          { name: 'Dominadas / jalón', target: '3-4 x 6-12', rest: 90, notes: 'Pecho arriba.' },
          { name: 'Press militar / hombro', target: '3 x 6-10', rest: 90, notes: 'Glúteo y core activos.' },
          { name: 'Hip thrust / puente glúteo', target: '3 x 8-12', rest: 90, notes: 'Pausa arriba.' },
          { name: 'Face pull / pájaros', target: '3 x 12-20', rest: 60, notes: 'Salud de hombro.' },
          { name: 'Farmer walk / carries', target: '3 rondas', rest: 60, notes: 'Core y agarre.' }
        ]
      },
      C: {
        name: 'Upper/lower mixto',
        notes: 'Día para acumular calidad si ya hiciste A y B.',
        exercises: [
          { name: 'Goblet squat / hack squat', target: '3 x 10-12', rest: 90, notes: 'Rango cómodo.' },
          { name: 'Press inclinado', target: '3 x 8-12', rest: 90, notes: 'Controla hombro.' },
          { name: 'Remo sentado / cable', target: '3 x 10-12', rest: 90, notes: 'Pausa atrás.' },
          { name: 'Curl femoral / fitball', target: '3 x 10-15', rest: 75, notes: 'Isquios sin dolor.' },
          { name: 'Bíceps + tríceps', target: '2-3 x 10-15', rest: 60, notes: 'Superserie si vas justo.' },
          { name: 'Gemelo / tibial', target: '3 x 12-20', rest: 60, notes: 'Prevención para tenis.' }
        ]
      },
      D: {
        name: 'Opcional suave',
        notes: 'Para día cargado. Salir mejor de lo que entraste.',
        exercises: [
          { name: 'Movilidad cadera/tobillo', target: '8-10 min', rest: 0, notes: 'Sin prisa.' },
          { name: 'Bici/Z2 suave', target: '20-35 min', rest: 0, notes: 'Ritmo cómodo.' },
          { name: 'Core antirotación', target: '3 x 10-12', rest: 60, notes: 'Pallof, dead bug o similar.' },
          { name: 'Rotadores hombro', target: '2-3 x 12-20', rest: 45, notes: 'Ligero.' },
          { name: 'Estiramientos suaves', target: '5-8 min', rest: 0, notes: 'No forzar.' }
        ]
      }
    };
  }

  function defaultQuickMeals() {
    return [
      { id: uid('qm'), name: 'Yogur proteína + granola', kcal: 320, protein: 28, carbs: 35, fat: 8, notes: 'Rápido antes/después de entrenar.' },
      { id: uid('qm'), name: 'Wrap carne + huevo + pavo', kcal: 650, protein: 55, carbs: 55, fat: 22, notes: 'Comida fuerte limpia.' },
      { id: uid('qm'), name: 'Plátano', kcal: 105, protein: 1, carbs: 27, fat: 0, notes: 'Pre-tenis simple.' },
      { id: uid('qm'), name: 'Pasta cocida + pavo', kcal: 520, protein: 35, carbs: 75, fat: 8, notes: 'Base de carbohidrato para partido.' },
      { id: uid('qm'), name: 'Contramuslos + verduras', kcal: 620, protein: 55, carbs: 20, fat: 34, notes: 'Cena saciante.' }
    ];
  }

  function defaultState() {
    return {
      appVersion: APP_VERSION,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      settings: {
        userName: 'Gonzalo',
        proteinGoal: 170,
        kcalGoal: 2600,
        carbsGoal: 280,
        fatGoal: 75,
        restSeconds: 90,
        units: 'kg'
      },
      routine: defaultRoutine(),
      weeklyPlan: [
        { day: 'Lunes', plan: 'Gym A o tenis', note: 'Si hay agujetas fuertes, baja pierna.' },
        { day: 'Martes', plan: 'Tenis / movilidad', note: 'Carbohidrato pre-entreno.' },
        { day: 'Miércoles', plan: 'Gym B', note: 'Volumen controlado.' },
        { day: 'Jueves', plan: 'Descanso activo / pasos', note: 'Proteína y sueño.' },
        { day: 'Viernes', plan: 'Gym C o tenis', note: 'Según carga de piernas.' },
        { day: 'Sábado', plan: 'Golf / tenis / paseo', note: 'No compensar con atracón.' },
        { day: 'Domingo', plan: 'D opcional + meal prep', note: 'Preparar semana.' }
      ],
      sessions: [],
      meals: [],
      quickMeals: defaultQuickMeals(),
      bodyWeights: [],
      checkins: [],
      deleteLog: []
    };
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function idbDeleteDatabase() {
    return new Promise((resolve) => {
      if (!('indexedDB' in window)) return resolve();
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }

  function migrateState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;
    const migrated = {
      ...base,
      ...raw,
      appVersion: APP_VERSION,
      settings: { ...base.settings, ...(raw.settings || {}) },
      routine: raw.routine && typeof raw.routine === 'object' ? raw.routine : base.routine,
      weeklyPlan: Array.isArray(raw.weeklyPlan) ? raw.weeklyPlan : base.weeklyPlan,
      sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
      meals: Array.isArray(raw.meals) ? raw.meals : [],
      quickMeals: Array.isArray(raw.quickMeals) && raw.quickMeals.length ? raw.quickMeals : base.quickMeals,
      bodyWeights: Array.isArray(raw.bodyWeights) ? raw.bodyWeights : [],
      checkins: Array.isArray(raw.checkins) ? raw.checkins : [],
      deleteLog: Array.isArray(raw.deleteLog) ? raw.deleteLog : []
    };
    migrated.updatedAt = nowISO();
    return migrated;
  }

  async function loadState() {
    try {
      const fromIDB = await idbGet(STATE_KEY);
      if (fromIDB) return migrateState(fromIDB);
    } catch (err) {
      console.warn('IndexedDB load failed, trying localStorage mirror', err);
    }

    try {
      const mirror = localStorage.getItem(LS_MIRROR);
      if (mirror) return migrateState(JSON.parse(mirror));
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) return migrateState(JSON.parse(legacy));
      }
    } catch (err) {
      console.warn('localStorage load failed', err);
    }
    return defaultState();
  }

  async function saveState(reason = 'autosave') {
    state.updatedAt = nowISO();
    const copy = JSON.parse(JSON.stringify(state));
    saveQueue = saveQueue.then(async () => {
      try {
        await idbSet(STATE_KEY, copy);
      } catch (err) {
        console.warn('IndexedDB save failed', err);
      }
      try {
        localStorage.setItem(LS_MIRROR, JSON.stringify(copy));
        localStorage.setItem('gonzaloGymTrackerV5_lastSaveReason', reason);
      } catch (err) {
        console.warn('localStorage mirror failed', err);
      }
    });
    return saveQueue;
  }

  function toast(message) {
    let wrap = $('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function updateOnlineStatus() {
    const online = navigator.onLine;
    onlineStatus.textContent = online ? 'Online' : 'Offline';
    onlineStatus.className = `status-pill ${online ? 'online' : 'offline'}`;
  }

  function setTab(tab) {
    currentTab = tab;
    $$('.bottom-nav button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    render();
  }

  function getMealsFor(date) {
    return state.meals.filter(m => m.date === date);
  }

  function getSessionsFor(date) {
    return state.sessions.filter(s => s.date === date);
  }

  function getWeightFor(date) {
    return state.bodyWeights.find(w => w.date === date);
  }

  function getCheckin(date) {
    let checkin = state.checkins.find(c => c.date === date);
    if (!checkin) {
      checkin = { date, proteinOk: false, waterOk: false, creatineOk: false, stepsOk: false, cleanEatingOk: false, noAlcoholOk: false, gymDone: false, cardioDone: false, sleepOk: false, notes: '' };
      state.checkins.push(checkin);
    }
    return checkin;
  }

  function mealTotals(date) {
    return getMealsFor(date).reduce((acc, m) => {
      acc.kcal += num(m.kcal);
      acc.protein += num(m.protein);
      acc.carbs += num(m.carbs);
      acc.fat += num(m.fat);
      return acc;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }

  function render() {
    if (!state) return;
    if (timerInterval && currentTab !== 'gym') stopTimer(false);
    const handlers = {
      today: renderToday,
      gym: renderGym,
      diet: renderDiet,
      progress: renderProgress,
      calendar: renderCalendar,
      plan: renderPlan,
      data: renderData
    };
    view.onclick = null;
    view.oninput = null;
    view.onchange = null;
    view.innerHTML = handlers[currentTab] ? handlers[currentTab]() : renderToday();
    bindCommonHandlers();
    const binders = {
      today: bindToday,
      gym: bindGym,
      diet: bindDiet,
      progress: bindProgress,
      calendar: bindCalendar,
      plan: bindPlan,
      data: bindData
    };
    if (binders[currentTab]) binders[currentTab]();
  }

  function renderToday() {
    const date = todayISO();
    const totals = mealTotals(date);
    const sessions = getSessionsFor(date);
    const check = getCheckin(date);
    const proteinPct = clamp((totals.protein / state.settings.proteinGoal) * 100, 0, 100);
    const kcalPct = clamp((totals.kcal / state.settings.kcalGoal) * 100, 0, 100);
    const weight = getWeightFor(date);
    const checklist = [
      ['proteinOk', 'Proteína alta'],
      ['waterOk', 'Agua suficiente'],
      ['creatineOk', 'Creatina'],
      ['stepsOk', 'Pasos / paseo'],
      ['cleanEatingOk', 'Comida limpia'],
      ['noAlcoholOk', 'Sin alcohol'],
      ['gymDone', 'Gym hecho'],
      ['cardioDone', 'Cardio / tenis'],
      ['sleepOk', 'Sueño decente']
    ];

    return `
      <section class="card">
        <div class="row between">
          <div>
            <p class="eyebrow">Hoy</p>
            <h2>${dateLabel(date)}</h2>
          </div>
          <button class="btn secondary small-btn" data-action="go-backup">Backup</button>
        </div>
        <div class="grid two">
          <div class="kpi"><strong>${fmt(totals.protein)} g</strong><span>Proteína / ${state.settings.proteinGoal} g</span><div class="progress-bar"><span style="width:${proteinPct}%"></span></div></div>
          <div class="kpi"><strong>${fmt(totals.kcal)}</strong><span>Kcal / ${state.settings.kcalGoal}</span><div class="progress-bar"><span style="width:${kcalPct}%"></span></div></div>
          <div class="kpi"><strong>${sessions.length}</strong><span>Entrenos guardados hoy</span></div>
          <div class="kpi"><strong>${weight ? fmt(weight.weight, 1) + ' kg' : '—'}</strong><span>Peso corporal</span></div>
        </div>
      </section>

      <section class="card">
        <h3>Registro rápido</h3>
        <div class="grid two">
          <label>Peso hoy (${state.settings.units})<input class="input" id="quickWeight" inputmode="decimal" value="${weight ? escapeHtml(weight.weight) : ''}" placeholder="Ej. 80.5"></label>
          <label>Nota peso<input class="input" id="quickWeightNote" value="${weight ? escapeHtml(weight.notes || '') : ''}" placeholder="Opcional"></label>
        </div>
        <div class="row wrap" style="margin-top:10px">
          <button class="btn" data-action="save-weight">Guardar peso</button>
          <button class="btn secondary" data-action="quick-meal-banana">Añadir plátano</button>
          <button class="btn secondary" data-action="go-gym">Ir a Gym</button>
        </div>
      </section>

      <section class="card">
        <h3>Checklist del día</h3>
        <div class="grid two">
          ${checklist.map(([key, label]) => `<label class="inline"><input type="checkbox" data-check="${key}" ${check[key] ? 'checked' : ''}> ${label}</label>`).join('')}
        </div>
        <label style="margin-top:10px">Notas del día<textarea id="checkNotes" placeholder="Cómo has comido, energía, agujetas, tenis...">${escapeHtml(check.notes || '')}</textarea></label>
      </section>

      <section class="card">
        <h3>Comidas de hoy</h3>
        ${renderMealList(date)}
      </section>
    `;
  }

  function bindToday() {
    $('[data-action="go-backup"]').addEventListener('click', () => setTab('data'));
    $('[data-action="go-gym"]').addEventListener('click', () => setTab('gym'));
    $('[data-action="save-weight"]').addEventListener('click', async () => {
      const date = todayISO();
      const value = num($('#quickWeight').value, null);
      if (!value) return toast('Mete un peso válido.');
      const existing = getWeightFor(date);
      if (existing) {
        existing.weight = value;
        existing.notes = $('#quickWeightNote').value.trim();
      } else {
        state.bodyWeights.push({ id: uid('bw'), date, weight: value, notes: $('#quickWeightNote').value.trim(), createdAt: nowISO() });
      }
      await saveState('save-weight');
      toast('Peso guardado.');
      render();
    });
    $('[data-action="quick-meal-banana"]').addEventListener('click', async () => {
      addMealFromQuick(state.quickMeals.find(q => q.name.toLowerCase().includes('plátano')) || state.quickMeals[0], todayISO());
      await saveState('quick-meal');
      toast('Comida añadida.');
      render();
    });
    $$('[data-check]').forEach(input => input.addEventListener('change', async () => {
      const check = getCheckin(todayISO());
      check[input.dataset.check] = input.checked;
      await saveState('checkin');
    }));
    $('#checkNotes').addEventListener('input', debounce(async (e) => {
      getCheckin(todayISO()).notes = e.target.value;
      await saveState('checkin-notes');
    }, 400));
    view.onclick = async e => {
      const btn = e.target.closest('[data-action="delete-meal"]');
      if (!btn) return;
      state.meals = state.meals.filter(m => m.id !== btn.dataset.id);
      await saveState('delete-meal');
      toast('Comida borrada.');
      render();
    };
  }

  function newDraftFromRoutine(key = 'A') {
    const routine = state.routine[key] || state.routine.A;
    return {
      id: uid('draft'),
      date: todayISO(),
      routineKey: key,
      title: `${key} · ${routine.name}`,
      startedAt: nowISO(),
      notes: '',
      exercises: routine.exercises.map(ex => ({
        name: ex.name,
        target: ex.target,
        rest: ex.rest ?? state.settings.restSeconds,
        notes: ex.notes || '',
        sets: defaultSetsFromTarget(ex.target)
      }))
    };
  }

  function defaultSetsFromTarget(target) {
    const match = String(target || '').match(/(\d)(?:-|\s*x|\s*series|\s*rondas)/i);
    const count = clamp(match ? Number(match[1]) : 3, 1, 5);
    return Array.from({ length: count }, () => ({ weight: '', reps: '', rir: '', done: false }));
  }

  function renderGym() {
    if (!currentGymDraft) currentGymDraft = newDraftFromRoutine('A');
    const routineOptions = Object.entries(state.routine).map(([key, r]) => `<option value="${key}" ${currentGymDraft.routineKey === key ? 'selected' : ''}>${key} · ${escapeHtml(r.name)}</option>`).join('');
    return `
      <section class="card">
        <div class="row between">
          <div>
            <p class="eyebrow">Entrenamiento</p>
            <h2>Gym</h2>
          </div>
          <button class="btn secondary small-btn" data-action="copy-last">Copiar última</button>
        </div>
        <div class="grid two">
          <label>Rutina<select id="routineSelect">${routineOptions}</select></label>
          <label>Fecha<input class="input" id="sessionDate" type="date" value="${currentGymDraft.date}"></label>
        </div>
        <label style="margin-top:10px">Notas de sesión<textarea id="sessionNotes" placeholder="Energía, agujetas, tenis después...">${escapeHtml(currentGymDraft.notes || '')}</textarea></label>
      </section>

      <section class="card">
        <div class="timer">
          <div class="muted bold">Temporizador descanso</div>
          <div class="timer-display" id="timerDisplay">${formatTimer(timerRemaining || state.settings.restSeconds)}</div>
          <div class="row wrap" style="justify-content:center">
            <button class="btn secondary small-btn" data-timer="60">60s</button>
            <button class="btn secondary small-btn" data-timer="90">90s</button>
            <button class="btn secondary small-btn" data-timer="120">120s</button>
            <button class="btn ghost small-btn" data-action="timer-plus">+30s</button>
            <button class="btn danger small-btn" data-action="timer-stop">Stop</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="row between">
          <h3>Ejercicios</h3>
          <button class="btn secondary small-btn" data-action="add-exercise">+ Ejercicio</button>
        </div>
        <div class="stack" id="exerciseList">
          ${currentGymDraft.exercises.map((ex, idx) => renderExerciseDraft(ex, idx)).join('')}
        </div>
      </section>

      <section class="card">
        <div class="row wrap">
          <button class="btn success" data-action="save-session">Guardar entrenamiento</button>
          <button class="btn secondary" data-action="new-draft">Nuevo borrador</button>
        </div>
        <p class="small muted">Se guarda en IndexedDB del móvil y también se deja espejo técnico en localStorage. Exporta backup de vez en cuando.</p>
      </section>
    `;
  }

  function renderExerciseDraft(ex, idx) {
    return `
      <div class="exercise" data-exercise-index="${idx}">
        <div class="exercise-head">
          <div>
            <p class="exercise-title">${escapeHtml(ex.name)}</p>
            <p class="small muted">${escapeHtml(ex.target || '')}${ex.notes ? ' · ' + escapeHtml(ex.notes) : ''}</p>
          </div>
          <button class="btn ghost small-btn" data-action="remove-exercise" data-index="${idx}">Quitar</button>
        </div>
        <label>Nombre<input class="input" data-ex-field="name" value="${escapeHtml(ex.name)}"></label>
        <div class="grid two" style="margin-top:8px">
          <label>Objetivo<input class="input" data-ex-field="target" value="${escapeHtml(ex.target || '')}"></label>
          <label>Descanso s<input class="input" inputmode="numeric" data-ex-field="rest" value="${escapeHtml(ex.rest || state.settings.restSeconds)}"></label>
        </div>
        <div class="set-list" style="margin-top:10px">
          ${ex.sets.map((set, sIdx) => renderSetDraft(set, idx, sIdx)).join('')}
        </div>
        <div class="row wrap">
          <button class="btn secondary small-btn" data-action="add-set" data-index="${idx}">+ Serie</button>
          <button class="btn ghost small-btn" data-action="start-rest" data-seconds="${ex.rest || state.settings.restSeconds}">Descanso ${ex.rest || state.settings.restSeconds}s</button>
        </div>
      </div>
    `;
  }

  function renderSetDraft(set, exIdx, setIdx) {
    return `
      <div class="set-row" data-set-index="${setIdx}">
        <div class="set-no">${setIdx + 1}</div>
        <label>kg<input class="input" inputmode="decimal" data-set-field="weight" value="${escapeHtml(set.weight)}"></label>
        <label>reps<input class="input" inputmode="numeric" data-set-field="reps" value="${escapeHtml(set.reps)}"></label>
        <label>RIR<input class="input" inputmode="numeric" data-set-field="rir" value="${escapeHtml(set.rir)}"></label>
        <button class="remove-set" data-action="remove-set" data-ex-index="${exIdx}" data-set-index="${setIdx}">×</button>
      </div>
    `;
  }

  function bindGym() {
    $('#routineSelect').addEventListener('change', (e) => {
      const key = e.target.value;
      currentGymDraft = newDraftFromRoutine(key);
      render();
    });
    $('#sessionDate').addEventListener('change', e => currentGymDraft.date = e.target.value || todayISO());
    $('#sessionNotes').addEventListener('input', e => currentGymDraft.notes = e.target.value);

    $('#exerciseList').addEventListener('input', e => {
      const exEl = e.target.closest('[data-exercise-index]');
      if (!exEl) return;
      const exIdx = Number(exEl.dataset.exerciseIndex);
      const ex = currentGymDraft.exercises[exIdx];
      if (e.target.dataset.exField) {
        ex[e.target.dataset.exField] = e.target.dataset.exField === 'rest' ? num(e.target.value, state.settings.restSeconds) : e.target.value;
      }
      if (e.target.dataset.setField) {
        const setEl = e.target.closest('[data-set-index]');
        const setIdx = Number(setEl.dataset.setIndex);
        ex.sets[setIdx][e.target.dataset.setField] = e.target.value;
      }
    });

    view.onclick = async e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'add-exercise') {
        currentGymDraft.exercises.push({ name: 'Nuevo ejercicio', target: '3 x 10', rest: state.settings.restSeconds, notes: '', sets: defaultSetsFromTarget('3 x 10') });
        render();
      }
      if (action === 'remove-exercise') {
        currentGymDraft.exercises.splice(Number(btn.dataset.index), 1);
        render();
      }
      if (action === 'add-set') {
        currentGymDraft.exercises[Number(btn.dataset.index)].sets.push({ weight: '', reps: '', rir: '', done: false });
        render();
      }
      if (action === 'remove-set') {
        const ex = currentGymDraft.exercises[Number(btn.dataset.exIndex)];
        ex.sets.splice(Number(btn.dataset.setIndex), 1);
        render();
      }
      if (action === 'start-rest') startTimer(Number(btn.dataset.seconds) || state.settings.restSeconds);
      if (btn.dataset.timer) startTimer(Number(btn.dataset.timer));
      if (action === 'timer-plus') startTimer((timerRemaining || state.settings.restSeconds) + 30);
      if (action === 'timer-stop') stopTimer(true);
      if (action === 'new-draft') {
        currentGymDraft = newDraftFromRoutine(currentGymDraft.routineKey || 'A');
        render();
      }
      if (action === 'copy-last') copyLastSession();
      if (action === 'save-session') await saveGymSession();
    };
  }

  function normalizeDraftBeforeSave() {
    currentGymDraft.notes = $('#sessionNotes')?.value || currentGymDraft.notes || '';
    currentGymDraft.date = $('#sessionDate')?.value || currentGymDraft.date || todayISO();
    $$('#exerciseList .exercise').forEach(exEl => {
      const exIdx = Number(exEl.dataset.exerciseIndex);
      const ex = currentGymDraft.exercises[exIdx];
      $$('[data-ex-field]', exEl).forEach(input => {
        ex[input.dataset.exField] = input.dataset.exField === 'rest' ? num(input.value, state.settings.restSeconds) : input.value;
      });
      $$('.set-row', exEl).forEach(setEl => {
        const setIdx = Number(setEl.dataset.setIndex);
        $$('[data-set-field]', setEl).forEach(input => {
          ex.sets[setIdx][input.dataset.setField] = input.value;
        });
      });
    });
  }

  async function saveGymSession() {
    normalizeDraftBeforeSave();
    const session = JSON.parse(JSON.stringify(currentGymDraft));
    session.id = uid('session');
    session.savedAt = nowISO();
    session.exercises = session.exercises
      .map(ex => ({
        ...ex,
        sets: ex.sets.filter(s => String(s.weight || s.reps || s.rir).trim() !== '').map(s => ({
          weight: s.weight === '' ? '' : num(s.weight, ''),
          reps: s.reps === '' ? '' : num(s.reps, ''),
          rir: s.rir === '' ? '' : num(s.rir, '')
        }))
      }))
      .filter(ex => ex.name.trim() && ex.sets.length);
    if (!session.exercises.length) return toast('No hay series con datos para guardar.');
    state.sessions.push(session);
    getCheckin(session.date).gymDone = true;
    await saveState('save-session');
    currentGymDraft = newDraftFromRoutine(session.routineKey || 'A');
    toast('Entrenamiento guardado.');
    render();
  }

  function copyLastSession() {
    const key = currentGymDraft?.routineKey || 'A';
    const last = [...state.sessions].reverse().find(s => s.routineKey === key || s.title?.startsWith(key));
    if (!last) return toast('No hay sesión previa de esta rutina.');
    currentGymDraft = JSON.parse(JSON.stringify(last));
    currentGymDraft.id = uid('draft');
    currentGymDraft.date = todayISO();
    currentGymDraft.startedAt = nowISO();
    currentGymDraft.notes = '';
    currentGymDraft.exercises = currentGymDraft.exercises.map(ex => ({
      ...ex,
      sets: ex.sets.map(set => ({ weight: set.weight ?? '', reps: set.reps ?? '', rir: set.rir ?? '' }))
    }));
    toast('Última sesión copiada.');
    render();
  }

  function formatTimer(seconds) {
    seconds = Math.max(0, Number(seconds || 0));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function startTimer(seconds) {
    stopTimer(false);
    timerRemaining = Math.max(0, Number(seconds || state.settings.restSeconds));
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      timerRemaining -= 1;
      updateTimerDisplay();
      if (timerRemaining <= 0) {
        stopTimer(false);
        vibrate();
        toast('Descanso terminado.');
      }
    }, 1000);
  }

  function stopTimer(showToast) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (showToast) toast('Timer parado.');
  }

  function updateTimerDisplay() {
    const el = $('#timerDisplay');
    if (el) el.textContent = formatTimer(timerRemaining);
  }

  function vibrate() {
    try { if ('vibrate' in navigator) navigator.vibrate([180, 80, 180]); } catch (_) {}
  }

  function renderDiet() {
    const date = todayISO();
    const totals = mealTotals(date);
    return `
      <section class="card">
        <p class="eyebrow">Dieta</p>
        <h2>Comidas y macros</h2>
        <div class="grid two">
          <div class="kpi"><strong>${fmt(totals.protein)} g</strong><span>Proteína</span></div>
          <div class="kpi"><strong>${fmt(totals.kcal)}</strong><span>Kcal</span></div>
          <div class="kpi"><strong>${fmt(totals.carbs)} g</strong><span>Carbs</span></div>
          <div class="kpi"><strong>${fmt(totals.fat)} g</strong><span>Grasa</span></div>
        </div>
      </section>

      <section class="card">
        <h3>Añadir comida</h3>
        <div class="grid two">
          <label>Nombre<input class="input" id="mealName" placeholder="Ej. Pasta + pavo"></label>
          <label>Fecha<input class="input" id="mealDate" type="date" value="${date}"></label>
          <label>Kcal<input class="input" id="mealKcal" inputmode="numeric" placeholder="520"></label>
          <label>Proteína g<input class="input" id="mealProtein" inputmode="decimal" placeholder="35"></label>
          <label>Carbs g<input class="input" id="mealCarbs" inputmode="decimal" placeholder="75"></label>
          <label>Grasa g<input class="input" id="mealFat" inputmode="decimal" placeholder="8"></label>
        </div>
        <label style="margin-top:10px">Notas<input class="input" id="mealNotes" placeholder="Opcional"></label>
        <div class="row wrap" style="margin-top:10px">
          <button class="btn success" data-action="add-meal">Guardar comida</button>
          <button class="btn secondary" data-action="add-meal-quick">Guardar y hacer rápida</button>
        </div>
      </section>

      <section class="card">
        <h3>Comidas rápidas</h3>
        <div class="list">
          ${state.quickMeals.map(q => `
            <div class="list-item">
              <div class="row between">
                <div><strong>${escapeHtml(q.name)}</strong><div class="small muted">${fmt(q.kcal)} kcal · ${fmt(q.protein)} g prot · ${fmt(q.carbs)} g C · ${fmt(q.fat)} g G</div></div>
                <button class="btn secondary small-btn" data-action="use-quick" data-id="${q.id}">Añadir</button>
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="card">
        <h3>Comidas de hoy</h3>
        ${renderMealList(date)}
      </section>
    `;
  }

  function renderMealList(date) {
    const meals = getMealsFor(date);
    if (!meals.length) return '<p class="muted">Aún no hay comidas registradas hoy.</p>';
    return `<div class="list">${meals.map(m => `
      <div class="list-item">
        <div class="row between">
          <div>
            <strong>${escapeHtml(m.name)}</strong>
            <div class="small muted">${fmt(m.kcal)} kcal · ${fmt(m.protein)} g prot · ${fmt(m.carbs)} g C · ${fmt(m.fat)} g G</div>
            ${m.notes ? `<div class="small muted">${escapeHtml(m.notes)}</div>` : ''}
          </div>
          <button class="btn ghost small-btn" data-action="delete-meal" data-id="${m.id}">Borrar</button>
        </div>
      </div>
    `).join('')}</div>`;
  }

  function bindDiet() {
    view.onclick = async e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'add-meal' || action === 'add-meal-quick') {
        const meal = readMealForm();
        if (!meal.name) return toast('Pon nombre a la comida.');
        state.meals.push(meal);
        if (action === 'add-meal-quick') state.quickMeals.push({ ...meal, id: uid('qm') });
        await saveState('add-meal');
        toast(action === 'add-meal-quick' ? 'Comida y rápida guardadas.' : 'Comida guardada.');
        render();
      }
      if (action === 'use-quick') {
        const q = state.quickMeals.find(x => x.id === btn.dataset.id);
        if (!q) return;
        addMealFromQuick(q, todayISO());
        await saveState('use-quick-meal');
        toast('Comida rápida añadida.');
        render();
      }
      if (action === 'delete-meal') {
        state.meals = state.meals.filter(m => m.id !== btn.dataset.id);
        await saveState('delete-meal');
        toast('Comida borrada.');
        render();
      }
    };
  }

  function readMealForm() {
    return {
      id: uid('meal'),
      date: $('#mealDate').value || todayISO(),
      name: $('#mealName').value.trim(),
      kcal: num($('#mealKcal').value),
      protein: num($('#mealProtein').value),
      carbs: num($('#mealCarbs').value),
      fat: num($('#mealFat').value),
      notes: $('#mealNotes').value.trim(),
      createdAt: nowISO()
    };
  }

  function addMealFromQuick(q, date) {
    state.meals.push({
      id: uid('meal'),
      date,
      name: q.name,
      kcal: q.kcal,
      protein: q.protein,
      carbs: q.carbs,
      fat: q.fat,
      notes: q.notes || '',
      createdAt: nowISO()
    });
  }

  function bindCommonHandlers() {
    // Reserved for future global handlers. Tab buttons are bound once in init().
  }

  function renderProgress() {
    const recentSessions = [...state.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    const recentWeights = [...state.bodyWeights].sort((a, b) => a.date.localeCompare(b.date)).slice(-12);
    const last7 = daysBack(7);
    const proteinAvg = last7.reduce((sum, d) => sum + mealTotals(d).protein, 0) / 7;
    const gym7 = last7.reduce((sum, d) => sum + getSessionsFor(d).length, 0);
    const prList = computePRs().slice(0, 8);
    return `
      <section class="card">
        <p class="eyebrow">Progreso</p>
        <h2>Resumen</h2>
        <div class="grid two">
          <div class="kpi"><strong>${state.sessions.length}</strong><span>Entrenos totales</span></div>
          <div class="kpi"><strong>${fmt(gym7)}</strong><span>Entrenos últimos 7 días</span></div>
          <div class="kpi"><strong>${fmt(proteinAvg)} g</strong><span>Proteína media 7 días</span></div>
          <div class="kpi"><strong>${recentWeights.length ? fmt(recentWeights[recentWeights.length - 1].weight, 1) + ' kg' : '—'}</strong><span>Último peso</span></div>
        </div>
      </section>

      <section class="card">
        <h3>Peso corporal</h3>
        ${renderSimpleChart(recentWeights.map(w => ({ label: w.date.slice(5), value: w.weight })))}
      </section>

      <section class="card">
        <h3>PRs por ejercicio</h3>
        ${prList.length ? `<div class="list">${prList.map(pr => `<div class="list-item"><strong>${escapeHtml(pr.name)}</strong><div class="small muted">${fmt(pr.weight, 1)} kg x ${fmt(pr.reps)} reps · ${escapeHtml(pr.date)}</div></div>`).join('')}</div>` : '<p class="muted">Aún no hay PRs.</p>'}
      </section>

      <section class="card">
        <h3>Últimos entrenamientos</h3>
        ${recentSessions.length ? `<div class="list">${recentSessions.map(s => `<div class="list-item"><strong>${escapeHtml(s.title || s.routineKey || 'Entreno')}</strong><div class="small muted">${escapeHtml(s.date)} · ${s.exercises.length} ejercicios</div><button class="btn ghost small-btn" data-action="delete-session" data-id="${s.id}">Borrar</button></div>`).join('')}</div>` : '<p class="muted">Aún no hay entrenamientos guardados.</p>'}
      </section>
    `;
  }

  function bindProgress() {
    view.onclick = async e => {
      const btn = e.target.closest('[data-action="delete-session"]');
      if (!btn) return;
      if (!confirm('¿Borrar este entrenamiento?')) return;
      state.sessions = state.sessions.filter(s => s.id !== btn.dataset.id);
      await saveState('delete-session');
      toast('Entrenamiento borrado.');
      render();
    };
  }

  function computePRs() {
    const map = new Map();
    for (const s of state.sessions) {
      for (const ex of s.exercises || []) {
        for (const set of ex.sets || []) {
          const weight = num(set.weight, 0);
          const reps = num(set.reps, 0);
          if (!weight || !reps) continue;
          const key = ex.name.trim().toLowerCase();
          const prev = map.get(key);
          if (!prev || weight > prev.weight || (weight === prev.weight && reps > prev.reps)) {
            map.set(key, { name: ex.name, weight, reps, date: s.date });
          }
        }
      }
    }
    return [...map.values()].sort((a, b) => b.weight - a.weight);
  }

  function renderSimpleChart(points) {
    if (!points.length) return '<p class="muted">Mete varios pesos para ver tendencia.</p>';
    if (points.length === 1) return `<p class="muted">Último peso: ${fmt(points[0].value, 1)} kg.</p>`;
    const w = 640, h = 180, pad = 26;
    const vals = points.map(p => Number(p.value));
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const coords = points.map((p, i) => {
      const x = pad + i * ((w - pad * 2) / (points.length - 1));
      const y = h - pad - ((p.value - min) / span) * (h - pad * 2);
      return [x, y];
    });
    const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0]},${c[1]}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de peso" style="width:100%;height:auto;border:1px solid var(--line);border-radius:16px;background:#fff">
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${coords.map((c, i) => `<circle cx="${c[0]}" cy="${c[1]}" r="5" fill="currentColor"><title>${escapeHtml(points[i].label)}: ${fmt(points[i].value, 1)} kg</title></circle>`).join('')}
      <text x="${pad}" y="20" font-size="14" fill="currentColor">${fmt(max, 1)} kg</text>
      <text x="${pad}" y="${h - 8}" font-size="14" fill="currentColor">${fmt(min, 1)} kg</text>
    </svg>`;
  }

  function renderCalendar() {
    const days = daysBack(35);
    return `
      <section class="card">
        <p class="eyebrow">Calendario</p>
        <h2>Últimos 35 días</h2>
        <div class="calendar">
          ${days.map(d => {
            const sessions = getSessionsFor(d).length;
            const totals = mealTotals(d);
            const weight = getWeightFor(d);
            const isToday = d === todayISO();
            return `<div class="day ${isToday ? 'today' : ''}"><small>${d.slice(8)}</small><div class="dots">${sessions ? '<span class="dot gym" title="Gym"></span>' : ''}${totals.protein ? '<span class="dot diet" title="Dieta"></span>' : ''}${weight ? '<span class="dot weight" title="Peso"></span>' : ''}</div></div>`;
          }).join('')}
        </div>
        <p class="small muted"><span class="dot gym"></span> Gym · <span class="dot diet"></span> Dieta · <span class="dot weight"></span> Peso</p>
      </section>
    `;
  }

  function bindCalendar() {}

  function renderPlan() {
    return `
      <section class="card">
        <p class="eyebrow">Plan</p>
        <h2>Rutinas base</h2>
        <p class="muted">Puedes editar la rutina base aquí. Los cambios afectan a nuevos borradores, no a sesiones ya guardadas.</p>
      </section>
      ${Object.entries(state.routine).map(([key, r]) => `
        <section class="card">
          <div class="row between">
            <h3>${key} · ${escapeHtml(r.name)}</h3>
            <button class="btn secondary small-btn" data-action="restore-routine" data-key="${key}">Restaurar ${key}</button>
          </div>
          <label>Nombre rutina<input class="input" data-routine-key="${key}" data-routine-field="name" value="${escapeHtml(r.name)}"></label>
          <label style="margin-top:8px">Notas<textarea data-routine-key="${key}" data-routine-field="notes">${escapeHtml(r.notes || '')}</textarea></label>
          <div class="list" style="margin-top:10px">
            ${r.exercises.map((ex, idx) => `
              <div class="list-item" data-plan-ex="${key}-${idx}">
                <div class="grid two">
                  <label>Ejercicio<input class="input" data-ex-key="${key}" data-ex-idx="${idx}" data-ex-prop="name" value="${escapeHtml(ex.name)}"></label>
                  <label>Objetivo<input class="input" data-ex-key="${key}" data-ex-idx="${idx}" data-ex-prop="target" value="${escapeHtml(ex.target)}"></label>
                  <label>Descanso<input class="input" inputmode="numeric" data-ex-key="${key}" data-ex-idx="${idx}" data-ex-prop="rest" value="${escapeHtml(ex.rest || state.settings.restSeconds)}"></label>
                  <label>Notas<input class="input" data-ex-key="${key}" data-ex-idx="${idx}" data-ex-prop="notes" value="${escapeHtml(ex.notes || '')}"></label>
                </div>
                <button class="btn ghost small-btn" style="margin-top:8px" data-action="delete-plan-ex" data-key="${key}" data-idx="${idx}">Borrar ejercicio</button>
              </div>
            `).join('')}
          </div>
          <button class="btn secondary" style="margin-top:10px" data-action="add-plan-ex" data-key="${key}">+ Añadir ejercicio a ${key}</button>
        </section>
      `).join('')}
      <section class="card">
        <h3>Semana orientativa</h3>
        <div class="list">
          ${state.weeklyPlan.map(d => `<div class="list-item"><strong>${escapeHtml(d.day)}:</strong> ${escapeHtml(d.plan)}<div class="small muted">${escapeHtml(d.note)}</div></div>`).join('')}
        </div>
      </section>
    `;
  }

  function bindPlan() {
    view.oninput = debounce(async e => {
      if (e.target.dataset.routineKey) {
        const r = state.routine[e.target.dataset.routineKey];
        r[e.target.dataset.routineField] = e.target.value;
        await saveState('edit-routine');
      }
      if (e.target.dataset.exKey) {
        const ex = state.routine[e.target.dataset.exKey].exercises[Number(e.target.dataset.exIdx)];
        const prop = e.target.dataset.exProp;
        ex[prop] = prop === 'rest' ? num(e.target.value, state.settings.restSeconds) : e.target.value;
        await saveState('edit-routine-exercise');
      }
    }, 350);
    view.onclick = async e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.action === 'add-plan-ex') {
        state.routine[btn.dataset.key].exercises.push({ name: 'Nuevo ejercicio', target: '3 x 10', rest: state.settings.restSeconds, notes: '' });
        await saveState('add-routine-ex');
        render();
      }
      if (btn.dataset.action === 'delete-plan-ex') {
        state.routine[btn.dataset.key].exercises.splice(Number(btn.dataset.idx), 1);
        await saveState('delete-routine-ex');
        render();
      }
      if (btn.dataset.action === 'restore-routine') {
        if (!confirm(`¿Restaurar rutina ${btn.dataset.key} a la base?`)) return;
        state.routine[btn.dataset.key] = defaultRoutine()[btn.dataset.key];
        await saveState('restore-routine');
        render();
      }
    };
  }

  function renderData() {
    const bytesText = navigator.storage && navigator.storage.estimate ? 'Calculando...' : 'No disponible';
    return `
      <section class="card">
        <p class="eyebrow">Datos</p>
        <h2>Backups y limpieza</h2>
        <div class="grid two">
          <div class="kpi"><strong>V${APP_VERSION}</strong><span>Versión app</span></div>
          <div class="kpi"><strong>${state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}</strong><span>Último guardado</span></div>
          <div class="kpi"><strong>${state.sessions.length}</strong><span>Entrenos</span></div>
          <div class="kpi"><strong>${state.meals.length}</strong><span>Comidas</span></div>
        </div>
        <p class="small muted">Uso estimado del navegador: <span id="storageEstimate">${bytesText}</span></p>
      </section>

      <section class="card">
        <h3>Backup</h3>
        <div class="stack">
          <button class="btn success" data-action="export-json">Exportar backup completo JSON</button>
          <button class="btn secondary" data-action="export-csv">Exportar CSV entrenos + dieta</button>
          <button class="btn secondary" data-action="import-json">Importar backup JSON</button>
          <input class="file-input" id="importFile" type="file" accept="application/json,.json">
        </div>
        <p class="small muted">Antes de borrar datos o cambiar de URL, exporta un JSON. Ese archivo permite restaurar todo.</p>
      </section>

      <section class="card warning">
        <h3>Limpiar memoria</h3>
        <p class="muted">Borra categorías concretas sin tocar el resto. Para confirmar escribe <strong>BORRAR</strong>.</p>
        <label>Confirmación<input class="input" id="deleteConfirm" placeholder="BORRAR"></label>
        <div class="grid two" style="margin-top:10px">
          <button class="btn warning" data-action="delete-sessions">Borrar entrenos</button>
          <button class="btn warning" data-action="delete-meals">Borrar dieta</button>
          <button class="btn warning" data-action="delete-weights">Borrar pesos</button>
          <button class="btn warning" data-action="delete-checkins">Borrar checklist</button>
        </div>
      </section>

      <section class="card danger">
        <h3>Borrado total</h3>
        <p class="muted">Esto deja la app como nueva en este móvil. No borra la app publicada en GitHub, solo tus datos locales.</p>
        <label>Confirmación fuerte<input class="input" id="deleteAllConfirm" placeholder="BORRAR TODO"></label>
        <button class="btn danger" style="margin-top:10px" data-action="delete-all">Borrar TODO</button>
      </section>

      <section class="card">
        <h3>App offline</h3>
        <div class="stack">
          <button class="btn secondary" data-action="update-app">Buscar actualización</button>
          <button class="btn ghost" data-action="clear-cache">Limpiar caché offline</button>
        </div>
        <p class="small muted">Si limpias caché, la app seguirá teniendo tus datos. Solo fuerza a recargar archivos actualizados de la web.</p>
      </section>
    `;
  }

  function bindData() {
    updateStorageEstimate();
    view.onclick = async e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'export-json') exportJson();
      if (action === 'export-csv') exportCsv();
      if (action === 'import-json') $('#importFile').click();
      if (action === 'delete-sessions') await deleteCategory('sessions', 'Entrenos borrados.');
      if (action === 'delete-meals') await deleteCategory('meals', 'Dieta/comidas borradas.');
      if (action === 'delete-weights') await deleteCategory('bodyWeights', 'Pesos borrados.');
      if (action === 'delete-checkins') await deleteCategory('checkins', 'Checklist borrado.');
      if (action === 'delete-all') await deleteAllData();
      if (action === 'clear-cache') await clearOfflineCache();
      if (action === 'update-app') await updateApp();
    };
    $('#importFile').addEventListener('change', importJsonFile);
  }

  async function updateStorageEstimate() {
    const el = $('#storageEstimate');
    if (!el || !navigator.storage || !navigator.storage.estimate) return;
    try {
      const estimate = await navigator.storage.estimate();
      el.textContent = `${formatBytes(estimate.usage || 0)} usados de ${formatBytes(estimate.quota || 0)}`;
    } catch (_) { el.textContent = 'No disponible'; }
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${fmt(bytes, i ? 1 : 0)} ${units[i]}`;
  }

  function exportJson() {
    const payload = {
      exportedAt: nowISO(),
      app: 'Gonzalo Gym Tracker',
      version: APP_VERSION,
      state
    };
    downloadFile(`gonzalo-gym-tracker-v5-backup-${downloadNameDate()}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup JSON exportado.');
  }

  function csvEscape(value) {
    const s = String(value ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    const rows = [];
    rows.push(['tipo', 'fecha', 'titulo_nombre', 'ejercicio', 'serie', 'kg', 'reps', 'rir', 'kcal', 'proteina', 'carbs', 'grasa', 'notas'].join(';'));
    for (const s of state.sessions) {
      for (const ex of s.exercises || []) {
        (ex.sets || []).forEach((set, idx) => rows.push([
          'gym', s.date, s.title || s.routineKey || '', ex.name, idx + 1, set.weight, set.reps, set.rir, '', '', '', '', s.notes || ex.notes || ''
        ].map(csvEscape).join(';')));
      }
    }
    for (const m of state.meals) {
      rows.push(['dieta', m.date, m.name, '', '', '', '', '', m.kcal, m.protein, m.carbs, m.fat, m.notes || ''].map(csvEscape).join(';'));
    }
    for (const w of state.bodyWeights) {
      rows.push(['peso', w.date, 'Peso corporal', '', '', w.weight, '', '', '', '', '', '', w.notes || ''].map(csvEscape).join(';'));
    }
    downloadFile(`gonzalo-gym-tracker-v5-${downloadNameDate()}.csv`, rows.join('\n'), 'text/csv;charset=utf-8');
    toast('CSV exportado.');
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJsonFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = parsed.state || parsed;
      const migrated = migrateState(imported);
      if (!confirm('¿Importar backup y reemplazar los datos actuales? Haz export antes si quieres guardar lo de ahora.')) return;
      state = migrated;
      await saveState('import-json');
      toast('Backup importado.');
      render();
    } catch (err) {
      console.error(err);
      toast('No se pudo importar el JSON.');
    } finally {
      e.target.value = '';
    }
  }

  async function deleteCategory(key, message) {
    if ($('#deleteConfirm').value.trim() !== 'BORRAR') return toast('Escribe BORRAR para confirmar.');
    exportJson();
    state.deleteLog.push({ at: nowISO(), action: `delete-${key}`, count: Array.isArray(state[key]) ? state[key].length : null });
    state[key] = [];
    await saveState(`delete-${key}`);
    toast(message);
    render();
  }

  async function deleteAllData() {
    if ($('#deleteAllConfirm').value.trim() !== 'BORRAR TODO') return toast('Escribe BORRAR TODO para confirmar.');
    if (!confirm('Última confirmación: ¿quieres borrar TODOS los datos locales?')) return;
    exportJson();
    try { localStorage.removeItem(LS_MIRROR); } catch (_) {}
    await idbDeleteDatabase();
    state = defaultState();
    await saveState('delete-all-reset');
    toast('Datos borrados. App reiniciada.');
    currentGymDraft = null;
    render();
  }

  async function clearOfflineCache() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
      toast('Caché offline limpiada. Recarga la app.');
    } else if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
      toast('Caché offline limpiada.');
    } else {
      toast('Caché no disponible.');
    }
  }

  async function updateApp() {
    if (!('serviceWorker' in navigator)) return toast('Service worker no disponible.');
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return toast('App offline aún no registrada.');
    await reg.update();
    toast('Actualización comprobada. Cierra y abre la app si hace falta.');
  }

  function daysBack(n) {
    const arr = [];
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const x = new Date(d);
      x.setDate(d.getDate() - i);
      arr.push(x.toISOString().slice(0, 10));
    }
    return arr;
  }

  function debounce(fn, ms = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('Nueva versión lista. Cierra y abre la app.');
        });
      });
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'CACHE_CLEARED') toast('Caché offline limpiada.');
      });
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  }

  async function init() {
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    state = await loadState();
    await saveState('init');
    await registerServiceWorker();
    $$('.bottom-nav button').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
    render();
  }

  init().catch(err => {
    console.error(err);
    view.innerHTML = `<section class="card danger"><h2>Error al cargar</h2><p>No se pudo iniciar la app. Prueba a recargar. Si persiste, exporta/importa backup si tenías uno.</p><pre class="code">${escapeHtml(err.message || err)}</pre></section>`;
  });
})();
