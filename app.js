const seatProfiles = {
  economy: { costMultiplier: 1, co2Multiplier: 1, label: "Economy" },
  premium: { costMultiplier: 1.45, co2Multiplier: 1.3, label: "Premium Econ" },
  business: { costMultiplier: 2.45, co2Multiplier: 1.9, label: "Business" },
};

const DEFAULT_FLIGHT_SPEED = 500; // mph, used when no user input is provided
const DEFAULT_DRIVE_SPEED = 58; // mph, typical average used when unknown
const AVG_SPEEDS = { train: 80, bus: 50, ferry: 30 };
const CO2_PER_MILE = { train: 0.05, bus: 0.12, ferry: 0.04 };

const ids = [
  "fromCity",
  "toCity",
  "departDate",
  "returnDate",
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

// Airport lists: small subset for fast datalist load, and full list for fuzzy search (loaded lazily)
let airportsSmall = [];
let airportsFull = null;
let airportsFullLoaded = false;
let airportsLoadingPromise = null;
const SUGGESTION_MAX = 8;
const suggestionDebounce = {};

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function resolveAirport(query, list) {
  if (!query) return null;
  const qRaw = String(query).trim();
  if (!qRaw) return null;
  const q = qRaw.toLowerCase();

  const codeMatch = qRaw.toUpperCase().match(/\b([A-Z]{3})\b/);
  if (codeMatch) {
    const code = codeMatch[1].toLowerCase();
    const found = list.find((a) => String(a.code || '').toLowerCase() === code);
    if (found) return found;
  }

  const exact = list.find((a) => String(a.code || '').toLowerCase() === q || String(a.name || '').toLowerCase() === q);
  if (exact) return exact;

  return list.find((a) => String(a.code || '').toLowerCase().includes(q) || String(a.name || '').toLowerCase().includes(q)) || null;
}

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

  if (tripEstimateEl) tripEstimateEl.textContent = 'Estimating distance...';

  try {
    await ensureAirportsFull();
    const sourceList = Array.isArray(airportsFull) && airportsFull.length ? airportsFull : airportsSmall;

    const fromMatch = resolveAirport(value('fromCity'), sourceList);
    const toMatch = resolveAirport(value('toCity'), sourceList);

    if (!fromMatch || !toMatch) {
      if (tripEstimateEl) {
        tripEstimateEl.textContent = 'Could not match one or both airports. Try a city name or IATA code (e.g., SEA, PHX).';
      }
      return;
    }

    const distanceMiles = Math.round(haversine(fromMatch.lat, fromMatch.lon, toMatch.lat, toMatch.lon) * 10) / 10;

    state.fromCity.value = `${fromMatch.name} (${fromMatch.code})`;
    state.toCity.value = `${toMatch.name} (${toMatch.code})`;
    if (state.distanceMiles) {
      state.distanceMiles.value = Math.round(distanceMiles);
    }

    displayEstimate({
      distanceMiles,
      from: {
        ...fromMatch,
        display: `${fromMatch.name} (${fromMatch.code})`,
      },
      to: {
        ...toMatch,
        display: `${toMatch.name} (${toMatch.code})`,
      },
    });
    render();
  } catch (err) {
    if (tripEstimateEl) tripEstimateEl.textContent = `Estimate error: ${err.message}`;
  }
}

function displayEstimate(data) {
  if (!tripEstimateEl) return;
  const parts = [];
  if (data && data.from) {
    const f = data.from;
    parts.push(`<div><strong>From:</strong> ${f.display || `${f.name} (${f.code})`} ${f.lat ? `&nbsp;<span class="muted">(${num(f.lat,3)}, ${num(f.lon,3)})</span>` : ''}</div>`);
  }
  if (data && data.to) {
    const t = data.to;
    parts.push(`<div><strong>To:</strong> ${t.display || `${t.name} (${t.code})`} ${t.lat ? `&nbsp;<span class="muted">(${num(t.lat,3)}, ${num(t.lon,3)})</span>` : ''}</div>`);
  }
  if (data && typeof data.distanceMiles === 'number') {
    parts.push(`<strong>Estimated distance:</strong> ${num(data.distanceMiles, 1)} mi`);
  }
  if (parts.length === 0) {
    tripEstimateEl.textContent = 'No estimate available.';
    return;
  }

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

async function loadAirports() {
  const airportsListEl = document.getElementById("airportsList");
  if (!airportsListEl) return;
  try {
    const res = await fetch("airports-small.json");
    if (!res.ok) return;
    const airports = await res.json();
    airportsSmall = airports;
    airports.forEach((a) => {
      const option = document.createElement("option");
      // Show name (code) as the visible value when selected
      option.value = `${a.name} (${a.code})`;
      option.textContent = `${a.name} (${a.code})`;
      airportsListEl.appendChild(option);
    });
  } catch (e) {
    console.warn("Failed to load airports list", e);
  }
}

loadAirports();
render();

// Lazy-load the full airports list for fuzzy searching when needed
function ensureAirportsFull() {
  if (airportsFullLoaded) return Promise.resolve(airportsFull);
  if (airportsLoadingPromise) return airportsLoadingPromise;
  airportsLoadingPromise = fetch('airports.json')
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => {
      airportsFull = list || [];
      airportsFullLoaded = true;
      airportsLoadingPromise = null;
      return airportsFull;
    })
    .catch((err) => {
      console.warn('Failed to load full airports list', err);
      airportsFull = [];
      airportsFullLoaded = true;
      airportsLoadingPromise = null;
      return airportsFull;
    });
  return airportsLoadingPromise;
}

