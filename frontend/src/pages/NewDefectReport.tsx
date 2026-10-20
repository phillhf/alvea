import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { alertDialog } from "../components/Dialog";

interface Station {
  id: string;
  name: string;
  area_name: string;
}

interface Barcode {
  code: string;
  description: string | null;
}

export default function NewDefectReport() {
  const nav = useNavigate();

  const [stations, setStations]       = useState<Station[]>([]);
  const [barcodes, setBarcodes]       = useState<Barcode[]>([]);
  const [suggestions, setSuggestions] = useState<Barcode[]>([]);
  const [showSug, setShowSug]         = useState(false);

  const [stationId, setStationId]     = useState("");
  const [barcode, setBarcode]         = useState("");
  const [location, setLocation]       = useState("");
  const [description, setDescription] = useState("");
  const [scanning, setScanning]       = useState(false);
  const [saving, setSaving]           = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<Station[]>("/defects/stations").then(r => {
      setStations(r.data);
      // Nur eine Station → vorauswählen
      if (r.data.length === 1) setStationId(r.data[0].id);
    });
    api.get<Barcode[]>("/barcodes").then(r => setBarcodes(r.data));
  }, []);

  function onBarcodeInput(val: string) {
    setBarcode(val);
    if (val.length >= 1) {
      const q = val.toLowerCase();
      setSuggestions(barcodes.filter(b => b.code.toLowerCase().includes(q)).slice(0, 8));
      setShowSug(true);
    } else {
      setShowSug(false);
    }
  }

  function selectBarcode(code: string) {
    setBarcode(code);
    setShowSug(false);
    barcodeRef.current?.blur();
  }

  async function submit() {
    if (!stationId || !description.trim()) return;
    setSaving(true);
    try {
      await api.post("/defects", {
        scanned_barcode: barcode.trim() || undefined,
        title:           description.trim(),
        station_id:      stationId,
        notes:           location.trim() ? `Standort: ${location.trim()}` : undefined,
        severity:        "medium",
      });
      nav("/");
    } catch (e: any) {
      alertDialog(e.response?.data?.error || "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  const valid = stationId && description.trim();

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <button onClick={() => nav("/")} className="text-sm text-slate-500 hover:underline">
          ← Stationsübersicht
        </button>
        <h1 className="font-display text-2xl font-bold mt-1">🔧 Defektes Bett melden</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Kurze Meldung – das Reparaturteam kümmert sich darum.
        </p>
      </div>

      {/* Station */}
      <div className="card space-y-1">
        <label className="label">Station *</label>
        <select
          className="input"
          value={stationId}
          onChange={e => setStationId(e.target.value)}
        >
          <option value="">— Station auswählen —</option>
          {stations.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.area_name})</option>
          ))}
        </select>
      </div>

      {/* Barcode */}
      <div className="card space-y-1">
        <label className="label">
          Bett-Nummer / Barcode{" "}
          <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={barcodeRef}
              className="input w-full"
              placeholder="Eingeben, auswählen oder scannen…"
              value={barcode}
              onChange={e => onBarcodeInput(e.target.value)}
              onFocus={() => barcode.length >= 1 && setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              autoComplete="off"
            />
            {showSug && suggestions.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                {suggestions.map(b => (
                  <button
                    key={b.code}
                    type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0"
                    onMouseDown={() => selectBarcode(b.code)}
                  >
                    <span className="font-mono text-sm font-medium">{b.code}</span>
                    {b.description && (
                      <span className="text-xs text-slate-400 ml-2">{b.description}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn-ghost !px-3"
            title="Barcode scannen"
            onClick={() => setScanning(true)}
          >
            📷
          </button>
        </div>
      </div>

      {/* Standort */}
      <div className="card space-y-1">
        <label className="label">Wo steht das Bett? <span className="text-slate-400 font-normal">(optional)</span></label>
        <input
          className="input"
          placeholder="z. B. Zimmer 12, Flur vor Stationszimmer, Lager"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
      </div>

      {/* Beschreibung */}
      <div className="card space-y-1">
        <label className="label">Was ist defekt? *</label>
        <input
          className="input"
          placeholder="z. B. Seitengitter lässt sich nicht hochklappen, Bremse defekt"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={saving || !valid}
          className="btn-primary flex-1"
        >
          {saving ? "Wird gesendet…" : "Defekt melden"}
        </button>
        <button onClick={() => nav("/")} className="btn-ghost flex-1">
          Abbrechen
        </button>
      </div>

      {scanning && (
        <BarcodeScanner
          onScan={(code) => { setBarcode(code); setScanning(false); }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}
