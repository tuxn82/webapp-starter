'use strict';

const isProduction = process.env.NODE_ENV === 'production';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Miljøvariablen ${name} mangler`);
  }
  return value;
}

const sessionSecret = process.env.SESSION_SECRET || (isProduction ? null : 'dev-only-secret-change-me');
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProduction) {
    throw new Error('SESSION_SECRET skal være sat og mindst 32 tegn lang');
  }
}

module.exports = {
  isProduction,
  appName: process.env.APP_NAME || 'Webapp',
  // Kommasepareret liste af IP'er/CIDR'er, f.eks. "203.0.113.10, 198.51.100.0/24". Tom = ingen spærring.
  allowedIps: (process.env.ALLOWED_IPS || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean),
  port: Number(process.env.PORT) || 8080,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true',
  sessionSecret,
  // Cookies kun over HTTPS i produktion. Kan slås fra midlertidigt med COOKIE_SECURE=false.
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  // Antal reverse proxies foran appen (NGINX-balanceren = 1).
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  sessionMaxAgeHours: Number(process.env.SESSION_MAX_AGE_HOURS) || 8,
  bootstrapAdmin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: process.env.ADMIN_NAME || 'Administrator',
  },
};
