'use strict';

const config = require('./src/config');
const { pool, migrate } = require('./src/db');
const users = require('./src/users');
const { validatePassword } = require('./src/passwords');
const { createApp } = require('./src/app');

async function bootstrapAdmin() {
  if ((await users.count()) > 0) return;
  const { email, password, name } = config.bootstrapAdmin;
  if (!email || !password) {
    console.warn(
      'Der findes ingen brugere. Sæt ADMIN_EMAIL og ADMIN_PASSWORD og genstart, ' +
        'eller kør: npm run create-admin -- <email> "<navn>"',
    );
    return;
  }
  const invalid = validatePassword(password);
  if (invalid) throw new Error(`ADMIN_PASSWORD: ${invalid}`);
  await users.create({ email, name, role: 'admin', password, mustChangePassword: true });
  console.log(`Første administrator oprettet: ${email} (skal skifte adgangskode ved første login)`);
}

async function main() {
  await migrate();
  await bootstrapAdmin();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`${config.appName} kører på port ${config.port}`);
    if (config.allowedIps.length) {
      console.log(`IP-spærring aktiv: ${config.allowedIps.join(', ')}`);
    } else {
      console.warn('IP-spærring er slået fra (ALLOWED_IPS er tom) - appen er åben for alle IP-adresser');
    }
  });

  const shutdown = () => {
    server.close(() => pool.end().then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Kunne ikke starte:', err);
  process.exit(1);
});