function fuzzySearchAirports(q, maxResults = SUGGESTION_MAX) {
  if (!q) return [];
  const qq = q.toLowerCase();
  const results = [];
  // prioritize exact code, startsWith name/code, then includes
  const exactCode = airportsFull.find((a) => a.code.toLowerCase() === qq);
  if (exactCode) results.push(exactCode);

  const starts = [];
  const includes = [];
  for (const a of airportsFull) {
    const name = (a.name || '').toLowerCase();
    const code = (a.code || '').toLowerCase();
    if (code === qq) continue; // already added
    if (name.startsWith(qq) || code.startsWith(qq)) starts.push(a);
    else if (name.includes(qq) || code.includes(qq)) includes.push(a);
  }

  starts.sort((x, y) => x.name.localeCompare(y.name));
  includes.sort((x, y) => x.name.localeCompare(y.name));

  const merged = results.concat(starts, includes).slice(0, maxResults);
  return merged;
}

function renderSuggestions(suggestionsEl, items, inputEl) {
  suggestionsEl.innerHTML = '';
  if (!items || items.length === 0) {
    suggestionsEl.style.display = 'none';
    suggestionsEl.setAttribute('aria-hidden', 'true');
    return;
  }
  items.forEach((a, idx) => {
    const div = document.createElement('div');
    div.className = 'airport-suggestion-item';
    div.setAttribute('role', 'option');
    div.setAttribute('data-code', a.code);
    div.setAttribute('data-lat', a.lat || '');
    div.setAttribute('data-lon', a.lon || '');
    div.textContent = `${a.name} (${a.code})`;
    div.addEventListener('mousedown', (ev) => {
      // use mousedown to capture before blur
      ev.preventDefault();
      inputEl.value = `${a.name} (${a.code})`;
      suggestionsEl.innerHTML = '';
      suggestionsEl.style.display = 'none';
      suggestionsEl.setAttribute('aria-hidden', 'true');
      // update distance output if desired (keep current behaviour)
    });
    suggestionsEl.appendChild(div);
  });
  suggestionsEl.style.display = 'block';
  suggestionsEl.setAttribute('aria-hidden', 'false');
}

function hideSuggestions(el) {
  if (!el) return;
  el.innerHTML = '';
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
}

function handleAirportInput(e) {
  const inputEl = e.target;
  const id = inputEl.id;
  const suggestionsEl = document.getElementById(id === 'fromCity' ? 'fromSuggestions' : 'toSuggestions');
  const q = String(inputEl.value || '').trim();

  // If empty, hide
  if (!q) {
    hideSuggestions(suggestionsEl);
    return;
  }

  // If user typed a 3-letter IATA code, try to auto-complete immediately
  const iataMatch = q.match(/^([A-Za-z]{3})$/);
  if (iataMatch) {
    const code = iataMatch[1].toLowerCase();
    // try small list first (very fast)
    let found = airportsSmall.find((a) => a.code.toLowerCase() === code);
    const tryApply = (a) => {
      if (a) {
        inputEl.value = `${a.name} (${a.code})`;
        hideSuggestions(suggestionsEl);
      }
    };
    if (found) {
      tryApply(found);
      return;
    }
    // otherwise ensure full list and try
    ensureAirportsFull().then((list) => {
      const f = (list || []).find((a) => a.code.toLowerCase() === code);
      tryApply(f);
    });
    return;
  }

  // Debounce fuzzy search to keep UI snappy
  if (suggestionDebounce[id]) clearTimeout(suggestionDebounce[id]);
  suggestionDebounce[id] = setTimeout(() => {
    ensureAirportsFull().then(() => {
      const matches = fuzzySearchAirports(q, SUGGESTION_MAX);
      renderSuggestions(suggestionsEl, matches, inputEl);
    });
  }, 150);
}

function handleAirportKeydown(e) {
  const inputEl = e.target;
  const id = inputEl.id;
  const suggestionsEl = document.getElementById(id === 'fromCity' ? 'fromSuggestions' : 'toSuggestions');
  const items = suggestionsEl ? Array.from(suggestionsEl.querySelectorAll('.airport-suggestion-item')) : [];
  if (!items.length) return;
  const activeIdx = items.findIndex((it) => it.classList.contains('active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = (activeIdx + 1) % items.length;
    items.forEach((it) => it.classList.remove('active'));
    items[next].classList.add('active');
    items[next].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = activeIdx <= 0 ? items.length - 1 : activeIdx - 1;
    items.forEach((it) => it.classList.remove('active'));
    items[prev].classList.add('active');
    items[prev].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    if (activeIdx >= 0) {
      e.preventDefault();
      const sel = items[activeIdx];
      inputEl.value = sel.textContent;
      hideSuggestions(suggestionsEl);
    }
  } else if (e.key === 'Escape') {
    hideSuggestions(suggestionsEl);
  }
}

// Attach input handlers for both From and To fields
const fromEl = document.getElementById('fromCity');
const toEl = document.getElementById('toCity');
if (fromEl) {
  fromEl.addEventListener('input', handleAirportInput);
  fromEl.addEventListener('keydown', handleAirportKeydown);
  fromEl.addEventListener('blur', (ev) => setTimeout(() => hideSuggestions(document.getElementById('fromSuggestions')), 150));
}
if (toEl) {
  toEl.addEventListener('input', handleAirportInput);
  toEl.addEventListener('keydown', handleAirportKeydown);
  toEl.addEventListener('blur', (ev) => setTimeout(() => hideSuggestions(document.getElementById('toSuggestions')), 150));
}

render();
