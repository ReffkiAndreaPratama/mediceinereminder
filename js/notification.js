/* ═══════════════════════════════════════════════════════════════
   notification.js — Web Notifications + in-app scheduling
   
   Strategy:
   - Uses Notification API for immediate + scheduled alerts
   - Schedules via setTimeout (works while tab is open)
   - Falls back gracefully when permission is denied or unsupported
   - Sends messages to Service Worker for background scheduling
   - Snooze: re-schedules notification N minutes later
═══════════════════════════════════════════════════════════════ */

const NotifManager = (() => {
  /* ── constants ─────────────────────────────────────────────── */
  const SNOOZE_MINUTES  = 10;
  const APP_TITLE       = 'Medicine Reminder';
  const ICON_PATH       = './icons/icon-192.png';
  const BADGE_PATH      = './icons/icon-96.png';
  const NOTIF_TAG_PREFIX = 'med-';

  /* ── internal state ─────────────────────────────────────────── */
  /** Map<string, timeoutId> — key = `${scheduleId}_${date}_${time}` */
  const _timers = new Map();

  /* ── permission ─────────────────────────────────────────────── */

  function isSupported() {
    return 'Notification' in window;
  }

  function getPermission() {
    return isSupported() ? Notification.permission : 'denied';
  }

  /**
   * Request notification permission from the user.
   * Returns 'granted' | 'denied' | 'default' | 'unsupported'
   */
  async function requestPermission() {
    if (!isSupported()) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied')  return 'denied';

    const result = await Notification.requestPermission();
    DB.Settings.set('notifEnabled', result === 'granted');
    return result;
  }

  /* ── fire a notification immediately ───────────────────────── */

  /**
   * Show a browser notification right now.
   * @param {object} opts
   * @param {string}   opts.tag          - unique tag (prevents duplicates)
   * @param {string}   opts.title
   * @param {string}   opts.body
   * @param {function} [opts.onTaken]    - callback when "Sudah diminum" clicked
   * @param {function} [opts.onSnooze]   - callback when "Tunda" clicked
   * @param {object}   [opts.data]       - arbitrary data attached to notification
   */
  function fireNotification({ tag, title, body, onTaken, onSnooze, data = {} }) {
    if (!isSupported() || Notification.permission !== 'granted') return null;

    const options = {
      body,
      icon:    ICON_PATH,
      badge:   BADGE_PATH,
      tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'taken',  title: '✅ Sudah diminum' },
        { action: 'snooze', title: `⏰ Tunda ${SNOOZE_MINUTES} mnt` },
      ],
      data: { ...data, _tag: tag },
    };

    try {
      const notif = new Notification(title, options);

      notif.onclick = (e) => {
        window.focus();
        notif.close();
        if (e.action === 'taken'  && onTaken)  onTaken(data);
        else if (e.action === 'snooze' && onSnooze) onSnooze(data);
        else if (onTaken) onTaken(data); // default click = taken
      };

      notif.onclose = () => { /* no-op */ };

      return notif;
    } catch (err) {
      console.warn('[Notif] Could not fire notification:', err);
      return null;
    }
  }

  /* ── schedule a future notification ────────────────────────── */

  /**
   * Schedule a notification at a specific time on a specific date.
   * @param {object}   opts
   * @param {number}   opts.scheduleId
   * @param {number}   opts.profileId
   * @param {number}   opts.medicineId
   * @param {string}   opts.medicineName
   * @param {string}   opts.medicineIcon
   * @param {number}   opts.doseAmount
   * @param {string}   opts.doseUnit
   * @param {string}   opts.date          'YYYY-MM-DD'
   * @param {string}   opts.time          'HH:MM'
   * @param {function} [opts.onTaken]
   * @param {function} [opts.onSnooze]
   */
  function schedule(opts) {
    const key  = _makeKey(opts.scheduleId, opts.date, opts.time);
    const msUntil = _msUntilDateTime(opts.date, opts.time);

    if (msUntil < 0) return;        // already passed
    if (_timers.has(key)) return;   // already scheduled

    const timerId = setTimeout(() => {
      _timers.delete(key);

      const notifEnabled = DB.Settings.get('notifEnabled');
      if (!notifEnabled) return;

      _fireReminder(opts);
    }, msUntil);

    _timers.set(key, timerId);
  }

  /** Cancel a previously scheduled notification. */
  function cancel(scheduleId, date, time) {
    const key = _makeKey(scheduleId, date, time);
    if (_timers.has(key)) {
      clearTimeout(_timers.get(key));
      _timers.delete(key);
    }
  }

  /** Cancel all scheduled timers. */
  function cancelAll() {
    _timers.forEach((id) => clearTimeout(id));
    _timers.clear();
  }

  /* ── snooze ─────────────────────────────────────────────────── */

  /**
   * Re-schedule a notification SNOOZE_MINUTES from now.
   * @param {object} doseData — same shape as schedule() opts
   */
  function snooze(doseData) {
    const snoozeMs  = SNOOZE_MINUTES * 60 * 1000;
    const snoozeKey = _makeKey(doseData.scheduleId, doseData.date, doseData.time) + '_snooze';

    if (_timers.has(snoozeKey)) clearTimeout(_timers.get(snoozeKey));

    const timerId = setTimeout(() => {
      _timers.delete(snoozeKey);
      const notifEnabled = DB.Settings.get('notifEnabled');
      if (!notifEnabled) return;
      _fireReminder(doseData, true);
    }, snoozeMs);

    _timers.set(snoozeKey, timerId);
    return new Date(Date.now() + snoozeMs);
  }

  /* ── in-app fallback toast ──────────────────────────────────── */

  /**
   * Show an in-app reminder card (used when tab is in foreground
   * or notifications are not available).
   * Dispatches a custom event that app.js listens to.
   */
  function fireInAppReminder(doseData) {
    window.dispatchEvent(new CustomEvent('med:reminder', { detail: doseData }));
  }

  /* ── Service Worker bridge ──────────────────────────────────── */

  /**
   * Send a message to the active Service Worker.
   * Used to keep the SW aware of upcoming schedules for
   * background notification support.
   */
  async function notifySW(type, payload) {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg?.active) return;
    reg.active.postMessage({ type, payload });
  }

  /**
   * Register today's + tomorrow's schedules with the SW so it
   * can show notifications even if the tab is closed.
   * @param {Array} dosesArray  — array of dose descriptor objects
   */
  async function syncSchedulesWithSW(dosesArray) {
    await notifySW('SYNC_SCHEDULES', { doses: dosesArray });
  }

  /* ── listen for SW → page messages ─────────────────────────── */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, payload } = event.data || {};

      if (type === 'REMINDER_ACTION') {
        // SW notification action relayed to page
        window.dispatchEvent(new CustomEvent('med:reminder-action', {
          detail: payload,
        }));
      }

      if (type === 'SW_READY') {
        // SW just activated — re-sync schedules
        window.dispatchEvent(new CustomEvent('med:sw-ready'));
      }
    });
  }

  /* ── helpers ────────────────────────────────────────────────── */

  function _makeKey(scheduleId, date, time) {
    return `${NOTIF_TAG_PREFIX}${scheduleId}_${date}_${time}`;
  }

  /**
   * Milliseconds until date+time from now. Negative = past.
   * @param {string} dateStr 'YYYY-MM-DD'
   * @param {string} timeStr 'HH:MM'
   */
  function _msUntilDateTime(dateStr, timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date(dateStr + 'T00:00:00');
    target.setHours(h, m, 0, 0);
    return target.getTime() - Date.now();
  }

  /** Build and fire the actual reminder notification + in-app fallback. */
  function _fireReminder(opts, isSnoozed = false) {
    const { scheduleId, date, time, medicineName, medicineIcon,
            doseAmount, doseUnit, onTaken, onSnooze } = opts;

    const icon  = medicineIcon || '💊';
    const tag   = _makeKey(scheduleId, date, time) + (isSnoozed ? '_s' : '');
    const title = isSnoozed
      ? `⏰ Pengingat tunda — ${icon} ${medicineName}`
      : `💊 Waktunya minum obat`;
    const body  = `${icon} ${medicineName} — ${doseAmount} ${doseUnit}`;

    const notifData = {
      scheduleId, date, time,
      medicineName, medicineIcon,
      doseAmount, doseUnit,
    };

    // Try browser notification first; always fire in-app too
    fireNotification({
      tag, title, body,
      onTaken:  () => { onTaken?.(notifData);  fireInAppReminder({ ...notifData, action: 'taken' }); },
      onSnooze: () => { onSnooze?.(notifData); fireInAppReminder({ ...notifData, action: 'snooze' }); },
      data: notifData,
    });

    // Always fire in-app event (page is open → drives UI update)
    fireInAppReminder({ ...notifData, action: 'fire' });
  }

  /* ── notification permission status badge ───────────────────── */

  /**
   * Returns a human-readable status for display in Settings.
   */
  function getStatusLabel() {
    if (!isSupported()) return 'Tidak didukung browser ini';
    switch (Notification.permission) {
      case 'granted': return 'Aktif';
      case 'denied':  return 'Diblokir — ubah di pengaturan browser';
      default:        return 'Belum diizinkan';
    }
  }

  /* ── public API ─────────────────────────────────────────────── */
  return {
    isSupported,
    getPermission,
    requestPermission,
    fireNotification,
    schedule,
    cancel,
    cancelAll,
    snooze,
    fireInAppReminder,
    syncSchedulesWithSW,
    getStatusLabel,
    SNOOZE_MINUTES,
  };
})();

window.NotifManager = NotifManager;
