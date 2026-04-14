# HydroLogix — Hydration Benchmark Dashboard

HydroLogix is an interactive hydration benchmarking app focused on hot, dry Southwest conditions.

## What it does

- Compares **User Intake** and an **Electrolyte Scenario** against a climate-adjusted hydration target
- Calculates baseline hydration from weight and age
- Applies environmental multipliers for:
  - temperature
  - humidity
  - dew point
  - altitude
  - activity level
- Applies a metabolic-window multiplier for hours since last intake
- Uses intake rate with metabolic window (`intake rate × hours since last intake`) to estimate effective intake volume
- Triggers a **High Demand** state when heat index crosses threshold
- Renders comparison cards, normalized bars, and actionable insights
- Auto-fills environmental factors from **city name only** in-browser (Open-Meteo geocoding + weather APIs)
- Supports a US/SI unit toggle for unit-based entries (weight, temperature, dew point, altitude, and intake rate)

## Core logic

- `calculateEvaporativeDemand(...)` isolates environmental burden logic
- `calculateHydrationBenchmark(...)` computes top-level benchmark demand
- `render()` orchestrates card/chart/insight updates

## Data model guidance

Use hydration intake records shaped like:

- `timestamp` (ISO-8601 string)
- `volume_ml` (number)
- `fluid_type_coefficient` (number)

## Run locally

### Browser-only (no server hosting)

1. Open `index.html` directly in your browser (or host as static files only).
2. Enter a city name only (for example, `Phoenix`) and click **Auto-fill Weather by City**.
3. Environmental factors are fetched client-side and applied to the hydration model.

### Optional Node local server

1. Install dependencies: `npm install`
2. Start server: `npm start`
3. Open: `http://localhost:3000`

## Test

- `npm test`

## Notes

This tool provides scenario guidance and is not medical advice.
