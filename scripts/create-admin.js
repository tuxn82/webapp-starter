'use strict';

// Opret en administrator fra kommandolinjen (f.eks. via Web SSH på Node.js-noden):
//   npm run create-admin -- navn@firma.dk "Fulde Navn"
// En midlertidig adgangskode udskrives; den skal skiftes ved første login.

const { pool, migrate } = require('../src/db');
const users = require('../src/users');
const { generateTemporaryPassword } = require('../src/passwords');

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  const name = nameParts.join(' ').trim() || 'Administrator';
  if (!email || !users.isValidEmail(users.normalizeEmail(email))) {
    console.error('Brug: npm run create-admin -- <email> "<navn>"');
    process.exitCode = 1;
    return;
  }
  await migrate();
  const password = generateTemporaryPassword();
  const user = await users.create({ email, name, role: 'admin', password, mustChangePassword: true });
  console.log(`Administrator oprettet: ${user.email}`);
  console.log(`Midlertidig adgangskode: ${password}`);
}

main()
  .catch((err) => {
    if (err.code === '23505') console.error('Der findes allerede en bruger med den e-mail.');
    else console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
