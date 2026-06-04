import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export interface SaveFilter {
  name: string;
  extensions: string[];
}

const isAndroid = (): boolean =>
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  flmsg: "text/plain",
  txt: "text/plain",
};

function mimeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Prompt the user with a native "Save As" dialog (choose name + location), then
 * write the given bytes to the chosen location. Returns the saved path/name, or
 * null if the user cancelled.
 *
 * On Android the dialog plugin's save() returns a SAF `content://` URI that the
 * Rust `write_file` (std::fs) cannot write to, producing an unopenable file, so we
 * route through the android-fs `save_file_dialog` command instead. Desktop uses the
 * dialog plugin + `write_file` as before.
 */
export async function saveBytesWithDialog(
  defaultName: string,
  filters: SaveFilter[],
  bytes: Uint8Array
): Promise<string | null> {
  if (isAndroid()) {
    return invoke<string | null>("save_file_dialog", {
      name: defaultName,
      mime: mimeForName(defaultName),
      contents: Array.from(bytes),
    });
  }

  const path = await save({ defaultPath: defaultName, filters });
  if (!path) return null; // user cancelled the dialog
  await invoke("write_file", { path, contents: Array.from(bytes) });
  return path;
}
