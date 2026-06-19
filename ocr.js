(() => {
  const fileInput = document.getElementById('ocr-file');
  const uploadLabel = document.getElementById('ocr-upload-label');
  const previewWrap = document.getElementById('ocr-preview-wrap');
  const previewImg = document.getElementById('ocr-preview');
  const statusEl = document.getElementById('ocr-status');
  const candidatesEl = document.getElementById('ocr-candidates');

  const ddInput = document.getElementById('lvidd');
  const dsInput = document.getElementById('lvids');

  let workerPromise = null;

  function setStatus(msg) {
    if (!msg) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = msg;
  }

  function clearCandidates() {
    candidatesEl.hidden = true;
    candidatesEl.innerHTML = '';
  }

  function getWorker() {
    if (!workerPromise) {
      setStatus('載入辨識引擎中（第一次使用需下載約 9MB，之後可離線使用）...');
      workerPromise = Tesseract.createWorker('eng', 1, {
        workerPath: 'vendor/worker.min.js',
        corePath: 'vendor/tesseract-core-simd-lstm.wasm.js',
        langPath: 'vendor/tessdata',
        gzip: true,
      }).then((worker) => worker.setParameters({
        tessedit_char_whitelist: '0123456789.',
        // Sparse-text mode: the preprocessed image is mostly blank with a few
        // scattered number labels, not a uniform block of text.
        tessedit_pageseg_mode: '11',
      }).then(() => worker));
    }
    return workerPromise;
  }

  // Ultrasound machine overlays (calipers, measurement text) are either
  // strongly colored (yellow/green/cyan) or near-white, while the grayscale
  // scan trace underneath stays low-saturation even with a photo's color
  // cast and JPEG noise. Isolating by saturation + brightness (rather than
  // plain luminance) turns just the overlay into clean black-on-white text,
  // which OCR handles far more reliably than the noisy trace underneath.
  function preprocess(img) {
    const maxDim = 2600;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max - min;
      const isForeground = saturation > 50 || min > 200;
      const v = isForeground ? 0 : 255;
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // Decimal numbers (e.g. "3.95") are the primary candidate measurements.
  // This naturally excludes patient/record IDs, which are typically long
  // integer strings without a decimal point.
  //
  // Fallback: a caliper's dashed line frequently crosses right through the
  // decimal point, so OCR sometimes reads "2.52" as the bare digit run
  // "252". A standalone 3-digit run is reinterpreted as X.XX in that case.
  function extractCandidates(text) {
    const nums = [];

    const decimalMatches = text.match(/\d{1,2}\.\d{1,2}/g) || [];
    decimalMatches.forEach((m) => {
      const n = Number(m);
      if (n >= 0.5 && n <= 12) {
        nums.push(n);
      } else if (m.length > 1) {
        // A stray digit (e.g. from a nearby caliper mark) sometimes merges
        // onto the front of the real number. If dropping it lands back in
        // the plausible range, it's likely the real measurement.
        const trimmed = Number(m.slice(1));
        if (!Number.isNaN(trimmed) && trimmed >= 0.5 && trimmed <= 12) {
          nums.push(trimmed);
        }
      }
    });

    const threeDigitMatches = text.match(/\b\d{3}\b/g) || [];
    threeDigitMatches.forEach((m) => {
      const n = Number(m) / 100;
      if (n >= 0.5 && n <= 12) nums.push(n);
    });

    return [...new Set(nums)].sort((a, b) => b - a);
  }

  function fillField(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderCandidates(nums) {
    clearCandidates();

    if (nums.length === 0) {
      setStatus('沒有辨識到數值，請手動輸入，或換一張更清楚的截圖');
      return;
    }

    candidatesEl.hidden = false;
    setStatus(`辨識到 ${nums.length} 個候選數值，請對照原圖點選對應欄位（辨識結果可能有誤，務必確認）`);

    nums.forEach((n) => {
      const chip = document.createElement('div');
      chip.className = 'ocr-chip';

      const label = document.createElement('span');
      label.className = 'ocr-chip-value';
      label.textContent = `${n.toFixed(2)} cm`;
      chip.appendChild(label);

      const btnD = document.createElement('button');
      btnD.type = 'button';
      btnD.textContent = '→ LVIDd';
      btnD.addEventListener('click', () => fillField(ddInput, n.toFixed(2)));

      const btnS = document.createElement('button');
      btnS.type = 'button';
      btnS.textContent = '→ LVIDs';
      btnS.addEventListener('click', () => fillField(dsInput, n.toFixed(2)));

      chip.appendChild(btnD);
      chip.appendChild(btnS);
      candidatesEl.appendChild(chip);
    });
  }

  function handleFile(file) {
    if (!file) return;

    clearCandidates();
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    previewWrap.hidden = false;

    const img = new Image();
    img.onload = async () => {
      try {
        setStatus('辨識中...');
        uploadLabel.textContent = '辨識中...';
        const canvas = preprocess(img);
        const worker = await getWorker();
        const { data } = await worker.recognize(canvas);
        const nums = extractCandidates(data.text);
        renderCandidates(nums);
      } catch (err) {
        setStatus(`辨識失敗：${err && err.message ? err.message : '請重試或手動輸入'}`);
      } finally {
        uploadLabel.textContent = '選擇截圖';
      }
    };
    img.src = url;
  }

  fileInput.addEventListener('change', () => {
    handleFile(fileInput.files[0]);
    fileInput.value = '';
  });
})();
