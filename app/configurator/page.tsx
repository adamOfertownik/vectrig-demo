"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useStore, useActiveFloor } from "@/lib/store";
import { HOUSE_TEMPLATES } from "@/lib/house-templates";
import FloorToolbar from "@/components/FloorToolbar";
import FloorPlanCanvas from "@/components/FloorPlanCanvas";
import WallConfigPanel from "@/components/WallConfigPanel";
import SlabPanel from "@/components/SlabPanel";
import StairPanel from "@/components/StairPanel";
import ScheduleView from "@/components/ScheduleView";
import CatalogView from "@/components/CatalogView";
import DemoBanner from "@/components/DemoBanner";
import WelcomeModal from "@/components/WelcomeModal";
import QuoteSidebar from "@/components/QuoteSidebar";
import SettingsPanel from "@/components/SettingsPanel";
import RoofPanel from "@/components/RoofPanel";
import OnboardingTour, { useTourRestart } from "@/components/OnboardingTour";
import DxfImportDialog from "@/components/DxfImportDialog";
import ShortcutsLegend from "@/components/ShortcutsLegend";

const Preview3D = dynamic(() => import("@/components/Preview3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-surface rounded-lg border border-border text-muted text-sm">
      Ładowanie podglądu 3D...
    </div>
  ),
});

export default function ConfiguratorPage() {
  const projectName = useStore((s) => s.project.name);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const theme = useStore((s) => s.theme);
  const resetProject = useStore((s) => s.resetProject);
  const viewMode = useStore((s) => s.viewMode);
  const show3D = useStore((s) => s.show3D);
  const selectedWallId = useStore((s) => s.selectedWallId);
  const selectedStairId = useStore((s) => s.selectedStairId);
  const slabEdit = useStore((s) => s.slabEdit);
  const restartTour = useTourRestart();

  const floor = useActiveFloor();

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      // Ctrl+Z / Ctrl+Shift+Z always work
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          useStore.getState().redo();
        } else {
          useStore.getState().undo();
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        const st = useStore.getState();
        st.setShowShortcuts(false);
        st.setShowDxfImport(false);
        st.selectWall(null);
        window.dispatchEvent(new CustomEvent("vectrig:escape"));
        return;
      }

      if (isInput) return;

      const state = useStore.getState();

      switch (e.key) {
        case "v":
        case "V":
          state.setDrawTool("select");
          break;
        case "d":
        case "D":
          state.setDrawTool("draw");
          break;
        case "f":
        case "F":
          state.toggle3D();
          break;
        case "c":
        case "C":
          if (floor) state.closeOutline(floor.id);
          break;
        case "?":
          state.setShowShortcuts(!state.showShortcuts);
          break;
        case "i":
        case "I":
          if (state.viewMode === "floorplan") {
            state.setShowDxfImport(!state.showDxfImport);
          }
          break;
        case "1":
          if (floor) state.applyHouseTemplate(floor.id, HOUSE_TEMPLATES[0].id);
          break;
        case "2":
          if (floor) state.applyHouseTemplate(floor.id, HOUSE_TEMPLATES[1].id);
          break;
        case "3":
          if (floor) state.applyHouseTemplate(floor.id, HOUSE_TEMPLATES[2].id);
          break;
        case "Delete":
        case "Backspace":
          if (state.selectedWallId && floor) {
            state.pushUndo();
            state.removeWall(floor.id, state.selectedWallId);
            state.selectWall(null);
          }
          break;
        case "Tab": {
          e.preventDefault();
          const bid = state.activeBuildingId ?? state.project.buildings[0]?.id;
          const building = state.project.buildings.find((b) => b.id === bid) ?? state.project.buildings[0];
          const floors = building?.floors ?? [];
          if (floors.length < 2) break;
          const currentId = state.activeFloorId ?? floors[0]?.id;
          const idx = floors.findIndex((f) => f.id === currentId);
          if (e.shiftKey) {
            const prev = (idx - 1 + floors.length) % floors.length;
            state.setActiveFloor(floors[prev].id);
          } else {
            const next = (idx + 1) % floors.length;
            state.setActiveFloor(floors[next].id);
          }
          state.setViewMode("floorplan");
          break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [floor]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <DemoBanner />
      {/* Top header */}
      <header className="bg-panel border-b border-border px-4 py-2 flex items-center gap-3">
        <Link
          href="/"
          className="text-muted hover:text-foreground text-sm transition-colors"
        >
          ← Vectrig
        </Link>
        <div className="text-border">/</div>
        <div className="text-sm font-semibold">{projectName}</div>
        <div className="flex-1" />
        <button className="btn btn-sm" onClick={resetProject}>
          Reset
        </button>
        <button
          className="btn btn-sm btn-icon"
          onClick={restartTour}
          title="Pokaż instrukcję"
        >
          ?
        </button>
        <button
          className="btn btn-sm btn-icon"
          onClick={toggleTheme}
          title="Zmień motyw"
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
      </header>

      {/* Floor toolbar */}
      <FloorToolbar />

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Central content area */}
        <div className="flex-1 flex flex-col min-w-0">
          {viewMode === "floorplan" && (
            <>
              <div className="px-3 py-1.5 border-b border-border bg-panel/90 text-[11px] text-muted shrink-0 flex items-center gap-1.5 flex-wrap">
                <span>
                  Przełączaj się między widokiem <span className="text-foreground font-medium">2D</span> a{" "}
                  <span className="text-foreground font-medium">3D</span> klawiszem{" "}
                  <kbd className="inline-flex items-center px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-foreground">
                    F
                  </kbd>
                  . Ściany rysuj w widoku 2D.
                </span>
              </div>
              <div className="flex-1 flex min-h-0">
                {/* 2D Canvas / 3D Preview */}
                <div className="flex-1 min-w-0" data-tour="canvas">
                  {show3D ? <Preview3D /> : <FloorPlanCanvas />}
                </div>

                {/* Right panel: wall config / stair / slab */}
                {selectedStairId ? (
                  <div className="w-72 lg:w-80 border-l border-border bg-panel flex-shrink-0">
                    <StairPanel />
                  </div>
                ) : selectedWallId ? (
                  <div className="w-72 lg:w-80 border-l border-border bg-panel flex-shrink-0">
                    <WallConfigPanel />
                  </div>
                ) : slabEdit ? (
                  <div className="w-72 lg:w-80 border-l border-border bg-panel flex-shrink-0">
                    <SlabPanel />
                  </div>
                ) : null}
              </div>
            </>
          )}

          {viewMode === "roof" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
              <RoofPanel />
            </div>
          )}

          {viewMode === "schedule" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
              <ScheduleView />
            </div>
          )}

          {viewMode === "catalog" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
              <CatalogView />
            </div>
          )}

          {viewMode === "settings" && (
            <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
              <SettingsPanel />
            </div>
          )}
        </div>

        {/* Right: Quote sidebar */}
        <QuoteSidebar />
      </div>

      <WelcomeModal />
      <OnboardingTour />
      <DxfImportDialog />
      <ShortcutsLegend />
    </div>
  );
}
