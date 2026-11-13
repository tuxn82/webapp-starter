'use strict';

const express = require('express');
const users = require('../users');
const { validatePassword, generateTemporaryPassword } = require('../passwords');
const { requireLogin, requireAdmin } = require('../middleware');

const router = express.Router();
router.use(requireLogin, requireAdmin);

const ROLES = ['user', 'admin'];

function readForm(body) {
  return {
    name: String(body.name || '').trim(),
    email: users.normalizeEmail(body.email),
    role: ROLES.includes(body.role) ? body.role : 'user',
    active: body.active === 'on',
  };
}

function validateForm(form) {
  if (!form.name) return 'Navn skal udfyldes.';
  if (form.name.length > 200) return 'Navnet er for langt.';
  if (!users.isValidEmail(form.email)) return 'Ugyldig e-mailadresse.';
  return null;
}

function isUniqueViolation(err) {
  return err && err.code === '23505';
}

function parseId(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).render('error', { title: 'Ikke fundet', message: 'Brugeren findes ikke.' });
    return null;
  }
  return id;
}

router.get('/users', async (req, res, next) => {
  try {
    res.render('admin/users', { title: 'Brugere', users: await users.listAll(), tempPassword: null });
  } catch (err) {
    next(err);
  }
});

router.get('/users/new', (req, res) => {
  res.render('admin/user-form', {
    title: 'Opret bruger',
    form: { name: '', email: '', role: 'user', active: true },
    editing: null,
    error: null,
  });
});

router.post('/users', async (req, res, next) => {
  const form = readForm(req.body);
  const renderError = (error) =>
    res.status(400).render('admin/user-form', { title: 'Opret bruger', form, editing: null, error });

  const error = validateForm(form);
  if (error) return renderError(error);

  // Admin kan selv angive en midlertidig adgangskode, ellers genereres en.
  let password = String(req.body.password || '');
  if (password) {
    const invalid = validatePassword(password);
    if (invalid) return renderError(invalid);
  } else {
    password = generateTemporaryPassword();
  }

  try {
    const user = await users.create({ ...form, password, mustChangePassword: true });
    res.render('admin/password-created', {
      title: 'Bruger oprettet',
      user,
      password,
      heading: 'Bruger oprettet',
    });
  } catch (err) {
    if (isUniqueViolation(err)) return renderError('Der findes allerede en bruger med den e-mail.');
    next(err);
  }
});

router.get('/users/:id/edit', async (req, res, next) => {
  const id = parseId(req, res);
  if (!id) return;
  try {
    const user = await users.findById(id);
    if (!user) return res.status(404).render('error', { title: 'Ikke fundet', message: 'Brugeren findes ikke.' });
    res.render('admin/user-form', { title: 'Rediger bruger', form: user, editing: user, error: null });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id', async (req, res, next) => {
  const id = parseId(req, res);
  if (!id) return;
  try {
    const existing = await users.findById(id);
    if (!existing) return res.status(404).render('error', { title: 'Ikke fundet', message: 'Brugeren findes ikke.' });

    const form = readForm(req.body);
    const renderError = (error) =>
      res.status(400).render('admin/user-form', { title: 'Rediger bruger', form, editing: existing, error });

    const error = validateForm(form);
    if (error) return renderError(error);

    const isSelf = id === req.user.id;
    if (isSelf && (!form.active || form.role !== 'admin')) {
      return renderError('Du kan ikke deaktivere dig selv eller fjerne din egen admin-rolle.');
    }
    const losingAdmin = existing.role === 'admin' && existing.active && (form.role !== 'admin' || !form.active);
    if (losingAdmin && (await users.countActiveAdmins()) <= 1) {
      return renderError('Der skal altid være mindst én aktiv administrator.');
    }

    try {
      await users.update(id, form);
    } catch (err) {
      if (isUniqueViolation(err)) return renderError('Der findes allerede en bruger med den e-mail.');
      throw err;
    }
    if (!form.active) await users.destroySessions(id);

    req.flash('success', `${form.name} er opdateret.`);
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/reset-password', async (req, res, next) => {
  const id = parseId(req, res);
  if (!id) return;
  try {
    const user = await users.findById(id);
    if (!user) return res.status(404).render('error', { title: 'Ikke fundet', message: 'Brugeren findes ikke.' });
    if (id === req.user.id) {
      req.flash('error', 'Brug "Skift adgangskode" til din egen konto.');
      return res.redirect('/admin/users');
    }
    const password = generateTemporaryPassword();
    await users.setPassword(id, password, { mustChangePassword: true });
    await users.destroySessions(id);
    res.render('admin/password-created', {
      title: 'Adgangskode nulstillet',
      user,
      password,
      heading: 'Adgangskode nulstillet',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
