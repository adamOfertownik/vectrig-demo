// lib/panel-split.ts — podział ścian na panele CLT z kalkulacją odpadów i obróbki
import type { Wall, Project, Floor } from "./types";
import { getWallEntry } from "./catalog";
import { roofSurfaceAreaSqm } from "./roof-area";
import {
  wallLength,
  wallEffectiveHeight,
  computeBoundsFromWalls,
  type RoofBounds,
} from "./geometry";

export type PanelOrientation = "horizontal" | "vertical";

export interface WallPanel {
  index: number;
  widthMM: number;       // szerokość panela (wzdłuż długości ściany)
  heightMM: number;      // wysokość panela (= wysokość ściany, może zawierać szczyt)
  isLast: boolean;
}

export interface WallPanelBreakdown {
  wallId: string;
  wallLabel: string;
  wallLengthMM: number;
  wallHeightMM: number;        // nominalna wysokość ściany
  effectiveHeightMM: number;   // z uwzględnieniem szczytu dachu
  orientation: PanelOrientation;
  panels: WallPanel[];
  panelCount: number;
  jointCount: number;
  jointLengthMM: number;
  toothWasteM3: number;
  machiningSeconds: number;
  panelVolumeM3: number;
  /** Przekracza maxPanelLength nawet po obrocie (błąd produkcyjny). */
  overSize: boolean;
  /** Przekracza maxPanelWidth → wymaga orientacji pionowej (obróconej). */
  rotated: boolean;
}

export interface ProjectPanelSplit {
  walls: WallPanelBreakdown[];
  totalPanels: number;
  totalJointLengthM: number;
  totalWasteM3: number;
  totalMachiningSeconds: number;
  rotatedCount: number;
  overSizeCount: number;
}

/**
 * Dzieli pojedynczą ścianę na panele CLT. Decyduje o orientacji:
 * - horyzontalna (domyślna): panel długim bokiem wzdłuż ściany, max szerokość paska = maxPanelLength,
 *   wymaga effectiveHeight <= maxPanelWidth.
 * - pionowa (obrócona): panel długim bokiem w pionie (effectiveHeight <= maxPanelLength),
 *   max szerokość paska = maxPanelWidth → wąskie wysokie paski.
 */
export function splitWallIntoPanels(wall: Wall, effectiveHeightMM?: number): WallPanelBreakdown {
  const cat = getWallEntry(wall.type);
  const lengthMM = Math.round(wallLength(wall));
  const rawHeight = effectiveHeightMM ?? wall.height;
  const heightMM = Math.round(rawHeight);

  const empty: WallPanelBreakdown = {
    wallId: wall.id,
    wallLabel: wall.label,
    wallLengthMM: lengthMM,
    wallHeightMM: wall.height,
    effectiveHeightMM: heightMM,
    orientation: "horizontal",
    panels: [],
    panelCount: 0,
    jointCount: 0,
    jointLengthMM: 0,
    toothWasteM3: 0,
    machiningSeconds: 0,
    panelVolumeM3: 0,
    overSize: false,
    rotated: false,
  };
  if (lengthMM <= 0 || heightMM <= 0) return empty;

  // Wybór orientacji:
  // - horizontal: effectiveHeight mieści się w krótszym wymiarze panela (maxPanelWidth)
  // - vertical:   effectiveHeight wymaga dłuższego wymiaru (maxPanelLength), paski wąskie (maxPanelWidth)
  let orientation: PanelOrientation;
  let maxPieceWidth: number;
  let overSize = false;

  if (heightMM <= cat.maxPanelWidth) {
    orientation = "horizontal";
    maxPieceWidth = cat.maxPanelLength;
  } else if (heightMM <= cat.maxPanelLength) {
    orientation = "vertical";
    maxPieceWidth = cat.maxPanelWidth;
  } else {
    orientation = "vertical";
    maxPieceWidth = cat.maxPanelWidth;
    overSize = true;
  }

  const panels: WallPanel[] = [];
  const fullCount = Math.floor(lengthMM / maxPieceWidth);
  const remainder = lengthMM - fullCount * maxPieceWidth;
  for (let i = 0; i < fullCount; i++) {
    panels.push({ index: i, widthMM: maxPieceWidth, heightMM, isLast: false });
  }
  if (remainder > 0) {
    panels.push({ index: fullCount, widthMM: remainder, heightMM, isLast: true });
  }
  if (panels.length > 0) panels[panels.length - 1].isLast = true;

  const jointCount = Math.max(0, panels.length - 1);
  const jointLengthMM = jointCount * heightMM;

  const toothAreaMM2 = cat.toothDepth * cat.thickness;
  const toothWasteMM3 = jointCount * 2 * toothAreaMM2 * heightMM;
  const toothWasteM3 = toothWasteMM3 / 1e9;

  const jointLengthM = jointLengthMM / 1000;
  const machiningSeconds = jointLengthM * cat.machiningSecPerMb;

  const panelVolumeM3 = (lengthMM / 1000) * (heightMM / 1000) * (cat.thickness / 1000);

  return {
    wallId: wall.id,
    wallLabel: wall.label,
    wallLengthMM: lengthMM,
    wallHeightMM: wall.height,
    effectiveHeightMM: heightMM,
    orientation,
    panels,
    panelCount: panels.length,
    jointCount,
    jointLengthMM,
    toothWasteM3,
    machiningSeconds,
    panelVolumeM3,
    overSize,
    rotated: orientation === "vertical",
  };
}

