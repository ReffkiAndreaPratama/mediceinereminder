/* ═══════════════════════════════════════════════════════════════
   app.js — Main application controller
   Responsibilities:
   - Bootstrap: DB init, profile load, SW register
   - View routing (today / history / medicines)
   - Render: today schedule, history, medicines list
   - Modal controllers: schedule form, medicine form, profile form, settings
   - Event wiring: nav, FAB, forms, reminder events
   - PWA install prompt
   - Theme management
═══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   0. ELEMENT CACHE
══════════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const El = {
  // topbar
  activeProfileAvatar : $('active-profile-avatar'),
  activeProfileName   : $('active-profile-name'),
  btnProfileMenu      : $('btn-profile-menu'),
  btnNotifToggle      : $('btn-notif-toggle'),
  profileDropdown     : $('profile-dropdown'),
  profileList         : $('profile-list'),
  btnAddProfile       : $('btn-add-profile'),
  dropdownBackdrop    : $('dropdown-backdrop'),

  // views
  viewToday     : $('view-today'),
  viewHistory   : $('view-history'),
  viewMedicines : $('view-medicines'),

  // today view
  todayLabel       : $('today-label'),
  todayDate        : $('today-date'),
  statDone         : $('stat-done'),
  statPending      : $('stat-pending'),
  statMissed       : $('stat-missed'),
  complianceFill   : $('compliance-fill'),
  todayList        : $('today-list'),
  todayEmpty       : $('today-empty'),
  btnAddFromEmpty  : $('btn-add-from-empty'),

  // history view
  historyFilter        : $('history-filter'),
  historyList          : $('history-list'),
  historyEmpty         : $('history-empty'),
  historyCompliancePct : $('history-compliance-pct'),
  historyComplianceFill: $('history-compliance-fill'),

  // medicines view
  btnAddMedicine  : $('btn-add-medicine'),
  medicinesList   : $('medicines-list'),
  medicinesEmpty  : $('medicines-empty'),

  // nav
  bottomNavItems  : $$('.bottom-nav__item[data-view]'),
  btnFab          : $('btn-fab'),
  btnNavSettings  : $('btn-nav-settings'),

  // modal: schedule
  modalSchedule         : $('modal-schedule'),
  modalScheduleTitle    : $('modal-schedule-title'),
  modalScheduleBackdrop : $('modal-schedule-backdrop'),
  btnModalScheduleClose : $('btn-modal-schedule-close'),
  formSchedule          : $('form-schedule'),
  fieldScheduleId       : $('field-schedule-id'),
  fieldMedicineSelect   : $('field-medicine-select'),
  btnQuickAddMedicine   : $('btn-quick-add-medicine'),
  fieldDoseAmount       : $('field-dose-amount'),
  fieldDoseUnit         : $('field-dose-unit'),
  timesContainer        : $('times-container'),
  btnAddTime            : $('btn-add-time'),
  fieldFrequency        : $('field-frequency'),
  groupSpecificDays     : $('group-specific-days'),
  groupInterval         : $('group-interval'),
  fieldInterval         : $('field-interval'),
  fieldStartDate        : $('field-start-date'),
  fieldEndDate          : $('field-end-date'),
  fieldNotes            : $('field-notes'),
  btnDeleteSchedule     : $('btn-delete-schedule'),
  btnSaveSchedule       : $('btn-save-schedule'),
  errMedicine           : $('err-medicine'),
  errDose               : $('err-dose'),
  errDays               : $('err-days'),
  errStart              : $('err-start'),
  errEnd                : $('err-end'),

  // modal: medicine
  modalMedicine         : $('modal-medicine'),
  modalMedicineTitle    : $('modal-medicine-title'),
  modalMedicineBackdrop : $('modal-medicine-backdrop'),
  btnModalMedicineClose : $('btn-modal-medicine-close'),
  formMedicine          : $('form-medicine'),
  fieldMedicineId       : $('field-medicine-id'),
  fieldMedicineName     : $('field-medicine-name'),
  fieldMedicineColor    : $('field-medicine-color'),
  fieldMedicineIcon     : $('field-medicine-icon'),
  fieldStock            : $('field-stock'),
  fieldStockWarn        : $('field-stock-warn'),
  fieldMedicineNotes    : $('field-medicine-notes'),
  btnDeleteMedicine     : $('btn-delete-medicine'),
  errMedicineName       : $('err-medicine-name'),

  // modal: refill
  modalRefill           : $('modal-refill'),
  modalRefillBackdrop   : $('modal-refill-backdrop'),
  btnModalRefillClose   : $('btn-modal-refill-close'),
  formRefill            : $('form-refill'),
  fieldRefillMedicineId : $('field-refill-medicine-id'),
  fieldRefillAmount     : $('field-refill-amount'),
  refillUnitLabel       : $('refill-unit-label'),
  errRefillAmount       : $('err-refill-amount'),

  // modal: profile
  modalProfile         : $('modal-profile'),
  modalProfileTitle    : $('modal-profile-title'),
  modalProfileBackdrop : $('modal-profile-backdrop'),
  btnModalProfileClose : $('btn-modal-profile-close'),
  formProfile          : $('form-profile'),
  fieldProfileId       : $('field-profile-id'),
  fieldProfileName     : $('field-profile-name'),
  btnDeleteProfile     : $('btn-delete-profile'),
  errProfileName       : $('err-profile-name'),

  // modal: settings
  modalSettings         : $('modal-settings'),
  modalSettingsBackdrop : $('modal-settings-backdrop'),
  btnModalSettingsClose : $('btn-modal-settings-close'),
  settingNotifEnabled   : $('setting-notif-enabled'),
  settingSnoozeEnabled  : $('setting-snooze-enabled'),
  settingTheme          : $('setting-theme'),
  btnExportData         : $('btn-export-data'),
  btnImportData         : $('btn-import-data'),
  inputImportFile       : $('input-import-file'),
  btnClearData          : $('btn-clear-data'),

  // confirm dialog
  modalConfirm    : $('modal-confirm'),
  confirmTitle    : $('confirm-title'),
  confirmDesc     : $('confirm-desc'),
  btnConfirmOk    : $('btn-confirm-ok'),
  btnConfirmCancel: $('btn-confirm-cancel'),

  // misc
  snackbar       : $('snackbar'),
  installBanner  : $('install-banner'),
  btnInstall     : $('btn-install'),
  btnInstallDismiss : $('btn-install-dismiss'),
};

/* ══════════════════════════════════════════════════════════════
   1. APP STATE
══════════════════════════════════════════════════════════════ */
const State = {
  activeProfile : null,   // profile object
  profiles      : [],
  currentView   : 'today',
  settings      : null,
};

