import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export interface SaveFilter {
  name: string;
  extensions: string[];
}

/**
 * Prompt the user with a native "Save As" dialog (choose name + location), then
 * write the given bytes to the chosen path via the Rust `write_file` command.
 * Returns the saved path, or null if the user cancelled.
 */
export async function saveBytesWithDialog(
  defaultName: string,
  filters: SaveFilter[],
  bytes: Uint8Array
): Promise<string | null> {
  const path = await save({ defaultPath: defaultName, filters });
  if (!path) return null; // user cancelled the dialog
  await invoke("write_file", { path, contents: Array.from(bytes) });
  return path;
}
