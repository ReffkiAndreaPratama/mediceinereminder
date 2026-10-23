/* ═══════════════════════════════════════════════════════════════
   database.js — IndexedDB abstraction
   Stores:
     profiles   : user profiles (family mode)
     medicines  : medicine catalogue per profile
     schedules  : recurring schedule definitions
     logs       : per-dose take/miss/snooze records
═══════════════════════════════════════════════════════════════ */

const DB_NAME    = 'MedicineReminderDB';
const DB_VERSION = 1;

/** @type {IDBDatabase|null} */
let _db = null;

/* ── open / migrate ──────────────────────────────────────────── */

/**
 * Open (or upgrade) the database.
 * Returns a promise that resolves with the IDBDatabase instance.
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      /* ── profiles ─────────────────────────────────────────── */
      if (!db.objectStoreNames.contains('profiles')) {
        const ps = db.createObjectStore('profiles', {
          keyPath: 'id', autoIncrement: true,
        });
        ps.createIndex('by_name', 'name', { unique: false });
      }

      /* ── medicines ────────────────────────────────────────── */
      if (!db.objectStoreNames.contains('medicines')) {
        const ms = db.createObjectStore('medicines', {
          keyPath: 'id', autoIncrement: true,
        });
        ms.createIndex('by_profile', 'profileId', { unique: false });
      }

      /* ── schedules ────────────────────────────────────────── */
      if (!db.objectStoreNames.contains('schedules')) {
        const ss = db.createObjectStore('schedules', {
          keyPath: 'id', autoIncrement: true,
        });
        ss.createIndex('by_profile',  'profileId',  { unique: false });
        ss.createIndex('by_medicine', 'medicineId', { unique: false });
        ss.createIndex('by_active',   'active',     { unique: false });
      }

      /* ── logs ─────────────────────────────────────────────── */
      if (!db.objectStoreNames.contains('logs')) {
        const ls = db.createObjectStore('logs', {
          keyPath: 'id', autoIncrement: true,
        });
        ls.createIndex('by_schedule', 'scheduleId', { unique: false });
        ls.createIndex('by_profile',  'profileId',  { unique: false });
        ls.createIndex('by_date',     'date',       { unique: false });
        // compound index for fast per-schedule-per-date lookup
        ls.createIndex('by_schedule_date', ['scheduleId', 'date'], { unique: false });
      }
    };

    req.onsuccess = (event) => {
      _db = event.target.result;

      // handle unexpected version change from another tab
      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };

      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

/* ── generic helpers ─────────────────────────────────────────── */

/**
 * Run a read-write transaction on one or more stores.
 * @param {string|string[]} storeNames
 * @param {function(IDBTransaction): Promise<any>} fn
 */
async function withTransaction(storeNames, fn) {
  const db = await openDB();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const tx = db.transaction(names, 'readwrite');
  return fn(tx);
}

/** Wrap an IDBRequest in a Promise. */
function req2promise(idbReq) {
  return new Promise((resolve, reject) => {
    idbReq.onsuccess = () => resolve(idbReq.result);
    idbReq.onerror  = () => reject(idbReq.error);
  });
}

/** Get all records from a store (optionally filtered by an index value). */
async function getAll(storeName, indexName = null, indexValue = null) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req   = indexName != null
      ? store.index(indexName).getAll(indexValue)
      : store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Get a single record by primary key. */
async function getById(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req   = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

/** Add a new record. Returns the generated id. */
async function add(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const rec   = { ...data, createdAt: Date.now(), updatedAt: Date.now() };
    const req   = store.add(rec);
    req.onsuccess = () => resolve(req.result); // new id
    req.onerror   = () => reject(req.error);
  });
}

