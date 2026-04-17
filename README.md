# Vectrig — Demo konfiguratora CLT

Publiczna **wersja pokazowa** zbudowana na podstawie wiedzy zespołu — pełny produkt
jest znacznie szerzej rozbudowany funkcjonalnie. Kod demonstruje architekturę aplikacji
(Next.js 14 + TypeScript, katalog, kosztorys, generator DXF) oraz **dwa poziomy pracy z DXF**:

### Rysowanie i generowanie (główna ścieżka w demo)

Model powstaje w konfiguratorze w **naszej nomenklaturze** (typy ścian, warstwy semantyczne).
`dxf-writer` składa plik wyjściowy z możliwością wyboru zakresu — to droga do **przewidywalnego**
DXF zgodnego z ustalonymi oczekiwaniami (CAD/CAM).

### Import DXF (szerszy temat produkcyjny)

**Import** musi uwzględniać wiele scenariuszy (różne biura, konwencje warstw, wersje ACAD).
W repozytorium jest uproszczony parser + mapowanie warstw w UI; pełna obsługa jest rozwijana
w produkcie. Najprostszy spójny obieg w demo: **wygeneruj DXF z tej aplikacji i wczytaj go
ponownie** — wspólna struktura z generatorem.

## Jak uruchomić

```bash
npm install
npm run dev
```

Otwórz http://localhost:3000

## Architektura — 3 warstwy

### Warstwa 1: Pamięć (stan + model domeny)
- `lib/types.ts` — `Wall`, `Opening`, `Project`, `CatalogComponent`
- `lib/store.ts` — Zustand store, wszystkie mutacje projektu
- Wszystko w milimetrach. UI skaluje do pikseli przy renderze.

### Warstwa 2: Mózg (BRE — Business Rules Engine)
- `lib/catalog.ts` — katalog typów ścian i komponentów
- `lib/pricing.ts` — deterministyczny silnik wyceny
- **Zero AI.** Długość polilinii × wysokość − otwory × stawka. Koniec.

### Warstwa 3: Egzekucja (generowanie plików)
- `lib/dxf-writer.ts` — generator DXF z warstwami semantycznymi
- `app/api/generate-dxf/route.ts` — endpoint POST eksportu

### Asystent (opcjonalne AI)
- `lib/dxf-parser-wrapper.ts` — parser podkładu od klienta
- `app/api/parse-dxf/route.ts` — endpoint wczytania
- `app/api/ai-suggest/route.ts` — heurystyczne sugestie + pseudokod wywołania Claude API

## Flow pracy kosztorysanta

1. Klient przysyła DXF / PDF / link — wgrywasz przyciskiem **Wczytaj podkład DXF**
2. Rysunek klienta pojawia się jako półprzezroczyste niebieskie linie w tle
3. (opcjonalnie) **AI sugestie** — heurystyka proponuje ściany, akceptujesz klikiem
4. **Rysuj ścianę** — klikasz po podkładzie, Enter kończy polilinię
5. Wybierasz typ ściany z listy (CLT 120mm, 100mm, 80mm, strop)
6. Klikasz komponent w bibliotece (okno HS, drzwi) i wstawiasz w ścianę
7. Kosztorys po prawej liczy się na żywo (BRE)
8. **Generuj DXF produkcyjny** — plik z warstwami dla KLH

## Dlaczego tak, a nie parser uniwersalny

Projekt klienta to **inspiracja**, nie źródło danych. Kosztorysant "odrysowuje"
projekt w Waszym konfiguratorze — szybciej, bo ma podkład przed oczami.
Cała logika biznesowa zostaje u Was: Wasze katalogi, Wasze ceny, Wasze reguły.

Ten sam mechanizm działa dla CLT i dla ogrodów zimowych. Inna zawartość
`catalog.ts`, ta sama logika.

## Co dalej (poza tym demo)

- **Persystencja** — Prisma + PostgreSQL zamiast Zustand w pamięci
- **Multi-tenant** — schema per klient, izolacja danych
- **Anthropic API** — prawdziwe sugestie przez Claude Vision (patrz komentarz
  w `app/api/ai-suggest/route.ts`)
- **Three.js** — ekstrudowanie ścian do 3D z płaskiego DXF
- **BIM/IFC** — faza 2, parser `web-ifc` (trudniejszy, ale semantyczny)
- **Integracja KLH** — eksport w dokładnym formacie wymagane przez austriackie CNC
