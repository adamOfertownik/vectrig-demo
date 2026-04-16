"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useStore, useActiveFloor } from "@/lib/store";
import { getWallEntry } from "@/lib/catalog";
import {
  computeFloorPlanPositions,
  computeBounds,
  computeBoundsFromWalls,
  hitTestWall,
  hitTestVertex,
  hitTestWallMidpoint,
  hitTestStair,
  moveWallParallel,
  projectPointOntoSegment,
  resolveSlabPolygon,
  stairFootprint,
  wallLength,
  wallUnitAlong,
  type WallPosition,
} from "@/lib/geometry";
import { resolveOpeningMm } from "@/lib/openings";
import type { Point, Wall } from "@/lib/types";

const PADDING = 60;
const GRID_STEP_MM = 1000;
const DIM_OFFSET = 24;
const SNAP_GRID = 500;
const SNAP_VERTEX_PX = 12;
const ANGLE_SNAP_STEPS = [0, 45, 90, 135, 180, 225, 270, 315, 360];
const VERTEX_HIT_PX = 10;
const MIDPOINT_HIT_PX = 9;
const MIN_HALF_LEN_MM = 100;

// ---------------------------------------------------------------------------
// Click-to-click polyline draw state
// ---------------------------------------------------------------------------

interface DrawState {
  originPlan: Point;
  startPlan: Point;
  currentPlan: Point;
  wallCount: number;
}

// ---------------------------------------------------------------------------
// Drag state (vertex, parallel wall, edge resize)
// ---------------------------------------------------------------------------

type DragTarget =
  | { type: "vertex"; wallIndex: number; which: "start" | "end"; point: Point }
  | { type: "wall"; wallIndex: number; wallSnapshot: Wall; mouseStart: Point }
  | {
      type: "edge-resize";
      wallIndex: number;
      start0: Point;
      end0: Point;
      u0: Point;
      mouseStart: Point;
    };

interface DragState {
  target: DragTarget;
  startPos: Point;
  currentPos: Point;
}

