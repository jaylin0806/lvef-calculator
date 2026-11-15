// Additional echo parameters: TAPSE, LA, IVC, mitral E/A, LVOT VTI/SV/CO,
// vena contracta. Each card computes on input; values are remembered on the
// device (not part of the saved records, which hold LV measurements only).
(() => {
  const STORE_KEY = 'lvef-calculator:metrics:v1';
  const inputs = document.querySelectorAll('.metric-input');
  const $ = (id) => document.getElementById(id);

  const BAND = {
    normal: 'severity-normal',
    mild: 'severity-mild',
    moderate: 'severity-moderate',
    severe: 'severity-severe',
  };
  const ALL_BANDS = Object.values(BAND);

  // ---- helpers ----
  function num(id, { allowZero = false } = {}) {
    const v = parseFloat($(id).value);
    if (!Number.isFinite(v)) return null;
    if (v < 0 || (!allowZero && v === 0)) return null;
    return v;
  }

  function round(v, digits) {
    const f = Math.pow(10, digits);
    return Math.round(v * f) / f;
  }

  function setBadge(el, band) {
    el.classList.remove(...ALL_BANDS);
    if (!band) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = band.label;
    if (band.cls) el.classList.add(band.cls);
  }

  function setRow(id, text, band = null) {
    const row = $(id);
    if (text == null) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    row.querySelector('.metric-value').textContent = text;
    const badge = row.querySelector('.badge');
    if (badge) setBadge(badge, band);
  }

  function setWarning(id, msg) {
    const el = $(id);
    el.hidden = !msg;
    el.textContent = msg || '';
  }

  // ---- TAPSE (ASE/EACVI 2015: < 17 mm abnormal) ----
  function calcTapse() {
    const v = num('tapse');
    setBadge($('badge-tapse'), v == null ? null
      : v < 17 ? { label: 'RV 收縮功能降低', cls: BAND.severe }
      : { label: '正常', cls: BAND.normal });
  }

  // ---- LA AP diameter (sex-neutral: > 4.0 cm enlarged) ----
  function calcLa() {
    const v = num('la');
    setBadge($('badge-la'), v == null ? null
      : v > 4.0 ? { label: '擴大', cls: BAND.moderate }
      : { label: '正常', cls: BAND.normal });
  }

  // ---- IVC → RAP (ASE 2010 / 2015) ----
  function calcIvc() {
    const max = num('ivc-max');
    const min = num('ivc-min', { allowZero: true });
    setWarning('warn-ivc', null);
    if (max == null || min == null) {
      setRow('row-ivc-collapse', null);
      setRow('row-ivc-rap', null);
      return;
    }
    if (min > max) {
      setWarning('warn-ivc', '最小直徑不應大於最大直徑，請確認量測值');
      setRow('row-ivc-collapse', null);
      setRow('row-ivc-rap', null);
      return;
    }
    // Classify on the collapse shown (whole %), so "50%" reads as 50.
    const collapse = Math.round(((max - min) / max) * 100);
    setRow('row-ivc-collapse', `${collapse} %`);

    let rap;
    if (max <= 2.1 && collapse > 50) {
      rap = { text: '3 mmHg（0–5）', label: '正常', cls: BAND.normal };
    } else if (max > 2.1 && collapse < 50) {
      rap = { text: '15 mmHg（10–20）', label: '升高', cls: BAND.severe };
    } else {
      rap = { text: '8 mmHg（5–10）', label: '中間值', cls: BAND.mild };
    }
    setRow('row-ivc-rap', rap.text, rap);
  }

  // ---- Mitral E/A (ASE/EACVI 2016, reduced EF / myocardial disease) ----
  function calcEa() {
    const e = num('mv-e');
    const a = num('mv-a');
    const note = $('note-ea');
    if (e == null || a == null) {
      setRow('row-ea', null);
      note.hidden = true;
      return;
    }
    const ratio = round(e / a, 2);
    let band;
    let msg;
    if (ratio >= 2) {
      band = { label: 'LA 壓升高（Grade III）', cls: BAND.severe };
      msg = 'E/A ≥ 2：左心房壓升高，舒張功能障礙第 III 級。';
    } else if (ratio <= 0.8 && e <= 50) {
      band = { label: 'LA 壓正常（Grade I）', cls: BAND.mild };
      msg = 'E/A ≤ 0.8 且 E ≤ 50 cm/s：左心房壓正常，舒張功能障礙第 I 級。';
    } else {
      band = { label: '無法單獨判斷', cls: null };
      msg = '需加上 E/e\'、TR 流速、LAVI 才能判斷左心房壓（這三項需要 TDI、CW 或 LA 容積）。';
    }
    setRow('row-ea', ratio.toFixed(2), band);
    note.hidden = false;
    note.textContent = msg;
  }

  // ---- LVOT VTI / SV / CO ----
  function calcLvot() {
    const vti = num('lvot-vti');
    const d = num('lvot-d');
    const hr = num('hr');

    let warn = null;
    if (d != null && (d < 1.2 || d > 3.5)) {
      warn = 'LVOT 直徑通常在 1.8–2.4 cm 之間，請確認數值與單位（cm）';
    }
    setWarning('warn-lvot', warn);

    // VTI reference values (literature: ~18–22 cm normal, < 15 cm low output)
    setRow('row-vti', vti == null ? null : `${round(vti, 1)} cm`, vti == null ? null
      : vti < 15 ? { label: '低', cls: BAND.severe }
      : vti < 18 ? { label: '偏低', cls: BAND.mild }
      : { label: '正常', cls: BAND.normal });

    const sv = vti != null && d != null ? Math.round(Math.PI * Math.pow(d / 2, 2) * vti) : null;
    setRow('row-sv', sv == null ? null : `${sv} mL`, sv == null ? null
      : sv < 60 ? { label: '偏低', cls: BAND.mild }
      : sv > 100 ? { label: '偏高', cls: BAND.mild }
      : { label: '正常', cls: BAND.normal });

    const co = sv != null && hr != null ? round((sv * hr) / 1000, 1) : null;
    setRow('row-co', co == null ? null : `${co.toFixed(1)} L/min`, co == null ? null
      : co < 4 ? { label: '偏低', cls: BAND.mild }
      : co > 8 ? { label: '偏高', cls: BAND.mild }
      : { label: '正常', cls: BAND.normal });
  }

  // ---- Vena contracta (ASE 2017) ----
  const VC_CUTOFFS = {
    // severe when value >= severeMin (MR/TR) or > severeAbove (AR)
    mr: (v) => (v < 0.3 ? 'mild' : v >= 0.7 ? 'severe' : 'moderate'),
    ar: (v) => (v < 0.3 ? 'mild' : v > 0.6 ? 'severe' : 'moderate'),
    tr: (v) => (v < 0.3 ? 'mild' : v >= 0.7 ? 'severe' : 'moderate'),
  };
  const VC_LABEL = { mild: '輕度', moderate: '中度', severe: '重度' };

  function calcVc() {
    Object.keys(VC_CUTOFFS).forEach((valve) => {
      const v = num(`vc-${valve}`);
      if (v == null) {
        setBadge($(`badge-vc-${valve}`), null);
        return;
      }
      const grade = VC_CUTOFFS[valve](round(v, 2));
      setBadge($(`badge-vc-${valve}`), { label: VC_LABEL[grade], cls: BAND[grade] });
    });
  }

  function calcAll() {
    calcTapse();
    calcLa();
    calcIvc();
    calcEa();
    calcLvot();
    calcVc();
  }

  // ---- memory ----
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }

  const store = load();

  function save() {
    const values = {};
    inputs.forEach((input) => {
      if (input.value !== '') values[input.id] = input.value;
    });
    store.values = values;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (e) { /* storage unavailable: keep working without memory */ }
  }

  // ---- tabs ----
  const tabButtons = document.querySelectorAll('.tab-btn');

  function showTab(name) {
    if (!$(`panel-${name}`)) name = 'lv';
    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== `panel-${name}`;
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      showTab(btn.dataset.tab);
      store.tab = btn.dataset.tab;
      save();
      window.scrollTo({ top: 0 });
    });
  });

  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      calcAll();
      save();
    });
  });

  // Restore last session
  const saved = store.values || {};
  inputs.forEach((input) => {
    if (typeof saved[input.id] === 'string') input.value = saved[input.id];
  });
  showTab(store.tab || 'lv');
  calcAll();
})();
