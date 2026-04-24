const { admin, adminInitialized } = require('../config/firebase');

/**
 * Middleware to verify user authentication.
 * Uses Firebase Admin SDK if available, otherwise verifies via REST API.
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'No token provided. Send Authorization: Bearer <token>',
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    if (adminInitialized) {
      // Use Admin SDK for fast, local token verification
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name || '',
      };
    } else {
      // Fallback: verify token via Firebase REST API (lookup user by idToken)
      const API_KEY = process.env.FIREBASE_API_KEY;
      if (!API_KEY) {
        return res.status(500).json({
          success: false,
          error:
            'Backend misconfigured: FIREBASE_API_KEY is missing. Create backend/.env from backend/.env.example and restart the backend server.',
        });
      }
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      const userInfo = data.users?.[0];
      if (!userInfo) {
        throw new Error('User not found');
      }

      req.user = {
        uid: userInfo.localId,
        email: userInfo.email,
        displayName: userInfo.displayName || '',
      };
    }

    next();
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token.',
    });
  }
};

module.exports = { verifyToken };
