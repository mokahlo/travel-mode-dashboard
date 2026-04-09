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

    // Load static airports DB once and perform tolerant lookup (IATA code or city name)
    const airports = require('../airports.json');

    function getAirportCoords(query) {
      if (!query) return null;
      const qRaw = String(query).trim();
      if (!qRaw) return null;
      const q = qRaw.toLowerCase();

      // 1) Try to detect a 3-letter IATA code anywhere in the input
      const codeMatch = qRaw.toUpperCase().match(/\b([A-Z]{3})\b/);
      if (codeMatch) {
        const code = codeMatch[1].toLowerCase();
        const found = airports.find((a) => a.code.toLowerCase() === code);
        if (found) return { lat: found.lat, lon: found.lon, code: found.code, name: found.name };
      }

      // 2) Exact match against code or name
      const exact = airports.find((a) => a.code.toLowerCase() === q || a.name.toLowerCase() === q);
      if (exact) return { lat: exact.lat, lon: exact.lon, code: exact.code, name: exact.name };

      // 3) Fuzzy substring match against name or code
      const fuzzy = airports.find((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
      if (fuzzy) return { lat: fuzzy.lat, lon: fuzzy.lon, code: fuzzy.code, name: fuzzy.name };

      return null;
    }

    const fromCoord = getAirportCoords(from);
    const toCoord = getAirportCoords(to);

    let distanceMiles = 600; // fallback if lookup fails
    if (fromCoord && toCoord) {
      distanceMiles = haversine(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon);
      distanceMiles = Math.round(distanceMiles * 10) / 10;
    }

    // API intentionally lightweight: return computed distance and matched airport info.
    const fromMatch = fromCoord ? { code: fromCoord.code, name: fromCoord.name } : null;
    const toMatch = toCoord ? { code: toCoord.code, name: toCoord.name } : null;
    res.status(200).json({ distanceMiles, from: fromMatch, to: toMatch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'internal error' });
  }
};
