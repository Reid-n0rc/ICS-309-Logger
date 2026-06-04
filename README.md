# ICS-309 Communications Logger

A cross-platform desktop application for capturing radio communications data and
producing a [FEMA **ICS-309 Communications Log**](https://training.fema.gov/icsresource/icsforms.aspx).
Built with [Tauri 2](https://tauri.app/), React, and SQLite.

The app is **portable** — it does not require installation and can be run from
removable media such as a USB flash drive. Its database lives next to the
executable, so the entire log travels with the drive.

---

## Features

- **Event-based workflow** — create a new event or reopen an existing one on startup.
- **Fast keyboard-driven logging** — `Enter` advances between fields; the cursor
  follows the natural flow of a radio exchange.
- **Automatic message numbering** — message numbers auto-increment *per call sign*,
  separately for the FROM and TO directions. Manual entries are never overwritten.
- **Constant spell check** — the message field uses native browser spell check
  (red underline on misspellings, right-click for suggestions), just like a word
  processor or web form.
- **Resizable, scrollable log table** — drag the divider to resize; double-click any
  row to edit or delete it.
- **Export & print**
  - **PDF** — a formatted ICS-309 matching the official layout.
  - **FLdigi** — an `.flmsg`-style file for use with [FLdigi](http://www.w1hkj.com/).
  - **Print** — sends a formatted ICS-309 to the printer.
- **Open / close incidents** — closing an incident records the *To* (stop) date/time
  and returns to the startup screen. All dates/times can be edited manually.
- **Lightweight local storage** — a single SQLite database file (`ics309_data.db`).

---

## Screenshots

### Startup — create or open an event
On launch, choose to start a **New Event** or **Open Existing Event**. Recent events
are listed for one-click access; closed incidents are marked.

![Startup screen](docs/screenshots/01-startup.png)

### New event
Three fields — Incident Name, Radio Network Name, and Radio Operator. Press `Enter`
to advance; pressing `Enter` on the last field creates the event and records the
*From* (start) date/time automatically.

![New event form](docs/screenshots/02-new-event.png)

### Communications log
The main logging screen. The entry form sits at the top, with a running table of
previous entries below. The menu bar provides Export PDF, Export FLdigi, Print,
Edit Event, and Close Incident.

![Communications log](docs/screenshots/03-log-view.png)

### Edit an entry
Double-click any row to edit its time, call signs, message numbers, or message text —
or delete it entirely.

![Edit log entry](docs/screenshots/04-edit-entry.png)

---

## Logging workflow

The entry form is designed to match the cadence of a real radio exchange:

1. The cursor starts on **From Call Sign/ID**. (You may optionally click the **Time**
   field first and type a 24-hour time; otherwise it is filled automatically on submit.)
2. Type the **From Call Sign/ID** and press `Enter`. The **From Msg #** auto-populates
   with the next sequential number for that call sign, and the cursor moves to
   **To Call Sign/ID**. You can step back into the Msg # field to override it; a manual
   value is preserved.
3. Type the **To Call Sign/ID** and press `Enter`. The **To Msg #** increments for that
   call sign and the cursor moves to **Message**.
4. Type the **Message**. `Shift+Enter` inserts a new line; spell check underlines
   misspellings.
5. Press `Enter` to log the entry. If the Time field was left blank, the current time
   is recorded. The row appears in the table below and the form resets for the next entry.

---

## Form field mapping (ICS-309)

| ICS-309 box | App field |
|---|---|
| 1. Incident Name | Incident Name |
| 2. Operational Period (From/To) | Auto-recorded on event open/close; manually editable |
| 3. Radio Network Name | Radio Network Name |
| 4. Radio Operator (Name, Call Sign) | Radio Operator |
| 5. Communications Log | The entry table (Time, From CS/ID + Msg #, To CS/ID + Msg #, Message) |
| 6. Prepared By | Radio Operator |
| 7. Date & Time Prepared | Generated at export/print time |

---

## Tech stack

- **[Tauri 2](https://tauri.app/)** — native desktop shell (Rust)
- **React 18 + TypeScript** — UI
- **Tailwind CSS** — styling
- **SQLite** via [`rusqlite`](https://github.com/rusqlite/rusqlite) (bundled) — storage
- **[jsPDF](https://github.com/parallax/jsPDF)** + jspdf-autotable — PDF export

---

## Project structure

```
ICS-309-Logger/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── src/                          # Frontend (React + TypeScript)
│   ├── App.tsx                   # Root: switches between startup and log views
│   ├── types.ts                  # Shared TypeScript interfaces
│   ├── lib/
│   │   └── exportPdf.ts          # jsPDF ICS-309 layout
│   └── components/
│       ├── StartupView.tsx       # New / open event + recent list
│       ├── NewEventForm.tsx      # 3-field event creation
│       ├── EventList.tsx         # Browse existing events
│       ├── LogView.tsx           # Main logging screen, menu, print, FLdigi
│       ├── EntryForm.tsx         # Entry form + keyboard navigation
│       ├── LogTable.tsx          # Running table of entries
│       └── EditEntryModal.tsx    # Edit / delete an entry
└── src-tauri/                    # Backend (Rust)
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── capabilities/default.json
    └── src/
        ├── main.rs
        ├── lib.rs                # Tauri bootstrap + command registry
        ├── db.rs                 # SQLite init + portable data-dir resolution
        ├── models.rs             # Serde structs
        └── commands.rs           # All Tauri commands
```

---

## Data storage

All data is stored in a single SQLite file, **`ics309_data.db`**, written next to the
application executable (on macOS, alongside the `.app` bundle). This keeps the app
self-contained and portable — copy the executable and its database to a flash drive
and the full log goes with it.

Schema:

- **`events`** — one row per incident (names, operator, from/to date-time).
- **`log_entries`** — one row per communication, linked to an event.
- **`callsign_counters`** — tracks the last message number used per call sign and
  direction, enabling sequential auto-numbering.

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- Platform dependencies for Tauri — see the
  [Tauri prerequisites guide](https://tauri.app/start/prerequisites/).

### Install & run

```bash
npm install            # install frontend dependencies
npm run tauri dev      # launch the app in development mode
```

### Build a release binary

```bash
npm run tauri build
```

The bundled application is written to `src-tauri/target/release/` (and platform
bundles under `src-tauri/target/release/bundle/`).

### Type-check / compile checks

```bash
npx tsc --noEmit                       # TypeScript
cd src-tauri && cargo check            # Rust
```

### Regenerating screenshots

The screenshots in `docs/screenshots/` are produced by a headless harness that stubs
the Tauri API with sample data:

```bash
npm run build
npx vite preview --port 4173 &
node scripts/screenshot.mjs
```

---

## License

See repository for license details.
