import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Event, LogEntry } from "../types";
import { exportSignedIcs309Pdf, SignOptions } from "../lib/exportPdf";

interface Props {
  event: Event;
  entries: LogEntry[];
  onClose: () => void;
}

type SigMode = "none" | "draw" | "type";

export default function SignatureModal({ event, entries, onClose }: Props) {
  const [mode, setMode] = useState<SigMode>("draw");
  const [typedName, setTypedName] = useState(event.radio_operator.split(",")[0] || "");
  const [useCert, setUseCert] = useState(false);
  const [certPath, setCertPath] = useState<string | null>(null);
  const [certPassword, setCertPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  // Initialize canvas background (white) when switching to draw mode.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
  }, [mode]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
  };
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.strokeStyle = "#0b1f4b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasDrawn.current = true;
  };
  const endDraw = () => {
    drawing.current = false;
  };

  const clearCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    hasDrawn.current = false;
  };

  const renderTypedToCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#0b1f4b";
    ctx.font = "italic 52px 'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName || "", 20, c.height / 2);
    hasDrawn.current = !!typedName;
  };

  const canvasToPng = async (): Promise<Uint8Array | undefined> => {
    if (mode === "none") return undefined;
    if (mode === "type") renderTypedToCanvas();
    if (!hasDrawn.current) return undefined;
    const c = canvasRef.current!;
    const blob: Blob | null = await new Promise((res) => c.toBlob(res, "image/png"));
    if (!blob) return undefined;
    return new Uint8Array(await blob.arrayBuffer());
  };

  const pickCert = async () => {
    const path = await open({
      multiple: false,
      filters: [{ name: "Certificate", extensions: ["p12", "pfx"] }],
    });
    if (typeof path === "string") setCertPath(path);
  };

  const handleSign = async () => {
    setError("");
    if (mode === "none" && !useCert) {
      setError("Choose a visible signature, a certificate, or both.");
      return;
    }
    if (useCert && !certPath) {
      setError("Select a certificate (.p12/.pfx) file.");
      return;
    }
    setBusy(true);
    try {
      const opts: SignOptions = {};
      const png = await canvasToPng();
      if (png) opts.signatureImagePng = png;

      if (useCert && certPath) {
        const bytes = await invoke<number[]>("read_file", { path: certPath });
        opts.certificate = { p12: new Uint8Array(bytes), passphrase: certPassword };
      }

      if (!opts.signatureImagePng && !opts.certificate) {
        setError("Nothing to sign — draw/type a signature or add a certificate.");
        setBusy(false);
        return;
      }

      const saved = await exportSignedIcs309Pdf(event, entries, opts);
      setBusy(false);
      if (saved) onClose();
    } catch (err) {
      console.error(err);
      setError(
        useCert
          ? "Signing failed. Check the certificate password and file. " + String(err)
          : "Export failed. " + String(err)
      );
      setBusy(false);
    }
  };

  const certName = certPath ? certPath.split(/[/\\]/).pop() : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Sign &amp; Export ICS-309 PDF</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Visible signature */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Visible signature
            </div>
            <div className="flex gap-2 mb-3">
              {(["draw", "type", "none"] as SigMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-sm rounded border transition-colors ${
                    mode === m
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {m === "draw" ? "Draw" : m === "type" ? "Type" : "None"}
                </button>
              ))}
            </div>

            {mode === "type" && (
              <input
                type="text"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your name"
                className="w-full mb-2 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
              />
            )}

            {mode !== "none" && (
              <div>
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={150}
                  onPointerDown={mode === "draw" ? startDraw : undefined}
                  onPointerMove={mode === "draw" ? moveDraw : undefined}
                  onPointerUp={mode === "draw" ? endDraw : undefined}
                  onPointerLeave={mode === "draw" ? endDraw : undefined}
                  className="w-full border border-gray-300 rounded bg-white touch-none"
                  style={{ height: 150, cursor: mode === "draw" ? "crosshair" : "default" }}
                />
                <div className="flex gap-2 mt-2">
                  {mode === "draw" && (
                    <button onClick={clearCanvas} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                      Clear
                    </button>
                  )}
                  {mode === "type" && (
                    <button onClick={renderTypedToCanvas} className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                      Preview
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Certificate */}
          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={useCert} onChange={(e) => setUseCert(e.target.checked)} />
              Add a certificate (.p12/.pfx) digital signature
            </label>
            {useCert && (
              <div className="mt-3 space-y-2 pl-6">
                <div className="flex items-center gap-3">
                  <button onClick={pickCert} className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50">
                    Choose certificate…
                  </button>
                  <span className="text-sm text-gray-500 truncate">{certName || "No file selected"}</span>
                </div>
                <input
                  type="password"
                  value={certPassword}
                  onChange={(e) => setCertPassword(e.target.value)}
                  placeholder="Certificate password"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-400">
                  Produces a cryptographic PKCS#7 signature embedded in the PDF.
                </p>
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={busy}
            className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Signing…" : "Sign & Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
