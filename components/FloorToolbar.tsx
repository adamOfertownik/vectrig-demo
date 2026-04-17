"use client";

import { useStore, useActiveFloor, useActiveBuilding } from "@/lib/store";
import { getWallsByCategory } from "@/lib/catalog";
import type { WallCategory } from "@/lib/types";
import { HOUSE_TEMPLATES } from "@/lib/house-templates";

export default function FloorToolbar() {
  const project = useStore((s) => s.project);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const activeFloorId = useStore((s) => s.activeFloorId);
  const setActiveFloor = useStore((s) => s.setActiveFloor);
  const addFloor = useStore((s) => s.addFloor);
  const duplicateFloor = useStore((s) => s.duplicateFloor);
  const removeFloor = useStore((s) => s.removeFloor);
  const updateFloor = useStore((s) => s.updateFloor);
  const closeOutline = useStore((s) => s.closeOutline);
  const show3D = useStore((s) => s.show3D);
  const toggle3D = useStore((s) => s.toggle3D);
  const drawTool = useStore((s) => s.drawTool);
  const setDrawTool = useStore((s) => s.setDrawTool);
  const drawWallCategory = useStore((s) => s.drawWallCategory);
  const setDrawWallCategory = useStore((s) => s.setDrawWallCategory);
  const applyHouseTemplate = useStore((s) => s.applyHouseTemplate);
  const setShowDxfImport = useStore((s) => s.setShowDxfImport);
  const setShowShortcuts = useStore((s) => s.setShowShortcuts);
  const slabEdit = useStore((s) => s.slabEdit);
  const setSlabEdit = useStore((s) => s.setSlabEdit);
  const addStair = useStore((s) => s.addStair);
  const selectStair = useStore((s) => s.selectStair);
  const activeBuildingId = useStore((s) => s.activeBuildingId);
  const setActiveBuilding = useStore((s) => s.setActiveBuilding);
  const addBuilding = useStore((s) => s.addBuilding);
  const removeBuilding = useStore((s) => s.removeBuilding);
  const duplicateBuilding = useStore((s) => s.duplicateBuilding);
  const sitePlanMode = useStore((s) => s.sitePlanMode);
  const setSitePlanMode = useStore((s) => s.setSitePlanMode);
  // Re-render po edycji cennika (lista stropów w selekcie).
  useStore((s) => s.catalogOverrides);

  const floor = useActiveFloor();
  const activeBuilding = useActiveBuilding();
  const floors = activeBuilding?.floors ?? [];
  const activeFloor = floors.find((f) => f.id === activeFloorId) ?? floors[0];

  function handleFloorTab(floorId: string) {
    setActiveFloor(floorId);
    setViewMode("floorplan");
  }

  function startDraw(category: WallCategory) {
    setDrawWallCategory(category);
    setDrawTool("draw");
  }

  return (
    <div className="bg-panel border-b border-border">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-border/80 flex-wrap text-xs">
        <span className="text-[10px] uppercase tracking-wide text-muted font-semibold">Budynek</span>
        <select
          className="text-xs bg-panel border border-border rounded px-2 py-1 min-w-[140px]"
          value={activeBuildingId ?? activeBuilding?.id ?? ""}
          onChange={(e) => setActiveBuilding(e.target.value || null)}
        >
          {project.buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" onClick={() => addBuilding()}>
          + Nowy
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => activeBuilding && duplicateBuilding(activeBuilding.id)}
          disabled={!activeBuilding}
        >
          Duplikuj
        </button>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() => {
            if (!activeBuilding || project.buildings.length <= 1) return;
            if (!confirm(`Usunąć budynek „${activeBuilding.name}”?`)) return;
            removeBuilding(activeBuilding.id);
          }}
          disabled={!activeBuilding || project.buildings.length <= 1}
        >
          Usuń
        </button>
        <label className="flex items-center gap-1.5 cursor-pointer select-none ml-2">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 accent-accent"
            checked={sitePlanMode}
            onChange={(e) => setSitePlanMode(e.target.checked)}
          />
          <span>Plan sytuacyjny (wszystkie budynki)</span>
        </label>
      </div>
      {/* Main toolbar row */}
      <div className="flex items-center gap-1 px-3 py-1.5" data-tour="floors">
        {floors.map((f) => {
          const isActive = f.id === activeFloor?.id && viewMode === "floorplan";
          return (
            <button
              key={f.id}
              onClick={() => handleFloorTab(f.id)}
              className={`btn btn-sm ${isActive ? "btn-primary" : ""}`}
            >
              {f.name}
              <span className={`text-[10px] ${isActive ? "opacity-80" : "text-muted"}`}>
                ({f.walls.length})
              </span>
            </button>
          );
        })}

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={() => setViewMode("roof")}
          className={`btn btn-sm ${viewMode === "roof" ? "btn-primary" : ""}`}
        >
          Dach
          {activeBuilding?.roof && (
            <span className={`text-[10px] ${viewMode === "roof" ? "opacity-80" : "text-muted"}`}>
              ({activeBuilding.roof.type})
            </span>
          )}
        </button>

        <button
          data-tour="schedule"
          onClick={() => setViewMode("schedule")}
          className={`btn btn-sm ${viewMode === "schedule" ? "btn-primary" : ""}`}
          title="Zestawienie ścian i podział na panele CLT"
        >
          Zestawienie
        </button>

        <button
          data-tour="catalog"
          onClick={() => setViewMode("catalog")}
          className={`btn btn-sm ${viewMode === "catalog" ? "btn-primary" : ""}`}
          title="Cennik — edytuj i dodawaj własne typy CLT, okna, drzwi"
        >
          Cennik
        </button>

        <button
          onClick={() => setViewMode("settings")}
          className={`btn btn-sm ${viewMode === "settings" ? "btn-primary" : ""}`}
        >
          Ustawienia
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setShowShortcuts(true)}
          className="btn btn-sm"
          title="Skróty klawiszowe (?)"
        >
          ⌨
        </button>

        <button
          onClick={toggle3D}
          className={`btn btn-sm ${show3D ? "btn-primary" : ""}`}
          title={show3D ? "Pokaż plan 2D (F)" : "Pokaż podgląd 3D (F)"}
        >
          {show3D ? "3D" : "2D"}
        </button>
      </div>

      {viewMode === "floorplan" && floor && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-border bg-surface/50 flex-wrap">
          <div className="flex items-center gap-0.5 bg-panel border border-border rounded-lg p-0.5">
            <ToolButton
              active={drawTool === "select"}
              onClick={() => setDrawTool("select")}
              title="Zaznaczanie (V)"
              label="↖"
            />
            <ToolButton
              active={drawTool === "draw"}
              onClick={() => setDrawTool("draw")}
              title="Rysowanie — wybierz zewnętrzną lub wewnętrzną poniżej"
              label="✏"
            />
          </div>

          {drawTool === "draw" && (
            <>
              <div className="w-px h-5 bg-border mx-0.5" />
              <span className="text-[10px] text-muted shrink-0">Rysuj:</span>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  className={`px-2 py-1 text-xs font-medium transition-colors ${
                    drawWallCategory === "external"
                      ? "bg-accent text-white"
                      : "bg-panel text-muted hover:text-foreground"
                  }`}
                  onClick={() => setDrawWallCategory("external")}
                >
                  Zewnętrzna
                </button>
                <button
                  type="button"
                  className={`px-2 py-1 text-xs font-medium transition-colors border-l border-border ${
                    drawWallCategory === "internal"
                      ? "bg-accent text-white"
                      : "bg-panel text-muted hover:text-foreground"
                  }`}
                  onClick={() => setDrawWallCategory("internal")}
                >
                  Wewnętrzna
                </button>
              </div>
            </>
          )}

          <div className="w-px h-5 bg-border mx-0.5" />

          <div className="flex items-center gap-0.5 flex-wrap" data-tour="shapes">
            <span className="text-[10px] text-muted mr-0.5 shrink-0">Szablony:</span>
            {HOUSE_TEMPLATES.map((t, i) => (
              <button
                key={t.id}
                type="button"
                className="btn btn-sm max-w-[10rem]"
                onClick={() => floor && applyHouseTemplate(floor.id, t.id)}
                title={`${t.name} — ${t.hint} (klawisz ${i + 1})`}
              >
                <span className="text-[10px] leading-tight block truncate text-left">{t.name}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-border mx-0.5" />

          <button
            className="btn btn-sm"
            onClick={() => startDraw("external")}
            title="Tryb rysowania — ściany zewnętrzne (klikaj na planie)"
          >
            Rysuj zewn.
          </button>
          <button
            className="btn btn-sm"
            onClick={() => startDraw("internal")}
            title="Tryb rysowania — ściany wewnętrzne (klikaj na planie)"
          >
            Rysuj wewn.
          </button>
          <button
            className="btn btn-sm"
            onClick={() => floor && closeOutline(floor.id)}
            title="Domknij obrys zewnętrzny (C) — tylko dla obrysu zewnętrznego"
          >
            ↩ Zamknij obrys
          </button>

          <div className="w-px h-5 bg-border mx-0.5" />

          <button
            className="btn btn-sm"
            onClick={() => setShowDxfImport(true)}
            title="Import DXF (I)"
          >
            ↓ Import DXF
          </button>

          {activeFloor && activeFloor.level > 0 && (
            <button
              data-tour="slab"
              className={`btn btn-sm ${slabEdit ? "btn-primary" : ""}`}
              onClick={() => setSlabEdit(!slabEdit)}
              title="Edycja stropu (odłączenie, cutouty)"
            >
              🔲 Strop
            </button>
          )}

          {floors.length >= 2 && activeFloor && (
            <button
              data-tour="stairs"
              className="btn btn-sm"
              title="Dodaj schody — start na tym piętrze, cutout w stropie piętra wyżej"
              onClick={() => {
                const activeIdx = floors.findIndex((f) => f.id === activeFloor.id);
                const toFloor = floors[activeIdx + 1];
                if (!toFloor) return;
                const id = addStair({
                  label: `Schody ${(activeBuilding?.stairs.length ?? 0) + 1}`,
                  fromFloorId: activeFloor.id,
                  toFloorId: toFloor.id,
                  type: "straight",
                  origin: { x: 1000, y: 1000 },
                  rotation: 0,
                  width: 1000,
                  treadDepth: 280,
                  stepCount: Math.max(1, Math.ceil(activeFloor.height / 190)),
                });
                selectStair(id);
              }}
            >
              + Schody
            </button>
          )}

          <div className="w-px h-5 bg-border mx-0.5" />

          <button className="btn btn-sm" onClick={() => addFloor()}>
            + Piętro
          </button>
          {floors.length > 0 && (
            <>
              <span className="text-[10px] text-muted">Duplikuj:</span>
              {floors.map((f) => (
                <button
                  key={f.id}
                  className="btn btn-sm"
                  onClick={() => duplicateFloor(f.id)}
                >
                  {f.name}
                </button>
              ))}
            </>
          )}

          {activeFloor && activeFloor.level > 0 && (
            <>
              <div className="w-px h-5 bg-border mx-0.5" />
              <button
                className="btn btn-sm btn-danger"
                onClick={() => removeFloor(activeFloor.id)}
              >
                Usuń {activeFloor.name}
              </button>
            </>
          )}

          <div className="flex-1" />

          {activeFloor && (
            <div className="flex items-center gap-3 text-xs flex-wrap justify-end">
              <div className="flex items-center gap-1">
                <span className="text-muted">Wys.:</span>
                <input
                  type="number"
                  value={activeFloor.height / 10}
                  onChange={(e) =>
                    updateFloor(activeFloor.id, { height: Number(e.target.value) * 10 })
                  }
                  className="w-16 text-xs"
                  step={10}
                  min={200}
                  max={400}
                />
                <span className="text-muted">cm</span>
              </div>
              {activeFloor.level > 0 && (
                <>
                  <div
                    className="flex items-center gap-1 max-w-[220px]"
                    title="Strop jest poziomo pod ścianami tego piętra; kształt = obrys ścian zewnętrznych z tego poziomu. Edytuj obrys na planie 2D."
                  >
                    <span className="text-muted shrink-0">Strop CLT:</span>
                    <select
                      value={activeFloor.slabThickness}
                      onChange={(e) =>
                        updateFloor(activeFloor.id, { slabThickness: Number(e.target.value) })
                      }
                      className="text-xs max-w-[120px]"
                    >
                      {getWallsByCategory("slab").map(([key, cat]) => (
                        <option key={key} value={cat.thickness}>
                          {cat.shortLabel}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-[10px] text-muted hidden lg:inline max-w-[200px]">
                    Układ = obrys zewn.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  label,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors ${
        active
          ? "bg-accent text-white"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
