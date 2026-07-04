/* Always Online for Mattermost - popup UI */

const api = globalThis.browser || globalThis.chrome;

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];                 // Mon-first display order
const DAY_KEY = { 0: 'daySun', 1: 'dayMon', 2: 'dayTue', 3: 'dayWed', 4: 'dayThu', 5: 'dayFri', 6: 'daySat' };
const STATUS_KEY = { online: 'statusOnline', away: 'statusAway', dnd: 'statusDnd', offline: 'statusOffline' };
const INTERVALS = [1, 2, 3, 5];
const VIEWS = { main: 'viewMain', settings: 'viewSettings', data: 'viewData' };

let settings = withDefaults(null);
let lastSession = null;
let MESSAGES = {};
const dropdowns = {};

document.addEventListener('DOMContentLoaded', init);

/* ---------------- i18n (runtime, overridable) ---------------- */

function effectiveLang() {
  const l = settings.language;
  if (l === 'en' || l === 'de') return l;
  const ui = (api.i18n && api.i18n.getUILanguage && api.i18n.getUILanguage()) || 'en';
  return ui.toLowerCase().startsWith('de') ? 'de' : 'en';
}

async function loadMessages(lang) {
  try {
    const url = (api.runtime.getURL ? api.runtime.getURL('_locales/' + lang + '/messages.json') : '_locales/' + lang + '/messages.json');
    MESSAGES = await (await fetch(url)).json();
  } catch (_) { MESSAGES = {}; }
}

function t(key, subs) {
  const e = MESSAGES[key];
  if (!e) return key;
  let msg = e.message;
  const ph = e.placeholders || {};
  const arr = subs == null ? [] : (Array.isArray(subs) ? subs : [subs]);
  for (const name in ph) {
    const idx = parseInt(String(ph[name].content).replace('$', ''), 10) - 1;
    msg = msg.replace(new RegExp('\\$' + name + '\\$', 'gi'), arr[idx] != null ? arr[idx] : '');
  }
  return msg;
}

function applyStaticI18n() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const msg = t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  }
}

/* ---------------- theme ---------------- */

function effectiveTheme() {
  const th = settings.theme;
  if (th === 'light' || th === 'dark') return th;
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function applyTheme() { document.documentElement.dataset.theme = effectiveTheme(); }

/* ---------------- view router ---------------- */

function showView(name) {
  closeDropdowns();
  if (name !== 'data') disarmDelete();
  for (const key in VIEWS) {
    const el = document.getElementById(VIEWS[key]);
    const on = key === name;
    el.hidden = !on;
    if (on) { el.classList.remove('slide'); void el.offsetWidth; el.classList.add('slide'); }
  }
  if (name === 'data') renderData();
}

/* ---------------- init ---------------- */

async function init() {
  settings = withDefaults((await api.storage.local.get(STORAGE.settings))[STORAGE.settings]);
  applyTheme();
  await loadMessages(effectiveLang());

  document.getElementById('version').textContent = 'v' + api.runtime.getManifest().version;
  buildDropdowns();
  buildDayChips();
  applyStaticI18n();
  wireEvents();

  await detectFromActiveTab();
  await loadAll();
  api.runtime.sendMessage({ type: 'refresh' }); // pull a fresh status read on open

  api.storage.onChanged.addListener((_c, area) => { if (area === 'local') loadAll(); });
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (settings.theme === 'system') applyTheme();
    });
  }
}

async function loadAll() {
  const store = await api.storage.local.get([STORAGE.settings, STORAGE.session, STORAGE.stats]);
  settings = withDefaults(store[STORAGE.settings]);
  applyTheme();
  renderSettings();
  renderStatus(store[STORAGE.session], store[STORAGE.stats]);
}

/* ---------------- rendering ---------------- */

function renderStatus(session, stats) {
  stats = stats || {};
  lastSession = session || null;
  const status = stats.lastStatus || 'unknown';

  document.getElementById('statusDot').className = 'status-dot s-' + status;
  document.getElementById('statusLabel').textContent = t(STATUS_KEY[status] || 'statusUnknown');
  document.getElementById('instance').textContent = (session && session.domain) || t('notDetected');
  document.getElementById('lastCheck').textContent = stats.lastCheck ? formatTime(stats.lastCheck) : t('never');
  document.getElementById('corrections').textContent = stats.corrections || 0;
  updateHint();
}

