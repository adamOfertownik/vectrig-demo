"use client";

import { useMemo, Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useStore } from "@/lib/store";
import { getWallEntry } from "@/lib/catalog";
import {
  computeFloorPlanPositions,
  computeBounds,
  orderExternalPolygonVertices,
  resolveSlabPolygon,
  stairStepBoxes,
  wallLength,
  wallRoofProfile,
  type WallPosition,
  type WallProfilePoint,
  type RoofBounds,
} from "@/lib/geometry";
import type { Project, Floor, Wall, Roof, Stair, Building } from "@/lib/types";
import { resolveOpeningMm } from "@/lib/openings";
import * as THREE from "three";

const MM_TO_M = 0.001;
const WALL_OPACITY = 0.85;

/** Plansza podłoża w 3D: obejmuje wszystkie budynki (parter + pozycja na działce), z marginesem. */
function computeSiteGroundPlane(project: Project): { cx: number; cz: number; w: number; d: number } {
  const PAD_MM = 4000;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;

  for (const b of project.buildings) {
    const floor = b.floors.find((f) => f.level === 0) ?? b.floors[0];
    if (!floor) continue;
    const ext = floor.walls.filter((w) => w.category === "external");
    const pos = computeFloorPlanPositions(ext);
    const bb = computeBounds(pos.length ? pos : []);
    const ox = b.position.x;
    const oy = b.position.y;
    minX = Math.min(minX, bb.minX + ox);
    maxX = Math.max(maxX, bb.maxX + ox);
    minZ = Math.min(minZ, bb.minY + oy);
    maxZ = Math.max(maxZ, bb.maxY + oy);
  }

  if (project.buildings.length === 0 || !Number.isFinite(minX)) {
    return { cx: 0, cz: 0, w: 40, d: 40 };
  }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const pad = Math.max(PAD_MM, spanX * 0.08, spanZ * 0.08);
  const w = (spanX + 2 * pad) * MM_TO_M;
  const d = (spanZ + 2 * pad) * MM_TO_M;
  const cx = ((minX + maxX) / 2) * MM_TO_M;
  const cz = ((minZ + maxZ) / 2) * MM_TO_M;
  return { cx, cz, w, d };
}

export default function Preview3D() {
  const project = useStore((s) => s.project);
  const theme = useStore((s) => s.theme);
  // Re-render gdy edytor cennika zmieni kolory/grubości.
  useStore((s) => s.catalogOverrides);

  return (
    <div className="w-full h-full bg-surface rounded-lg overflow-hidden border border-border relative">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[15, 12, 15]} fov={45} />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          minDistance={5}
          maxDistance={50}
          maxPolarAngle={Math.PI / 2.1}
        />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 15, 8]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <Suspense fallback={null}>
          {project.buildings.map((b) => (
            <BuildingModel key={b.id} building={b} project={project} />
          ))}
          <Ground theme={theme} project={project} />
        </Suspense>
      </Canvas>
      <LayerTogglesOverlay />
    </div>
  );
}

function LayerTogglesOverlay() {
  const project = useStore((s) => s.project);
  const visibility = useStore((s) => s.visibility);
  const setVisibility = useStore((s) => s.setVisibility);
  const toggleFloorVisible = useStore((s) => s.toggleFloorVisible);

  return (
    <div className="absolute top-3 right-3 bg-panel/90 backdrop-blur-sm border border-border rounded-lg shadow-lg p-3 text-xs space-y-2 select-none pointer-events-auto min-w-[160px]">
      <div className="text-[10px] uppercase tracking-wider text-muted font-semibold">
        Warstwy
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={visibility.walls}
          onChange={(e) => setVisibility({ walls: e.target.checked })}
          className="w-3.5 h-3.5 accent-accent"
        />
        <span>Ściany</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={visibility.slabs}
          onChange={(e) => setVisibility({ slabs: e.target.checked })}
          className="w-3.5 h-3.5 accent-accent"
        />
        <span>Stropy</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={visibility.roof}
          onChange={(e) => setVisibility({ roof: e.target.checked })}
          className="w-3.5 h-3.5 accent-accent"
        />
        <span>Dach</span>
      </label>
      {project.buildings.some((b) => b.floors.length > 0) && (
        <>
          <div className="border-t border-border pt-2 text-[10px] uppercase tracking-wider text-muted font-semibold">
            Piętra
          </div>
          {project.buildings.flatMap((b) =>
            b.floors.map((f) => {
              const visible = !visibility.floorHidden[f.id];
              return (
                <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggleFloorVisible(f.id)}
                    className="w-3.5 h-3.5 accent-accent"
                  />
                  <span className="truncate" title={`${b.name} — ${f.name}`}>
                    {b.name} — {f.name}
                  </span>
                </label>
              );
            }),
          )}
        </>
      )}
    </div>
  );
}

