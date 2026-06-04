// Probe: load the built app, drive Export PDF + Export Excel + Export FLdigi,
// and fail if any runtime error fires (e.g. "Buffer is not defined" / "process
// is not defined" once vite-plugin-node-polyfills is removed).
import puppeteer from "puppeteer";

const URL = process.env.PREVIEW_URL || "http://localhost:4173";

const EVENT = {
  id: 1, incident_name: "Probe", radio_network_name: "Net", radio_operator: "A, W7X",
  from_date: "2026-06-04", from_time: "0742", to_date: null, to_time: null,
  closed: false, created_at: "2026-06-04 07:42:00",
};
const ENTRIES = [
  { id: 1, event_id: 1, time_value: "0743", from_callsign: "W7X", from_msg_num: "1",
    to_callsign: "NET", to_msg_num: "1", message: "Radio check.", created_at: "" },
];

function stub() {
  const ev = window.__EV, ents = window.__ENTS;
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd) => {
      switch (cmd) {
        case "get_events": return Promise.resolve([ev]);
        case "get_event": return Promise.resolve(ev);
        case "update_event": return Promise.resolve({ ...ev, to_date: "2026-06-04", to_time: "0800" });
        case "get_log_entries": return Promise.resolve(ents);
        case "get_next_msg_num": return Promise.resolve(1);
        case "generate_fldigi_export": return Promise.resolve("FLMSG-DATA");
        case "get_db_path_str": return Promise.resolve("/tmp/x.db");
        case "write_file": return Promise.resolve(null);
        default: return Promise.resolve(null); // dialog save() etc. -> cancelled
      }
    },
    transformCallback: (cb) => cb,
  };
}

const errors = [];
const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined),
  headless: true, args: ["--no-sandbox"],
});
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  // Only care about JS exceptions surfaced via console (e.g. our "export failed:"
  // catch, or "Buffer/process is not defined"). Ignore network resource 404s.
  const t = m.text();
  if (m.type() === "error" && !t.includes("Failed to load resource")) {
    errors.push("console.error: " + t);
  }
});

await page.evaluateOnNewDocument((ev, ents) => { window.__EV = ev; window.__ENTS = ents; }, EVENT, ENTRIES);
await page.evaluateOnNewDocument(stub);

await page.goto(URL, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 500));
// Open the event
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Probe"))?.click();
});
// Wait until the log view has actually loaded the event before exporting.
await page.waitForFunction(
  () => document.body.innerText.includes("Op Period") &&
        [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Export PDF"),
  { timeout: 5000 }
);
await new Promise((r) => setTimeout(r, 400));

for (const label of ["Export PDF", "Export Excel", "Export FLdigi"]) {
  await page.evaluate((l) => {
    [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === l)?.click();
  }, label);
  await new Promise((r) => setTimeout(r, 900));
  console.log("clicked:", label);
}

await browser.close();
if (errors.length) {
  console.error("RUNTIME ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("OK: no runtime errors during PDF/Excel/FLdigi export");
