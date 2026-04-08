const seatProfiles = {
  economy: { costMultiplier: 1, co2Multiplier: 1, label: "Economy" },
  premium: { costMultiplier: 1.45, co2Multiplier: 1.3, label: "Premium Econ" },
  business: { costMultiplier: 2.45, co2Multiplier: 1.9, label: "Business" },
};

const DEFAULT_FLIGHT_SPEED = 500; // mph, used when no user input is provided
const DEFAULT_DRIVE_SPEED = 58; // mph, typical average used when unknown

const ids = [
  "fromCity",
  "toCity",
  "departDate",
  "returnDate",
  "travelMode",
  "passengers",
  "distanceMiles",
  "passengerWage",
  "wageTimeFactor",
  "gasPrice",
  "electricityPrice",
  "publicElectricityPrice",
  "publicChargeShare",
  "gridIntensity",
  "seatType",
  "vehicleType",
  "driveSpeed",
  "driveFixedCost",
  "driveDeadheadHours",
  "airfareTotal",
  "flightFixedTime",
  "flightCo2PerMile",
];

const state = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const tripEstimateEl = document.getElementById("tripEstimate");
const cardsEl = document.getElementById("cards");
const chartEl = document.getElementById("barChart");
const insightListEl = document.getElementById("insightList");
const ideaListEl = document.getElementById("ideaList");
const effectiveVotEl = document.getElementById("effectiveVot");
const effectiveFlightFareEl = document.getElementById("effectiveFlightFare");

const comparisonIdeas = [
  "Reliability risk: probability and expected delay costs from weather or congestion.",
  "Comfort score: personal space, noise, and seat quality converted to utility points.",
  "Luggage and gear penalty: baggage fees, oversize handling, or rooftop drag impacts.",
  "First/last-mile complexity: transfers, rideshare dependency, and parking search time.",
  "Charging or fueling resilience: station availability, queue time, and detour distance.",
  "Total trip risk-adjusted cost: average plus worst-case 90th percentile travel day.",
];

function value(id) {
  const input = state[id];
  if (!input) return null;
  const t = input.type;
  if (t === "select-one" || t === "text" || t === "date") {
    return input.value;
  }
  return Number(input.value);
}

function money(v) {
  return `$${v.toFixed(2)}`;
}

function num(v, digits = 2) {
  return Number(v).toFixed(digits);
}

function buildModeModels() {
  const seat = seatProfiles[value("seatType")];
  const gasPrice = value("gasPrice");
  const privateElectricPrice = value("electricityPrice");
  const publicElectricPrice = value("publicElectricityPrice");
  const publicChargeShare = value("publicChargeShare") / 100;
  const electricPrice = privateElectricPrice * (1 - publicChargeShare) + publicElectricPrice * publicChargeShare;
  const gridIntensity = value("gridIntensity");
  const vehicleType = value("vehicleType") || "midsize";
  let driveSpeed = Number(value("driveSpeed"));
  if (!driveSpeed || Number.isNaN(driveSpeed) || driveSpeed <= 0) {
    driveSpeed = DEFAULT_DRIVE_SPEED;
  }
  const driveFixedCost = value("driveFixedCost");
  const driveDeadhead = value("driveDeadheadHours");
  const passengers = Math.max(1, Number(value("passengers") || 1));

  const vehicleProfiles = {
    small: { kind: "gas", mpg: 35, label: "Small car" },
    midsize: { kind: "gas", mpg: 28, label: "Midsize car" },
    suv: { kind: "gas", mpg: 22, label: "SUV" },
    hybrid: { kind: "gas", mpg: 45, label: "Hybrid" },
    ev: { kind: "ev", kwhPerMile: 0.31, label: "EV" },
  };

  const profile = vehicleProfiles[vehicleType] || vehicleProfiles.midsize;

  let driveCostPerMile = 0;
  let driveCo2PerMile = 0;
  const hoursPerMileDrive = 1 / driveSpeed;

  if (profile.kind === "ev") {
    driveCostPerMile = (profile.kwhPerMile * electricPrice) / passengers;
    driveCo2PerMile = (profile.kwhPerMile * gridIntensity) / passengers;
  } else {
    driveCostPerMile = (gasPrice / profile.mpg) / passengers;
    driveCo2PerMile = (8.887 / profile.mpg) / passengers;
  }

  const airfareTotal = Number(value("airfareTotal") || 0);
  const flightFixedTime = value("flightFixedTime");
  const flightCo2PerMile = value("flightCo2PerMile");

  return [
    {
      id: "drive",
      name: `Drive ${profile.label} (${passengers} occ.)`,
      tags: ["Drive", profile.kind === "ev" ? "Electric" : "Gas"],
      fixedCost: driveFixedCost / passengers,
      costPerMile: driveCostPerMile,
      fixedTime: driveDeadhead,
      hoursPerMile: hoursPerMileDrive,
      fixedCo2: 0,
      co2PerMile: driveCo2PerMile,
    },
    {
      id: "flight",
      name: `Fly ${seat.label}`,
      tags: ["Flight"],
      fixedCost: airfareTotal * seat.costMultiplier,
      costPerMile: 0,
      fixedTime: flightFixedTime,
      hoursPerMile: 1 / DEFAULT_FLIGHT_SPEED,
      fixedCo2: 0,
      co2PerMile: flightCo2PerMile * seat.co2Multiplier,
    },
  ];
}

