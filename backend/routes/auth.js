const express = require('express');

const { verifyToken } = require('../middleware/auth');
const { admin, adminInitialized } = require('../config/firebase');
const logger = require('../utils/logger');

const router = express.Router();

const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';
const FIREBASE_TIMEOUT_MS = Number(process.env.FIREBASE_TIMEOUT_MS || 8000);

const getApiKey = () => process.env.FIREBASE_API_KEY;

const createTimeoutError = () => {
  const error = new Error('Firebase request timed out.');
  error.code = 'FIREBASE_TIMEOUT';
  return error;
};

const firebaseJson = async (url, options, context) => {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(FIREBASE_TIMEOUT_MS),
    });
    const data = await response.json();

    logger.info('Firebase request completed', {
      context,
      statusCode: response.status,
      durationMs: Date.now() - startedAt,
    });

    return { response, data };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';

    if (isTimeout) {
      logger.warn('Firebase request timed out', {
        context,
        timeoutMs: FIREBASE_TIMEOUT_MS,
        durationMs,
      });
      throw createTimeoutError();
    }

    logger.error('Firebase request failed', {
      context,
      durationMs,
      error: error.message,
    });
    throw error;
  }
};

router.post('/signup', async (req, res) => {
  const { email, password, displayName } = req.body;
  const apiKey = getApiKey();

  logger.info('Signup attempt received', {
    email: logger.maskEmail(email),
    hasDisplayName: Boolean(displayName),
  });

  if (!email || !password) {
    logger.warn('Signup rejected due to missing credentials', {
      email: logger.maskEmail(email),
    });

    return res.status(400).json({
      success: false,
      error: 'Email and password are required.',
    });
  }

  if (password.length < 6) {
    logger.warn('Signup rejected due to weak password length', {
      email: logger.maskEmail(email),
    });

    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters.',
    });
  }

  if (!apiKey) {
    logger.error('Signup failed because Firebase API key is missing', {
      email: logger.maskEmail(email),
    });

    return res.status(503).json({
      success: false,
      error:
        'Backend is missing FIREBASE_API_KEY. Create backend/.env from backend/.env.example and restart the server.',
    });
  }

  try {
    const { data: signUpData } = await firebaseJson(
      `${IDENTITY_URL}:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      },
      'signup'
    );

    if (signUpData.error) {
      const code = signUpData.error.message;
      let message = 'Failed to create account.';
      let statusCode = 500;

      if (code === 'EMAIL_EXISTS') {
        message = 'An account with this email already exists.';
        statusCode = 409;
      } else if (code === 'INVALID_EMAIL') {
        message = 'Invalid email address.';
        statusCode = 400;
      } else if (code === 'WEAK_PASSWORD') {
        message = 'Password is too weak.';
        statusCode = 400;
      } else if (code === 'OPERATION_NOT_ALLOWED') {
        message = 'Email/Password sign-up is not enabled in Firebase.';
        statusCode = 403;
      } else if (code === 'API_KEY_INVALID' || code.includes('API key not valid')) {
        message =
          'Firebase API key is invalid. Update FIREBASE_API_KEY in backend/.env and restart the server.';
        statusCode = 503;
      } else if (code === 'CONFIGURATION_NOT_FOUND') {
        message = 'Firebase Authentication is not configured for this project.';
        statusCode = 503;
      }

      logger.warn('Signup failed', {
        email: logger.maskEmail(email),
        firebaseCode: code,
        statusCode,
      });

      return res.status(statusCode).json({ success: false, error: message });
    }

    logger.info('Signup succeeded', {
      uid: signUpData.localId,
      email: logger.maskEmail(signUpData.email),
      hasDisplayName: Boolean(displayName),
    });

    const responsePayload = {
      success: true,
      message: 'Account created successfully.',
      data: {
        uid: signUpData.localId,
        email: signUpData.email,
        displayName: displayName || '',
        idToken: signUpData.idToken,
        refreshToken: signUpData.refreshToken,
        expiresIn: signUpData.expiresIn,
      },
    };

    res.status(201).json(responsePayload);

    if (displayName) {
      if (adminInitialized) {
        setImmediate(() => {
          const backgroundStartedAt = Date.now();

          admin
            .auth()
            .updateUser(signUpData.localId, { displayName })
            .then(() => {
              logger.info('Signup display name updated via Admin SDK', {
                uid: signUpData.localId,
                durationMs: Date.now() - backgroundStartedAt,
              });
            })
            .catch((error) => {
              const level = error.code === 'auth/user-not-found' ? 'warn' : 'error';
              logger[level]('Signup display name update failed', {
                uid: signUpData.localId,
                error: error.message,
              });
            });
        });
      } else {
        await firebaseJson(
          `${IDENTITY_URL}:update?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: signUpData.idToken,
              displayName,
              returnSecureToken: false,
            }),
          },
          'signupProfileUpdate'
        );
      }
    }
  } catch (error) {
    if (error.code === 'FIREBASE_TIMEOUT') {
      return res.status(504).json({
        success: false,
        error: 'Signup is taking too long. Please try again in a moment.',
      });
    }

    logger.error('Signup handler crashed', {
      email: logger.maskEmail(email),
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Failed to create account.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const apiKey = getApiKey();

  logger.info('Login attempt received', {
    email: logger.maskEmail(email),
  });

  if (!email || !password) {
    logger.warn('Login rejected due to missing credentials', {
      email: logger.maskEmail(email),
    });

    return res.status(400).json({
      success: false,
      error: 'Email and password are required.',
    });
  }

  if (!apiKey) {
    logger.error('Login failed because Firebase API key is missing', {
      email: logger.maskEmail(email),
    });

    return res.status(503).json({
      success: false,
      error:
        'Backend is missing FIREBASE_API_KEY. Create backend/.env from backend/.env.example and restart the server.',
    });
  }

  try {
    const { data } = await firebaseJson(
      `${IDENTITY_URL}:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      },
      'login'
    );

    if (data.error) {
      const code = data.error.message;
      let message = 'Invalid email or password.';
      let statusCode = 401;

      if (code === 'EMAIL_NOT_FOUND' || code === 'INVALID_LOGIN_CREDENTIALS') {
        message = 'Invalid email or password.';
      } else if (code === 'INVALID_PASSWORD') {
        message = 'Incorrect password.';
      } else if (code === 'USER_DISABLED') {
        message = 'This account has been disabled.';
        statusCode = 403;
      } else if (code.includes('TOO_MANY_ATTEMPTS')) {
        message = 'Too many failed attempts. Please try again later.';
        statusCode = 429;
      } else if (code === 'API_KEY_INVALID' || code.includes('API key not valid')) {
        message =
          'Firebase API key is invalid. Update FIREBASE_API_KEY in backend/.env and restart the server.';
        statusCode = 503;
      } else if (code === 'CONFIGURATION_NOT_FOUND') {
        message = 'Firebase Authentication is not configured for this project.';
        statusCode = 503;
      }

      logger.warn('Login failed', {
        email: logger.maskEmail(email),
        firebaseCode: code,
        statusCode,
      });

      return res.status(statusCode).json({ success: false, error: message });
    }

    logger.info('Login succeeded', {
      uid: data.localId,
      email: logger.maskEmail(data.email),
    });

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        uid: data.localId,
        email: data.email,
        displayName: data.displayName || '',
        idToken: data.idToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
      },
    });
  } catch (error) {
    if (error.code === 'FIREBASE_TIMEOUT') {
      return res.status(504).json({
        success: false,
        error: 'Login is taking too long. Please try again in a moment.',
      });
    }

    logger.error('Login handler crashed', {
      email: logger.maskEmail(email),
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  const apiKey = getApiKey();

  if (!refreshToken) {
    logger.warn('Token refresh rejected due to missing refresh token');

    return res.status(400).json({
      success: false,
      error: 'Refresh token is required.',
    });
  }

  if (!apiKey) {
    logger.error('Token refresh failed because Firebase API key is missing');

    return res.status(503).json({
      success: false,
      error:
        'Backend is missing FIREBASE_API_KEY. Create backend/.env from backend/.env.example and restart the server.',
    });
  }

  try {
    const { data } = await firebaseJson(
      `${TOKEN_URL}?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      },
      'tokenRefresh'
    );

    if (data.error) {
      logger.warn('Token refresh failed', {
        firebaseCode: data.error.message,
      });

      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token.',
      });
    }

    logger.info('Token refresh succeeded');

    res.json({
      success: true,
      data: {
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      },
    });
  } catch (error) {
    if (error.code === 'FIREBASE_TIMEOUT') {
      return res.status(504).json({
        success: false,
        error: 'Token refresh is taking too long. Please try again in a moment.',
      });
    }

    logger.error('Token refresh handler crashed', {
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Failed to refresh token.' });
  }
});

