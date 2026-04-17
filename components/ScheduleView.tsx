"use client";

import { useStore } from "@/lib/store";
import { getWallEntry } from "@/lib/catalog";
import { wallLength } from "@/lib/geometry";
import { splitProjectPanels, splitRoofForSchedule } from "@/lib/panel-split";
import { allFloorsInProject } from "@/lib/project-migrate";

export default function ScheduleView() {
  const project = useStore((s) => s.project);
  // Re-render po edycji cennika.
  useStore((s) => s.catalogOverrides);
  const breakdowns = splitProjectPanels(project);
  const byWall = new Map(breakdowns.walls.map((b) => [b.wallId, b]));
  const roofRow = splitRoofForSchedule(project);

  let sumWasteM3 = 0;
  let sumMachiningS = 0;
  let sumJointMb = 0;

  const rows: Array<{
    floorName: string;
    wallLabel: string;
    length: number;
    height: number;
    effectiveH: number;
    typeShort: string;
    orientation: "horizontal" | "vertical";
    panelsStr: string;
    joints: number;
    wasteM3: number;
    hours: number;
    rotated: boolean;
    overSize: boolean;
  }> = [];

  for (const floor of allFloorsInProject(project)) {
    for (const wall of floor.walls) {
      const b = byWall.get(wall.id);
      if (!b) continue;
      sumWasteM3 += b.toothWasteM3;
      sumMachiningS += b.machiningSeconds;
      sumJointMb += b.jointLengthMM / 1000;
      const cat = getWallEntry(wall.type);
      const bname = project.buildings.find((bu) => bu.floors.some((fl) => fl.id === floor.id))?.name;
      rows.push({
        floorName: bname ? `${bname} — ${floor.name}` : floor.name,
        wallLabel: wall.label,
        length: Math.round(wallLength(wall)),
        height: wall.height,
        effectiveH: b.effectiveHeightMM,
        typeShort: cat.shortLabel,
        orientation: b.orientation,
        panelsStr: b.panels.map((p) => Math.round(p.widthMM)).join(" + "),
        joints: b.jointCount,
        wasteM3: b.toothWasteM3,
        hours: b.machiningSeconds / 3600,
        rotated: b.rotated,
        overSize: b.overSize,
      });
    }
  }

  if (roofRow) {
    sumWasteM3 += roofRow.totalWasteM3;
    sumMachiningS += roofRow.totalMachiningSeconds;
    sumJointMb += (roofRow.faceBreakdown.jointLengthMM * roofRow.faces) / 1000;
    const fb = roofRow.faceBreakdown;
    rows.push({
      floorName: "—",
      wallLabel: `Dach CLT (~${roofRow.areaSqm.toFixed(1)} m² · ${roofRow.faces} poł${roofRow.faces === 1 ? "ać" : "aci"})`,
      length: Math.round(roofRow.eavesSpanMm),
      height: Math.round(roofRow.slopeRunMm),
      effectiveH: Math.round(roofRow.slopeRunMm),
      typeShort: roofRow.typeShort,
      orientation: fb.orientation,
      panelsStr:
        (fb.panels.map((p) => Math.round(p.widthMM)).join(" + ") || "—") +
        (roofRow.faces > 1 ? ` ×${roofRow.faces}` : ""),
      joints: roofRow.totalJoints,
      wasteM3: roofRow.totalWasteM3,
      hours: roofRow.totalMachiningSeconds / 3600,
      rotated: fb.rotated,
      overSize: fb.overSize,
    });
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-lg font-semibold">Zestawienie ścian i dachu — podział na panele CLT</h2>
        <div className="text-xs text-muted">
          ({rows.length} ścian · Σ styków {sumJointMb.toFixed(2)} mb · odpad{" "}
          {sumWasteM3.toFixed(3)} m³ · obróbka {(sumMachiningS / 3600).toFixed(2)} h
          {breakdowns.rotatedCount > 0 && (
            <> · {breakdowns.rotatedCount}× panel pionowy (&gt; 3 m)</>
          )}
          {breakdowns.overSizeCount > 0 && (
            <> · <span className="text-red-400">{breakdowns.overSizeCount}× za wysokie</span></>
          )}
          )
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-panel">
        <table className="w-full text-xs">
          <thead className="bg-surface text-left">
            <tr>
              <th className="px-3 py-2">Piętro</th>
              <th className="px-3 py-2">Ściana</th>
              <th className="px-3 py-2 text-right">Dł. [mm]</th>
              <th className="px-3 py-2 text-right">Wys. nominalna</th>
              <th className="px-3 py-2 text-right">Wys. ze szczytem</th>
              <th className="px-3 py-2">Typ CLT</th>
              <th className="px-3 py-2">Orientacja</th>
              <th className="px-3 py-2">Panele [mm]</th>
              <th className="px-3 py-2 text-right">Styki</th>
              <th className="px-3 py-2 text-right">Odpad [m³]</th>
              <th className="px-3 py-2 text-right">Obróbka [h]</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={`border-t border-border ${
                  r.overSize ? "bg-red-500/15" : r.rotated ? "bg-amber-500/10" : ""
                }`}
              >
                <td className="px-3 py-2">{r.floorName}</td>
                <td className="px-3 py-2">{r.wallLabel}</td>
                <td className="px-3 py-2 text-right font-mono">{r.length}</td>
                <td className="px-3 py-2 text-right font-mono">{r.height}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.effectiveH}
                  {r.effectiveH > r.height && (
                    <span className="text-muted"> (+{r.effectiveH - r.height})</span>
                  )}
                </td>
                <td className="px-3 py-2">{r.typeShort}</td>
                <td className="px-3 py-2">
                  {r.orientation === "horizontal" ? (
                    <span title="Panel poziomy (≤ 3 m wysokości)">— poziomo</span>
                  ) : (
                    <span
                      className={r.overSize ? "text-red-400" : "text-amber-400"}
                      title="Panel obrócony (wąskie wysokie paski)"
                    >
                      | pionowo
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono">{r.panelsStr || "—"}</td>
                <td className="px-3 py-2 text-right">{r.joints}</td>
                <td className="px-3 py-2 text-right font-mono">{r.wasteM3.toFixed(3)}</td>
                <td className="px-3 py-2 text-right font-mono">{r.hours.toFixed(2)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-muted">
                  Brak ścian w projekcie.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="bg-surface/60 border-t border-border">
              <tr>
                <td colSpan={8} className="px-3 py-2 font-semibold text-right">
                  Razem:
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {rows.reduce((s, r) => s + r.joints, 0)}
                </td>
                <td className="px-3 py-2 text-right font-semibold font-mono">
                  {sumWasteM3.toFixed(3)}
                </td>
                <td className="px-3 py-2 text-right font-semibold font-mono">
                  {(sumMachiningS / 3600).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="text-xs text-muted bg-surface border border-border rounded px-3 py-2 space-y-1">
        <div>
          Wiersz „Dach CLT” pojawia się po zdefiniowaniu dachu — szacuje podział reprezentatywnej
          połaci (× liczba połaci). Powierzchnia z katalogu zgadza się z wyceną.
        </div>
        <div>
          Na górnym piętrze dodajemy szczyty dachu (dwuspadowy / jednospadowy) — ściana CLT jest
          jedną płytą z trójkątem.
        </div>
        <div>
          Gdy wysokość z szczytem &gt; max. szerokości panela (3 m domyślnie), panel obraca się o
          90° — wtedy paski są wąskie (≤ 3 m) i wysokie (do 12 m), więc liczba styków rośnie.
        </div>
        <div className="text-red-400">
          Gdy wysokość &gt; 12 m — materiał nie mieści się nawet po obrocie (wiersz na czerwono).
        </div>
      </div>
    </div>
  );
}
