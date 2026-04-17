"use client";

import { useEffect, useState } from "react";

const WELCOME_KEY = "vectrig_welcome_done";
const TOUR_KEY = "vectrig_tour_done";

const FEATURES: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: "✏",
    title: "Rysowanie modelu",
    body: "To jest główna ścieżka w tej prezentacji: szkicujesz obrys w naszej nomenklaturze (typy ścian, piętra, otwory). Od tego modelu idzie wycena i — co kluczowe — generowanie DXF z ustalonymi warstwami i zakresem.",
  },
  {
    icon: "🪟",
    title: "Okna i drzwi z kontrolą pozycji",
    body: "Kliknij w ścianę, wybierz komponent z katalogu i dokładnie ustaw pozycję i wysokość parapetu. System ostrzega o kolizjach.",
  },
  {
    icon: "🏗",
    title: "Piętra i stropy hybrydowe",
    body: "Duplikuj piętra, odłączaj strop od obrysu ścian, wycinaj w nim dowolne otwory — idealne pod antresole i klatki schodowe.",
  },
  {
    icon: "📐",
    title: "Schody z automatycznym cutoutem",
    body: "Wstaw schody kliknięciem — sami policzą wysokość stopnia i wytną odpowiedni otwór w stropie piętra powyżej.",
  },
  {
    icon: "🏠",
    title: "Dach z wypełnieniem szczytów",
    body: "Dach dwuspadowy lub jednospadowy dopasowuje górne ściany — CLT z trójkątnym szczytem idzie jako jedna płyta.",
  },
  {
    icon: "📊",
    title: "Zestawienie paneli CLT",
    body: "Zobacz jak ściana zostanie pocięta na panele — wraz z odpadem z ząbkowanych styków i czasem obróbki CNC.",
  },
  {
    icon: "💰",
    title: "Edytowalny cennik",
    body: "Dostosuj ceny typów CLT, komponentów i parametry CNC. Możesz też dodać własne pozycje (działa w obrębie tej sesji).",
  },
  {
    icon: "📤",
    title: "Generowanie DXF",
    body: "Z modelu zbudowanego w konfiguratorze powstaje plik DXF zgodny z naszą strukturą warstw i wybranym zakresem (ściany, stropy, dach, schody, zestawienie itd.). Przy pracy już w tej nomenklaturze macie możliwość dopasowania oczekiwań wobec wyjścia do CAD/CAM — to przewidywalna ścieżka produkcyjna.",
  },
  {
    icon: "📥",
    title: "Import DXF",
    body: "Pełny import z rynku to osobny, szeroki temat: różne biura, wersje plików i scenariusze — produkcyjnie łączymy to w spójny przepływ i nad tym pracujemy. W tej wersji pokazowej import jest uproszczony; najpewniejszy obieg to wczytanie DXF wygenerowanego z tej samej aplikacji — wspólna nomenklatura warstw, ten sam kontekst.",
  },
];

