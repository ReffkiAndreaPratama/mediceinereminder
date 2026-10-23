/* ═══════════════════════════════════════════════════════════════
   reminder.js — Core reminder engine

   Responsibilities:
   - Build the full list of dose slots for a given profile + date
   - Merge schedule definitions with existing log records
   - Auto-mark overdue pending doses as "missed"
   - Schedule upcoming notifications via NotifManager
   - Provide compliance statistics (today + date range)
   - Tick loop: re-evaluates every minute for missed-dose marking
═══════════════════════════════════════════════════════════════ */

const ReminderEngine = (() => {

  /* ── internal state ─────────────────────────────────────────── */
  let _tickInterval = null;
  const MISSED_THRESHOLD_MINUTES = 30; // mark as missed after 30 min past scheduled time

  /* ══════════════════════════════════════════════════════════════
     1. DATE HELPERS
  ══════════════════════════════════════════════════════════════ */

  /** Returns today's date string 'YYYY-MM-DD' in local time. */
  function todayStr() {
    return toDateStr(new Date());
  }

  /** Format a Date object → 'YYYY-MM-DD' (local time). */
  function toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** 'YYYY-MM-DD' → Date (midnight local). */
  function parseDate(str) {
    return new Date(str + 'T00:00:00');
  }

  /**
   * Format a date string for display.
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {string} e.g. "Senin, 28 September 2026"
   */
  function formatDateDisplay(dateStr) {
    const date = parseDate(dateStr);
    return date.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric',
      month: 'long', year: 'numeric',
    });
  }

  /**
   * Format a date string to a short label.
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {string} e.g. "28 Sep"
   */
  function formatDateShort(dateStr) {
    const date = parseDate(dateStr);
    const today = todayStr();
    const yesterday = toDateStr(new Date(Date.now() - 86400000));

    if (dateStr === today)     return 'Hari ini';
    if (dateStr === yesterday) return 'Kemarin';

    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  /**
   * Get an array of date strings for the last N days (inclusive today).
   * @param {number} days
   * @returns {string[]} sorted newest first
   */
  function lastNDays(days) {
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 86400000);
      result.push(toDateStr(d));
    }
    return result;
  }

  /** Current time as 'HH:MM'. */
  function currentTimeStr() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  /**
   * Compare two 'HH:MM' strings.
   * Returns negative if a < b, 0 if equal, positive if a > b.
   */
  function compareTime(a, b) {
    const [ah, am] = a.split(':').map(Number);
    const [bh, bm] = b.split(':').map(Number);
    return ah !== bh ? ah - bh : am - bm;
  }

  /**
   * Minutes elapsed since a 'HH:MM' time today.
   * Returns negative if the time is in the future.
   */
  function minutesSince(timeStr) {
    const now = new Date();
    const [h, m] = timeStr.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    return (now - target) / 60000;
  }

  /* ══════════════════════════════════════════════════════════════
     2. DOSE SLOT BUILDER
  ══════════════════════════════════════════════════════════════ */

  /**
   * A "dose slot" is one scheduled intake:
   * {
   *   key:          string  'scheduleId_date_time'
   *   scheduleId:   number
   *   profileId:    number
   *   medicineId:   number
   *   medicineName: string
   *   medicineIcon: string
   *   medicineColor:string
   *   doseAmount:   number
   *   doseUnit:     string
   *   date:         string  'YYYY-MM-DD'
   *   time:         string  'HH:MM'
   *   notes:        string
   *   status:       'done' | 'missed' | 'snoozed' | 'pending'
   *   takenAt:      number|null
   *   snoozeUntil:  number|null
   *   logId:        number|null
   * }
   */

  /**
   * Build all dose slots for a profile on a given date,
   * merged with existing log records.
   *
   * @param {number} profileId
   * @param {string} dateStr   'YYYY-MM-DD'
   * @returns {Promise<DoseSlot[]>} sorted by time ascending
   */
  async function getDosesForDate(profileId, dateStr) {
    const [schedules, medicines, logs] = await Promise.all([
      DB.Schedules.getForDate(profileId, dateStr),
      DB.Medicines.getByProfile(profileId),
      DB.Logs.getByDate(profileId, dateStr),
    ]);

    const medMap = Object.fromEntries(medicines.map(m => [m.id, m]));

    // Build a log lookup: key = `scheduleId_time`
    const logMap = {};
    for (const log of logs) {
      const k = `${log.scheduleId}_${log.time}`;
      logMap[k] = log;
    }

    const slots = [];

    for (const sched of schedules) {
      const med = medMap[sched.medicineId];
      if (!med) continue;

      for (const time of (sched.times || [])) {
        const logKey = `${sched.id}_${time}`;
        const log    = logMap[logKey] || null;

        // Determine real-time status
        let status = 'pending';
        if (log) {
          status = log.status;
        } else if (dateStr < todayStr()) {
          // Past date with no log → missed
          status = 'missed';
        } else if (dateStr === todayStr()) {
          const elapsed = minutesSince(time);
          if (elapsed > MISSED_THRESHOLD_MINUTES) status = 'missed';
        }

        slots.push({
          key:           `${sched.id}_${dateStr}_${time}`,
          scheduleId:    sched.id,
          profileId:     sched.profileId,
          medicineId:    sched.medicineId,
          medicineName:  med.name,
          medicineIcon:  med.icon  || '💊',
          medicineColor: med.color || '#6366f1',
          doseAmount:    sched.doseAmount,
          doseUnit:      sched.doseUnit,
          date:          dateStr,
          time,
          notes:         sched.notes || '',
          status,
          takenAt:       log?.takenAt      ?? null,
          snoozeUntil:   log?.snoozeUntil  ?? null,
          logId:         log?.id           ?? null,
        });
      }
    }

    // Sort by time ascending, then by medicine name for ties
    slots.sort((a, b) => {
      const tc = compareTime(a.time, b.time);
      return tc !== 0 ? tc : a.medicineName.localeCompare(b.medicineName, 'id');
    });

    return slots;
  }

  /* ══════════════════════════════════════════════════════════════
     3. MARK DOSE
  ══════════════════════════════════════════════════════════════ */

  /**
   * Mark a dose as done, missed, or snoozed.
   * Also decrements medicine stock if marking as done.
   * @param {DoseSlot} slot
   * @param {'done'|'missed'|'snoozed'} status
   * @param {number} [snoozeUntil]  — timestamp (for snoozed)
   * @returns {Promise<DoseSlot>}   — updated slot
   */
  async function markDose(slot, status, snoozeUntil = null) {
    const log = await DB.Logs.markDose({
      scheduleId:  slot.scheduleId,
      profileId:   slot.profileId,
      medicineId:  slot.medicineId,
      date:        slot.date,
      time:        slot.time,
      status,
      snoozeUntil,
    });

    // Decrement stock on first "done" mark
    if (status === 'done' && slot.status !== 'done') {
      await DB.Medicines.decrementStock(slot.medicineId, slot.doseAmount);
    }

    return {
      ...slot,
      status,
      takenAt:     log.takenAt,
      snoozeUntil: log.snoozeUntil,
      logId:       log.id,
    };
  }

  /* ══════════════════════════════════════════════════════════════
     4. AUTO-MISS OVERDUE DOSES
  ══════════════════════════════════════════════════════════════ */

  /**
   * Scan today's pending doses and mark overdue ones as missed.
   * Called once on load and then every minute by the tick loop.
   * @param {number} profileId
   * @returns {Promise<string[]>}  keys of newly-missed slots
   */
  async function autoMarkMissed(profileId) {
    const today = todayStr();
    const slots = await getDosesForDate(profileId, today);
    const missed = [];

    for (const slot of slots) {
      if (slot.status !== 'pending') continue;
      if (minutesSince(slot.time) > MISSED_THRESHOLD_MINUTES) {
        await markDose(slot, 'missed');
        missed.push(slot.key);
      }
    }

    if (missed.length > 0) {
      window.dispatchEvent(new CustomEvent('med:doses-updated', {
        detail: { profileId, date: today, missedKeys: missed },
      }));
    }

    return missed;
  }

  /* ══════════════════════════════════════════════════════════════
     5. NOTIFICATION SCHEDULER
  ══════════════════════════════════════════════════════════════ */

  /**
   * Schedule notifications for all upcoming doses for a profile
   * on today (and optionally tomorrow).
   * @param {number} profileId
   */
  async function scheduleNotifications(profileId) {
    if (!DB.Settings.get('notifEnabled')) return;

    NotifManager.cancelAll();

    const dates = [todayStr(), toDateStr(new Date(Date.now() + 86400000))];

    for (const dateStr of dates) {
      const slots = await getDosesForDate(profileId, dateStr);

      for (const slot of slots) {
        if (slot.status === 'done' || slot.status === 'missed') continue;

        // Build self-contained callbacks that can be reused for
        // both the original notification and a snoozed re-fire.
        const doseData = {
          scheduleId:   slot.scheduleId,
          profileId:    slot.profileId,
          medicineId:   slot.medicineId,
          medicineName: slot.medicineName,
          medicineIcon: slot.medicineIcon,
          doseAmount:   slot.doseAmount,
          doseUnit:     slot.doseUnit,
          date:         slot.date,
          time:         slot.time,
        };

        const onTaken = async () => {
          const fresh = await getDosesForDate(doseData.profileId, doseData.date);
          const target = fresh.find(s => s.scheduleId === doseData.scheduleId && s.time === doseData.time);
          if (target && target.status !== 'done') {
            await markDose(target, 'done');
            NotifManager.cancel(doseData.scheduleId, doseData.date, doseData.time);
            window.dispatchEvent(new CustomEvent('med:doses-updated', {
              detail: { profileId: doseData.profileId, date: doseData.date },
            }));
          }
        };

        const onSnooze = async () => {
          const fresh = await getDosesForDate(doseData.profileId, doseData.date);
          const target = fresh.find(s => s.scheduleId === doseData.scheduleId && s.time === doseData.time);
          if (target && (target.status === 'pending' || target.status === 'snoozed')) {
            const snoozeUntil = NotifManager.snooze({ ...doseData, onTaken, onSnooze });
            await markDose(target, 'snoozed', snoozeUntil?.getTime() ?? null);
            window.dispatchEvent(new CustomEvent('med:doses-updated', {
              detail: { profileId: doseData.profileId, date: doseData.date },
            }));
          }
        };

        NotifManager.schedule({ ...doseData, onTaken, onSnooze });
      }
    }

    // Sync descriptors with SW for background support
    const todaySlots = await getDosesForDate(profileId, todayStr());
    await NotifManager.syncSchedulesWithSW(
      todaySlots.filter(s => s.status === 'pending').map(s => ({
        scheduleId:   s.scheduleId,
        medicineName: s.medicineName,
        medicineIcon: s.medicineIcon,
        doseAmount:   s.doseAmount,
        doseUnit:     s.doseUnit,
        date:         s.date,
        time:         s.time,
      }))
    );
  }

  /* ══════════════════════════════════════════════════════════════
     6. COMPLIANCE STATISTICS
  ══════════════════════════════════════════════════════════════ */

  /**
   * Compute compliance stats for a single date.
   * @param {number} profileId
   * @param {string} dateStr
   * @returns {Promise<{done, missed, snoozed, pending, total, pct}>}
   */
  async function getStatsForDate(profileId, dateStr) {
    const slots = await getDosesForDate(profileId, dateStr);
    return _computeStats(slots);
  }

  /**
   * Compute compliance stats for a date range.
   * @param {number} profileId
   * @param {string} startDate 'YYYY-MM-DD'
   * @param {string} endDate   'YYYY-MM-DD'
   * @returns {Promise<{done, missed, snoozed, pending, total, pct, byDate}>}
   */
  async function getStatsForRange(profileId, startDate, endDate) {
    const start = parseDate(startDate);
    const end   = parseDate(endDate);
    const allSlots = [];
    const byDate = {};

    const current = new Date(start);
    while (current <= end) {
      const ds    = toDateStr(current);
      const slots = await getDosesForDate(profileId, ds);
      allSlots.push(...slots);
      byDate[ds] = _computeStats(slots);
      current.setDate(current.getDate() + 1);
    }

    return { ..._computeStats(allSlots), byDate };
  }

  function _computeStats(slots) {
    const counts = { done: 0, missed: 0, snoozed: 0, pending: 0 };
    for (const s of slots) {
      if (counts[s.status] !== undefined) counts[s.status]++;
      else counts.pending++;
    }
    const total    = slots.length;
    const resolved = counts.done + counts.missed;
    const pct      = resolved === 0 ? 0 : Math.round((counts.done / resolved) * 100);
    return { ...counts, total, pct };
  }

  /* ══════════════════════════════════════════════════════════════
     7. TICK LOOP
  ══════════════════════════════════════════════════════════════ */

  /**
   * Start the 1-minute tick loop for the given profile.
   * Calls autoMarkMissed each tick and re-schedules notifications
   * at midnight rollover.
   * @param {number} profileId
   */
  function startTick(profileId) {
    stopTick();

    let _lastDay = todayStr();

    _tickInterval = setInterval(async () => {
      const currentDay = todayStr();

      // Midnight rollover: re-schedule everything for the new day
      if (currentDay !== _lastDay) {
        _lastDay = currentDay;
        await scheduleNotifications(profileId);
        window.dispatchEvent(new CustomEvent('med:day-changed', {
          detail: { date: currentDay },
        }));
      }

      await autoMarkMissed(profileId);
    }, 60 * 1000); // every 60 seconds
  }

  /** Stop the tick loop. */
  function stopTick() {
    if (_tickInterval !== null) {
      clearInterval(_tickInterval);
      _tickInterval = null;
    }
  }

  /* ══════════════════════════════════════════════════════════════
     8. HISTORY BUILDER
  ══════════════════════════════════════════════════════════════ */

  /**
   * Build a grouped history list for the last N days.
   * @param {number} profileId
   * @param {number} days   — number of past days (default 7)
   * @returns {Promise<Array<{dateStr, dateLabel, slots}>>}
   */
  async function getHistory(profileId, days = 7) {
    const dates  = lastNDays(days);
    const groups = [];

    for (const dateStr of dates) {
      const slots = await getDosesForDate(profileId, dateStr);
      // Only include dates that have at least one slot or a log
      if (slots.length > 0) {
        groups.push({
          dateStr,
          dateLabel: formatDateShort(dateStr),
          slots,
          stats: _computeStats(slots),
        });
      }
    }

    return groups;
  }

  /* ══════════════════════════════════════════════════════════════
     9. LOW STOCK CHECKER
  ══════════════════════════════════════════════════════════════ */

  /**
   * Returns medicines whose stock is at or below their warn threshold.
   * @param {number} profileId
   * @returns {Promise<Medicine[]>}
   */
  async function getLowStockMedicines(profileId) {
    const medicines = await DB.Medicines.getByProfile(profileId);
    return medicines.filter(m =>
      m.stock != null &&
      m.stockWarnAt != null &&
      m.stock <= m.stockWarnAt
    );
  }

  /* ══════════════════════════════════════════════════════════════
     10. PUBLIC API
  ══════════════════════════════════════════════════════════════ */
  return {
    // date utils (also useful in app.js)
    todayStr,
    toDateStr,
    parseDate,
    formatDateDisplay,
    formatDateShort,
    lastNDays,
    currentTimeStr,
    compareTime,

    // core
    getDosesForDate,
    markDose,
    autoMarkMissed,

    // notifications
    scheduleNotifications,

    // stats
    getStatsForDate,
    getStatsForRange,

    // history
    getHistory,

    // stock
    getLowStockMedicines,

    // tick
    startTick,
    stopTick,

    MISSED_THRESHOLD_MINUTES,
  };
})();

window.ReminderEngine = ReminderEngine;
