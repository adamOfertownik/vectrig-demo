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
    <div className="bg-amber-500/10 border-b border-amber-500/40 text-amber-200 text-xs px-4 py-1.5 flex items-center gap-3">
      <span className="text-amber-400">⚠</span>
      <span className="flex-1">
        <strong className="text-amber-100">To jest wersja demonstracyjna.</strong>{" "}
        Projekt żyje w przeglądarce i nie jest zapisywany na serwerze — aby zachować pracę,
        wyeksportuj DXF. Ceny edytowane w cenniku wracają do wartości domyślnych po
        odświeżeniu strony.
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="text-amber-300 hover:text-amber-100 leading-none text-lg"
        title="Schowaj na tę sesję"
      >
        ×
      </button>
    </div>
  );
}
