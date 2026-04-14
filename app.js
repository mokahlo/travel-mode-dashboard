// Semantic versioning: major.minor.patch
// major = breaking changes, minor = new features, patch = fixes.
const APP_VERSION = "1.0.0";

const FLUID_COEFFICIENTS = {
  water: { coefficient: 1.0, label: "Water" },
  coffee: { coefficient: 0.8, label: "Coffee" },
  electrolyte: { coefficient: 1.2, label: "Electrolytes" },
};

const HIGH_DEMAND_HEAT_INDEX = 105;

const ids = [
  "unitSystem",
  "cityName",
  "weightLbs",
  "ageYears",
  "sexAssignedAtBirth",
  "acclimatizationLevel",
  "activityLevel",
  "tempF",
  "humidity",
  "dewPointF",
  "altitudeFt",
  "hoursSinceIntake",
  "intakeRate",
  "fluidType",
];

const state = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const cardsEl = document.getElementById("cards");
const chartEl = document.getElementById("barChart");
const insightListEl = document.getElementById("insightList");
const ideaListEl = document.getElementById("ideaList");
const tripEstimateEl = document.getElementById("tripEstimate");
const effectiveHeatIndexEl = document.getElementById("effectiveHeatIndex");
const effectiveEvapMultiplierEl = document.getElementById("effectiveEvapMultiplier");
const appVersionEl = document.getElementById("appVersion");
const weatherLocationEl = document.getElementById("weatherLocation");
const weatherStatusEl = document.getElementById("weatherStatus");
const loadWeatherBtn = document.getElementById("loadWeatherBtn");

if (appVersionEl) {
  appVersionEl.textContent = `v${APP_VERSION}`;
}

const comparisonIdeas = [
  "Track intake logs over rolling 24-hour windows for adherence trends.",
  "Add sweat-rate estimation from activity intensity and ambient conditions.",
  "Compare hydration gap trajectories for water vs electrolyte strategies.",
  "Include overnight recovery and next-day carryover effects.",
  "Model sodium replacement guidance alongside fluid intake.",
  "Add alerting when repeated High Demand windows occur in a week.",
];

function value(id) {
  const input = state[id];
  if (!input) return null;
  if (input.type === "select-one" || input.type === "text") return input.value;
  return Number(input.value);
}

function num(v, digits = 2) {
  return Number(v).toFixed(digits);
}

function mlToOz(ml) {
  return (Number(ml) || 0) * 0.033814;
}

function ozToMl(oz) {
  return (Number(oz) || 0) * 29.5735;
}

function lbsToKg(lbs) {
  return (Number(lbs) || 0) * 0.45359237;
}

function kgToLbs(kg) {
  return (Number(kg) || 0) * 2.2046226218;
}

function fToC(f) {
  return ((Number(f) || 0) - 32) * (5 / 9);
}

function cToF(c) {
  return (Number(c) || 0) * (9 / 5) + 32;
}

function ftToM(ft) {
  return (Number(ft) || 0) * 0.3048;
}

function mToFt(m) {
  return (Number(m) || 0) * 3.28084;
}

function unitSystem() {
  return String(value("unitSystem") || "us").toLowerCase() === "si" ? "si" : "us";
}

