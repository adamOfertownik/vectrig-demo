// app/api/generate-dxf/route.ts
// POST /api/generate-dxf  body: Project  -> text/plain DXF
import { NextResponse } from "next/server";
import { generateDxf } from "@/lib/dxf-writer";
import type { Project } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const project = (await req.json()) as Project;
    if (!project?.floors) {
      return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    }
    const dxf = generateDxf(project);
    return new NextResponse(dxf, {
      status: 200,
      headers: {
        "Content-Type": "application/dxf",
        "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, "_")}.dxf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
