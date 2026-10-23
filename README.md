# 💊 Medicine Reminder

A privacy-first, offline-capable PWA for managing personal medicine schedules. All data stays on your device — no server, no account, no tracking.

Built with vanilla JavaScript, IndexedDB, and the Web Notifications API. Works as an installable app on Android, iOS, and desktop.

## Features

- **Multi-profile support** — manage schedules for yourself and family members
- **Flexible scheduling** — daily, specific days of the week, or every N days
- **Multiple times per dose** — one schedule, multiple reminder times
- **Notifications** — browser notifications with "Sudah diminum" (taken) and "Tunda" (snooze) actions
- **Snooze** — postpone a reminder by 10 minutes
- **Compliance tracking** — see your adherence rate for today and over time
- **History** — review the last 7/14/30 days of medicine intake
- **Stock management** — track medicine inventory with low-stock warnings
- **Export/Import** — back up and restore data as JSON
- **Dark/Light/System theme** — follows your preference or system setting
- **Offline-first PWA** — installable, works without internet, service worker caching
- **Privacy-first** — all data stored locally in IndexedDB, nothing sent to any server

## Quick Start

This is a static site with no build step. Just serve the folder with any static file server:

```bash
# Python
python -m http.server 8080

# Node (npx)
npx serve

# VS Code
# Install the "Live Server" extension and click "Go Live"
```

Then open `http://localhost:8080` in your browser.

> **Note:** Notifications and service workers require HTTPS or localhost. Use a local server — opening `index.html` directly via `file://` won't enable PWA features.

### Installing as an App

- **Android (Chrome):** tap the install banner or use menu → "Install app"
- **iOS (Safari):** tap Share → "Add to Home Screen"
- **Desktop (Chrome/Edge):** click the install icon in the address bar

## Project Structure

```
medicine-reminder/
├── index.html              # App shell — all views, modals, and UI markup
├── manifest.json           # PWA manifest (icons, theme, shortcuts)
├── service-worker.js       # Offline caching + background notifications
├── css/
│   └── style.css           # All styles, dark/light themes via CSS custom properties
├── js/
│   ├── database.js         # IndexedDB abstraction (profiles, medicines, schedules, logs)
│   ├── notification.js     # Web Notifications scheduling + snooze + SW bridge
│   ├── reminder.js         # Core engine: dose slots, auto-miss, compliance stats, tick loop
│   └── app.js              # Main controller: views, modals, forms, event wiring
└── icons/
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-192.png
    └── icon-512.png
```

## Architecture

### Data Layer (`database.js`)

Uses IndexedDB with four object stores:

| Store       | Key       | Purpose                                    |
|-------------|-----------|--------------------------------------------|
| `profiles`  | auto-inc  | User profiles (family mode)                |
| `medicines` | auto-inc  | Medicine catalogue per profile             |
| `schedules` | auto-inc  | Recurring schedule definitions             |
| `logs`      | auto-inc  | Per-dose take/miss/snooze records           |

Settings (theme, notification toggle, active profile) are stored in `localStorage`.

### Reminder Engine (`reminder.js`)

The engine builds "dose slots" by merging schedule definitions with existing log records for a given date. Each slot has a real-time status:

- **pending** — scheduled time hasn't arrived yet
- **done** — user marked as taken
- **missed** — auto-marked after 30 minutes past scheduled time with no action
- **snoozed** — user postponed the reminder

A 1-minute tick loop runs `autoMarkMissed` to flag overdue doses and handles midnight rollover.

### Notification System (`notification.js` + `service-worker.js`)

Two notification paths work together:

1. **Foreground (tab open):** `setTimeout`-based scheduling via `NotifManager`. Fires a browser notification with action buttons. In-app snackbar also shown.
2. **Background (tab closed):** The service worker holds its own `setTimeout` timers and fires `showNotification` when no window is focused. Notification clicks relay actions back to the page via `postMessage`.

Snooze creates a new `setTimeout` 10 minutes out, with the same action callbacks attached so the snoozed notification can also mark doses as taken or snoozed again.

## Data Model

### Schedule

```json
{
  "id": 1,
  "profileId": 1,
  "medicineId": 1,
  "doseAmount": 1,
  "doseUnit": "tablet",
  "times": ["08:00", "20:00"],
  "frequency": "daily | specific_days | interval",
  "specificDays": [1, 3, 5],
  "intervalDays": 2,
  "startDate": "2026-01-01",
  "endDate": null,
  "notes": "After meals",
  "active": true
}
```

### Log Entry

```json
{
  "id": 1,
  "scheduleId": 1,
  "profileId": 1,
  "medicineId": 1,
  "date": "2026-01-15",
  "time": "08:00",
  "status": "done | missed | snoozed",
  "takenAt": 1736899200000,
  "snoozeUntil": null
}
```

## Tech Stack

- Vanilla JavaScript (no framework, no dependencies)
- IndexedDB for structured local storage
- Service Worker API for offline support
- Web Notifications API for reminders
- CSS custom properties for theming
- PWA Web Manifest for installability

## Browser Support

| Feature            | Chrome | Firefox | Safari | Edge |
|--------------------|--------|---------|--------|------|
| Core app           | ✅     | ✅      | ✅     | ✅   |
| Notifications      | ✅     | ✅      | ✅*    | ✅   |
| Service Worker    | ✅     | ✅      | ✅     | ✅   |
| Install (PWA)      | ✅     | ⚠️      | ✅**   | ✅   |
| Background notif   | ✅     | ❌      | ❌     | ✅   |

\* iOS Safari 16.4+ supports web notifications when installed to home screen.
\** iOS requires manual "Add to Home Screen" via Share sheet.

## License

This project is for personal use. No license restrictions applied.