router.get('/profile', verifyToken, async (req, res) => {
  try {
    if (adminInitialized) {
      const userInfo = await admin.auth().getUser(req.user.uid);

      logger.info('Profile fetched via Admin SDK', {
        uid: userInfo.uid,
        email: logger.maskEmail(userInfo.email),
      });

      return res.json({
        success: true,
        data: {
          uid: userInfo.uid,
          email: userInfo.email,
          displayName: userInfo.displayName || '',
          photoURL: userInfo.photoURL || '',
          emailVerified: userInfo.emailVerified || false,
          createdAt: userInfo.metadata?.creationTime || null,
          lastLoginAt: userInfo.metadata?.lastSignInTime || null,
        },
      });
    }

    const apiKey = getApiKey();
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const { data } = await firebaseJson(
      `${IDENTITY_URL}:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
      'profileLookup'
    );

    const userInfo = data.users?.[0];

    if (!userInfo) {
      logger.warn('Profile lookup failed because user was not found', {
        uid: req.user?.uid,
        email: logger.maskEmail(req.user?.email),
      });

      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    logger.info('Profile fetched', {
      uid: userInfo.localId,
      email: logger.maskEmail(userInfo.email),
    });

    res.json({
      success: true,
      data: {
        uid: userInfo.localId,
        email: userInfo.email,
        displayName: userInfo.displayName || '',
        photoURL: userInfo.photoUrl || '',
        emailVerified: userInfo.emailVerified || false,
        createdAt: userInfo.createdAt,
        lastLoginAt: userInfo.lastLoginAt,
      },
    });
  } catch (error) {
    logger.error('Profile fetch failed', {
      uid: req.user?.uid,
      email: logger.maskEmail(req.user?.email),
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Failed to get profile.' });
  }
});

router.put('/profile', verifyToken, async (req, res) => {
  const { displayName, photoURL } = req.body;
  const apiKey = getApiKey();

  try {
    if (adminInitialized) {
      const updateData = {};
      if (displayName !== undefined) updateData.displayName = displayName;
      if (photoURL !== undefined) updateData.photoURL = photoURL;

      const userRecord = await admin.auth().updateUser(req.user.uid, updateData);

      logger.info('Profile updated via Admin SDK', {
        uid: userRecord.uid,
        email: logger.maskEmail(userRecord.email),
        updatedDisplayName: displayName !== undefined,
        updatedPhotoUrl: photoURL !== undefined,
      });

      return res.json({
        success: true,
        message: 'Profile updated.',
        data: {
          uid: userRecord.uid,
          email: userRecord.email,
          displayName: userRecord.displayName || '',
          photoURL: userRecord.photoURL || '',
        },
      });
    }

    const idToken = req.headers.authorization.split('Bearer ')[1];
    const updateData = { idToken, returnSecureToken: false };
    if (displayName !== undefined) updateData.displayName = displayName;
    if (photoURL !== undefined) updateData.photoUrl = photoURL;

    const { data } = await firebaseJson(
      `${IDENTITY_URL}:update?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      },
      'profileUpdate'
    );

    if (data.error) {
      throw new Error(data.error.message);
    }

    logger.info('Profile updated', {
      uid: data.localId,
      email: logger.maskEmail(data.email),
      updatedDisplayName: displayName !== undefined,
      updatedPhotoUrl: photoURL !== undefined,
    });

    res.json({
      success: true,
      message: 'Profile updated.',
      data: {
        uid: data.localId,
        email: data.email,
        displayName: data.displayName || '',
        photoURL: data.photoUrl || '',
      },
    });
  } catch (error) {
    logger.error('Profile update failed', {
      uid: req.user?.uid,
      email: logger.maskEmail(req.user?.email),
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

router.delete('/account', verifyToken, async (req, res) => {
  const apiKey = getApiKey();

  try {
    if (adminInitialized) {
      await admin.auth().deleteUser(req.user.uid);

      logger.info('Account deleted via Admin SDK', {
        uid: req.user?.uid,
        email: logger.maskEmail(req.user?.email),
      });

      return res.json({ success: true, message: 'Account deleted.' });
    }

    const idToken = req.headers.authorization.split('Bearer ')[1];
    const { data } = await firebaseJson(
      `${IDENTITY_URL}:delete?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      },
      'accountDelete'
    );

    if (data.error) {
      throw new Error(data.error.message);
    }

    logger.info('Account deleted', {
      uid: req.user?.uid,
      email: logger.maskEmail(req.user?.email),
    });

    res.json({ success: true, message: 'Account deleted.' });
  } catch (error) {
    logger.error('Account delete failed', {
      uid: req.user?.uid,
      email: logger.maskEmail(req.user?.email),
      error: error.message,
    });

    res.status(500).json({ success: false, error: 'Failed to delete account.' });
  }
});

module.exports = router;
