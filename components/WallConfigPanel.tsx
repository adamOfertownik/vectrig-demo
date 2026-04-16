"use client";

import { useState } from "react";
import { useStore, useActiveFloor } from "@/lib/store";
import {
  KIND_LABELS,
  KIND_ICONS,
  findComponent,
  getCncDefaults,
  getWallEntry,
  getWallsByCategory,
  listAllComponents,
} from "@/lib/catalog";
import type { CatalogComponent } from "@/lib/types";
import { wallLength, wallAngleDeg, computeBoundsFromWalls } from "@/lib/geometry";
import { resolveOpeningMm } from "@/lib/openings";
import { wallOpeningsPerimeterM } from "@/lib/pricing";
import type { ComponentKind, WallType, Opening, Floor, Wall, Project } from "@/lib/types";

const KINDS_ORDER: ComponentKind[] = [
  "window_fixed",
  "window_hs",
  "window_tilt",
  "window_double",
  "glazing_fill",
  "door",
  "door_hs",
];

function groupComponents(): Record<ComponentKind, CatalogComponent[]> {
  const all = listAllComponents();
  return KINDS_ORDER.reduce((acc, kind) => {
    acc[kind] = all.filter((c) => c.kind === kind);
    return acc;
  }, {} as Record<ComponentKind, CatalogComponent[]>);
}

