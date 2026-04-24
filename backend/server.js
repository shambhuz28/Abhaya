const path = require('path');
const dotenvResult = require('dotenv').config({ path: path.join(__dirname, '.env') });
if (dotenvResult.error) {
  console.warn('⚠️  backend/.env not found. Copy backend/.env.example -> backend/.env and restart the server.');
}
console.log(`ℹ️  FIREBASE_API_KEY ${process.env.FIREBASE_API_KEY ? 'loaded' : 'missing'}`);
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logger (dev)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const incidentRoutes = require('./routes/incidents');
app.use('/api/incidents', incidentRoutes);

const emailRoutes = require('./routes/email');
// Supports both:
// - POST /send-email (as requested)
// - POST /api/send-email (if client uses an /api base URL)
app.use(['/send-email', '/api/send-email'], emailRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SafeGuard Backend',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found.`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error.',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     🛡️  SafeGuard Backend Server        ║
  ║     Running on http://0.0.0.0:${PORT}      ║
  ╚══════════════════════════════════════════╝
  `);
  console.log('  Available routes:');
  console.log('  POST   /api/auth/signup');
  console.log('  POST   /api/auth/login');
  console.log('  POST   /api/auth/refresh');
  console.log('  GET    /api/auth/profile');
  console.log('  PUT    /api/auth/profile');
  console.log('  DELETE /api/auth/account');
  console.log('  POST   /send-email');
  console.log('  POST   /api/send-email');
  console.log('  GET    /api/health');
  console.log('');
});
