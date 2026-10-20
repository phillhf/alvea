import { useRef, useEffect, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const imgRef      = useRef<HTMLImageElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const readerRef   = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [scanned, setScanned] = useState<string | null>(null);
  const [ready, setReady]     = useState(false);
  const [useNative, setUseNative] = useState(false);
  const [decoding, setDecoding]   = useState(false);
  const [imageUrl, setImageUrl]   = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setUseNative(true);
      return;
    }

    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let active = true;

    async function start() {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCam = devices.find(d =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rück") ||
          d.label.toLowerCase().includes("environment")
        ) ?? devices[devices.length - 1];

        setReady(true);
        const controls = await reader.decodeFromVideoDevice(
          backCam?.deviceId ?? undefined,
          videoRef.current!,
          (result, err) => {
            if (!active) return;
            if (result) {
              const code = result.getText();
              setScanned(code);
              setTimeout(() => { if (active) { onScan(code); onClose(); } }, 400);
            }
            if (err && !(err instanceof NotFoundException)) {
              console.warn("Scan-Fehler:", err);
            }
          }
        );
        controlsRef.current = controls;
      } catch (e: any) {
        if (!active) return;
        if (e.name === "NotAllowedError" || e.name === "SecurityError" ||
            e.name === "NotSupportedError") {
          setUseNative(true);
        } else if (e.name === "NotFoundError") {
          setError("Keine Kamera gefunden.");
        } else {
          setUseNative(true);
        }
      }
    }

    start();
    return () => {
      active = false;
      controlsRef.current?.stop();
    };
  }, [onScan, onClose]);

  // Sobald native-Modus aktiv: File-Input öffnen
  useEffect(() => {
    if (useNative && fileRef.current) fileRef.current.click();
  }, [useNative]);

  async function handleNativeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { onClose(); return; }

    setDecoding(true);
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    // Kurz warten bis img geladen
    await new Promise(r => setTimeout(r, 100));

    try {
      const reader = new BrowserMultiFormatReader();
      const img = imgRef.current!;
      img.src = url;
      await new Promise(r => { img.onload = r; });
      const result = await reader.decodeFromImageElement(img);
      const code = result.getText();
      setScanned(code);
      setDecoding(false);
      setTimeout(() => { onScan(code); onClose(); }, 600);
    } catch {
      setDecoding(false);
      setError("Kein Barcode erkannt. Bitte erneut versuchen.");
    }
  }

  // Nativer Fallback-Modus
  if (useNative) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-6 px-8">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleNativeFile}
          // onCancel nicht in React-Types – Abbrechen per Button
        />
        {/* Unsichtbares img für ZXing-Dekodierung */}
        <img ref={imgRef} className="hidden" alt="" />

        {decoding && (
          <div className="text-center">
            <div className="text-white text-lg mb-2">⏳ Barcode wird erkannt…</div>
            {imageUrl && (
              <img src={imageUrl} className="max-w-full max-h-48 rounded-lg border-2 border-white/30" alt="Scan" />
            )}
          </div>
        )}

        {scanned && (
          <div className="bg-white rounded-lg px-8 py-6 text-center shadow-md">
            <div className="text-4xl mb-2">✅</div>
            <div className="font-bold text-slate-900">Barcode erkannt</div>
            <div className="font-mono text-lg text-slate-700 mt-1">{scanned}</div>
          </div>
        )}

        {error && !decoding && (
          <div className="text-center space-y-4">
            <div className="text-white/80">{error}</div>
            <div className="flex gap-3">
              <button
                onClick={() => { setError(null); setImageUrl(null); fileRef.current?.click(); }}
                className="px-4 py-2 bg-white text-slate-900 rounded-xl font-medium text-sm"
              >
                📷 Nochmals versuchen
              </button>
              <button onClick={onClose}
                className="px-4 py-2 bg-white/20 text-white rounded-xl font-medium text-sm">
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {!decoding && !scanned && !error && (
          <div className="text-center space-y-4">
            <div className="text-6xl">📷</div>
            <p className="text-white text-center text-sm">
              Kamera-App öffnet sich automatisch.<br/>
              Barcode fotografieren – wird automatisch dekodiert.
            </p>
            <button onClick={onClose}
              className="px-4 py-2 bg-white/20 text-white rounded-xl font-medium text-sm">
              Abbrechen
            </button>
          </div>
        )}
      </div>
    );
  }

  // Live-Scanner (localhost / HTTPS)
  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/60">
        <button onClick={onClose}
          className="text-white text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">
          ✕ Abbrechen
        </button>
        <span className="text-white text-sm font-medium">🔍 Barcode scannen</span>
        <div className="w-24" />
      </div>

      <div className="flex-1 relative overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted
          className="absolute inset-0 w-full h-full object-cover" />

        {ready && !scanned && !error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-40">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
              <div className="absolute inset-x-0 top-1/2 h-0.5 bg-red-500/80 animate-pulse" />
            </div>
          </div>
        )}

        {scanned && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="bg-white rounded-lg px-8 py-6 text-center shadow-md">
              <div className="text-4xl mb-2">✅</div>
              <div className="font-bold text-slate-900">Barcode erkannt</div>
              <div className="font-mono text-lg text-slate-700 mt-1">{scanned}</div>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="text-4xl">📷</div>
            <p className="text-white/80 text-sm">{error}</p>
          </div>
        )}

        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-white/60 text-sm">Kamera wird gestartet…</p>
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-black/60 text-center">
        {!error && !scanned && (
          <p className="text-white/60 text-xs">
            Barcode in den Rahmen halten – wird automatisch erkannt
          </p>
        )}
      </div>
    </div>
  );
}
