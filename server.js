const express = require('express');
const path = require('path');
const airports = require('./airports.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getAirportCoords(query) {
  if (!query) return null;
  const qRaw = String(query).trim();
  if (!qRaw) return null;
  const q = qRaw.toLowerCase();

  // Try 3-letter IATA anywhere in input
  const codeMatch = qRaw.toUpperCase().match(/\b([A-Z]{3})\b/);
  if (codeMatch) {
    const code = codeMatch[1].toLowerCase();
    const found = airports.find((a) => a.code.toLowerCase() === code);
    if (found) return { lat: found.lat, lon: found.lon, code: found.code, name: found.name };
  }

  const exact = airports.find((a) => a.code.toLowerCase() === q || a.name.toLowerCase() === q);
  if (exact) return { lat: exact.lat, lon: exact.lon, code: exact.code, name: exact.name };

  const fuzzy = airports.find((a) => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  return fuzzy ? { lat: fuzzy.lat, lon: fuzzy.lon, code: fuzzy.code, name: fuzzy.name } : null;
}

app.post('/api/estimate', async (req, res) => {
  const { from, to, departDate, returnDate, mode = 'flight', passengers = 1, seatType = 'economy', gasPrice } = req.body;

  try {
    const fromCoord = getAirportCoords(from);
    const toCoord = getAirportCoords(to);

    let distanceMiles = 600; // fallback
    if (fromCoord && toCoord) {
      distanceMiles = haversine(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon);
      distanceMiles = Math.round(distanceMiles * 10) / 10;
    }

    // Lightweight endpoint: return distance and matched airport info.
    const fromMatch = fromCoord ? { code: fromCoord.code, name: fromCoord.name } : null;
    const toMatch = toCoord ? { code: toCoord.code, name: toCoord.name } : null;
    res.json({ distanceMiles, from: fromMatch, to: toMatch });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`drive-fly server listening on http://localhost:${PORT}`);
});
