// lib/store.ts — globalny stan konfiguratora CLT (Zustand) — vertex-based
"use client";

import { create } from "zustand";
import type {
  Building,
  Project, Floor, Wall, Opening, Roof, RoofAnomaly,
  WallType, WallCategory, ViewMode, ProjectDefaults, RoofType, GableWall, Point,
  SlabCutout, Stair,
} from "./types";
import { computeClosingWall, moveSharedVertex, splitWallAt, orderExternalPolygonVertices, stairFootprint } from "./geometry";
import type { CatalogComponent } from "./types";
import {
  __bindCatalogOverrides,
  BASE_CNC_DEFAULTS,
  BASE_COMPONENT_CATALOG,
  BASE_WALL_CATALOG,
  type CatalogOverrides,
  type CncDefaults,
  type WallCatalogEntry,
} from "./catalog";
import {
  createDefaultProject,
  createDefaultBuilding,
  findBuildingIdForFloor,
  duplicateBuildingStructure,
} from "./project-migrate";

function computeStairFootprintLocal(stair: Stair): Point[] {
  return stairFootprint(stair);
}

function getActiveBuilding(project: Project, activeBuildingId: string | null): Building | undefined {
  if (project.buildings.length === 0) return undefined;
  if (activeBuildingId) {
    return project.buildings.find((b) => b.id === activeBuildingId) ?? project.buildings[0];
  }
  return project.buildings[0];
}

function updateBuildingInProject(
  project: Project,
  buildingId: string,
  updater: (b: Building) => Building,
): Project {
  return {
    ...project,
    buildings: project.buildings.map((b) => (b.id === buildingId ? updater(b) : b)),
  };
}

function updateFloorInProject(project: Project, floorId: string, updater: (floor: Floor) => Floor): Project {
  const bid = findBuildingIdForFloor(project, floorId);
  if (!bid) return project;
  return updateBuildingInProject(project, bid, (b) => ({
    ...b,
    floors: b.floors.map((f) => (f.id === floorId ? updater(f) : f)),
  }));
}

function updateWallInFloor(floor: Floor, wallId: string, updater: (wall: Wall) => Wall): Floor {
  return { ...floor, walls: floor.walls.map((w) => (w.id === wallId ? updater(w) : w)) };
}

// ---------------------------------------------------------------------------
// Interfejs store'a
// ---------------------------------------------------------------------------

export type DrawTool = "select" | "draw";

export interface VisibilityState {
  walls: boolean;
  slabs: boolean;
  roof: boolean;
  floorHidden: Record<string, boolean>;
}

interface ConfiguratorState {
  project: Project;
  viewMode: ViewMode;
  activeBuildingId: string | null;
  activeFloorId: string | null;
  /** Wspólny indeks kondygnacji (Floor.level) dla planu sytuacyjnego. */
  sharedFloorLevel: number;
  sitePlanMode: boolean;
  selectedWallId: string | null;
  theme: "light" | "dark";
  show3D: boolean;
  drawTool: DrawTool;
  /** Kategoria ściany rysowanej ołówkiem (przed pierwszym kliknięciem wybierz w pasku). */
  drawWallCategory: WallCategory;
  showShortcuts: boolean;
  showDxfImport: boolean;
  visibility: VisibilityState;

  undoStack: Project[];
  redoStack: Project[];

  setViewMode: (mode: ViewMode) => void;
  toggle3D: () => void;
  setDrawTool: (tool: DrawTool) => void;
  setDrawWallCategory: (category: WallCategory) => void;
  setShowShortcuts: (v: boolean) => void;
  setShowDxfImport: (v: boolean) => void;
  setVisibility: (updates: Partial<Omit<VisibilityState, "floorHidden">>) => void;
  toggleFloorVisible: (floorId: string) => void;

  setProjectName: (name: string) => void;
  setDefaults: (defaults: Partial<ProjectDefaults>) => void;
  setBackWallEnabled: (enabled: boolean) => void;
  resetProject: () => void;

  setActiveBuilding: (id: string | null) => void;
  addBuilding: () => void;
  removeBuilding: (id: string) => void;
  duplicateBuilding: (id: string) => void;
  renameBuilding: (id: string, name: string) => void;
  setBuildingPosition: (id: string, position: Point) => void;
  setSitePlanMode: (v: boolean) => void;
  setSharedFloorLevel: (level: number) => void;

  setActiveFloor: (id: string | null) => void;
  addFloor: (name?: string) => void;
  duplicateFloor: (sourceFloorId: string) => void;
  removeFloor: (id: string) => void;
  updateFloor: (id: string, updates: Partial<Pick<Floor, "name" | "height" | "slabThickness">>) => void;

