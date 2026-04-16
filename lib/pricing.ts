// lib/pricing.ts — Business Rules Engine (BRE) v3 — vertex-based
import type { Project, Floor, Wall, Roof, Quote, BomLine } from "./types";
import { findComponent, getCncDefaults, getWallEntry } from "./catalog";
import { wallLength, shoelaceAreaSqm } from "./geometry";
import { splitProjectPanels } from "./panel-split";
import { roofSurfaceAreaSqm } from "./roof-area";

export { roofSurfaceAreaSqm };

// ---------------------------------------------------------------------------
// Geometria ściany
// ---------------------------------------------------------------------------

function wallGrossAreaSqm(wall: Wall): number {
  return (wallLength(wall) * wall.height) / 1_000_000;
}

function wallOpeningsAreaSqm(wall: Wall): number {
  return wall.openings.reduce((sum, op) => {
    const comp = findComponent(op.componentId);
    if (!comp) return sum;
    const w = op.customWidth ?? comp.width;
    const h = op.customHeight ?? comp.height;
    return sum + (w * h) / 1_000_000;
  }, 0);
}

function wallNetAreaSqm(wall: Wall): number {
  return Math.max(0, wallGrossAreaSqm(wall) - wallOpeningsAreaSqm(wall));
}

function wallVolumeCubicM(wall: Wall): number {
  const cat = getWallEntry(wall.type);
  return wallNetAreaSqm(wall) * (cat.thickness / 1000);
}

/** Objętość bryły schodów (m³) — sumaryczne boxy stopni * grubość treadu. */
export function stairVolumeCubicM(fromFloorHeightMM: number, slabThicknessMM: number, stair: import("./types").Stair): number {
  const totalRise = fromFloorHeightMM + slabThicknessMM;
  const riser = stair.stepCount > 0 ? totalRise / stair.stepCount : 0;
  const stepVolM3 =
    (stair.treadDepth / 1000) * (stair.width / 1000) * (Math.max(riser, 40) / 1000);
  const flightB = stair.flightBSteps ?? 0;
  return stepVolM3 * (stair.stepCount + flightB);
}

/** Suma obwodów otworów na ścianie w metrach bieżących. */
export function wallOpeningsPerimeterM(wall: Wall): number {
  return wall.openings.reduce((sum, op) => {
    const comp = findComponent(op.componentId);
    if (!comp) return sum;
    const w = (op.customWidth ?? comp.width) / 1000;
    const h = (op.customHeight ?? comp.height) / 1000;
    return sum + 2 * (w + h);
  }, 0);
}

// ---------------------------------------------------------------------------
// Geometria stropu — Shoelace
// ---------------------------------------------------------------------------

function floorFootprintSqm(floor: Floor): number {
  return shoelaceAreaSqm(floor.walls);
}

function slabVolumeCubicM(floor: Floor): number {
  if (floor.slabThickness <= 0) return 0;
  return floorFootprintSqm(floor) * (floor.slabThickness / 1000);
}

// ---------------------------------------------------------------------------
// Geometria dachu
// ---------------------------------------------------------------------------

function roofVolumeCubicM(roof: Roof, project: Project): number {
  return roofSurfaceAreaSqm(project) * (roof.thickness / 1000);
}

function dormerExtraVolumeCubicM(roof: Roof): number {
  return roof.anomalies
    .filter((a) => a.type === "dormer")
    .reduce((sum, a) => {
      const frontWall = (a.width * a.height) / 1_000_000 * 0.12;
      const sideWalls = 2 * ((a.depth ?? 1000) * a.height / 2) / 1_000_000 * 0.12;
      const miniRoof = (a.width * (a.depth ?? 1000)) / 1_000_000 * 0.12;
      return sum + frontWall + sideWalls + miniRoof;
    }, 0);
}

// ---------------------------------------------------------------------------
// Główna funkcja BRE
// ---------------------------------------------------------------------------