/** Put (upsert) a record. Returns the key. */
async function put(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const rec   = { ...data, updatedAt: Date.now() };
    if (!rec.createdAt) rec.createdAt = Date.now();
    const req = store.put(rec);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Delete a record by primary key. */
async function remove(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Delete all records in a store. */
async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req   = store.clear();
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/* ── PROFILES ────────────────────────────────────────────────── */
const Profiles = {
  getAll: ()     => getAll('profiles'),
  getById: (id)  => getById('profiles', id),

  async add(data) {
    const id = await add('profiles', data);
    return { ...data, id };
  },

  async put(data) {
    await put('profiles', data);
    return data;
  },

  async remove(id) {
    // cascade: delete medicines + schedules + logs for this profile
    const [medicines, schedules] = await Promise.all([
      getAll('medicines', 'by_profile', id),
      getAll('schedules', 'by_profile', id),
    ]);

    const scheduleIds = schedules.map(s => s.id);

    // delete logs for each schedule
    await Promise.all(scheduleIds.map(sid => Logs.removeBySchedule(sid)));

    // delete schedules
    await Promise.all(scheduleIds.map(sid => remove('schedules', sid)));

    // delete medicines
    await Promise.all(medicines.map(m => remove('medicines', m.id)));

    // delete profile
    await remove('profiles', id);
  },

  /** Ensure at least one profile exists; creates default if none. */
  async ensureDefault() {
    const all = await getAll('profiles');
    if (all.length === 0) {
      const id = await add('profiles', {
        name: 'Saya', avatar: '👤', isDefault: true,
      });
      return { id, name: 'Saya', avatar: '👤', isDefault: true };
    }
    return all[0];
  },
};

/* ── MEDICINES ───────────────────────────────────────────────── */
const Medicines = {
  getAll: ()            => getAll('medicines'),
  getByProfile: (pid)   => getAll('medicines', 'by_profile', pid),
  getById: (id)         => getById('medicines', id),

  async add(data) {
    const id = await add('medicines', data);
    return { ...data, id };
  },

  async put(data) {
    await put('medicines', data);
    return data;
  },

  async remove(id) {
    // cascade: mark schedules inactive, delete logs
    const schedules = await getAll('schedules', 'by_medicine', id);
    await Promise.all(schedules.map(async s => {
      await Logs.removeBySchedule(s.id);
      await remove('schedules', s.id);
    }));
    await remove('medicines', id);
  },

  /**
   * Decrement stock by `amount` (if stock tracking is enabled).
   * Returns the updated medicine record.
   */
  async decrementStock(id, amount = 1) {
    const med = await getById('medicines', id);
    if (!med || med.stock == null) return med;
    const updated = { ...med, stock: Math.max(0, med.stock - amount) };
    await put('medicines', updated);
    return updated;
  },
};

/* ── SCHEDULES ───────────────────────────────────────────────── */

/**
 * Schedule record shape:
 * {
 *   id, profileId, medicineId,
 *   doseAmount, doseUnit,
 *   times: ['08:00', '13:00'],      // HH:MM strings
 *   frequency: 'daily' | 'specific_days' | 'interval',
 *   specificDays: [0,1,2,3,4,5,6],  // 0=Sun … 6=Sat (for specific_days)
 *   intervalDays: 2,                 // (for interval)
 *   startDate: 'YYYY-MM-DD',
 *   endDate:   'YYYY-MM-DD' | null,
 *   notes: '',
 *   active: true,
 *   createdAt, updatedAt
 * }
 */

const Schedules = {
  getAll: ()            => getAll('schedules'),
  getByProfile: (pid)   => getAll('schedules', 'by_profile', pid),
  getById: (id)         => getById('schedules', id),

  async add(data) {
    const rec = { active: true, ...data };
    const id  = await add('schedules', rec);
    return { ...rec, id };
  },

  async put(data) {
    await put('schedules', data);
    return data;
  },

  async remove(id) {
    await Logs.removeBySchedule(id);
    await remove('schedules', id);
  },

  /**
   * Get all active schedules for a profile that apply on a given date.
   * @param {number} profileId
   * @param {string} dateStr  'YYYY-MM-DD'
   */
  async getForDate(profileId, dateStr) {
    const all = await getAll('schedules', 'by_profile', profileId);
    return all.filter(s => scheduleAppliesToDate(s, dateStr));
  },
};

/**
 * Check whether a schedule applies on a given date.
 * @param {object} schedule
 * @param {string} dateStr 'YYYY-MM-DD'
 */
function scheduleAppliesToDate(schedule, dateStr) {
  if (!schedule.active) return false;

  const date  = new Date(dateStr + 'T00:00:00');
  const start = new Date(schedule.startDate + 'T00:00:00');
  if (date < start) return false;

  if (schedule.endDate) {
    const end = new Date(schedule.endDate + 'T00:00:00');
    if (date > end) return false;
  }

  const { frequency } = schedule;

  if (frequency === 'daily') return true;

  if (frequency === 'specific_days') {
    const dow = date.getDay(); // 0=Sun
    return Array.isArray(schedule.specificDays) &&
           schedule.specificDays.includes(dow);
  }

  if (frequency === 'interval') {
    const diffMs   = date.getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const interval = schedule.intervalDays || 1;
    return diffDays % interval === 0;
  }

  return false;
}

/* ── LOGS ────────────────────────────────────────────────────── */

/**
 * Log record shape:
 * {
 *   id, scheduleId, profileId, medicineId,
 *   date:   'YYYY-MM-DD',
 *   time:   'HH:MM',
 *   status: 'done' | 'missed' | 'snoozed',
 *   takenAt: timestamp | null,
 *   snoozeUntil: timestamp | null,
 *   createdAt, updatedAt
 * }
 */

const Logs = {
  getAll: ()                   => getAll('logs'),
  getByProfile: (pid)          => getAll('logs', 'by_profile', pid),
  getBySchedule: (sid)         => getAll('logs', 'by_schedule', sid),
  getById: (id)                => getById('logs', id),

  async getByDate(profileId, dateStr) {
    const all = await getAll('logs', 'by_profile', profileId);
    return all.filter(l => l.date === dateStr);
  },

  async getByDateRange(profileId, startDateStr, endDateStr) {
    const all = await getAll('logs', 'by_profile', profileId);
    return all.filter(l => l.date >= startDateStr && l.date <= endDateStr);
  },

  /**
   * Get the log for a specific schedule + date + time combo.
   * Returns null if not found.
   */
  async getEntry(scheduleId, date, time) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('logs', 'readonly');
      const store = tx.objectStore('logs');
      const index = store.index('by_schedule_date');
      const req   = index.getAll(IDBKeyRange.only([scheduleId, date]));
      req.onsuccess = () => {
        const match = (req.result || []).find(l => l.time === time);
        resolve(match ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async add(data) {
    const id = await add('logs', data);
    return { ...data, id };
  },

  async put(data) {
    await put('logs', data);
    return data;
  },

  async remove(id) {
    return remove('logs', id);
  },

  async removeBySchedule(scheduleId) {
    const entries = await getAll('logs', 'by_schedule', scheduleId);
    await Promise.all(entries.map(e => remove('logs', e.id)));
  },

  async removeByProfile(profileId) {
    const entries = await getAll('logs', 'by_profile', profileId);
    await Promise.all(entries.map(e => remove('logs', e.id)));
  },

  /**
   * Mark a dose entry as done/missed/snoozed.
   * Creates the log if it doesn't exist yet, updates otherwise.
   */
  async markDose({ scheduleId, profileId, medicineId, date, time, status, snoozeUntil = null }) {
    const existing = await this.getEntry(scheduleId, date, time);
    const record = {
      ...(existing || {}),
      scheduleId, profileId, medicineId,
      date, time, status,
      takenAt:     status === 'done' ? Date.now() : (existing?.takenAt ?? null),
      snoozeUntil: status === 'snoozed' ? snoozeUntil : null,
    };
    if (existing) {
      return this.put({ ...record, id: existing.id });
    }
    return this.add(record);
  },
};

/* ── SETTINGS (localStorage shim) ───────────────────────────── */
const Settings = {
  _key: 'medreminder_settings',

  get defaults() {
    return {
      activeProfileId:  null,
      notifEnabled:     false,
      snoozeEnabled:    true,
      theme:            'dark',
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this._key);
      return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
    } catch {
      return { ...this.defaults };
    }
  },

  save(data) {
    try { localStorage.setItem(this._key, JSON.stringify(data)); }
    catch { /* storage quota exceeded — silent fail */ }
  },

  get(key) { return this.load()[key]; },

  set(key, value) {
    const current = this.load();
    current[key] = value;
    this.save(current);
  },
};

/* ── EXPORT / IMPORT ─────────────────────────────────────────── */
const DataIO = {
  /** Export entire database as a JSON blob. */
  async exportAll() {
    const [profiles, medicines, schedules, logs] = await Promise.all([
      Profiles.getAll(),
      Medicines.getAll(),
      Schedules.getAll(),
      Logs.getAll(),
    ]);
    const payload = {
      _version: DB_VERSION,
      _exportedAt: new Date().toISOString(),
      profiles, medicines, schedules, logs,
    };
    return JSON.stringify(payload, null, 2);
  },

  /** Import from a JSON string. Clears all existing data first. */
  async importAll(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.profiles || !data.medicines || !data.schedules || !data.logs) {
      throw new Error('Format file tidak valid.');
    }

    // Clear all stores
    await Promise.all([
      clearStore('profiles'),
      clearStore('medicines'),
      clearStore('schedules'),
      clearStore('logs'),
    ]);

    const db = await openDB();

    async function bulkInsert(storeName, items) {
      if (!items?.length) return;
      return new Promise((resolve, reject) => {
        const tx    = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        items.forEach(item => store.put(item));
        tx.oncomplete = resolve;
        tx.onerror    = () => reject(tx.error);
      });
    }

    await bulkInsert('profiles',  data.profiles);
    await bulkInsert('medicines', data.medicines);
    await bulkInsert('schedules', data.schedules);
    await bulkInsert('logs',      data.logs);
  },

  /** Clear every store and settings. */
  async clearAll() {
    await Promise.all([
      clearStore('profiles'),
      clearStore('medicines'),
      clearStore('schedules'),
      clearStore('logs'),
    ]);
    localStorage.removeItem(Settings._key);
  },
};

/* ── PUBLIC API ──────────────────────────────────────────────── */
window.DB = {
  openDB,
  Profiles,
  Medicines,
  Schedules,
  Logs,
  Settings,
  DataIO,
  // expose helper for reminder.js
  scheduleAppliesToDate,
};