  selectWall: (id: string | null) => void;
  addWall: (floorId: string, wall: Omit<Wall, "id">) => void;
  updateWall: (floorId: string, wallId: string, updates: Partial<Pick<Wall, "type" | "label" | "height" | "category" | "start" | "end">>) => void;
  removeWall: (floorId: string, wallId: string) => void;
  splitWall: (floorId: string, wallId: string, at: Point) => Point | null;
  closeOutline: (floorId: string) => void;
  setFloorWalls: (floorId: string, walls: Omit<Wall, "id">[]) => void;
  applyPreset: (floorId: string, preset: "rect" | "lshape" | "lshape_mezzanine") => void;
  moveVertex: (floorId: string, targetPoint: Point, newPoint: Point) => void;
  importDxfWalls: (floorId: string, walls: Omit<Wall, "id">[]) => void;

  addOpening: (floorId: string, wallId: string, opening: Omit<Opening, "id">) => void;
  updateOpening: (floorId: string, wallId: string, openingId: string, updates: Partial<Opening>) => void;
  removeOpening: (floorId: string, wallId: string, openingId: string) => void;

  setRoof: (roof: Omit<Roof, "id" | "anomalies"> | null) => void;
  updateRoof: (updates: Partial<Pick<Roof, "type" | "pitch" | "overhang" | "thickness">>) => void;
  addRoofAnomaly: (anomaly: Omit<RoofAnomaly, "id">) => void;
  removeRoofAnomaly: (id: string) => void;
  updateGableWall: (side: "left" | "right", updates: Partial<GableWall>) => void;

  // --- Strop hybrydowy ---
  detachSlab: (floorId: string) => void;
  reattachSlab: (floorId: string) => void;
  addSlabCutout: (floorId: string, cutout: Omit<SlabCutout, "id">) => string;
  updateSlabCutout: (floorId: string, cutoutId: string, updates: Partial<SlabCutout>) => void;
  removeSlabCutout: (floorId: string, cutoutId: string) => void;
  moveSlabVertex: (floorId: string, idx: number, newPoint: Point) => void;
  slabEdit: boolean;
  setSlabEdit: (v: boolean) => void;

  // --- Schody ---
  addStair: (stair: Omit<Stair, "id">) => string;
  updateStair: (stairId: string, updates: Partial<Stair>) => void;
  removeStair: (stairId: string) => void;
  selectedStairId: string | null;
  selectStair: (id: string | null) => void;

  // --- Cennik (runtime overrides) ---
  catalogOverrides: CatalogOverrides;
  updateWallCatalog: (type: string, patch: Partial<WallCatalogEntry>) => void;
  addWallCatalogEntry: (type: string, entry: WallCatalogEntry) => void;
  removeWallCatalogEntry: (type: string) => void;
  updateComponentCatalog: (id: string, patch: Partial<CatalogComponent>) => void;
  addComponentCatalog: (component: CatalogComponent) => void;
  removeComponentCatalog: (id: string) => void;
  updateCncDefaults: (patch: Partial<CncDefaults>) => void;
  resetCatalog: () => void;

  pushUndo: () => void;
  undo: () => void;
  redo: () => void;

  toggleTheme: () => void;
}

// ---------------------------------------------------------------------------
// Preset builders (vertex-based)
// ---------------------------------------------------------------------------

function rectWalls(ext: WallType, h: number, w = 10000, d = 8000): Omit<Wall, "id">[] {
  return [
    { type: ext, category: "external", label: "Front", start: { x: 0, y: 0 }, end: { x: w, y: 0 }, height: h, openings: [] },
    { type: ext, category: "external", label: "Lewa", start: { x: w, y: 0 }, end: { x: w, y: d }, height: h, openings: [] },
    { type: ext, category: "external", label: "Tylna", start: { x: w, y: d }, end: { x: 0, y: d }, height: h, openings: [] },
    { type: ext, category: "external", label: "Prawa", start: { x: 0, y: d }, end: { x: 0, y: 0 }, height: h, openings: [] },
  ];
}

function lshapeWalls(ext: WallType, h: number): Omit<Wall, "id">[] {
  const pts: Point[] = [
    { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 },
    { x: 5000, y: 4000 }, { x: 5000, y: 8000 }, { x: 0, y: 8000 },
  ];
  return pts.map((p, i) => ({
    type: ext, category: "external" as const,
    label: `Ściana ${i + 1}`,
    start: p,
    end: pts[(i + 1) % pts.length],
    height: h, openings: [],
  }));
}

