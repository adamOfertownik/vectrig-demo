"use client";

import { useStore, useActiveFloor } from "@/lib/store";
import { polygonAreaSqm } from "@/lib/geometry";

export default function SlabPanel() {
  const floor = useActiveFloor();
  const project = useStore((s) => s.project);
  const detachSlab = useStore((s) => s.detachSlab);
  const reattachSlab = useStore((s) => s.reattachSlab);
  const removeSlabCutout = useStore((s) => s.removeSlabCutout);
  const updateFloor = useStore((s) => s.updateFloor);
  const setSlabEdit = useStore((s) => s.setSlabEdit);

  if (!floor) {
    return <div className="p-4 text-sm text-muted">Brak kondygnacji</div>;
  }

  if (floor.level === 0) {
    return (
      <div className="p-6 text-sm text-muted">
        Parter nie posiada stropu (fundament poza zakresem konfiguratora).
      </div>
    );
  }

  const cutouts = floor.slabShape?.cutouts ?? [];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div className="text-sm font-semibold flex-1">Strop — {floor.name}</div>
        <button
          className="text-muted hover:text-foreground text-lg leading-none"
          onClick={() => setSlabEdit(false)}
          title="Zamknij"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        <div className="space-y-2">
          <div className="section-label">Kształt</div>
          <div className="text-xs text-muted">
            Tryb:{" "}
            <span className="font-semibold text-foreground">
              {floor.slabShape?.mode === "detached" ? "Odłączony (własny obrys)" : "Z obrysu ścian"}
            </span>
          </div>
          {floor.slabShape?.mode === "detached" ? (
            <button className="btn btn-sm w-full" onClick={() => reattachSlab(floor.id)}>
              Podłącz ponownie do obrysu
            </button>
          ) : (
            <button className="btn btn-sm w-full" onClick={() => detachSlab(floor.id)}>
              Odłącz strop od obrysu
            </button>
          )}
        </div>

        <div className="space-y-2">
          <div className="section-label">Grubość</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={floor.slabThickness}
              min={0}
              step={10}
              onChange={(e) =>
                updateFloor(floor.id, { slabThickness: Math.max(0, Number(e.target.value)) })
              }
              className="w-full text-sm"
            />
            <span className="text-xs text-muted">mm</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="section-label">Wycięcia ({cutouts.length})</div>
          {cutouts.length === 0 && (
            <div className="text-xs text-muted">
              Brak wycięć. Dodaj schody albo narysuj cutout na rzucie.
            </div>
          )}
          {cutouts.map((c) => {
            const area = polygonAreaSqm(c.vertices);
            const linked = c.linkedStairId
              ? project.stairs.find((s) => s.id === c.linkedStairId)
              : null;
            return (
              <div
                key={c.id}
                className="p-2 bg-surface border border-border rounded-lg text-xs space-y-1"
              >
                <div className="flex items-center gap-2">
                  <div className="font-semibold flex-1 truncate">{c.label}</div>
                  {!linked && (
                    <button
                      className="text-danger hover:text-red-500"
                      onClick={() => removeSlabCutout(floor.id, c.id)}
                      title="Usuń wycięcie"
                    >
                      ×
                    </button>
                  )}
                </div>
                <div className="text-muted">
                  {c.kind === "stairwell"
                    ? "klatka schodowa"
                    : c.kind === "patio"
                      ? "patio"
                      : "cutout"}
                  {" · "}
                  {area.toFixed(2)} m² · {c.vertices.length} wierzchołków
                  {linked && <> · linked: {linked.label}</>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
