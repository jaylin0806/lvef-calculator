// On-screen numeric keypad for iPad.
//
// iPadOS has no digits-only system keyboard: inputmode="decimal" still brings
// up the full keyboard on its numbers page. On iPad the numeric fields are
// switched to inputmode="none" (no system keyboard) and this keypad slides up
// instead. iPhone keeps its native decimal pad. A hardware keyboard keeps
// working either way. Add ?keypad=1 / ?keypad=0 to the URL to force it on/off.
(() => {
  function isIpad() {
    const ua = navigator.userAgent;
    // iPadOS 13+ Safari reports itself as a Mac; touch support gives it away.
    return /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  const override = new URLSearchParams(location.search).get('keypad');
  const enabled = override === '1' || (override !== '0' && isIpad());
  if (!enabled) return;

  const fields = Array.from(document.querySelectorAll('input[data-numeric]'));
  fields.forEach((input) => input.setAttribute('inputmode', 'none'));

  // ---- Build the keypad ----
  const pad = document.createElement('div');
  pad.className = 'keypad';
  pad.id = 'keypad';
  pad.hidden = true;
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', '數字鍵盤');
  pad.innerHTML = `
    <div class="keypad-head"><span class="keypad-field" id="keypad-field"></span></div>
    <div class="keypad-grid">
      <button type="button" data-key="7">7</button>
      <button type="button" data-key="8">8</button>
      <button type="button" data-key="9">9</button>
      <button type="button" data-key="back" class="keypad-fn" aria-label="刪除">⌫</button>
      <button type="button" data-key="4">4</button>
      <button type="button" data-key="5">5</button>
      <button type="button" data-key="6">6</button>
      <button type="button" data-key="next" class="keypad-fn keypad-next">下一格</button>
      <button type="button" data-key="1">1</button>
      <button type="button" data-key="2">2</button>
      <button type="button" data-key="3">3</button>
      <button type="button" data-key="0" class="keypad-zero">0</button>
      <button type="button" data-key="." class="keypad-dot">.</button>
      <button type="button" data-key="done" class="keypad-done">完成</button>
    </div>`;
  document.body.appendChild(pad);

  const fieldLabel = pad.querySelector('#keypad-field');
  const dotKey = pad.querySelector('.keypad-dot');
  const nextKey = pad.querySelector('.keypad-next');
  pad.querySelectorAll('button').forEach((btn) => btn.setAttribute('tabindex', '-1'));

  let active = null;
  let hideTimer = null;

  function visibleFields() {
    return fields.filter((input) => input.offsetParent !== null && !input.disabled);
  }

  function labelFor(input) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (!label) return '';
    // Label text without its hint line
    const clone = label.cloneNode(true);
    clone.querySelectorAll('.field-hint').forEach((h) => h.remove());
    const card = input.closest('.metric-card');
    const title = card ? card.querySelector('h2') : null;
    const titleText = title ? title.firstChild.textContent.trim() : '';
    const name = clone.textContent.trim();
    return titleText && titleText !== name ? `${titleText}・${name}` : name;
  }

  function show(input) {
    clearTimeout(hideTimer);
    active = input;
    fieldLabel.textContent = labelFor(input);
    dotKey.disabled = input.dataset.numeric !== 'decimal';
    const list = visibleFields();
    nextKey.disabled = list.indexOf(input) === list.length - 1;

    pad.hidden = false;
    document.body.classList.add('keypad-open');
    document.documentElement.style.setProperty('--keypad-height', `${pad.offsetHeight}px`);

    // Keep the field visible: above the keypad and below the sticky tab bar
    requestAnimationFrame(() => {
      const r = input.getBoundingClientRect();
      const bottomLimit = window.innerHeight - pad.offsetHeight - 16;
      const topLimit = 80;
      if (r.bottom > bottomLimit) {
        window.scrollBy({ top: r.bottom - bottomLimit, behavior: 'smooth' });
      } else if (r.top < topLimit) {
        window.scrollBy({ top: r.top - topLimit, behavior: 'smooth' });
      }
    });
  }

  function hide() {
    active = null;
    pad.hidden = true;
    document.body.classList.remove('keypad-open');
  }

  function emitInput(input) {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insert(text) {
    const input = active;
    if (!input) return;
    if (text === '.' && input.dataset.numeric !== 'decimal') return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.setRangeText(text, start, end, 'end');
    emitInput(input);
  }

  function backspace() {
    const input = active;
    if (!input) return;
    let start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    if (start === end) {
      if (start === 0) return;
      start -= 1;
    }
    input.setRangeText('', start, end, 'end');
    emitInput(input);
  }

  function next() {
    const list = visibleFields();
    const i = list.indexOf(active);
    if (i >= 0 && i < list.length - 1) {
      const target = list[i + 1];
      target.focus();
      const len = target.value.length;
      target.setSelectionRange(len, len);
    } else {
      done();
    }
  }

  function done() {
    if (active) active.blur();
    hide();
  }

  // Keep focus (and the cursor) in the field while keys are tapped.
  pad.addEventListener('pointerdown', (e) => e.preventDefault());
  pad.addEventListener('mousedown', (e) => e.preventDefault());

  pad.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.disabled || !active) return;
    const key = btn.dataset.key;
    if (key === 'back') backspace();
    else if (key === 'next') next();
    else if (key === 'done') done();
    else insert(key);
  });

  function caretToEnd(input) {
    const len = input.value.length;
    try { input.setSelectionRange(len, len); } catch (err) { /* ignore */ }
  }

  // The tap that focuses a field puts the cursor at the end, so keypad digits
  // append (fields are right-aligned, so a tap often lands before the number).
  // Later taps on an already-focused field can place the cursor freely.
  let focusingTap = null;

  document.addEventListener('focusin', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.dataset.numeric) {
      focusingTap = e.target;
      show(e.target);
      caretToEnd(e.target);
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target === focusingTap) caretToEnd(e.target);
    focusingTap = null;
  }, true);

  document.addEventListener('focusout', () => {
    // Wait a tick: focus may be moving to another numeric field
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLInputElement && el.dataset.numeric)) hide();
    }, 50);
  });

  // Switching tabs or opening help hides the keypad
  document.addEventListener('click', (e) => {
    if (e.target.closest('.tab-btn, .help-btn') && active) done();
  });
})();