/* ══════════════════════════════════════════════════════════════
   2. BOOTSTRAP
══════════════════════════════════════════════════════════════ */
async function boot() {
  // Load settings
  State.settings = DB.Settings.load();

  // Apply theme immediately (before paint)
  applyTheme(State.settings.theme);

  // Ensure default profile exists
  const defaultProfile = await DB.Profiles.ensureDefault();

  // Load all profiles
  State.profiles = await DB.Profiles.getAll();

  // Determine active profile
  const savedId = State.settings.activeProfileId;
  State.activeProfile = State.profiles.find(p => p.id === savedId)
    || defaultProfile
    || State.profiles[0];

  // Update settings if active profile changed
  if (State.activeProfile) {
    DB.Settings.set('activeProfileId', State.activeProfile.id);
  }

  // Sync settings toggles
  El.settingNotifEnabled.checked  = State.settings.notifEnabled  ?? false;
  El.settingSnoozeEnabled.checked = State.settings.snoozeEnabled ?? true;
  El.settingTheme.value           = State.settings.theme         ?? 'dark';

  // Render topbar profile
  renderTopbarProfile();

  // Register Service Worker
  registerSW();

  // Check URL param for quick-add shortcut
  const params = new URLSearchParams(location.search);
  if (params.get('action') === 'add') {
    openScheduleModal();
  }

  // Initial render
  await renderTodayView();

  // Auto-mark missed doses on load
  await ReminderEngine.autoMarkMissed(State.activeProfile.id);

  // Schedule notifications
  if (State.settings.notifEnabled) {
    await ReminderEngine.scheduleNotifications(State.activeProfile.id);
  }

  // Start tick loop
  ReminderEngine.startTick(State.activeProfile.id);

  // Check low stock
  await checkLowStock();

  // Wire all events
  wireEvents();
}

/* ══════════════════════════════════════════════════════════════
   3. SERVICE WORKER
══════════════════════════════════════════════════════════════ */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./service-worker.js', {
      scope: './',
    });
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showSnackbar('Update tersedia. Muat ulang untuk memperbarui.', 'info', 6000);
        }
      });
    });
  } catch (err) {
    console.warn('[SW] Registration failed:', err);
  }
}

/* ══════════════════════════════════════════════════════════════
   4. THEME
══════════════════════════════════════════════════════════════ */
function applyTheme(theme) {
  let resolved = theme;
  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', resolved);
}

/* ══════════════════════════════════════════════════════════════
   5. VIEW ROUTER
══════════════════════════════════════════════════════════════ */
async function switchView(viewName) {
  if (State.currentView === viewName) return;
  State.currentView = viewName;

  // Toggle views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${viewName}`);
    v.classList.toggle('hidden', v.id !== `view-${viewName}`);
  });

  // Update nav active state
  El.bottomNavItems.forEach(btn => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Lazy-load view content
  if (viewName === 'today')     await renderTodayView();
  if (viewName === 'history')   await renderHistoryView();
  if (viewName === 'medicines') await renderMedicinesView();
}

/* ══════════════════════════════════════════════════════════════
   6. TODAY VIEW
══════════════════════════════════════════════════════════════ */
async function renderTodayView() {
  if (!State.activeProfile) return;

  const today   = ReminderEngine.todayStr();
  const dateObj = ReminderEngine.parseDate(today);

  El.todayDate.textContent = dateObj.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const slots = await ReminderEngine.getDosesForDate(State.activeProfile.id, today);
  const stats = await ReminderEngine.getStatsForDate(State.activeProfile.id, today);

  // Stats chips
  El.statDone.textContent    = stats.done;
  El.statPending.textContent = stats.pending;
  El.statMissed.textContent  = stats.missed;

  // Compliance bar
  const pct = stats.total === 0 ? 0 : Math.round((stats.done / stats.total) * 100);
  El.complianceFill.style.width = `${pct}%`;
  El.complianceFill.closest('[role=progressbar]').setAttribute('aria-valuenow', pct);

  if (slots.length === 0) {
    El.todayList.innerHTML = '';
    El.todayEmpty.classList.remove('hidden');
    return;
  }

  El.todayEmpty.classList.add('hidden');
  El.todayList.innerHTML = slots.map(renderScheduleCard).join('');
  El.todayList.setAttribute('aria-label', `${slots.length} jadwal hari ini`);

  // Bind card buttons
  bindCardButtons();
}

function renderScheduleCard(slot) {
  const [hour, min] = slot.time.split(':');
  const h24 = parseInt(hour, 10);
  const ampm = h24 < 12 ? 'AM' : 'PM';

  const statusLabel = {
    done:    '✅ Selesai',
    missed:  '❌ Terlewat',
    snoozed: '⏭️ Ditunda',
    pending: '⏰ Menunggu',
  }[slot.status] ?? '⏰ Menunggu';

  const isDone    = slot.status === 'done';
  const isMissed  = slot.status === 'missed';
  const isPending = slot.status === 'pending' || slot.status === 'snoozed';

  return `
  <article class="schedule-card" data-status="${slot.status}" data-key="${slot.key}"
           data-schedule-id="${slot.scheduleId}" data-medicine-id="${slot.medicineId}"
           data-date="${slot.date}" data-time="${slot.time}"
           role="listitem" aria-label="${slot.medicineName} jam ${slot.time}">
    <div class="schedule-card__time">
      <span class="schedule-card__hour">${hour}:${min}</span>
      <span class="schedule-card__ampm">${ampm}</span>
    </div>
    <div class="schedule-card__body">
      <div class="schedule-card__name">
        ${escHtml(slot.medicineIcon)} ${escHtml(slot.medicineName)}
      </div>
      <div class="schedule-card__dose">${escHtml(String(slot.doseAmount))} ${escHtml(slot.doseUnit)}</div>
      ${slot.notes ? `<div class="schedule-card__note">${escHtml(slot.notes)}</div>` : ''}
    </div>
    <div class="schedule-card__actions">
      <span class="status-badge status-badge--${slot.status}" aria-label="Status: ${statusLabel}">
        ${statusLabel}
      </span>
      ${isPending ? `
        <button class="btn-check ${isDone ? 'checked' : ''}"
                data-action="done"
                data-key="${slot.key}"
                aria-label="Tandai sudah diminum: ${escHtml(slot.medicineName)}">
          ✓
        </button>
        <button class="btn-snooze"
                data-action="snooze"
                data-key="${slot.key}"
                aria-label="Tunda ${NotifManager.SNOOZE_MINUTES} menit">
          ⏱ Tunda
        </button>
      ` : ''}
      ${isDone ? `
        <button class="btn-check checked" disabled aria-label="Sudah diminum">✓</button>
      ` : ''}
      <button class="btn-edit-schedule"
              data-action="edit-schedule"
              data-schedule-id="${slot.scheduleId}"
              aria-label="Edit jadwal ${escHtml(slot.medicineName)}">
        ✎
      </button>
    </div>
  </article>`;
}

function bindCardButtons() {
  El.todayList.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleCardAction);
  });
}

