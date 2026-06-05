#!/usr/bin/env bash
# Android emulator smoke test: install the built APK, launch it, and assert the
# app actually runs on Android 13 (API 33) without crashing — the automated
# equivalent of sideloading and opening it on a real phone. Run inside the
# reactivecircus/android-emulator-runner `script:` step (the emulator is booted
# and `adb` is ready by the time this runs).
set -euo pipefail

PKG="com.ics309.logger"
APK="$(find apk -name '*.apk' | head -n1)"
[ -n "$APK" ] || { echo "::error::No APK found under apk/"; exit 1; }

echo "Installing $APK"
adb install -r -g "$APK"

echo "Launching $PKG"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null

# Wait for the process to come up, then give the WebView time to render.
for _ in $(seq 1 30); do
  adb shell pidof "$PKG" >/dev/null 2>&1 && break
  sleep 1
done
sleep 12

# 1. The app process is alive (didn't crash on startup).
pid="$(adb shell pidof "$PKG" || true)"
if [ -z "$pid" ]; then
  echo "::error::App process is not running after launch"
  adb logcat -d | tail -120
  exit 1
fi
echo "App is running (pid $pid)"

# 2. No fatal crash recorded in logcat.
if adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: Process: $PKG"; then
  echo "::error::App crashed (FATAL EXCEPTION in logcat)"
  exit 1
fi

# 3. The WebView host activity is in the activity stack (UI actually came up).
if ! adb shell dumpsys activity activities | grep -qF "$PKG/.MainActivity"; then
  echo "::error::MainActivity not present in the activity stack"
  adb shell dumpsys activity activities | grep -i "$PKG" || true
  exit 1
fi

# Capture a screenshot artifact so a human can eyeball the rendered UI.
adb exec-out screencap -p > emulator-screenshot.png || true

echo "Smoke test passed: APK installed, launched, and running on Android 13 (API 33)."
