/*
 * Always Online for Mattermost - background worker
 *
 * Keeps your Mattermost presence set to "online" by periodically refreshing it
 * through the REST API. Requests authenticate with your existing session cookies
 * (credentials: 'include' + the X-Requested-With header Mattermost accepts as
 * CSRF protection), so nothing is ever sent anywhere but your own instance.
 *
 * Cross-browser: runs as a Chrome MV3 service worker (importScripts) and as a
 * Firefox MV3 background event page (defaults.js loaded via the manifest).
 */

if (typeof importScripts === 'function') importScripts('defaults.js');

const api = globalThis.browser || globalThis.chrome;

const ALARM_NAME = 'ao_keepalive';
const ICON_ON = 'icons/icon-on.png';
const ICON_OFF = 'icons/icon-off.png';

/* ------------------------------------------------------------------ *
 *  Session capture (automatic instance detection)
 * ------------------------------------------------------------------ */

// Every authenticated Mattermost call carries the cookies we need. Watching the
// /api/v4/ traffic lets us learn the instance + user automatically, so the user
// never has to press a "scan" button.
api.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    try {
      const url = new URL(details.url);
      if (url.pathname.includes('/api/v4/')) captureSession(url.hostname);
    } catch (_) { /* ignore malformed urls */ }
  },
  { urls: ['<all_urls>'], types: ['xmlhttprequest'] },
  ['requestHeaders']
);

async function captureSession(domain) {
  const cookies = await api.cookies.getAll({ domain });
  let authToken = null, userId = null;
  for (const c of cookies) {
    if (c.name === 'MMAUTHTOKEN') authToken = c.value;
    if (c.name === 'MMUSERID') userId = c.value;
  }
  if (!authToken || !userId) return;

  const prev = (await api.storage.local.get(STORAGE.session))[STORAGE.session] || {};
  if (prev.domain === domain && prev.userId === userId && prev.authToken === authToken) return;

  await api.storage.local.set({ [STORAGE.session]: { domain, userId, authToken } });
  console.log('[AlwaysOnline] session captured for', domain);
  paintAction();
}

/* ------------------------------------------------------------------ *
 *  Lifecycle + alarm scheduling
 * ------------------------------------------------------------------ */

api.runtime.onInstalled.addListener(init);
api.runtime.onStartup.addListener(init);

async function init() {
  const settings = withDefaults((await api.storage.local.get(STORAGE.settings))[STORAGE.settings]);
  await api.storage.local.set({ [STORAGE.settings]: settings });
  await rescheduleAlarm(settings);
  paintAction();
}

async function rescheduleAlarm(settings) {
  await api.alarms.clear(ALARM_NAME);
  if (!settings.enabled) { paintAction(); return; }
  api.alarms.create(ALARM_NAME, { periodInMinutes: Math.max(0.5, Number(settings.intervalMinutes) || 2) });
  tick(); // run one immediately so toggling on takes effect at once
}

api.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM_NAME) tick(); });

// The popup only writes to storage; the worker reacts to those changes.
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE.settings]) rescheduleAlarm(withDefaults(changes[STORAGE.settings].newValue));
  else if (changes[STORAGE.session]) paintAction();
});

// "Re-check now" / manual capture requests from the popup.
api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && (msg.type === 'tick' || msg.type === 'refresh')) { tick().then(() => sendResponse({ ok: true })); return true; }
  if (msg && msg.type === 'capture' && msg.domain) captureSession(msg.domain);
});

/* ------------------------------------------------------------------ *
 *  The keep-alive tick
 * ------------------------------------------------------------------ */

async function tick() {
  const store = await api.storage.local.get([STORAGE.settings, STORAGE.session, STORAGE.stats]);
  const settings = withDefaults(store[STORAGE.settings]);
  const session = store[STORAGE.session];
  const stats = store[STORAGE.stats] || { lastCheck: null, lastStatus: null, corrections: 0 };

  if (!session || !session.domain || !session.userId) { paintAction(); return; }

  // Always read the current status so the popup reflects reality, even when the
  // keeper is off or outside working hours.
  const status = await getStatus(session);
  stats.lastCheck = Date.now();
  if (status) stats.lastStatus = status.status;

  // Only push you back online while the keeper is enabled and within its schedule,
  // and never override a deliberately-set Do Not Disturb.
  const active = settings.enabled && isWithinSchedule(settings.schedule, new Date());
  // "dnd" is always a deliberate choice (auto-away yields "away", never "dnd"), so we
  // respect it whenever the option is on, without relying on Mattermost's `manual`
  // flag, which some server versions omit or report as false.
  const blockedByDnd = settings.respectDnd && status && status.status === 'dnd';
  if (active && status && !blockedByDnd) {
    const wasOnline = status.status === 'online';
    if (await setOnline(session)) {
      stats.lastStatus = 'online';
      if (!wasOnline) stats.corrections = (stats.corrections || 0) + 1;
    }
  }

  await api.storage.local.set({ [STORAGE.stats]: stats });
  paintAction();
}

/* ------------------------------------------------------------------ *
 *  Mattermost REST helpers
 * ------------------------------------------------------------------ */

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    // Mattermost accepts this header as CSRF protection for cookie-authenticated XHR.
    'X-Requested-With': 'XMLHttpRequest',
  };
}

async function getStatus(session) {
  try {
    const res = await fetch(`https://${session.domain}/api/v4/users/${session.userId}/status`, {
      method: 'GET', headers: apiHeaders(), credentials: 'include',
    });
    if (res.status === 401 || res.status === 403) { await onAuthLost(); return null; }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json(); // { user_id, status, manual, last_activity_at }
  } catch (e) {
    console.warn('[AlwaysOnline] getStatus failed:', e.message);
    return null;
  }
}

async function setOnline(session) {
  try {
    const res = await fetch(`https://${session.domain}/api/v4/users/${session.userId}/status`, {
      method: 'PUT', headers: apiHeaders(), credentials: 'include',
      body: JSON.stringify({ user_id: session.userId, status: 'online' }),
    });
    if (res.status === 401 || res.status === 403) { await onAuthLost(); return false; }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return true;
  } catch (e) {
    console.warn('[AlwaysOnline] setOnline failed:', e.message);
    return false;
  }
}

// Session cookie is gone or rejected, so forget it and let the UI prompt a re-visit.
async function onAuthLost() {
  await api.storage.local.remove(STORAGE.session);
  paintAction();
}

/* ------------------------------------------------------------------ *
 *  Toolbar icon + badge (blue = on, grey = off; amber "!" = needs setup)
 * ------------------------------------------------------------------ */

async function paintAction() {
  const store = await api.storage.local.get([STORAGE.settings, STORAGE.session]);
  const settings = withDefaults(store[STORAGE.settings]);
  const session = store[STORAGE.session];
  const on = !!settings.enabled;

  const path = on ? ICON_ON : ICON_OFF;
  try { api.action.setIcon({ path: { 16: path, 32: path, 48: path, 128: path } }); } catch (_) {}

  const needsSetup = on && (!session || !session.domain);
  try { api.action.setBadgeTextColor({ color: '#ffffff' }); } catch (_) {}
  api.action.setBadgeBackgroundColor({ color: '#d29922' });
  api.action.setBadgeText({ text: needsSetup ? '!' : '' });
}