async function handleCardAction(e) {
  const btn    = e.currentTarget;
  const action = btn.dataset.action;
  const key    = btn.dataset.key;

  if (action === 'done' || action === 'snooze') {
    // Retrieve the slot from rendered card
    const card = btn.closest('.schedule-card');
    const slot = {
      key,
      scheduleId:  parseInt(card.dataset.scheduleId, 10),
      date:        card.dataset.date,
      time:        card.dataset.time,
      status:      card.dataset.status,
      profileId:   State.activeProfile.id,
      medicineId:  parseInt(card.dataset.medicineId, 10),
    };

    // Re-fetch full slot for accurate data
    const slots = await ReminderEngine.getDosesForDate(State.activeProfile.id, slot.date);
    const fullSlot = slots.find(s => s.key === key);
    if (!fullSlot) return;

    if (action === 'done') {
      await ReminderEngine.markDose(fullSlot, 'done');
      NotifManager.cancel(fullSlot.scheduleId, fullSlot.date, fullSlot.time);
      showSnackbar(`✅ ${fullSlot.medicineName} ditandai selesai`, 'success');
    } else {
      // Build self-contained callbacks for the snoozed notification
      const snoozeDoseData = {
        scheduleId:   fullSlot.scheduleId,
        medicineName: fullSlot.medicineName,
        medicineIcon: fullSlot.medicineIcon,
        doseAmount:   fullSlot.doseAmount,
        doseUnit:     fullSlot.doseUnit,
        date:         fullSlot.date,
        time:         fullSlot.time,
        profileId:    fullSlot.profileId,
      };

      const snoozeOnTaken = async () => {
        const fresh = await ReminderEngine.getDosesForDate(fullSlot.profileId, fullSlot.date);
        const target = fresh.find(s => s.scheduleId === fullSlot.scheduleId && s.time === fullSlot.time);
        if (target && target.status !== 'done') {
          await ReminderEngine.markDose(target, 'done');
          NotifManager.cancel(fullSlot.scheduleId, fullSlot.date, fullSlot.time);
          window.dispatchEvent(new CustomEvent('med:doses-updated', {
            detail: { profileId: fullSlot.profileId, date: fullSlot.date },
          }));
        }
      };

      const snoozeOnSnooze = async () => {
        const fresh = await ReminderEngine.getDosesForDate(fullSlot.profileId, fullSlot.date);
        const target = fresh.find(s => s.scheduleId === fullSlot.scheduleId && s.time === fullSlot.time);
        if (target && (target.status === 'pending' || target.status === 'snoozed')) {
          const until = NotifManager.snooze({ ...snoozeDoseData, onTaken: snoozeOnTaken, onSnooze: snoozeOnSnooze });
          await ReminderEngine.markDose(target, 'snoozed', until?.getTime() ?? null);
          window.dispatchEvent(new CustomEvent('med:doses-updated', {
            detail: { profileId: fullSlot.profileId, date: fullSlot.date },
          }));
        }
      };

      const snoozeUntil = NotifManager.snooze({ ...snoozeDoseData, onTaken: snoozeOnTaken, onSnooze: snoozeOnSnooze });
      await ReminderEngine.markDose(fullSlot, 'snoozed', snoozeUntil?.getTime() ?? null);
      showSnackbar(`⏰ Ditunda ${NotifManager.SNOOZE_MINUTES} menit`, 'info');
    }

    await renderTodayView();
    await checkLowStock();
    return;
  }

  if (action === 'edit-schedule') {
    const scheduleId = parseInt(btn.dataset.scheduleId, 10);
    openScheduleModal(scheduleId);
  }
}

/* ══════════════════════════════════════════════════════════════
   7. HISTORY VIEW
══════════════════════════════════════════════════════════════ */
async function renderHistoryView() {
  if (!State.activeProfile) return;

  const days    = parseInt(El.historyFilter.value, 10) || 7;
  const history = await ReminderEngine.getHistory(State.activeProfile.id, days);

  // Overall compliance for the period
  const today     = ReminderEngine.todayStr();
  const startDate = ReminderEngine.toDateStr(new Date(Date.now() - (days - 1) * 86400000));
  const rangeStats = await ReminderEngine.getStatsForRange(State.activeProfile.id, startDate, today);

  El.historyCompliancePct.textContent = `${rangeStats.pct}%`;
  El.historyComplianceFill.style.width = `${rangeStats.pct}%`;
  El.historyComplianceFill.closest('[role=progressbar]').setAttribute('aria-valuenow', rangeStats.pct);

  if (history.length === 0) {
    El.historyList.innerHTML = '';
    El.historyEmpty.classList.remove('hidden');
    return;
  }

  El.historyEmpty.classList.add('hidden');
  El.historyList.innerHTML = history.map(renderHistoryDay).join('');
}