export default function WallConfigPanel() {
  const floor = useActiveFloor();
  const project = useStore((s) => s.project);
  const selectedWallId = useStore((s) => s.selectedWallId);
  // Re-render gdy cennik w edytorze się zmieni.
  useStore((s) => s.catalogOverrides);
  const selectWall = useStore((s) => s.selectWall);
  const updateWall = useStore((s) => s.updateWall);
  const removeWall = useStore((s) => s.removeWall);
  const addOpening = useStore((s) => s.addOpening);
  const removeOpening = useStore((s) => s.removeOpening);
  const updateOpening = useStore((s) => s.updateOpening);
  const pushUndo = useStore((s) => s.pushUndo);

  const [expandedKind, setExpandedKind] = useState<ComponentKind | null>(null);

  if (!floor) {
    return (
      <div className="p-4 text-sm text-muted">Brak kondygnacji</div>
    );
  }

  const wall = floor.walls.find((w) => w.id === selectedWallId);

  if (!wall) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-muted">
          <div className="text-3xl mb-3 opacity-40">←</div>
          <div className="text-sm">Kliknij na ścianę na rysunku,<br />aby ją skonfigurować</div>
        </div>
      </div>
    );
  }

  const isExt = wall.category === "external";
  const wallCatOptions = isExt ? getWallsByCategory("wall_ext") : getWallsByCategory("wall_int");

  const currentLength = Math.round(wallLength(wall));
  const currentAngle = Math.round(wallAngleDeg(wall));

  function handleLengthChange(newLengthMM: number) {
    if (!wall || !floor) return;
    pushUndo();
    const curLen = wallLength(wall);
    if (curLen < 1) return;
    const scale = newLengthMM / curLen;
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    updateWall(floor.id, wall.id, {
      end: {
        x: wall.start.x + dx * scale,
        y: wall.start.y + dy * scale,
      },
    });
  }

  function handleAngleChange(newAngleDeg: number) {
    if (!wall || !floor) return;
    pushUndo();
    const len = wallLength(wall);
    const rad = (newAngleDeg * Math.PI) / 180;
    updateWall(floor.id, wall.id, {
      end: {
        x: wall.start.x + Math.cos(rad) * len,
        y: wall.start.y + Math.sin(rad) * len,
      },
    });
  }

  function handleAddComponent(componentId: string) {
    if (!wall || !floor) return;
    const comp = findComponent(componentId);
    if (!comp) return;

    const margin = 100;
    const wLen = wallLength(wall);
    const ow = Math.min(comp.width, wLen);
    if (ow < 50) return;

    const isTop = floor.id === project.floors[project.floors.length - 1]?.id;
    const b = computeBoundsFromWalls(
      project.floors[0]?.walls.filter((w) => w.category === "external") ?? []
    );
    const useRoof = isTop && wall.category === "external" && project.roof;

    const ranges = wall.openings
      .map((op) => {
        const r = resolveOpeningMm(
          wall,
          op,
          useRoof ? project.roof! : null,
          useRoof ? b : null
        );
        return { start: r.position, end: r.position + r.width };
      })
      .sort((a, b) => a.start - b.start);

    let pos = margin;
    for (const r of ranges) {
      if (pos + ow + margin <= r.start) break;
      pos = Math.max(pos, r.end + margin);
    }
    pos = Math.min(Math.max(pos, 0), Math.max(0, wLen - ow));

    addOpening(floor.id, wall.id, {
      componentId,
      position: pos,
      sillHeight: comp.kind.startsWith("door") ? 0 : 900,
      manual: false,
    });
  }

  function handleCountChange(componentId: string, delta: number) {
    if (!wall || !floor) return;
    const existing = wall.openings.filter((o) => o.componentId === componentId);
    if (delta > 0) {
      handleAddComponent(componentId);
    } else if (delta < 0 && existing.length > 0) {
      removeOpening(floor.id, wall.id, existing[existing.length - 1].id);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ background: getWallEntry(wall.type).color }}
        />
        <input
          type="text"
          value={wall.label}
          onChange={(e) =>
            updateWall(floor.id, wall.id, { label: e.target.value })
          }
          className="text-sm font-semibold flex-1 min-w-0"
        />
        <button
          onClick={() => selectWall(null)}
          className="text-muted hover:text-foreground text-lg leading-none"
          title="Zamknij"
        >
          ×
        </button>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-5">
        {/* Wall parameters */}
        <div className="space-y-3">
          <div className="section-label">Parametry ściany</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Długość</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={currentLength / 10}
                  onChange={(e) => handleLengthChange(Number(e.target.value) * 10)}
                  className="w-full text-sm"
                  step={10}
                  min={50}
                />
                <span className="text-xs text-muted">cm</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Wysokość</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={wall.height / 10}
                  onChange={(e) =>
                    updateWall(floor.id, wall.id, { height: Number(e.target.value) * 10 })
                  }
                  className="w-full text-sm"
                  step={10}
                  min={200}
                />
                <span className="text-xs text-muted">cm</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Kąt</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={currentAngle}
                  onChange={(e) => handleAngleChange(Number(e.target.value))}
                  className="w-full text-sm"
                  step={5}
                />
                <span className="text-xs text-muted">°</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Typ CLT</label>
              <select
                value={wall.type}
                onChange={(e) =>
                  updateWall(floor.id, wall.id, { type: e.target.value as WallType })
                }
                className="w-full text-sm"
              >
                {wallCatOptions.map(([key, cat]) => (
                  <option key={key} value={key}>
                    {cat.shortLabel}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="btn btn-sm btn-danger w-full"
            onClick={() => {
              removeWall(floor.id, wall.id);
              selectWall(null);
            }}
          >
            Usuń ścianę
          </button>
        </div>

        {/* Openings section */}
        <div className="space-y-3">
          <div className="section-label">Otwory — okna i drzwi</div>

          <div className="grid grid-cols-3 gap-2">
            {KINDS_ORDER.map((kind) => {
              const countOnWall = wall.openings.filter((o) => {
                const c = findComponent(o.componentId);
                return c?.kind === kind;
              }).length;
              const isExpanded = expandedKind === kind;

              return (
                <button
                  key={kind}
                  onClick={() => setExpandedKind(isExpanded ? null : kind)}
                  className={`tile ${isExpanded ? "tile-expanded" : countOnWall > 0 ? "tile-active" : ""}`}
                  style={{ padding: "8px 4px", minWidth: 0 }}
                >
                  <div className="tile-icon" style={{ width: 32, height: 32, fontSize: 16 }}>
                    {KIND_ICONS[kind]}
                  </div>
                  <div className="text-[10px] font-medium leading-tight">
                    {KIND_LABELS[kind]}
                  </div>
                  {countOnWall > 0 && !isExpanded && (
                    <div className="text-[10px] font-bold text-accent">{countOnWall}</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Expanded kind - variants + counter */}
          {expandedKind && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted">
                {KIND_LABELS[expandedKind]} — warianty
              </div>
              {groupComponents()[expandedKind].map((comp) => {
                const count = wall.openings.filter(
                  (o) => o.componentId === comp.id
                ).length;

                return (
                  <div
                    key={comp.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-surface"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{comp.label}</div>
                      <div className="text-[10px] text-muted">
                        {comp.width / 10}×{comp.height / 10}cm · {comp.pricePerUnit.toLocaleString("pl-PL")} zł
                      </div>
                    </div>
                    <div className="counter" style={{ transform: "scale(0.85)" }}>
                      <button onClick={() => handleCountChange(comp.id, -1)}>−</button>
                      <div className="counter-value">{count}</div>
                      <button onClick={() => handleCountChange(comp.id, 1)}>+</button>
                    </div>
                  </div>
                );
              })}

              {/* Manual mode per opening */}
              {wall.openings
                .filter((o) => {
                  const c = findComponent(o.componentId);
                  return c?.kind === expandedKind;
                })
                .map((op, idx) => {
                  const comp = findComponent(op.componentId);
                  if (!comp) return null;
                  return (
                    <OpeningDetail
                      key={op.id}
                      index={idx + 1}
                      opening={op}
                      comp={comp}
                      floorId={floor.id}
                      wallId={wall.id}
                    />
                  );
                })}
            </div>
          )}
        </div>

        {/* Openings summary — detailed editor per opening */}
        {wall.openings.length > 0 && (
          <div className="space-y-2">
            <div className="section-label">
              Otwory na ścianie ({wall.openings.length})
            </div>
            {(() => {
              const wLen = wallLength(wall);
              // Posortuj po pozycji — czytelniej
              const sorted = [...wall.openings].sort((a, b) => a.position - b.position);
              const overlapIds = findOverlappingOpenings(wall, wall.openings, project, floor);
              const outOfBoundsIds = findOutOfBounds(wall, wall.openings, wLen, wall.height, project, floor);
              return (
                <>
                  <div className="space-y-2">
                    {sorted.map((op, idx) => {
                      const comp = findComponent(op.componentId);
                      if (!comp) return null;
                      return (
                        <OpeningRow
                          key={op.id}
                          index={idx + 1}
                          opening={op}
                          comp={comp}
                          floorId={floor.id}
                          wallId={wall.id}
                          wallLen={wLen}
                          wallHeight={wall.height}
                          isOverlap={overlapIds.has(op.id)}
                          isOutOfBounds={outOfBoundsIds.has(op.id)}
                          onRemove={() => removeOpening(floor.id, wall.id, op.id)}
                        />
                      );
                    })}
                  </div>
                  {(overlapIds.size > 0 || outOfBoundsIds.size > 0) && (
                    <button
                      className="btn btn-sm w-full"
                      onClick={() => {
                        pushUndo();
                        autoArrangeOpenings(wall.openings, wLen).forEach((upd) =>
                          updateOpening(floor.id, wall.id, upd.id, { position: upd.position })
                        );
                      }}
                    >
                      ⚙️ Rozsuń otwory automatycznie
                    </button>
                  )}
                </>
              );
            })()}
            {(() => {
              const perim = wallOpeningsPerimeterM(wall);
              const cncMin = (perim * getCncDefaults().secPerMbOpening) / 60;
              return (
                <div className="text-[10px] text-muted bg-surface border border-border rounded px-2 py-1">
                  Σ obwód: <span className="font-semibold text-foreground">{perim.toFixed(2)} mb</span>
                  {" · "}
                  czas CNC ≈ <span className="font-semibold text-foreground">{cncMin.toFixed(1)} min</span>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Overlap / bounds detection & auto-arrange --------------------------------

function openingBounds(op: Opening): { w: number; h: number } {
  const comp = findComponent(op.componentId);
  return {
    w: op.customWidth ?? comp?.width ?? 0,
    h: op.customHeight ?? comp?.height ?? 0,
  };
}

function roofClipForWall(wall: Wall, project: Project, floor: Floor) {
  const isTop = floor.id === project.floors[project.floors.length - 1]?.id;
  const b = computeBoundsFromWalls(
    project.floors[0]?.walls.filter((w) => w.category === "external") ?? []
  );
  const roof = project.roof;
  const useRoof = Boolean(isTop && wall.category === "external" && roof);
  return { roof: useRoof ? roof! : null, bounds: useRoof ? b : null };
}

function findOverlappingOpenings(
  wall: Wall,
  openings: Opening[],
  project: Project,
  floor: Floor
): Set<string> {
  const bad = new Set<string>();
  const { roof, bounds } = roofClipForWall(wall, project, floor);
  const rects = openings.map((o) => resolveOpeningMm(wall, o, roof, bounds));
  for (let i = 0; i < openings.length; i++) {
    const ai = rects[i].position;
    const aw = rects[i].width;
    for (let j = i + 1; j < openings.length; j++) {
      const bj = rects[j].position;
      const bw = rects[j].width;
      if (ai < bj + bw && bj < ai + aw) {
        bad.add(openings[i].id);
        bad.add(openings[j].id);
      }
    }
  }
  return bad;
}

function findOutOfBounds(
  wall: Wall,
  openings: Opening[],
  wallLen: number,
  wallH: number,
  project: Project,
  floor: Floor
): Set<string> {
  const bad = new Set<string>();
  const { roof, bounds } = roofClipForWall(wall, project, floor);
  for (const op of openings) {
    const comp = findComponent(op.componentId);
    const rawW = op.customWidth ?? comp?.width ?? 0;
    if (op.position < 0 || op.position + rawW > wallLen + 0.5) bad.add(op.id);

    const rawH = op.customHeight ?? comp?.height ?? 0;
    const sill = comp?.kind.startsWith("door") ? 0 : op.sillHeight;
    if (sill < 0 || sill + rawH > wallH + 0.5) bad.add(op.id);

    const r = resolveOpeningMm(wall, op, roof, bounds);
    if (!comp?.kind.startsWith("door") && r.height + 1 < rawH) bad.add(op.id);
  }
  return bad;
}

function autoArrangeOpenings(
  openings: Opening[],
  wallLen: number
): Array<{ id: string; position: number }> {
  const MARGIN = 100;
  const sorted = [...openings].sort((a, b) => a.position - b.position);
  const updates: Array<{ id: string; position: number }> = [];
  let cursor = MARGIN;
  for (const op of sorted) {
    const { w } = openingBounds(op);
    const newPos = Math.min(Math.max(cursor, MARGIN), Math.max(MARGIN, wallLen - w - MARGIN));
    if (newPos !== op.position) updates.push({ id: op.id, position: newPos });
    cursor = newPos + w + MARGIN;
  }
  return updates;
}

function OpeningDetail({
  index,
  opening,
  comp,
  floorId,
  wallId,
}: {
  index: number;
  opening: Opening;
  comp: { width: number; height: number; label: string };
  floorId: string;
  wallId: string;
}) {
  const updateOpening = useStore((s) => s.updateOpening);

  return (
    <div className="flex items-center gap-2 p-2 bg-panel border border-border rounded-lg text-xs">
      <span className="text-muted font-mono w-5">#{index}</span>
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={opening.manual}
          onChange={(e) =>
            updateOpening(floorId, wallId, opening.id, { manual: e.target.checked })
          }
          className="w-3 h-3 accent-accent"
        />
        <span className="font-medium">Manual wymiar</span>
      </label>

      {opening.manual ? (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={(opening.customWidth ?? comp.width) / 10}
            onChange={(e) =>
              updateOpening(floorId, wallId, opening.id, {
                customWidth: Number(e.target.value) * 10,
              })
            }
            className="w-14 text-xs"
            step={1}
            min={30}
          />
          <span className="text-muted">×</span>
          <input
            type="number"
            value={(opening.customHeight ?? comp.height) / 10}
            onChange={(e) =>
              updateOpening(floorId, wallId, opening.id, {
                customHeight: Number(e.target.value) * 10,
              })
            }
            className="w-14 text-xs"
            step={1}
            min={30}
          />
          <span className="text-muted">cm</span>
        </div>
      ) : (
        <span className="text-muted">
          {comp.width / 10}×{comp.height / 10} cm
        </span>
      )}
    </div>
  );
}

// --- Detailed per-opening row ------------------------------------------------
function OpeningRow({
  index,
  opening,
  comp,
  floorId,
  wallId,
  wallLen,
  wallHeight,
  isOverlap,
  isOutOfBounds,
  onRemove,
}: {
  index: number;
  opening: Opening;
  comp: { width: number; height: number; label: string; kind: ComponentKind };
  floorId: string;
  wallId: string;
  wallLen: number;
  wallHeight: number;
  isOverlap: boolean;
  isOutOfBounds: boolean;
  onRemove: () => void;
}) {
  const updateOpening = useStore((s) => s.updateOpening);
  const w = opening.customWidth ?? comp.width;
  const h = opening.customHeight ?? comp.height;
  const maxPos = Math.max(0, wallLen - w);
  const maxSill = Math.max(0, wallHeight - h);

  const borderClass = isOverlap
    ? "border-red-500 bg-red-500/10"
    : isOutOfBounds
    ? "border-amber-500 bg-amber-500/10"
    : "border-border bg-panel";

  return (
    <div className={`rounded-lg border ${borderClass} p-2 text-xs space-y-2`}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-muted w-5">#{index}</span>
        <span className="flex-1 truncate font-medium">{comp.label}</span>
        <span className="text-[10px] text-muted">
          {w / 10}×{h / 10} cm
        </span>
        <button
          onClick={onRemove}
          className="text-danger hover:text-red-500 text-sm leading-none ml-1"
          title="Usuń otwór"
        >
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-muted mb-1">Od początku ściany</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={Math.round(opening.position / 10)}
              onChange={(e) =>
                updateOpening(floorId, wallId, opening.id, {
                  position: Math.max(0, Number(e.target.value) * 10),
                })
              }
              className="w-full text-xs"
              step={1}
              min={0}
            />
            <span className="text-muted text-[10px]">cm</span>
          </div>
          <input
            type="range"
            className="w-full accent-accent mt-1"
            min={0}
            max={Math.max(maxPos, 0)}
            step={10}
            value={Math.min(opening.position, maxPos)}
            onChange={(e) =>
              updateOpening(floorId, wallId, opening.id, {
                position: Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label className="block text-[10px] text-muted mb-1">Parapet (od podłogi)</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={Math.round(opening.sillHeight / 10)}
              onChange={(e) =>
                updateOpening(floorId, wallId, opening.id, {
                  sillHeight: Math.max(0, Number(e.target.value) * 10),
                })
              }
              className="w-full text-xs"
              step={1}
              min={0}
              disabled={comp.kind.startsWith("door")}
            />
            <span className="text-muted text-[10px]">cm</span>
          </div>
          <input
            type="range"
            className="w-full accent-accent mt-1"
            min={0}
            max={Math.max(maxSill, 0)}
            step={10}
            value={Math.min(opening.sillHeight, maxSill)}
            disabled={comp.kind.startsWith("door")}
            onChange={(e) =>
              updateOpening(floorId, wallId, opening.id, {
                sillHeight: Number(e.target.value),
              })
            }
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[10px] cursor-pointer">
        <input
          type="checkbox"
          checked={opening.manual}
          onChange={(e) =>
            updateOpening(floorId, wallId, opening.id, { manual: e.target.checked })
          }
          className="w-3 h-3 accent-accent"
        />
        <span>Manualny wymiar otworu</span>
      </label>
      {opening.manual && (
        <div className="flex items-center gap-1 text-[10px]">
          <input
            type="number"
            value={(opening.customWidth ?? comp.width) / 10}
            onChange={(e) =>
              updateOpening(floorId, wallId, opening.id, {
                customWidth: Math.max(100, Number(e.target.value) * 10),
              })
            }
            className="w-16 text-xs"
            step={1}
            min={10}
          />
          <span className="text-muted">×</span>
          <input
            type="number"
            value={(opening.customHeight ?? comp.height) / 10}
            onChange={(e) =>
              updateOpening(floorId, wallId, opening.id, {
                customHeight: Math.max(100, Number(e.target.value) * 10),
              })
            }
            className="w-16 text-xs"
            step={1}
            min={10}
          />
          <span className="text-muted">cm</span>
        </div>
      )}

      {isOverlap && (
        <div className="text-[10px] text-red-400">
          ⚠ Otwór nakłada się na sąsiedni.
        </div>
      )}
      {isOutOfBounds && !isOverlap && (
        <div className="text-[10px] text-amber-400">
          ⚠ Otwór wychodzi poza krawędź ściany / wysokość.
        </div>
      )}
    </div>
  );
}
