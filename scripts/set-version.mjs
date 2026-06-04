// Set the app version in tauri.conf.json and package.json so the produced bundle
// file names carry the right version. Used by CI before building.
//   node scripts/set-version.mjs 0.2.0
//   node scripts/set-version.mjs v0.2.0   (a leading "v" is stripped)
import { readFileSync, writeFileSync } from "node:fs";

const raw = process.argv[2];
if (!raw) {
  console.error("usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}
const version = raw.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`invalid version: ${version} (expected MAJOR.MINOR.PATCH)`);
  process.exit(1);
}

for (const file of ["src-tauri/tauri.conf.json", "package.json"]) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`set ${file} version -> ${version}`);
}