function renderHistoryDay(group) {
  const items = group.slots.map(slot => {
    const statusIcon = { done: '✅', missed: '❌', snoozed: '⏭️', pending: '⏰' }[slot.status] ?? '⏰';
    return `
      <div class="history-item" role="listitem">
        <span class="history-item__time">${slot.time}</span>
        <span class="history-item__icon">${escHtml(slot.medicineIcon)}</span>
        <span class="history-item__name">${escHtml(slot.medicineName)}</span>
        <span class="history-item__status" aria-label="Status: ${slot.status}">${statusIcon}</span>
      </div>`;
  }).join('');

  const { done, missed, total } = group.stats;
  const pctLabel = total > 0 ? `${done}/${total}` : '—';

  return `
    <div class="history-day" role="listitem">
      <div class="history-day__header">
        ${escHtml(group.dateLabel)}
        <span style="float:right;font-weight:400">${pctLabel}</span>
      </div>
      <div class="history-day__items">${items}</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   8. MEDICINES VIEW
══════════════════════════════════════════════════════════════ */
async function renderMedicinesView() {
  if (!State.activeProfile) return;

  const medicines = await DB.Medicines.getByProfile(State.activeProfile.id);

  if (medicines.length === 0) {
    El.medicinesList.innerHTML = '';
    El.medicinesEmpty.classList.remove('hidden');
    return;
  }

  El.medicinesEmpty.classList.add('hidden');
  El.medicinesList.innerHTML = medicines.map(renderMedicineCard).join('');

  El.medicinesList.querySelectorAll('.medicine-card__edit').forEach(btn => {
    btn.addEventListener('click', () => openMedicineModal(parseInt(btn.dataset.id, 10)));
  });

  El.medicinesList.querySelectorAll('.medicine-card__refill').forEach(btn => {
    btn.addEventListener('click', () => openRefillModal(
      parseInt(btn.dataset.id, 10),
      btn.dataset.name,
      btn.dataset.unit
    ));
  });
}

function renderMedicineCard(med) {
  const hasStock   = med.stock != null;
  const lowStock   = hasStock && med.stockWarnAt != null && med.stock <= med.stockWarnAt;
  const maxForBar  = hasStock ? Math.max(med.stock, (med.stockWarnAt ?? 0) * 2, 30) : 30;
  const stockPct   = hasStock ? Math.min(100, Math.round((med.stock / maxForBar) * 100)) : 0;
  const barClass   = lowStock
    ? (med.stock === 0 ? 'stock-bar__fill--danger' : 'stock-bar__fill--warning')
    : 'stock-bar__fill--ok';

  const stockHTML = hasStock ? `
    <div class="stock-bar-wrap">
      <div class="stock-label">${lowStock ? '⚠️ ' : ''}Stok: ${med.stock} ${med.stockUnit || 'tablet'}</div>
      <div class="stock-bar" role="progressbar" aria-valuenow="${med.stock}" aria-label="Stok tersisa">
        <div class="stock-bar__fill ${barClass}" style="width:${stockPct}%"></div>
      </div>
      ${lowStock ? `
        <div class="stock-low-row">
          <span class="stock-warn-badge">⚠️ Stok hampir habis</span>
          <button class="btn btn--sm btn--ghost medicine-card__refill"
                  data-id="${med.id}" data-name="${escHtml(med.name)}"
                  data-unit="${escHtml(med.stockUnit || 'tablet')}"
                  aria-label="Isi ulang stok ${escHtml(med.name)}">+ Isi Ulang</button>
        </div>` : ''}
    </div>` : '';

  return `
    <article class="medicine-card" role="listitem" aria-label="${escHtml(med.name)}">
      <div class="medicine-card__icon" style="background:${med.color ? med.color + '22' : 'var(--brand-subtle)'}">
        ${escHtml(med.icon || '💊')}
      </div>
      <div class="medicine-card__body">
        <div class="medicine-card__name">${escHtml(med.name)}</div>
        ${med.notes ? `<div class="medicine-card__note">${escHtml(med.notes)}</div>` : ''}
        ${stockHTML}
      </div>
      <button class="medicine-card__edit" data-id="${med.id}" aria-label="Edit ${escHtml(med.name)}">
        ✎
      </button>
    </article>`;
}

/* ══════════════════════════════════════════════════════════════
   9. PROFILE DROPDOWN
══════════════════════════════════════════════════════════════ */
function renderTopbarProfile() {
  if (!State.activeProfile) return;
  El.activeProfileAvatar.textContent = State.activeProfile.avatar || '👤';
  El.activeProfileName.textContent   = State.activeProfile.name;
}

function renderProfileDropdown() {
  El.profileList.innerHTML = State.profiles.map(p => `
    <li role="none">
      <button class="dropdown__item ${p.id === State.activeProfile?.id ? 'active' : ''}"
              data-profile-id="${p.id}" role="menuitem"
              aria-current="${p.id === State.activeProfile?.id}">
        <span class="dropdown__item__avatar">${escHtml(p.avatar || '👤')}</span>
        <span class="dropdown__item__name">${escHtml(p.name)}</span>
        <span class="dropdown__item__check">${p.id === State.activeProfile?.id ? '✓' : ''}</span>
        <button class="btn btn--ghost btn--sm" data-edit-profile="${p.id}"
                aria-label="Edit profil ${escHtml(p.name)}"
                style="margin-left:auto;font-size:0.75rem">✎</button>
      </button>
    </li>`).join('');

  // Bind profile switch
  El.profileList.querySelectorAll('[data-profile-id]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      // Ignore if the edit button was clicked
      if (e.target.closest('[data-edit-profile]')) return;
      const pid = parseInt(btn.dataset.profileId, 10);
      await switchProfile(pid);
      closeDropdown();
    });
  });

  // Bind profile edit
  El.profileList.querySelectorAll('[data-edit-profile]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openProfileModal(parseInt(btn.dataset.editProfile, 10));
      closeDropdown();
    });
  });
}

async function switchProfile(profileId) {
  State.activeProfile = State.profiles.find(p => p.id === profileId);
  if (!State.activeProfile) return;
  DB.Settings.set('activeProfileId', profileId);
  renderTopbarProfile();
  ReminderEngine.stopTick();
  NotifManager.cancelAll();
  await renderTodayView();
  if (DB.Settings.get('notifEnabled')) {
    await ReminderEngine.scheduleNotifications(profileId);
  }
  ReminderEngine.startTick(profileId);
  showSnackbar(`Profil diubah ke ${State.activeProfile.name}`);
}

function openDropdown() {
  renderProfileDropdown();
  // Position dropdown below the topbar using its actual rendered height
  const topbar = document.querySelector('.topbar');
  if (topbar) {
    El.profileDropdown.style.top = `${topbar.offsetHeight + 4}px`;
  }
  El.profileDropdown.classList.remove('hidden');
  El.dropdownBackdrop.classList.remove('hidden');
  El.btnProfileMenu.setAttribute('aria-expanded', 'true');
}

function closeDropdown() {
  El.profileDropdown.classList.add('hidden');
  El.dropdownBackdrop.classList.add('hidden');
  El.btnProfileMenu.setAttribute('aria-expanded', 'false');
}

/* ══════════════════════════════════════════════════════════════
   10. SCHEDULE MODAL
══════════════════════════════════════════════════════════════ */
async function openScheduleModal(scheduleId = null) {
  El.modalScheduleTitle.textContent = scheduleId ? 'Edit Jadwal' : 'Tambah Jadwal';
  El.btnDeleteSchedule.classList.toggle('hidden', !scheduleId);
  El.fieldScheduleId.value = scheduleId || '';

  // Populate medicine select
  await populateMedicineSelect();

  if (scheduleId) {
    // Load existing schedule
    const sched = await DB.Schedules.getById(scheduleId);
    if (!sched) return;

    El.fieldMedicineSelect.value = sched.medicineId;
    El.fieldDoseAmount.value     = sched.doseAmount;
    El.fieldDoseUnit.value       = sched.doseUnit;
    El.fieldFrequency.value      = sched.frequency;
    El.fieldStartDate.value      = sched.startDate;
    El.fieldEndDate.value        = sched.endDate || '';
    El.fieldNotes.value          = sched.notes || '';

    // Restore times
    El.timesContainer.innerHTML = '';
    (sched.times || ['08:00']).forEach((t, i) => addTimeEntry(t, i));

    // Frequency extras
    handleFrequencyChange(sched.frequency);
    if (sched.frequency === 'specific_days') {
      El.groupSpecificDays.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = (sched.specificDays || []).includes(parseInt(cb.value, 10));
      });
    }
    if (sched.frequency === 'interval') {
      El.fieldInterval.value = sched.intervalDays || 2;
    }
  } else {
    // Defaults for new schedule
    El.formSchedule.reset();
    El.fieldScheduleId.value = '';
    El.timesContainer.innerHTML = '';
    addTimeEntry('08:00', 0);
    El.fieldStartDate.value = ReminderEngine.todayStr();
    handleFrequencyChange('daily');
  }

  clearFormErrors(['err-medicine', 'err-dose', 'err-days', 'err-start', 'err-end']);
  openModal(El.modalSchedule);
}

async function populateMedicineSelect() {
  if (!State.activeProfile) return;
  const meds = await DB.Medicines.getByProfile(State.activeProfile.id);
  const current = El.fieldMedicineSelect.value;

  El.fieldMedicineSelect.innerHTML = `<option value="">-- Pilih obat --</option>` +
    meds.map(m => `<option value="${m.id}">${escHtml(m.icon || '💊')} ${escHtml(m.name)}</option>`).join('');

  if (current) El.fieldMedicineSelect.value = current;
}

function addTimeEntry(value = '08:00', index = null) {
  const idx = index ?? El.timesContainer.children.length;
  const div = document.createElement('div');
  div.className = 'time-entry';
  div.dataset.index = idx;
  div.innerHTML = `
    <input type="time" class="input input--time time-input"
           value="${value}" required aria-label="Waktu ke-${idx + 1}" />
    <button type="button" class="btn btn--ghost btn--icon btn-remove-time ${idx === 0 ? 'hidden' : ''}"
            aria-label="Hapus waktu ini">✕</button>`;
  div.querySelector('.btn-remove-time').addEventListener('click', () => {
    div.remove();
    updateTimeEntryLabels();
  });
  El.timesContainer.appendChild(div);
  updateTimeEntryLabels();
}

function updateTimeEntryLabels() {
  El.timesContainer.querySelectorAll('.time-entry').forEach((div, i) => {
    const removeBtn = div.querySelector('.btn-remove-time');
    if (removeBtn) removeBtn.classList.toggle('hidden', i === 0);
    const input = div.querySelector('.time-input');
    if (input) input.setAttribute('aria-label', `Waktu ke-${i + 1}`);
  });
}

function handleFrequencyChange(freq) {
  El.groupSpecificDays.classList.toggle('hidden', freq !== 'specific_days');
  El.groupInterval.classList.toggle('hidden',     freq !== 'interval');
}

async function saveSchedule(e) {
  e.preventDefault();

  // Validation
  let valid = true;
  clearFormErrors(['err-medicine', 'err-dose', 'err-days', 'err-start', 'err-end']);

  const medicineId = parseInt(El.fieldMedicineSelect.value, 10);
  if (!medicineId) {
    showFieldError('err-medicine');
    valid = false;
  }

  const doseAmount = parseFloat(El.fieldDoseAmount.value);
  if (!doseAmount || doseAmount <= 0) {
    showFieldError('err-dose');
    valid = false;
  }

  const startDate = El.fieldStartDate.value;
  if (!startDate) {
    showFieldError('err-start');
    valid = false;
  }

  const frequency = El.fieldFrequency.value;
  if (frequency === 'specific_days') {
    const checked = El.groupSpecificDays.querySelectorAll('input:checked');
    if (checked.length === 0) {
      showFieldError('err-days');
      valid = false;
    }
  }

  // End date must be on or after start date
  const endDate = El.fieldEndDate.value;
  if (endDate && startDate && endDate < startDate) {
    showFieldError('err-end');
    valid = false;
  }

  // Check for duplicate times
  const timeInputs = Array.from(El.timesContainer.querySelectorAll('.time-input'))
    .map(i => i.value).filter(Boolean);
  const uniqueTimes = [...new Set(timeInputs)];
  if (uniqueTimes.length !== timeInputs.length) {
    showSnackbar('⚠️ Waktu yang sama dihapus secara otomatis.', 'info', 4000);
  }

  if (!valid) return;

  // Collect times (deduplicated)
  const times = uniqueTimes.length > 0 ? uniqueTimes : ['08:00'];

  // Specific days
  const specificDays = Array.from(
    El.groupSpecificDays.querySelectorAll('input:checked')
  ).map(cb => parseInt(cb.value, 10));

  const data = {
    profileId:    State.activeProfile.id,
    medicineId,
    doseAmount,
    doseUnit:     El.fieldDoseUnit.value,
    times,
    frequency,
    specificDays: frequency === 'specific_days' ? specificDays : [],
    intervalDays: frequency === 'interval' ? parseInt(El.fieldInterval.value, 10) || 2 : null,
    startDate,
    endDate:      El.fieldEndDate.value || null,
    notes:        El.fieldNotes.value.trim(),
    active:       true,
  };

  const scheduleId = El.fieldScheduleId.value
    ? parseInt(El.fieldScheduleId.value, 10)
    : null;

  if (scheduleId) {
    await DB.Schedules.put({ ...data, id: scheduleId });
    showSnackbar('✅ Jadwal diperbarui', 'success');
  } else {
    await DB.Schedules.add(data);
    showSnackbar('✅ Jadwal ditambahkan', 'success');
  }

  closeModal(El.modalSchedule);

  // Re-schedule notifications and refresh view
  if (DB.Settings.get('notifEnabled')) {
    await ReminderEngine.scheduleNotifications(State.activeProfile.id);
  }
  await renderTodayView();
  if (State.currentView === 'history') await renderHistoryView();
}

async function deleteSchedule() {
  const scheduleId = parseInt(El.fieldScheduleId.value, 10);
  if (!scheduleId) return;

  const confirmed = await showConfirm(
    'Hapus Jadwal?',
    'Riwayat penggunaan akan ikut dihapus. Tindakan ini tidak dapat dibatalkan.'
  );
  if (!confirmed) return;

  await DB.Schedules.remove(scheduleId);
  closeModal(El.modalSchedule);
  showSnackbar('Jadwal dihapus', 'info');
  await renderTodayView();
  if (State.currentView === 'history') await renderHistoryView();
  if (DB.Settings.get('notifEnabled')) {
    await ReminderEngine.scheduleNotifications(State.activeProfile.id);
  }
}

/* ══════════════════════════════════════════════════════════════
   11. MEDICINE MODAL
══════════════════════════════════════════════════════════════ */
async function openMedicineModal(medicineId = null) {
  El.modalMedicineTitle.textContent = medicineId ? 'Edit Obat' : 'Tambah Obat';
  El.btnDeleteMedicine.classList.toggle('hidden', !medicineId);
  El.fieldMedicineId.value = medicineId || '';
  clearFormErrors(['err-medicine-name']);

  if (medicineId) {
    const med = await DB.Medicines.getById(medicineId);
    if (!med) return;
    El.fieldMedicineName.value    = med.name;
    El.fieldMedicineColor.value   = med.color || '#6366f1';
    El.fieldMedicineIcon.value    = med.icon  || '💊';
    El.fieldStock.value           = med.stock     ?? '';
    El.fieldStockWarn.value       = med.stockWarnAt ?? '';
    El.fieldMedicineNotes.value   = med.notes || '';
  } else {
    El.formMedicine.reset();
    El.fieldMedicineId.value  = '';
    El.fieldMedicineColor.value = '#6366f1';
  }

  openModal(El.modalMedicine);
}

async function saveMedicine(e) {
  e.preventDefault();
  clearFormErrors(['err-medicine-name']);

  const name = El.fieldMedicineName.value.trim();
  if (!name) { showFieldError('err-medicine-name'); return; }

  const data = {
    profileId:   State.activeProfile.id,
    name,
    color:       El.fieldMedicineColor.value,
    icon:        El.fieldMedicineIcon.value,
    stock:       El.fieldStock.value !== '' ? parseInt(El.fieldStock.value, 10) : null,
    stockWarnAt: El.fieldStockWarn.value !== '' ? parseInt(El.fieldStockWarn.value, 10) : null,
    notes:       El.fieldMedicineNotes.value.trim(),
  };

  const medicineId = El.fieldMedicineId.value
    ? parseInt(El.fieldMedicineId.value, 10)
    : null;

  if (medicineId) {
    await DB.Medicines.put({ ...data, id: medicineId });
    showSnackbar('✅ Obat diperbarui', 'success');
  } else {
    await DB.Medicines.add(data);
    showSnackbar('✅ Obat ditambahkan', 'success');
  }

  closeModal(El.modalMedicine);
  await renderMedicinesView();
  await populateMedicineSelect();
}

async function deleteMedicine() {
  const medicineId = parseInt(El.fieldMedicineId.value, 10);
  if (!medicineId) return;

  const confirmed = await showConfirm(
    'Hapus Obat?',
    'Semua jadwal dan riwayat untuk obat ini akan dihapus. Tidak dapat dibatalkan.'
  );
  if (!confirmed) return;

  await DB.Medicines.remove(medicineId);
  closeModal(El.modalMedicine);
  showSnackbar('Obat dihapus', 'info');
  await renderMedicinesView();
  if (DB.Settings.get('notifEnabled')) {
    await ReminderEngine.scheduleNotifications(State.activeProfile.id);
  }
}

/* ══════════════════════════════════════════════════════════════
   11b. REFILL MODAL
══════════════════════════════════════════════════════════════ */
function openRefillModal(medicineId, medicineName, unit) {
  El.fieldRefillMedicineId.value = medicineId;
  El.fieldRefillAmount.value     = '';
  El.refillUnitLabel.textContent = `(${unit})`;
  El.errRefillAmount.classList.add('hidden');

  const title = El.modalRefill.querySelector('#modal-refill-title');
  if (title) title.textContent = `Isi Ulang — ${medicineName}`;

  openModal(El.modalRefill);
}

async function saveRefill(e) {
  e.preventDefault();
  El.errRefillAmount.classList.add('hidden');

  const medicineId = parseInt(El.fieldRefillMedicineId.value, 10);
  const amount     = parseInt(El.fieldRefillAmount.value, 10);

  if (!amount || amount <= 0) {
    El.errRefillAmount.classList.remove('hidden');
    return;
  }

  const med = await DB.Medicines.getById(medicineId);
  if (!med) return;

  const newStock = (med.stock ?? 0) + amount;
  await DB.Medicines.put({ ...med, stock: newStock });

  closeModal(El.modalRefill);
  showSnackbar(`✅ Stok ${med.name} ditambah ${amount} — total ${newStock}`, 'success');
  await renderMedicinesView();
}

/* ══════════════════════════════════════════════════════════════
   12. PROFILE MODAL
══════════════════════════════════════════════════════════════ */
async function openProfileModal(profileId = null) {
  El.modalProfileTitle.textContent = profileId ? 'Edit Profil' : 'Tambah Profil';
  El.btnDeleteProfile.classList.toggle('hidden', !profileId || State.profiles.length <= 1);
  El.fieldProfileId.value = profileId || '';
  clearFormErrors(['err-profile-name']);

  if (profileId) {
    const profile = await DB.Profiles.getById(profileId);
    if (!profile) return;
    El.fieldProfileName.value = profile.name;
    const avatarInput = El.formProfile.querySelector(`input[name=avatar][value="${profile.avatar}"]`);
    if (avatarInput) avatarInput.checked = true;
  } else {
    El.formProfile.reset();
    El.fieldProfileId.value = '';
    const firstAvatar = El.formProfile.querySelector('input[name=avatar]');
    if (firstAvatar) firstAvatar.checked = true;
  }

  openModal(El.modalProfile);
}

async function saveProfile(e) {
  e.preventDefault();
  clearFormErrors(['err-profile-name']);

  const name = El.fieldProfileName.value.trim();
  if (!name) { showFieldError('err-profile-name'); return; }

  const avatarInput = El.formProfile.querySelector('input[name=avatar]:checked');
  const avatar = avatarInput?.value || '👤';

  const profileId = El.fieldProfileId.value
    ? parseInt(El.fieldProfileId.value, 10)
    : null;

  if (profileId) {
    const existing = await DB.Profiles.getById(profileId);
    await DB.Profiles.put({ ...existing, name, avatar });
    showSnackbar('✅ Profil diperbarui', 'success');
  } else {
    const newProfile = await DB.Profiles.add({ name, avatar, isDefault: false });
    State.profiles.push(newProfile);
  }

  State.profiles = await DB.Profiles.getAll();
  closeModal(El.modalProfile);
  renderTopbarProfile();
  showSnackbar('✅ Profil disimpan', 'success');
}

async function deleteProfile() {
  const profileId = parseInt(El.fieldProfileId.value, 10);
  if (!profileId) return;

  const confirmed = await showConfirm(
    'Hapus Profil?',
    'Semua obat, jadwal, dan riwayat profil ini akan dihapus permanen.'
  );
  if (!confirmed) return;

  await DB.Profiles.remove(profileId);
  State.profiles = await DB.Profiles.getAll();

  // Switch to another profile if active was deleted
  if (State.activeProfile?.id === profileId) {
    State.activeProfile = State.profiles[0] || await DB.Profiles.ensureDefault();
    DB.Settings.set('activeProfileId', State.activeProfile?.id);
    renderTopbarProfile();
    await renderTodayView();
  }

  closeModal(El.modalProfile);
  showSnackbar('Profil dihapus', 'info');
}

/* ══════════════════════════════════════════════════════════════
   13. SETTINGS MODAL
══════════════════════════════════════════════════════════════ */
function openSettingsModal() {
  const s = DB.Settings.load();
  El.settingNotifEnabled.checked  = s.notifEnabled  ?? false;
  El.settingSnoozeEnabled.checked = s.snoozeEnabled ?? true;
  El.settingTheme.value           = s.theme         ?? 'dark';
  openModal(El.modalSettings);
}

async function handleNotifToggle() {
  const enabled = El.settingNotifEnabled.checked;

  if (enabled) {
    const perm = await NotifManager.requestPermission();
    if (perm !== 'granted') {
      El.settingNotifEnabled.checked = false;
      showSnackbar('⚠️ Izin notifikasi ditolak. Ubah di pengaturan browser.', 'error', 5000);
      return;
    }
    DB.Settings.set('notifEnabled', true);
    await ReminderEngine.scheduleNotifications(State.activeProfile.id);
    showSnackbar('🔔 Notifikasi diaktifkan', 'success');
  } else {
    DB.Settings.set('notifEnabled', false);
    NotifManager.cancelAll();
    showSnackbar('🔕 Notifikasi dimatikan', 'info');
  }

  El.btnNotifToggle.classList.toggle('active', enabled);
}

async function handleExportData() {
  try {
    const json     = await DB.DataIO.exportAll();
    const blob     = new Blob([json], { type: 'application/json' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const dateStr  = ReminderEngine.todayStr().replace(/-/g, '');
    a.href         = url;
    a.download     = `medicine-reminder-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showSnackbar('✅ Data berhasil diekspor', 'success');
  } catch (err) {
    showSnackbar('❌ Gagal mengekspor data', 'error');
    console.error(err);
  }
}

