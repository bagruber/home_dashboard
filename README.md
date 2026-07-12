# home_dashboard

Wall-mounted home dashboard for a ~20" screen. Configurable grid of widgets:
trains from Moosburg a.d. Isar, weather, clock, shopping list with QR handoff,
calendar, DWD weather-warning banner. Dark mode (true black) by default,
German UI.

Widget contents scale with their grid cell (resize a widget in edit mode and
the type grows/shrinks with it); the expand icon in a widget's corner shows it
fullscreen. Widgets can be parked below the screen edge (dashed line in edit
mode) but never deleted.

**Mobile view:** open `http://<host>:5473/m` on a phone (same network) for a
thumb-friendly shopping list. The QR button in the shopping widget encodes
this URL.

## Quick start (Windows)

Double-click `start.cmd` at the repo root. It spawns two console windows
(backend + frontend) and prints the URLs. Open
**[http://localhost:5473](http://localhost:5473)**.

## Optional integrations

### Self-hosted db-rest (removes train widget rate limits)

The default backend talks to the public `v6.db.transport.rest` instance which is
generous but rate-limited. To remove the limit, run db-rest locally:

```bash
docker run -d --name db-rest -p 3000:3000 derhuerst/db-rest
```

Then set the env var before starting the backend:

```bat
set DASHBOARD_DB_REST_BASE_URL=http://localhost:3000
```

### DHL Sendungsverfolgung (live parcel status)

Without a key, parcels are stored and the widget deep-links to dhl.de. To enable
automatic status updates:

1. Sign up at [developer.dhl.com](https://developer.dhl.com).
2. Create an app and subscribe to the **Shipment Tracking - Unified** product.
3. Set the env var:

```bat
set DASHBOARD_DHL_API_KEY=your_key_here
```

### DWD weather warnings

The banner uses the public DWD warnapp feed (no key). Default warncell is
Landkreis Freising (`809178000`); override with:

```bat
set DASHBOARD_DWD_WARNCELL_ID=809178000
```

### Mercedes me Connect (car battery / range — planned)

Mercedes discontinued API access for private developers (BYOCAR, Aug 2023);
official keys now require a company account with VAT ID. Candidate routes for
the battery widget, to be decided in a later iteration:

1. [Smartcar](https://smartcar.com/brand/mercedes-benz) — aggregator with
   Mercedes support, OAuth against the Mercedes me account.
2. Community app-API implementations, e.g.
   [mbapi2020](https://github.com/ReneNulschDE/mbapi2020) (Home Assistant) or
   [evcc](https://github.com/evcc-io/evcc) as a sidecar.

Primary target: Android tablet in kiosk mode, running both the frontend (PWA)
and the backend (FastAPI via Termux) locally.

## Layout

```
home_dashboard/
├── backend/   FastAPI service: API proxies, local storage
└── frontend/  React + Vite PWA: dashboard UI
```

## Development

Two terminals. From the repo root:

```bash
# 1) Backend
cd backend
python -m venv .venv
.venv\Scripts\activate           # Windows
# source .venv/bin/activate      # macOS/Linux/Termux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8473
```

```bash
# 2) Frontend
cd frontend
npm install
npm run dev                       # http://localhost:5473
```

The Vite dev server proxies `/api/*` to the backend on port 8473.

### Backend tests

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

The train widget can be developed offline via fixtures:
`http://localhost:5473/?fixture=moosburg-real` (also: `typical`,
`freising-connections`, `delayed`, `disruption`, `empty`).

### Testing on other devices on your LAN

```bash
npm run dev -- --host
```

Then open `http://<your-machine-ip>:5473` from any device on the same network.

### Simulating the tablet screen

In Chrome: `Ctrl+Shift+M` to toggle the device toolbar, set a custom resolution
matching your target screen (e.g. 1920×1200 landscape).
