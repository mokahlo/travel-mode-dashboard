const seatProfiles = {
  economy: { costMultiplier: 1, co2Multiplier: 1, label: "Economy" },
  premium: { costMultiplier: 1.45, co2Multiplier: 1.3, label: "Premium Econ" },
  business: { costMultiplier: 2.45, co2Multiplier: 1.9, label: "Business" },
};

const ids = [
  "distanceMiles",
  "passengerWage",
  "wageTimeFactor",
  "gasPrice",
  "electricityPrice",
  "publicElectricityPrice",
  "publicChargeShare",
  "gridIntensity",
  "seatType",
  "evOccupancy",
  "suvOccupancy",
  "hybridOccupancy",
  "evEfficiency",
  "evRange",
  "evChargeSpeed",
  "evChargePowerFactor",
  "evChargeStopOverhead",
  "suvMpg",
  "hybridMpg",
  "driveSpeed",
  "driveFixedCost",
  "driveDeadheadHours",
  "flightBaseFare",
  "flightFarePerMile",
  "flightFixedCost",
  "flightFixedTime",
  "flightSpeed",
  "flightCo2PerMile",
];

const state = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
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
  if (input.type === "select-one") {
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

  const evEfficiency = value("evEfficiency");
  const evRange = Math.max(1, value("evRange"));
  const evChargeSpeed = Math.max(1, value("evChargeSpeed"));
  const evChargePowerFactor = Math.max(0.01, value("evChargePowerFactor") / 100);
  const evChargeStopOverheadHours = Math.max(0, value("evChargeStopOverhead") / 60);
  const suvMpg = value("suvMpg");
  const hybridMpg = value("hybridMpg");
  const driveSpeed = value("driveSpeed");
  const driveFixedCost = value("driveFixedCost");
  const driveDeadhead = value("driveDeadheadHours");

  // Effective charging includes tapering and site variability, configured by user assumptions.
  const effectiveChargePower = evChargeSpeed * evChargePowerFactor;
  const chargingHoursPerMile = evEfficiency / effectiveChargePower + evChargeStopOverheadHours / evRange;

  const evOccupancy = Math.max(1, value("evOccupancy"));
  const suvOccupancy = Math.max(1, value("suvOccupancy"));
  const hybridOccupancy = Math.max(1, value("hybridOccupancy"));

  const flightBaseFare = value("flightBaseFare");
  const flightFarePerMile = value("flightFarePerMile");
  const flightFixedCost = value("flightFixedCost");
  const flightFixedTime = value("flightFixedTime");
  const flightSpeed = value("flightSpeed");
  const flightCo2PerMile = value("flightCo2PerMile");

  return [
    {
      id: "ev",
      name: `Drive EV (${evOccupancy} occ.)`,
      tags: ["Drive", "Electric"],
      fixedCost: driveFixedCost / evOccupancy,
      costPerMile: (evEfficiency * electricPrice) / evOccupancy,
      fixedTime: driveDeadhead,
      hoursPerMile: 1 / driveSpeed + chargingHoursPerMile,
      fixedCo2: 0,
      co2PerMile: (evEfficiency * gridIntensity) / evOccupancy,
      evRange,
      chargingHoursPerMile,
      effectiveChargePower,
    },
    {
      id: "suv",
      name: `Drive SUV (${suvOccupancy} occ.)`,
      tags: ["Drive", "Gas"],
      fixedCost: driveFixedCost / suvOccupancy,
      costPerMile: (gasPrice / suvMpg) / suvOccupancy,
      fixedTime: driveDeadhead,
      hoursPerMile: 1 / driveSpeed,
      fixedCo2: 0,
      co2PerMile: (8.887 / suvMpg) / suvOccupancy,
    },
    {
      id: "hybrid",
      name: `Drive Hybrid (${hybridOccupancy} occ.)`,
      tags: ["Drive", "Hybrid"],
      fixedCost: driveFixedCost / hybridOccupancy,
      costPerMile: (gasPrice / hybridMpg) / hybridOccupancy,
      fixedTime: driveDeadhead,
      hoursPerMile: 1 / driveSpeed,
      fixedCo2: 0,
      co2PerMile: (8.887 / hybridMpg) / hybridOccupancy,
    },
    {
      id: "flight",
      name: `Fly ${seat.label}`,
      tags: ["Flight"],
      fixedCost: flightFixedCost + flightBaseFare * seat.costMultiplier,
      costPerMile: flightFarePerMile * seat.costMultiplier,
      fixedTime: flightFixedTime,
      hoursPerMile: 1 / flightSpeed,
      fixedCo2: 0,
      co2PerMile: flightCo2PerMile * seat.co2Multiplier,
    },
  ];
}

