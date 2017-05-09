'use strict';

// Load environment variables from .env file, where API keys and passwords are configured.
require('dotenv').config();
const bluebird = require('bluebird');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
global.Promise = bluebird;

const { is } = require('ramda');
const express = require('express');
const compression = require('compression');
const bodyParser = require('body-parser');
const logger = require('morgan');
const lusca = require('lusca');
const gstore = require('gstore-node');
const { ValidationError, ValidatorError } = require('gstore-node/lib/error');
const passport = require('passport');
const expressValidator = require('express-validator');
const cors = require('cors');

const authentication = require('./config/authentication');
const responseError = require('./utils/responseError');

/**
 * Controllers (route handlers).
 */
const homeController = require('./controllers/home');
const userController = require('./controllers/user');
const beneficiariesController = require('./controllers/beneficiaries');
const projectsController = require('./controllers/projects');

const datastore = require('./config/datastore');

/**
 * Create Express server.
 */
const app = express();

/**
 * Connect to Datastore
 */
gstore.connect(datastore);

/**
 * Express configuration.
 */
if (process.env.NODE_ENV !== 'test') {
  app.use(logger(process.env.NODE_ENV === 'development' ? 'dev' : 'short'));
}

app.use(cors({ origin: [process.env.CLIENT_URL, /\.gcriva\.ml$/] }));
app.use(responseError);
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressValidator());
app.use(passport.initialize());
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));

app.use(authentication.authenticate);

/**
 * Primary app routes.
 */
app.get('/', homeController.index);
app.post('/login', userController.postLogin);
app.post('/forgot', userController.postForgot);
app.post('/reset/:token', userController.postReset);
app.post('/signup', userController.postSignup);
app.post('/account/password', userController.postUpdatePassword);
app.post('/account/delete', authentication.authorizeAdmin, userController.postDeleteAccount);
app.get('/beneficiaries', beneficiariesController.beneficiaries);
app.post('/beneficiaries', beneficiariesController.create);
app.delete('/beneficiaries/:id', beneficiariesController.delete);
app.put('/beneficiaries/:id', beneficiariesController.update);
app.get('/projects', projectsController.index);
app.post('/projects', authentication.authorizeAdmin, projectsController.create);
app.put('/projects/:id', authentication.authorizeAdmin, projectsController.update);
app.delete('/projects/:id', authentication.authorizeAdmin, projectsController.delete);

/**
 * OAuth authentication routes. (Sign in)
 */
app.get('/auth/google', passport.authenticate('google', { scope: 'profile email' }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  res.redirect(req.session.returnTo || '/');
});


const isValidationError = is(ValidationError);
const isValidatorError = is(ValidatorError);

function handleModelErrors(error, req, res, next) {
  if (isValidationError(error) || isValidatorError(error)) {
    res.error(422, error);
  } else if (error.code === 404) {
    res.error(404, error.message);
  } else if (process.env.NODE_ENV === 'development') {
    // Show the entire error for debugging purposes
    console.error(error);
    res.error(500, error);
  } else {
    next(error);
  }
}
app.use(handleModelErrors);

module.exports = app;