function wallEffectiveHeightInProject(wall: Wall, floor: Floor, project: Project): number {
  const isTop = project.floors.length > 0 && project.floors[project.floors.length - 1].id === floor.id;
  if (!isTop || !project.roof || wall.category !== "external") return wall.height;
  const extWalls = floor.walls.filter((w) => w.category === "external");
  const bounds: RoofBounds = computeBoundsFromWalls(extWalls);
  return wallEffectiveHeight(wall, project.roof, bounds);
}

/** Podział wszystkich ścian w projekcie na panele, uwzględniając szczyty dachu na górnym piętrze. */
export function splitProjectPanels(project: Project): ProjectPanelSplit {
  const walls: WallPanelBreakdown[] = [];
  for (const floor of project.floors) {
    for (const w of floor.walls) {
      const effH = wallEffectiveHeightInProject(w, floor, project);
      walls.push(splitWallIntoPanels(w, effH));
    }
  }
  return {
    walls,
    totalPanels: walls.reduce((s, w) => s + w.panelCount, 0),
    totalJointLengthM: walls.reduce((s, w) => s + w.jointLengthMM / 1000, 0),
    totalWasteM3: walls.reduce((s, w) => s + w.toothWasteM3, 0),
    totalMachiningSeconds: walls.reduce((s, w) => s + w.machiningSeconds, 0),
    rotatedCount: walls.filter((w) => w.rotated).length,
    overSizeCount: walls.filter((w) => w.overSize).length,
  };
}

/** Jedna reprezentatywna połać dachu CLT do zestawienia (szacunek podziału paneli). */
export interface RoofScheduleRow {
  areaSqm: number;
  faces: number;
  /** Wymiar wzdłuż okapu / kalenicy [mm] — „długość” pasa. */
  eavesSpanMm: number;
  /** Rozwinięcie w górę stoku [mm] — „wysokość” pasa na połaci. */
  slopeRunMm: number;
  typeShort: string;
  /** Podział dla jednej połaci (× faces w nagłówku). */
  faceBreakdown: WallPanelBreakdown;
  totalPanels: number;
  totalJoints: number;
  totalWasteM3: number;
  totalMachiningSeconds: number;
}

/**
 * Szacunkowy podział powłoki dachu na panele ( uproszczony prostokąt reprezentatywnej połaci ).
 * Dla dwuspadowego: dwie równoważne połacie — sumy mnożone ×2.
 */
export function splitRoofForSchedule(project: Project): RoofScheduleRow | null {
  if (!project.roof) return null;
  const areaSqm = roofSurfaceAreaSqm(project);
  if (areaSqm <= 1e-6) return null;

  const ground = project.floors[0];
  if (!ground) return null;
  const ext = ground.walls.filter((w) => w.category === "external");
  if (ext.length < 2) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of ext) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  const innerW = maxX - minX;
  const innerD = maxY - minY;
  const ov = project.roof.overhang;
  const Wmm = innerW + 2 * ov;
  const pitchRad = (project.roof.pitch * Math.PI) / 180;
  const cosP = Math.cos(pitchRad) || 1;
  const roof = project.roof;

  let faces = 1;
  let eavesMm = Wmm;
  let slopeRunMm = Math.round((innerD + 2 * ov) / cosP);

  if (roof.type === "flat") {
    eavesMm = Wmm;
    slopeRunMm = innerD + 2 * ov;
  } else if (roof.type === "gable") {
    faces = 2;
    const halfDepthMm = innerD / 2 + ov;
    slopeRunMm = Math.round(halfDepthMm / cosP);
  } else if (roof.type === "hip") {
    faces = 4;
    slopeRunMm = Math.round(
      ((innerD / 2 + ov) + (innerW / 2 + ov)) / 2 / cosP
    );
  }

  const cat = getWallEntry(project.defaults.roofType);
  const synth: Wall = {
    id: "__roof_schedule__",
    type: project.defaults.roofType,
    category: "external",
    label: "Powłoka dachu CLT",
    start: { x: 0, y: 0 },
    end: { x: eavesMm, y: 0 },
    height: slopeRunMm,
    openings: [],
  };

  const faceBreakdown = splitWallIntoPanels(synth);
  const totalPanels = faceBreakdown.panelCount * faces;
  const totalJoints = faceBreakdown.jointCount * faces;
  const totalWasteM3 = faceBreakdown.toothWasteM3 * faces;
  const totalMachiningSeconds = faceBreakdown.machiningSeconds * faces;

  return {
    areaSqm,
    faces,
    eavesSpanMm: eavesMm,
    slopeRunMm,
    typeShort: cat.shortLabel,
    faceBreakdown,
    totalPanels,
    totalJoints,
    totalWasteM3,
    totalMachiningSeconds,
  };
}
