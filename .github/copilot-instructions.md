# Copilot Refactor Primer: HydroLogix → Hydration Benchmark

You are assisting with a refactor of this repository from a **travel mode comparison** app into a **hydration benchmark** app.

## Mission

Preserve the app’s architecture and UI ergonomics while replacing travel-domain logic with hydration-domain logic.

- Keep existing interaction quality (cards, normalized comparison bars, insights).
- Favor incremental, backward-compatible refactors.
- Maintain semantic versioning discipline.

## Functional Mapping

Apply this mapping consistently when converting existing functions, labels, and variable names:

- **Distance/Route** → **Baseline Hydration Need** (weight/age-based starting point).
- **Weather/Traffic Delays** → **Environmental Multipliers** (heat index, dew point, altitude).
- **Fuel Efficiency** → **Fluid Coefficients** (water = 1.0, coffee = 0.8, electrolytes = 1.2).
- **Travel Duration** → **Metabolic Window** (time elapsed since last intake).

## Technical Requirements

1. **Logic isolation**
   - Keep environmental burden logic in a dedicated utility function:
     - `calculateEvaporativeDemand(...)`
   - Keep top-level benchmark logic in:
     - `calculateHydrationBenchmark(...)`

2. **Component reuse**
   - Reuse comparison-card and chart patterns currently used in the dashboard.
   - Adapt labels and displayed metrics to hydration language.
   - Replace mode cards with **User Intake** vs **Peer Benchmark** (and optional alternate fluid scenarios).

3. **Data structure**
   - Use JSON records containing:
     - `timestamp` (ISO-8601 string)
     - `volume_ml` (number)
     - `fluid_type_coefficient` (number)

4. **Return-shape compatibility**
   - When replacing existing core calculators, keep object return shapes as stable as possible so UI rendering code does not break.

## Phoenix Climate Constraint

This app targets Southwest desert conditions.

- Explicitly model extreme heat and dryness.
- If `tempF > 100` and/or humidity is very low (`< 15%`), increase hydration demand.
- Trigger a **High Demand** UI state when heat index exceeds threshold.

## Repository-Specific Refactor Guidance

Use existing code patterns in `app.js`:

- Replace or adapt `buildModeModels`, `evaluateMode`, `buildInsights`, and `buildCard` using hydration concepts.
- Preserve rendering pipeline shape:
  - `render()` orchestrates calculations and UI updates.
  - card rendering and normalized chart remain modular.
- Keep airport lookup and travel-specific estimation logic behind clear boundaries while refactoring:
  - Remove only when hydration equivalents are ready.

## Suggested Utility Skeleton

Use or adapt this implementation style:

```ts
interface EnvironmentalFactors {
  tempF: number;
  humidity: number;
  activityLevel: 'sedentary' | 'moderate' | 'active';
  altitudeFt?: number;
}

export const calculateEvaporativeDemand = (factors: EnvironmentalFactors): number => {
  let multiplier = 1.0;

  if (factors.tempF > 95) multiplier += 0.2;
  if (factors.humidity < 20) multiplier += 0.1;
  if ((factors.altitudeFt ?? 0) > 4000) multiplier += 0.05;
  if (factors.activityLevel === 'moderate') multiplier += 0.1;
  if (factors.activityLevel === 'active') multiplier += 0.2;

  return multiplier;
};

export const calculateHydrationBenchmark = (
  weightLbs: number,
  factors: EnvironmentalFactors
): number => {
  const baseOz = weightLbs * 0.5;
  const demandMultiplier = calculateEvaporativeDemand(factors);
  return baseOz * demandMultiplier;
};
```

## Refactor Prompting Tip

When editing a travel function, transform it with this intent:

> Refactor this function to calculate hydration benchmark. Replace gas/MPG/travel variables with temperature/body-weight/metabolic-window inputs, but keep return structure compatible with existing frontend cards and chart rendering.

## Implementation Style

- Prefer small, testable commits.
- Preserve naming clarity.
- Update test coverage when replacing core calculators.
- Keep accessibility attributes and UI affordances intact.
