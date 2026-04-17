"use client";

import { useStore, useActiveBuilding } from "@/lib/store";
import { getWallsByCategory } from "@/lib/catalog";
import type { WallType } from "@/lib/types";

export default function SettingsPanel() {
  const defaults = useStore((s) => s.project.defaults);
  const setDefaults = useStore((s) => s.setDefaults);
  const projectName = useStore((s) => s.project.name);
  const setProjectName = useStore((s) => s.setProjectName);
  const activeBuilding = useActiveBuilding();
  const backWallEnabled = activeBuilding?.backWallEnabled ?? true;
  const setBackWallEnabled = useStore((s) => s.setBackWallEnabled);
  // Re-render po zmianach w cenniku (nowe typy CLT).
  useStore((s) => s.catalogOverrides);

  const extWalls = getWallsByCategory("wall_ext");
  const intWalls = getWallsByCategory("wall_int");
  const slabs = getWallsByCategory("slab");
  const roofs = getWallsByCategory("roof");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-1">Ustawienia globalne</h2>
        <p className="text-secondary text-sm">
          Domyślna technologia i grubości. Możesz je zmienić indywidualnie per ściana.
        </p>
      </div>

      <div className="card space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1">Nazwa projektu</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full"
            placeholder="np. Dom jednorodzinny Kowalski"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Ściana zewnętrzna"
            value={defaults.extWallType}
            options={extWalls}
            onChange={(v) => setDefaults({ extWallType: v })}
          />
          <SelectField
            label="Ściana wewnętrzna"
            value={defaults.intWallType}
            options={intWalls}
            onChange={(v) => setDefaults({ intWallType: v })}
          />
          <SelectField
            label="Strop"
            value={defaults.slabType}
            options={slabs}
            onChange={(v) => setDefaults({ slabType: v })}
          />
          <SelectField
            label="Dach (panel CLT)"
            value={defaults.roofType}
            options={roofs}
            onChange={(v) => setDefaults({ roofType: v })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Domyślna wysokość kondygnacji
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={defaults.wallHeight / 10}
              onChange={(e) => setDefaults({ wallHeight: Number(e.target.value) * 10 })}
              className="w-32"
              step={10}
              min={200}
              max={400}
            />
            <span className="text-sm text-muted">cm</span>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={backWallEnabled}
            onChange={(e) => setBackWallEnabled(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-sm">Ściana tylna (przy budynku)</span>
        </label>
      </div>

      <div className="card card-compact bg-accent-light border-accent">
        <div className="flex items-start gap-3">
          <span className="text-accent text-lg">i</span>
          <div className="text-sm">
            <div className="font-medium mb-1">Kubatura CLT</div>
            Wycena opiera się na kubaturze drewna (m3). Otwory (okna, drzwi) odejmują
            drewno ze ściany, zmniejszając koszt materiału.
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: WallType;
  options: [WallType, { label: string; thickness: number; pricePerCubicM: number }][];
  onChange: (v: WallType) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as WallType)}
        className="w-full"
      >
        {options.map(([key, cat]) => (
          <option key={key} value={key}>
            {cat.label} — {cat.pricePerCubicM} zł/m3
          </option>
        ))}
      </select>
    </div>
  );
}
