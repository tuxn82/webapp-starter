'use strict';

const crypto = require('node:crypto');
const users = require('./users');

// Henter den indloggede bruger fra databasen ved hver request, så en deaktiveret
// bruger eller ændret rolle slår igennem med det samme.
async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  const userId = req.session?.userId;
  if (!userId) return next();
  try {
    const user = await users.findById(userId);
    if (!user || !user.active) {
      return req.session.destroy(() => res.redirect('/login'));
    }
    req.user = user;
    res.locals.currentUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireLogin(req, res, next) {
  if (!req.user) return res.redirect('/login');
  // Brugere med midlertidig adgangskode skal skifte den, før de kan andet.
  if (req.user.must_change_password && req.path !== '/account/password' && req.path !== '/logout') {
    return res.redirect('/account/password');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).render('error', { title: 'Ingen adgang', message: 'Du har ikke adgang til denne side.' });
  }
  next();
}

// Synchronizer-token mod CSRF på alle formularer.
function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const sent = Buffer.from(String(req.body?._csrf || ''));
  const expected = Buffer.from(req.session.csrfToken);
  if (sent.length !== expected.length || !crypto.timingSafeEqual(sent, expected)) {
    return res.status(403).render('error', {
      title: 'Ugyldig formular',
      message: 'Formularen er udløbet. Gå tilbage, genindlæs siden og prøv igen.',
    });
  }
  next();
}

// Engangsbeskeder der vises på næste side.
function flash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  req.flash = (type, text) => {
    req.session.flash = { type, text };
  };
  next();
}

module.exports = { loadUser, requireLogin, requireAdmin, csrf, flash };
