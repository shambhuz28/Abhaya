const express = require('express');
const multer = require('multer');
const Groq = require('groq-sdk');
const { toFile } = require('groq-sdk');

const logger = require('../utils/logger');

const router = express.Router();

const PANIC_KEYWORD_GROUPS = [
  {
    label: 'help',
    terms: ['help', 'help me', 'hekp', 'emergency', 'save me'],
  },
  {
    label: 'vachva',
    terms: [
      'vachva',
      'vaachva',
      'vachava',
      'vachawa',
      'wachva',
      'wachwa',
      'watchva',
      'watch wa',
      'watch me',
      'vachao',
      'मला वाचवा',
      'वाचवा',
    ],
  },
  {
    label: 'madat',
    terms: ['madat', 'madad', 'madat kara', 'mala madat kara', 'मदत', 'मदत करा', 'मला मदत करा'],
  },
  {
    label: 'soda',
    terms: [
      'soda',
      'sodha',
      'sod',
      'sodu naka',
      'mala soda',
      'chhoda',
      'chhodo',
      'chhod do',
      'chod do',
      'chodo',
      'सोडा',
      'मला सोडा',
      'छोड़ो',
      'छोडो',
    ],
  },
  {
    label: 'bachao',
    terms: ['bachao', 'bachav', 'bachao bachao', 'बचाओ', 'मुझे बचाओ'],
  },
];

const PANIC_KEYWORDS = PANIC_KEYWORD_GROUPS.flatMap((group) => group.terms);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
});

const normalizeTranscript = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const levenshteinDistance = (left, right) => {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
};

const isFuzzyMatch = (value, keyword) => {
  if (!value || !keyword) return false;

  const maxDistance = keyword.length <= 4 ? 1 : 2;
  return levenshteinDistance(value, keyword) <= maxDistance;
};

const phraseWindows = (words, size) => {
  if (size <= 1) return words;

  const windows = [];
  for (let index = 0; index <= words.length - size; index += 1) {
    windows.push(words.slice(index, index + size).join(' '));
  }
  return windows;
};

const findMatchedKeywords = (text) => {
  const normalizedText = normalizeTranscript(text);
  if (!normalizedText) return [];

  const words = normalizedText.split(' ').filter(Boolean);

  return PANIC_KEYWORD_GROUPS
    .filter((group) =>
      group.terms.some((term) => {
        const normalizedTerm = normalizeTranscript(term);
        if (!normalizedTerm) return false;

        if (normalizedText.includes(normalizedTerm)) {
          return true;
        }

        const termWords = normalizedTerm.split(' ').filter(Boolean);
        const candidates = phraseWindows(words, termWords.length);
        return candidates.some((candidate) => isFuzzyMatch(candidate, normalizedTerm));
      })
    )
    .map((group) => group.label);
};

const TRANSCRIPTION_PROMPT = [
  'This is emergency monitoring audio from India.',
  'Listen carefully for short panic words and transliterations.',
  `Possible panic words: ${PANIC_KEYWORDS.join(', ')}.`,
  'Transcribe the speech exactly, even if it is only one or two words.',
].join(' ');

const transcribeAudio = async ({ groq, audioFile, model, language }) =>
  groq.audio.transcriptions.create({
    file: audioFile,
    model,
    prompt: TRANSCRIPTION_PROMPT,
    response_format: 'json',
    temperature: 0,
    ...(language ? { language } : {}),
  });

const getGroqClient = () => {
  if (!process.env.GROQ_API_KEY) {
    return null;
  }

  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
};

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Audio file is required.',
    });
  }

  const groq = getGroqClient();
  if (!groq) {
    return res.status(503).json({
      success: false,
      error: 'GROQ_API_KEY is missing in backend/.env.',
    });
  }

  try {
    const model = process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo';
    logger.info('Audio transcription requested', {
      fileSize: req.file.size,
      mimetype: req.file.mimetype,
      originalname: req.file.originalname,
      model,
    });

    const audioFile = await toFile(
      req.file.buffer,
      req.file.originalname || 'panic-audio.m4a',
      {
        type: req.file.mimetype || 'audio/m4a',
      }
    );

    let transcription = await transcribeAudio({
      groq,
      audioFile,
      model,
    });

    let transcript = transcription.text || '';
    let matchedKeywords = findMatchedKeywords(transcript);
    let languageRetry = null;

    if (!matchedKeywords.length) {
      const retryLanguages = ['mr', 'hi'];

      for (const language of retryLanguages) {
        const retryTranscription = await transcribeAudio({
          groq,
          audioFile,
          model,
          language,
        });
        const retryTranscript = retryTranscription.text || '';
        const retryMatches = findMatchedKeywords(retryTranscript);

        if (retryMatches.length > 0 || (!transcript && retryTranscript)) {
          transcription = retryTranscription;
          transcript = retryTranscript;
          matchedKeywords = retryMatches;
          languageRetry = language;
        }

        if (matchedKeywords.length > 0) {
          break;
        }
      }
    }

    logger.info('Audio transcription completed', {
      transcriptLength: transcript.length,
      matchedKeywords,
      model,
      provider: 'groq',
      languageRetry,
    });

    return res.json({
      success: true,
      data: {
        transcript,
        matchedKeywords,
        languageRetry,
      },
    });
  } catch (error) {
    logger.error('Audio transcription failed', {
      error: error?.message || String(error),
    });

    return res.status(500).json({
      success: false,
      error: error.message || 'Audio transcription failed.',
    });
  }
});

module.exports = router;
