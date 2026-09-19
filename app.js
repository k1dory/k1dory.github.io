const screen = document.querySelector('#screen');
const panels = document.querySelector('#panels');
const tabs = [...document.querySelectorAll('[data-section]')];
const sections = [...document.querySelectorAll('[role="tabpanel"]')];
const soundButton = document.querySelector('#sound');
const powerButton = document.querySelector('#power');
const commands = ['whoami', 'cat /etc/toolbox.conf', 'ls ~/projects', 'git log --oneline', 'connect --secure'];
const state = { section: 0, project: 0, powered: false, booting: false, sound: false, audio: null, timers: [], interacted: false };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Inverse barrel mapping: every pixel of the UI (including text and scanlines)
// samples the same curved surface. Red/green encode horizontal/vertical offsets.
function updateCurvature() {
  const surface = document.querySelector('#crt-surface');
  const width = surface.clientWidth;
  const height = surface.clientHeight;
  if (!width || !height) return;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(1024, Math.ceil(width));
  canvas.height = Math.min(768, Math.ceil(height));
  const context = canvas.getContext('2d');
  if (!context) return;
  const map = context.createImageData(canvas.width, canvas.height);
  const bend = .04;
  const scale = Math.max(width, height) * bend + 2;
  for (let y = 0; y < canvas.height; y++) {
    const ny = (y + .5) / canvas.height * 2 - 1;
    // Keep the lower half especially calm: footer and small text stay legible.
    const lower = Math.max(0, ny);
    const strength = 1 - .5 * lower * lower * (3 - 2 * lower);
    for (let x = 0; x < canvas.width; x++) {
      const nx = (x + .5) / canvas.width * 2 - 1;
      const offset = (y * canvas.width + x) * 4;
      map.data[offset] = Math.round(255 * (.5 + nx * ny * ny * bend * strength * width / (2 * scale)));
      map.data[offset + 1] = Math.round(255 * (.5 + ny * nx * nx * bend * strength * height / (2 * scale)));
      map.data[offset + 2] = 128;
      map.data[offset + 3] = 255;
    }
  }
  context.putImageData(map, 0, 0);
  document.querySelector('#crt-map').setAttribute('href', canvas.toDataURL());
  document.querySelector('#crt-displacement').setAttribute('scale', String(scale));
  surface.classList.add('curved');
}

// Each section is one terminal screen. Fit its complete layout; never scroll it.
function fitPanel() {
  const panel = sections[state.section];
  const available = panels.clientHeight - 3;
  const width = panels.clientWidth;
  if (!available || !width) return;
  const measure = (scale) => {
    panel.style.width = `${width / scale}px`;
    panel.style.transform = `scale(${scale})`;
    return Math.max(panel.scrollHeight, panel.offsetHeight) * scale;
  };
  if (measure(1) <= available) return;
  let low = .25;
  let high = 1;
  for (let i = 0; i < 9; i++) {
    const middle = (low + high) / 2;
    if (measure(middle) <= available) low = middle;
    else high = middle;
  }
  measure(low);
}

let resizeFrame;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { fitPanel(); updateCurvature(); });
}).observe(document.querySelector('#crt-surface'));
document.fonts.ready.then(fitPanel);

function status(message) {
  document.querySelector('#terminal-status').textContent = message;
}

// Section 03 is a rotating reel: the focused project is largest and centered,
// neighbours shrink and fade, and Up/Down cycle through them like a wheel.
const projects = [
  { n: '001', title: 'С SaaS на on-prem', meta: 'ON-PREM / 2026', desc: 'Перенёс инфраструктуру с облачных SaaS на собственный on-prem. Меньше зависимости от вендора, полный контроль, ниже операционные расходы.', tech: 'PROXMOX · DOCKER · ANSIBLE', metric: 'КОСТ ↓' },
  { n: '002', title: 'Платформа логов с AI-наблюдателем', meta: 'PLATFORM / 2026', desc: 'Единый event-log и AI-аналитик, который разбирает алерт сам — без ожидания дежурного. Обновления прилетают в консоль вместо ручного разбора.', tech: 'CLICKHOUSE · SIEM · LLM', metric: 'РАЗБОР −1.5 Ч · КОСТ −20%' },
  { n: '003', title: 'Бэкапы, устойчивые к шифровальщику', meta: 'STORAGE / 2026', desc: 'Автоматически масштабированное резервное копирование 80+ машин на три независимых узла. Взломанный гипервизор не может стереть свои копии. Развёрнуто из git за 3 дня.', tech: 'PROXMOX PBS · ANSIBLE', metric: '8 → 32 ПОД ЗАЩИТОЙ' },
  { n: '004', title: 'Self-service провижининг', meta: 'PLATFORM / 2026', desc: 'Заявка от разработчика — и дальше сами: ВМ, харденинг, репозиторий, CI и автодеплой. Без ручного участия администратора.', tech: 'ANSIBLE · NETBOX · CI/CD', metric: 'ЗАЯВКА → PROD ~3 МИН' },
  { n: '005', title: 'Zero-trust доступ на 500+ человек', meta: 'SECURITY / 2026', desc: 'Единый вход, обязательный второй фактор, доступ по умолчанию запрещён. Отключил человека в одном месте — доступ пропал везде.', tech: 'SSO · IDP · VPN', metric: '500+ ПОЛЬЗОВАТЕЛЕЙ' },
  { n: '006', title: 'Восстановление контура за 3 часа', meta: 'NETWORK / 2026', desc: 'Полная потеря внешнего канала и всех публикаций. Поднял новый пограничный маршрутизатор и вернул 80+ сервисов, не трогая клиентские машины.', tech: 'LINUX · NFTABLES · BGP', metric: 'DOWN → UP: 18 Ч' },
];
const reel = document.querySelector('#reel');
const reelDetail = document.querySelector('#reel-detail');
const reelSlots = [{ p: 0, s: 1.3, o: 1 }, { p: 50, s: .82, o: .5 }, { p: 86, s: .58, o: .22 }];

