"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useStore, useActiveFloor } from "@/lib/store";
import {
  analyzeForImport,
  candidatesToWalls,
  guessScale,
  getLayerSummary,
  type ImportCandidate,
  type ImportEntityType,
} from "@/lib/dxf-importer";
import type { UnderlayData } from "@/lib/dxf-parser-wrapper";

const TYPE_LABELS: Record<ImportEntityType, string> = {
  ext_wall: "Ściana zewn.",
  int_wall: "Ściana wewn.",
  window: "Okno",
  door: "Drzwi",
  slab: "Strop",
  roof: "Dach",
  ignore: "Ignoruj",
};

const TYPE_COLORS: Record<ImportEntityType, string> = {
  ext_wall: "#2d6b4f",
  int_wall: "#8b92a0",
  window: "#3b82f6",
  door: "#f59e0b",
  slab: "#6b5b45",
  roof: "#9333ea",
  ignore: "#999",
};

export default function DxfImportDialog() {
  const showDxfImport = useStore((s) => s.showDxfImport);
  const setShowDxfImport = useStore((s) => s.setShowDxfImport);
  const importDxfWalls = useStore((s) => s.importDxfWalls);
  const project = useStore((s) => s.project);
  const floor = useActiveFloor();

  const [underlayData, setUnderlayData] = useState<UnderlayData | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [layerOverrides, setLayerOverrides] = useState<Map<string, ImportEntityType>>(new Map());
  const [entityOverrides, setEntityOverrides] = useState<Map<number, ImportEntityType>>(new Map());
  const [scaleFactor, setScaleFactor] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const effectiveCandidates = useMemo(() => {
    return candidates.map((c, idx) => {
      const entityType = entityOverrides.get(idx);
      const layerType = layerOverrides.get(c.layer);
      let suggestedType = c.suggestedType;
      if (entityType !== undefined) suggestedType = entityType;
      else if (layerType !== undefined) suggestedType = layerType;
      const overridden = entityType !== undefined || layerType !== undefined;
      return { ...c, suggestedType, confidence: overridden ? 1 : c.confidence };
    });
  }, [candidates, layerOverrides, entityOverrides]);

  const layerSummary = useMemo(
    () => getLayerSummary(candidates),
    [candidates]
  );

  const handleFileSelect = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch("/api/parse-dxf", {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) throw new Error(`Parse error: ${resp.statusText}`);

      const data: UnderlayData = await resp.json();
      setUnderlayData(data);

      const guessed = guessScale(data);
      setScaleFactor(guessed);

      const analyzed = analyzeForImport(data, guessed);
      setCandidates(analyzed);
      setLayerOverrides(new Map());
      setEntityOverrides(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Błąd parsowania DXF");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.name.toLowerCase().endsWith(".dxf")) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleLayerTypeChange = useCallback(
    (layer: string, type: ImportEntityType) => {
      setLayerOverrides((prev) => {
        const next = new Map(prev);
        next.set(layer, type);
        return next;
      });
    },
    []
  );

  const handleEntityTypeChange = useCallback(
    (entityIndex: number, type: ImportEntityType) => {
      setEntityOverrides((prev) => {
        const next = new Map(prev);
        next.set(entityIndex, type);
        return next;
      });
    },
    []
  );

  const handleScaleChange = useCallback(
    (newScale: number) => {
      setScaleFactor(newScale);
      if (underlayData) {
        const analyzed = analyzeForImport(underlayData, newScale);
        setCandidates(analyzed);
      }
    },
    [underlayData]
  );

  const handleImport = useCallback(() => {
    if (!floor) return;

    const walls = candidatesToWalls(
      effectiveCandidates,
      floor.height,
      project.defaults.extWallType,
      project.defaults.intWallType,
    );

    if (walls.length === 0) {
      setError("Brak elementów do zaimportowania. Zmień klasyfikację warstw.");
      return;
    }

    importDxfWalls(floor.id, walls as Parameters<typeof importDxfWalls>[1]);
    setShowDxfImport(false);
    setUnderlayData(null);
    setCandidates([]);
    setLayerOverrides(new Map());
    setEntityOverrides(new Map());
  }, [floor, effectiveCandidates, project.defaults, importDxfWalls, setShowDxfImport]);

  // Preview canvas rendering
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || effectiveCandidates.length === 0 || !underlayData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#1a1d23";
    ctx.fillRect(0, 0, cw, ch);

    const b = underlayData.bounds;
    const bw = (b.maxX - b.minX) * scaleFactor || 1;
    const bh = (b.maxY - b.minY) * scaleFactor || 1;
    const pad = 20;
    const scale = Math.min((cw - pad * 2) / bw, (ch - pad * 2) / bh);
    const ox = pad + ((cw - pad * 2) - bw * scale) / 2 - b.minX * scaleFactor * scale;
    const oy = pad + ((ch - pad * 2) - bh * scale) / 2 - b.minY * scaleFactor * scale;

    for (const c of effectiveCandidates) {
      const color = TYPE_COLORS[c.suggestedType];
      ctx.strokeStyle = color;
      ctx.lineWidth = c.suggestedType === "ignore" ? 0.5 : 1.5;
      ctx.globalAlpha = c.suggestedType === "ignore" ? 0.3 : 0.8;

      const pts = c.points;
      if (pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x * scale + ox, pts[0].y * scale + oy);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * scale + ox, pts[i].y * scale + oy);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }, [effectiveCandidates, underlayData, scaleFactor]);

  if (!showDxfImport) return null;

  const wallCount = effectiveCandidates.filter(
    (c) => c.suggestedType === "ext_wall" || c.suggestedType === "int_wall"
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-panel border border-border rounded-xl shadow-2xl w-[900px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Import DXF</h2>
          <button
            onClick={() => setShowDxfImport(false)}
            className="text-muted hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Upload zone */}
          {!underlayData && (
            <div
              className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-accent transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".dxf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              {loading ? (
                <div className="text-muted">Parsowanie DXF...</div>
              ) : (
                <>
                  <div className="text-3xl mb-3 opacity-40">↓</div>
                  <div className="text-sm text-muted">
                    Przeciągnij plik .dxf lub kliknij aby wybrać
                  </div>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Results */}
          {underlayData && (
            <>
              {/* File info + scale */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-sm font-medium">{fileName}</div>
                  <div className="text-xs text-muted">
                    {underlayData.entities.length} elementów · {underlayData.layers.length} warstw
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted">Skala:</label>
                  <select
                    value={scaleFactor}
                    onChange={(e) => handleScaleChange(Number(e.target.value))}
                    className="text-sm"
                  >
                    <option value={0.1}>÷10 (dm→mm)</option>
                    <option value={1}>×1 (mm)</option>
                    <option value={10}>×10 (cm→mm)</option>
                    <option value={100}>×100</option>
                    <option value={1000}>×1000 (m→mm)</option>
                  </select>
                </div>

                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setUnderlayData(null);
                    setCandidates([]);
                    setLayerOverrides(new Map());
                    setEntityOverrides(new Map());
                    setFileName("");
                  }}
                >
                  Zmień plik
                </button>
              </div>

              {/* Preview */}
              <div className="border border-border rounded-lg overflow-hidden" style={{ height: 250 }}>
                <canvas ref={previewCanvasRef} className="w-full h-full" />
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs">
                {(Object.entries(TYPE_COLORS) as [ImportEntityType, string][])
                  .filter(([type]) => type !== "ignore")
                  .map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className="w-3 h-0.5 rounded" style={{ background: color }} />
                      <span className="text-muted">{TYPE_LABELS[type]}</span>
                    </div>
                  ))}
              </div>

              {/* Layer mapping */}
              <div className="space-y-2">
                <div className="section-label">Mapowanie warstw</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {Array.from(layerSummary.entries()).map(([layer, info]) => (
                    <div
                      key={layer}
                      className="flex items-center gap-3 p-2 bg-surface rounded-lg text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{layer}</div>
                        <div className="text-muted">{info.count} elementów</div>
                      </div>
                      <select
                        value={layerOverrides.get(layer) ?? info.suggestedType}
                        onChange={(e) =>
                          handleLayerTypeChange(layer, e.target.value as ImportEntityType)
                        }
                        className="text-xs"
                      >
                        {Object.entries(TYPE_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Entity-level overrides */}
              <div className="space-y-2">
                <div className="section-label">Elementy (nadpisanie klasyfikacji)</div>
                <div className="space-y-1 max-h-56 overflow-y-auto border border-border rounded-lg">
                  {candidates.map((c, idx) => {
                    const layerOnlyType = layerOverrides.get(c.layer) ?? c.suggestedType;
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 border-b border-border last:border-b-0 text-xs"
                      >
                        <span className="text-muted font-mono w-7 shrink-0">#{idx + 1}</span>
                        <span className="truncate flex-1 min-w-0 text-muted" title={c.layer}>
                          {c.layer} · {c.entity.type}
                        </span>
                        <select
                          value={entityOverrides.has(idx) ? entityOverrides.get(idx)! : "inherit"}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "inherit") {
                              setEntityOverrides((prev) => {
                                const next = new Map(prev);
                                next.delete(idx);
                                return next;
                              });
                            } else {
                              handleEntityTypeChange(idx, v as ImportEntityType);
                            }
                          }}
                          className="text-xs max-w-[140px] shrink-0"
                        >
                          <option value="inherit">
                            Z warstwy ({TYPE_LABELS[layerOnlyType]})
                          </option>
                          {Object.entries(TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {underlayData && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <div className="text-xs text-muted">
              {wallCount} ścian do importu · Piętro: {floor?.name ?? "—"}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-sm" onClick={() => setShowDxfImport(false)}>
                Anuluj
              </button>
              <button
                className="btn btn-sm btn-primary"
                onClick={handleImport}
                disabled={wallCount === 0}
              >
                Importuj ({wallCount} ścian)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
