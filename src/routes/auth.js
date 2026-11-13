'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const users = require('../users');
const { verifyPassword, burnTime, validatePassword } = require('../passwords');
const { requireLogin } = require('../middleware');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).render('login', {
      title: 'Log ind',
      email: req.body?.email || '',
      error: 'For mange loginforsøg. Vent 15 minutter og prøv igen.',
    });
  },
});

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Log ind', email: '', error: null });
});

router.post('/login', loginLimiter, async (req, res, next) => {
  const email = String(req.body.email || '');
  const password = String(req.body.password || '');
  const fail = () =>
    res.status(401).render('login', { title: 'Log ind', email, error: 'Forkert e-mail eller adgangskode.' });

  try {
    const user = await users.findByEmailWithHash(email);
    if (!user) {
      await burnTime(password);
      return fail();
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok || !user.active) return fail();

    // Ny session-id ved login (beskytter mod session fixation).
    req.session.regenerate(async (err) => {
      if (err) return next(err);
      req.session.userId = user.id;
      await users.recordLogin(user.id);
      req.session.save((err2) => {
        if (err2) return next(err2);
        res.redirect(user.must_change_password ? '/account/password' : '/');
      });
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('hr.sid');
    res.redirect('/login');
  });
});

router.get('/account/password', requireLogin, (req, res) => {
  res.render('account/password', { title: 'Skift adgangskode', error: null });
});

router.post('/account/password', requireLogin, async (req, res, next) => {
  const { current_password: current, new_password: next1, confirm_password: next2 } = req.body;
  const render = (error) => res.status(400).render('account/password', { title: 'Skift adgangskode', error });
  try {
    const hash = await users.getPasswordHash(req.user.id);
    if (!(await verifyPassword(String(current || ''), hash))) return render('Den nuværende adgangskode er forkert.');
    const invalid = validatePassword(next1);
    if (invalid) return render(invalid);
    if (next1 !== next2) return render('De to nye adgangskoder er ikke ens.');
    if (next1 === current) return render('Den nye adgangskode skal være forskellig fra den gamle.');

    await users.setPassword(req.user.id, next1, { mustChangePassword: false });
    // Log ud på alle andre enheder.
    await users.destroySessions(req.user.id, req.sessionID);
    req.flash('success', 'Din adgangskode er ændret.');
    res.redirect('/');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
