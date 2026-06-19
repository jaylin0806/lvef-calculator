(() => {
  const ddInput = document.getElementById('lvidd');
  const dsInput = document.getElementById('lvids');
  const unitLabelD = document.getElementById('unit-label-d');
  const unitLabelS = document.getElementById('unit-label-s');
  const unitButtons = document.querySelectorAll('.unit-btn');
  const warningEl = document.getElementById('warning');
  const resultsEl = document.getElementById('results');

  let unit = 'cm'; // 'cm' | 'mm', current display unit

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

  function calculate() {
    const { dRaw, sRaw } = getInputs();

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

    calculate();
  }

  unitButtons.forEach(btn => {
    btn.addEventListener('click', () => setUnit(btn.dataset.unit));
  });

  ddInput.addEventListener('input', calculate);
  dsInput.addEventListener('input', calculate);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
