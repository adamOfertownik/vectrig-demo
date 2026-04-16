// lib/catalog.ts — biblioteka komponentów, typów ścian, dachów
// Serce branżowego modułu CLT. Kafelki w wizardzie czerpią stąd dane.

import type { CatalogComponent, WallType, ComponentKind, RoofType } from "./types";

// ---------------------------------------------------------------------------
// Parametry CNC / produkcji
// ---------------------------------------------------------------------------

export type CncDefaults = {
  /** Czas wycinania krawędzi otworu (s/mb). */
  secPerMbOpening: number;
  /** Czas wykonania łączenia ząbkowego między płytami (s/mb). */
  secPerMbJoint: number;
  /** Stawka operatora CNC (PLN/h). */
  operatorRatePerHour: number;
};

export const BASE_CNC_DEFAULTS: CncDefaults = {
  secPerMbOpening: 45,
  secPerMbJoint: 60,
  operatorRatePerHour: 180,
};

/** @deprecated — używaj `getCncDefaults()` by szanować override'y z cennika. */
export const CNC_DEFAULTS = BASE_CNC_DEFAULTS;

// ---------------------------------------------------------------------------
// Katalog typów ścian / stropów / dachu (panele CLT)
// ---------------------------------------------------------------------------

export interface WallCatalogEntry {
  label: string;
  shortLabel: string;        // do kafelka
  thickness: number;         // mm
  pricePerCubicM: number;    // PLN za m³ drewna CLT
  pricePerSqm: number;      // PLN za m² (legacy / szybkie szacunki)
  color: string;             // do wizualizacji 3D
  category: "wall_ext" | "wall_int" | "slab" | "roof";
  // Parametry produkcyjne panela
  maxPanelWidth: number;     // mm — max szerokość panela (wzdłuż długości ściany)
  maxPanelLength: number;    // mm — max długość panela (=wysokość ściany)
  toothDepth: number;        // mm — głębokość ząbka (odpad obustronny na styk)
  toothPitch: number;        // mm — rozstaw zębów (do DXF)
  machiningSecPerMb: number; // s/mb — czas obróbki połączenia ząbkowego
}

const PANEL_DEFAULTS = {
  maxPanelWidth: 3000,
  maxPanelLength: 12000,
  toothDepth: 40,
  toothPitch: 200,
  machiningSecPerMb: 60,
};

export const BASE_WALL_CATALOG: Record<string, WallCatalogEntry> = {
  CLT_120_EXT: {
    label: "Ściana zewn. CLT 120mm",
    shortLabel: "CLT 120",
    thickness: 120,
    pricePerCubicM: 4000,
    pricePerSqm: 480,
    color: "#8B7355",
    category: "wall_ext",
    ...PANEL_DEFAULTS,
  },
  CLT_140_EXT: {
    label: "Ściana zewn. CLT 140mm",
    shortLabel: "CLT 140",
    thickness: 140,
    pricePerCubicM: 4000,
    pricePerSqm: 560,
    color: "#7A6245",
    category: "wall_ext",
    ...PANEL_DEFAULTS,
  },
  CLT_100_INT: {
    label: "Ściana wewn. CLT 100mm",
    shortLabel: "CLT 100",
    thickness: 100,
    pricePerCubicM: 4100,
    pricePerSqm: 410,
    color: "#A0886E",
    category: "wall_int",
    ...PANEL_DEFAULTS,
  },
  CLT_80_PART: {
    label: "Ścianka dział. CLT 80mm",
    shortLabel: "CLT 80",
    thickness: 80,
    pricePerCubicM: 4250,
    pricePerSqm: 340,
    color: "#B8A088",
    category: "wall_int",
    ...PANEL_DEFAULTS,
  },
  CLT_160_SLAB: {
    label: "Strop CLT 160mm",
    shortLabel: "Strop 160",
    thickness: 160,
    pricePerCubicM: 3875,
    pricePerSqm: 620,
    color: "#6B5B45",
    category: "slab",
    ...PANEL_DEFAULTS,
  },
  CLT_200_SLAB: {
    label: "Strop CLT 200mm",
    shortLabel: "Strop 200",
    thickness: 200,
    pricePerCubicM: 3850,
    pricePerSqm: 770,
    color: "#5A4A35",
    category: "slab",
    ...PANEL_DEFAULTS,
  },
  CLT_120_ROOF: {
    label: "Dach CLT 120mm",
    shortLabel: "Dach 120",
    thickness: 120,
    pricePerCubicM: 4000,
    pricePerSqm: 480,
    color: "#9E8B6E",
    category: "roof",
    ...PANEL_DEFAULTS,
  },
  CLT_160_ROOF: {
    label: "Dach CLT 160mm",
    shortLabel: "Dach 160",
    thickness: 160,
    pricePerCubicM: 3875,
    pricePerSqm: 620,
    color: "#8E7B5E",
    category: "roof",
    ...PANEL_DEFAULTS,
  },
};