function Ground({ theme, project }: { theme: string; project: Project }) {
  const { cx, cz, w, d } = useMemo(() => computeSiteGroundPlane(project), [project]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.01, cz]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial
        color={theme === "dark" ? "#1a1d23" : "#e8ebe5"}
        roughness={1}
      />
    </mesh>
  );
}

function BuildingModel({ building, project }: { building: Building; project: Project }) {
  const visibility = useStore((s) => s.visibility);
  const px = building.position.x * MM_TO_M;
  const pz = building.position.y * MM_TO_M;

  return (
    <group position={[px, 0, pz]}>
      {building.floors.map((floor) =>
        visibility.floorHidden[floor.id] ? null : (
          <FloorGroup key={floor.id} floor={floor} building={building} project={project} />
        ),
      )}
      {building.stairs.map((s) => (
        <StairMesh key={s.id} stair={s} building={building} project={project} />
      ))}
      {building.roof && visibility.roof && (
        <RoofMesh roof={building.roof} building={building} project={project} />
      )}
    </group>
  );
}

function FloorGroup({
  floor,
  building,
  project,
}: {
  floor: Floor;
  building: Building;
  project: Project;
}) {
  const visibility = useStore((s) => s.visibility);
  const baseY = useMemo(() => {
    let y = 0;
    for (const f of building.floors) {
      if (f.id === floor.id) break;
      y += f.height * MM_TO_M;
      if (f.level > 0) y += f.slabThickness * MM_TO_M;
    }
    return y;
  }, [floor, building.floors]);

  const extWalls = useMemo(
    () => floor.walls.filter((w) => w.category === "external"),
    [floor]
  );
  const intWalls = useMemo(
    () => floor.walls.filter((w) => w.category === "internal"),
    [floor]
  );
  const extPositions = useMemo(() => computeFloorPlanPositions(extWalls), [extWalls]);
  const intPositions = useMemo(() => computeFloorPlanPositions(intWalls), [intWalls]);

  const isTopFloor = building.floors[building.floors.length - 1]?.id === floor.id;
  const roofBounds = useMemo(() => computeBounds(extPositions), [extPositions]);

  return (
    <group position={[0, baseY, 0]}>
      {/* Slab for upper floors */}
      {visibility.slabs && floor.level > 0 && floor.slabThickness > 0 && (
        <SlabMesh
          floor={floor}
          slabType={project.defaults.slabType}
        />
      )}

      {/* External walls */}
      {visibility.walls &&
        extPositions.map((wp, idx) => {
          const profile =
            isTopFloor && building.roof
              ? wallRoofProfile(wp.wall, building.roof, roofBounds)
              : null;
          return (
            <WallMesh3D
              key={extWalls[idx].id}
              wall={wp.wall}
              wallPos={wp}
              roofProfile={profile}
              roofClip={
                isTopFloor && building.roof
                  ? { roof: building.roof, bounds: roofBounds }
                  : undefined
              }
            />
          );
        })}

      {/* Internal walls */}
      {visibility.walls &&
        intPositions.map((wp, idx) => (
          <WallMesh3D key={intWalls[idx].id} wall={wp.wall} wallPos={wp} roofProfile={null} roofClip={undefined} />
        ))}
    </group>
  );
}

