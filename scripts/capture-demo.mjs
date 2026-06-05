// Capture an animated demo of the app (startup -> new event -> keyboard-driven
// logging) as a sequence of PNG frames, with a stubbed Tauri backend so the real
// React UI runs in a headless browser. Assemble the frames into a GIF afterwards
// (see scripts that call ffmpeg). Frames -> /tmp/gifframes/f####.png
import puppeteer from "puppeteer";
import { mkdirSync, rmSync } from "node:fs";

const URL = process.env.PREVIEW_URL || "http://localhost:4173";
const OUT = "/tmp/gifframes";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

function stub() {
  let entries = [];
  let id = 100;
  window.__TAURI_INTERNALS__ = {
    invoke: (cmd, args) => {
      switch (cmd) {
        case "get_events": return Promise.resolve([]);
        case "get_event": return Promise.resolve(window.__EV);
        case "create_event": return Promise.resolve(window.__EV);
        case "update_event": return Promise.resolve(window.__EV);
        case "get_log_entries": return Promise.resolve(entries);
        case "get_next_msg_num": return Promise.resolve(1);
        case "create_log_entry": {
          const e = { id: id++, event_id: 1, created_at: "", ...args.input };
          entries = [...entries, e];
          return Promise.resolve(e);
        }
        default: return Promise.resolve(null);
      }
    },
    transformCallback: (cb) => cb,
  };
}

const EV = {
  id: 1, incident_name: "Cascade Ridge Wildfire", radio_network_name: "Command Net",
  radio_operator: "Jane Doe, W7XYZ", from_date: "2026-06-05", from_time: "0742",
  to_date: null, to_time: null, closed: false, created_at: "2026-06-05 07:42:00",
};

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined),
  headless: true, args: ["--no-sandbox", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1180, height: 740, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument((ev) => { window.__EV = ev; }, EV);
await page.evaluateOnNewDocument(stub);

let n = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await page.screenshot({ path: `${OUT}/f${String(n).padStart(4, "0")}.png` });
    n++;
  }
};
// Type a string char-by-char, capturing a frame each char (natural typing motion).
const typeAnim = async (text, every = 1) => {
  let c = 0;
  for (const ch of text) {
    await page.keyboard.type(ch);
    c++;
    if (c % every === 0) await frame(1);
    await sleep(8);
  }
};
const clickText = async (label) => {
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === l);
    b?.click();
  }, label);
};

// 1. Startup
await page.goto(URL, { waitUntil: "networkidle0" });
await sleep(500);
await frame(14); // hold ~1.2s

// 2. New Event form
await clickText("New Event");
await sleep(350);
await frame(8);

// 3. Fill the event (Enter advances between fields)
await typeAnim("Cascade Ridge Wildfire");
await frame(6);
await page.keyboard.press("Enter"); await sleep(120); await frame(3);
await typeAnim("Command Net");
await frame(4);
await page.keyboard.press("Enter"); await sleep(120); await frame(3);
await typeAnim("Jane Doe, W7XYZ");
await frame(6);
await page.keyboard.press("Enter"); // creates the event -> log view
await sleep(500);
await frame(12); // hold on the empty log view

// 4. Log transmissions (keyboard-driven; Msg# auto-fills)
const logEntry = async (from, to, msg) => {
  await typeAnim(from);
  await page.keyboard.press("Enter"); await sleep(140); await frame(3); // -> To (Msg# auto-fills)
  await typeAnim(to);
  await page.keyboard.press("Enter"); await sleep(140); await frame(3); // -> Message
  await typeAnim(msg, 2);
  await frame(4);
  await page.keyboard.press("Enter"); await sleep(180); await frame(8); // submit -> row appears
};

await logEntry("KD7ABC", "W7XYZ", "Unit 4 on scene at Division A. Loud and clear.");
await logEntry("W7XYZ", "KE7QRS", "Relaying to Logistics, stand by.");

// 5. Show off the new feature: flip to dark mode via the header toggle.
await frame(6);
await page.evaluate(() => {
  document.querySelector('button[aria-label="Switch to dark mode"]')?.click();
});
await sleep(150);
await frame(18); // hold on the freshly-darkened UI

// 6. Keep logging — now in dark mode.
await logEntry("KE7QRS", "W7XYZ", "Two engines en route to staging.");

await frame(22); // final hold (dark)
await browser.close();
console.log(`captured ${n} frames -> ${OUT}`);
