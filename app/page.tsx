import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="text-accent text-sm font-semibold mb-3 tracking-wide uppercase">
          Vectrig
        </div>
        <h1 className="text-4xl font-bold mb-4 leading-tight">
          Konfigurator Domów CLT
        </h1>
        <p className="text-secondary text-lg leading-relaxed mb-8">
          Skonfiguruj dom z drewna CLT krok po kroku: ściany, piętra, dach.
          Wycena na podstawie kubatury (m³). Podgląd 3D w czasie rzeczywistym.
        </p>

        <div className="space-y-3 mb-10">
          <FeatureCard
            title="Wizard krok po kroku"
            desc="6 kroków: ustawienia → obrys → ściany wewn. → otwory → piętra → dach"
          />
          <FeatureCard
            title="Wycena kubaturowa (m³)"
            desc="Otwory odejmują drewno CLT. BRE deterministyczny, zero AI w wycenie."
          />
          <FeatureCard
            title="Podgląd 3D"
            desc="Bryła domu z Three.js. Ściany, stropy, dach — wszystko w czasie rzeczywistym."
          />
          <FeatureCard
            title="Kafelki jak Wintergarten"
            desc="FEST, HS, Okno Uchylne, Sklejka — wybierz typ, dodaj counter, ustaw wymiar."
          />
        </div>

        <Link
          href="/configurator"
          className="btn btn-primary inline-flex items-center gap-2 text-base px-8 py-3"
        >
          Otwórz konfigurator →
        </Link>
      </div>
    </main>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="card card-compact">
      <div className="font-medium mb-0.5">{title}</div>
      <div className="text-sm text-secondary">{desc}</div>
    </div>
  );
}
