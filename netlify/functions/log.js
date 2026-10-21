exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const headers = event.headers;

    // IP real (Netlify expone x-nf-client-connection-ip)
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

    // ── Geolocalización por IP (ipwho.is — gratis, sin API key) ────────────
    let ipGeo = null;
    if (ip !== 'unknown' && ip !== '::1') {
      try {
        const geoRes = await fetch(`https://ipwho.is/${ip}`);
        const geoData = await geoRes.json();
        if (geoData.success) {
          ipGeo = {
            ciudad:      geoData.city,
            region:      geoData.region,
            pais:        geoData.country,
            pais_codigo: geoData.country_code,
            latitud:     geoData.latitude,
            longitud:    geoData.longitude,
            codigo_postal: geoData.postal,
            isp:         geoData.connection?.isp,
            org:         geoData.connection?.org,
          };
        }
      } catch (geoErr) {
        console.warn('IP geo fallida:', geoErr.message);
      }
    }

    // ── Entrada completa ────────────────────────────────────────────────────
    const entry = {
      timestamp,
      ip,
      userAgent,
      ip_geolocation: ipGeo,
      gps: denied
        ? { denegado: true, razon: reason || 'desconocido' }
        : { denegado: false, latitud: latitude, longitud: longitude, precision_m: accuracy, altitud: altitude, heading, speed },
    };

    console.log('VISIT:', JSON.stringify(entry));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error('Error en log function:', err.message);
    return { statusCode: 500, body: JSON.stringify({ success: false }) };
  }
};