function clamp(valueToClamp, min, max) {
  return Math.max(min, Math.min(max, valueToClamp));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function weatherStatus(message, isError = false) {
  if (!weatherStatusEl) return;
  const safe = escapeHtml(message);
  weatherStatusEl.innerHTML = isError
    ? `<span style="color:#ffb4b4;">${safe}</span>`
    : safe;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function setFieldIfFinite(fieldId, value, transform = (v) => v) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return false;
  if (!state[fieldId]) return false;
  state[fieldId].value = String(transform(numeric));
  return true;
}

function getWeightLbsCanonical() {
  const raw = Number(value("weightLbs") || 0);
  return unitSystem() === "si" ? kgToLbs(raw) : raw;
}

function getTempFCanonical() {
  const raw = Number(value("tempF") || 0);
  return unitSystem() === "si" ? cToF(raw) : raw;
}

function getDewPointFCanonical() {
  const raw = Number(value("dewPointF") || 0);
  return unitSystem() === "si" ? cToF(raw) : raw;
}

function getAltitudeFtCanonical() {
  const raw = Number(value("altitudeFt") || 0);
  return unitSystem() === "si" ? mToFt(raw) : raw;
}

function getIntakeRateMlPerHourCanonical() {
  const raw = Number(value("intakeRate") || 0);
  return unitSystem() === "si" ? raw : ozToMl(raw);
}

function setInputConstraintsForUnitSystem(system) {
  if (state.weightLbs) {
    state.weightLbs.min = system === "si" ? "27" : "60";
    state.weightLbs.max = system === "si" ? "181" : "400";
    state.weightLbs.step = "1";
  }

  if (state.tempF) {
    state.tempF.min = system === "si" ? "16" : "60";
    state.tempF.max = system === "si" ? "52" : "125";
    state.tempF.step = "1";
  }

  if (state.dewPointF) {
    state.dewPointF.min = system === "si" ? "-12" : "10";
    state.dewPointF.max = system === "si" ? "24" : "75";
    state.dewPointF.step = "1";
  }

  if (state.altitudeFt) {
    state.altitudeFt.min = "0";
    state.altitudeFt.max = system === "si" ? "2750" : "9000";
    state.altitudeFt.step = system === "si" ? "50" : "100";
  }

  if (state.intakeRate) {
    state.intakeRate.min = "0";
    state.intakeRate.max = system === "si" ? "1500" : "50";
    state.intakeRate.step = system === "si" ? "10" : "0.5";
  }
}

function convertDisplayedValuesForUnitSystem(currentSystem, nextSystem) {
  if (currentSystem === nextSystem) {
    setInputConstraintsForUnitSystem(nextSystem);
    return;
  }

  const temp = Number(value("tempF") || 0);
  const dew = Number(value("dewPointF") || 0);
  const altitude = Number(value("altitudeFt") || 0);
  const weight = Number(value("weightLbs") || 0);
  const intakeRate = Number(value("intakeRate") || 0);

  if (nextSystem === "si") {
    if (state.tempF) state.tempF.value = String(Math.round(fToC(temp)));
    if (state.dewPointF) state.dewPointF.value = String(Math.round(fToC(dew)));
    if (state.altitudeFt) state.altitudeFt.value = String(Math.round(ftToM(altitude)));
    if (state.weightLbs) state.weightLbs.value = String(Math.round(lbsToKg(weight)));
    if (state.intakeRate) state.intakeRate.value = String(Math.round(ozToMl(intakeRate)));
  } else {
    if (state.tempF) state.tempF.value = String(Math.round(cToF(temp)));
    if (state.dewPointF) state.dewPointF.value = String(Math.round(cToF(dew)));
    if (state.altitudeFt) state.altitudeFt.value = String(Math.round(mToFt(altitude)));
    if (state.weightLbs) state.weightLbs.value = String(Math.round(kgToLbs(weight)));
    if (state.intakeRate) state.intakeRate.value = String((mlToOz(intakeRate)).toFixed(1));
  }

  setInputConstraintsForUnitSystem(nextSystem);
}

function extractFirstFinite(values) {
  if (!Array.isArray(values)) return null;
  for (const v of values) {
    const n = toFiniteNumber(v);
    if (n !== null) return n;
  }
  return null;
}

async function fetchWeatherByCityName(cityName) {
  const raw = String(cityName || "").trim();
  const query = raw.split(",")[0].trim();
  if (!query) {
    throw new Error("Please enter a city name first.");
  }

  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) {
    throw new Error("Could not resolve city location right now.");
  }

  const geo = await geoRes.json();
  const place = Array.isArray(geo.results) ? geo.results[0] : null;
  if (!place) {
    throw new Error(`No city match found for "${query}".`);
  }

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,dew_point_2m` +
    `&current_weather=true` +
    `&hourly=temperature_2m,relative_humidity_2m,dew_point_2m` +
    `&temperature_unit=fahrenheit`;

  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) {
    throw new Error("Weather service unavailable. Please try again.");
  }

  const weather = await weatherRes.json();
  if (!weather.current && !weather.current_weather && !weather.hourly) {
    throw new Error("Current weather data not available for this city.");
  }

  const fallbackTemp =
    toFiniteNumber(weather?.current_weather?.temperature) ??
    extractFirstFinite(weather?.hourly?.temperature_2m);
  const fallbackHumidity = extractFirstFinite(weather?.hourly?.relative_humidity_2m);
  const fallbackDewPoint = extractFirstFinite(weather?.hourly?.dew_point_2m);

  return {
    normalizedQuery: query,
    cityLabel: [place.name, place.admin1, place.country_code].filter(Boolean).join(", "),
    tempF: toFiniteNumber(weather?.current?.temperature_2m) ?? fallbackTemp,
    humidity: toFiniteNumber(weather?.current?.relative_humidity_2m) ?? fallbackHumidity,
    dewPointF: toFiniteNumber(weather?.current?.dew_point_2m) ?? fallbackDewPoint,
    altitudeFt: toFiniteNumber(weather.elevation || place.elevation || 0) !== null
      ? Number(weather.elevation || place.elevation || 0) * 3.28084
      : null,
  };
}

async function populateEnvironmentalFactorsFromCity() {
  const city = value("cityName");
  try {
    if (loadWeatherBtn) loadWeatherBtn.disabled = true;
    weatherStatus(`Looking up current weather for ${city}...`);

    const data = await fetchWeatherByCityName(city);

    if (state.cityName && data.normalizedQuery) {
      state.cityName.value = data.normalizedQuery;
    }

    const selectedUnits = unitSystem();

    const updates = [
      setFieldIfFinite("tempF", data.tempF, (v) => (selectedUnits === "si" ? Math.round(fToC(v)) : Math.round(v))),
      setFieldIfFinite("humidity", data.humidity, (v) => Math.round(v)),
      setFieldIfFinite("dewPointF", data.dewPointF, (v) => (selectedUnits === "si" ? Math.round(fToC(v)) : Math.round(v))),
      setFieldIfFinite("altitudeFt", data.altitudeFt, (v) =>
        selectedUnits === "si" ? Math.round(ftToM(v) / 50) * 50 : Math.round(v / 100) * 100
      ),
    ];

    if (weatherLocationEl) {
      weatherLocationEl.textContent = `Resolved: ${data.cityLabel}`;
    }

    render();
    if (updates.some(Boolean)) {
      weatherStatus(`Weather loaded for ${data.cityLabel}. Environmental factors updated.`);
    } else {
      weatherStatus(
        `City resolved (${data.cityLabel}), but weather fields were incomplete from provider. Try again in a moment.`,
        true
      );
    }
  } catch (err) {
    weatherStatus(err?.message || "Failed to load city weather.", true);
  } finally {
    if (loadWeatherBtn) loadWeatherBtn.disabled = false;
  }
}

function calculateHeatIndex(tempF, humidity) {
  const t = Number(tempF) || 0;
  const rh = Number(humidity) || 0;

  if (t < 80 || rh < 40) return t;

  const hi =
    -42.379 +
    2.04901523 * t +
    10.14333127 * rh -
    0.22475541 * t * rh -
    0.00683783 * t * t -
    0.05481717 * rh * rh +
    0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;

  return hi;
}

function calculateEvaporativeDemand(factors) {
  let multiplier = 1.0;

  if (factors.tempF > 95) multiplier += 0.2;
  if (factors.tempF > 100) multiplier += 0.12;
  if (factors.humidity < 20) multiplier += 0.1;
  if (factors.humidity < 15) multiplier += 0.1;
  if (factors.dewPointF < 40) multiplier += 0.05;
  if ((factors.altitudeFt || 0) > 4000) multiplier += 0.05;
  if (factors.activityLevel === "moderate") multiplier += 0.1;
  if (factors.activityLevel === "active") multiplier += 0.2;

  const heatIndex = calculateHeatIndex(factors.tempF, factors.humidity);
  if (heatIndex > HIGH_DEMAND_HEAT_INDEX) multiplier += 0.15;

  return {
    multiplier,
    heatIndex,
    highDemand: heatIndex > HIGH_DEMAND_HEAT_INDEX,
  };
}

function calculateHydrationBenchmark(weightLbs, ageYears, factors, hoursSinceIntake) {
  const baseOz = (Number(weightLbs) || 0) * 0.5;
  const ageAdjustmentOz = Number(ageYears) >= 55 ? 4 : Number(ageYears) < 18 ? -2 : 0;
  const adjustedBaseOz = Math.max(0, baseOz + ageAdjustmentOz);

  const sexAssignedAtBirth = String(factors.sexAssignedAtBirth || "unspecified");
  const sexMultiplierMap = {
    female: 0.97,
    male: 1.03,
    intersex: 1.0,
    unspecified: 1.0,
  };
  const sexMultiplier = sexMultiplierMap[sexAssignedAtBirth] ?? 1.0;

  const acclimatizationLevel = String(factors.acclimatizationLevel || "moderate");
  const acclimatizationMultiplierMap = {
    low: 1.08,
    moderate: 1.03,
    high: 0.95,
  };
  const acclimatizationMultiplier = acclimatizationMultiplierMap[acclimatizationLevel] ?? 1.0;

  const evaporative = calculateEvaporativeDemand(factors);
  const metabolicMultiplier = 1 + clamp((Number(hoursSinceIntake) || 0) * 0.02, 0, 0.24);
  const benchmarkOz =
    adjustedBaseOz *
    sexMultiplier *
    acclimatizationMultiplier *
    evaporative.multiplier *
    metabolicMultiplier;

  return {
    baseOz: adjustedBaseOz,
    benchmarkOz,
    evaporativeMultiplier: evaporative.multiplier,
    metabolicMultiplier,
    heatIndex: evaporative.heatIndex,
    highDemand: evaporative.highDemand,
  };
}

function buildModeModels() {
  const fluidType = value("fluidType") || "water";
  const fluidProfile = FLUID_COEFFICIENTS[fluidType] || FLUID_COEFFICIENTS.water;

  const factors = {
    tempF: getTempFCanonical(),
    humidity: Number(value("humidity") || 0),
    dewPointF: getDewPointFCanonical(),
    activityLevel: value("activityLevel") || "sedentary",
    sexAssignedAtBirth: value("sexAssignedAtBirth") || "unspecified",
    acclimatizationLevel: value("acclimatizationLevel") || "moderate",
    altitudeFt: getAltitudeFtCanonical(),
  };

  const hoursSinceIntake = Number(value("hoursSinceIntake") || 0);
  const userWeightLbs = getWeightLbsCanonical();
  const userAgeYears = Number(value("ageYears") || 0);
  const intakeRateMlPerHour = getIntakeRateMlPerHourCanonical();
  const intakeVolumeMl = intakeRateMlPerHour * Math.max(0, hoursSinceIntake);

  const userBenchmark = calculateHydrationBenchmark(userWeightLbs, userAgeYears, factors, hoursSinceIntake);

  const userIntakeOz = mlToOz(intakeVolumeMl) * fluidProfile.coefficient;
  const electrolyteScenarioOz = mlToOz(intakeVolumeMl) * FLUID_COEFFICIENTS.electrolyte.coefficient;

  return [
    {
      id: "user_intake",
      name: `User Intake (${fluidProfile.label})`,
      benchmarkOz: userBenchmark.benchmarkOz,
      effectiveIntakeOz: userIntakeOz,
      heatIndex: userBenchmark.heatIndex,
      highDemand: userBenchmark.highDemand,
      evaporativeMultiplier: userBenchmark.evaporativeMultiplier,
      metabolicMultiplier: userBenchmark.metabolicMultiplier,
      tags: ["User", "Current Fluid"],
    },
    {
      id: "electrolyte_scenario",
      name: "Electrolyte Scenario",
      benchmarkOz: userBenchmark.benchmarkOz,
      effectiveIntakeOz: electrolyteScenarioOz,
      heatIndex: userBenchmark.heatIndex,
      highDemand: userBenchmark.highDemand,
      evaporativeMultiplier: userBenchmark.evaporativeMultiplier,
      metabolicMultiplier: userBenchmark.metabolicMultiplier,
      tags: ["Alternate", "Fluid Coefficient"],
    },
  ];
}

function evaluateMode(mode) {
  const hydrationGapOz = Math.max(0, mode.benchmarkOz - mode.effectiveIntakeOz);
  const coveragePct = mode.benchmarkOz > 0 ? clamp((mode.effectiveIntakeOz / mode.benchmarkOz) * 100, 0, 200) : 0;
  const riskScore = clamp(hydrationGapOz * 4 + (mode.highDemand ? 15 : 0), 0, 100);

  return {
    ...mode,
    hydrationGapOz,
    coveragePct,
    riskScore,
  };
}

function winnerId(results, key) {
  return results.reduce((best, cur) => (cur[key] < best[key] ? cur : best), results[0]).id;
}

function winnerIdMax(results, key) {
  return results.reduce((best, cur) => (cur[key] > best[key] ? cur : best), results[0]).id;
}

function buildCard(result, flags, index) {
  const card = document.createElement("article");
  card.className = "card";
  card.style.animationDelay = `${0.05 * index}s`;

  const pills = [];
  if (result.highDemand) pills.push('<span class="pill best-time">High Demand</span>');
  if (flags.bestCoverage === result.id) pills.push('<span class="pill best-comfort">Best Coverage</span>');
  if (flags.lowestGap === result.id) pills.push('<span class="pill best-cost">Lowest Gap</span>');
  if (flags.lowestRisk === result.id) pills.push('<span class="pill best-co2">Lowest Risk</span>');

  card.innerHTML = `
    <h4>${result.name}</h4>
    <div>${pills.join(" ")}</div>
    <p class="metric">Benchmark target: <strong>${num(result.benchmarkOz, 1)} oz</strong></p>
    <p class="metric">Effective intake: <strong>${num(result.effectiveIntakeOz, 1)} oz</strong></p>
    <p class="metric">Hydration gap: <strong>${num(result.hydrationGapOz, 1)} oz</strong></p>
    <p class="metric">Coverage: <strong>${num(result.coveragePct, 0)}%</strong></p>
    <p class="metric">Risk score: <strong>${num(result.riskScore, 0)}</strong></p>
  `;

  return card;
}

function normalizedBars(results) {
  const dims = [
    { key: "benchmarkOz", label: "Benchmark", cls: "cost", suffix: "oz" },
    { key: "effectiveIntakeOz", label: "Effective Intake", cls: "co2", suffix: "oz" },
    { key: "hydrationGapOz", label: "Gap", cls: "time", suffix: "oz" },
  ];

  chartEl.innerHTML = "";

  dims.forEach((dim) => {
    const max = Math.max(...results.map((r) => r[dim.key]), 1);

    results.forEach((r) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const pct = (r[dim.key] / max) * 100;

      row.innerHTML = `
        <span>${r.name}</span>
        <div class="bar-wrap"><div class="bar ${dim.cls}" style="width:${pct}%;"></div></div>
        <span>${dim.label}: ${num(r[dim.key], 1)} ${dim.suffix}</span>
      `;
      chartEl.appendChild(row);
    });
  });
}

function buildInsights(results) {
  const user = results.find((r) => r.id === "user_intake") || results[0];
  const electrolyte = results.find((r) => r.id === "electrolyte_scenario") || results[0];

  const insights = [];

  if (user.highDemand) {
    insights.push(
      `High Demand alert: heat index is ${num(user.heatIndex, 1)}°F, so hydration targets are elevated for current conditions.`
    );
  } else {
    insights.push(`Heat index is ${num(user.heatIndex, 1)}°F; demand remains below the High Demand trigger.`);
  }

  insights.push(
    `User benchmark is ${num(user.benchmarkOz, 1)} oz with an estimated gap of ${num(user.hydrationGapOz, 1)} oz in the current metabolic window.`
  );

  const electrolyteGain = electrolyte.effectiveIntakeOz - user.effectiveIntakeOz;
  insights.push(
    `Switching to an electrolyte coefficient at the same volume would raise effective intake by ${num(electrolyteGain, 1)} oz.`
  );

  return insights;
}

function updateOutputLabels() {
  const units = unitSystem();
  document.querySelectorAll("[data-output]").forEach((node) => {
    const id = node.getAttribute("data-output");
    const v = value(id);

    const unitMap = {
      weightLbs: units === "si" ? `${num(v, 0)} kg` : `${num(v, 0)} lbs`,
      ageYears: `${num(v, 0)} years`,
      tempF: units === "si" ? `${num(v, 0)} °C` : `${num(v, 0)} °F`,
      humidity: `${num(v, 0)}%`,
      dewPointF: units === "si" ? `${num(v, 0)} °C` : `${num(v, 0)} °F`,
      altitudeFt: units === "si" ? `${num(v, 0)} m` : `${num(v, 0)} ft`,
      hoursSinceIntake: `${num(v, 1)} h`,
      intakeRate: units === "si" ? `${num(v, 0)} ml/h` : `${num(v, 1)} oz/h`,
    };

    node.textContent = unitMap[id] ?? String(v);
  });
}

function render() {
  const results = buildModeModels().map((mode) => evaluateMode(mode));

  const flags = {
    bestCoverage: winnerIdMax(results, "coveragePct"),
    lowestGap: winnerId(results, "hydrationGapOz"),
    lowestRisk: winnerId(results, "riskScore"),
  };

  cardsEl.innerHTML = "";
  results.forEach((result, index) => cardsEl.appendChild(buildCard(result, flags, index)));

  normalizedBars(results);

  const insights = buildInsights(results);
  insightListEl.innerHTML = insights.map((msg) => `<li>${msg}</li>`).join("");
  ideaListEl.innerHTML = comparisonIdeas.map((msg) => `<li>${msg}</li>`).join("");

  const lead = results.find((r) => r.id === "user_intake") || results[0];
  const units = unitSystem();
  const displayedHeatIndex = units === "si" ? fToC(lead.heatIndex) : lead.heatIndex;
  effectiveHeatIndexEl.textContent = units === "si" ? `${num(displayedHeatIndex, 1)} °C` : `${num(displayedHeatIndex, 1)} °F`;
  effectiveEvapMultiplierEl.textContent = `${num(lead.evaporativeMultiplier, 2)}×`;

  if (tripEstimateEl) {
    const highDemandText = lead.highDemand ? "YES" : "No";
    const thresholdText =
      units === "si"
        ? `${num(fToC(HIGH_DEMAND_HEAT_INDEX), 1)}°C`
        : `${num(HIGH_DEMAND_HEAT_INDEX, 1)}°F`;
    tripEstimateEl.innerHTML = `<strong>High Demand:</strong> ${highDemandText} <span class="muted">(threshold: heat index > ${thresholdText})</span>`;
  }

  updateOutputLabels();
}

ids.forEach((id) => {
  const el = state[id];
  if (!el) return;
  el.addEventListener("input", render);
  el.addEventListener("change", render);
});

document.getElementById("resetBtn").addEventListener("click", () => {
  const defaults = {
    unitSystem: "us",
    cityName: "Phoenix",
    weightLbs: "180",
    ageYears: "38",
    sexAssignedAtBirth: "female",
    acclimatizationLevel: "moderate",
    activityLevel: "moderate",
    tempF: "104",
    humidity: "14",
    dewPointF: "33",
    altitudeFt: "1086",
    hoursSinceIntake: "3",
    intakeRate: "10.1",
    fluidType: "water",
  };

  Object.entries(defaults).forEach(([id, val]) => {
    if (state[id]) state[id].value = val;
  });

  if (weatherLocationEl) weatherLocationEl.textContent = "";
  if (weatherStatusEl) weatherStatusEl.textContent = "";

  setInputConstraintsForUnitSystem("us");

  render();
});

if (state.unitSystem) {
  let activeUnitSystem = unitSystem();
  state.unitSystem.addEventListener("change", () => {
    const next = unitSystem();
    convertDisplayedValuesForUnitSystem(activeUnitSystem, next);
    activeUnitSystem = next;
    render();
  });
}

if (loadWeatherBtn) {
  loadWeatherBtn.addEventListener("click", populateEnvironmentalFactorsFromCity);
}

if (state.cityName) {
  state.cityName.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      populateEnvironmentalFactorsFromCity();
    }
  });
}

setInputConstraintsForUnitSystem(unitSystem());

render();
