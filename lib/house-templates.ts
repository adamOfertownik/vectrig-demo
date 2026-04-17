// Szablony obrysu zewnętrznego w stylu nazewnictwa ARCHON+ (uproszczone geometrie demonstracyjne).
import type { Point, Wall, WallType } from "./types";

export function rectWalls(ext: WallType, h: number, w = 10000, d = 8000): Omit<Wall, "id">[] {
  return [
    { type: ext, category: "external", label: "Front", start: { x: 0, y: 0 }, end: { x: w, y: 0 }, height: h, openings: [] },
    { type: ext, category: "external", label: "Lewa", start: { x: w, y: 0 }, end: { x: w, y: d }, height: h, openings: [] },
    { type: ext, category: "external", label: "Tylna", start: { x: w, y: d }, end: { x: 0, y: d }, height: h, openings: [] },
    { type: ext, category: "external", label: "Prawa", start: { x: 0, y: d }, end: { x: 0, y: 0 }, height: h, openings: [] },
  ];
}

export function lshapeWalls(ext: WallType, h: number): Omit<Wall, "id">[] {
  const pts: Point[] = [
    { x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 4000 },
    { x: 5000, y: 4000 }, { x: 5000, y: 8000 }, { x: 0, y: 8000 },
  ];
  return pts.map((p, i) => ({
    type: ext,
    category: "external" as const,
    label: `Ściana ${i + 1}`,
    start: p,
    end: pts[(i + 1) % pts.length],
    height: h,
    openings: [],
  }));
}

export function lshapeMezzanineWalls(ext: WallType, h: number): Omit<Wall, "id">[] {
  const pts: Point[] = [
    { x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 4000 },
    { x: 8000, y: 4000 }, { x: 8000, y: 8000 }, { x: 0, y: 8000 },
  ];
  return pts.map((p, i) => ({
    type: ext,
    category: "external" as const,
    label: `Ściana ${i + 1}`,
    start: p,
    end: pts[(i + 1) % pts.length],
    height: h,
    openings: [],
  }));
}

export const HOUSE_TEMPLATES = [
  {
    id: "lukrecja2",
    name: "Dom w lukrecji 2",
    hint: "Szablon demonstracyjny — prostokąt 10×8 m",
    build: (ext, h) => rectWalls(ext, h),
  },
  {
    id: "kosace32",
    name: "Dom w kosacach 32",
    hint: "Szablon demonstracyjny — L-kształt",
    build: (ext, h) => lshapeWalls(ext, h),
  },
  {
    id: "renklody15",
    name: "Dom w renklodach 15",
    hint: "Szablon demonstracyjny — L z szerszym skrzydłem (jak antresola)",
    build: (ext, h) => lshapeMezzanineWalls(ext, h),
  },
] as const satisfies readonly {
  id: string;
  name: string;
  hint: string;
  build: (ext: WallType, h: number) => Omit<Wall, "id">[];
}[];

export type HouseTemplateId = (typeof HOUSE_TEMPLATES)[number]["id"];

export interface HouseTemplate {
  id: HouseTemplateId;
  name: string;
  hint: string;
  build: (ext: WallType, h: number) => Omit<Wall, "id">[];
}

export function getHouseTemplate(id: HouseTemplateId): HouseTemplate {
  const t = HOUSE_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown house template: ${id}`);
  return t;
}