// ---------------------------------------------------------------------------
// Katalog komponentów (okna, drzwi) — kafelki w wizardzie
// ---------------------------------------------------------------------------

export const BASE_COMPONENT_CATALOG: CatalogComponent[] = [
  // --- Okna stałe (FEST) ---
  {
    id: "WIN_FEST_900x1400",
    kind: "window_fixed",
    label: "FEST 900×1400",
    icon: "fest",
    width: 900,
    height: 1400,
    pricePerUnit: 1450,
    glazingArea: 1.13,
    notes: "Pakiet 3-szybowy Ug=0.6",
  },
  {
    id: "WIN_FEST_1200x1400",
    kind: "window_fixed",
    label: "FEST 1200×1400",
    icon: "fest",
    width: 1200,
    height: 1400,
    pricePerUnit: 1850,
    glazingArea: 1.5,
    notes: "Pakiet 3-szybowy Ug=0.6",
  },
  {
    id: "WIN_FEST_1500x1400",
    kind: "window_fixed",
    label: "FEST 1500×1400",
    icon: "fest",
    width: 1500,
    height: 1400,
    pricePerUnit: 2250,
    glazingArea: 1.89,
  },

  // --- HS dwuskrzydłowy ---
  {
    id: "WIN_HS2_2000x2200",
    kind: "window_hs",
    label: "HS Dwuskrzydłowy 2000×2200",
    icon: "hs2",
    width: 2000,
    height: 2200,
    pricePerUnit: 14800,
    glazingArea: 4.0,
    notes: "Lift & Slide, próg ukryty",
  },
  {
    id: "WIN_HS2_3000x2400",
    kind: "window_hs",
    label: "HS Dwuskrzydłowy 3000×2400",
    icon: "hs2",
    width: 3000,
    height: 2400,
    pricePerUnit: 22500,
    glazingArea: 6.6,
  },

  // --- HS czteroskrzydłowy ---
  {
    id: "WIN_HS4_4000x2400",
    kind: "window_hs",
    label: "HS Czteroskrzydłowy 4000×2400",
    icon: "hs4",
    width: 4000,
    height: 2400,
    pricePerUnit: 32000,
    glazingArea: 8.8,
  },

  // --- Okno uchylne ---
  {
    id: "WIN_TILT_800x1200",
    kind: "window_tilt",
    label: "Okno Uchylne 800×1200",
    icon: "tilt",
    width: 800,
    height: 1200,
    pricePerUnit: 1100,
    glazingArea: 0.86,
  },
  {
    id: "WIN_TILT_1000x1400",
    kind: "window_tilt",
    label: "Okno Uchylne 1000×1400",
    icon: "tilt",
    width: 1000,
    height: 1400,
    pricePerUnit: 1350,
    glazingArea: 1.26,
  },

  // --- Okno dwuskrzydłowe ---
  {
    id: "WIN_DBL_1400x1400",
    kind: "window_double",
    label: "Okno Dwuskrzydłowe 1400×1400",
    icon: "double",
    width: 1400,
    height: 1400,
    pricePerUnit: 2100,
    glazingArea: 1.76,
  },

  // --- Wypełnienie sklejka ---
  {
    id: "FILL_PLYWOOD_900x1400",
    kind: "glazing_fill",
    label: "Wypełnienie Sklejka 900×1400",
    icon: "fill",
    width: 900,
    height: 1400,
    pricePerUnit: 350,
    glazingArea: 0,
    notes: "Panel sklejkowy zamiast szyby",
  },

  // --- Drzwi ---
  {
    id: "DOOR_900x2100",
    kind: "door",
    label: "Drzwi wejściowe 900×2100",
    icon: "door",
    width: 900,
    height: 2100,
    pricePerUnit: 4200,
    glazingArea: 0,
  },
  {
    id: "DOOR_1200x2200",
    kind: "door",
    label: "Drzwi tarasowe 1200×2200",
    icon: "door",
    width: 1200,
    height: 2200,
    pricePerUnit: 5800,
    glazingArea: 0.8,
  },
  {
    id: "DOOR_HS_2000x2200",
    kind: "door_hs",
    label: "Drzwi HS przesuwne 2000×2200",
    icon: "door_hs",
    width: 2000,
    height: 2200,
    pricePerUnit: 16500,
    glazingArea: 3.6,
    notes: "Lift & Slide bezprogowe",
  },
];

/** @deprecated — używaj `listAllComponents()` by uwzględnić pozycje dodane w cenniku. */
export const COMPONENT_CATALOG = BASE_COMPONENT_CATALOG;

/** @deprecated — używaj `getWallEntry(type)` / `listAllWallEntries()` dla cennika runtime. */
export const WALL_CATALOG = BASE_WALL_CATALOG;