async function handleImportData(file) {
  if (!file) return;
  const confirmed = await showConfirm(
    'Impor Data?',
    'Data yang ada akan diganti seluruhnya dengan file ini. Tidak dapat dibatalkan.'
  );
  if (!confirmed) return;

  try {
    const text = await file.text();
    await DB.DataIO.importAll(text);
    State.profiles = await DB.Profiles.getAll();
    State.activeProfile = State.profiles[0];
    if (State.activeProfile) DB.Settings.set('activeProfileId', State.activeProfile.id);
    renderTopbarProfile();
    await renderTodayView();
    showSnackbar('✅ Data berhasil diimpor', 'success');
    closeModal(El.modalSettings);
  } catch (err) {
    showSnackbar('❌ File tidak valid atau rusak', 'error');
    console.error(err);
  }
}

async function handleClearData() {
  const confirmed = await showConfirm(
    'Hapus Semua Data?',
    'Seluruh profil, obat, jadwal, dan riwayat akan dihapus permanen. Tidak dapat dibatalkan.'
  );
  if (!confirmed) return;

  await DB.DataIO.clearAll();
  NotifManager.cancelAll();
  ReminderEngine.stopTick();

  // Re-init with fresh default profile
  const fresh = await DB.Profiles.ensureDefault();
  State.profiles = [fresh];
  State.activeProfile = fresh;
  DB.Settings.set('activeProfileId', fresh.id);
  State.settings = DB.Settings.load();

  renderTopbarProfile();
  await renderTodayView();
  ReminderEngine.startTick(State.activeProfile.id);
  showSnackbar('🗑️ Semua data dihapus', 'info');
  closeModal(El.modalSettings);
}

