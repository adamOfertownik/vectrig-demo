// Migracja i fabryki projektu (w tym stary format: floors na root).
import type {
  Building,
  Floor,
  GableWall,
  Project,
  ProjectDefaults,
  Roof,
  Stair,
} from "./types";

/** Wszystkie kondygnacje w projekcie (płaska lista). */
export function allFloorsInProject(project: Project): Floor[] {
  return project.buildings.flatMap((b) => b.floors);
}

/** Wszystkie schody w projekcie. */
export function allStairsInProject(project: Project): Stair[] {
  return project.buildings.flatMap((b) => b.stairs);
}

const DEFAULT_DEFAULTS: ProjectDefaults = {
  extWallType: "CLT_120_EXT",
  intWallType: "CLT_100_INT",
  slabType: "CLT_160_SLAB",
  roofType: "CLT_120_ROOF",
  wallHeight: 2800,
};

/** Stary kształt Project (jeden budynek na root). */
interface LegacyProjectShape {
  id?: string;
  name?: string;
  defaults?: ProjectDefaults;
  floors?: Floor[];
  roof?: Roof | null;
  gableWalls?: GableWall[];
  backWallEnabled?: boolean;
  stairs?: Stair[];
  createdAt?: string;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function normalizeBuilding(b: unknown): Building {
  if (!isRecord(b)) {
    return createDefaultBuilding("Budynek 1", { x: 0, y: 0 });
  }
  const id = typeof b.id === "string" ? b.id : crypto.randomUUID();
  const name = typeof b.name === "string" ? b.name : "Budynek";
  const position =
    isRecord(b.position) &&
    typeof b.position.x === "number" &&
    typeof b.position.y === "number"
      ? { x: b.position.x, y: b.position.y }
      : { x: 0, y: 0 };
  const floors = Array.isArray(b.floors) ? (b.floors as Floor[]) : [];
  const roof = (b.roof ?? null) as Roof | null;
  const gableWalls: GableWall[] = Array.isArray(b.gableWalls) && (b.gableWalls as GableWall[]).length >= 2
    ? (b.gableWalls as GableWall[])
    : [
        { id: crypto.randomUUID(), side: "left", option: "fixed", openings: [] },
        { id: crypto.randomUUID(), side: "right", option: "fixed", openings: [] },
      ];
  const backWallEnabled = typeof b.backWallEnabled === "boolean" ? b.backWallEnabled : true;
  const stairs = Array.isArray(b.stairs) ? (b.stairs as Stair[]) : [];
  return {
    id,
    name,
    position,
    floors,
    roof,
    gableWalls,
    backWallEnabled,
    stairs,
  };
}

/** Pojedynczy budynek domyślny (prostokąt parteru). */
export function createDefaultBuilding(
  name = "Budynek 1",
  position: { x: number; y: number } = { x: 0, y: 0 },
): Building {
  const parterId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    name,
    position: { ...position },
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
  };
}

export function createDefaultProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: "Nowy projekt CLT",
    defaults: { ...DEFAULT_DEFAULTS },
    buildings: [createDefaultBuilding("Budynek 1", { x: 0, y: 0 })],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Ujednolica dane projektu: nowy format `buildings[]` lub migracja ze starego JSON z `floors` na root.
 */
