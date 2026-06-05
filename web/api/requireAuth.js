// Verifies Supabase access tokens (JWT) locally against the project's JWKS.
// The project signs tokens with an asymmetric key (ES256), so we can verify
// offline with `jose` — no per-request call to Supabase and no service key.
const { createRemoteJWKSet, jwtVerify } = require('jose');

let jwks = null;

function supabaseBaseUrl() {
  return `${process.env.SUPABASE_URL || ''}`.replace(/\/+$/, '');
}

function isSupabaseAuthConfigured() {
  return Boolean(supabaseBaseUrl());
}

function getJwks() {
  if (jwks) return jwks;
  const base = supabaseBaseUrl();
  if (!base) return null;
  jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  return jwks;
}

function getIssuer() {
  return `${supabaseBaseUrl()}/auth/v1`;
}

function extractToken(req) {
  const header = (req.get ? req.get('authorization') : req.headers?.authorization) || '';
  const match = /^Bearer\s+(.+)$/i.exec(`${header}`.trim());
  if (match) return match[1].trim();
  // Fallback for WebSocket upgrades, which cannot set headers from the browser.
  try {
    const url = new URL(req.url, 'http://localhost');
    return (url.searchParams.get('access_token') || '').trim();
  } catch (error) {
    return '';
  }
}

// Verifies a raw token string. Returns the JWT payload (sub = user id, email, role...).
async function verifySupabaseToken(token) {
  if (!token) {
    throw new Error('missing token');
  }
  const keySet = getJwks();
  if (!keySet) {
    const error = new Error('auth not configured (missing SUPABASE_URL)');
    error.code = 'AUTH_NOT_CONFIGURED';
    throw error;
  }
  const { payload } = await jwtVerify(token, keySet, {
    issuer: getIssuer(),
    audience: 'authenticated'
  });
  return payload;
}

// Express middleware: requires a valid Supabase session when auth is configured.
// If Supabase is absent, degrade to a local anonymous user so the app remains usable.
function requireAuth(req, res, next) {
  if (!isSupabaseAuthConfigured()) {
    req.user = { id: 'local-dev-user', email: '', role: 'local-dev', token: '' };
    return next();
  }

  const token = extractToken(req);
  verifySupabaseToken(token)
    .then((payload) => {
      req.user = { id: payload.sub, email: payload.email || '', role: payload.role || '', token };
      next();
    })
    .catch((error) => {
      if (error.code === 'AUTH_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'Autenticación no configurada en el servidor.' });
      }
      res.status(401).json({ error: 'No autorizado.' });
    });
}

module.exports = { requireAuth, verifySupabaseToken, extractToken, isSupabaseAuthConfigured };
