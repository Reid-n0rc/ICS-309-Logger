// Persisted app settings (localStorage). Currently: where to reach FLdigi's
// XML-RPC socket for transmitting an ICS-309.
export interface FldigiSettings {
  host: string;
  port: number;
}

const KEY = "ics309-fldigi";
const DEFAULTS: FldigiSettings = { host: "127.0.0.1", port: 7362 };

export function getFldigiSettings(): FldigiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw);
      const port = Number(v?.port);
      return {
        host: typeof v?.host === "string" && v.host.trim() ? v.host.trim() : DEFAULTS.host,
        port: Number.isFinite(port) && port > 0 ? port : DEFAULTS.port,
      };
    }
  } catch {
    /* fall through to defaults */
  }
  return { ...DEFAULTS };
}

export function setFldigiSettings(settings: FldigiSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}
