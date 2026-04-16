// lib/store.ts — globalny stan konfiguratora CLT (Zustand) — vertex-based
"use client";

import { create } from "zustand";
import type {
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

function computeStairFootprintLocal(stair: Stair): Point[] {
  return stairFootprint(stair);
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
  activeFloorId: string | null;
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
// Default project factory
// ---------------------------------------------------------------------------

function createDefaultProject(): Project {
  const parterId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    name: "Nowy projekt CLT",
    defaults: {
      extWallType: "CLT_120_EXT",
      intWallType: "CLT_100_INT",
      slabType: "CLT_160_SLAB",
      roofType: "CLT_120_ROOF",
      wallHeight: 2800,
    },
    floors: [
      {
        id: parterId,
        name: "Parter",
        level: 0,
        height: 2800,
        walls: [
          { id: crypto.randomUUID(), type: "CLT_120_EXT", category: "external", label: "Front", start: { x: 0, y: 0 }, end: { x: 10000, y: 0 }, height: 2800, openings: [] },
          { id: crypto.randomUUID(), type: "CLT_120_EXT", category: "external", label: "Lewa", start: { x: 10000, y: 0 }, end: { x: 10000, y: 6000 }, height: 2800, openings: [] },
          { id: crypto.randomUUID(), type: "CLT_120_EXT", category: "external", label: "Tylna", start: { x: 10000, y: 6000 }, end: { x: 0, y: 6000 }, height: 2800, openings: [] },
          { id: crypto.randomUUID(), type: "CLT_120_EXT", category: "external", label: "Prawa", start: { x: 0, y: 6000 }, end: { x: 0, y: 0 }, height: 2800, openings: [] },
        ],
        slabThickness: 0,
        slabShape: { mode: "outline", cutouts: [] },
      },
    ],
    roof: null,
    gableWalls: [
      { id: crypto.randomUUID(), side: "left", option: "fixed", openings: [] },
      { id: crypto.randomUUID(), side: "right", option: "fixed", openings: [] },
    ],
    backWallEnabled: true,
    stairs: [],
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Immutable update helpers
// ---------------------------------------------------------------------------

function updateFloorInProject(project: Project, floorId: string, updater: (floor: Floor) => Floor): Project {
  return { ...project, floors: project.floors.map((f) => (f.id === floorId ? updater(f) : f)) };
}

function updateWallInFloor(floor: Floor, wallId: string, updater: (wall: Wall) => Wall): Floor {
  return { ...floor, walls: floor.walls.map((w) => (w.id === wallId ? updater(w) : w)) };
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
  activeFloorId: null,
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
  setBackWallEnabled: (enabled) => set((s) => ({
    project: { ...s.project, backWallEnabled: enabled },
  })),
  resetProject: () => set({
    project: createDefaultProject(),
    viewMode: "floorplan",
    activeFloorId: null,
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

  // --- Kondygnacje ---
  setActiveFloor: (id) => set({ activeFloorId: id }),

  addFloor: (name) => set((s) => {
    const level = s.project.floors.length;
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
      project: { ...s.project, floors: [...s.project.floors, newFloor] },
      activeFloorId: newFloor.id,
    };
  }),

  duplicateFloor: (sourceFloorId) => set((s) => {
    const source = s.project.floors.find((f) => f.id === sourceFloorId);
    if (!source) return s;
    const level = s.project.floors.length;
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
      project: { ...s.project, floors: [...s.project.floors, newFloor] },
      activeFloorId: newFloor.id,
    };
  }),

  removeFloor: (id) => set((s) => ({
    project: {
      ...s.project,
      floors: s.project.floors.filter((f) => f.id !== id).map((f, i) => ({ ...f, level: i })),
    },
    activeFloorId: s.activeFloorId === id ? null : s.activeFloorId,
  })),

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
      updateWallInFloor(f, wallId, (w) => ({ ...w, ...updates }))
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
      const floor = s.project.floors.find((f) => f.id === floorId);
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
    const floor = s.project.floors.find((f) => f.id === floorId);
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
    const floor = s.project.floors.find((f) => f.id === floorId);
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
      }))
    ),
  })),

  updateOpening: (floorId, wallId, openingId, updates) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) =>
      updateWallInFloor(f, wallId, (w) => ({
        ...w, openings: w.openings.map((o) => (o.id === openingId ? { ...o, ...updates } : o)),
      }))
    ),
  })),

  removeOpening: (floorId, wallId, openingId) => set((s) => ({
    project: updateFloorInProject(s.project, floorId, (f) =>
      updateWallInFloor(f, wallId, (w) => ({
        ...w, openings: w.openings.filter((o) => o.id !== openingId),
      }))
    ),
  })),

  // --- Dach ---
  setRoof: (roofData) => set((s) => ({
    project: {
      ...s.project,
      roof: roofData ? { ...roofData, id: crypto.randomUUID(), anomalies: [] } : null,
    },
  })),

  updateRoof: (updates) => set((s) => {
    if (!s.project.roof) return s;
    return { project: { ...s.project, roof: { ...s.project.roof, ...updates } } };
  }),

  addRoofAnomaly: (anomaly) => set((s) => {
    if (!s.project.roof) return s;
    return {
      project: {
        ...s.project,
        roof: { ...s.project.roof, anomalies: [...s.project.roof.anomalies, { ...anomaly, id: crypto.randomUUID() }] },
      },
    };
  }),

  removeRoofAnomaly: (id) => set((s) => {
    if (!s.project.roof) return s;
    return {
      project: {
        ...s.project,
        roof: { ...s.project.roof, anomalies: s.project.roof.anomalies.filter((a) => a.id !== id) },
      },
    };
  }),

  updateGableWall: (side, updates) => set((s) => ({
    project: {
      ...s.project,
      gableWalls: s.project.gableWalls.map((g) => g.side === side ? { ...g, ...updates } : g),
    },
  })),

  // --- Strop hybrydowy ---
  setSlabEdit: (v) => set({ slabEdit: v }),

  detachSlab: (floorId) => {
    get().pushUndo();
    set((s) => {
      const floor = s.project.floors.find((f) => f.id === floorId);
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
      const floor = s.project.floors.find((f) => f.id === floorId);
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
      let project = { ...s.project, stairs: [...s.project.stairs, { ...stair, id }] };
      // Auto-cutout w stropie piętra docelowego.
      const toFloor = project.floors.find((f) => f.id === stair.toFloorId);
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
      const old = s.project.stairs.find((st) => st.id === stairId);
      if (!old) return s;
      const merged: Stair = { ...old, ...updates };
      let project = {
        ...s.project,
        stairs: s.project.stairs.map((st) => (st.id === stairId ? merged : st)),
      };
      // Odśwież linked cutout w toFloor.
      const footprint = computeStairFootprintLocal(merged);
      for (const f of project.floors) {
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
      // Jeśli zmieniono toFloor a nie ma cutoutu w nowym toFloor, dodaj.
      const newToFloor = project.floors.find((f) => f.id === merged.toFloorId);
      if (newToFloor && !newToFloor.slabShape.cutouts.some((c) => c.linkedStairId === stairId)) {
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
      let project = {
        ...s.project,
        stairs: s.project.stairs.filter((st) => st.id !== stairId),
      };
      for (const f of project.floors) {
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
      // Override bazowego wpisu — pobierz snapshot z bazy i nałóż patch.
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
// Selektor aktywnego piętra
// ---------------------------------------------------------------------------

export function useActiveFloor(): Floor | undefined {
  const project = useStore((s) => s.project);
  const activeFloorId = useStore((s) => s.activeFloorId);
  if (activeFloorId) return project.floors.find((f) => f.id === activeFloorId);
  return project.floors[0];
}

// ---------------------------------------------------------------------------
// Bind katalogu runtime: `lib/catalog.ts` czyta override'y z tego store'a.
// Robimy to raz, przy pierwszym imporcie store'a.
// ---------------------------------------------------------------------------
__bindCatalogOverrides(() => useStore.getState().catalogOverrides);
