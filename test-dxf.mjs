// test-dxf.mjs — szybki test generatora DXF (bez Nexta)
// Uruchamianie: node --experimental-strip-types test-dxf.mjs
// Tu używamy skompilowanego JS wyciętego ręcznie z TS.

// === Minimalna replika types ===
const CLT_120 = { thickness: 120, label: "Ściana zewn. CLT 120mm" };

// === Projekt testowy: prostokątny dom 8000×6000mm z jednym oknem HS ===
const project = {
  id: "test-001",
  name: "Test Stodola 8x6",
  walls: [
    {
      id: "w1",
      type: "CLT_120_EXT",
      points: [
        { x: 0, y: 0 },
        { x: 8000, y: 0 },
        { x: 8000, y: 6000 },
        { x: 0, y: 6000 },
        { x: 0, y: 0 },
      ],
      openings: [
        {
          id: "op1",
          componentId: "WIN_HS_2000x2200",
          position: 3000,
          sillHeight: 0,
        },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
};

// === Skopiowana logika z lib/dxf-writer.ts + lib/catalog.ts (minimalna) ===
const findComponent = (id) => {
  const catalog = {
    WIN_HS_2000x2200: { id: "WIN_HS_2000x2200", kind: "window_hs", label: "HS 2000x2200", width: 2000, height: 2200 },
  };
  return catalog[id];
};

const emit = (pairs) => pairs.map(([c, v]) => `${c}\n${v}`).join("\n");
const pair = (c, v) => [c, v];

function generateDxf(project) {
  const layers = new Set(["DIM"]);
  for (const w of project.walls) {
    layers.add(`WALL_${w.type}`);
    for (const op of w.openings) {
      const c = findComponent(op.componentId);
      if (c) layers.add(`OPENING_${c.kind.toUpperCase()}`);
    }
  }
  const layerList = Array.from(layers);

  const header = emit([
    pair(0, "SECTION"), pair(2, "HEADER"),
    pair(9, "$ACADVER"), pair(1, "AC1009"),
    pair(9, "$INSUNITS"), pair(70, 4),
    pair(0, "ENDSEC"),
  ]);

  const layerEntries = layerList.map((name, i) => emit([
    pair(0, "LAYER"), pair(2, name), pair(70, 0),
    pair(62, (i % 7) + 1), pair(6, "CONTINUOUS"),
  ])).join("\n");

  const tables = emit([
    pair(0, "SECTION"), pair(2, "TABLES"),
    pair(0, "TABLE"), pair(2, "LAYER"),
    pair(70, layerList.length),
  ]) + "\n" + layerEntries + "\n" + emit([
    pair(0, "ENDTAB"), pair(0, "ENDSEC"),
  ]);

  const entities = [];
  for (const wall of project.walls) {
    const e = [pair(0, "LWPOLYLINE"), pair(8, `WALL_${wall.type}`), pair(90, wall.points.length), pair(70, 0)];
    for (const p of wall.points) {
      e.push(pair(10, p.x));
      e.push(pair(20, p.y));
    }
    entities.push(emit(e));

    for (const op of wall.openings) {
      const c = findComponent(op.componentId);
      if (!c) continue;
      const a = wall.points[0], b = wall.points[1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const t = Math.min(op.position / segLen, 1);
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      entities.push(emit([
        pair(0, "LWPOLYLINE"), pair(8, `OPENING_${c.kind.toUpperCase()}`),
        pair(90, 4), pair(70, 1),
        pair(10, x), pair(20, y),
        pair(10, x + c.width), pair(20, y),
        pair(10, x + c.width), pair(20, y + c.height),
        pair(10, x), pair(20, y + c.height),
      ]));
    }
  }

  return [header, tables,
    emit([pair(0, "SECTION"), pair(2, "ENTITIES")]) + "\n" + entities.join("\n") + "\n" + emit([pair(0, "ENDSEC")]),
    emit([pair(0, "EOF")])
  ].join("\n");
}

// === Test ===
const dxf = generateDxf(project);
console.log("=== Wygenerowany DXF (pierwsze 60 linii) ===");
console.log(dxf.split("\n").slice(0, 60).join("\n"));
console.log("...");
console.log(`\nCałkowita długość pliku: ${dxf.length} znaków`);
console.log(`Liczba linii: ${dxf.split("\n").length}`);

// Weryfikacja kluczowych elementów
const checks = [
  ["Header present", dxf.includes("$ACADVER")],
  ["Metric units", dxf.includes("$INSUNITS\n70\n4")],
  ["WALL layer", dxf.includes("WALL_CLT_120_EXT")],
  ["OPENING layer", dxf.includes("OPENING_WINDOW_HS")],
  ["LWPOLYLINE entity", dxf.includes("LWPOLYLINE")],
  ["EOF marker", dxf.trim().endsWith("EOF")],
  ["Wall points (5 vertices for rectangle)", dxf.includes("90\n5")],
];
console.log("\n=== Weryfikacja ===");
for (const [name, ok] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

// Zapisz do pliku żeby można było otworzyć w CAD
import { writeFileSync } from "fs";
writeFileSync("/home/claude/vectrig-demo/test-output.dxf", dxf);
console.log("\nPlik zapisany: /home/claude/vectrig-demo/test-output.dxf");
