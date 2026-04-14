# HydroLogix — Travel Mode Analysis Dashboard

Repository: HydroLogix

Interactive dashboard for exploring cost, emissions, and time trade-offs across travel modes.

## What it covers

- Driving EV vs driving Hybrid vs driving SUV vs flying
- Occupancy effects (for example SUV with 2 occupants)
- Flight seat class impact (economy, premium economy, business)
- Door-to-door deadhead time and airport process time
- Value-of-time conversion into generalized travel cost
- Break-even distances for Cost, Carbon, and Time across modes

## How to run

1. Open `index.html` in your browser.
2. Adjust controls to model your scenario.
3. Review result cards and break-even insights.

### Airport distance estimator (client-side only)

The dashboard now computes trip distance directly in the browser using airport coordinates from `airports.json`.

- No serverless API required.
- No backend required.
- Use the **From** and **To** airport fields and click **Estimate Distance from Airports**.

The calculated great-circle distance updates the trip distance slider and downstream cost/carbon/time comparisons.

### Static hosting

This project is static-only and can be hosted on any static host (for example GitHub Pages).

If you use a static host, ensure `airports.json` and `airports-small.json` are included in the published files.

## Model notes

- Driving costs and emissions are allocated per traveler using occupancy.
- Flight fare and flight emissions scale with seat type multipliers.
- Generalized cost is calculated as:

  `generalized_cost = monetary_cost + value_of_time * travel_hours`

- Break-even distances are solved as linear intersections between two mode equations.

## Good experiments

- EV solo vs flight economy at 300 to 1,200 miles
- Hybrid solo vs flight economy for medium-haul trips
- SUV with 2 vs flight economy under high gas prices
- Business class flight vs EV with high value-of-time
- Cleaner vs dirtier electric grid scenarios

## Next characteristics to explore

- Reliability risk (delay probability and expected delay cost)
- Comfort score (seat quality, noise, personal space)
- Luggage constraints (fees, oversize handling, packing friction)
- First/last-mile burden (transfer count, parking search, curb wait)
- Energy refuel risk (charger/fuel station queues and detours)
- Risk-adjusted outcomes (average day vs worst-case travel day)