export default function WelcomeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const welcome = localStorage.getItem(WELCOME_KEY);
      const tour = localStorage.getItem(TOUR_KEY);
      // Pokazujemy przy pierwszej wizycie — starzy użytkownicy, którzy już
      // skończyli tour, nie dostaną modalu.
      if (!welcome && !tour) {
        setVisible(true);
      }
    } catch {
      // localStorage zablokowany — po prostu pokaż modal.
      setVisible(true);
    }
  }, []);

  function markDone(value: "skipped" | "toured") {
    try {
      localStorage.setItem(WELCOME_KEY, value);
    } catch {
      // ignore
    }
    setVisible(false);
  }

  function startTour() {
    markDone("toured");
    // Mały delay, żeby modal zdążył się zamknąć przed podświetleniem spotlightu.
    setTimeout(() => {
      try {
        localStorage.removeItem(TOUR_KEY);
      } catch {}
      window.dispatchEvent(new CustomEvent("vectrig:tour-restart"));
    }, 150);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-panel border border-border rounded-2xl shadow-2xl max-w-xl w-full my-8">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-baseline gap-3">
            <div className="text-2xl font-bold tracking-tight">Vectrig</div>
            <div className="text-xs uppercase tracking-widest text-accent">
              wersja pokazowa
            </div>
          </div>
          <h1 className="text-xl font-semibold mt-2">
            Witaj w konfiguratorze domów z CLT
          </h1>
          <p className="text-sm text-muted mt-1">
            Pokazujemy przede wszystkim <strong>rysowanie modelu i generowanie DXF</strong> na
            naszej nomenklaturze — to daje przewidywalny plik wyjściowy.{" "}
            <strong>Import</strong> cudzych DXF w pełnej produkcji jest świadomie rozbudowany
            pod wiele scenariuszy; tutaj jest uproszczony, z myślą o obrocie z własnym eksportem.
          </p>
        </div>

        {/* Demo note */}
        <div className="p-5 border-b border-border bg-amber-500/5">
          <div className="flex gap-3">
            <div className="text-amber-400 text-lg leading-none">⚠</div>
            <div className="text-xs text-amber-100/90 leading-relaxed space-y-2">
              <p>
                <strong className="text-amber-200">To nie jest pełny produkt</strong> — jest to{" "}
                <strong>wersja pokazowa opracowana na podstawie naszej wiedzy</strong> i
                doświadczenia projektowego. Docelowa, produkcyjna wersja Vectrig jest{" "}
                <em>znacznie bardziej rozbudowana</em> i obejmuje wiele funkcji wykraczających
                poza ten pokaz.
              </p>
              <p>
                <strong>Cel tej prezentacji</strong> — pokazać{" "}
                <em>rysowanie → model → generowanie DXF</em> w ustalonej konwencji warstw i typów,
                tak aby plik wyjściowy dało się sensownie zapiąć z oczekiwaniami produkcyjnymi.
                Import obcych podkładów w pełnym produkcie wymaga szerszej obsługi przypadków —
                tu pokazujemy kierunek; najprostsza pętla w demo to eksport i ponowny import
                tego samego pliku. Projekt w przeglądarce <em>nie jest zapisywany</em> na serwerze;
                aby zachować wyniki, użyj eksportu DXF. Zmiany w cenniku wracają po odświeżeniu.
              </p>
            </div>
          </div>
        </div>

        {/* Features list */}
        <div className="p-5 border-b border-border">
          <div className="text-xs font-medium text-muted mb-3">
            Co obejmuje ta wersja pokazowa
          </div>
          <ul className="space-y-2.5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3 text-sm">
                <span className="text-lg leading-none mt-0.5 shrink-0">
                  {f.icon}
                </span>
                <div className="flex-1">
                  <div className="font-medium">{f.title}</div>
                  <div className="text-xs text-muted leading-relaxed">{f.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Start steps */}
        <div className="p-5 border-b border-border bg-surface/50">
          <div className="text-xs font-medium text-muted mb-2">Jak zacząć</div>
          <ol className="text-sm space-y-1.5 list-decimal list-inside">
            <li>
              Wybierz gotowy kształt (Prostokąt / L) lub narysuj ściany ołówkiem.
            </li>
            <li>
              Kliknij w ścianę, aby dodać okna i drzwi — możesz też łamać ścianę
              skrótem ⌥ / ⌘ / Ctrl + klik (Option / Command / Control).
            </li>
            <li>
              Otwórz <em>Zestawienie</em> i <em>Dach</em>, dopasuj cennik, a na koniec
              wyeksportuj DXF.
            </li>
          </ol>
        </div>

        {/* Actions */}
        <div className="p-5 flex items-center gap-2 justify-end">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => markDone("skipped")}
          >
            Zaczynam sam
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={startTour}
          >
            Pokaż mi jak →
          </button>
        </div>
      </div>
    </div>
  );
}