function renderReel() {
  if (!reel) return;
  const total = projects.length;
  reel.innerHTML = '';
  projects.forEach((pr, i) => {
    let off = i - state.project;
    if (off > total / 2) off -= total;
    if (off < -total / 2) off += total;
    const distance = Math.abs(off);
    if (distance > 2) return;
    const slot = reelSlots[distance];
    const item = document.createElement('div');
    item.className = 'reel-item' + (off === 0 ? ' focus' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(off === 0));
    item.innerHTML = `<span class="rn">${pr.n}</span><span class="rt">${pr.title}</span>`;
    const pos = off === 0 ? 0 : (off < 0 ? -slot.p : slot.p);
    item.style.top = `calc(50% + ${pos}px)`;
    item.style.transform = `translateY(-50%) scale(${slot.s})`;
    item.style.opacity = String(slot.o);
    item.style.zIndex = String(10 - distance);
    item.addEventListener('click', () => { if (state.project !== i) { state.project = i; renderReel(); beep(560 + i * 40); } });
    reel.appendChild(item);
  });
  const pr = projects[state.project];
  reelDetail.innerHTML = `<div class="rd-head"><h3>${pr.title}</h3><span class="rd-ctx">${pr.meta}</span></div><p>${pr.desc}</p><div class="rd-bottom"><span>${pr.tech}</span><strong>${pr.metric} ↗</strong></div>`;
}

function moveProject(direction) {
  state.project = (state.project + direction + projects.length) % projects.length;
  renderReel();
  beep(560 + state.project * 40);
}
renderReel();

function updateSound() {
  soundButton.setAttribute('aria-pressed', String(state.sound));
  soundButton.setAttribute('aria-label', state.sound ? 'Выключить звук' : 'Включить звук');
  document.querySelector('#sound-label').textContent = state.sound ? 'ON' : 'OFF';
}

function enableAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return false;
    if (!state.audio) state.audio = new Audio();
    state.audio.resume().catch(() => { state.sound = false; updateSound(); });
    state.sound = true;
    updateSound();
    return true;
  } catch {
    state.sound = false;
    updateSound();
    return false;
  }
}

