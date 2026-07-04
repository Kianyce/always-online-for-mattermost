/*
 * Always Online for Mattermost - shared defaults & helpers.
 * Loaded by the service worker (importScripts) and the popup (<script>).
 */

const DEFAULT_SETTINGS = {
  enabled: false,           // master switch
  intervalMinutes: 2,       // how often we refresh (Mattermost auto-away is ~5 min)
  respectDnd: true,         // never override a manually-set Do Not Disturb
  theme: 'system',          // 'system' | 'light' | 'dark'
  language: 'system',       // 'system' | 'en' | 'de'
  schedule: {
    enabled: false,         // when true, only stay online within the window below
    days: [1, 2, 3, 4, 5],  // 0=Sun ... 6=Sat  ->  Mon-Fri
    startMinutes: 8 * 60,   // 08:00
    endMinutes: 17 * 60,    // 17:00
  },
};

const STORAGE = {
  settings: 'settings',
  session: 'session',       // { domain, userId, authToken }
  stats: 'stats',           // { lastCheck, lastStatus, corrections }
};

// Merge stored settings over the defaults (schedule merged one level deep).
function withDefaults(stored) {
  const s = stored || {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    schedule: { ...DEFAULT_SETTINGS.schedule, ...(s.schedule || {}) },
  };
}

// True when `date` falls inside the working-hours window (or scheduling is off).
function isWithinSchedule(schedule, date) {
  if (!schedule || !schedule.enabled) return true;
  if (!schedule.days.includes(date.getDay())) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const { startMinutes, endMinutes } = schedule;
  return startMinutes <= endMinutes
    ? minutes >= startMinutes && minutes < endMinutes      // same-day window
    : minutes >= startMinutes || minutes < endMinutes;     // overnight window
}

// Colour for a Mattermost status value.
function statusColor(status) {
  switch (status) {
    case 'online':  return '#3fb950';
    case 'away':    return '#d29922';
    case 'dnd':     return '#f85149';
    default:        return '#6e7681'; // offline / unknown
  }
}
