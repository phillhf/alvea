import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { RowActions, EditModal } from "./shared";

function InstructionsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setItems((await api.get("/instructions")).data);
  }
  useEffect(() => { refresh(); }, []);

  function startEdit(item: any) {
    setEditId(item.id);
    setEditTitle(item.title ?? "");
    setEditText(item.content ?? "");
  }
  async function save() {
    if (!editId) return;
    setSaving(true);
    try {
      await api.put(`/instructions/${editId}`, { title: editTitle, content: editText });
      setEditId(null);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  const CATEGORY_LABEL: Record<string, string> = {
    bed_cleaning:         "Bettenaufbereitung-Dezentral",
    bed_cleaning_zentral: "Bettenaufbereitung-Zentral",
    room_cleaning:        "Zimmerreinigung",
  };

  // Gruppen
  const grouped = items.reduce<Record<string, any[]>>((acc, item) => {
    const k = item.category ?? "sonstig";
    (acc[k] = acc[k] ?? []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {items.length === 0 && (
        <p className="text-sm text-slate-400">Keine Anleitungen vorhanden.</p>
      )}
      {Object.entries(grouped).map(([cat, catItems]) => (
        <div key={cat}>
          <h3 className="font-display font-bold text-base mb-3 pb-1 border-b border-slate-200">
            {CATEGORY_LABEL[cat] ?? cat}
          </h3>
          <div className="space-y-4">
            {catItems.map((item) => (
              <div key={item.id} className="card space-y-2">
                <div className="flex justify-between items-center">
                  {editId !== item.id ? (
                    <h4 className="font-semibold">{item.title}</h4>
                  ) : (
                    <input
                      className="input flex-1 mr-2"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titel"
                    />
                  )}
                  {editId !== item.id && (
                    <button
                      className="btn-ghost !py-1 !px-2 text-xs"
                      onClick={() => startEdit(item)}
                    >
                      ✎ Bearbeiten
                    </button>
                  )}
                </div>
                {editId === item.id ? (
                  <>
                    <textarea
                      className="input w-full"
                      rows={8}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={save} disabled={saving}>
                        {saving ? "Speichern…" : "Speichern"}
                      </button>
                      <button className="btn-ghost" onClick={() => setEditId(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                    {item.content || (
                      <span className="italic text-slate-400">Kein Text hinterlegt.</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================ */
/* EINSTELLUNGEN (Prio-Score)                                   */
/* ============================================================ */

export default InstructionsTab;
