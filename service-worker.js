/* ═══════════════════════════════════════════════════════════════
   service-worker.js — Offline caching + background notifications
   Strategy:
   - Cache-first for app shell (HTML, CSS, JS, icons)
   - Network-first for everything else
   - Receives SYNC_SCHEDULES messages from page
   - Fires background notifications when tab is closed
═══════════════════════════════════════════════════════════════ */

const CACHE_NAME    = 'med-reminder-v1';
const CACHE_VERSION = 1;

/* Files to pre-cache on install (app shell) */
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/database.js',
  './js/notification.js',
  './js/reminder.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* ── INSTALL ─────────────────────────────────────────────────── */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // addAll fails if any resource 404s — use individual add with catch
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(() => { /* skip missing icons gracefully */ })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ────────────────────────────────────────────────── */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => {
      self.clients.claim();
      // Notify all open tabs that the SW is ready
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_READY' }));
      });
    })
  );
});

/* ── FETCH — Cache-first for shell, network-first otherwise ──── */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests for same-origin resources
  if (request.method !== 'GET') return;
  if (!request.url.startsWith(self.location.origin)) return;

  // Skip chrome-extension and non-http schemes
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // App shell: cache-first
  const isShell = PRECACHE_URLS.some(p => url.pathname.endsWith(p.replace('./', '/')))
    || url.pathname === '/'
    || url.pathname.endsWith('/index.html');

  if (isShell) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource not cached.', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

/* ── MESSAGE: receive schedule list from page ────────────────── */

/**
 * In-memory list of upcoming doses sent from notification.js.
 * Shape: [{ scheduleId, medicineName, medicineIcon, doseAmount,
 *           doseUnit, date, time }]
 */
let _scheduledDoses = [];

/** Map<string, timeoutId> */
const _swTimers = new Map();

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  if (type === 'SYNC_SCHEDULES') {
    syncSchedules(payload?.doses || []);
  }

  if (type === 'REMINDER_ACTION') {
    // Relay notification action result back to all open tabs
    self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(c => c.postMessage({ type: 'REMINDER_ACTION', payload }));
    });
  }
});

function syncSchedules(doses) {
  // Cancel existing SW timers
  _swTimers.forEach(id => clearTimeout(id));
  _swTimers.clear();
  _scheduledDoses = doses;

  doses.forEach(dose => {
    const msUntil = msUntilDateTime(dose.date, dose.time);
    if (msUntil < 0) return; // already past

    const key     = `${dose.scheduleId}_${dose.date}_${dose.time}`;
    const timerId = setTimeout(() => {
      _swTimers.delete(key);
      fireBackgroundNotification(dose);
    }, msUntil);

    _swTimers.set(key, timerId);
  });
}

/* ── Background notification ─────────────────────────────────── */
async function fireBackgroundNotification(dose) {
  // Check if any window is focused — if so, let the page handle it
  const clients = await self.clients.matchAll({ type: 'window' });
  const hasFocused = clients.some(c => c.focused);
  if (hasFocused) return; // page's own NotifManager will fire it

  const title = `💊 Waktunya minum obat`;
  const body  = `${dose.medicineIcon || '💊'} ${dose.medicineName} — ${dose.doseAmount} ${dose.doseUnit}`;
  const tag   = `med-${dose.scheduleId}_${dose.date}_${dose.time}`;

  const options = {
    body,
    icon:    './icons/icon-192.png',
    badge:   './icons/icon-96.png',
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    data: { ...dose, tag },
    actions: [
      { action: 'taken',  title: '✅ Sudah diminum' },
      { action: 'snooze', title: '⏰ Tunda 10 mnt'  },
    ],
  };

  try {
    await self.registration.showNotification(title, options);
  } catch (err) {
    console.warn('[SW] showNotification failed:', err);
  }
}

/* ── NOTIFICATIONCLICK ───────────────────────────────────────── */
self.addEventListener('notificationclick', (event) => {
  const { notification, action } = event;
  notification.close();

  const dose = notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Focus existing tab or open a new one
        const existing = clients.find(c => c.url.includes('index.html') || c.url.endsWith('/'));

        const relay = (client) => {
          client.postMessage({
            type: 'REMINDER_ACTION',
            payload: { ...dose, action: action || 'open' },
          });
        };

        if (existing) {
          existing.focus();
          relay(existing);
          return;
        }

        return self.clients.openWindow('./index.html').then(newClient => {
          if (newClient) {
            // Slight delay to let the page boot
            setTimeout(() => relay(newClient), 1500);
          }
        });
      })
  );
});

/* ── NOTIFICATIONCLOSE ───────────────────────────────────────── */
self.addEventListener('notificationclose', (event) => {
  // User dismissed — treat as "snooze" or simply ignore
  const dose = event.notification.data || {};
  // Relay dismiss to open clients so UI can mark as pending/snoozed
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(c =>
      c.postMessage({
        type: 'REMINDER_ACTION',
        payload: { ...dose, action: 'dismissed' },
      })
    );
  });
});

/* ── PUSH (optional, future backend) ────────────────────────── */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try { data = event.data.json(); } catch { return; }

  const { title = '💊 Pengingat Obat', body = '', tag = 'push' } = data;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  './icons/icon-192.png',
      badge: './icons/icon-96.png',
      tag,
      data,
    })
  );
});

/* ── HELPERS ─────────────────────────────────────────────────── */

/**
 * Milliseconds until a given date+time. Negative = past.
 * Duplicated here because SW has no access to page scripts.
 */
function msUntilDateTime(dateStr, timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const target = new Date(dateStr + 'T00:00:00');
  target.setHours(h, m, 0, 0);
  return target.getTime() - Date.now();
}