function lshapeMezzanineWalls(ext: WallType, h: number): Omit<Wall, "id">[] {
  const pts: Point[] = [
    { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 4000 },
    { x: 8000, y: 4000 }, { x: 8000, y: 8000 }, { x: 0, y: 8000 },
  ];
  return pts.map((p, i) => ({
    type: ext, category: "external" as const,
    label: `Ściana ${i + 1}`,
    start: p,
    end: pts[(i + 1) % pts.length],
    height: h, openings: [],
  }));
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const MAX_UNDO = 50;

function createInitialCatalogOverrides(): CatalogOverrides {
  return {
    walls: {},
    customWallIds: [],
    components: {},
    customComponentIds: [],
    cnc: { ...BASE_CNC_DEFAULTS },
  };
}

export const useStore = create<ConfiguratorState>((set, get) => ({
  project: createDefaultProject(),
  viewMode: "floorplan",
  activeBuildingId: null,
  activeFloorId: null,
  sharedFloorLevel: 0,
  sitePlanMode: true,
  selectedWallId: null,
  theme: "light",
  show3D: false,
  drawTool: "select",
  drawWallCategory: "external",
  showShortcuts: false,
  showDxfImport: false,
  visibility: { walls: true, slabs: true, roof: true, floorHidden: {} },
  slabEdit: false,
  selectedStairId: null,

  catalogOverrides: createInitialCatalogOverrides(),

  undoStack: [],
  redoStack: [],

  setViewMode: (mode) => set({ viewMode: mode }),
  toggle3D: () => set((s) => ({ show3D: !s.show3D })),
  setDrawTool: (tool) => set({ drawTool: tool }),
  setDrawWallCategory: (category) => set({ drawWallCategory: category }),
  setShowShortcuts: (v) => set({ showShortcuts: v }),
  setShowDxfImport: (v) => set({ showDxfImport: v }),
  setVisibility: (updates) =>
    set((s) => ({ visibility: { ...s.visibility, ...updates } })),
  toggleFloorVisible: (floorId) =>
    set((s) => ({
      visibility: {
        ...s.visibility,
        floorHidden: {
          ...s.visibility.floorHidden,
          [floorId]: !s.visibility.floorHidden[floorId],
        },
      },
    })),

  setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),
  setDefaults: (defaults) => set((s) => ({
    project: { ...s.project, defaults: { ...s.project.defaults, ...defaults } },
  })),
  setBackWallEnabled: (enabled) => set((s) => {
    const b = getActiveBuilding(s.project, s.activeBuildingId);
    if (!b) return s;
    return {
      project: updateBuildingInProject(s.project, b.id, (x) => ({ ...x, backWallEnabled: enabled })),
    };
  }),
  resetProject: () => set({
    project: createDefaultProject(),
    viewMode: "floorplan",
    activeBuildingId: null,
    activeFloorId: null,
    sharedFloorLevel: 0,
    sitePlanMode: true,
    selectedWallId: null,
    drawTool: "select" as DrawTool,
    drawWallCategory: "external",
    visibility: { walls: true, slabs: true, roof: true, floorHidden: {} },
    slabEdit: false,
    selectedStairId: null,
    catalogOverrides: createInitialCatalogOverrides(),
    undoStack: [],
    redoStack: [],
  }),

  setActiveBuilding: (id) => set((s) => {
    if (id === null) return { activeBuildingId: null };
    const b = s.project.buildings.find((x) => x.id === id);
    if (!b) return s;
    const match = b.floors.find((f) => f.level === s.sharedFloorLevel);
    const floor = match ?? b.floors[0];
    return {
      activeBuildingId: id,
      activeFloorId: floor?.id ?? null,
      sharedFloorLevel: floor?.level ?? s.sharedFloorLevel,
    };
  }),

  addBuilding: () => set((s) => {
    const idx = s.project.buildings.length;
    const nb = createDefaultBuilding(`Budynek ${idx + 1}`, { x: 15000 * idx, y: 0 });
    return {
      project: { ...s.project, buildings: [...s.project.buildings, nb] },
      activeBuildingId: nb.id,
      activeFloorId: nb.floors[0]?.id ?? null,
      sharedFloorLevel: 0,
    };
  }),

  removeBuilding: (id) => set((s) => {
    if (s.project.buildings.length <= 1) return s;
    const rest = s.project.buildings.filter((b) => b.id !== id);
    const removed = s.project.buildings.find((b) => b.id === id);
    const nextActive = s.activeBuildingId === id
      ? rest[0]?.id ?? null
      : s.activeBuildingId;
    const nb = getActiveBuilding({ ...s.project, buildings: rest }, nextActive);
    const floor = nb?.floors.find((f) => f.level === s.sharedFloorLevel) ?? nb?.floors[0];
    return {
      project: { ...s.project, buildings: rest },
      activeBuildingId: nextActive,
      activeFloorId: s.activeBuildingId === id ? (floor?.id ?? null) : s.activeFloorId,
      selectedWallId: removed?.floors.some((f) => f.walls.some((w) => w.id === s.selectedWallId)) ? null : s.selectedWallId,
      selectedStairId: removed?.stairs.some((st) => st.id === s.selectedStairId) ? null : s.selectedStairId,
    };
  }),

  duplicateBuilding: (buildingId) => set((s) => {
    const source = s.project.buildings.find((b) => b.id === buildingId);
    if (!source) return s;
    const nb = duplicateBuildingStructure(source);
    return {
      project: { ...s.project, buildings: [...s.project.buildings, nb] },
      activeBuildingId: nb.id,
      activeFloorId: nb.floors[0]?.id ?? null,
      sharedFloorLevel: nb.floors[0]?.level ?? 0,
    };
  }),

  renameBuilding: (id, name) => set((s) => ({
    project: updateBuildingInProject(s.project, id, (b) => ({ ...b, name })),
  })),

  setBuildingPosition: (id, position) => set((s) => ({
    project: updateBuildingInProject(s.project, id, (b) => ({ ...b, position: { ...position } })),
  })),

  setSitePlanMode: (v) => set({ sitePlanMode: v }),
  setSharedFloorLevel: (level) => set({ sharedFloorLevel: level }),

  // --- Kondygnacje ---
  setActiveFloor: (id) => set((s) => {
    if (id === null) return { activeFloorId: null };
    const bid = findBuildingIdForFloor(s.project, id);
    const building = bid ? s.project.buildings.find((b) => b.id === bid) : undefined;
    const floor = building?.floors.find((f) => f.id === id);
    return {
      activeFloorId: id,
      activeBuildingId: bid ?? s.activeBuildingId,
      sharedFloorLevel: floor?.level ?? s.sharedFloorLevel,
    };
  }),

  addFloor: (name) => set((s) => {
    const b = getActiveBuilding(s.project, s.activeBuildingId);
    if (!b) return s;
    const level = b.floors.length;
    const newFloor: Floor = {
      id: crypto.randomUUID(),
      name: name ?? `Piętro ${level}`,
      level,
      height: s.project.defaults.wallHeight,
      walls: [],
      slabThickness: s.project.defaults.slabType === "CLT_200_SLAB" ? 200 : 160,
      slabShape: { mode: "outline", cutouts: [] },
    };
    return {
      project: updateBuildingInProject(s.project, b.id, (x) => ({
        ...x,
        floors: [...x.floors, newFloor],
      })),
      activeFloorId: newFloor.id,
      sharedFloorLevel: level,
    };
  }),

  duplicateFloor: (sourceFloorId) => set((s) => {
    const bid = findBuildingIdForFloor(s.project, sourceFloorId);
    if (!bid) return s;
    const building = s.project.buildings.find((b) => b.id === bid);
    if (!building) return s;
    const source = building.floors.find((f) => f.id === sourceFloorId);
    if (!source) return s;
    const level = building.floors.length;
    const newFloor: Floor = {
      ...structuredClone(source),
      id: crypto.randomUUID(),
      name: `Piętro ${level}`,
      level,
      slabThickness: s.project.defaults.slabType === "CLT_200_SLAB" ? 200 : 160,
      slabShape: {
        mode: source.slabShape?.mode ?? "outline",
        vertices: source.slabShape?.vertices
          ? source.slabShape.vertices.map((v) => ({ ...v }))
          : undefined,
        cutouts: (source.slabShape?.cutouts ?? []).map((c) => ({
          ...c,
          id: crypto.randomUUID(),
          vertices: c.vertices.map((v) => ({ ...v })),
          linkedStairId: undefined,
        })),
      },
      walls: source.walls.map((w) => ({
        ...w,
        id: crypto.randomUUID(),
        openings: w.openings.map((o) => ({ ...o, id: crypto.randomUUID() })),
      })),
    };
    return {
      project: updateBuildingInProject(s.project, bid, (x) => ({
        ...x,
        floors: [...x.floors, newFloor],
      })),
      activeFloorId: newFloor.id,
      sharedFloorLevel: level,
    };
  }),

  removeFloor: (id) => set((s) => {
    const bid = findBuildingIdForFloor(s.project, id);
    if (!bid) return s;
    const building = s.project.buildings.find((b) => b.id === bid);
    if (!building || building.floors.length <= 1) return s;

    const stairIdsToRemove = new Set(
      building.stairs.filter((st) => st.fromFloorId === id || st.toFloorId === id).map((st) => st.id),
    );
    const newStairs = building.stairs.filter((st) => !stairIdsToRemove.has(st.id));

    let proj: Project = updateBuildingInProject(s.project, bid, (b) => ({
      ...b,
      floors: b.floors.filter((f) => f.id !== id).map((f, i) => ({ ...f, level: i })),
      stairs: newStairs,
    }));

    const remainingFloorIds = building.floors.filter((f) => f.id !== id).map((f) => f.id);
    for (const fid of remainingFloorIds) {
      proj = updateFloorInProject(proj, fid, (f) => ({
        ...f,
        slabShape: {
          ...f.slabShape,
          cutouts: f.slabShape.cutouts.filter(
            (c) => !c.linkedStairId || !stairIdsToRemove.has(c.linkedStairId),
          ),
        },
      }));
    }

    return {
      project: proj,
      activeFloorId: s.activeFloorId === id ? null : s.activeFloorId,
      selectedStairId: s.selectedStairId && stairIdsToRemove.has(s.selectedStairId) ? null : s.selectedStairId,
    };
  }),

  updateFloor: (id, updates) => set((s) => ({
    project: updateFloorInProject(s.project, id, (f) => ({ ...f, ...updates })),
  })),

  // --- Ściany ---
  selectWall: (id) => set({ selectedWallId: id }),

  addWall: (floorId, wall) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) => ({
      ...f,
      walls: [...f.walls, { ...wall, id: crypto.randomUUID() }],
    })),
  })),

  updateWall: (floorId, wallId, updates) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) =>
      updateWallInFloor(f, wallId, (w) => ({ ...w, ...updates })),
    ),
  })),

  removeWall: (floorId, wallId) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) => ({
      ...f, walls: f.walls.filter((w) => w.id !== wallId),
    })),
    selectedWallId: s.selectedWallId === wallId ? null : s.selectedWallId,
  })),

  splitWall: (floorId, wallId, at) => {
    get().pushUndo();
    let splitPoint: Point | null = null;
    set((s) => {
      const bid = findBuildingIdForFloor(s.project, floorId);
      if (!bid) return s;
      const building = s.project.buildings.find((b) => b.id === bid);
      const floor = building?.floors.find((f) => f.id === floorId);
      if (!floor) return s;
      const wall = floor.walls.find((w) => w.id === wallId);
      if (!wall) return s;
      const pair = splitWallAt(wall, at);
      if (!pair) return s;
      const [a, b] = pair;
      splitPoint = { x: at.x, y: at.y };
      const idx = floor.walls.findIndex((w) => w.id === wallId);
      const newWalls: Wall[] = [
        ...floor.walls.slice(0, idx),
        { ...a, id: crypto.randomUUID() },
        { ...b, id: crypto.randomUUID() },
        ...floor.walls.slice(idx + 1),
      ];
      return {
        project: updateFloorInProject(s.project, floorId, (f) => ({
          ...f,
          walls: newWalls,
        })),
        selectedWallId: s.selectedWallId === wallId ? null : s.selectedWallId,
      };
    });
    return splitPoint;
  },

  closeOutline: (floorId) => set((s) => {
    const bid = findBuildingIdForFloor(s.project, floorId);
    if (!bid) return s;
    const building = s.project.buildings.find((b) => b.id === bid);
    const floor = building?.floors.find((f) => f.id === floorId);
    if (!floor) return s;
    const extWalls = floor.walls.filter((w) => w.category === "external");
    const closing = computeClosingWall(extWalls);
    if (!closing) return s;

    const newWall: Wall = {
      id: crypto.randomUUID(),
      type: s.project.defaults.extWallType,
      category: "external",
      label: `Ściana ${extWalls.length + 1}`,
      start: closing.start,
      end: closing.end,
      height: floor.height,
      openings: [],
    };

    return {
      project: updateFloorInProject(s.project, floorId, (f) => ({
        ...f, walls: [...f.walls, newWall],
      })),
    };
  }),

  setFloorWalls: (floorId, walls) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) => ({
      ...f, walls: walls.map((w) => ({ ...w, id: crypto.randomUUID() })),
    })),
    selectedWallId: null,
  })),

  applyPreset: (floorId, preset) => set((s) => {
    get().pushUndo();
    const bid = findBuildingIdForFloor(s.project, floorId);
    if (!bid) return s;
    const building = s.project.buildings.find((b) => b.id === bid);
    const floor = building?.floors.find((f) => f.id === floorId);
    if (!floor) return s;
    const h = floor.height;
    const ext = s.project.defaults.extWallType;

    const walls = preset === "rect" ? rectWalls(ext, h)
      : preset === "lshape" ? lshapeWalls(ext, h)
      : lshapeMezzanineWalls(ext, h);

    return {
      project: updateFloorInProject(s.project, floorId, (f) => ({
        ...f, walls: walls.map((w) => ({ ...w, id: crypto.randomUUID() })),
      })),
      selectedWallId: null,
      drawTool: "select" as DrawTool,
    };
  }),

  moveVertex: (floorId, targetPoint, newPoint) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) => ({
      ...f, walls: moveSharedVertex(f.walls, targetPoint, newPoint),
    })),
  })),

  importDxfWalls: (floorId, walls) => set((s) => {
    get().pushUndo();
    return {
      project: updateFloorInProject(s.project, floorId, (f) => ({
        ...f,
        walls: [
          ...f.walls,
          ...walls.map((w) => ({ ...w, id: crypto.randomUUID() })),
        ],
      })),
    };
  }),

  // --- Otwory ---
  addOpening: (floorId, wallId, opening) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) =>
      updateWallInFloor(f, wallId, (w) => ({
        ...w, openings: [...w.openings, { ...opening, id: crypto.randomUUID() }],
      })),
    ),
  })),

  updateOpening: (floorId, wallId, openingId, updates) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) =>
      updateWallInFloor(f, wallId, (w) => ({
        ...w, openings: w.openings.map((o) => (o.id === openingId ? { ...o, ...updates } : o)),
      })),
    ),
  })),

  removeOpening: (floorId, wallId, openingId) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) =>
      updateWallInFloor(f, wallId, (w) => ({
        ...w, openings: w.openings.filter((o) => o.id !== openingId),
      })),
    ),
  })),

  // --- Dach ---
  setRoof: (roofData) => set((s) => {
    const b = getActiveBuilding(s.project, s.activeBuildingId);
    if (!b) return s;
    return {
      project: updateBuildingInProject(s.project, b.id, (x) => ({
        ...x,
        roof: roofData ? { ...roofData, id: crypto.randomUUID(), anomalies: [] } : null,
      })),
    };
  }),

  updateRoof: (updates) => set((s) => {
    const b = getActiveBuilding(s.project, s.activeBuildingId);
    if (!b?.roof) return s;
    return {
      project: updateBuildingInProject(s.project, b.id, (x) => ({
        ...x,
        roof: x.roof ? { ...x.roof, ...updates } : null,
      })),
    };
  }),

  addRoofAnomaly: (anomaly) => set((s) => {
    const b = getActiveBuilding(s.project, s.activeBuildingId);
    if (!b?.roof) return s;
    return {
      project: updateBuildingInProject(s.project, b.id, (x) => ({
        ...x,
        roof: x.roof
          ? { ...x.roof, anomalies: [...x.roof.anomalies, { ...anomaly, id: crypto.randomUUID() }] }
          : null,
      })),
    };
  }),

  removeRoofAnomaly: (id) => set((s) => {
    const b = getActiveBuilding(s.project, s.activeBuildingId);
    if (!b?.roof) return s;
    return {
      project: updateBuildingInProject(s.project, b.id, (x) => ({
        ...x,
        roof: x.roof
          ? { ...x.roof, anomalies: x.roof.anomalies.filter((a) => a.id !== id) }
          : null,
      })),
    };
  }),

  updateGableWall: (side, updates) => set((s) => {
    const b = getActiveBuilding(s.project, s.activeBuildingId);
    if (!b) return s;
    return {
      project: updateBuildingInProject(s.project, b.id, (x) => ({
        ...x,
        gableWalls: x.gableWalls.map((g) => (g.side === side ? { ...g, ...updates } : g)),
      })),
    };
  }),

  // --- Strop hybrydowy ---
  setSlabEdit: (v) => set({ slabEdit: v }),

  detachSlab: (floorId) => {
    get().pushUndo();
    set((s) => {
      const bid = findBuildingIdForFloor(s.project, floorId);
      if (!bid) return s;
      const building = s.project.buildings.find((b) => b.id === bid);
      const floor = building?.floors.find((f) => f.id === floorId);
      if (!floor) return s;
      const verts =
        floor.slabShape.vertices ??
        orderExternalPolygonVertices(floor.walls) ??
        [];
      return {
        project: updateFloorInProject(s.project, floorId, (f) => ({
          ...f,
          slabShape: {
            mode: "detached",
            vertices: verts.map((v) => ({ ...v })),
            cutouts: f.slabShape.cutouts,
          },
        })),
      };
    });
  },

  reattachSlab: (floorId) => {
    get().pushUndo();
    set((s) => ({
      project: updateFloorInProject(s.project, floorId, (f) => ({
        ...f,
        slabShape: {
          mode: "outline",
          vertices: undefined,
          cutouts: f.slabShape.cutouts,
        },
      })),
    }));
  },

  addSlabCutout: (floorId, cutout) => {
    get().pushUndo();
    const id = crypto.randomUUID();
    set((s) => ({
      project: updateFloorInProject(s.project, floorId, (f) => ({
        ...f,
        slabShape: {
          ...f.slabShape,
          cutouts: [...f.slabShape.cutouts, { ...cutout, id }],
        },
      })),
    }));
    return id;
  },

  updateSlabCutout: (floorId, cutoutId, updates) => {
    set((s) => ({
      project: updateFloorInProject(s.project, floorId, (f) => ({
        ...f,
        slabShape: {
          ...f.slabShape,
          cutouts: f.slabShape.cutouts.map((c) =>
            c.id === cutoutId ? { ...c, ...updates } : c,
          ),
        },
      })),
    }));
  },

  removeSlabCutout: (floorId, cutoutId) => {
    get().pushUndo();
    set((s) => ({
      project: updateFloorInProject(s.project, floorId, (f) => ({
        ...f,
        slabShape: {
          ...f.slabShape,
          cutouts: f.slabShape.cutouts.filter((c) => c.id !== cutoutId),
        },
      })),
    }));
  },

  moveSlabVertex: (floorId, idx, newPoint) => {
    set((s) => {
      const bid = findBuildingIdForFloor(s.project, floorId);
      if (!bid) return s;
      const building = s.project.buildings.find((b) => b.id === bid);
      const floor = building?.floors.find((f) => f.id === floorId);
      if (!floor || floor.slabShape.mode !== "detached" || !floor.slabShape.vertices) return s;
      const verts = floor.slabShape.vertices.map((v, i) =>
        i === idx ? { ...newPoint } : v,
      );
      return {
        project: updateFloorInProject(s.project, floorId, (f) => ({
          ...f,
          slabShape: { ...f.slabShape, vertices: verts },
        })),
      };
    });
  },

  // --- Schody ---
  addStair: (stair) => {
    get().pushUndo();
    const id = crypto.randomUUID();
    set((s) => {
      const b = getActiveBuilding(s.project, s.activeBuildingId);
      if (!b) return s;
      let project: Project = updateBuildingInProject(s.project, b.id, (x) => ({
        ...x,
        stairs: [...x.stairs, { ...stair, id }],
      }));
      const toFloor = b.floors.find((f) => f.id === stair.toFloorId);
      if (toFloor) {
        const footprint = computeStairFootprintLocal({ ...stair, id });
        project = updateFloorInProject(project, toFloor.id, (f) => ({
          ...f,
          slabShape: {
            ...f.slabShape,
            cutouts: [
              ...f.slabShape.cutouts,
              {
                id: crypto.randomUUID(),
                label: stair.label || "Klatka schodowa",
                kind: "stairwell",
                vertices: footprint,
                linkedStairId: id,
              },
            ],
          },
        }));
      }
      return { project };
    });
    return id;
  },

  updateStair: (stairId, updates) => {
    set((s) => {
      const building = s.project.buildings.find((b) => b.stairs.some((st) => st.id === stairId));
      if (!building) return s;
      const old = building.stairs.find((st) => st.id === stairId);
      if (!old) return s;
      const merged: Stair = { ...old, ...updates };
      let project: Project = updateBuildingInProject(s.project, building.id, (b) => ({
        ...b,
        stairs: b.stairs.map((st) => (st.id === stairId ? merged : st)),
      }));
      const footprint = computeStairFootprintLocal(merged);
      for (const f of building.floors) {
        const hasLinked = f.slabShape.cutouts.some((c) => c.linkedStairId === stairId);
        if (!hasLinked) continue;
        const keepInThisFloor = f.id === merged.toFloorId;
        project = updateFloorInProject(project, f.id, (fl) => ({
          ...fl,
          slabShape: {
            ...fl.slabShape,
            cutouts: fl.slabShape.cutouts
              .filter((c) => (c.linkedStairId === stairId ? keepInThisFloor : true))
              .map((c) =>
                c.linkedStairId === stairId && keepInThisFloor
                  ? { ...c, vertices: footprint, label: merged.label }
                  : c,
              ),
          },
        }));
      }
      const newToFloor = building.floors.find((f) => f.id === merged.toFloorId);
      if (
        newToFloor &&
        !newToFloor.slabShape.cutouts.some((c) => c.linkedStairId === stairId)
      ) {
        project = updateFloorInProject(project, newToFloor.id, (fl) => ({
          ...fl,
          slabShape: {
            ...fl.slabShape,
            cutouts: [
              ...fl.slabShape.cutouts,
              {
                id: crypto.randomUUID(),
                label: merged.label || "Klatka schodowa",
                kind: "stairwell",
                vertices: footprint,
                linkedStairId: stairId,
              },
            ],
          },
        }));
      }
      return { project };
    });
  },

  removeStair: (stairId) => {
    get().pushUndo();
    set((s) => {
      const building = s.project.buildings.find((b) => b.stairs.some((st) => st.id === stairId));
      if (!building) return s;
      let project: Project = updateBuildingInProject(s.project, building.id, (b) => ({
        ...b,
        stairs: b.stairs.filter((st) => st.id !== stairId),
      }));
      for (const f of building.floors) {
        if (!f.slabShape.cutouts.some((c) => c.linkedStairId === stairId)) continue;
        project = updateFloorInProject(project, f.id, (fl) => ({
          ...fl,
          slabShape: {
            ...fl.slabShape,
            cutouts: fl.slabShape.cutouts.filter((c) => c.linkedStairId !== stairId),
          },
        }));
      }
      return {
        project,
        selectedStairId: s.selectedStairId === stairId ? null : s.selectedStairId,
      };
    });
  },

  selectStair: (id) => set({ selectedStairId: id }),

  // --- Cennik (override'y w pamięci) ---
  updateWallCatalog: (type, patch) => set((s) => {
    const existing = s.catalogOverrides.walls[type];
    if (!existing) {
      const baseEntry = BASE_WALL_CATALOG[type];
      if (!baseEntry) return s;
      return {
        catalogOverrides: {
          ...s.catalogOverrides,
          walls: { ...s.catalogOverrides.walls, [type]: { ...baseEntry, ...patch } },
        },
      };
    }
    return {
      catalogOverrides: {
        ...s.catalogOverrides,
        walls: { ...s.catalogOverrides.walls, [type]: { ...existing, ...patch } },
      },
    };
  }),
  addWallCatalogEntry: (type, entry) => set((s) => ({
    catalogOverrides: {
      ...s.catalogOverrides,
      walls: { ...s.catalogOverrides.walls, [type]: { ...entry } },
      customWallIds: s.catalogOverrides.customWallIds.includes(type)
        ? s.catalogOverrides.customWallIds
        : [...s.catalogOverrides.customWallIds, type],
    },
  })),
  removeWallCatalogEntry: (type) => set((s) => {
    const { [type]: _removed, ...rest } = s.catalogOverrides.walls;
    return {
      catalogOverrides: {
        ...s.catalogOverrides,
        walls: rest,
        customWallIds: s.catalogOverrides.customWallIds.filter((id) => id !== type),
      },
    };
  }),
  updateComponentCatalog: (id, patch) => set((s) => {
    const existing = s.catalogOverrides.components[id];
    if (!existing) {
      const baseComp = BASE_COMPONENT_CATALOG.find((c) => c.id === id);
      if (!baseComp) return s;
      return {
        catalogOverrides: {
          ...s.catalogOverrides,
          components: {
            ...s.catalogOverrides.components,
            [id]: { ...baseComp, ...patch } as CatalogComponent,
          },
        },
      };
    }
    return {
      catalogOverrides: {
        ...s.catalogOverrides,
        components: {
          ...s.catalogOverrides.components,
          [id]: { ...existing, ...patch } as CatalogComponent,
        },
      },
    };
  }),
  addComponentCatalog: (component) => set((s) => ({
    catalogOverrides: {
      ...s.catalogOverrides,
      components: { ...s.catalogOverrides.components, [component.id]: { ...component } },
      customComponentIds: s.catalogOverrides.customComponentIds.includes(component.id)
        ? s.catalogOverrides.customComponentIds
        : [...s.catalogOverrides.customComponentIds, component.id],
    },
  })),
  removeComponentCatalog: (id) => set((s) => {
    const { [id]: _removed, ...rest } = s.catalogOverrides.components;
    return {
      catalogOverrides: {
        ...s.catalogOverrides,
        components: rest,
        customComponentIds: s.catalogOverrides.customComponentIds.filter((x) => x !== id),
      },
    };
  }),
  updateCncDefaults: (patch) => set((s) => ({
    catalogOverrides: {
      ...s.catalogOverrides,
      cnc: { ...s.catalogOverrides.cnc, ...patch },
    },
  })),
  resetCatalog: () => set({ catalogOverrides: createInitialCatalogOverrides() }),

  // --- Undo/Redo ---
  pushUndo: () => set((s) => ({
    undoStack: [...s.undoStack.slice(-MAX_UNDO + 1), structuredClone(s.project)],
    redoStack: [],
  })),

  undo: () => set((s) => {
    if (s.undoStack.length === 0) return s;
    const prev = s.undoStack[s.undoStack.length - 1];
    return {
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, structuredClone(s.project)],
      project: prev,
    };
  }),

  redo: () => set((s) => {
    if (s.redoStack.length === 0) return s;
    const next = s.redoStack[s.redoStack.length - 1];
    return {
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, structuredClone(s.project)],
      project: next,
    };
  }),

  toggleTheme: () => set((s) => ({ theme: s.theme === "light" ? "dark" : "light" })),
}));

// ---------------------------------------------------------------------------
// Selektory aktywnego budynku / piętra
// ---------------------------------------------------------------------------

export function useActiveBuilding(): Building | undefined {
  const project = useStore((s) => s.project);
  const activeBuildingId = useStore((s) => s.activeBuildingId);
  return getActiveBuilding(project, activeBuildingId);
}

export function useActiveFloor(): Floor | undefined {
  const project = useStore((s) => s.project);
  const activeFloorId = useStore((s) => s.activeFloorId);
  const activeBuildingId = useStore((s) => s.activeBuildingId);
  const b = getActiveBuilding(project, activeBuildingId);
  const floors = b?.floors ?? [];
  if (activeFloorId) return floors.find((f) => f.id === activeFloorId);
  return floors[0];
}

// ---------------------------------------------------------------------------
// Bind katalogu runtime: `lib/catalog.ts` czyta override'y z tego store'a.
// ---------------------------------------------------------------------------
__bindCatalogOverrides(() => useStore.getState().catalogOverrides);
