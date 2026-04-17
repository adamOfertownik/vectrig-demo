"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "vectrig_demo_banner_dismissed";

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const flag = sessionStorage.getItem(SESSION_KEY);
      setDismissed(flag === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage może być zablokowany — trudno, zamykamy tylko lokalnie.
    }
    setDismissed(true);
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/40 text-gray-900 text-xs px-4 py-1.5 flex items-center gap-3">
      <span>⚠</span>
      <span className="flex-1">
        <strong>
          Wersja demonstracyjna — przygotowana na podstawie naszej wiedzy
          merytorycznej.
        </strong>
        <span className="text-gray-700">
          Pełny produkt Vectrig jest znacznie szerzej funkcjonalny; w tym demo
          akcent na <em>rysowanie modelu i generowanie DXF</em> w naszej
          nomenklaturze — import obcych plików to szerszy temat w produkcie.
          Projekt w przeglądarce nie jest zapisywany na serwerze — aby zachować
          pracę, wyeksportuj DXF. Ceny z cennika wracają do wartości domyślnych
          po odświeżeniu strony.
        </span>
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="text-gray-500 hover:text-gray-900 leading-none text-lg"
        title="Schowaj na tę sesję"
      >
        ×
      </button>
    </div>
  );
}
