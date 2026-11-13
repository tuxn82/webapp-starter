'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// scrypt-parametre (OWASP-anbefaling: N=2^17, r=8, p=1 ~ 128 MiB).
// Vi bruger N=2^15 (~32 MiB) for at passe til små containere; kan hæves senere,
// da parametrene gemmes sammen med hashen.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };
const MIN_LENGTH = 12;

function maxmem(N, r) {
  return 128 * N * r * 2;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const { N, r, p, keylen } = PARAMS;
  const key = await scrypt(password, salt, keylen, { N, r, p, maxmem: maxmem(N, r) });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const N = Number(n);
  const R = Number(r);
  const P = Number(p);
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N,
    r: R,
    p: P,
    maxmem: maxmem(N, R),
  });
  return crypto.timingSafeEqual(key, expected);
}

// Bruges når e-mailen ikke findes, så svartiden ikke afslører om brugeren eksisterer.
let dummyHash;
async function burnTime(password) {
  if (!dummyHash) dummyHash = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Adgangskoden skal være mindst ${MIN_LENGTH} tegn.`;
  }
  if (password.length > 200) {
    return 'Adgangskoden er for lang.';
  }
  return null;
}

function generateTemporaryPassword() {
  // 16 tegn uden tvetydige tegn (0/O, 1/l/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

module.exports = {
  hashPassword,
  verifyPassword,
  burnTime,
  validatePassword,
  generateTemporaryPassword,
  MIN_LENGTH,
};