export function normalizeProject(raw: unknown): Project {
  if (!isRecord(raw)) return createDefaultProject();

  if (Array.isArray(raw.buildings) && raw.buildings.length > 0) {
    const defaults =
      raw.defaults && typeof raw.defaults === "object" && raw.defaults !== null
        ? { ...DEFAULT_DEFAULTS, ...(raw.defaults as ProjectDefaults) }
        : { ...DEFAULT_DEFAULTS };
    return {
      id: typeof raw.id === "string" ? raw.id : crypto.randomUUID(),
      name: typeof raw.name === "string" ? raw.name : "Nowy projekt CLT",
      defaults,
      buildings: raw.buildings.map((b) => normalizeBuilding(b)),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    };
  }

  // Legacy: floors / roof / stairs na root
  if (Array.isArray(raw.floors)) {
    const legacy = raw as LegacyProjectShape;
    const defaults =
      legacy.defaults && typeof legacy.defaults === "object"
        ? { ...DEFAULT_DEFAULTS, ...legacy.defaults }
        : { ...DEFAULT_DEFAULTS };
    return {
      id: typeof legacy.id === "string" ? legacy.id : crypto.randomUUID(),
      name: typeof legacy.name === "string" ? legacy.name : "Nowy projekt CLT",
      defaults,
      buildings: [
        {
          id: crypto.randomUUID(),
          name: "Budynek 1",
          position: { x: 0, y: 0 },
          floors: legacy.floors as Floor[],
          roof: legacy.roof ?? null,
          gableWalls: Array.isArray(legacy.gableWalls) && legacy.gableWalls.length >= 2
            ? legacy.gableWalls as GableWall[]
            : [
                { id: crypto.randomUUID(), side: "left", option: "fixed", openings: [] },
                { id: crypto.randomUUID(), side: "right", option: "fixed", openings: [] },
              ],
          backWallEnabled: legacy.backWallEnabled !== false,
          stairs: Array.isArray(legacy.stairs) ? legacy.stairs as Stair[] : [],
        },
      ],
      createdAt: typeof legacy.createdAt === "string" ? legacy.createdAt : new Date().toISOString(),
    };
  }

  return createDefaultProject();
}

export function findBuildingIdForFloor(project: Project, floorId: string): string | undefined {
  for (const b of project.buildings) {
    if (b.floors.some((f) => f.id === floorId)) return b.id;
  }
  return undefined;
}

export function findBuildingContainingFloor(project: Project, floorId: string): Building | undefined {
  const id = findBuildingIdForFloor(project, floorId);
  return id ? project.buildings.find((b) => b.id === id) : undefined;
}

/** Głęboka kopia budynku z nowymi identyfikatorami (piętra, ściany, schody, dach). */
export function duplicateBuildingStructure(source: Building, name?: string): Building {
  const floorIdMap = new Map<string, string>();
  const stairIdMap = new Map<string, string>();

  const newFloors: Floor[] = source.floors.map((f) => {
    const nfId = crypto.randomUUID();
    floorIdMap.set(f.id, nfId);
    return {
      ...structuredClone(f),
      id: nfId,
      walls: f.walls.map((w) => ({
        ...structuredClone(w),
        id: crypto.randomUUID(),
        openings: w.openings.map((o) => ({
          ...structuredClone(o),
          id: crypto.randomUUID(),
        })),
      })),
      slabShape: {
        mode: f.slabShape.mode,
        vertices: f.slabShape.vertices?.map((v) => ({ ...v })),
        cutouts: f.slabShape.cutouts.map((c) => ({
          ...structuredClone(c),
          id: crypto.randomUUID(),
          vertices: c.vertices.map((v) => ({ ...v })),
          linkedStairId: c.linkedStairId,
        })),
      },
    };
  });

  const newStairs: Stair[] = source.stairs.map((st) => {
    const nsId = crypto.randomUUID();
    stairIdMap.set(st.id, nsId);
    return {
      ...structuredClone(st),
      id: nsId,
      fromFloorId: floorIdMap.get(st.fromFloorId) ?? st.fromFloorId,
      toFloorId: floorIdMap.get(st.toFloorId) ?? st.toFloorId,
    };
  });

  for (const f of newFloors) {
    f.slabShape.cutouts = f.slabShape.cutouts.map((c) => ({
      ...c,
      linkedStairId: c.linkedStairId && stairIdMap.has(c.linkedStairId)
        ? stairIdMap.get(c.linkedStairId)
        : c.linkedStairId,
    }));
  }

  return {
    id: crypto.randomUUID(),
    name: name ?? `${source.name} (kopia)`,
    position: { ...source.position },
    floors: newFloors,
    roof: source.roof
      ? {
          ...structuredClone(source.roof),
          id: crypto.randomUUID(),
          anomalies: source.roof.anomalies.map((a) => ({
            ...structuredClone(a),
            id: crypto.randomUUID(),
          })),
        }
      : null,
    gableWalls: source.gableWalls.map((g) => ({
      ...structuredClone(g),
      id: crypto.randomUUID(),
      openings: g.openings.map((o) => ({
        ...structuredClone(o),
        id: crypto.randomUUID(),
      })),
    })),
    backWallEnabled: source.backWallEnabled,
    stairs: newStairs,
  };
}