// ---------------------------------------------------------------------------
// Runtime – odczyt katalogu z uwzględnieniem override'ów z `useStore`.
// Store binduje się sam przy inicjalizacji (patrz `lib/store.ts`), co pozwala
// uniknąć bezpośredniego importu cyklicznego.
// ---------------------------------------------------------------------------

export type CatalogOverrides = {
  walls: Record<string, WallCatalogEntry>;
  customWallIds: string[];
  components: Record<string, CatalogComponent>;
  customComponentIds: string[];
  cnc: CncDefaults;
};

type OverridesGetter = () => CatalogOverrides | null;

let overridesGetter: OverridesGetter = () => null;

/** Podłącz źródło override'ów (wywołuje `lib/store.ts` przy inicjalizacji). */
export function __bindCatalogOverrides(getter: OverridesGetter): void {
  overridesGetter = getter;
}

function getOverrides(): CatalogOverrides | null {
  try {
    return overridesGetter();
  } catch {
    return null;
  }
}

/** Zwraca wpis katalogu ściany/stropu/dachu z fallbackiem do bazy. */
export function getWallEntry(type: string): WallCatalogEntry {
  const o = getOverrides();
  return (
    o?.walls[type] ??
    BASE_WALL_CATALOG[type] ??
    BASE_WALL_CATALOG.CLT_120_EXT
  );
}

/** Wszystkie wpisy katalogu ścian (baza + overrides + custom), posortowane po ID. */
export function listAllWallEntries(): Array<[string, WallCatalogEntry]> {
  const o = getOverrides();
  const merged: Record<string, WallCatalogEntry> = { ...BASE_WALL_CATALOG };
  if (o) {
    for (const [id, entry] of Object.entries(o.walls)) merged[id] = entry;
  }
  return Object.entries(merged);
}

export function getCncDefaults(): CncDefaults {
  const o = getOverrides();
  return o?.cnc ?? BASE_CNC_DEFAULTS;
}

export function findComponent(id: string): CatalogComponent | undefined {
  const o = getOverrides();
  if (o?.components[id]) return o.components[id];
  return BASE_COMPONENT_CATALOG.find((c) => c.id === id);
}

export function listAllComponents(): CatalogComponent[] {
  const o = getOverrides();
  const map = new Map<string, CatalogComponent>();
  for (const c of BASE_COMPONENT_CATALOG) map.set(c.id, c);
  if (o) {
    for (const [id, comp] of Object.entries(o.components)) map.set(id, comp);
  }
  return Array.from(map.values());
}

export function getComponentsByKind(kind: ComponentKind): CatalogComponent[] {
  return listAllComponents().filter((c) => c.kind === kind);
}

export function getWallsByCategory(
  cat: WallCatalogEntry["category"]
): [WallType, WallCatalogEntry][] {
  return listAllWallEntries().filter(([, entry]) => entry.category === cat);
}

/** Czy typ istnieje w aktualnym katalogu (baza + overrides). */
export function wallTypeExists(type: string): boolean {
  const o = getOverrides();
  return Boolean(BASE_WALL_CATALOG[type] || o?.walls[type]);
}

// ---------------------------------------------------------------------------
// Katalog typów dachów (do kafelków w wizardzie)
// ---------------------------------------------------------------------------

export interface RoofCatalogEntry {
  type: RoofType;
  label: string;
  icon: string;
  description: string;
}

export const ROOF_CATALOG: RoofCatalogEntry[] = [
  { type: "flat",       label: "Dach płaski",        icon: "roof_flat",       description: "Kąt 0-5°, nowoczesny" },
  { type: "mono_pitch", label: "Dach jednospadowy",   icon: "roof_mono",       description: "Jeden spadek, kąt 5-15°" },
  { type: "gable",      label: "Dach dwuspadowy",     icon: "roof_gable",      description: "Klasyczny, kąt 20-45°" },
  { type: "hip",        label: "Dach kopertowy",      icon: "roof_hip",        description: "Cztery spadki" },
];

// ---------------------------------------------------------------------------
// Etykiety komponentów dla kafelków (jak w Wintergarten)
// ---------------------------------------------------------------------------

export const KIND_LABELS: Record<ComponentKind, string> = {
  window_fixed: "FEST",
  window_hs: "HS Dwuskrzydłowy",
  window_tilt: "Okno Uchylne",
  window_double: "Okno Dwuskrzydłowe",
  door: "Drzwi",
  door_hs: "Drzwi HS",
  glazing_fill: "Wypełnienie Sklejka",
};

export const KIND_ICONS: Record<ComponentKind, string> = {
  window_fixed: "□",
  window_hs: "⊟",
  window_tilt: "△",
  window_double: "⊞",
  door: "🚪",
  door_hs: "⊟",
  glazing_fill: "▨",
};
