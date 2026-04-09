module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { from, to, departDate, returnDate, mode = 'flight', passengers = 1, seatType = 'economy', gasPrice } = req.body || {};

    const toRad = (v) => (v * Math.PI) / 180;
    function haversine(lat1, lon1, lat2, lon2) {
      const R = 3958.8; // miles
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    function getAirportCoords(query) {
      if (!query) return null;
      const q = query.trim().toLowerCase();
      // Try to load airports statically. In Vercel we can require it
      const airports = require('../airports.json');
      const found = airports.find(a => a.code.toLowerCase() === q || a.name.toLowerCase() === q);
      return found ? { lat: found.lat, lon: found.lon } : null;
    }

    const fromCoord = getAirportCoords(from);
    const toCoord = getAirportCoords(to);

    let distanceMiles = 600; // fallback
    if (fromCoord && toCoord) {
      distanceMiles = haversine(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon);
      distanceMiles = Math.round(distanceMiles * 10) / 10;
    }

    const seatMultipliers = { economy: 1, premium: 1.45, business: 2.45 };
    const seatMultiplier = seatMultipliers[seatType] || 1;

    let base = 40;
    let perMile = 0.12 * seatMultiplier;
    let flightPrice = base + perMile * distanceMiles;

    if (departDate) {
      const daysOut = Math.max(0, Math.floor((new Date(departDate) - new Date()) / (1000 * 60 * 60 * 24)));
      if (daysOut < 7) flightPrice *= 1.5;
      else if (daysOut < 14) flightPrice *= 1.25;
      else if (daysOut < 30) flightPrice *= 1.1;
      else if (daysOut > 180) flightPrice *= 0.95;
    }

    flightPrice = Math.round(flightPrice * 100) / 100;

    const mpg = 25; // default for driving
    const gas = parseFloat(gasPrice) || 3.9;
    const driveCost = Math.round((distanceMiles * (gas / mpg) * passengers + 0.5) * 100) / 100;
    const driveTimeHours = Math.round((distanceMiles / 58) * 100) / 100;

    const estimates = [];
    if (mode === 'flight' || mode === 'auto') {
      estimates.push({ mode: 'flight', price: flightPrice, currency: 'USD', provider: process.env.TRIP_API_PROVIDER || 'mock', details: { distanceMiles } });
    }
    estimates.push({ mode: 'drive', price: driveCost, currency: 'USD', details: { distanceMiles, timeHours: driveTimeHours } });

    res.status(200).json({ distanceMiles, estimates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'internal error' });
  }
};