function evaluateMode(mode, distance, valueOfTime) {
  const monetaryCost = mode.fixedCost + mode.costPerMile * distance;
  const hours = mode.fixedTime + mode.hoursPerMile * distance;
  const co2 = mode.fixedCo2 + mode.co2PerMile * distance;
  return {
    ...mode,
    distance,
    monetaryCost,
    hours,
    co2,
    generalizedCost: monetaryCost + valueOfTime * hours,
  };
}

function winnerId(results, key) {
  return results.reduce((best, cur) => (cur[key] < best[key] ? cur : best), results[0]).id;
}

function buildCard(result, flags, index) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.animationDelay = `${0.05 * index}s`;

  const pills = [];
  if (flags.bestCost === result.id) pills.push('<span class="pill best-cost">Lowest $</span>');
  if (flags.bestCo2 === result.id) pills.push('<span class="pill best-co2">Lowest CO2</span>');
  if (flags.bestTime === result.id) pills.push('<span class="pill best-time">Fastest</span>');

  card.innerHTML = `
    <h4>${result.name}</h4>
    <div>${pills.join(" ")}</div>
    <p class="metric">Monetary cost: <strong>${money(result.monetaryCost)}</strong></p>
    <p class="metric">Carbon: <strong>${num(result.co2)} kg</strong></p>
    <p class="metric">Door-to-door time: <strong>${num(result.hours)} h</strong></p>
    <p class="metric">Generalized cost ($ + time): <strong>${money(result.generalizedCost)}</strong></p>
  `;
  return card;
}

function normalizedBars(results) {
  const dims = [
    { key: "monetaryCost", label: "Cost", cls: "cost", suffix: "$" },
    { key: "co2", label: "Environment", cls: "co2", suffix: "kg" },
    { key: "hours", label: "Time", cls: "time", suffix: "h" },
  ];

  chartEl.innerHTML = "";

  dims.forEach((dim) => {
    const max = Math.max(...results.map((r) => r[dim.key]));

    const dimLabel = dim.label === "CO2" ? "Carbon" : dim.label;
    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const pct = max === 0 ? 0 : (r[dim.key] / max) * 100;

      row.innerHTML = `
        <span>${r.name}</span>
        <div class="bar-wrap"><div class="bar ${dim.cls}" style="width:${pct}%;"></div></div>
        <span>${dimLabel}: ${num(r[dim.key])} ${dim.suffix}</span>
      `;
      chartEl.appendChild(row);
    });
  });
}

function breakEvenDistance(a, b, key) {
  const denom = a[key].perMile - b[key].perMile;
  if (Math.abs(denom) < 1e-9) {
    return null;
  }
  const d = (b[key].fixed - a[key].fixed) / denom;
  if (d <= 0 || !Number.isFinite(d)) {
    return null;
  }
  return d;
}

