"use client";

import { useStore } from "@/lib/store";

interface ShortcutEntry {
  key: string;
  description: string;
}

interface ShortcutGroup {
  label: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Nawigacja",
    shortcuts: [
      { key: "F", description: "Przełącz 2D / 3D" },
      { key: "Tab", description: "Następne piętro" },
      { key: "Shift+Tab", description: "Poprzednie piętro" },
      { key: "?", description: "Pokaż / ukryj skróty" },
    ],
  },
  {
    label: "Rysowanie",
    shortcuts: [
      { key: "V", description: "Tryb zaznaczania" },
      { key: "D", description: "Tryb rysowania ścian" },
      { key: "Shift", description: "Blokada kąta 45°" },
      { key: "C", description: "Zamknij obrys" },
      { key: "Esc", description: "Anuluj rysowanie / cofnij drag" },
    ],
  },
  {
    label: "Edycja",
    shortcuts: [
      { key: "⌥/⌘/Ctrl+klik", description: "Podziel ścianę w miejscu kursora (na Macu: Option lub Command)" },
      { key: "Delete", description: "Usuń wybraną ścianę" },
      { key: "Ctrl+Z", description: "Cofnij" },
      { key: "Ctrl+Shift+Z", description: "Ponów" },
    ],
  },
  {
    label: "Kształty",
    shortcuts: [
      { key: "1", description: "Prostokąt" },
      { key: "2", description: "L-kształt" },
      { key: "3", description: "L + antresola" },
    ],
  },
  {
    label: "Import / Export",
    shortcuts: [
      { key: "I", description: "Import DXF" },
    ],
  },
];

export default function ShortcutsLegend() {
  const showShortcuts = useStore((s) => s.showShortcuts);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);

  if (!showShortcuts) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">Skróty klawiszowe</h3>
          <button
            onClick={() => setShowShortcuts(false)}
            className="text-muted hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
                {group.label}
              </div>
              {group.shortcuts.map((sc) => (
                <div
                  key={sc.key}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-xs text-foreground">{sc.description}</span>
                  <kbd className="inline-flex items-center px-2 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-muted">
                    {sc.key}
                  </kbd>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-border text-center">
          <span className="text-[10px] text-muted">
            Naciśnij <kbd className="px-1 py-0.5 rounded bg-surface border border-border text-[10px] font-mono">?</kbd> aby zamknąć
          </span>
        </div>
      </div>
    </div>
  );
}