function evaluateMode(mode, distance, valueOfTime) {
  const monetaryCost = mode.fixedCost + mode.costPerMile * distance;
  const hours = mode.fixedTime + mode.hoursPerMile * distance;
  const co2 = mode.fixedCo2 + mode.co2PerMile * distance;
  const chargeStops = mode.id === "ev" ? Math.max(0, Math.ceil(distance / mode.evRange) - 1) : 0;
  const chargeHours = mode.id === "ev" ? mode.chargingHoursPerMile * distance : 0;

  return {
    ...mode,
    distance,
    monetaryCost,
    hours,
    co2,
    generalizedCost: monetaryCost + valueOfTime * hours,
    chargeStops,
    chargeHours,
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
    ${
      result.id === "ev"
        ? `<p class="metric">Estimated charge stops: <strong>${num(result.chargeStops, 0)}</strong> (charging time ${num(result.chargeHours)} h)</p>`
        : ""
    }
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
  const ev = modeById.ev;
  const suv = modeById.suv;
  const hybrid = modeById.hybrid;
  const flight = modeById.flight;

  const evModel = buildCostModel(ev, valueOfTime);
  const suvModel = buildCostModel(suv, valueOfTime);
  const hybridModel = buildCostModel(hybrid, valueOfTime);
  const flightModel = buildCostModel(flight, valueOfTime);

  const insights = [];

  const costEvFlight = breakEvenDistance(evModel, flightModel, "cost");
  const co2EvFlight = breakEvenDistance(evModel, flightModel, "co2");
  const genEvFlight = breakEvenDistance(evModel, flightModel, "generalized");

  if (costEvFlight) {
    insights.push(`EV vs flight cost break-even: ~${num(costEvFlight, 0)} miles.`);
  } else {
    insights.push("EV vs flight cost: no positive break-even in current assumptions.");
  }

  if (co2EvFlight) {
    insights.push(`EV vs flight carbon break-even: ~${num(co2EvFlight, 0)} miles.`);
  } else {
    insights.push("EV vs flight carbon: one mode stays cleaner across the full range.");
  }

  if (genEvFlight) {
    insights.push(`EV vs flight generalized value break-even: ~${num(genEvFlight, 0)} miles.`);
  } else {
    insights.push("EV vs flight generalized value: no positive switching point under current time value.");
  }

  const costSuvFlight = breakEvenDistance(suvModel, flightModel, "cost");
  if (costSuvFlight) {
    insights.push(`SUV vs flight cost break-even: ~${num(costSuvFlight, 0)} miles.`);
  } else {
    insights.push("SUV vs flight cost: no positive break-even in current assumptions.");
  }

  const co2SuvFlight = breakEvenDistance(suvModel, flightModel, "co2");
  if (co2SuvFlight) {
    insights.push(`SUV vs flight carbon break-even: ~${num(co2SuvFlight, 0)} miles.`);
  } else {
    insights.push("SUV vs flight carbon: no positive break-even in current assumptions.");
  }

  const costHybridFlight = breakEvenDistance(hybridModel, flightModel, "cost");
  if (costHybridFlight) {
    insights.push(`Hybrid vs flight cost break-even: ~${num(costHybridFlight, 0)} miles.`);
  } else {
    insights.push("Hybrid vs flight cost: no positive break-even in current assumptions.");
  }

  const co2HybridFlight = breakEvenDistance(hybridModel, flightModel, "co2");
  if (co2HybridFlight) {
    insights.push(`Hybrid vs flight carbon break-even: ~${num(co2HybridFlight, 0)} miles.`);
  } else {
    insights.push("Hybrid vs flight carbon: no positive break-even in current assumptions.");
  }

  const lowestGeneralized = results.reduce((best, r) => (r.generalizedCost < best.generalizedCost ? r : best), results[0]);
  insights.push(`At ${num(results[0].distance, 0)} miles, best combined money+time mode is ${lowestGeneralized.name}.`);
  insights.push(
    `EV charging estimate: about ${num(ev.chargeStops, 0)} stop(s), adding ~${num(ev.chargeHours)} hours (effective charge power ${num(ev.effectiveChargePower, 0)} kW).`
  );

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
  const baseFare = value("flightBaseFare") * seat.costMultiplier;
  const perMileFare = value("flightFarePerMile") * seat.costMultiplier;
  const effectivePerMile = (baseFare + perMileFare * distance) / distance;
  effectiveFlightFareEl.textContent = `${money(effectivePerMile)}/mi`;

  updateOutputLabels();
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
      evOccupancy: `${num(v, 0)} travelers`,
      suvOccupancy: `${num(v, 0)} travelers`,
      hybridOccupancy: `${num(v, 0)} travelers`,
      evEfficiency: `${num(v)} kWh/mi`,
      evRange: `${num(v, 0)} mi`,
      evChargeSpeed: `${num(v, 0)} kW`,
      evChargePowerFactor: `${num(v, 0)}%`,
      evChargeStopOverhead: `${num(v, 0)} min`,
      suvMpg: `${num(v, 0)} mpg`,
      hybridMpg: `${num(v, 0)} mpg`,
      driveSpeed: `${num(v, 0)} mph`,
      driveFixedCost: `$${num(v, 0)}/trip`,
      driveDeadheadHours: `${num(v)} h`,
      flightBaseFare: `$${num(v, 0)}`,
      flightFarePerMile: `$${num(v)}/mi`,
      flightFixedCost: `$${num(v, 0)}`,
      flightFixedTime: `${num(v)} h`,
      flightSpeed: `${num(v, 0)} mph`,
      flightCo2PerMile: `${num(v)} kg/mi`,
    };

    node.textContent = unitMap[id] ?? String(v);
  });
}

ids.forEach((id) => {
  state[id].addEventListener("input", render);
  state[id].addEventListener("change", render);
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
    evOccupancy: "1",
    suvOccupancy: "2",
    hybridOccupancy: "1",
    evEfficiency: "0.31",
    evRange: "260",
    evChargeSpeed: "150",
    evChargePowerFactor: "72",
    evChargeStopOverhead: "7",
    suvMpg: "22",
    hybridMpg: "44",
    driveSpeed: "58",
    driveFixedCost: "25",
    driveDeadheadHours: "0.4",
    flightBaseFare: "85",
    flightFarePerMile: "0.12",
    flightFixedCost: "35",
    flightFixedTime: "2.4",
    flightSpeed: "500",
    flightCo2PerMile: "0.22",
  };

  Object.entries(defaults).forEach(([id, val]) => {
    state[id].value = val;
  });

  render();
});

render();