export function calculateQuote(project: Project): Quote {
  const lines: BomLine[] = [];
  let totalVolumeCLT = 0;

  const wallVolumeByType = new Map<string, { volume: number; area: number }>();

  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      const vol = wallVolumeCubicM(wall);
      const area = wallNetAreaSqm(wall);
      const existing = wallVolumeByType.get(wall.type) ?? { volume: 0, area: 0 };
      wallVolumeByType.set(wall.type, {
        volume: existing.volume + vol,
        area: existing.area + area,
      });
    }
  }

  for (const [type, { volume, area }] of wallVolumeByType) {
    const cat = getWallEntry(type);
    const total = Math.round(volume * cat.pricePerCubicM);
    totalVolumeCLT += volume;
    lines.push({
      category: "wall",
      description: `${cat.label} (${r2(area)} m², ${r3(volume)} m³)`,
      quantity: r3(volume),
      unit: "m³",
      unitPrice: cat.pricePerCubicM,
      total,
    });
  }

  for (const floor of project.floors) {
    if (floor.slabThickness <= 0) continue;
    const vol = slabVolumeCubicM(floor);
    if (vol <= 0) continue;
    const slabType = project.defaults.slabType;
    const cat = getWallEntry(slabType);
    totalVolumeCLT += vol;
    lines.push({
      category: "slab",
      description: `Strop ${floor.name} (${cat.shortLabel}, ${r3(vol)} m³)`,
      quantity: r3(vol),
      unit: "m³",
      unitPrice: cat.pricePerCubicM,
      total: Math.round(vol * cat.pricePerCubicM),
    });
  }

  if (project.roof) {
    const roofVol = roofVolumeCubicM(project.roof, project);
    const dormerVol = dormerExtraVolumeCubicM(project.roof);
    const totalRoofVol = roofVol + dormerVol;
    const roofCat = getWallEntry(project.defaults.roofType);
    totalVolumeCLT += totalRoofVol;
    lines.push({
      category: "roof",
      description: `Dach CLT (${r2(roofSurfaceAreaSqm(project))} m², ${r3(totalRoofVol)} m³)`,
      quantity: r3(totalRoofVol),
      unit: "m³",
      unitPrice: roofCat.pricePerCubicM,
      total: Math.round(totalRoofVol * roofCat.pricePerCubicM),
    });

    if (dormerVol > 0) {
      const dormerCount = project.roof.anomalies.filter((a) => a.type === "dormer").length;
      lines.push({
        category: "roof",
        description: `Lukarny (${dormerCount} szt, dodatkowe ${r3(dormerVol)} m³)`,
        quantity: dormerCount, unit: "szt", unitPrice: 0, total: 0,
      });
    }
  }

  const compCounts = new Map<string, number>();
  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      for (const op of wall.openings) {
        compCounts.set(op.componentId, (compCounts.get(op.componentId) ?? 0) + 1);
      }
    }
  }
  for (const [compId, count] of compCounts) {
    const comp = findComponent(compId);
    if (!comp) continue;
    lines.push({
      category: "component", description: comp.label, quantity: count,
      unit: "szt", unitPrice: comp.pricePerUnit, total: count * comp.pricePerUnit,
    });
  }

  // --- Schody ---
  if (project.stairs.length > 0) {
    let totalStairVol = 0;
    const floorsById = new Map(project.floors.map((f) => [f.id, f]));
    for (const st of project.stairs) {
      const fromF = floorsById.get(st.fromFloorId);
      const toF = floorsById.get(st.toFloorId);
      if (!fromF) continue;
      const slabT = toF && toF.level > 0 ? toF.slabThickness : 0;
      totalStairVol += stairVolumeCubicM(fromF.height, slabT, st);
    }
    if (totalStairVol > 0) {
      const stairCat = getWallEntry(project.defaults.slabType);
      const price = Math.round(totalStairVol * stairCat.pricePerCubicM);
      totalVolumeCLT += totalStairVol;
      lines.push({
        category: "slab",
        description: `Schody CLT (${project.stairs.length} szt, ${r3(totalStairVol)} m³)`,
        quantity: r3(totalStairVol),
        unit: "m³",
        unitPrice: stairCat.pricePerCubicM,
        total: price,
      });
    }
  }

  // --- Odpad i obróbka paneli CLT (zęby na styku paneli) ---
  const panelSplit = splitProjectPanels(project);
  if (panelSplit.totalMachiningSeconds > 0 || panelSplit.totalWasteM3 > 0) {
    const avgPricePerM3 =
      totalVolumeCLT > 0
        ? lines
            .filter((l) => l.category === "wall" || l.category === "slab" || l.category === "roof")
            .reduce((s, l) => s + l.total, 0) / Math.max(totalVolumeCLT, 0.0001)
        : getWallEntry(project.defaults.extWallType).pricePerCubicM;
    const wasteCost = Math.round(panelSplit.totalWasteM3 * avgPricePerM3);
    if (panelSplit.totalWasteM3 > 0) {
      lines.push({
        category: "wall",
        description: `Odpad ząbki CLT (${panelSplit.totalPanels} paneli, ${r3(panelSplit.totalWasteM3)} m³)`,
        quantity: r3(panelSplit.totalWasteM3),
        unit: "m³",
        unitPrice: Math.round(avgPricePerM3),
        total: wasteCost,
      });
    }
    if (panelSplit.totalMachiningSeconds > 0) {
      const cnc = getCncDefaults();
      const hours = panelSplit.totalMachiningSeconds / 3600;
      const machiningCost = Math.round(hours * cnc.operatorRatePerHour);
      lines.push({
        category: "labor",
        description: `Obróbka styków paneli CLT (${r2(panelSplit.totalJointLengthM)} mb, ${r2(hours)} h)`,
        quantity: r2(hours),
        unit: "h",
        unitPrice: cnc.operatorRatePerHour,
        total: machiningCost,
      });
    }
  }

  // --- CNC: wycinanie obwodów otworów ---
  let totalOpeningPerimeterM = 0;
  for (const floor of project.floors) {
    for (const wall of floor.walls) {
      totalOpeningPerimeterM += wallOpeningsPerimeterM(wall);
    }
  }
  if (totalOpeningPerimeterM > 0) {
    const cnc = getCncDefaults();
    const cncHours = (totalOpeningPerimeterM * cnc.secPerMbOpening) / 3600;
    const pricePerMb =
      (cnc.secPerMbOpening / 3600) * cnc.operatorRatePerHour;
    const totalCnc = Math.round(totalOpeningPerimeterM * pricePerMb);
    lines.push({
      category: "labor",
      description: `Wycinanie otworów CNC (${r2(totalOpeningPerimeterM)} mb, ${r2(cncHours)} h)`,
      quantity: r2(totalOpeningPerimeterM),
      unit: "mb",
      unitPrice: Math.round(pricePerMb * 100) / 100,
      total: totalCnc,
    });
  }

  const materialsTotal = lines.reduce((sum, l) => sum + l.total, 0);
  const labor = Math.round(materialsTotal * 0.25);
  lines.push({ category: "labor", description: "Montaż i obróbka (25% materiałów)", quantity: 1, unit: "ryczałt", unitPrice: labor, total: labor });

  const transport = Math.round(totalVolumeCLT * 800);
  lines.push({
    category: "transport", description: `Transport CLT (${r3(totalVolumeCLT)} m³)`,
    quantity: r3(totalVolumeCLT), unit: "m³", unitPrice: 800, total: transport,
  });

  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const vat = Math.round(subtotal * 0.23);

  return { lines, totalVolumeCLT: r3(totalVolumeCLT), subtotal, vat, total: subtotal + vat };
}

function r2(n: number): number { return Math.round(n * 100) / 100; }
function r3(n: number): number { return Math.round(n * 1000) / 1000; }