function WallMesh3D({
  wall,
  wallPos,
  roofProfile,
  roofClip,
}: {
  wall: Wall;
  wallPos: WallPosition;
  roofProfile?: WallProfilePoint[] | null;
  /** Obcięcie otworów do linii dachu (tylko ściany zewn. pod dachem). */
  roofClip?: { roof: Roof; bounds: RoofBounds } | undefined;
}) {
  const cat = getWallEntry(wall.type);
  const l = wallLength(wall) * MM_TO_M;
  const h = wall.height * MM_TO_M;
  const t = cat.thickness * MM_TO_M;

  // Position: midpoint of wall in plan -> 3D (plan X -> 3D X, plan Y -> 3D Z)
  const midX = wallPos.midpoint.x * MM_TO_M;
  const midZ = wallPos.midpoint.y * MM_TO_M;
  const wallAngle = Math.atan2(
    wallPos.end.y - wallPos.start.y,
    wallPos.end.x - wallPos.start.x
  );

  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-l / 2, 0);
    shape.lineTo(l / 2, 0);

    // Górna krawędź — prosta lub z szczytem dachu.
    const hasProfile = roofProfile && roofProfile.length >= 2 &&
      roofProfile.some((p) => p.extra > 0);
    if (hasProfile) {
      // Profil jest w lokalnych mm od 0 do wallLength; mapujemy do [-l/2, l/2] w metrach.
      const L = wallLength(wall);
      const pts = [...roofProfile].sort((a, b) => b.x - a.x); // od prawej do lewej
      for (const pt of pts) {
        const xMeters = (pt.x / L) * l - l / 2;
        const yMeters = h + pt.extra * MM_TO_M;
        shape.lineTo(xMeters, yMeters);
      }
    } else {
      shape.lineTo(l / 2, h);
      shape.lineTo(-l / 2, h);
    }
    shape.closePath();

    for (const op of wall.openings) {
      const r = resolveOpeningMm(
        wall,
        op,
        roofClip?.roof ?? null,
        roofClip?.bounds ?? null
      );
      if (r.width < 2 || r.height < 2) continue;
      const ow = r.width * MM_TO_M;
      const oh = r.height * MM_TO_M;
      const ox = -l / 2 + r.position * MM_TO_M + ow / 2;
      const oy = r.sillHeight * MM_TO_M;

      const hole = new THREE.Path();
      hole.moveTo(ox - ow / 2, oy);
      hole.lineTo(ox + ow / 2, oy);
      hole.lineTo(ox + ow / 2, oy + oh);
      hole.lineTo(ox - ow / 2, oy + oh);
      hole.closePath();
      shape.holes.push(hole);
    }

    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
    g.translate(0, 0, -t / 2);
    return g;
  }, [wall, l, h, t, roofProfile, roofClip]);

  const rotY = -wallAngle;

  return (
    <mesh
      position={[midX, 0, midZ]}
      rotation={[0, rotY, 0]}
      geometry={geometry}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={cat.color}
        transparent
        opacity={WALL_OPACITY}
        roughness={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function SlabMesh({
  floor,
  slabType,
}: {
  floor: Floor;
  slabType: string;
}) {
  const geometry = useMemo(() => {
    const extWalls = floor.walls.filter((w) => w.category === "external");
    const positions = computeFloorPlanPositions(extWalls);
    const bounds = computeBounds(positions.length ? positions : []);
    const t = floor.slabThickness * MM_TO_M;
    const verts = resolveSlabPolygon(floor);

    if (verts && verts.length >= 3) {
      const shape = new THREE.Shape();
      shape.moveTo(verts[0].x * MM_TO_M, verts[0].y * MM_TO_M);
      for (let i = 1; i < verts.length; i++) {
        shape.lineTo(verts[i].x * MM_TO_M, verts[i].y * MM_TO_M);
      }
      shape.closePath();

      for (const co of floor.slabShape?.cutouts ?? []) {
        if (co.vertices.length < 3) continue;
        const hole = new THREE.Path();
        hole.moveTo(co.vertices[0].x * MM_TO_M, co.vertices[0].y * MM_TO_M);
        for (let i = 1; i < co.vertices.length; i++) {
          hole.lineTo(co.vertices[i].x * MM_TO_M, co.vertices[i].y * MM_TO_M);
        }
        hole.closePath();
        shape.holes.push(hole);
      }

      const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
      g.rotateX(Math.PI / 2);
      return g;
    }

    const w = (bounds.width || 10000) * MM_TO_M;
    const d = (bounds.height || 6000) * MM_TO_M;
    const g = new THREE.BoxGeometry(w, t, d);
    g.translate(bounds.centerX * MM_TO_M, -t / 2, bounds.centerY * MM_TO_M);
    return g;
  }, [floor]);

  const cat = getWallEntry(slabType);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={cat?.color ?? "#6B5B45"} roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

function StairMesh({
  stair,
  building,
  project,
}: {
  stair: Stair;
  building: Building;
  project: Project;
}) {
  const baseY = useMemo(() => {
    let y = 0;
    for (const f of building.floors) {
      if (f.id === stair.fromFloorId) break;
      y += f.height * MM_TO_M;
      if (f.level > 0) y += f.slabThickness * MM_TO_M;
    }
    return y;
  }, [stair, building.floors]);

  const totalRise = useMemo(() => {
    const fromFloor = building.floors.find((f) => f.id === stair.fromFloorId);
    if (!fromFloor) return 0;
    const idx = building.floors.findIndex((f) => f.id === stair.toFloorId);
    const toFloor = idx >= 0 ? building.floors[idx] : null;
    if (!toFloor) return fromFloor.height;
    return fromFloor.height + (toFloor.level > 0 ? toFloor.slabThickness : 0);
  }, [stair, building.floors]);

  const steps = useMemo(() => stairStepBoxes(stair, totalRise), [stair, totalRise]);

  return (
    <group position={[0, baseY, 0]}>
      {steps.map((step, i) => {
        const sw = step.size.x * MM_TO_M;
        const sd = step.size.y * MM_TO_M;
        const sh = step.h * MM_TO_M;
        return (
          <mesh
            key={i}
            position={[
              (step.pos.x + step.size.x / 2) * MM_TO_M,
              (step.y + step.h / 2) * MM_TO_M,
              (step.pos.y + step.size.y / 2) * MM_TO_M,
            ]}
            rotation={[0, -(step.rotation * Math.PI) / 180, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[sw, sh, sd]} />
            <meshStandardMaterial color="#8a6a48" roughness={0.7} />
          </mesh>
        );
      })}
    </group>
  );
}

function RoofMesh({
  roof,
  building,
  project,
}: {
  roof: Roof;
  building: Building;
  project: Project;
}) {
  const geometry = useMemo(() => {
    const topFloor = building.floors[building.floors.length - 1];
    if (!topFloor) return new THREE.BufferGeometry();

    const extWalls = topFloor.walls.filter((w) => w.category === "external");
    const positions = computeFloorPlanPositions(extWalls);
    const bounds = computeBounds(positions);

    const fw = (bounds.width || 10000) * MM_TO_M;
    const sw = (bounds.height || 6000) * MM_TO_M;
    const overhang = roof.overhang * MM_TO_M;
    const pitchRad = (roof.pitch * Math.PI) / 180;
    const ridgeHeight = Math.tan(pitchRad) * (sw / 2);

    const cx = bounds.centerX * MM_TO_M;
    const cz = bounds.centerY * MM_TO_M;
    const minX = bounds.minX * MM_TO_M;
    const maxX = bounds.maxX * MM_TO_M;
    const minZ = bounds.minY * MM_TO_M;
    const maxZ = bounds.maxY * MM_TO_M;
    /** After rotateY(-π/2): (x,0,0)→(0,0,x) so worldZ = x_shape + tz; tz=minZ gives eaves at minZ−overhang when x=−overhang. Extrusion +Z→−worldX; anchor at maxX+overhang. */
    const roofAnchorX = maxX + overhang;
    const roofAnchorZ = minZ;

    let totalH = 0;
    for (const f of building.floors) {
      totalH += f.height * MM_TO_M;
      if (f.level > 0) totalH += f.slabThickness * MM_TO_M;
    }

    if (roof.type === "flat") {
      const g = new THREE.BoxGeometry(
        fw + 2 * overhang,
        roof.thickness * MM_TO_M,
        sw + 2 * overhang
      );
      g.translate(cx, totalH + roof.thickness * MM_TO_M / 2, cz);
      return g;
    }

    if (roof.type === "gable") {
      // Tylko dwie połacie (od okapu do kalenicy). Bez trójkątnych „wieczek” ekstruzji —
      // szczyty są już w geometrii ścian zewnętrznych (wallRoofProfile).
      const yE = totalH;
      const yR = totalH + ridgeHeight;
      const x0 = minX - overhang;
      const x1 = maxX + overhang;
      const z0 = minZ - overhang;
      const z1 = maxZ + overhang;

      const pos = new Float32Array([
        x0, yE, z0,  x1, yE, z0,  x1, yR, cz,  x0, yR, cz,
        x0, yR, cz,  x1, yR, cz,  x1, yE, z1,  x0, yE, z1,
      ]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      g.computeVertexNormals();
      return g;
    }

    if (roof.type === "mono_pitch") {
      const riseHeight = Math.tan(pitchRad) * sw;
      const t = roof.thickness * MM_TO_M;
      const shape = new THREE.Shape();
      shape.moveTo(-overhang, 0);
      shape.lineTo(sw + overhang, riseHeight);
      shape.lineTo(sw + overhang, riseHeight - t);
      shape.lineTo(-overhang, -t);
      shape.closePath();

      const g = new THREE.ExtrudeGeometry(shape, {
        depth: fw + 2 * overhang,
        bevelEnabled: false,
      });
      g.rotateY(-Math.PI / 2);
      g.translate(roofAnchorX, totalH, roofAnchorZ);
      return g;
    }

    // Hip roof fallback
    const shape = new THREE.Shape();
    shape.moveTo(-overhang, 0);
    shape.lineTo(sw / 2, ridgeHeight);
    shape.lineTo(sw + overhang, 0);
    shape.closePath();

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: fw + 2 * overhang,
      bevelEnabled: false,
    });
    g.rotateY(-Math.PI / 2);
    g.translate(roofAnchorX, totalH, roofAnchorZ);
    return g;
  }, [roof, building]);

  const roofCat = getWallEntry(project.defaults.roofType);

  return (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial
        color={roofCat.color}
        transparent
        opacity={0.9}
        roughness={0.7}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
