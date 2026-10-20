import { useState, useRef, useEffect } from "react";

interface BarcodeInputProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];          // Liste aller Barcodes
  onScanClick?: () => void;   // optionaler Kamera-Button
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function BarcodeInput({
  value,
  onChange,
  options,
  onScanClick,
  placeholder = "Barcode eingeben oder aus Liste wählen…",
  required,
  autoFocus,
  className = "",
}: BarcodeInputProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim().length === 0
    ? options.slice(0, 50)                          // alles (max 50) wenn leer
    : options.filter(o =>
        o.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 50);

  // Klick außerhalb schließt Dropdown
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className={`relative flex gap-2 ${className}`}>
      <div className="relative flex-1">
        <input
          className="input w-full font-mono pr-8"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
        />
        {/* Pfeil-Icon */}
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          onClick={() => setOpen(o => !o)}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
          </svg>
        </button>

        {/* Dropdown */}
        {open && filtered.length > 0 && (
          <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
            {filtered.map(c => (
              <li key={c}>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 font-mono text-sm hover:bg-slate-50 transition-colors"
                  onMouseDown={e => {
                    e.preventDefault(); // verhindert onBlur-close
                    onChange(c);
                    setOpen(false);
                  }}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && filtered.length === 0 && value.trim().length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-400">
            Kein Bett mit diesem Barcode gefunden
          </div>
        )}
      </div>

      {/* Kamera-Button */}
      {onScanClick && (
        <button
          type="button"
          onClick={onScanClick}
          className="btn-ghost !px-4 flex items-center gap-1.5 border border-slate-200 shrink-0"
          title="Barcode scannen"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
            <line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/>
            <line x1="13" y1="8" x2="13" y2="16"/><line x1="16" y1="8" x2="16" y2="16"/>
          </svg>
          Scannen
        </button>
      )}
    </div>
  );
}
