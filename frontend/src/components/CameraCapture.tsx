import { useRef, useEffect, useState, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const [ready, setReady]             = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [useNative, setUseNative]     = useState(false);
  const [facingBack, setFacingBack]   = useState(true);
  const [hasMultipleCams, setHasMultipleCams] = useState(false);

  const startCamera = useCallback(async (back: boolean) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setError(null);

    // getUserMedia nur verfügbar auf localhost oder HTTPS
    if (!navigator.mediaDevices?.getUserMedia) {
      setUseNative(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: back ? "environment" : "user",
                 width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setReady(true);
      const devices = await navigator.mediaDevices.enumerateDevices();
      setHasMultipleCams(devices.filter(d => d.kind === "videoinput").length > 1);
    } catch (e: any) {
      // Automatischer Fallback auf nativen File-Input
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        setUseNative(true);
      } else if (e.name === "NotFoundError") {
        setError("Keine Kamera gefunden.");
      } else {
        setUseNative(true);
      }
    }
  }, []);

  useEffect(() => {
    startCamera(true);
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [startCamera]);

  // Nativer File-Input gewählt
  useEffect(() => {
    if (useNative && fileRef.current) {
      fileRef.current.click();
    }
  }, [useNative]);

  function capture() {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
      onCapture(file);
      onClose();
    }, "image/jpeg", 0.92);
  }

  function handleNativeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { onClose(); return; }
    onCapture(file);
    onClose();
  }

  // Nativer Fallback – unsichtbarer File-Input
  if (useNative) {
    return (
      <>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleNativeFile}
          // onCancel nicht in React-Types – Abbrechen per Button
        />
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/60">
        <button onClick={onClose} className="text-white text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">
          ✕ Abbrechen
        </button>
        <span className="text-white text-sm font-medium">📷 Foto aufnehmen</span>
        {hasMultipleCams ? (
          <button onClick={() => { const n = !facingBack; setFacingBack(n); startCamera(n); }}
            className="text-white text-sm font-medium px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20">
            🔄 Wechseln
          </button>
        ) : <div className="w-20" />}
      </div>

      <div className="flex-1 relative overflow-hidden bg-black">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="text-4xl">📷</div>
            <p className="text-white/80 text-sm">{error}</p>
          </div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted
            className="absolute inset-0 w-full h-full object-cover" />
        )}
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white/60 text-sm">Kamera wird gestartet…</div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 px-6 py-6 bg-black/60">
        {error ? (
          <p className="text-white/50 text-xs text-center">Kein Kamerazugriff möglich</p>
        ) : (
          <button onClick={capture} disabled={!ready}
            className="w-20 h-20 rounded-full bg-white border-4 border-white/30 disabled:opacity-40 hover:bg-slate-100 active:scale-95 transition-transform shadow-lg"
            aria-label="Foto aufnehmen" />
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