export default function FloorPlanCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<number>(-1);
  const hoveredVertexRef = useRef<{ wallIndex: number; which: "start" | "end"; point: Point } | null>(null);
  const hoveredMidWallIdxRef = useRef<number | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const drawStateRef = useRef<DrawState | null>(null);
  const drawToolRef = useRef<"select" | "draw">("select");
  const shiftHeldRef = useRef(false);

  const floor = useActiveFloor();
  const project = useStore((s) => s.project);
  const selectedWallId = useStore((s) => s.selectedWallId);
  const selectWall = useStore((s) => s.selectWall);
  const addWall = useStore((s) => s.addWall);
  const splitWall = useStore((s) => s.splitWall);
  const closeOutline = useStore((s) => s.closeOutline);
  const moveVertex = useStore((s) => s.moveVertex);
  const pushUndo = useStore((s) => s.pushUndo);
  const theme = useStore((s) => s.theme);
  const drawTool = useStore((s) => s.drawTool);
  const setDrawTool = useStore((s) => s.setDrawTool);
  const drawWallCategory = useStore((s) => s.drawWallCategory);
  // Re-render po edycji cennika (grubości ścian, kolory).
  useStore((s) => s.catalogOverrides);

  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);

  dragStateRef.current = dragState;
  drawStateRef.current = drawState;
  drawToolRef.current = drawTool;

  const activeFloor = floor;
  const activeLevel = activeFloor?.level ?? 0;
  const ghostFloor = useMemo(() => {
    if (activeLevel <= 0) return undefined;
    return project.floors.find((f) => f.level === activeLevel - 1);
  }, [project.floors, activeLevel]);

  const allWalls = useMemo(() => activeFloor?.walls ?? [], [activeFloor]);
  const extWalls = useMemo(() => allWalls.filter((w) => w.category === "external"), [allWalls]);
  const intWalls = useMemo(() => allWalls.filter((w) => w.category === "internal"), [allWalls]);

  const extPositions = useMemo(() => computeFloorPlanPositions(extWalls), [extWalls]);
  const intPositions = useMemo(() => computeFloorPlanPositions(intWalls), [intWalls]);
  const allPositions = useMemo(() => computeFloorPlanPositions(allWalls), [allWalls]);

  const ghostExtWalls = useMemo(
    () => ghostFloor?.walls.filter((w) => w.category === "external") ?? [],
    [ghostFloor]
  );
  const ghostIntWalls = useMemo(
    () => ghostFloor?.walls.filter((w) => w.category === "internal") ?? [],
    [ghostFloor]
  );
  const ghostExtPositions = useMemo(() => computeFloorPlanPositions(ghostExtWalls), [ghostExtWalls]);
  const ghostIntPositions = useMemo(() => computeFloorPlanPositions(ghostIntWalls), [ghostIntWalls]);

  const allPosForBounds = useMemo(() => {
    const combined = [...extPositions, ...intPositions];
    if (ghostExtPositions.length) combined.push(...ghostExtPositions);
    return combined;
  }, [extPositions, intPositions, ghostExtPositions]);

  const bounds = useMemo(
    () => computeBounds(allPosForBounds.length ? allPosForBounds : extPositions),
    [allPosForBounds, extPositions]
  );

  const allVertices = useMemo(() => {
    const verts: Point[] = [];
    for (const w of allWalls) { verts.push(w.start, w.end); }
    return verts;
  }, [allWalls]);

  // --- Coordinate transforms ---

  const getTransform = useCallback(
    (cw: number, ch: number) => {
      const drawW = cw - PADDING * 2;
      const drawH = ch - PADDING * 2;
      const bw = bounds.width || 10000;
      const bh = bounds.height || 6000;
      const scale = Math.min(drawW / bw, drawH / bh, drawW / 14000);
      const offsetX = PADDING + (drawW - bw * scale) / 2 - bounds.minX * scale;
      const offsetY = PADDING + (drawH - bh * scale) / 2 - bounds.minY * scale;
      return { scale, offsetX, offsetY };
    },
    [bounds]
  );

  const toCanvas = useCallback(
    (x: number, y: number, cw: number, ch: number) => {
      const { scale, offsetX, offsetY } = getTransform(cw, ch);
      return { cx: x * scale + offsetX, cy: y * scale + offsetY };
    },
    [getTransform]
  );

  const toPlan = useCallback(
    (cx: number, cy: number, cw: number, ch: number) => {
      const { scale, offsetX, offsetY } = getTransform(cw, ch);
      return { px: (cx - offsetX) / scale, py: (cy - offsetY) / scale };
    },
    [getTransform]
  );

  // --- Snapping ---

  function snapToGrid(pt: Point): Point {
    return {
      x: Math.round(pt.x / SNAP_GRID) * SNAP_GRID,
      y: Math.round(pt.y / SNAP_GRID) * SNAP_GRID,
    };
  }

  const snapToVertex = useCallback(
    (planPt: Point, cw: number, ch: number): Point | null => {
      const { scale } = getTransform(cw, ch);
      const threshMM = SNAP_VERTEX_PX / scale;
      let best: Point | null = null;
      let bestDist = Infinity;
      for (const v of allVertices) {
        const dx = v.x - planPt.x;
        const dy = v.y - planPt.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < threshMM && dist < bestDist) {
          bestDist = dist;
          best = v;
        }
      }
      return best;
    },
    [allVertices, getTransform]
  );

  function snapPointFull(planPt: Point, cw: number, ch: number, from?: Point): Point {
    let snapped = snapToVertex(planPt, cw, ch) ?? snapToGrid(planPt);

    if (shiftHeldRef.current && from) {
      const dx = snapped.x - from.x;
      const dy = snapped.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 10) {
        let rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (rawAngle < 0) rawAngle += 360;
        let bestSnap = ANGLE_SNAP_STEPS[0];
        let bestDiff = 999;
        for (const a of ANGLE_SNAP_STEPS) {
          const diff = Math.abs(rawAngle - a);
          if (diff < bestDiff) { bestDiff = diff; bestSnap = a; }
        }
        if (bestSnap === 360) bestSnap = 0;
        const rad = (bestSnap * Math.PI) / 180;
        snapped = { x: from.x + Math.cos(rad) * dist, y: from.y + Math.sin(rad) * dist };
      }
    }

    return snapped;
  }

  function isNearOrigin(planPt: Point, cw: number, ch: number): boolean {
    if (!drawState) return false;
    const { scale } = getTransform(cw, ch);
    const threshMM = SNAP_VERTEX_PX / scale;
    const dx = planPt.x - drawState.originPlan.x;
    const dy = planPt.y - drawState.originPlan.y;
    return Math.sqrt(dx * dx + dy * dy) < threshMM;
  }

  // --- Draw everything ---

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;

    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isDark = theme === "dark";
    const bgColor = isDark ? "#16171c" : "#f8f9fb";
    const gridColor = isDark ? "#22232b" : "#e8ebe5";
    const wallColor = isDark ? "#a0a4b0" : "#3a3d48";
    const wallSelectedColor = isDark ? "#4ade80" : "#2d6b4f";
    const wallHoverColor = isDark ? "#67e8a8" : "#4a9a73";
    const intWallColor = isDark ? "#6b7080" : "#8b92a0";
    const dimColor = isDark ? "#6b7080" : "#5a6070";
    const openingColor = isDark ? "#60a5fa" : "#3b82f6";
    const vertexColor = isDark ? "#4ade80" : "#2d6b4f";
    const vertexHoverColor = isDark ? "#fbbf24" : "#d97706";
    const ghostWallColor = isDark ? "rgba(160,164,176,0.2)" : "rgba(58,61,72,0.15)";
    const ghostDimColor = isDark ? "rgba(107,112,128,0.3)" : "rgba(90,96,112,0.25)";
    const drawPreviewColor = isDark ? "#f97316" : "#ea580c";
    const closeHintColor = isDark ? "#22d3ee" : "#0891b2";
    const dragColor = isDark ? "#a78bfa" : "#7c3aed";

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cw, ch);

    const { scale } = getTransform(cw, ch);
    const gridPx = GRID_STEP_MM * scale;

    const topFloorId = project.floors[project.floors.length - 1]?.id;
    const isTopFloorView = activeFloor?.id === topFloorId;
    const groundExtForRoof = project.floors[0]?.walls.filter((w) => w.category === "external") ?? [];
    const roofBoundsForPlan = computeBoundsFromWalls(groundExtForRoof);

    // Grid
    if (gridPx > 15) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 0.5;
      const startXmm = Math.floor(bounds.minX / GRID_STEP_MM) * GRID_STEP_MM - GRID_STEP_MM * 2;
      const endXmm = bounds.maxX + GRID_STEP_MM * 2;
      const startYmm = Math.floor(bounds.minY / GRID_STEP_MM) * GRID_STEP_MM - GRID_STEP_MM * 2;
      const endYmm = bounds.maxY + GRID_STEP_MM * 2;

      for (let xmm = startXmm; xmm <= endXmm; xmm += GRID_STEP_MM) {
        const { cx } = toCanvas(xmm, 0, cw, ch);
        ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, ch); ctx.stroke();
      }
      for (let ymm = startYmm; ymm <= endYmm; ymm += GRID_STEP_MM) {
        const { cy } = toCanvas(0, ymm, cw, ch);
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(cw, cy); ctx.stroke();
      }
    }

    // --- Ghost floor ---
    if (ghostExtPositions.length > 0) {
      for (const wp of ghostExtPositions) {
        const s = toCanvas(wp.start.x, wp.start.y, cw, ch);
        const e = toCanvas(wp.end.x, wp.end.y, cw, ch);
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = ghostWallColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.cx, s.cy); ctx.lineTo(e.cx, e.cy); ctx.stroke();
        ctx.restore();

        const mx = (s.cx + e.cx) / 2;
        const my = (s.cy + e.cy) / 2;
        const ang = Math.atan2(e.cy - s.cy, e.cx - s.cx);
        const perpX = -Math.sin(ang) * (DIM_OFFSET + 14);
        const perpY = Math.cos(ang) * (DIM_OFFSET + 14);
        ctx.fillStyle = ghostDimColor;
        ctx.font = "400 9px Inter, system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.save();
        ctx.translate(mx + perpX, my + perpY);
        let ta = ang;
        if (ta > Math.PI / 2) ta -= Math.PI;
        if (ta < -Math.PI / 2) ta += Math.PI;
        ctx.rotate(ta);
        ctx.fillText((wallLength(wp.wall) / 1000).toFixed(1) + " m", 0, 0);
        ctx.restore();
      }
      for (const wp of ghostIntPositions) {
        const s = toCanvas(wp.start.x, wp.start.y, cw, ch);
        const e = toCanvas(wp.end.x, wp.end.y, cw, ch);
        ctx.save(); ctx.setLineDash([4, 4]);
        ctx.strokeStyle = isDark ? "rgba(107,112,128,0.15)" : "rgba(139,146,160,0.12)";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(s.cx, s.cy); ctx.lineTo(e.cx, e.cy); ctx.stroke();
        ctx.restore();
      }
      if (ghostFloor) {
        const gb = computeBounds(ghostExtPositions);
        const labelPos = toCanvas(gb.centerX, gb.maxY + 600, cw, ch);
        ctx.fillStyle = ghostDimColor;
        ctx.font = "500 10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`↓ ${ghostFloor.name} (poniżej)`, labelPos.cx, labelPos.cy);
      }
    }

    // --- Internal walls (dashed) + otwory ---
    for (const wp of intPositions) {
      const wall = wp.wall;
      const s = toCanvas(wp.start.x, wp.start.y, cw, ch);
      const e = toCanvas(wp.end.x, wp.end.y, cw, ch);
      ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = intWallColor; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.cx, s.cy); ctx.lineTo(e.cx, e.cy); ctx.stroke(); ctx.restore();

      if (wall.openings.length > 0) {
        const wLen = wallLength(wall);
        const dx = e.cx - s.cx;
        const dy = e.cy - s.cy;
        for (const op of wall.openings) {
          const r = resolveOpeningMm(wall, op, null, null);
          if (r.width < 2) continue;
          const startFrac = Math.max(0, Math.min(1, r.position / wLen));
          const endFrac = Math.max(0, Math.min(1, (r.position + r.width) / wLen));
          ctx.strokeStyle = openingColor;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(s.cx + dx * startFrac, s.cy + dy * startFrac);
          ctx.lineTo(s.cx + dx * endFrac, s.cy + dy * endFrac);
          ctx.stroke();
        }
      }
    }

    // --- External walls ---
    for (let i = 0; i < extPositions.length; i++) {
      const wp = extPositions[i];
      const wall = wp.wall;
      const isSelected = wall.id === selectedWallId;
      const isHovered = i === hoveredRef.current && drawTool === "select" && !dragState;

      const s = toCanvas(wp.start.x, wp.start.y, cw, ch);
      const e = toCanvas(wp.end.x, wp.end.y, cw, ch);

      const cat = getWallEntry(wall.type);
      const thickPx = cat.thickness * scale;

      if (thickPx > 2) {
        const angle = Math.atan2(e.cy - s.cy, e.cx - s.cx);
        const nx = -Math.sin(angle) * thickPx / 2;
        const ny = Math.cos(angle) * thickPx / 2;
        ctx.fillStyle = isSelected
          ? (isDark ? "rgba(74,222,128,0.15)" : "rgba(45,107,79,0.1)")
          : isHovered
            ? (isDark ? "rgba(103,232,168,0.1)" : "rgba(74,154,115,0.08)")
            : (isDark ? "rgba(160,164,176,0.06)" : "rgba(58,61,72,0.04)");
        ctx.beginPath();
        ctx.moveTo(s.cx + nx, s.cy + ny); ctx.lineTo(e.cx + nx, e.cy + ny);
        ctx.lineTo(e.cx - nx, e.cy - ny); ctx.lineTo(s.cx - nx, s.cy - ny);
        ctx.closePath(); ctx.fill();
      }

      ctx.strokeStyle = isSelected ? wallSelectedColor : isHovered ? wallHoverColor : wallColor;
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(s.cx, s.cy); ctx.lineTo(e.cx, e.cy); ctx.stroke();

      // Openings (poziomo przycięte do długości ściany; na górnym piętrze zewn. także do kalenicy)
      if (wall.openings.length > 0) {
        const wLen = wallLength(wall);
        const dx = e.cx - s.cx; const dy = e.cy - s.cy;
        for (const op of wall.openings) {
          const r = resolveOpeningMm(
            wall,
            op,
            isTopFloorView && wall.category === "external" && project.roof ? project.roof : null,
            isTopFloorView && wall.category === "external" && project.roof ? roofBoundsForPlan : null
          );
          if (r.width < 2) continue;
          const startFrac = Math.max(0, Math.min(1, r.position / wLen));
          const endFrac = Math.max(0, Math.min(1, (r.position + r.width) / wLen));
          ctx.strokeStyle = openingColor; ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(s.cx + dx * startFrac, s.cy + dy * startFrac);
          ctx.lineTo(s.cx + dx * endFrac, s.cy + dy * endFrac);
          ctx.stroke();
        }
      }

      // Dimensions
      const mx = (s.cx + e.cx) / 2; const my = (s.cy + e.cy) / 2;
      const angle = Math.atan2(e.cy - s.cy, e.cx - s.cx);
      const perpX = -Math.sin(angle) * DIM_OFFSET;
      const perpY = Math.cos(angle) * DIM_OFFSET;
      ctx.save(); ctx.translate(mx + perpX, my + perpY);
      let textAngle = angle;
      if (textAngle > Math.PI / 2) textAngle -= Math.PI;
      if (textAngle < -Math.PI / 2) textAngle += Math.PI;
      ctx.rotate(textAngle);
      ctx.fillStyle = isSelected ? wallSelectedColor : dimColor;
      ctx.font = `${isSelected ? "600" : "500"} 11px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText((wallLength(wall) / 1000).toFixed(1) + " m", 0, 0);
      ctx.restore();

      if (isSelected || isHovered) {
        ctx.fillStyle = isSelected ? wallSelectedColor : wallHoverColor;
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(wall.label, mx - perpX * 0.5, my - perpY * 0.5);
      }
    }

    // Vertices — with hover/drag highlighting
    const drawVertexCircle = (x: number, y: number, color: string, radius: number = 4) => {
      const p = toCanvas(x, y, cw, ch);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(p.cx, p.cy, radius, 0, Math.PI * 2); ctx.fill();
    };

    const renderedVertices = new Set<string>();
    for (const w of allWalls) {
      for (const which of ["start", "end"] as const) {
        const pt = w[which];
        const key = `${Math.round(pt.x)},${Math.round(pt.y)}`;
        if (renderedVertices.has(key)) continue;
        renderedVertices.add(key);

        const isVertexHovered = hoveredVertexRef.current &&
          Math.abs(hoveredVertexRef.current.point.x - pt.x) < 5 &&
          Math.abs(hoveredVertexRef.current.point.y - pt.y) < 5;
        const isDragging = dragState?.target.type === "vertex" &&
          Math.abs(dragState.target.point.x - pt.x) < 5 &&
          Math.abs(dragState.target.point.y - pt.y) < 5;

        const color = isDragging ? dragColor : isVertexHovered ? vertexHoverColor : vertexColor;
        const r = isDragging ? 7 : isVertexHovered ? 6 : 4;
        drawVertexCircle(pt.x, pt.y, color, r);

        if (isVertexHovered && !isDragging) {
          const p = toCanvas(pt.x, pt.y, cw, ch);
          ctx.strokeStyle = vertexHoverColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.cx, p.cy, 10, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    // ======= DRAG MODE PREVIEW =======
    if (dragState) {
      if (dragState.target.type === "vertex") {
        const p = toCanvas(dragState.currentPos.x, dragState.currentPos.y, cw, ch);
        ctx.strokeStyle = dragColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(p.cx, p.cy, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);

        const labelText = `${Math.round(dragState.currentPos.x)} , ${Math.round(dragState.currentPos.y)}`;
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.fillStyle = dragColor;
        ctx.textAlign = "center";
        ctx.fillText(labelText, p.cx, p.cy - 16);
      } else if (dragState.target.type === "edge-resize") {
        const w = allWalls[dragState.target.wallIndex];
        if (w) {
          const lenM = (wallLength(w) / 1000).toFixed(2);
          const mid = toCanvas((w.start.x + w.end.x) / 2, (w.start.y + w.end.y) / 2, cw, ch);
          ctx.font = "600 10px Inter, system-ui, sans-serif";
          ctx.fillStyle = dragColor;
          ctx.textAlign = "center";
          ctx.fillText(`${lenM} m`, mid.cx, mid.cy - 14);
        }
      } else if (dragState.target.type === "wall") {
        const w = allWalls[dragState.target.wallIndex];
        if (w) {
          const wp = computeFloorPlanPositions([w])[0];
          const s = toCanvas(wp.start.x, wp.start.y, cw, ch);
          const e = toCanvas(wp.end.x, wp.end.y, cw, ch);
          const nx = wp.normal.x * 18;
          const ny = wp.normal.y * 18;
          ctx.strokeStyle = dragColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo((s.cx + e.cx) / 2, (s.cy + e.cy) / 2);
          ctx.lineTo((s.cx + e.cx) / 2 + nx, (s.cy + e.cy) / 2 + ny);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // Midpoint handles (resize) — select mode
    if (drawTool === "select" && !dragState) {
      const edgeHandleColor = isDark ? "#fbbf24" : "#d97706";
      for (let i = 0; i < allWalls.length; i++) {
        const w = allWalls[i];
        const show =
          w.id === selectedWallId ||
          hoveredMidWallIdxRef.current === i;
        if (!show) continue;
        const mx = (w.start.x + w.end.x) / 2;
        const my = (w.start.y + w.end.y) / 2;
        const p = toCanvas(mx, my, cw, ch);
        ctx.fillStyle = edgeHandleColor;
        ctx.strokeStyle = isDark ? "#fff" : "#0f172a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(p.cx - 4, p.cy - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }

    // ======= SLAB OVERLAY (render resolved polygon + cutouts) =======
    if (activeFloor && activeFloor.level > 0) {
      const slabPoly = resolveSlabPolygon(activeFloor);
      const cutouts = activeFloor.slabShape?.cutouts ?? [];
      if (slabPoly && slabPoly.length >= 3) {
        ctx.save();
        const isDetached = activeFloor.slabShape?.mode === "detached";
        ctx.setLineDash(isDetached ? [6, 4] : []);
        ctx.strokeStyle = isDark ? "rgba(148,163,184,0.6)" : "rgba(71,85,105,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const p0 = toCanvas(slabPoly[0].x, slabPoly[0].y, cw, ch);
        ctx.moveTo(p0.cx, p0.cy);
        for (let i = 1; i < slabPoly.length; i++) {
          const p = toCanvas(slabPoly[i].x, slabPoly[i].y, cw, ch);
          ctx.lineTo(p.cx, p.cy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      for (const co of cutouts) {
        if (co.vertices.length < 3) continue;
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = co.linkedStairId
          ? (isDark ? "rgba(251,146,60,0.9)" : "rgba(234,88,12,0.8)")
          : (isDark ? "rgba(244,114,182,0.9)" : "rgba(219,39,119,0.8)");
        ctx.fillStyle = co.linkedStairId
          ? (isDark ? "rgba(251,146,60,0.12)" : "rgba(234,88,12,0.08)")
          : (isDark ? "rgba(244,114,182,0.12)" : "rgba(219,39,119,0.08)");
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const p0 = toCanvas(co.vertices[0].x, co.vertices[0].y, cw, ch);
        ctx.moveTo(p0.cx, p0.cy);
        for (let i = 1; i < co.vertices.length; i++) {
          const p = toCanvas(co.vertices[i].x, co.vertices[i].y, cw, ch);
          ctx.lineTo(p.cx, p.cy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // label at centroid
        let cxp = 0, cyp = 0;
        for (const v of co.vertices) { cxp += v.x; cyp += v.y; }
        cxp /= co.vertices.length; cyp /= co.vertices.length;
        const lp = toCanvas(cxp, cyp, cw, ch);
        ctx.setLineDash([]);
        ctx.fillStyle = isDark ? "#fef3c7" : "#7c2d12";
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(co.label, lp.cx, lp.cy);
        ctx.restore();
      }
    }

    // ======= STAIRS OVERLAY =======
    if (activeFloor) {
      const stairsOnFloor = project.stairs.filter((s) => s.fromFloorId === activeFloor.id);
      for (const st of stairsOnFloor) {
        const fp = stairFootprint(st);
        ctx.save();
        ctx.strokeStyle = isDark ? "rgba(96,165,250,0.9)" : "rgba(37,99,235,0.85)";
        ctx.fillStyle = isDark ? "rgba(96,165,250,0.15)" : "rgba(37,99,235,0.1)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const p0 = toCanvas(fp[0].x, fp[0].y, cw, ch);
        ctx.moveTo(p0.cx, p0.cy);
        for (let i = 1; i < fp.length; i++) {
          const p = toCanvas(fp[i].x, fp[i].y, cw, ch);
          ctx.lineTo(p.cx, p.cy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // step lines (approx, bieg A)
        const cos = Math.cos((st.rotation * Math.PI) / 180);
        const sin = Math.sin((st.rotation * Math.PI) / 180);
        for (let i = 1; i < st.stepCount; i++) {
          const ax = i * st.treadDepth;
          const a = { x: st.origin.x + ax * cos, y: st.origin.y + ax * sin };
          const b = {
            x: st.origin.x + ax * cos - st.width * sin,
            y: st.origin.y + ax * sin + st.width * cos,
          };
          const ca = toCanvas(a.x, a.y, cw, ch);
          const cbp = toCanvas(b.x, b.y, cw, ch);
          ctx.beginPath();
          ctx.moveTo(ca.cx, ca.cy);
          ctx.lineTo(cbp.cx, cbp.cy);
          ctx.stroke();
        }

        // arrow — direction (bieg A)
        const arrowLen = st.stepCount * st.treadDepth;
        const mid = {
          x: st.origin.x + (arrowLen / 2) * cos - (st.width / 2) * sin,
          y: st.origin.y + (arrowLen / 2) * sin + (st.width / 2) * cos,
        };
        const tip = {
          x: st.origin.x + arrowLen * 0.9 * cos - (st.width / 2) * sin,
          y: st.origin.y + arrowLen * 0.9 * sin + (st.width / 2) * cos,
        };
        const cm = toCanvas(mid.x, mid.y, cw, ch);
        const ct = toCanvas(tip.x, tip.y, cw, ch);
        ctx.beginPath();
        ctx.moveTo(cm.cx, cm.cy);
        ctx.lineTo(ct.cx, ct.cy);
        ctx.stroke();

        ctx.fillStyle = isDark ? "#93c5fd" : "#1d4ed8";
        ctx.font = "600 10px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(st.label, cm.cx, cm.cy);
        ctx.restore();
      }
    }

    // ======= DRAW MODE PREVIEW =======
    if (drawState && drawTool === "draw") {
      const sP = drawState.startPlan;
      const eP = drawState.currentPlan;
      const s = toCanvas(sP.x, sP.y, cw, ch);
      const e = toCanvas(eP.x, eP.y, cw, ch);

      ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = drawPreviewColor; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(s.cx, s.cy); ctx.lineTo(e.cx, e.cy); ctx.stroke(); ctx.restore();

      const dx = eP.x - sP.x;
      const dy = eP.y - sP.y;
      const previewLen = Math.sqrt(dx * dx + dy * dy);
      let previewAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (previewAngle < 0) previewAngle += 360;

      if (previewLen > 100) {
        const pmx = (s.cx + e.cx) / 2;
        const pmy = (s.cy + e.cy) / 2;

        const labelText = `${(previewLen / 1000).toFixed(2)} m  ·  ${Math.round(previewAngle)}°`;
        ctx.font = "600 11px Inter, system-ui, sans-serif";
        const tw = ctx.measureText(labelText).width;
        ctx.fillStyle = isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.85)";
        const pillH = 20; const pillPad = 8;
        ctx.beginPath();
        ctx.roundRect(pmx - tw / 2 - pillPad, pmy - 20 - pillH / 2, tw + pillPad * 2, pillH, 6);
        ctx.fill();

        ctx.fillStyle = drawPreviewColor;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(labelText, pmx, pmy - 20);
      }

      drawVertexCircle(sP.x, sP.y, drawPreviewColor, 5);
      drawVertexCircle(eP.x, eP.y, drawPreviewColor, 5);

      if (shiftHeldRef.current && previewLen > 100) {
        ctx.save();
        ctx.fillStyle = isDark ? "rgba(249,115,22,0.15)" : "rgba(234,88,12,0.1)";
        ctx.strokeStyle = drawPreviewColor;
        ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        const radius = Math.min(40, Math.sqrt((e.cx - s.cx) ** 2 + (e.cy - s.cy) ** 2) * 0.3);
        ctx.beginPath(); ctx.arc(s.cx, s.cy, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      if (drawState.wallCount > 0) {
        const origin = toCanvas(drawState.originPlan.x, drawState.originPlan.y, cw, ch);
        const nearOrigin = isNearOrigin(eP, cw, ch);

        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = nearOrigin ? closeHintColor : (isDark ? "rgba(249,115,22,0.25)" : "rgba(234,88,12,0.2)");
        ctx.lineWidth = nearOrigin ? 2 : 1.5;
        ctx.beginPath(); ctx.moveTo(e.cx, e.cy); ctx.lineTo(origin.cx, origin.cy); ctx.stroke();
        ctx.restore();

        if (nearOrigin) {
          const o = toCanvas(drawState.originPlan.x, drawState.originPlan.y, cw, ch);
          ctx.strokeStyle = closeHintColor; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(o.cx, o.cy, 10, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = closeHintColor; ctx.globalAlpha = 0.2;
          ctx.beginPath(); ctx.arc(o.cx, o.cy, 10, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      drawVertexCircle(drawState.originPlan.x, drawState.originPlan.y, drawPreviewColor, 6);
    }
  }, [
    extPositions, intPositions, ghostExtPositions, ghostIntPositions,
    selectedWallId, theme, bounds, getTransform, toCanvas, drawState,
    drawTool, ghostFloor, dragState, allWalls, allPositions, activeFloor, project,
  ]);

  // Resize handling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas.parentElement!);
    draw();
    return () => ro.disconnect();
  }, [draw]);

  // Track Shift key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // --- Mouse events ---

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (drawTool !== "select" || !activeFloor) return;
      if (e.button !== 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cw = rect.width; const ch = rect.height;
      const { px, py } = toPlan(cx, cy, cw, ch);
      const { scale } = getTransform(cw, ch);
      const vertexThreshMM = VERTEX_HIT_PX / scale;
      const midThreshMM = MIDPOINT_HIT_PX / scale;

      // Priority 1: vertex
      const vHit = hitTestVertex(allWalls, px, py, vertexThreshMM);
      if (vHit) {
        pushUndo();
        setDragState({
          target: { type: "vertex", ...vHit },
          startPos: { ...vHit.point },
          currentPos: { ...vHit.point },
        });
        e.preventDefault();
        return;
      }

      // Priority 2: midpoint — edge resize along wall axis
      const mHit = hitTestWallMidpoint(allWalls, px, py, midThreshMM);
      if (mHit) {
        pushUndo();
        const w = allWalls[mHit.wallIndex];
        setDragState({
          target: {
            type: "edge-resize",
            wallIndex: mHit.wallIndex,
            start0: { ...w.start },
            end0: { ...w.end },
            u0: wallUnitAlong(w),
            mouseStart: { x: px, y: py },
          },
          startPos: { x: px, y: py },
          currentPos: { x: px, y: py },
        });
        selectWall(w.id);
        e.preventDefault();
        return;
      }

      // Priority 3: wall body — parallel offset
      const wallIdx = hitTestWall(allPositions, px, py, 500);
      if (wallIdx >= 0) {
        pushUndo();
        const wall = allWalls[wallIdx];
        setDragState({
          target: {
            type: "wall",
            wallIndex: wallIdx,
            wallSnapshot: { ...wall },
            mouseStart: { x: px, y: py },
          },
          startPos: { x: px, y: py },
          currentPos: { x: px, y: py },
        });
        selectWall(wall.id);
        e.preventDefault();
      }
    },
    [drawTool, activeFloor, allWalls, allPositions, toPlan, getTransform, pushUndo, selectWall]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !activeFloor) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cw = rect.width; const ch = rect.height;
      const { px, py } = toPlan(cx, cy, cw, ch);

      // --- DRAGGING ---
      if (dragState) {
        const snapped = snapPointFull({ x: px, y: py }, cw, ch);

        const updateWall = useStore.getState().updateWall;

        if (dragState.target.type === "vertex") {
          moveVertex(activeFloor.id, dragState.target.point, snapped);
          setDragState((prev) => prev ? {
            ...prev,
            currentPos: snapped,
            target: { ...prev.target, point: snapped } as DragTarget & { type: "vertex" },
          } : null);
        } else if (dragState.target.type === "edge-resize") {
          const t = dragState.target;
          const deltaAlong =
            (snapped.x - t.mouseStart.x) * t.u0.x +
            (snapped.y - t.mouseStart.y) * t.u0.y;
          const L0 = Math.hypot(t.end0.x - t.start0.x, t.end0.y - t.start0.y);
          const half0 = L0 / 2;
          const center0 = {
            x: (t.start0.x + t.end0.x) / 2,
            y: (t.start0.y + t.end0.y) / 2,
          };
          let newHalf = half0 + deltaAlong / 2;
          if (newHalf < MIN_HALF_LEN_MM) newHalf = MIN_HALF_LEN_MM;
          const newStart = {
            x: center0.x - t.u0.x * newHalf,
            y: center0.y - t.u0.y * newHalf,
          };
          const newEnd = {
            x: center0.x + t.u0.x * newHalf,
            y: center0.y + t.u0.y * newHalf,
          };
          const wid = allWalls[t.wallIndex]?.id;
          if (wid) {
            updateWall(activeFloor.id, wid, { start: newStart, end: newEnd });
          }
          setDragState((prev) => prev ? { ...prev, currentPos: snapped } : null);
        } else if (dragState.target.type === "wall") {
          const t = dragState.target;
          const w = t.wallSnapshot;
          const dx = w.end.x - w.start.x;
          const dy = w.end.y - w.start.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const offset =
            (snapped.x - t.mouseStart.x) * nx + (snapped.y - t.mouseStart.y) * ny;
          const moved = moveWallParallel(w, offset);
          updateWall(activeFloor.id, w.id, { start: moved.start, end: moved.end });
          setDragState((prev) => prev ? { ...prev, currentPos: snapped } : null);
        }

        canvas.style.cursor = "grabbing";
        draw();
        return;
      }

      // --- DRAW MODE ---
      if (drawTool === "draw") {
        if (drawState) {
          const snapped = snapPointFull({ x: px, y: py }, cw, ch, drawState.startPlan);
          setDrawState((prev) => prev ? { ...prev, currentPlan: snapped } : null);
        }
        canvas.style.cursor = "crosshair";
        return;
      }

      // --- SELECT MODE hover ---
      const { scale } = getTransform(cw, ch);
      const vertexThreshMM = VERTEX_HIT_PX / scale;

      const vHit = hitTestVertex(allWalls, px, py, vertexThreshMM);
      if (vHit) {
        hoveredVertexRef.current = vHit;
        hoveredMidWallIdxRef.current = null;
        hoveredRef.current = -1;
        canvas.style.cursor = "move";
        draw();
        return;
      }

      hoveredVertexRef.current = null;

      const midThreshMM = MIDPOINT_HIT_PX / scale;
      const mHit = hitTestWallMidpoint(allWalls, px, py, midThreshMM);
      if (mHit) {
        hoveredMidWallIdxRef.current = mHit.wallIndex;
        hoveredRef.current = -1;
        canvas.style.cursor = "ns-resize";
        draw();
        return;
      }

      hoveredMidWallIdxRef.current = null;

      const idx = hitTestWall(extPositions, px, py, 500);
      if (idx !== hoveredRef.current) {
        hoveredRef.current = idx;
        canvas.style.cursor = idx >= 0 ? "grab" : "default";
        draw();
      }
    },
    [extPositions, toPlan, draw, drawTool, drawState, dragState, activeFloor, allWalls, getTransform, moveVertex, allPositions]
  );

  const handleMouseUp = useCallback(
    () => {
      if (dragState) {
        setDragState(null);
        draw();
      }
    },
    [dragState, draw]
  );

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragState) return;

      const canvas = canvasRef.current;
      if (!canvas || !activeFloor) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const cw = rect.width; const ch = rect.height;
      const { px, py } = toPlan(cx, cy, cw, ch);

      // --- SELECT MODE ---
      if (drawTool === "select") {
        // Try stair hit first — schody rysowane na tym piętrze
        const stairsOnFloor = project.stairs.filter((s) => s.fromFloorId === activeFloor.id);
        const stairHit = hitTestStair(stairsOnFloor, { x: px, y: py });
        if (stairHit) {
          useStore.getState().selectStair(stairHit.id);
          selectWall(null);
          return;
        }

        const extIdx = hitTestWall(extPositions, px, py, 500);
        const intIdx = extIdx >= 0 ? -1 : hitTestWall(intPositions, px, py, 500);
        const hitWallId = extIdx >= 0
          ? extWalls[extIdx].id
          : intIdx >= 0
            ? intWalls[intIdx].id
            : null;

        if (hitWallId && e.altKey) {
          const hitWall = activeFloor.walls.find((w) => w.id === hitWallId);
          if (hitWall) {
            const proj = projectPointOntoSegment({ x: px, y: py }, hitWall.start, hitWall.end);
            splitWall(activeFloor.id, hitWallId, proj.point);
            return;
          }
        }

        if (extIdx >= 0) { selectWall(extWalls[extIdx].id); useStore.getState().selectStair(null); return; }
        if (intIdx >= 0) { selectWall(intWalls[intIdx].id); useStore.getState().selectStair(null); return; }
        selectWall(null);
        useStore.getState().selectStair(null);
        return;
      }

      // --- DRAW MODE ---
      if (drawTool !== "draw") return;

      if (!drawState) {
        // Start from an existing wall — split it and begin polyline from that point.
        const extIdx = hitTestWall(extPositions, px, py, 500);
        const intIdx = extIdx >= 0 ? -1 : hitTestWall(intPositions, px, py, 500);
        const hitWallId = extIdx >= 0
          ? extWalls[extIdx].id
          : intIdx >= 0
            ? intWalls[intIdx].id
            : null;
        if (hitWallId) {
          const hitWall = activeFloor.walls.find((w) => w.id === hitWallId);
          if (hitWall) {
            const proj = projectPointOntoSegment({ x: px, y: py }, hitWall.start, hitWall.end);
            const splitPt = splitWall(activeFloor.id, hitWallId, proj.point);
            const startAt = splitPt ?? proj.point;
            setDrawState({
              originPlan: startAt,
              startPlan: startAt,
              currentPlan: startAt,
              wallCount: 0,
            });
            return;
          }
        }

        const snapped = snapPointFull({ x: px, y: py }, cw, ch);
        setDrawState({
          originPlan: snapped,
          startPlan: snapped,
          currentPlan: snapped,
          wallCount: 0,
        });
        return;
      }

      let endPt = snapPointFull({ x: px, y: py }, cw, ch, drawState.startPlan);

      if (
        drawWallCategory === "external" &&
        drawState.wallCount > 0 &&
        isNearOrigin(endPt, cw, ch)
      ) {
        closeOutline(activeFloor.id);
        setDrawState(null);
        setDrawTool("select");
        return;
      }

      // If endPt lands on an existing wall (edge) and no vertex was hit, split it there.
      const vertexSnap = snapToVertex({ x: px, y: py }, cw, ch);
      if (!vertexSnap) {
        const extIdxHit = hitTestWall(extPositions, endPt.x, endPt.y, 300);
        const intIdxHit = extIdxHit >= 0 ? -1 : hitTestWall(intPositions, endPt.x, endPt.y, 300);
        const hitWallId = extIdxHit >= 0
          ? extWalls[extIdxHit].id
          : intIdxHit >= 0
            ? intWalls[intIdxHit].id
            : null;
        if (hitWallId) {
          const hitWall = activeFloor.walls.find((w) => w.id === hitWallId);
          if (hitWall) {
            const proj = projectPointOntoSegment(endPt, hitWall.start, hitWall.end);
            const splitPt = splitWall(activeFloor.id, hitWallId, proj.point);
            if (splitPt) endPt = splitPt;
            else endPt = proj.point;
          }
        }
      }

      const dx = endPt.x - drawState.startPlan.x;
      const dy = endPt.y - drawState.startPlan.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 200) return;

      const extCount = activeFloor.walls.filter((w) => w.category === "external").length;
      const intCount = activeFloor.walls.filter((w) => w.category === "internal").length;
      const isExt = drawWallCategory === "external";
      addWall(activeFloor.id, {
        type: isExt ? project.defaults.extWallType : project.defaults.intWallType,
        category: drawWallCategory,
        label: isExt ? `Ściana ${extCount + 1}` : `Wnętrze ${intCount + 1}`,
        start: { ...drawState.startPlan },
        end: { ...endPt },
        height: activeFloor.height,
        openings: [],
      });

      setDrawState((prev) => prev ? {
        ...prev,
        startPlan: endPt,
        currentPlan: endPt,
        wallCount: prev.wallCount + 1,
      } : null);
    },
    [drawTool, drawState, activeFloor, project.defaults, addWall, closeOutline, extPositions, intPositions, extWalls, intWalls, toPlan, selectWall, setDrawTool, dragState, drawWallCategory, splitWall, snapToVertex]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (drawTool === "draw" && drawState) {
        e.preventDefault();
        setDrawState(null);
        setDrawTool("select");
      }
    },
    [drawTool, drawState, setDrawTool]
  );

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = -1;
    hoveredVertexRef.current = null;
    hoveredMidWallIdxRef.current = null;
    if (dragState) {
      setDragState(null);
    }
    draw();
  }, [draw, dragState]);

  // Esc — dispatched from app/configurator (vectrig:escape) so one place handles cancel + dialogs
  useEffect(() => {
    const handler = () => {
      if (dragStateRef.current) {
        useStore.getState().undo();
        setDragState(null);
        return;
      }
      const ds = drawStateRef.current;
      if (ds) {
        const wc = ds.wallCount;
        setDrawState(null);
        if (wc === 0) setDrawTool("select");
        return;
      }
      if (drawToolRef.current === "draw") {
        setDrawTool("select");
      }
    };
    window.addEventListener("vectrig:escape", handler);
    return () => window.removeEventListener("vectrig:escape", handler);
  }, [setDrawTool]);

  const hintText = useMemo(() => {
    if (dragState) {
      if (dragState.target.type === "vertex") return "Przeciągnij wierzchołek · Shift = kąt 45° · Esc = cofnij";
      if (dragState.target.type === "edge-resize") return "Zmiana długości ściany (środek) · Esc = cofnij";
      return "Przesuń ścianę równolegle · Esc = cofnij";
    }
    if (drawTool !== "draw") return "Alt+klik na ścianie = podziel w tym miejscu";
    const cat =
      drawWallCategory === "external"
        ? "ściana zewnętrzna (obrys)"
        : "ściana wewnętrzna";
    if (!drawState) return `Rysujesz: ${cat}. Kliknij aby rozpocząć segment · klik na ścianie = złam i zacznij stąd`;
    if (drawState.wallCount === 0)
      return `Rysujesz: ${cat}. Kliknij aby zakończyć segment · klik na innej ścianie = połącz · Shift = 45°`;
    const closeHint =
      drawWallCategory === "external"
        ? " · Kliknij początek obrysu aby zamknąć"
        : "";
    return `Rysujesz: ${cat}. Kliknij kolejny segment${closeHint} · Esc = zakończ`;
  }, [drawTool, drawState, dragState, drawWallCategory]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: drawTool === "draw" ? "crosshair" : "default" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={handleMouseLeave}
      />

      {hintText && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-panel/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2 text-xs text-muted shadow-lg pointer-events-none select-none">
          {hintText}
        </div>
      )}

      {ghostFloor && (
        <div className="absolute top-3 left-3 text-[10px] text-muted bg-panel/80 backdrop-blur-sm rounded px-2 py-1 border border-border">
          Podgląd: {ghostFloor.name} (kondygnacja poniżej)
        </div>
      )}
    </div>
  );
}
