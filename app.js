// Semantic versioning: major.minor.patch
const APP_VERSION = "1.1.0";
const HIGH_DEMAND_HEAT_INDEX = 105;
const ROOM_TEMP_F = 72;

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

if (appVersionEl) appVersionEl.textContent = `v${APP_VERSION}`;

const comparisonIdeas = [
  "Log hydration adherence versus recommended hourly target.",
  "Track dehydration rate trends by time-of-day and activity.",
  "Add sweat-rate calibration from observed body-mass change.",
  "Include sodium replacement guidance based on climate burden.",
  "Add warning tiers for sustained high dehydration rates.",
  "Model recovery windows after high-demand exposure.",
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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function toFiniteNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function unitSystem() {
  return String(value("unitSystem") || "us").toLowerCase() === "si" ? "si" : "us";
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

function mlToOz(ml) {
  return (Number(ml) || 0) * 0.033814;
}

function ozToMl(oz) {
  return (Number(oz) || 0) * 29.5735;
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
  weatherStatusEl.innerHTML = isError ? `<span style="color:#ffb4b4;">${safe}</span>` : safe;
}

function setFieldIfFinite(fieldId, rawValue, transform = (v) => v) {
  const numeric = toFiniteNumber(rawValue);
  if (numeric === null || !state[fieldId]) return false;
  state[fieldId].value = String(transform(numeric));
  return true;
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

  if (nextSystem === "si") {
    if (state.tempF) state.tempF.value = String(Math.round(fToC(temp)));
    if (state.dewPointF) state.dewPointF.value = String(Math.round(fToC(dew)));
    if (state.altitudeFt) state.altitudeFt.value = String(Math.round(ftToM(altitude)));
    if (state.weightLbs) state.weightLbs.value = String(Math.round(lbsToKg(weight)));
  } else {
    if (state.tempF) state.tempF.value = String(Math.round(cToF(temp)));
    if (state.dewPointF) state.dewPointF.value = String(Math.round(cToF(dew)));
    if (state.altitudeFt) state.altitudeFt.value = String(Math.round(mToFt(altitude)));
    if (state.weightLbs) state.weightLbs.value = String(Math.round(kgToLbs(weight)));
  }

  setInputConstraintsForUnitSystem(nextSystem);
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
  if (!query) throw new Error("Please enter a city name first.");

  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const geoRes = await fetch(geoUrl);
  if (!geoRes.ok) throw new Error("Could not resolve city location right now.");

  const geo = await geoRes.json();
  const place = Array.isArray(geo.results) ? geo.results[0] : null;
  if (!place) throw new Error(`No city match found for "${query}".`);

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
    `&current=temperature_2m,relative_humidity_2m,dew_point_2m` +
    `&current_weather=true&hourly=temperature_2m,relative_humidity_2m,dew_point_2m` +
    `&temperature_unit=fahrenheit`;

  const weatherRes = await fetch(weatherUrl);
  if (!weatherRes.ok) throw new Error("Weather service unavailable. Please try again.");

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
    if (state.cityName && data.normalizedQuery) state.cityName.value = data.normalizedQuery;

    const units = unitSystem();
    const updates = [
      setFieldIfFinite("tempF", data.tempF, (v) => (units === "si" ? Math.round(fToC(v)) : Math.round(v))),
      setFieldIfFinite("humidity", data.humidity, (v) => Math.round(v)),
      setFieldIfFinite("dewPointF", data.dewPointF, (v) => (units === "si" ? Math.round(fToC(v)) : Math.round(v))),
      setFieldIfFinite("altitudeFt", data.altitudeFt, (v) => (units === "si" ? Math.round(ftToM(v) / 50) * 50 : Math.round(v / 100) * 100)),
    ];

    if (weatherLocationEl) weatherLocationEl.textContent = `Resolved: ${data.cityLabel}`;
    render();

    if (updates.some(Boolean)) {
      weatherStatus(`Weather loaded for ${data.cityLabel}. Environmental factors updated.`);
    } else {
      weatherStatus(`City resolved (${data.cityLabel}), but weather fields were incomplete. Try again soon.`, true);
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

  return (
    -42.379 +
    2.04901523 * t +
    10.14333127 * rh -
    0.22475541 * t * rh -
    0.00683783 * t * t -
    0.05481717 * rh * rh +
    0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh
  );
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

  return { multiplier, heatIndex, highDemand: heatIndex > HIGH_DEMAND_HEAT_INDEX };
}

function calculateHydrationBenchmark(weightLbs, ageYears, factors) {
  const baseOz = (Number(weightLbs) || 0) * 0.5;
  const ageAdjustmentOz = Number(ageYears) >= 55 ? 4 : Number(ageYears) < 18 ? -2 : 0;
  const adjustedBaseOz = Math.max(0, baseOz + ageAdjustmentOz);

  const sexMultiplier = ({ female: 0.97, male: 1.03, intersex: 1.0, unspecified: 1.0 })[String(factors.sexAssignedAtBirth || "unspecified")] ?? 1.0;
  const acclMultiplier = ({ low: 1.08, moderate: 1.03, high: 0.95 })[String(factors.acclimatizationLevel || "moderate")] ?? 1.0;

  const evap = calculateEvaporativeDemand(factors);
  const idealDailyOz = adjustedBaseOz * sexMultiplier * acclMultiplier * evap.multiplier;
  const idealHourlyOz = idealDailyOz / 24;

  const activityBaseLossMlPerHour = ({ sedentary: 55, moderate: 95, active: 150 })[String(factors.activityLevel || "sedentary")] ?? 55;
  const dehydrationRateMlPerHour = activityBaseLossMlPerHour * evap.multiplier;
  const recommendedRateMlPerHour = Math.max(ozToMl(idealHourlyOz), dehydrationRateMlPerHour * 1.15);

  return {
    idealDailyOz,
    idealHourlyOz,
    recommendedRateMlPerHour,
    dehydrationRateMlPerHour,
    evaporativeMultiplier: evap.multiplier,
    heatIndex: evap.heatIndex,
    highDemand: evap.highDemand,
  };
}

function buildModeModels() {
  const hoursOutside = Math.max(0, Number(value("hoursOutside") || 0));
  const effectiveTempF = hoursOutside <= 0 ? ROOM_TEMP_F : getTempFCanonical();

  const factors = {
    tempF: effectiveTempF,
    humidity: Number(value("humidity") || 0),
    dewPointF: getDewPointFCanonical(),
    activityLevel: value("activityLevel") || "sedentary",
    sexAssignedAtBirth: value("sexAssignedAtBirth") || "unspecified",
    acclimatizationLevel: value("acclimatizationLevel") || "moderate",
    altitudeFt: getAltitudeFtCanonical(),
  };

  const profile = calculateHydrationBenchmark(getWeightLbsCanonical(), Number(value("ageYears") || 0), factors);

  const dryScenarioRate = profile.dehydrationRateMlPerHour * 1.2;
  const dryScenarioRecommendedRate = Math.max(profile.recommendedRateMlPerHour * 1.1, dryScenarioRate * 1.15);

  return [
    {
      id: "ideal_intake",
      name: "Recommended Hydration Rate",
      idealDailyOz: profile.idealDailyOz,
      recommendedRateMlPerHour: profile.recommendedRateMlPerHour,
      dehydrationRateMlPerHour: profile.dehydrationRateMlPerHour,
      evaporativeMultiplier: profile.evaporativeMultiplier,
      heatIndex: profile.heatIndex,
      highDemand: profile.highDemand,
      effectiveTempF,
      usedRoomTemp: hoursOutside <= 0,
    },
    {
      id: "dehydration_outlook",
      name: "Dehydration Outlook",
      idealDailyOz: profile.idealDailyOz,
      recommendedRateMlPerHour: dryScenarioRecommendedRate,
      dehydrationRateMlPerHour: dryScenarioRate,
      evaporativeMultiplier: profile.evaporativeMultiplier,
      heatIndex: profile.heatIndex,
      highDemand: profile.highDemand,
      effectiveTempF,
      usedRoomTemp: hoursOutside <= 0,
    },
  ];
}

function evaluateMode(mode) {
  const recommendedRateOzPerHour = mlToOz(mode.recommendedRateMlPerHour);
  const dehydrationRateOzPerHour = mlToOz(mode.dehydrationRateMlPerHour);
  const netHydrationRateOzPerHour = recommendedRateOzPerHour - dehydrationRateOzPerHour;
  const riskScore = clamp(dehydrationRateOzPerHour * 9 + (netHydrationRateOzPerHour < 0 ? 15 : 0) + (mode.highDemand ? 15 : 0), 0, 100);

  return {
    ...mode,
    recommendedRateOzPerHour,
    dehydrationRateOzPerHour,
    netHydrationRateOzPerHour,
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
  const units = unitSystem();
  const recommendedLabel = units === "si" ? `${num(result.recommendedRateMlPerHour, 0)} ml/h` : `${num(result.recommendedRateOzPerHour, 1)} oz/h`;
  const rateLabel = units === "si" ? `${num(result.dehydrationRateMlPerHour, 0)} ml/h` : `${num(result.dehydrationRateOzPerHour, 1)} oz/h`;
  const dailyLabel = units === "si" ? `${num(ozToMl(result.idealDailyOz), 0)} ml/day` : `${num(result.idealDailyOz, 1)} oz/day`;
  const netLabel = units === "si" ? `${num(ozToMl(result.netHydrationRateOzPerHour), 0)} ml/h` : `${num(result.netHydrationRateOzPerHour, 1)} oz/h`;

  const card = document.createElement("article");
  card.className = "card";
  card.style.animationDelay = `${0.05 * index}s`;

  const pills = [];
  if (result.highDemand) pills.push('<span class="pill best-time">High Demand</span>');
  if (flags.lowestRisk === result.id) pills.push('<span class="pill best-co2">Lower Risk</span>');
  if (flags.highestRate === result.id) pills.push('<span class="pill best-cost">Higher Dehydration Rate</span>');

  card.innerHTML = `
    <h4>${result.name}</h4>
    <div>${pills.join(" ")}</div>
    <p class="metric">Ideal daily intake: <strong>${dailyLabel}</strong></p>
    <p class="metric">Recommended intake rate: <strong>${recommendedLabel}</strong></p>
    <p class="metric">Estimated dehydration rate: <strong>${rateLabel}</strong></p>
    <p class="metric">Net hydration buffer rate: <strong>${netLabel}</strong></p>
    <p class="metric">Dehydration risk index: <strong>${num(result.riskScore, 0)}</strong></p>
  `;

  return card;
}

function normalizedBars(results) {
  const units = unitSystem();
  const dims = [
    {
      key: "recommendedRateOzPerHour",
      label: "Recommended Intake Rate",
      cls: "cost",
      suffix: units === "si" ? "ml/h" : "oz/h",
      mapValue: (r) => (units === "si" ? r.recommendedRateMlPerHour : r.recommendedRateOzPerHour),
    },
    {
      key: "dehydrationRateOzPerHour",
      label: "Dehydration Rate",
      cls: "co2",
      suffix: units === "si" ? "ml/h" : "oz/h",
      mapValue: (r) => (units === "si" ? r.dehydrationRateMlPerHour : r.dehydrationRateOzPerHour),
    },
    {
      key: "netHydrationRateOzPerHour",
      label: "Net Hydration Buffer Rate",
      cls: "time",
      suffix: units === "si" ? "ml/h" : "oz/h",
      mapValue: (r) => (units === "si" ? ozToMl(r.netHydrationRateOzPerHour) : r.netHydrationRateOzPerHour),
    },
  ];

  chartEl.innerHTML = "";

  dims.forEach((dim) => {
    const values = results.map((r) => dim.mapValue(r));
    const max = Math.max(...values, 1);

    results.forEach((r) => {
      const v = dim.mapValue(r);
      const row = document.createElement("div");
      row.className = "bar-row";
      const pct = (v / max) * 100;

      row.innerHTML = `
        <span>${r.name}</span>
        <div class="bar-wrap"><div class="bar ${dim.cls}" style="width:${pct}%;"></div></div>
        <span>${dim.label}: ${num(v, 1)} ${dim.suffix}</span>
      `;
      chartEl.appendChild(row);
    });
  });
}

function buildInsights(results) {
  const ideal = results.find((r) => r.id === "ideal_intake") || results[0];
  const outlook = results.find((r) => r.id === "dehydration_outlook") || results[0];
  const units = unitSystem();

  const insights = [];
  if (ideal.highDemand) {
    insights.push(`High Demand alert: heat index is ${num(ideal.heatIndex, 1)}°F and dehydration pressure is elevated.`);
  } else {
    insights.push(`Heat index is ${num(ideal.heatIndex, 1)}°F; demand remains below the High Demand trigger.`);
  }

  insights.push(
    units === "si"
      ? `Estimated ideal daily intake is ${num(ozToMl(ideal.idealDailyOz), 0)} ml/day, with a recommended intake rate of ${num(ideal.recommendedRateMlPerHour, 0)} ml/h.`
      : `Estimated ideal daily intake is ${num(ideal.idealDailyOz, 1)} oz/day, with a recommended intake rate of ${num(ideal.recommendedRateOzPerHour, 1)} oz/h.`
  );

  insights.push(
    units === "si"
      ? `Estimated dehydration rate is ${num(ideal.dehydrationRateMlPerHour, 0)} ml/h currently and may approach ${num(outlook.dehydrationRateMlPerHour, 0)} ml/h in drier/hotter stress.`
      : `Estimated dehydration rate is ${num(ideal.dehydrationRateOzPerHour, 1)} oz/h currently and may approach ${num(outlook.dehydrationRateOzPerHour, 1)} oz/h in drier/hotter stress.`
  );

  insights.push(
    `Evaporative burden multiplier is ${num(ideal.evaporativeMultiplier, 2)}× based on your climate and activity factors.`
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
      hoursOutside: `${num(v, 1)} h`,
    };

    node.textContent = unitMap[id] ?? String(v);
  });
}

function render() {
  const results = buildModeModels().map((mode) => evaluateMode(mode));
  const flags = {
    lowestRisk: winnerId(results, "riskScore"),
    highestRate: winnerIdMax(results, "dehydrationRateOzPerHour"),
  };

  cardsEl.innerHTML = "";
  results.forEach((result, index) => cardsEl.appendChild(buildCard(result, flags, index)));

  normalizedBars(results);

  insightListEl.innerHTML = buildInsights(results).map((msg) => `<li>${msg}</li>`).join("");
  ideaListEl.innerHTML = comparisonIdeas.map((msg) => `<li>${msg}</li>`).join("");

  const lead = results.find((r) => r.id === "ideal_intake") || results[0];
  const units = unitSystem();
  const displayedHeatIndex = units === "si" ? fToC(lead.heatIndex) : lead.heatIndex;
  effectiveHeatIndexEl.textContent = units === "si" ? `${num(displayedHeatIndex, 1)} °C` : `${num(displayedHeatIndex, 1)} °F`;
  effectiveEvapMultiplierEl.textContent = `${num(lead.evaporativeMultiplier, 2)}×`;

  if (tripEstimateEl) {
    const thresholdText = units === "si" ? `${num(fToC(HIGH_DEMAND_HEAT_INDEX), 1)}°C` : `${num(HIGH_DEMAND_HEAT_INDEX, 1)}°F`;
    const displayedEffectiveTemp = units === "si" ? fToC(lead.effectiveTempF) : lead.effectiveTempF;
    const tempUnit = units === "si" ? "°C" : "°F";
    const tempSource = lead.usedRoomTemp ? "room temperature fallback" : "ambient/weather temperature";
    tripEstimateEl.innerHTML = `<strong>High Demand:</strong> ${lead.highDemand ? "YES" : "No"} <span class="muted">(threshold: heat index > ${thresholdText})</span><br/><span class="muted">Effective temperature: ${num(displayedEffectiveTemp, 1)}${tempUnit} (${tempSource})</span>`;
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
    hoursOutside: "1",
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
