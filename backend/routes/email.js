const express = require('express');
const { DEFAULT_RECIPIENTS, sendEmergencyEmail } = require('../services/emailService');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const report = req?.body?.report;
    if (!report || typeof report !== 'object') {
      return res.status(400).json({ success: false, error: 'report is required.' });
    }

    const result = await sendEmergencyEmail(report, DEFAULT_RECIPIENTS);

    if (!result?.success) {
      return res.status(502).json({
        success: false,
        error: result?.error || 'Failed to send emergency email.',
      });
    }

    return res.json({ success: true });
  } catch (e) {
    console.log('[email] unhandled error =', e?.message || e);
    return res.status(500).json({ success: false, error: 'Failed to send emergency email.' });
  }
});

module.exports = router;

