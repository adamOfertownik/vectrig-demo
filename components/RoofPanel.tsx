"use client";

import { useStore, useActiveBuilding } from "@/lib/store";
import { ROOF_CATALOG, getWallEntry, getWallsByCategory } from "@/lib/catalog";
import type { RoofType } from "@/lib/types";

const ROOF_ICONS: Record<RoofType, string> = {
  flat: "▬",
  mono_pitch: "◢",
  gable: "⛛",
  hip: "⬠",
};

export default function RoofPanel() {
  const project = useStore((s) => s.project);
  const activeBuilding = useActiveBuilding();
  const roof = activeBuilding?.roof ?? null;
  const setRoof = useStore((s) => s.setRoof);
  const updateRoof = useStore((s) => s.updateRoof);
  const addRoofAnomaly = useStore((s) => s.addRoofAnomaly);
  const removeRoofAnomaly = useStore((s) => s.removeRoofAnomaly);

  function handleSelectRoofType(type: RoofType) {
    if (roof?.type === type) return;
    const defaultPitch =
      type === "flat" ? 2 : type === "mono_pitch" ? 10 : type === "gable" ? 30 : 25;
    setRoof({
      type,
      pitch: defaultPitch,
      overhang: 500,
      thickness: getWallEntry(project.defaults.roofType).thickness,
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-1">Dach</h2>
        <p className="text-secondary text-sm">
          Wybierz typ dachu i skonfiguruj parametry. Anomalie dachowe dodaj poniżej.
        </p>
      </div>

      {/* Roof type tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ROOF_CATALOG.map((entry) => {
          const isActive = roof?.type === entry.type;
          return (
            <button
              key={entry.type}
              onClick={() => handleSelectRoofType(entry.type)}
              className={`tile ${isActive ? "tile-active" : ""}`}
            >
              <div className="tile-icon text-2xl">{ROOF_ICONS[entry.type]}</div>
              <div className="text-sm font-medium">{entry.label}</div>
              <div className="text-xs text-muted">{entry.description}</div>
            </button>
          );
        })}
      </div>

      {/* Roof parameters */}
      {roof && (
        <div className="card space-y-4">
          <div className="text-sm font-medium">Parametry dachu</div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1">Kąt nachylenia</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={roof.pitch}
                  onChange={(e) => updateRoof({ pitch: Number(e.target.value) })}
                  className="w-20"
                  step={1}
                  min={0}
                  max={60}
                />
                <span className="text-sm text-muted">°</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Wysięg okapu</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={roof.overhang / 10}
                  onChange={(e) =>
                    updateRoof({ overhang: Number(e.target.value) * 10 })
                  }
                  className="w-20"
                  step={5}
                  min={0}
                />
                <span className="text-sm text-muted">cm</span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">
                Grubość CLT dachu
              </label>
              <select
                value={roof.thickness}
                onChange={(e) =>
                  updateRoof({ thickness: Number(e.target.value) })
                }
                className="w-full"
              >
                {getWallsByCategory("roof").map(([key, cat]) => (
                  <option key={key} value={cat.thickness}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pitch slider */}
          <div>
            <input
              type="range"
              min={0}
              max={60}
              value={roof.pitch}
              onChange={(e) => updateRoof({ pitch: Number(e.target.value) })}
              className="w-full accent-accent"
            />
            <div className="flex justify-between text-xs text-muted">
              <span>0° (płaski)</span>
              <span>30°</span>
              <span>60° (stromy)</span>
            </div>
          </div>
        </div>
      )}

      {/* Roof anomalies */}
      {roof && (
        <div className="card space-y-4">
          <div className="text-sm font-medium">Anomalie dachowe</div>

          {roof.anomalies.length === 0 && (
            <div className="text-sm text-muted italic">
              Brak anomalii. Dodaj lukarnę, okno dachowe lub komin.
            </div>
          )}

          {roof.anomalies.map((anomaly) => (
            <div
              key={anomaly.id}
              className="flex items-center gap-4 p-3 bg-surface rounded-lg"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{anomaly.label}</div>
                <div className="text-xs text-muted">
                  {anomaly.type === "dormer" && "Lukarna"}
                  {anomaly.type === "skylight" && "Okno dachowe"}
                  {anomaly.type === "chimney" && "Komin"}
                  {anomaly.type === "overhang" && "Dodatkowy okap"}
                  {" · "}
                  {anomaly.width / 10}x{anomaly.height / 10} cm
                  {anomaly.depth ? ` · gl. ${anomaly.depth / 10} cm` : ""}
                </div>
              </div>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => removeRoofAnomaly(anomaly.id)}
              >
                Usuń
              </button>
            </div>
          ))}

          <div className="flex gap-2 flex-wrap">
            <button
              className="btn btn-sm"
              onClick={() =>
                addRoofAnomaly({
                  type: "dormer",
                  label: `Lukarna ${roof.anomalies.length + 1}`,
                  width: 1500,
                  height: 1200,
                  depth: 1500,
                })
              }
            >
              + Lukarna
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                addRoofAnomaly({
                  type: "skylight",
                  label: `Okno dachowe ${roof.anomalies.length + 1}`,
                  width: 780,
                  height: 1400,
                })
              }
            >
              + Okno dachowe
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                addRoofAnomaly({
                  type: "chimney",
                  label: `Komin ${roof.anomalies.length + 1}`,
                  width: 400,
                  height: 400,
                })
              }
            >
              + Komin
            </button>
          </div>
        </div>
      )}

      {!roof && (
        <div className="card text-center py-8 text-muted">
          <div className="text-3xl mb-2">⛏</div>
          <div className="text-sm">
            Wybierz typ dachu powyżej, aby skonfigurować parametry.
          </div>
        </div>
      )}
    </div>
  );
}