function buildCostModel(result, valueOfTime) {
  return {
    cost: {
      fixed: result.fixedCost,
      perMile: result.costPerMile,
    },
    co2: {
      fixed: result.fixedCo2,
      perMile: result.co2PerMile,
    },
    generalized: {
      fixed: result.fixedCost + valueOfTime * result.fixedTime,
      perMile: result.costPerMile + valueOfTime * result.hoursPerMile,
    },
  };
}

function buildInsights(results, valueOfTime) {
  const modeById = Object.fromEntries(results.map((r) => [r.id, r]));
  const drive = modeById.drive;
  const flight = modeById.flight;

  const driveModel = buildCostModel(drive, valueOfTime);
  const flightModel = buildCostModel(flight, valueOfTime);

  const insights = [];

  const costDriveFlight = breakEvenDistance(driveModel, flightModel, "cost");
  const co2DriveFlight = breakEvenDistance(driveModel, flightModel, "co2");
  const genDriveFlight = breakEvenDistance(driveModel, flightModel, "generalized");

  if (costDriveFlight) {
    insights.push(`Drive vs flight cost break-even: ~${num(costDriveFlight, 0)} miles.`);
  } else {
    insights.push("Drive vs flight cost: no positive break-even in current assumptions.");
  }

  if (co2DriveFlight) {
    insights.push(`Drive vs flight carbon break-even: ~${num(co2DriveFlight, 0)} miles.`);
  } else {
    insights.push("Drive vs flight carbon: one mode stays cleaner across the full range.");
  }

  if (genDriveFlight) {
    insights.push(`Drive vs flight generalized value break-even: ~${num(genDriveFlight, 0)} miles.`);
  } else {
    insights.push("Drive vs flight generalized value: no positive switching point under current time value.");
  }

  const lowestGeneralized = results.reduce((best, r) => (r.generalizedCost < best.generalizedCost ? r : best), results[0]);
  insights.push(`At ${num(results[0].distance, 0)} miles, best combined money+time mode is ${lowestGeneralized.name}.`);

  return insights;
}

function render() {
  const distance = value("distanceMiles");
  const valueOfTime = value("passengerWage") * (value("wageTimeFactor") / 100);

  const results = buildModeModels().map((mode) => evaluateMode(mode, distance, valueOfTime));

  const flags = {
    bestCost: winnerId(results, "monetaryCost"),
    bestCo2: winnerId(results, "co2"),
    bestTime: winnerId(results, "hours"),
  };

  cardsEl.innerHTML = "";
  results.forEach((result, index) => cardsEl.appendChild(buildCard(result, flags, index)));

  normalizedBars(results);

  const insights = buildInsights(results, valueOfTime);
  insightListEl.innerHTML = insights.map((msg) => `<li>${msg}</li>`).join("");
  ideaListEl.innerHTML = comparisonIdeas.map((msg) => `<li>${msg}</li>`).join("");
  effectiveVotEl.textContent = `${money(valueOfTime)}/hour`;

  const seat = seatProfiles[value("seatType")];
  const airfare = Number(value("airfareTotal") || 0) * seat.costMultiplier;
  const effectivePerMile = distance > 0 ? airfare / distance : 0;
  effectiveFlightFareEl.textContent = `${money(effectivePerMile)}/mi`;

  updateOutputLabels();
}