/* ══════════════════════════════════════════════════════════════
   14. MODAL HELPERS
══════════════════════════════════════════════════════════════ */
function openModal(modalEl) {
  modalEl.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Focus first focusable element
  const firstInput = modalEl.querySelector('input, select, textarea, button:not(.modal__close)');
  setTimeout(() => firstInput?.focus(), 100);
}

function closeModal(modalEl) {
  modalEl.classList.add('hidden');
  document.body.style.overflow = '';
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => closeModal(m));
}

/* ══════════════════════════════════════════════════════════════
   15. CONFIRM DIALOG
══════════════════════════════════════════════════════════════ */
let _confirmResolve = null;

function showConfirm(title, description) {
  El.confirmTitle.textContent = title;
  El.confirmDesc.textContent  = description;
  openModal(El.modalConfirm);

  return new Promise(resolve => {
    _confirmResolve = resolve;
  });
}

/* ══════════════════════════════════════════════════════════════
   16. SNACKBAR / TOAST
══════════════════════════════════════════════════════════════ */
let _snackTimer = null;

function showSnackbar(message, type = 'default', duration = 3000) {
  El.snackbar.textContent  = message;
  El.snackbar.className    = `snackbar snackbar--${type}`;
  El.snackbar.classList.remove('hidden');
  El.snackbar.setAttribute('aria-live', 'polite');

  clearTimeout(_snackTimer);
  _snackTimer = setTimeout(() => {
    El.snackbar.classList.add('hidden');
  }, duration);
}

