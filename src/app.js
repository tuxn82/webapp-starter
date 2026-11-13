'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const helmet = require('helmet');

const config = require('./config');
const { pool } = require('./db');
const { loadUser, requireLogin, csrf, flash } = require('./middleware');
const { ipAllowlist } = require('./ipAllowlist');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.locals.appName = config.appName;

  // Healthcheck før IP-spærringen, så platformens interne tjek virker.
  app.get('/healthz', (req, res) => res.type('text').send('ok'));
  app.use(ipAllowlist(config.allowedIps));

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '50kb' }));

  app.use(
    session({
      name: 'hr.sid',
      store: new PgStore({ pool, tableName: 'user_sessions' }),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        maxAge: config.sessionMaxAgeHours * 60 * 60 * 1000,
      },
    }),
  );

  app.use((req, res, next) => {
    // Ingen caching af sider med persondata.
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(flash);
  app.use(csrf);
  app.use(loadUser);

  app.use(require('./routes/auth'));
  app.use('/admin', require('./routes/admin'));

  app.get('/', requireLogin, (req, res) => {
    res.render('dashboard', { title: 'Forside' });
  });

  app.use((req, res) => {
    res.status(404).render('error', { title: 'Ikke fundet', message: 'Siden findes ikke.' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { title: 'Fejl', message: 'Der opstod en uventet fejl. Prøv igen.' });
  });

  return app;
}

module.exports = { createApp };
