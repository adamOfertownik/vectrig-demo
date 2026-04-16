"use client";

import { useState, useEffect, useCallback } from "react";

interface TourStep {
  targetSelector: string;
  title: string;
  body: string;
  position: "bottom" | "top" | "left" | "right";
}

const STEPS: TourStep[] = [
  {
    targetSelector: "[data-tour='shapes']",
    title: "1. Wybierz kształt budynku",
    body: "Kliknij gotowy kształt (prostokąt, L) lub użyj narzędzia ołówka, żeby narysować ściany ręcznie. W trybie rysowania możesz klikać w istniejące ściany by je łamać.",
    position: "bottom",
  },
  {
    targetSelector: "[data-tour='canvas']",
    title: "2. Kliknij na ścianę",
    body: "Zaznacz ścianę klikając na nią na rysunku. Otworzy się panel konfiguracji, gdzie dodasz okna i drzwi z kontrolą pozycji i wysokości parapetu.",
    position: "right",
  },
  {
    targetSelector: "[data-tour='floors']",
    title: "3. Piętra",
    body: "Przełączaj zakładki pięter, duplikuj obrys lub dodaj nowe piętro. Zakładka Dach pozwala skonfigurować typ dachu i szczyty.",
    position: "bottom",
  },
  {
    targetSelector: "[data-tour='slab']",
    title: "4. Strop hybrydowy",
    body: "Na wyższych piętrach możesz odłączyć strop od obrysu ścian i wyciąć w nim dziury — idealne pod antresolę lub kominek.",
    position: "bottom",
  },
  {
    targetSelector: "[data-tour='stairs']",
    title: "5. Schody",
    body: "Dodaj schody jednym kliknięciem — policzą wysokość stopnia i automatycznie wytną cutout w stropie piętra powyżej.",
    position: "bottom",
  },
  {
    targetSelector: "[data-tour='schedule']",
    title: "6. Zestawienie paneli CLT",
    body: "Widok zestawienia pokaże jak każda ściana zostanie pocięta na panele CLT, ile będzie styków, odpadu i czasu obróbki CNC.",
    position: "bottom",
  },
  {
    targetSelector: "[data-tour='catalog']",
    title: "7. Cennik",
    body: "Edytuj ceny typów CLT, okien, drzwi i parametry CNC. Możesz też dodać własne pozycje. Zmiany są lokalne dla sesji.",
    position: "bottom",
  },
  {
    targetSelector: "[data-tour='export']",
    title: "8. Eksportuj projekt",
    body: "Gotowy projekt wyeksportuj do pliku DXF z wszystkimi warstwami — ściany, otwory, stropy, dach, schody i tabela zestawienia.",
    position: "left",
  },
];

const STORAGE_KEY = "vectrig_tour_done";
const WELCOME_KEY = "vectrig_welcome_done";

