(() => {
  const ddInput = document.getElementById('lvidd');
  const dsInput = document.getElementById('lvids');
  const unitLabelD = document.getElementById('unit-label-d');
  const unitLabelS = document.getElementById('unit-label-s');
  const unitButtons = document.querySelectorAll('.unit-btn');
  const warningEl = document.getElementById('warning');
  const resultsEl = document.getElementById('results');

  const saveRow = document.getElementById('save-row');
  const saveNote = document.getElementById('save-note');
  const saveBtn = document.getElementById('save-btn');
  const historyCard = document.getElementById('history-card');
  const historyList = document.getElementById('history-list');
  const historyClear = document.getElementById('history-clear');

  let unit = 'cm'; // 'cm' | 'mm', current display unit
  let lastResult = null; // most recent valid calculation, for saving

  // ---- Local persistence (device-only, never leaves the browser) ----
  const STORE_KEY = 'lvef-calculator:v1';
  const MAX_HISTORY = 10;

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

  // EF categories per the heart-failure classification of the 2021 ESC
  // and 2022 AHA/ACC/HFSA guidelines: ≤40% reduced (HFrEF range),
  // 41–49% mildly reduced (HFmrEF), ≥50% preserved (HFpEF). Sex-neutral.
  const EF_BANDS = [
    { test: (v) => v >= 50, label: 'EF 保留', cls: 'severity-normal' },
    { test: (v) => v > 40, label: 'EF 輕度降低', cls: 'severity-mild' },
    { test: () => true, label: 'EF 降低', cls: 'severity-severe' },
  ];

  // Fractional shortening bands (ASE 2005; no heart-failure equivalent)
  const FS_BANDS = [
    { test: (v) => v >= 25, label: '正常', cls: 'severity-normal' },
    { test: (v) => v >= 20, label: '輕度降低', cls: 'severity-mild' },
    { test: (v) => v >= 15, label: '中度降低', cls: 'severity-moderate' },
    { test: () => true, label: '重度降低', cls: 'severity-severe' },
  ];

  // Classify the value as displayed (1 decimal), so a result shown as
  // "50.0 %" is never labelled differently from what the reader sees.
  function classify(value, bands) {
    const shown = Math.round(value * 10) / 10;
    return bands.find(b => b.test(shown));
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

  function calculate() {
    const { dRaw, sRaw } = getInputs();

    lastResult = null;
    saveRow.hidden = true;

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

    // Teichholz
    const edv = (7.0 / (2.4 + d)) * Math.pow(d, 3);
    const esv = (7.0 / (2.4 + s)) * Math.pow(s, 3);
    const teichholzEF = ((edv - esv) / edv) * 100;

    // Quinones cube formula
    const quinonesEF = ((Math.pow(d, 3) - Math.pow(s, 3)) / Math.pow(d, 3)) * 100;

    // Fractional shortening
    const fs = ((d - s) / d) * 100;

    renderResult('teichholz', teichholzEF, EF_BANDS);
    renderResult('quinones', quinonesEF, EF_BANDS);
    renderResult('fs', fs, FS_BANDS);

    resultsEl.hidden = false;

    lastResult = { d, s, teichholz: teichholzEF, quinones: quinonesEF, fs };
    saveRow.hidden = false;
    const saved = isSameAsLatest(lastResult);
    saveBtn.disabled = saved;
    saveBtn.textContent = saved ? '已記錄' : '記錄';
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
        onInput();
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

  // Same diameters as the most recent record: nothing new to save
  function isSameAsLatest(r) {
    const latest = store.history[0];
    return !!latest && Math.abs(latest.d - r.d) < 1e-6 && Math.abs(latest.s - r.s) < 1e-6;
  }

  function saveCurrent() {
    if (!lastResult || isSameAsLatest(lastResult)) return;
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ts: Date.now(),
      note: saveNote.value.trim(),
      ...lastResult,
    };
    store.history.unshift(entry);
    store.history = store.history.slice(0, MAX_HISTORY);
    persist();
    renderHistory();
    saveNote.value = '';
    saveBtn.disabled = true;
    saveBtn.textContent = '已記錄';
  }

  function onInput() {
    store.lvidd = ddInput.value;
    store.lvids = dsInput.value;
    persist();
    calculate();
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
    onInput();
    renderHistory();
  }

  unitButtons.forEach(btn => {
    btn.addEventListener('click', () => setUnit(btn.dataset.unit));
  });

  ddInput.addEventListener('input', onInput);
  dsInput.addEventListener('input', onInput);
  saveBtn.addEventListener('click', saveCurrent);
  saveNote.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCurrent();
  });
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
  renderHistory();

  // ---- Help sheet ----
  const helpSheet = document.getElementById('help-sheet');
  const helpOpen = document.getElementById('help-open');
  const helpClose = document.getElementById('help-close');

  helpOpen.addEventListener('click', () => {
    helpSheet.showModal();
    helpSheet.querySelector('.help-body').scrollTop = 0;
  });
  helpClose.addEventListener('click', () => helpSheet.close());
  // Tapping the dimmed area outside the sheet closes it
  helpSheet.addEventListener('click', (e) => {
    if (e.target === helpSheet) helpSheet.close();
  });

  if ('serviceWorker' in navigator) {
    // Reload once when a new version takes over, so the update shows
    // immediately instead of on some later launch. Skip the very first
    // install (no previous controller), which needs no reload.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
        // Home-screen apps are often resumed rather than relaunched, which
        // skips the browser's own update check, so check on every return.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      }).catch(() => {});
    });
  }
})();
