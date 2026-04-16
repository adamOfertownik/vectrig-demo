"use client";

import { useStore } from "@/lib/store";
import type { StairType } from "@/lib/types";

export default function StairPanel() {
  const project = useStore((s) => s.project);
  const selectedStairId = useStore((s) => s.selectedStairId);
  const selectStair = useStore((s) => s.selectStair);
  const updateStair = useStore((s) => s.updateStair);
  const removeStair = useStore((s) => s.removeStair);

  const stair = project.stairs.find((s) => s.id === selectedStairId);

  if (!stair) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-muted text-sm">
          Zaznacz schody, aby zobaczyć szczegóły
        </div>
      </div>
    );
  }

  const fromFloor = project.floors.find((f) => f.id === stair.fromFloorId);
  const toFloor = project.floors.find((f) => f.id === stair.toFloorId);
  const rise =
    (fromFloor?.height ?? 0) + (toFloor && toFloor.level > 0 ? toFloor.slabThickness : 0);
  const riser = stair.stepCount > 0 ? rise / stair.stepCount : 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 border-b border-border flex items-center gap-3">
        <input
          type="text"
          value={stair.label}
          onChange={(e) => updateStair(stair.id, { label: e.target.value })}
          className="text-sm font-semibold flex-1 min-w-0"
        />
        <button
          onClick={() => selectStair(null)}
          className="text-muted hover:text-foreground text-lg leading-none"
          title="Zamknij"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted mb-1">Typ</label>
            <select
              value={stair.type}
              onChange={(e) => updateStair(stair.id, { type: e.target.value as StairType })}
              className="w-full text-sm"
            >
              <option value="straight">Proste</option>
              <option value="L">L (90°)</option>
              <option value="U">U (180°)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Do piętra</label>
            <select
              value={stair.toFloorId}
              onChange={(e) => updateStair(stair.id, { toFloorId: e.target.value })}
              className="w-full text-sm"
            >
              {project.floors
                .filter((f) => f.id !== stair.fromFloorId)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Szerokość (mm)</label>
            <input
              type="number"
              value={stair.width}
              onChange={(e) =>
                updateStair(stair.id, { width: Math.max(600, Number(e.target.value)) })
              }
              className="w-full text-sm"
              step={10}
              min={600}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Głębokość stopnia (mm)</label>
            <input
              type="number"
              value={stair.treadDepth}
              onChange={(e) =>
                updateStair(stair.id, { treadDepth: Math.max(200, Number(e.target.value)) })
              }
              className="w-full text-sm"
              step={10}
              min={200}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Liczba stopni</label>
            <input
              type="number"
              value={stair.stepCount}
              onChange={(e) =>
                updateStair(stair.id, { stepCount: Math.max(1, Math.floor(Number(e.target.value))) })
              }
              className="w-full text-sm"
              step={1}
              min={1}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Kąt obrotu (°)</label>
            <input
              type="number"
              value={stair.rotation}
              onChange={(e) => updateStair(stair.id, { rotation: Number(e.target.value) })}
              className="w-full text-sm"
              step={5}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Origin X (mm)</label>
            <input
              type="number"
              value={Math.round(stair.origin.x)}
              onChange={(e) =>
                updateStair(stair.id, { origin: { ...stair.origin, x: Number(e.target.value) } })
              }
              className="w-full text-sm"
              step={50}
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Origin Y (mm)</label>
            <input
              type="number"
              value={Math.round(stair.origin.y)}
              onChange={(e) =>
                updateStair(stair.id, { origin: { ...stair.origin, y: Number(e.target.value) } })
              }
              className="w-full text-sm"
              step={50}
            />
          </div>
          {stair.type !== "straight" && (
            <>
              <div>
                <label className="block text-xs text-muted mb-1">Spocznik (mm)</label>
                <input
                  type="number"
                  value={stair.landingDepth ?? stair.width}
                  onChange={(e) =>
                    updateStair(stair.id, { landingDepth: Math.max(600, Number(e.target.value)) })
                  }
                  className="w-full text-sm"
                  step={10}
                />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Bieg B — stopnie</label>
                <input
                  type="number"
                  value={stair.flightBSteps ?? 0}
                  onChange={(e) =>
                    updateStair(stair.id, {
                      flightBSteps: Math.max(0, Math.floor(Number(e.target.value))),
                    })
                  }
                  className="w-full text-sm"
                  step={1}
                  min={0}
                />
              </div>
            </>
          )}
        </div>

        <div className="text-xs text-muted bg-surface border border-border rounded px-2 py-1 space-y-0.5">
          <div>
            Całkowite wyniesienie: <span className="font-semibold text-foreground">{rise} mm</span>
          </div>
          <div>
            Wys. stopnia ≈ <span className="font-semibold text-foreground">{Math.round(riser)} mm</span>{" "}
            {riser > 190 && <span className="text-danger">· za wysoki! (max 190)</span>}
          </div>
        </div>

        <button className="btn btn-sm btn-danger w-full" onClick={() => removeStair(stair.id)}>
          Usuń schody
        </button>
      </div>
    </div>
  );
}
