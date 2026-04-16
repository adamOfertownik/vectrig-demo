"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { calculateQuote } from "@/lib/pricing";
import type { BomCategory } from "@/lib/types";

const CATEGORY_LABELS: Record<BomCategory, string> = {
  wall: "Ściany CLT",
  slab: "Stropy CLT",
  roof: "Dach CLT",
  component: "Okna / Drzwi",
  labor: "Robocizna",
  transport: "Transport",
};

const CATEGORY_ORDER: BomCategory[] = ["wall", "slab", "roof", "component", "labor", "transport"];

export default function QuoteSidebar() {
  const project = useStore((s) => s.project);
  const quote = useMemo(() => calculateQuote(project), [project]);

  const grouped = useMemo(() => {
    const map = new Map<BomCategory, typeof quote.lines>();
    for (const line of quote.lines) {
      const arr = map.get(line.category) ?? [];
      arr.push(line);
      map.set(line.category, arr);
    }
    return map;
  }, [quote]);

  return (
    <aside className="w-80 bg-panel border-l border-border overflow-y-auto scrollbar-thin flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="section-label mb-1">Kosztorys</div>
        <div className="text-xs text-muted">
          Kubatura CLT: <span className="font-mono font-medium text-foreground">{quote.totalVolumeCLT} m³</span>
        </div>
      </div>

      {/* BOM Lines grouped */}
      <div className="flex-1 p-4 space-y-4">
        {quote.lines.length === 0 ? (
          <div className="text-sm text-muted italic py-6 text-center">
            Dodaj ściany, żeby zobaczyć wycenę.
          </div>
        ) : (
          CATEGORY_ORDER.map((cat) => {
            const lines = grouped.get(cat);
            if (!lines || lines.length === 0) return null;
            return (
              <div key={cat}>
                <div className="section-label mb-2">{CATEGORY_LABELS[cat]}</div>
                <div className="space-y-1">
                  {lines.map((line, i) => (
                    <div key={i} className="flex items-start justify-between text-sm py-1">
                      <div className="flex-1 pr-2">
                        <div className="text-sm leading-tight">{line.description}</div>
                        <div className="text-xs text-muted font-mono">
                          {line.quantity} {line.unit} × {line.unitPrice.toLocaleString("pl-PL")} zł
                        </div>
                      </div>
                      <div className="font-mono text-sm font-medium whitespace-nowrap">
                        {line.total.toLocaleString("pl-PL")} zł
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Totals */}
      {quote.lines.length > 0 && (
        <div className="p-4 border-t border-border space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Netto:</span>
            <span className="font-mono font-medium">
              {quote.subtotal.toLocaleString("pl-PL")} zł
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">VAT 23%:</span>
            <span className="font-mono">
              {quote.vat.toLocaleString("pl-PL")} zł
            </span>
          </div>
          <div className="flex justify-between text-base font-semibold pt-2 border-t border-border">
            <span>Brutto:</span>
            <span className="text-accent font-mono">
              {quote.total.toLocaleString("pl-PL")} zł
            </span>
          </div>
        </div>
      )}

      {/* Export DXF */}
      <div className="p-4 border-t border-border space-y-2" data-tour="export">
        <ExportDxfButton />
      </div>

      {/* BRE info */}
      <div className="p-4 border-t border-border">
        <div className="text-[10px] text-muted leading-relaxed p-2 bg-surface rounded">
          <span className="font-medium">BRE v2 · m³</span> — Kubatura: Σ(Pow. netto × grubość).
          Otwory odejmują drewno. Robocizna 25%. Transport 800 zł/m³. Zero AI.
        </div>
      </div>
    </aside>
  );
}

function ExportDxfButton() {
  const project = useStore((s) => s.project);
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch("/api/generate-dxf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });

      if (!res.ok) throw new Error("DXF generation failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/[^a-z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/gi, "_")}.dxf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("DXF export error:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading || project.floors.every((f) => f.walls.length === 0)}
      className="btn btn-primary w-full flex items-center justify-center gap-2"
    >
      {loading ? (
        <span className="animate-pulse">Generowanie...</span>
      ) : (
        <>
          <span className="text-sm">⬇</span>
          Eksport DXF
        </>
      )}
    </button>
  );
}