/* ══════════════════════════════════════════════════════════════
   17. FORM ERROR HELPERS
══════════════════════════════════════════════════════════════ */
function showFieldError(id) {
  const el = $(id);
  if (el) el.classList.remove('hidden');
}

function clearFormErrors(ids) {
  ids.forEach(id => {
    const el = $(id);
    if (el) el.classList.add('hidden');
  });
}

/* ══════════════════════════════════════════════════════════════
   18. LOW STOCK CHECK
══════════════════════════════════════════════════════════════ */
async function checkLowStock() {
  if (!State.activeProfile) return;
  const lowStock = await ReminderEngine.getLowStockMedicines(State.activeProfile.id);
  if (lowStock.length > 0) {
    const names = lowStock.map(m => m.name).join(', ');
    showSnackbar(`⚠️ Stok hampir habis: ${names}`, 'error', 6000);
  }
}

/* ══════════════════════════════════════════════════════════════
   19. PWA INSTALL PROMPT
══════════════════════════════════════════════════════════════ */
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  El.installBanner.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  El.installBanner.classList.add('hidden');
  _deferredInstallPrompt = null;
  showSnackbar('✅ Aplikasi berhasil diinstal!', 'success');
});

/* ══════════════════════════════════════════════════════════════
   20. ESCAPE HELPER
══════════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════════
   21. EVENT WIRING
══════════════════════════════════════════════════════════════ */
function wireEvents() {

  /* ── Bottom nav ───────────────────────────────────────────── */
  El.bottomNavItems.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  El.btnFab.addEventListener('click', () => openScheduleModal());

  El.btnNavSettings.addEventListener('click', () => openSettingsModal());

  /* ── Profile dropdown ─────────────────────────────────────── */
  El.btnProfileMenu.addEventListener('click', () => {
    if (El.profileDropdown.classList.contains('hidden')) openDropdown();
    else closeDropdown();
  });

  El.dropdownBackdrop.addEventListener('click', closeDropdown);

  El.btnAddProfile.addEventListener('click', () => {
    closeDropdown();
    openProfileModal();
  });

  /* ── Notification toggle ──────────────────────────────────── */
  El.btnNotifToggle.addEventListener('click', async () => {
    const current = DB.Settings.get('notifEnabled');
    El.settingNotifEnabled.checked = !current;
    await handleNotifToggle();
  });

  /* ── Schedule modal ───────────────────────────────────────── */
  El.btnAddFromEmpty.addEventListener('click',       () => openScheduleModal());
  El.btnModalScheduleClose.addEventListener('click', () => closeModal(El.modalSchedule));
  El.modalScheduleBackdrop.addEventListener('click', () => closeModal(El.modalSchedule));
  El.formSchedule.addEventListener('submit', saveSchedule);
  El.btnDeleteSchedule.addEventListener('click', deleteSchedule);
  El.btnAddTime.addEventListener('click', () => addTimeEntry());
  El.btnQuickAddMedicine.addEventListener('click', () => {
    closeModal(El.modalSchedule);
    openMedicineModal();
  });

  El.fieldFrequency.addEventListener('change', () => {
    handleFrequencyChange(El.fieldFrequency.value);
  });

  /* ── Medicine modal ───────────────────────────────────────── */
  El.btnAddMedicine.addEventListener('click',          () => openMedicineModal());
  El.btnModalMedicineClose.addEventListener('click',   () => closeModal(El.modalMedicine));
  El.modalMedicineBackdrop.addEventListener('click',   () => closeModal(El.modalMedicine));
  El.formMedicine.addEventListener('submit', saveMedicine);
  El.btnDeleteMedicine.addEventListener('click', deleteMedicine);

  /* ── Refill modal ─────────────────────────────────────────── */
  El.btnModalRefillClose.addEventListener('click',  () => closeModal(El.modalRefill));
  El.modalRefillBackdrop.addEventListener('click',  () => closeModal(El.modalRefill));
  El.formRefill.addEventListener('submit', saveRefill);

  /* ── Profile modal ────────────────────────────────────────── */
  El.btnModalProfileClose.addEventListener('click', () => closeModal(El.modalProfile));
  El.modalProfileBackdrop.addEventListener('click', () => closeModal(El.modalProfile));
  El.formProfile.addEventListener('submit', saveProfile);
  El.btnDeleteProfile.addEventListener('click', deleteProfile);

  /* ── Settings modal ───────────────────────────────────────── */
  El.btnModalSettingsClose.addEventListener('click', () => closeModal(El.modalSettings));
  El.modalSettingsBackdrop.addEventListener('click', () => closeModal(El.modalSettings));

  El.settingNotifEnabled.addEventListener('change', handleNotifToggle);
  El.settingSnoozeEnabled.addEventListener('change', () => {
    DB.Settings.set('snoozeEnabled', El.settingSnoozeEnabled.checked);
  });
  El.settingTheme.addEventListener('change', () => {
    const theme = El.settingTheme.value;
    DB.Settings.set('theme', theme);
    applyTheme(theme);
  });

  El.btnExportData.addEventListener('click', handleExportData);
  El.btnImportData.addEventListener('click', () => El.inputImportFile.click());
  El.inputImportFile.addEventListener('change', (e) => {
    handleImportData(e.target.files[0]);
    e.target.value = '';
  });
  El.btnClearData.addEventListener('click', handleClearData);

  /* ── Confirm dialog ───────────────────────────────────────── */
  El.btnConfirmOk.addEventListener('click', () => {
    closeModal(El.modalConfirm);
    _confirmResolve?.(true);
    _confirmResolve = null;
  });
  El.btnConfirmCancel.addEventListener('click', () => {
    closeModal(El.modalConfirm);
    _confirmResolve?.(false);
    _confirmResolve = null;
  });

  /* ── Install banner ───────────────────────────────────────── */
  El.btnInstall.addEventListener('click', async () => {
    if (!_deferredInstallPrompt) return;
    _deferredInstallPrompt.prompt();
    const { outcome } = await _deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') El.installBanner.classList.add('hidden');
    _deferredInstallPrompt = null;
  });
  El.btnInstallDismiss.addEventListener('click', () => {
    El.installBanner.classList.add('hidden');
  });

  /* ── History filter ───────────────────────────────────────── */
  El.historyFilter.addEventListener('change', renderHistoryView);

  /* ── Keyboard: Escape closes topmost modal ────────────────── */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close modals from deepest first
      const openModals = [...document.querySelectorAll('.modal:not(.hidden)')];
      if (openModals.length > 0) {
        closeModal(openModals[openModals.length - 1]);
        if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
      } else if (!El.profileDropdown.classList.contains('hidden')) {
        closeDropdown();
      }
    }
  });

  /* ── ReminderEngine events ────────────────────────────────── */
  window.addEventListener('med:doses-updated', async (e) => {
    if (State.currentView === 'today')   await renderTodayView();
    if (State.currentView === 'history') await renderHistoryView();
  });

  window.addEventListener('med:day-changed', async () => {
    await renderTodayView();
  });

  window.addEventListener('med:reminder', async (e) => {
    const { action, medicineName } = e.detail || {};
    if (action === 'fire') {
      showSnackbar(`💊 Waktunya minum ${medicineName}`, 'info', 8000);
    } else if (action === 'taken') {
      showSnackbar(`✅ ${medicineName} ditandai selesai`, 'success');
    } else if (action === 'snooze') {
      showSnackbar(`⏰ ${medicineName} ditunda ${NotifManager.SNOOZE_MINUTES} menit`, 'info');
    }
    if (State.currentView === 'today') await renderTodayView();
  });

  window.addEventListener('med:reminder-action', async (e) => {
    const { action, scheduleId, date, time } = e.detail || {};

    // 'open' = user tapped the notification body (no action button)
    if (action === 'open') {
      if (State.currentView === 'today') await renderTodayView();
      if (State.currentView === 'history') await renderHistoryView();
      return;
    }

    if (!scheduleId || !date || !time) return;

    if (action === 'taken' || action === 'snooze') {
      // Re-fetch the full slot from the engine to ensure accurate data
      const slots = await ReminderEngine.getDosesForDate(State.activeProfile.id, date);
      const target = slots.find(s => s.scheduleId === scheduleId && s.time === time);
      if (!target) return;

      if (action === 'taken' && target.status !== 'done') {
        await ReminderEngine.markDose(target, 'done');
        NotifManager.cancel(scheduleId, date, time);
        showSnackbar(`✅ ${target.medicineName} ditandai selesai`, 'success');
      } else if (action === 'snooze' && target.status === 'pending') {
        const snoozeDoseData = {
          scheduleId:   target.scheduleId,
          medicineName: target.medicineName,
          medicineIcon: target.medicineIcon,
          doseAmount:   target.doseAmount,
          doseUnit:     target.doseUnit,
          date:         target.date,
          time:         target.time,
          profileId:    target.profileId,
        };

        // Self-contained callbacks for the snoozed notification
        const sOnTaken = async () => {
          const fresh = await ReminderEngine.getDosesForDate(target.profileId, target.date);
          const t = fresh.find(s => s.scheduleId === target.scheduleId && s.time === target.time);
          if (t && t.status !== 'done') {
            await ReminderEngine.markDose(t, 'done');
            NotifManager.cancel(target.scheduleId, target.date, target.time);
            window.dispatchEvent(new CustomEvent('med:doses-updated', {
              detail: { profileId: target.profileId, date: target.date },
            }));
          }
        };
        const sOnSnooze = async () => {
          const fresh = await ReminderEngine.getDosesForDate(target.profileId, target.date);
          const t = fresh.find(s => s.scheduleId === target.scheduleId && s.time === target.time);
          if (t && (t.status === 'pending' || t.status === 'snoozed')) {
            const until = NotifManager.snooze({ ...snoozeDoseData, onTaken: sOnTaken, onSnooze: sOnSnooze });
            await ReminderEngine.markDose(t, 'snoozed', until?.getTime() ?? null);
            window.dispatchEvent(new CustomEvent('med:doses-updated', {
              detail: { profileId: target.profileId, date: target.date },
            }));
          }
        };

        const snoozeUntil = NotifManager.snooze({ ...snoozeDoseData, onTaken: sOnTaken, onSnooze: sOnSnooze });
        await ReminderEngine.markDose(target, 'snoozed', snoozeUntil?.getTime() ?? null);
        showSnackbar(`⏰ Ditunda ${NotifManager.SNOOZE_MINUTES} menit`, 'info');
      }

      await checkLowStock();
    }

    if (action === 'dismissed') {
      // User closed the notification without acting — just refresh UI
    }

    if (State.currentView === 'today') await renderTodayView();
    if (State.currentView === 'history') await renderHistoryView();
  });

  /* ── SW re-activated: re-sync schedules ──────────────────── */
  window.addEventListener('med:sw-ready', async () => {
    if (State.activeProfile && DB.Settings.get('notifEnabled')) {
      await ReminderEngine.scheduleNotifications(State.activeProfile.id);
    }
  });

  /* ── System color scheme change ──────────────────────────── */
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (DB.Settings.get('theme') === 'system') applyTheme('system');
  });
}

/* ══════════════════════════════════════════════════════════════
   22. START
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', boot);
