// Screenshot harness: serves the built frontend and captures each screen
// with a stubbed Tauri API so the React UI renders with sample data.
import puppeteer from "puppeteer";

const URL = process.env.PREVIEW_URL || "http://localhost:4173";
const OUT = "docs/screenshots";

// Sample data the stubbed `invoke` returns.
const SAMPLE_EVENT = {
  id: 1,
  incident_name: "Cascade Ridge Wildfire",
  radio_network_name: "Command Net",
  radio_operator: "Jane Doe, W7XYZ",
  from_date: "2026-06-03",
  from_time: "0742",
  to_date: null,
  to_time: null,
  created_at: "2026-06-03 07:42:00",
};

const SAMPLE_EVENTS = [
  SAMPLE_EVENT,
  {
    id: 2,
    incident_name: "County Comms Exercise",
    radio_network_name: "Tactical Net 2",
    radio_operator: "Bob Smith, K6ABC",
    from_date: "2026-05-28",
    from_time: "1300",
    to_date: "2026-05-28",
    to_time: "1645",
    created_at: "2026-05-28 13:00:00",
  },
];

const SAMPLE_ENTRIES = [
  { id: 1, event_id: 1, time_value: "0743", from_callsign: "W7XYZ", from_msg_num: "1", to_callsign: "NET", to_msg_num: "1", message: "Net control established. Radio check, all stations report.", created_at: "" },
  { id: 2, event_id: 1, time_value: "0745", from_callsign: "KD7ABC", from_msg_num: "1", to_callsign: "W7XYZ", to_msg_num: "2", message: "Unit 4 on scene at Division A. Loud and clear.", created_at: "" },
  { id: 3, event_id: 1, time_value: "0751", from_callsign: "W7XYZ", from_msg_num: "2", to_callsign: "KD7ABC", to_msg_num: "2", message: "Copy. Advise resource status when able.", created_at: "" },
  { id: 4, event_id: 1, time_value: "0758", from_callsign: "KE7QRS", from_msg_num: "1", to_callsign: "W7XYZ", to_msg_num: "3", message: "Requesting two additional engines to staging. Access road via Forest Rd 22.", created_at: "" },
  { id: 5, event_id: 1, time_value: "0803", from_callsign: "W7XYZ", from_msg_num: "3", to_callsign: "KE7QRS", to_msg_num: "3", message: "Acknowledged. Relaying to Logistics. Stand by.", created_at: "" },
  { id: 6, event_id: 1, time_value: "0811", from_callsign: "KD7ABC", from_msg_num: "3", to_callsign: "W7XYZ", to_msg_num: "4", message: "Containment line holding on the north flank. No injuries to report.", created_at: "" },
];

function makeStub() {
  // This function is stringified and injected into the page.
  const event = window.__SAMPLE_EVENT;
  const events = window.__SAMPLE_EVENTS;
  const entries = window.__SAMPLE_ENTRIES;
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd, args) => {
      switch (cmd) {
        case "get_events":
          return Promise.resolve(events);
        case "get_event":
          return Promise.resolve(event);
        case "create_event":
          return Promise.resolve(event);
        case "update_event":
        case "close_event":
          return Promise.resolve(event);
        case "get_log_entries":
          return Promise.resolve(entries);
        case "get_next_msg_num":
          return Promise.resolve(1);
        case "create_log_entry":
          return Promise.resolve({ id: 99, event_id: 1, ...args.input });
        case "update_log_entry":
          return Promise.resolve({ id: args.id, event_id: 1, ...args.input });
        case "delete_log_entry":
          return Promise.resolve(true);
        case "generate_fldigi_export":
          return Promise.resolve("");
        case "get_db_path_str":
          return Promise.resolve("/media/usb/ics309_data.db");
        default:
          return Promise.resolve(null);
      }
    },
    transformCallback: (cb) => cb,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resolve a Chrome/Chromium binary:
//   • PUPPETEER_EXECUTABLE_PATH wins if set (used in CI).
//   • On macOS fall back to the system Google Chrome.
//   • Otherwise let Puppeteer use its own bundled browser.
const execPath =
  process.env.PUPPETEER_EXECUTABLE_PATH ||
  (process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : undefined);

const browser = await puppeteer.launch({
  ...(execPath ? { executablePath: execPath } : {}),
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 880, deviceScaleFactor: 2 });

await page.evaluateOnNewDocument(
  (ev, evs, ents) => {
    window.__SAMPLE_EVENT = ev;
    window.__SAMPLE_EVENTS = evs;
    window.__SAMPLE_ENTRIES = ents;
  },
  SAMPLE_EVENT,
  SAMPLE_EVENTS,
  SAMPLE_ENTRIES
);
await page.evaluateOnNewDocument(makeStub);

// 1. Startup screen
await page.goto(URL, { waitUntil: "networkidle0" });
await sleep(600);
await page.screenshot({ path: `${OUT}/01-startup.png` });
console.log("captured 01-startup");

// 2. New Event form
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "New Event");
  btn?.click();
});
await sleep(400);
await page.screenshot({ path: `${OUT}/02-new-event.png` });
console.log("captured 02-new-event");

// 3. Log view — reload, then click the first recent event
await page.goto(URL, { waitUntil: "networkidle0" });
await sleep(500);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    b.textContent.includes("Cascade Ridge Wildfire")
  );
  btn?.click();
});
await sleep(700);
await page.screenshot({ path: `${OUT}/03-log-view.png` });
console.log("captured 03-log-view");

// 4. Edit entry modal — double-click first data row
await page.evaluate(() => {
  const row = document.querySelector("tbody tr");
  if (row) {
    const evt = new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window });
    row.dispatchEvent(evt);
  }
});
await sleep(500);
await page.screenshot({ path: `${OUT}/04-edit-entry.png` });
console.log("captured 04-edit-entry");

await browser.close();
console.log("done");
