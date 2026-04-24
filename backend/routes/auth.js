const express = require('express');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Firebase REST API base URLs
const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

const requireFirebaseApiKey = (res) => {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (apiKey) return apiKey;
  res.status(500).json({
    success: false,
    error:
      'Backend misconfigured: FIREBASE_API_KEY is missing. Create backend/.env from backend/.env.example and restart the backend server.',
  });
  return null;
};

/**
 * POST /api/auth/signup
 * Create a new user with email, password, and display name.
 * Body: { email, password, displayName }
 */
router.post('/signup', async (req, res) => {
  const apiKey = requireFirebaseApiKey(res);
  if (!apiKey) return;
  const { email, password, displayName } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required.',
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 6 characters.',
    });
  }

  try {
    // Step 1: Create user via Firebase REST API
    const signUpResponse = await fetch(`${IDENTITY_URL}:signUp?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    const signUpData = await signUpResponse.json();

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
      }

      return res.status(statusCode).json({ success: false, error: message });
    }

    // Step 2: Set display name if provided
    if (displayName) {
      await fetch(`${IDENTITY_URL}:update?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: signUpData.idToken,
          displayName,
          returnSecureToken: false,
        }),
      });
    }

    res.status(201).json({
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
    });
  } catch (error) {
    console.error('Signup error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create account.' });
  }
});

/**
 * POST /api/auth/login
 * Sign in with email and password.
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  const apiKey = requireFirebaseApiKey(res);
  if (!apiKey) return;
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password are required.',
    });
  }

  try {
    // Sign in via Firebase REST API
    const response = await fetch(`${IDENTITY_URL}:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    const data = await response.json();

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
      }

      return res.status(statusCode).json({ success: false, error: message });
    }

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
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh an expired ID token using a refresh token.
 * Body: { refreshToken }
 */
router.post('/refresh', async (req, res) => {
  const apiKey = requireFirebaseApiKey(res);
  if (!apiKey) return;
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Refresh token is required.',
    });
  }

  try {
    const response = await fetch(`${TOKEN_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();

    if (data.error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token.',
      });
    }

    res.json({
      success: true,
      data: {
        idToken: data.id_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to refresh token.' });
  }
});

/**
 * GET /api/auth/profile
 * Get the authenticated user's profile.
 * Requires: Authorization: Bearer <idToken>
 */
router.get('/profile', verifyToken, async (req, res) => {
  const apiKey = requireFirebaseApiKey(res);
  if (!apiKey) return;
  try {
    // Get full profile from Firebase REST API
    const idToken = req.headers.authorization.split('Bearer ')[1];
    const response = await fetch(`${IDENTITY_URL}:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    const data = await response.json();
    const userInfo = data.users?.[0];

    if (!userInfo) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

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
    console.error('Profile error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get profile.' });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile (display name, photo).
 * Requires: Authorization: Bearer <idToken>
 * Body: { displayName, photoURL }
 */
router.put('/profile', verifyToken, async (req, res) => {
  const apiKey = requireFirebaseApiKey(res);
  if (!apiKey) return;
  const { displayName, photoURL } = req.body;
  const idToken = req.headers.authorization.split('Bearer ')[1];

  try {
    const updateData = { idToken, returnSecureToken: false };
    if (displayName !== undefined) updateData.displayName = displayName;
    if (photoURL !== undefined) updateData.photoUrl = photoURL;

    const response = await fetch(`${IDENTITY_URL}:update?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

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
    console.error('Profile update error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
});

/**
 * DELETE /api/auth/account
 * Delete the authenticated user's account.
 * Requires: Authorization: Bearer <idToken>
 */
router.delete('/account', verifyToken, async (req, res) => {
  const apiKey = requireFirebaseApiKey(res);
  if (!apiKey) return;
  const idToken = req.headers.authorization.split('Bearer ')[1];

  try {
    const response = await fetch(`${IDENTITY_URL}:delete?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    res.json({ success: true, message: 'Account deleted.' });
  } catch (error) {
    console.error('Account delete error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete account.' });
  }
});

module.exports = router;
