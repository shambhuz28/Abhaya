const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const express = require('express');

const { admin, adminInitialized } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads', 'vehicle-observations');
const profilesFilePath = path.join(
  __dirname,
  '..',
  'data',
  'noPlateVehicleProfilesDetailed.json'
);
fs.mkdirSync(uploadsDir, { recursive: true });

const getObservationCollection = (uid) =>
  admin.firestore().collection('users').doc(uid).collection('vehicleObservations');

const ensureFirestore = (res) => {
  if (!adminInitialized) {
    res.status(503).json({
      success: false,
      error:
        'Vehicle observations require Firebase Admin SDK. Add backend/config/serviceAccountKey.json and enable Firestore.',
    });
    return false;
  }

  return true;
};

const sanitizeNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toClientRecord = (doc) => {
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.().toISOString?.() || data.createdAt || null,
    updatedAt: data.updatedAt?.toDate?.().toISOString?.() || data.updatedAt || null,
  };
};

const parseDataUrl = (dataUrl) => {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
};

const extensionFromMime = (mimeType) => {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
};

const groqApiKey = process.env.GROQ_API_KEY;
const groqVisionModel =
  process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const groqTimeoutMs = Number(process.env.GROQ_TIMEOUT_MS || 15000);

const loadNoPlateProfiles = () => {
  try {
    const raw = fs.readFileSync(profilesFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((profile, index) => ({
      profile_id: profile.profile_id || `vehicle-profile-${index + 1}`,
      ...profile,
    }));
  } catch {
    return [];
  }
};

const getAutoVehicleProfile = (seedText = '') => {
  const profiles = loadNoPlateProfiles();
  if (!profiles.length) {
    return {
      profile_id: 'vehicle-profile-default',
      vehicle_type: 'Unknown Vehicle',
      brand: 'Unknown Brand',
      model: 'Unknown Model',
      color: 'Unknown Color',
      plate_number: 'No plate visible',
      driver_name: 'Unknown Driver',
      driver_phone: 'Unknown Phone',
      owner_name: 'Unknown Owner',
      operator_name: 'Unknown Operator',
      registration_zone: 'Unknown Area',
      fuel_type: 'Unknown Fuel',
      seating_capacity: 'Unknown Seats',
      vehicle_condition: 'Unknown Condition',
      identification_mark: 'No visible mark',
    };
  }

  const seed = String(seedText || '');
  const hash = [...seed].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
  return profiles[hash % profiles.length] || profiles[0];
};

const normalizeDetectedText = (value) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
};

const normalizePlateNumber = (value) => {
  const normalized = normalizeDetectedText(value);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\s+/g, ' ').toUpperCase();
};

