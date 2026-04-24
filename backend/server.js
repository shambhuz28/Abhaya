const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');

const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request completed', {
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
    });
  });

  next();
});

const authRoutes = require('./routes/auth');
const journeyRoutes = require('./routes/journey');
const historyRoutes = require('./routes/history');
const vehicleObservationRoutes = require('./routes/vehicleObservations');
app.use('/api/auth', authRoutes);
app.use('/api/journey', journeyRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/vehicle-observations', vehicleObservationRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SafeGuard Backend',
    firebaseConfigured: Boolean(process.env.FIREBASE_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  logger.warn('Route not found', {
    method: req.method,
    path: req.originalUrl || req.path,
  });

  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found.`,
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled server error', {
    method: req.method,
    path: req.path,
    error: err.message,
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error.',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SafeGuard Backend Server running on http://0.0.0.0:${PORT}`);
  console.log('Available routes:');
  console.log('POST   /api/auth/signup');
  console.log('POST   /api/auth/login');
  console.log('POST   /api/auth/refresh');
  console.log('GET    /api/auth/profile');
  console.log('PUT    /api/auth/profile');
  console.log('DELETE /api/auth/account');
  console.log('GET    /api/journey/geocode');
  console.log('GET    /api/journey/route');
  console.log('POST   /api/journey/check-deviation');
  console.log('POST   /api/journey/sos');
  console.log('GET    /api/history');
  console.log('POST   /api/history');
  console.log('POST   /api/history/:historyId/events');
  console.log('PATCH  /api/history/:historyId');
  console.log('GET    /api/vehicle-observations');
  console.log('POST   /api/vehicle-observations');
  console.log('GET    /api/health');

  logger.info('Backend server started', {
    port: PORT,
    firebaseConfigured: Boolean(process.env.FIREBASE_API_KEY),
    logFilePath: logger.logFilePath,
  });
});