export function useTourRestart() {
  return () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      // Upewnij się, że WelcomeModal nie wskoczy nad tourem.
      localStorage.setItem(WELCOME_KEY, "toured");
    } catch {}
    window.dispatchEvent(new CustomEvent("vectrig:tour-restart"));
  };
}

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const shouldShow = () => {
      try {
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tour") === "1") return true;
        if (localStorage.getItem(STORAGE_KEY)) return false;
        const welcome = localStorage.getItem(WELCOME_KEY);
        // Nowi użytkownicy — najpierw WelcomeModal, a on wywoła tour eventem.
        if (welcome === null) return false;
        // Użytkownik kliknął "Zaczynam sam" — nie pokazujemy tour'a automatycznie.
        if (welcome === "skipped") return false;
        return true;
      } catch {}
      return false;
    };

    if (shouldShow()) {
      const timer = setTimeout(() => setActive(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener("vectrig:tour-restart", handler);
    return () => window.removeEventListener("vectrig:tour-restart", handler);
  }, []);

  const measureTarget = useCallback(() => {
    if (!active) return;
    const el = document.querySelector(STEPS[step].targetSelector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        setSpotRect(rect);
      });
    } else {
      // Element nie istnieje jeszcze w DOM (np. schody pojawią się po dodaniu
      // drugiego piętra). Pokazujemy dymek w centrum ekranu z tipsem.
      if (typeof window !== "undefined") {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        setSpotRect({
          left: vw / 2 - 1,
          top: vh / 2 - 1,
          right: vw / 2 + 1,
          bottom: vh / 2 + 1,
          width: 2,
          height: 2,
          x: vw / 2 - 1,
          y: vh / 2 - 1,
          toJSON: () => ({}),
        } as DOMRect);
      }
    }
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    measureTarget();

    const onResize = () => measureTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, measureTarget]);

  // Re-measure periodically in case layout shifts
  useEffect(() => {
    if (!active) return;
    const id = setInterval(measureTarget, 300);
    return () => clearInterval(id);
  }, [active, measureTarget]);

  function dismiss() {
    setActive(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  if (!active || !spotRect) return null;

  const pad = 8;
  const sx = spotRect.left - pad;
  const sy = spotRect.top - pad;
  const sw = spotRect.width + pad * 2;
  const sh = spotRect.height + pad * 2;

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Tooltip position calculation
  const tooltipStyle = computeTooltipPosition(currentStep.position, spotRect, sw, sh, sx, sy);

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "auto" }}>
      {/* Backdrop with spotlight hole via clip-path */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          background: "rgba(0,0,0,0.55)",
          clipPath: `polygon(
            0% 0%, 0% 100%, ${sx}px 100%, ${sx}px ${sy}px,
            ${sx + sw}px ${sy}px, ${sx + sw}px ${sy + sh}px,
            ${sx}px ${sy + sh}px, ${sx}px 100%, 100% 100%, 100% 0%
          )`,
        }}
        onClick={dismiss}
      />

      {/* Spotlight border ring */}
      <div
        className="absolute rounded-lg border-2 border-accent pointer-events-none transition-all duration-300"
        style={{
          left: sx,
          top: sy,
          width: sw,
          height: sh,
          boxShadow: "0 0 0 4px rgba(45,107,79,0.25), 0 0 20px rgba(45,107,79,0.15)",
        }}
      />

      {/* Tooltip card */}
      <div
        className="absolute transition-all duration-300"
        style={{
          ...tooltipStyle,
          pointerEvents: "auto",
        }}
      >
        <div
          className="bg-panel border border-border rounded-xl shadow-2xl w-[320px] overflow-hidden"
          style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.18)" }}
        >
          {/* Progress bar */}
          <div className="h-1 bg-surface">
            <div
              className="h-full bg-accent transition-all duration-300 rounded-full"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>

          <div className="p-5">
            <div className="text-sm font-semibold mb-1.5">{currentStep.title}</div>
            <p className="text-xs text-muted leading-relaxed mb-4">
              {currentStep.body}
            </p>

            <div className="flex items-center justify-between">
              <button
                onClick={dismiss}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Pomiń
              </button>

              <div className="flex items-center gap-2">
                {/* Step dots */}
                <div className="flex gap-1 mr-2">
                  {STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`w-1.5 h-1.5 rounded-full transition-colors ${
                        i === step ? "bg-accent" : i < step ? "bg-accent/40" : "bg-border"
                      }`}
                    />
                  ))}
                </div>

                {step > 0 && (
                  <button onClick={prev} className="btn btn-sm" style={{ padding: "4px 10px" }}>
                    ←
                  </button>
                )}
                <button
                  onClick={next}
                  className="btn btn-sm btn-primary"
                  style={{ padding: "4px 14px" }}
                >
                  {isLast ? "Zaczynamy!" : "Dalej →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function computeTooltipPosition(
  position: TourStep["position"],
  rect: DOMRect,
  _sw: number,
  _sh: number,
  sx: number,
  sy: number,
): React.CSSProperties {
  const gap = 16;
  const tooltipW = 320;
  const tooltipH = 180;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;

  const clampX = (x: number) => Math.max(12, Math.min(x, vw - tooltipW - 12));
  const clampY = (y: number) => Math.max(12, Math.min(y, vh - tooltipH - 12));

  switch (position) {
    case "bottom":
      return {
        left: clampX(sx + _sw / 2 - tooltipW / 2),
        top: clampY(sy + _sh + gap),
      };
    case "top":
      return {
        left: clampX(sx + _sw / 2 - tooltipW / 2),
        top: clampY(sy - tooltipH - gap),
      };
    case "left":
      return {
        left: clampX(sx - tooltipW - gap),
        top: clampY(sy + _sh / 2 - 80),
      };
    case "right":
      return {
        left: clampX(sx + _sw + gap),
        top: clampY(sy + _sh / 2 - 80),
      };
  }
}