// Master hint depends only on settings + known session, so it refreshes instantly.
function updateHint() {
  const hint = document.getElementById('masterHint');
  if (!settings.enabled) hint.textContent = t('hintOff');
  else if (!lastSession || !lastSession.domain) hint.textContent = t('hintWaiting');
  else if (!isWithinSchedule(settings.schedule, new Date())) hint.textContent = t('hintPaused');
  else hint.textContent = t('hintActive');
}

function renderSettings() {
  document.body.classList.toggle('is-on', settings.enabled);
  document.getElementById('brandIcon').src = settings.enabled ? 'icons/icon-on.png' : 'icons/icon-off.png';

  document.getElementById('enabledSwitch').checked = settings.enabled;
  document.getElementById('respectDnd').checked = settings.respectDnd;
  document.getElementById('scheduleEnabled').checked = settings.schedule.enabled;
  document.getElementById('scheduleBody').style.display = settings.schedule.enabled ? '' : 'none';
  document.getElementById('startTime').value = minutesToTime(settings.schedule.startMinutes);
  document.getElementById('endTime').value = minutesToTime(settings.schedule.endMinutes);

  for (const chip of document.querySelectorAll('.day-chip')) {
    chip.classList.toggle('active', settings.schedule.days.includes(Number(chip.dataset.day)));
  }
  for (const k in dropdowns) dropdowns[k].render();
}

function buildDayChips() {
  const box = document.getElementById('days');
  box.innerHTML = '';
  for (const d of DAY_ORDER) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'day-chip';
    chip.dataset.day = String(d);
    chip.textContent = t(DAY_KEY[d]);
    chip.addEventListener('click', () => {
      const days = new Set(settings.schedule.days);
      days.has(d) ? days.delete(d) : days.add(d);
      settings.schedule.days = [...days].sort((a, b) => a - b);
      save();
    });
    box.appendChild(chip);
  }
}

/* ---------------- custom dropdowns ---------------- */

function buildDropdowns() {
  dropdowns.interval = makeDropdown(document.getElementById('ddInterval'),
    () => INTERVALS.map((n) => ({ value: String(n), label: t('intervalEvery', [String(n)]) })),
    () => String(settings.intervalMinutes),
    (v) => { settings.intervalMinutes = Number(v); save(); });

  dropdowns.theme = makeDropdown(document.getElementById('ddTheme'),
    () => [{ value: 'system', label: t('optSystem') }, { value: 'light', label: t('themeLight') }, { value: 'dark', label: t('themeDark') }],
    () => settings.theme,
    (v) => { settings.theme = v; applyTheme(); save(); });

  dropdowns.lang = makeDropdown(document.getElementById('ddLang'),
    () => [{ value: 'system', label: t('optSystem') }, { value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }],
    () => settings.language,
    (v) => setLanguage(v));

  document.addEventListener('click', closeDropdowns);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdowns(); });
}

function closeDropdowns() { for (const k in dropdowns) dropdowns[k].close(); }

function makeDropdown(root, getItems, getValue, onSelect) {
  root.innerHTML =
    '<button class="dd-btn" type="button" aria-haspopup="listbox" aria-expanded="false">' +
    '<span class="dd-val"></span><span class="dd-chev" aria-hidden="true"></span></button>' +
    '<ul class="dd-menu" role="listbox" hidden></ul>';
  const btn = root.querySelector('.dd-btn');
  const valEl = root.querySelector('.dd-val');
  const menu = root.querySelector('.dd-menu');

  function render() {
    const items = getItems(), cur = getValue();
    const active = items.find((i) => i.value === cur);
    valEl.textContent = active ? active.label : '';
    menu.innerHTML = '';
    for (const it of items) {
      const li = document.createElement('li');
      li.className = 'dd-opt' + (it.value === cur ? ' sel' : '');
      li.setAttribute('role', 'option');
      li.textContent = it.label;
      li.addEventListener('click', (e) => { e.stopPropagation(); close(); onSelect(it.value); });
      menu.appendChild(li);
    }
  }
  function open() { closeDropdowns(); render(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? open() : close(); });

  render();
  return { render, close };
}

