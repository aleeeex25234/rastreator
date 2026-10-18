exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const headers = event.headers;

    // Captura IP real (Netlify pone la IP en x-nf-client-connection-ip)
    const ip =
      headers['x-nf-client-connection-ip'] ||
      headers['x-forwarded-for']?.split(',')[0].trim() ||
      headers['client-ip'] ||
      'unknown';

    const userAgent = headers['user-agent'] || 'unknown';
    const timestamp = new Date().toISOString();

    const { denied, reason, latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = body;

    const entry = {
      timestamp,
      ip,
      userAgent,
      geolocation: denied
        ? { denied: true, reason: reason || 'unknown' }
        : { denied: false, latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed },
    };

    // Log visible en Netlify Dashboard → Functions → log
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