function beep(frequency = 740, duration = .055, delay = 0, volume = .024) {
  if (!state.sound || !state.audio) return;
  const time = state.audio.currentTime + delay;
  const oscillator = state.audio.createOscillator();
  const gain = state.audio.createGain();
  oscillator.type = 'square';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(volume, time + .006);
  gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
  oscillator.connect(gain);
  gain.connect(state.audio.destination);
  oscillator.start(time);
  oscillator.stop(time + duration + .01);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

function bootSound() {
  beep(180, .12, 0, .018);
  beep(880, .09, .17);
  beep(1320, .13, .32);
}

function startBoot() {
  state.timers.forEach(clearTimeout);
  state.timers = [];
  state.powered = true;
  state.booting = true;
  screen.classList.add('booting');
  screen.classList.remove('reveal', 'powered-off');
  document.querySelector('#screen-content').inert = true;
  document.querySelector('#off-overlay').hidden = true;
  document.querySelector('#boot-overlay').hidden = false;
  document.querySelector('#power-led').classList.remove('off');
  powerButton.setAttribute('aria-label', 'Выключить монитор');
  powerButton.setAttribute('aria-pressed', 'true');
  const lines = ['ILYICHEV BIOS v2.6 / COPYRIGHT 2026', 'MEMORY CHECK ............... 640K OK', 'LOADING SECURE KERNEL ....... OK', 'MOUNTING PERSONAL WORKSPACE . OK', 'ALL SYSTEMS NOMINAL. WELCOME.'];
  const output = document.querySelector('#boot-lines');
  const progress = document.querySelector('.boot-progress span');
  output.textContent = '';
  progress.style.width = '0%';
  bootSound();
  lines.forEach((line, index) => {
    state.timers.push(setTimeout(() => {
      output.textContent += `${line}\n`;
      progress.style.width = `${(index + 1) * 20}%`;
      beep(index === 4 ? 1100 : 420 + index * 100, .04);
    }, reducedMotion ? index * 60 : 180 + index * 330));
  });
  state.timers.push(setTimeout(() => {
    state.booting = false;
    document.querySelector('#boot-overlay').hidden = true;
    document.querySelector('#screen-content').inert = false;
    screen.classList.remove('booting');
    screen.classList.add('reveal');
    fitPanel();
    status('READY. ЖДУ КОМАНДУ.');
    beep(1040, .08);
    beep(1560, .1, .12);
  }, reducedMotion ? 400 : 2100));
}

function togglePower() {
  if (!state.powered) { startBoot(); return; }
  state.timers.forEach(clearTimeout);
  state.powered = false;
  state.booting = false;
  beep(220, .18);
  screen.classList.remove('booting', 'reveal');
  screen.classList.add('powered-off');
  document.querySelector('#screen-content').inert = true;
  document.querySelector('#boot-overlay').hidden = true;
  document.querySelector('#off-overlay').hidden = false;
  document.querySelector('#power-led').classList.add('off');
  powerButton.setAttribute('aria-label', 'Включить монитор');
  powerButton.setAttribute('aria-pressed', 'false');
}

function selectSection(index) {
  if (!state.powered || state.booting) return;
  state.section = (index + tabs.length) % tabs.length;
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === state.section));
    sections[i].hidden = i !== state.section;
  });
  if (sections.some((section) => section.hidden && section.contains(document.activeElement))) {
    document.activeElement.blur();
  }
  fitPanel();
  document.querySelector('#terminal-command').textContent = commands[state.section];
  document.querySelector('#page-label').textContent = `0${state.section + 1} / 05`;
  status('READY. ЖДУ КОМАНДУ.');
  screen.classList.remove('switching');
  void screen.offsetWidth;
  screen.classList.add('switching');
  beep(560 + state.section * 90);
}

document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
  const supported = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', ' ', 'Enter', '1', '2', '3', '4', '5'];
  if (!supported.includes(event.key)) return;
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    if (state.powered && !state.booting && state.section === 2 && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      moveProject(event.key === 'ArrowDown' ? 1 : -1);
    }
    return;
  }
  if (event.key === 'Tab') { if (state.powered) beep(430, .025, 0, .012); return; }
  if (event.key === ' ' && event.target === powerButton) return;
  if (event.key === ' ' && event.target === soundButton) return;
  if (!state.powered) {
    if (event.key === ' ') {
      event.preventDefault();
      if (event.repeat) return;
      if (!state.interacted) { state.interacted = true; enableAudio(); }
      startBoot();
    }
    return;
  }
  if (state.booting) { if (event.key === ' ') event.preventDefault(); return; }
  if (/^[1-5]$/.test(event.key)) {
    event.preventDefault();
    selectSection(Number(event.key) - 1);
  } else if (event.key === ' ' && (event.target === document.body || event.target === document.documentElement)) {
    event.preventDefault();
    status('ВЫБЕРИТЕ РАЗДЕЛ КЛАВИШЕЙ 1–5');
  }
});

// The numbered tabs are indicators. Only digit keys can change sections.
tabs.forEach((tab, index) => {
  tab.tabIndex = -1;
  tab.setAttribute('aria-keyshortcuts', String(index + 1));
  tab.addEventListener('mousedown', (event) => event.preventDefault());
  tab.addEventListener('click', () => status('РАЗДЕЛЫ: ТОЛЬКО КЛАВИШИ 1–5'));
});
screen.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
screen.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
screen.addEventListener('keydown', (event) => {
  if (['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) event.preventDefault();
});

soundButton.addEventListener('click', () => {
  state.interacted = true;
  if (state.sound) { state.sound = false; updateSound(); }
  else if (enableAudio()) beep(880, .07);
});
powerButton.addEventListener('click', () => {
  if (!state.interacted) { state.interacted = true; enableAudio(); }
  togglePower();
});
document.querySelector('#copy-email').addEventListener('click', async (event) => {
  if (event.detail !== 0) { status('TAB → SPACE ДЛЯ КОПИРОВАНИЯ'); return; }
  try {
    await navigator.clipboard.writeText('gordon19009@gmail.com');
    status('EMAIL СКОПИРОВАН');
    beep(1200, .09);
  } catch {
    status('EMAIL: GORDON19009@GMAIL.COM');
  }
});

function updateClock() {
  document.querySelector('#clock').textContent = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date());
}
updateClock();
setInterval(updateClock, 1000);
document.querySelector('#power-led').classList.add('off');
powerButton.setAttribute('aria-label', 'Включить монитор');
powerButton.setAttribute('aria-pressed', 'false');
fitPanel();
updateCurvature();
