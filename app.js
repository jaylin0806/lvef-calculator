(() => {
  const ddInput = document.getElementById('lvidd');
  const dsInput = document.getElementById('lvids');
  const unitLabelD = document.getElementById('unit-label-d');
  const unitLabelS = document.getElementById('unit-label-s');
  const unitButtons = document.querySelectorAll('.unit-btn');
  const warningEl = document.getElementById('warning');
  const resultsEl = document.getElementById('results');

  const historyCard = document.getElementById('history-card');
  const historyList = document.getElementById('history-list');
  const historyClear = document.getElementById('history-clear');

  let unit = 'cm'; // 'cm' | 'mm', current display unit
  let lastResult = null; // most recent valid calculation, for auto-saving
  let saveTimer = null;

  // ---- Local persistence (device-only, never leaves the browser) ----
  const STORE_KEY = 'lvef-calculator:v1';
  const MAX_HISTORY = 10;
  // Wait for typing to settle so intermediate values ("4" on the way to
  // "4.85") aren't recorded as separate results.
  const AUTOSAVE_DELAY_MS = 1500;

  function loadStore() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      if (data && typeof data === 'object') {
        return {
          unit: data.unit === 'mm' ? 'mm' : 'cm',
          lvidd: typeof data.lvidd === 'string' ? data.lvidd : '',
          lvids: typeof data.lvids === 'string' ? data.lvids : '',
          history: Array.isArray(data.history) ? data.history.slice(0, MAX_HISTORY) : [],
        };
      }
    } catch (e) { /* storage unavailable or corrupt */ }
    return { unit: 'cm', lvidd: '', lvids: '', history: [] };
  }

  const store = loadStore();

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) { /* private mode / quota: keep working without memory */ }
  }

  // EF severity bands (simplified, gender-neutral clinical convention)
  const EF_BANDS = [
    { min: 55, label: '正常', cls: 'severity-normal' },
    { min: 41, label: '輕度降低', cls: 'severity-mild' },
    { min: 30, label: '中度降低', cls: 'severity-moderate' },
    { min: -Infinity, label: '重度降低', cls: 'severity-severe' },
  ];

  // Fractional shortening severity bands
  const FS_BANDS = [
    { min: 25, label: '正常', cls: 'severity-normal' },
    { min: 20, label: '輕度降低', cls: 'severity-mild' },
    { min: 15, label: '中度降低', cls: 'severity-moderate' },
    { min: -Infinity, label: '重度降低', cls: 'severity-severe' },
  ];

  function classify(value, bands) {
    return bands.find(b => value >= b.min);
  }

  function toCm(value) {
    return unit === 'mm' ? value / 10 : value;
  }

  function getInputs() {
    const dRaw = parseFloat(ddInput.value);
    const sRaw = parseFloat(dsInput.value);
    return { dRaw, sRaw };
  }

  function setWarning(msg) {
    if (!msg) {
      warningEl.hidden = true;
      warningEl.textContent = '';
      return;
    }
    warningEl.hidden = false;
    warningEl.textContent = msg;
  }

  function renderResult(prefix, efValue, bands) {
    const valueEl = document.getElementById(`value-${prefix}`);
    const badgeEl = document.getElementById(`badge-${prefix}`);
    const cardEl = document.getElementById(`card-${prefix}`);

    valueEl.textContent = `${efValue.toFixed(1)} %`;
    const band = classify(efValue, bands);
    badgeEl.textContent = band.label;

    cardEl.classList.remove('severity-normal', 'severity-mild', 'severity-moderate', 'severity-severe');
    cardEl.classList.add(band.cls);
  }

  function computeAll(d, s) {
    // Teichholz
    const edv = (7.0 / (2.4 + d)) * Math.pow(d, 3);
    const esv = (7.0 / (2.4 + s)) * Math.pow(s, 3);
    const teichholz = ((edv - esv) / edv) * 100;

    // Quinones cube formula
    const quinones = ((Math.pow(d, 3) - Math.pow(s, 3)) / Math.pow(d, 3)) * 100;

    // Fractional shortening
    const fs = ((d - s) / d) * 100;

    return { d, s, teichholz, quinones, fs };
  }

  function calculate() {
    const { dRaw, sRaw } = getInputs();

    lastResult = null;

    if (Number.isNaN(dRaw) || Number.isNaN(sRaw)) {
      resultsEl.hidden = true;
      setWarning(null);
      return;
    }

    if (dRaw <= 0 || sRaw <= 0) {
      resultsEl.hidden = true;
      setWarning('數值必須大於 0');
      return;
    }

    if (sRaw >= dRaw) {
      resultsEl.hidden = true;
      setWarning('LVIDs 不應大於或等於 LVIDd，請確認量測值');
      return;
    }

    setWarning(null);

    const d = toCm(dRaw);
    const s = toCm(sRaw);

    const result = computeAll(d, s);
    renderResult('teichholz', result.teichholz, EF_BANDS);
    renderResult('quinones', result.quinones, EF_BANDS);
    renderResult('fs', result.fs, FS_BANDS);

    resultsEl.hidden = false;

    lastResult = result;
  }

  // ---- History ----
  function formatTime(ts) {
    const dt = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  function formatLength(cm) {
    return unit === 'mm' ? `${round2(cm * 10)} mm` : `${round2(cm).toFixed(2)} cm`;
  }

  function renderHistory() {
    historyList.innerHTML = '';
    historyCard.hidden = store.history.length === 0;

    store.history.forEach((entry) => {
      const li = document.createElement('li');
      li.className = `history-item ${classify(entry.teichholz, EF_BANDS).cls}`;

      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'history-load';

      const main = document.createElement('div');
      main.className = 'history-main';
      const ef = document.createElement('span');
      ef.textContent = `EF ${entry.teichholz.toFixed(1)}%`;
      const dims = document.createElement('span');
      dims.textContent = `${formatLength(entry.d)} / ${formatLength(entry.s)}`;
      main.append(ef, dims);

      const sub = document.createElement('div');
      sub.className = 'history-sub';
      sub.textContent = formatTime(entry.ts) + (entry.note ? `・${entry.note}` : '');

      load.append(main, sub);
      load.addEventListener('click', () => {
        const toUnit = (cm) => String(unit === 'mm' ? round2(cm * 10) : round2(cm));
        ddInput.value = toUnit(entry.d);
        dsInput.value = toUnit(entry.s);
        base = snapshot(entry);
        onInput({ autosave: false });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'history-del';
      del.setAttribute('aria-label', '刪除這筆紀錄');
      del.textContent = '×';
      del.addEventListener('click', () => {
        store.history = store.history.filter((h) => h.id !== entry.id);
        persist();
        renderHistory();
      });

      li.append(load, del);
      historyList.appendChild(li);
    });
  }

  function sameValue(a, b) {
    return Math.abs(a - b) < 1e-6;
  }

  // The values currently on screen as last saved / restored / loaded.
  let base = null; // { d, s }
  const EDIT_WINDOW_MS = 60 * 1000;

  function snapshot(h) {
    return { d: h.d, s: h.s };
  }

  function countChanged(a, b) {
    return (sameValue(a.d, b.d) ? 0 : 1) + (sameValue(a.s, b.s) ? 0 : 1);
  }

  function newEntry(r, prev) {
    const changedOne = prev && countChanged(prev, r) === 1;
    return {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      ...r,
      // Which single field differs from the previous values, if only one
      // does: a possibly half-entered measurement.
      partial: changedOne ? (sameValue(prev.d, r.d) ? 's' : 'd') : null,
      prev: changedOne ? snapshot(prev) : null,
    };
  }

  // Every settled result is saved. The previous measurement's values stay in
  // the fields, so entering a new one passes through a mixed state (new
  // LVIDd + old LVIDs). Measurements are entered LVIDd first, so:
  //   - Only LVIDd changed → a new entry, provisional until LVIDs follows;
  //     further edits within a minute update that entry instead of adding.
  //   - Only LVIDs changed within a minute of saving → a correction to the
  //     entry just saved, updated in place.
  //   - Both changed → a new entry.
  function saveCurrent() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!lastResult) return;
    const r = lastResult;
    if (base && countChanged(base, r) === 0) return;

    const latest = store.history[0];
    const editable = latest && base && countChanged(base, latest) === 0 &&
      Date.now() - latest.ts < EDIT_WINDOW_MS;
    const onlyS = latest && sameValue(latest.d, r.d) && !sameValue(latest.s, r.s);

    if (editable && latest.partial === 'd') {
      // Finishing (or re-editing) a half-entered measurement
      if (countChanged(latest.prev, r) === 0) {
        store.history.shift();
      } else {
        Object.assign(latest, newEntry(r, latest.prev), { id: latest.id });
      }
    } else if (editable && onlyS) {
      // Correcting LVIDs of the entry just saved
      Object.assign(latest, r, { ts: Date.now() });
    } else {
      store.history.unshift(newEntry(r, base));
      store.history = store.history.slice(0, MAX_HISTORY);
    }
    base = snapshot(r);
    persist();
    renderHistory();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = lastResult ? setTimeout(saveCurrent, AUTOSAVE_DELAY_MS) : null;
  }

  function flushPendingSave() {
    if (saveTimer) saveCurrent();
  }

  function onInput({ autosave = true } = {}) {
    store.lvidd = ddInput.value;
    store.lvids = dsInput.value;
    persist();
    calculate();
    if (autosave) scheduleSave();
    else clearTimeout(saveTimer);
  }

  function convertInputValue(input, fromUnit, toUnit) {
    const raw = parseFloat(input.value);
    if (Number.isNaN(raw)) return;
    const cm = fromUnit === 'mm' ? raw / 10 : raw;
    const converted = toUnit === 'mm' ? cm * 10 : cm;
    input.value = round2(converted);
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function setUnit(newUnit) {
    if (newUnit === unit) return;
    convertInputValue(ddInput, unit, newUnit);
    convertInputValue(dsInput, unit, newUnit);
    unit = newUnit;
    unitLabelD.textContent = unit;
    unitLabelS.textContent = unit;

    unitButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.unit === unit);
    });

    store.unit = unit;
    onInput({ autosave: false });
    renderHistory();
  }

  unitButtons.forEach(btn => {
    btn.addEventListener('click', () => setUnit(btn.dataset.unit));
  });

  ddInput.addEventListener('input', () => onInput());
  dsInput.addEventListener('input', () => onInput());
  // Save right away when the user leaves a field or the app, instead of
  // losing a pending result.
  ddInput.addEventListener('blur', flushPendingSave);
  dsInput.addEventListener('blur', flushPendingSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSave();
  });
  window.addEventListener('pagehide', flushPendingSave);
  historyClear.addEventListener('click', () => {
    if (!confirm('確定要清除所有計算紀錄嗎？此動作無法復原。')) return;
    store.history = [];
    persist();
    renderHistory();
  });

  // Restore last session
  unit = store.unit;
  unitLabelD.textContent = unit;
  unitLabelS.textContent = unit;
  unitButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.unit === unit));
  ddInput.value = store.lvidd;
  dsInput.value = store.lvids;
  calculate();
  if (lastResult) base = snapshot(lastResult);
  renderHistory();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