async function setLanguage(v) {
  settings.language = v;
  await api.storage.local.set({ [STORAGE.settings]: settings });
  await loadMessages(effectiveLang());
  applyStaticI18n();
  buildDayChips();
  await loadAll();
}

/* ---------------- events ---------------- */

function wireEvents() {
  document.getElementById('enabledSwitch').addEventListener('change', (e) => { settings.enabled = e.target.checked; save(); });
  document.getElementById('respectDnd').addEventListener('change', (e) => { settings.respectDnd = e.target.checked; save(); });
  document.getElementById('scheduleEnabled').addEventListener('change', (e) => { settings.schedule.enabled = e.target.checked; save(); });
  document.getElementById('startTime').addEventListener('change', (e) => { settings.schedule.startMinutes = timeToMinutes(e.target.value); save(); });
  document.getElementById('endTime').addEventListener('change', (e) => { settings.schedule.endMinutes = timeToMinutes(e.target.value); save(); });
  document.getElementById('recheckBtn').addEventListener('click', async () => {
    document.getElementById('statusLabel').textContent = t('checking');
    await detectFromActiveTab();
    api.runtime.sendMessage({ type: 'refresh' });
    setTimeout(loadAll, 900); // fallback re-render in case nothing changed in storage
  });
  document.getElementById('deleteData').addEventListener('click', onDelete);

  for (const b of document.querySelectorAll('[data-nav]')) {
    b.addEventListener('click', () => showView(b.dataset.nav));
  }
}

function save() {
  api.storage.local.set({ [STORAGE.settings]: settings });
  renderSettings();
  updateHint();
}

/* ---------------- stored-data view ---------------- */

async function renderData() {
  const store = await api.storage.local.get([STORAGE.session, STORAGE.stats]);
  const s = store[STORAGE.session];
  const list = document.getElementById('dataList');
  if (!s || !s.domain) {
    list.innerHTML = '<div class="data-empty">' + esc(t('noData')) + '</div>';
  } else {
    const token = s.authToken ? s.authToken.slice(0, 8) + '…' : '-'; // redacted
    list.innerHTML =
      item(t('labelInstance'), s.domain) +
      item(t('labelUser'), s.userId || '-') +
      item(t('labelToken'), token) +
      item(t('labelCorrections'), String((store[STORAGE.stats] || {}).corrections || 0));
  }
  disarmDelete();
}
function item(dt, dd) { return '<div class="item"><dt>' + esc(dt) + '</dt><dd>' + esc(dd) + '</dd></div>'; }
function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function disarmDelete() {
  const b = document.getElementById('deleteData');
  b.classList.remove('armed');
  b.textContent = t('deleteData');
}
async function onDelete() {
  const b = document.getElementById('deleteData');
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = t('confirmDelete'); return; }
  await api.storage.local.remove([STORAGE.session, STORAGE.stats]);
  lastSession = null;
  await renderData();
  await loadAll();
}

/* ---------------- helpers ---------------- */

async function detectFromActiveTab() {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    const host = new URL(tab.url).hostname;
    const cookies = await api.cookies.getAll({ domain: host });
    let authToken = null, userId = null;
    for (const c of cookies) {
      if (c.name === 'MMAUTHTOKEN') authToken = c.value;
      if (c.name === 'MMUSERID') userId = c.value;
    }
    if (authToken && userId) await api.storage.local.set({ [STORAGE.session]: { domain: host, userId, authToken } });
  } catch (_) { /* not a Mattermost tab, ignore */ }
}

function minutesToTime(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function timeToMinutes(str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function formatTime(epoch) {
  const diff = Math.round((Date.now() - epoch) / 1000);
  let rel;
  if (diff < 5) rel = t('justNow');
  else if (diff < 60) rel = t('secondsAgo', [String(diff)]);
  else if (diff < 3600) rel = t('minutesAgo', [String(Math.floor(diff / 60))]);
  else rel = t('hoursAgo', [String(Math.floor(diff / 3600))]);
  return new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '  ' + rel;
}