async function fetchTripEstimate() {
  if (!state.fromCity || !state.toCity) {
    if (tripEstimateEl) tripEstimateEl.textContent = 'Please enter both origin and destination.';
    return;
  }

  // If the user opened the static file directly (file://) or is serving
  // the site from a static host (GitHub Pages), POST to /api/estimate will fail.
  // Provide a clearer, actionable message in that case.
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    if (tripEstimateEl)
      tripEstimateEl.innerHTML =
        'Live estimates require the Node proxy. Run <code>npm install</code> and <code>npm start</code>, then open <a href="http://localhost:3000">http://localhost:3000</a> to use the feature.';
    return;
  }

  const payload = {
    from: value('fromCity'),
    to: value('toCity'),
    departDate: value('departDate'),
    returnDate: value('returnDate'),
    mode: state.travelMode ? state.travelMode.value : 'flight',
    passengers: Number(state.passengers ? state.passengers.value : 1),
    seatType: state.seatType ? state.seatType.value : 'economy',
    gasPrice: value('gasPrice'),
  };

  if (tripEstimateEl) tripEstimateEl.textContent = 'Fetching estimate...';

  try {
    const resp = await fetch('/api/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text();

      // 405 usually means the origin doesn't allow POST (common when the
      // static site is hosted without the API). Give the user actionable steps.
      if (resp.status === 405) {
        if (tripEstimateEl)
          tripEstimateEl.innerHTML =
            `Estimate failed: ${resp.status} Not Allowed. This typically means the API endpoint isn't reachable from this origin (for example: opening index.html directly or serving from a static host that doesn't proxy requests).\n\n` +
            `Run the local server in the project directory with <code>npm install</code> then <code>npm start</code>, and open <a href="http://localhost:3000">http://localhost:3000</a>.` +
            (txt ? `<div class="muted">Response: ${txt}</div>` : '');
        return;
      }

      if (tripEstimateEl) tripEstimateEl.textContent = `Estimate failed: ${resp.status} ${txt}`;
      return;
    }

    const data = await resp.json();
    displayEstimate(data);
  } catch (err) {
    if (tripEstimateEl) tripEstimateEl.textContent = `Estimate error: ${err.message}`;
  }
}

function displayEstimate(data) {
  if (!tripEstimateEl) return;
  if (!data || !data.estimates) {
    tripEstimateEl.textContent = 'No estimate available.';
    return;
  }

  const parts = [];
  parts.push(`<strong>Estimated distance:</strong> ${num(data.distanceMiles, 1)} mi`);
  data.estimates.forEach((e) => {
    parts.push(`<div class="estimate-row"><strong>${e.mode.toUpperCase()}</strong>: ${money(e.price)} ${e.currency ?? ''} <span class="muted">(${e.provider ?? 'mock'})</span></div>`);
  });

  tripEstimateEl.innerHTML = parts.join('');
}

function updateOutputLabels() {
  document.querySelectorAll("[data-output]").forEach((node) => {
    const id = node.getAttribute("data-output");
    const v = value(id);

    const unitMap = {
      distanceMiles: `${num(v, 0)} mi`,
      passengerWage: `$${num(v, 0)}/h`,
      wageTimeFactor: `${num(v, 0)}%`,
      gasPrice: `$${num(v)}/gal`,
      electricityPrice: `$${num(v)}/kWh`,
      publicElectricityPrice: `$${num(v)}/kWh`,
      publicChargeShare: `${num(v, 0)}%`,
      gridIntensity: `${num(v)} kg/kWh`,
      airfareTotal: `$${num(v, 0)}`,
      driveSpeed: `${num(v, 0)} mph`,
      driveFixedCost: `$${num(v, 0)}/trip`,
      driveDeadheadHours: `${num(v)} h`,
      flightFixedTime: `${num(v)} h`,
      flightCo2PerMile: `${num(v)} kg/mi`,
    };

    node.textContent = unitMap[id] ?? String(v);
  });
}

ids.forEach((id) => {
  const el = state[id];
  if (!el) return;
  el.addEventListener("input", render);
  el.addEventListener("change", render);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  const defaults = {
    distanceMiles: "600",
    passengerWage: "35",
    wageTimeFactor: "100",
    gasPrice: "3.9",
    electricityPrice: "0.14",
    publicElectricityPrice: "0.48",
    publicChargeShare: "40",
    gridIntensity: "0.38",
    seatType: "economy",
    vehicleType: "midsize",
    passengers: "1",
    driveSpeed: "58",
    driveFixedCost: "25",
    driveDeadheadHours: "0.4",
    airfareTotal: "200",
    flightFixedTime: "2.4",
    flightCo2PerMile: "0.22",
  };

  Object.entries(defaults).forEach(([id, val]) => {
    if (state[id]) state[id].value = val;
  });

  render();
});

const estimateBtn = document.getElementById('getEstimateBtn');
if (estimateBtn) estimateBtn.addEventListener('click', fetchTripEstimate);

render();
