// lib/types.ts — model domeny konfiguratora CLT
// Wszystko w mm. UI skaluje do cm/m przy wyświetlaniu.
// Model vertex-based: ściany przechowują absolutne współrzędne start/end.

export type Point = { x: number; y: number };

// ---------------------------------------------------------------------------
// Typy ścian z katalogu — definiują grubość i cenę
// ---------------------------------------------------------------------------

/**
 * Identyfikator pozycji katalogu CLT. Wbudowane wartości (CLT_120_EXT itd.)
 * to domyślne bazowe typy; użytkownik może dodawać własne w edytorze cennika,
 * dlatego typ jest otwarty (string).
 */
export type WallType = string;

/** Wbudowane typy dostępne jako domyślny podkład. */
export type BuiltinWallType =
  | "CLT_120_EXT"
  | "CLT_140_EXT"
  | "CLT_100_INT"
  | "CLT_80_PART"
  | "CLT_160_SLAB"
  | "CLT_200_SLAB"
  | "CLT_120_ROOF"
  | "CLT_160_ROOF";

export type WallCategory = "external" | "internal";

// ---------------------------------------------------------------------------
// Otwory (subprodukty wycięte ze ściany)
// ---------------------------------------------------------------------------

export type ComponentKind =
  | "window_fixed"
  | "window_hs"
  | "window_tilt"
  | "window_double"
  | "door"
  | "door_hs"
  | "glazing_fill";

export interface Opening {
  id: string;
  componentId: string;
  position: number;          // mm od początku ściany
  sillHeight: number;        // mm od podłogi
  customWidth?: number;      // mm — override katalogowej szerokości
  customHeight?: number;     // mm — override katalogowej wysokości
  manual: boolean;           // czy wymiar jest manualny (jak w Wintergarten)
}

export interface CatalogComponent {
  id: string;
  kind: ComponentKind;
  label: string;
  icon?: string;
  width: number;             // mm
  height: number;            // mm
  pricePerUnit: number;      // PLN netto
  glazingArea: number;       // m² szyby (do BoM)
  notes?: string;
}

// ---------------------------------------------------------------------------
// Ściana — vertex-based (absolutne współrzędne)
// ---------------------------------------------------------------------------

export interface Wall {
  id: string;
  type: WallType;
  category: WallCategory;
  label: string;
  start: Point;              // mm w układzie lokalnym budynku
  end: Point;                // mm w układzie lokalnym budynku
  height: number;            // mm (z kondygnacji)
  openings: Opening[];
}

// ---------------------------------------------------------------------------
// Kondygnacja (piętro)
// ---------------------------------------------------------------------------

export interface SlabCutout {
  id: string;
  label: string;
  kind: "stairwell" | "patio" | "custom";
  vertices: Point[];         // wielokąt w mm (absolutne)
  linkedStairId?: string;    // auto-cutout dla schodów
}

export interface SlabShape {
  mode: "outline" | "detached";
  vertices?: Point[];        // tylko gdy mode = "detached"
  cutouts: SlabCutout[];
}

export interface Floor {
  id: string;
  name: string;
  level: number;             // 0, 1, 2...
  height: number;            // mm — wysokość ściany na tej kondygnacji
  walls: Wall[];
  slabThickness: number;     // mm — grubość stropu CLT (0 dla parteru)
  slabShape: SlabShape;
}

// ---------------------------------------------------------------------------
// Dach
// ---------------------------------------------------------------------------

export type RoofType = "flat" | "gable" | "hip" | "mono_pitch";

export interface RoofAnomaly {
  id: string;
  type: "dormer" | "skylight" | "chimney" | "overhang";
  label: string;
  width: number;
  height: number;
  depth?: number;
}

export interface Roof {
  id: string;
  type: RoofType;
  pitch: number;
  overhang: number;
  thickness: number;
  anomalies: RoofAnomaly[];
}

// ---------------------------------------------------------------------------
// Domyślne ustawienia projektu
// ---------------------------------------------------------------------------

export interface ProjectDefaults {
  extWallType: WallType;
  intWallType: WallType;
  slabType: WallType;
  roofType: WallType;
  wallHeight: number;        // mm
}

// ---------------------------------------------------------------------------
// Trójkąty nad ścianami bocznymi (szczyt dachu)
// ---------------------------------------------------------------------------

export type GableWallOption = "fixed" | "tilt_window" | "glazing_fill";

export interface GableWall {
  id: string;
  side: "left" | "right";
  option: GableWallOption;
  openings: Opening[];
}

// ---------------------------------------------------------------------------
// Budynek — piętra, dach i schody w obrębie jednej bryły na działce
// ---------------------------------------------------------------------------

export interface Building {
  id: string;
  name: string;
  /** Przesunięcie układu lokalnego na planie działki (mm). */
  position: Point;
  floors: Floor[];
  roof: Roof | null;
  gableWalls: GableWall[];
  backWallEnabled: boolean;
  stairs: Stair[];
}

// ---------------------------------------------------------------------------
// Projekt — korzeń hierarchii
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  defaults: ProjectDefaults;
  buildings: Building[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Wynik BRE — kosztorys
// ---------------------------------------------------------------------------

export type BomCategory = "wall" | "slab" | "roof" | "component" | "labor" | "transport";

export interface BomLine {
  category: BomCategory;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface Quote {
  lines: BomLine[];
  totalVolumeCLT: number;
  subtotal: number;
  vat: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Schody
// ---------------------------------------------------------------------------

export type StairType = "straight" | "L" | "U";

export interface Stair {
  id: string;
  label: string;
  fromFloorId: string;
  toFloorId: string;
  type: StairType;
  origin: Point;             // lewy-górny bounding box biegu A w mm (układ lokalny budynku)
  rotation: number;          // deg — obrót biegu A w płaszczyźnie planu
  width: number;             // mm szerokość biegu
  treadDepth: number;        // mm głębokość stopnia
  stepCount: number;         // liczba stopni (bieg A)
  landingDepth?: number;     // dla L/U — głębokość spocznika
  flightBSteps?: number;     // dla L/U — liczba stopni biegu B
}

// ---------------------------------------------------------------------------
// View mode
// ---------------------------------------------------------------------------

export type ViewMode = "floorplan" | "roof" | "settings" | "schedule" | "catalog";
