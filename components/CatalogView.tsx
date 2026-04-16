"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  BASE_COMPONENT_CATALOG,
  BASE_WALL_CATALOG,
  KIND_LABELS,
  listAllComponents,
  listAllWallEntries,
  type WallCatalogEntry,
} from "@/lib/catalog";
import type { CatalogComponent, ComponentKind } from "@/lib/types";

type Tab = "walls" | "components" | "cnc";

const WALL_CATEGORIES: Array<{ key: WallCatalogEntry["category"]; label: string }> = [
  { key: "wall_ext", label: "Ściany zewnętrzne" },
  { key: "wall_int", label: "Ściany wewnętrzne" },
  { key: "slab", label: "Stropy" },
  { key: "roof", label: "Dach" },
];

const KINDS_ORDER: ComponentKind[] = [
  "window_fixed",
  "window_hs",
  "window_tilt",
  "window_double",
  "glazing_fill",
  "door",
  "door_hs",
];

export default function CatalogView() {
  const overrides = useStore((s) => s.catalogOverrides);
  const updateWallCatalog = useStore((s) => s.updateWallCatalog);
  const addWallCatalogEntry = useStore((s) => s.addWallCatalogEntry);
  const removeWallCatalogEntry = useStore((s) => s.removeWallCatalogEntry);
  const updateComponentCatalog = useStore((s) => s.updateComponentCatalog);
  const addComponentCatalog = useStore((s) => s.addComponentCatalog);
  const removeComponentCatalog = useStore((s) => s.removeComponentCatalog);
  const updateCncDefaults = useStore((s) => s.updateCncDefaults);
  const resetCatalog = useStore((s) => s.resetCatalog);

  const [tab, setTab] = useState<Tab>("walls");
  const [showAddWall, setShowAddWall] = useState<WallCatalogEntry["category"] | null>(null);
  const [showAddComponent, setShowAddComponent] = useState<ComponentKind | null>(null);

  const allWalls = listAllWallEntries();
  const allComponents = listAllComponents();

  const customWallSet = new Set(overrides.customWallIds);
  const customCompSet = new Set(overrides.customComponentIds);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Cennik</h2>
        <div className="text-xs text-muted">
          Zmiany obowiązują w obrębie tej sesji — po odświeżeniu strony wracają domyślne wartości.
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (confirm("Przywrócić domyślne wartości cennika i usunąć dodane pozycje?")) {
              resetCatalog();
            }
          }}
          className="btn btn-sm"
          title="Przywróć bazowe wartości i usuń dodane pozycje"
        >
          ↺ Przywróć domyślne
        </button>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(
          [
            { id: "walls", label: "Ściany / stropy / dach" },
            { id: "components", label: "Okna i drzwi" },
            { id: "cnc", label: "CNC" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "walls" && (
        <div className="space-y-5">
          {WALL_CATEGORIES.map((cat) => {
            const entries = allWalls.filter(([, e]) => e.category === cat.key);
            return (
              <section key={cat.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{cat.label}</h3>
                  <span className="text-xs text-muted">({entries.length})</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setShowAddWall(cat.key)}
                  >
                    + Dodaj typ
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border bg-panel">
                  <table className="w-full text-xs">
                    <thead className="bg-surface text-left">
                      <tr>
                        <th className="px-2 py-1.5">ID</th>
                        <th className="px-2 py-1.5">Nazwa</th>
                        <th className="px-2 py-1.5">Skrót</th>
                        <th className="px-2 py-1.5 text-right">Grubość [mm]</th>
                        <th className="px-2 py-1.5 text-right">Cena / m³</th>
                        <th className="px-2 py-1.5 text-right">Cena / m²</th>
                        <th className="px-2 py-1.5 text-right">Max W [mm]</th>
                        <th className="px-2 py-1.5 text-right">Max L [mm]</th>
                        <th className="px-2 py-1.5 text-right">Ząbek [mm]</th>
                        <th className="px-2 py-1.5 text-right">s/mb</th>
                        <th className="px-2 py-1.5">Kolor</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map(([id, e]) => {
                        const isCustom = customWallSet.has(id);
                        return (
                          <tr key={id} className="border-t border-border">
                            <td className="px-2 py-1 font-mono text-muted text-[10px]">
                              {id}
                              {isCustom && (
                                <span className="ml-1 text-accent">(własny)</span>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <TextCell
                                value={e.label}
                                onChange={(v) => updateWallCatalog(id, { label: v })}
                              />
                            </td>
                            <td className="px-2 py-1">
                              <TextCell
                                value={e.shortLabel}
                                onChange={(v) => updateWallCatalog(id, { shortLabel: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={e.thickness}
                                onChange={(v) => updateWallCatalog(id, { thickness: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={e.pricePerCubicM}
                                onChange={(v) => updateWallCatalog(id, { pricePerCubicM: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={e.pricePerSqm}
                                onChange={(v) => updateWallCatalog(id, { pricePerSqm: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={e.maxPanelWidth}
                                onChange={(v) => updateWallCatalog(id, { maxPanelWidth: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={e.maxPanelLength}
                                onChange={(v) => updateWallCatalog(id, { maxPanelLength: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={e.toothDepth}
                                onChange={(v) => updateWallCatalog(id, { toothDepth: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={e.machiningSecPerMb}
                                onChange={(v) =>
                                  updateWallCatalog(id, { machiningSecPerMb: v })
                                }
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input
                                type="color"
                                value={e.color}
                                onChange={(ev) =>
                                  updateWallCatalog(id, { color: ev.target.value })
                                }
                                className="w-8 h-6 p-0 bg-transparent border border-border rounded"
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              {isCustom ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Usunąć "${e.label}"? Ściany tego typu dostaną fallback.`,
                                      )
                                    ) {
                                      removeWallCatalogEntry(id);
                                    }
                                  }}
                                  className="text-red-400 text-xs hover:underline"
                                >
                                  Usuń
                                </button>
                              ) : (
                                overrides.walls[id] && (
                                  <button
                                    type="button"
                                    onClick={() => removeWallCatalogEntry(id)}
                                    className="text-muted text-xs hover:text-foreground"
                                    title="Przywróć wartości bazowe"
                                  >
                                    Reset
                                  </button>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "components" && (
        <div className="space-y-5">
          {KINDS_ORDER.map((kind) => {
            const entries = allComponents.filter((c) => c.kind === kind);
            return (
              <section key={kind} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{KIND_LABELS[kind]}</h3>
                  <span className="text-xs text-muted">({entries.length})</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setShowAddComponent(kind)}
                  >
                    + Dodaj pozycję
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border bg-panel">
                  <table className="w-full text-xs">
                    <thead className="bg-surface text-left">
                      <tr>
                        <th className="px-2 py-1.5">ID</th>
                        <th className="px-2 py-1.5">Nazwa</th>
                        <th className="px-2 py-1.5 text-right">Szer. [mm]</th>
                        <th className="px-2 py-1.5 text-right">Wys. [mm]</th>
                        <th className="px-2 py-1.5 text-right">Cena / szt</th>
                        <th className="px-2 py-1.5 text-right">Szyba [m²]</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((c) => {
                        const isCustom = customCompSet.has(c.id);
                        return (
                          <tr key={c.id} className="border-t border-border">
                            <td className="px-2 py-1 font-mono text-muted text-[10px]">
                              {c.id}
                              {isCustom && (
                                <span className="ml-1 text-accent">(własny)</span>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <TextCell
                                value={c.label}
                                onChange={(v) => updateComponentCatalog(c.id, { label: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={c.width}
                                onChange={(v) => updateComponentCatalog(c.id, { width: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={c.height}
                                onChange={(v) => updateComponentCatalog(c.id, { height: v })}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={c.pricePerUnit}
                                onChange={(v) =>
                                  updateComponentCatalog(c.id, { pricePerUnit: v })
                                }
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <NumCell
                                value={c.glazingArea}
                                step={0.01}
                                onChange={(v) =>
                                  updateComponentCatalog(c.id, { glazingArea: v })
                                }
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              {isCustom ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Usunąć "${c.label}"?`)) {
                                      removeComponentCatalog(c.id);
                                    }
                                  }}
                                  className="text-red-400 text-xs hover:underline"
                                >
                                  Usuń
                                </button>
                              ) : (
                                overrides.components[c.id] && (
                                  <button
                                    type="button"
                                    onClick={() => removeComponentCatalog(c.id)}
                                    className="text-muted text-xs hover:text-foreground"
                                    title="Przywróć wartości bazowe"
                                  >
                                    Reset
                                  </button>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "cnc" && (
        <div className="space-y-3 max-w-xl">
          <div className="text-xs text-muted">
            Parametry maszyny CNC — używane do wyceny czasu wycinania otworów i obróbki styków
            paneli CLT.
          </div>
          <CncRow
            label="Czas wycięcia krawędzi otworu"
            suffix="s/mb"
            value={overrides.cnc.secPerMbOpening}
            onChange={(v) => updateCncDefaults({ secPerMbOpening: v })}
          />
          <CncRow
            label="Czas łączenia ząbkowego"
            suffix="s/mb"
            value={overrides.cnc.secPerMbJoint}
            onChange={(v) => updateCncDefaults({ secPerMbJoint: v })}
          />
          <CncRow
            label="Stawka operatora CNC"
            suffix="PLN/h"
            value={overrides.cnc.operatorRatePerHour}
            onChange={(v) => updateCncDefaults({ operatorRatePerHour: v })}
          />
        </div>
      )}

      {showAddWall && (
        <AddWallModal
          category={showAddWall}
          onClose={() => setShowAddWall(null)}
          onAdd={(id, entry) => {
            addWallCatalogEntry(id, entry);
            setShowAddWall(null);
          }}
        />
      )}

      {showAddComponent && (
        <AddComponentModal
          kind={showAddComponent}
          onClose={() => setShowAddComponent(null)}
          onAdd={(c) => {
            addComponentCatalog(c);
            setShowAddComponent(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function TextCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-transparent border border-transparent hover:border-border focus:border-accent rounded px-1 py-0.5 text-xs"
    />
  );
}

function NumCell({
  value,
  onChange,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      className="w-24 bg-transparent border border-transparent hover:border-border focus:border-accent rounded px-1 py-0.5 text-right text-xs font-mono"
    />
  );
}

function CncRow({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="text-sm flex-1">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="w-28 text-right"
      />
      <span className="text-xs text-muted w-14">{suffix}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Add-wall modal
// ---------------------------------------------------------------------------

function AddWallModal({
  category,
  onClose,
  onAdd,
}: {
  category: WallCatalogEntry["category"];
  onClose: () => void;
  onAdd: (id: string, entry: WallCatalogEntry) => void;
}) {
  const [id, setId] = useState("CLT_CUSTOM_" + Date.now().toString(36).toUpperCase());
  const [label, setLabel] = useState("");
  const [shortLabel, setShortLabel] = useState("");
  const [thickness, setThickness] = useState(120);
  const [pricePerCubicM, setPricePerCubicM] = useState(4000);
  const [color, setColor] = useState("#8B7355");

  function submit() {
    if (!label.trim() || !shortLabel.trim()) {
      alert("Uzupełnij nazwę i skrót.");
      return;
    }
    const base: WallCatalogEntry = {
      ...BASE_WALL_CATALOG.CLT_120_EXT,
      label,
      shortLabel,
      thickness,
      pricePerCubicM,
      pricePerSqm: Math.round((pricePerCubicM * thickness) / 1000),
      color,
      category,
    };
    onAdd(id, base);
  }

  return (
    <Modal onClose={onClose} title={`Dodaj nowy typ — ${category}`}>
      <div className="space-y-3">
        <LabeledInput
          label="ID (unikalny klucz)"
          value={id}
          onChange={setId}
          mono
        />
        <LabeledInput label="Nazwa pełna" value={label} onChange={setLabel} />
        <LabeledInput
          label="Skrót (kafelek)"
          value={shortLabel}
          onChange={setShortLabel}
        />
        <LabeledNumber
          label="Grubość [mm]"
          value={thickness}
          onChange={setThickness}
        />
        <LabeledNumber
          label="Cena / m³ [PLN]"
          value={pricePerCubicM}
          onChange={setPricePerCubicM}
        />
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted w-36">Kolor (3D)</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
            Dodaj
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add-component modal
// ---------------------------------------------------------------------------

function AddComponentModal({
  kind,
  onClose,
  onAdd,
}: {
  kind: ComponentKind;
  onClose: () => void;
  onAdd: (component: CatalogComponent) => void;
}) {
  const [id, setId] = useState("CUSTOM_" + kind.toUpperCase() + "_" + Date.now().toString(36).toUpperCase());
  const [label, setLabel] = useState("");
  const [width, setWidth] = useState(1000);
  const [height, setHeight] = useState(1400);
  const [pricePerUnit, setPricePerUnit] = useState(1500);
  const [glazingArea, setGlazingArea] = useState(
    kind === "door" || kind === "glazing_fill" ? 0 : 1,
  );

  function submit() {
    if (!label.trim()) {
      alert("Uzupełnij nazwę.");
      return;
    }
    const comp: CatalogComponent = {
      id,
      kind,
      label,
      width,
      height,
      pricePerUnit,
      glazingArea,
      icon: kind,
    };
    // Fallback ikona — jeśli nie znajdziemy w bazie, użyj kindu.
    const similar = BASE_COMPONENT_CATALOG.find((c) => c.kind === kind);
    if (similar?.icon) comp.icon = similar.icon;
    onAdd(comp);
  }

  return (
    <Modal onClose={onClose} title={`Dodaj pozycję — ${KIND_LABELS[kind]}`}>
      <div className="space-y-3">
        <LabeledInput label="ID" value={id} onChange={setId} mono />
        <LabeledInput label="Nazwa" value={label} onChange={setLabel} />
        <LabeledNumber label="Szerokość [mm]" value={width} onChange={setWidth} />
        <LabeledNumber label="Wysokość [mm]" value={height} onChange={setHeight} />
        <LabeledNumber
          label="Cena / szt [PLN]"
          value={pricePerUnit}
          onChange={setPricePerUnit}
        />
        <LabeledNumber
          label="Pow. szyby [m²]"
          value={glazingArea}
          onChange={setGlazingArea}
          step={0.01}
        />
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={submit}>
            Dodaj
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared modal & inputs
// ---------------------------------------------------------------------------

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-border rounded-xl shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-foreground text-lg leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-muted w-36">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`flex-1 ${mono ? "font-mono text-xs" : ""}`}
      />
    </label>
  );
}

function LabeledNumber({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs text-muted w-36">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="flex-1 text-right"
      />
    </label>
  );
}