const parseGroqJson = (content = '') => {
  const raw = String(content || '').trim();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const detectVehicleWithGroq = async ({ imageDataUrl }) => {
  if (!groqApiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), groqTimeoutMs);

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: groqVisionModel,
        temperature: 0.1,
        max_completion_tokens: 500,
        messages: [
          {
            role: 'system',
            content:
              'You analyze vehicle photos. Return only one valid JSON object. If a field is uncertain, set it to null. Do not invent a visible number plate if it cannot be read from the image.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Inspect this vehicle image and return JSON with exactly these keys: vehicleType, vehicleBrand, vehicleModel, vehicleColor, plateNumber, noPlateVisible, confidence, identificationMark. Use short values. plateNumber must be null when unreadable or absent. noPlateVisible must be true when no number plate is visible, otherwise false.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      logger.warn('Groq vision request failed', {
        statusCode: response.status,
        model: groqVisionModel,
        body: errorBody.slice(0, 500),
      });
      return null;
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    const parsed = parseGroqJson(content);

    if (!parsed) {
      logger.warn('Groq vision response was not valid JSON', {
        model: groqVisionModel,
        contentPreview: String(content || '').slice(0, 300),
      });
      return null;
    }

    return {
      vehicleType: normalizeDetectedText(parsed.vehicleType),
      vehicleBrand: normalizeDetectedText(parsed.vehicleBrand),
      vehicleModel: normalizeDetectedText(parsed.vehicleModel),
      vehicleColor: normalizeDetectedText(parsed.vehicleColor),
      plateNumber: normalizePlateNumber(parsed.plateNumber),
      noPlateVisible:
        typeof parsed.noPlateVisible === 'boolean' ? parsed.noPlateVisible : null,
      confidence: normalizeDetectedText(parsed.confidence),
      identificationMark: normalizeDetectedText(parsed.identificationMark),
    };
  } catch (error) {
    logger.warn('Groq vision request error', {
      model: groqVisionModel,
      error: error.message,
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

router.get('/', verifyToken, async (req, res) => {
  if (!ensureFirestore(res)) return;

  const limit = Math.min(Number(req.query.limit || 30), 100);

  try {
    const snapshot = await getObservationCollection(req.user.uid)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();

    return res.json({
      success: true,
      data: snapshot.docs.map(toClientRecord),
    });
  } catch (error) {
    logger.error('Vehicle observations list failed', {
      uid: req.user.uid,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to load vehicle observations.',
    });
  }
});

router.post('/', verifyToken, async (req, res) => {
  if (!ensureFirestore(res)) return;

  const {
    imageDataUrl,
    noPlate,
    vehicleType,
    vehicleColor,
    vehicleBrand,
    vehicleModel,
    note,
    latitude,
    longitude,
  } = req.body || {};

  if (!imageDataUrl) {
    return res.status(400).json({
      success: false,
      error: 'Vehicle image is required.',
    });
  }

  const parsedImage = parseDataUrl(imageDataUrl);
  if (!parsedImage) {
    return res.status(400).json({
      success: false,
      error: 'Vehicle image must be sent as a valid base64 data URL.',
    });
  }

  try {
    const fileExtension = extensionFromMime(parsedImage.mimeType);
    const imageBuffer = Buffer.from(parsedImage.base64, 'base64');
    const imageFingerprint = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    const autoProfile = getAutoVehicleProfile(imageFingerprint);
    const groqDetection = await detectVehicleWithGroq({ imageDataUrl });
    const resolvedNoPlate =
      groqDetection?.plateNumber
        ? false
        : typeof groqDetection?.noPlateVisible === 'boolean'
          ? groqDetection.noPlateVisible
          : typeof noPlate === 'boolean'
            ? noPlate
            : true;
    const autoDetails = {
      profileId: autoProfile.profile_id || null,
      driverName: autoProfile.driver_name || null,
      plateNumber:
        groqDetection?.plateNumber ||
        (resolvedNoPlate ? 'No plate visible' : autoProfile.plate_number || null),
      driverPhone: autoProfile.driver_phone || null,
      ownerName: autoProfile.owner_name || null,
      operatorName: autoProfile.operator_name || null,
      registrationZone: autoProfile.registration_zone || null,
      fuelType: autoProfile.fuel_type || null,
      seatingCapacity: autoProfile.seating_capacity || null,
      vehicleCondition: autoProfile.vehicle_condition || null,
      identificationMark: groqDetection?.identificationMark || autoProfile.identification_mark || null,
      aiConfidence: groqDetection?.confidence || null,
    };

    fs.writeFileSync(filePath, imageBuffer);

    const payload = {
      noPlate: resolvedNoPlate,
      profileId: autoDetails.profileId,
      imageFingerprint,
      vehicleType:
        String(vehicleType || '').trim() ||
        groqDetection?.vehicleType ||
        autoProfile.vehicle_type ||
        null,
      vehicleColor:
        String(vehicleColor || '').trim() ||
        groqDetection?.vehicleColor ||
        autoProfile.color ||
        null,
      vehicleBrand:
        String(vehicleBrand || '').trim() ||
        groqDetection?.vehicleBrand ||
        autoProfile.brand ||
        null,
      vehicleModel:
        String(vehicleModel || '').trim() ||
        groqDetection?.vehicleModel ||
        autoProfile.model ||
        null,
      plateNumber: autoDetails.plateNumber,
      driverName: autoDetails.driverName,
      driverPhone: autoDetails.driverPhone,
      ownerName: autoDetails.ownerName,
      operatorName: autoDetails.operatorName,
      registrationZone: autoDetails.registrationZone,
      fuelType: autoDetails.fuelType,
      seatingCapacity: autoDetails.seatingCapacity,
      vehicleCondition: autoDetails.vehicleCondition,
      identificationMark: autoDetails.identificationMark,
      vehicleDetails: autoDetails,
      detectionSource: groqDetection ? 'groq_vision' : 'local_profile_fallback',
      note: String(note || '').trim() || null,
      imagePath: `uploads/vehicle-observations/${fileName}`,
      imageMimeType: parsedImage.mimeType,
      latitude: sanitizeNumber(latitude),
      longitude: sanitizeNumber(longitude),
      profileSource: groqDetection ? 'groq_vision_with_profile_fallback' : 'json_auto_fill',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await getObservationCollection(req.user.uid).add(payload);

    const savedDoc = await docRef.get();

    logger.info('Vehicle observation saved', {
      uid: req.user.uid,
      observationId: docRef.id,
      noPlate: payload.noPlate,
    });

    return res.status(201).json({
      success: true,
      data: toClientRecord(savedDoc),
    });
  } catch (error) {
    logger.error('Vehicle observation save failed', {
      uid: req.user.uid,
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to save vehicle observation.',
    });
  }
});

module.exports = router;
