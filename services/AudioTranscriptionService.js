import { Audio } from 'expo-av';
import { Alert } from 'react-native';

import { BASE_URL, backendUnavailableMessage } from './backendConfig';

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

const AUDIO_SEGMENT_MS = 7000;
const SCREAM_SUSTAINED_DB_THRESHOLD = -12;
const SCREAM_PEAK_DB_THRESHOLD = -6;
const SCREAM_SPIKE_DB_DELTA = 24;

const createInitialDebugState = () => ({
  isAnalyzing: false,
  latestMetering: null,
  averageMetering: null,
  lastTranscript: '',
  matchedKeywords: [],
  lastEvent: 'Audio analysis idle',
  lastPanicReason: null,
  updatedAt: null,
});

class AudioTranscriptionService {
  constructor() {
    this.recording = null;
    this.isAnalyzing = false;
    this.isStopping = false;
    this.isUploading = false;
    this.meteringData = [];
    this.onPanicDetected = null;
    this.segmentTimeout = null;
    this.statusListeners = [];
    this.debugListeners = [];
    this.debugState = createInitialDebugState();
    this.lastMeteringNotifyAt = 0;
  }

  addStatusListener(listener) {
    this.statusListeners.push(listener);
    listener(this.isAnalyzing);
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== listener);
    };
  }

  notifyStatusListeners() {
    this.statusListeners.forEach(l => l(this.isAnalyzing));
  }

  addDebugListener(listener) {
    this.debugListeners.push(listener);
    listener(this.getDebugState());
    return () => {
      this.debugListeners = this.debugListeners.filter(l => l !== listener);
    };
  }

  getDebugState() {
    return {
      ...this.debugState,
      isAnalyzing: this.isAnalyzing,
    };
  }

  notifyDebugListeners(partialState = {}) {
    this.debugState = {
      ...this.debugState,
      ...partialState,
      isAnalyzing: this.isAnalyzing,
      updatedAt: new Date().toLocaleTimeString(),
    };

    const nextState = this.getDebugState();
    this.debugListeners.forEach(l => l(nextState));
  }

  async startAnalysis(onPanicCallback) {
    if (this.isAnalyzing) return;

    this.onPanicDetected = onPanicCallback;

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Microphone Permission', 'Microphone permission is required for panic keyword detection.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      this.isAnalyzing = true;
      this.isStopping = false;
      this.meteringData = [];
      this.notifyDebugListeners({
        latestMetering: null,
        averageMetering: null,
        matchedKeywords: [],
        lastTranscript: '',
        lastEvent: 'Recording audio for backend transcription',
        lastPanicReason: null,
      });
      this.notifyStatusListeners();

      await this.startRecordingSegment();
    } catch (err) {
      console.error('Failed to start audio analysis', err);
      this.notifyDebugListeners({
        lastEvent: `Audio analysis failed: ${err.message || 'Unknown error'}`,
      });
    }
  }

  async startRecordingSegment() {
    if (!this.isAnalyzing || this.isStopping || this.recording) return;

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
      this.onRecordingStatusUpdate.bind(this),
      250
    );

    this.recording = recording;
    this.notifyDebugListeners({
      lastEvent: 'Recording 7-second audio clip; transcript updates after upload',
    });

    this.segmentTimeout = setTimeout(() => {
      this.finishSegmentAndUpload();
    }, AUDIO_SEGMENT_MS);
  }

  onRecordingStatusUpdate(status) {
    if (!status.isRecording || status.metering === undefined) return;

    const currentMetering = status.metering;
    this.meteringData.push(currentMetering);

    if (this.meteringData.length > 20) {
      this.meteringData.shift();
    }

    const avgMetering = this.meteringData.reduce((a, b) => a + b, 0) / this.meteringData.length;
    const now = Date.now();

    if (now - this.lastMeteringNotifyAt >= 1000) {
      this.lastMeteringNotifyAt = now;
      this.notifyDebugListeners({
        latestMetering: Math.round(currentMetering),
        averageMetering: Math.round(avgMetering),
        lastEvent: 'Recording audio; backend transcript updates after this clip',
      });
    }

    const previousSamples = this.meteringData.slice(0, -1);
    const previousAverage = previousSamples.length
      ? previousSamples.reduce((a, b) => a + b, 0) / previousSamples.length
      : currentMetering;
    const recentLoudSamples = this.meteringData.filter(
      (sample) => sample >= SCREAM_SUSTAINED_DB_THRESHOLD
    ).length;
    const isSustainedLoud = recentLoudSamples >= 4;
    const isSharpPeak =
      currentMetering >= SCREAM_PEAK_DB_THRESHOLD &&
      currentMetering - previousAverage >= SCREAM_SPIKE_DB_DELTA;

    if (this.meteringData.length >= 4 && (isSustainedLoud || isSharpPeak)) {
      this.triggerPanic('Scream detected from audio stream');
    }
  }

  async finishSegmentAndUpload() {
    if (!this.recording || this.isUploading) return;

    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }

    const recording = this.recording;
    this.recording = null;
    this.isUploading = true;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (uri && this.isAnalyzing && !this.isStopping) {
        await this.transcribeAudioSegment(uri);
      }
    } catch (err) {
      console.log('[AudioAnalysis] Segment processing failed:', err.message);
      this.notifyDebugListeners({
        lastEvent: `Audio segment failed: ${err.message || 'Unknown error'}`,
      });
    } finally {
      this.isUploading = false;

      if (this.isAnalyzing && !this.isStopping) {
        this.meteringData = [];
        this.startRecordingSegment();
      }
    }
  }

  async transcribeAudioSegment(uri) {
    const formData = new FormData();
    formData.append('audio', {
      uri,
      name: `panic-audio-${Date.now()}.m4a`,
      type: 'audio/m4a',
    });

    this.notifyDebugListeners({
      lastEvent: 'Sending recorded audio clip to backend for transcription',
    });

    let response;
    try {
      response = await fetch(`${BASE_URL}/audio/transcribe`, {
        method: 'POST',
        body: formData,
      });
    } catch (error) {
      const networkError = new Error(backendUnavailableMessage);
      networkError.cause = error;
      throw networkError;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || 'Audio transcription failed.');
    }

    const transcript = payload.data?.transcript || '';
    const matchedKeywords = Array.isArray(payload.data?.matchedKeywords)
      ? payload.data.matchedKeywords
      : this.findMatchedKeywords(transcript);

    this.notifyDebugListeners({
      lastTranscript: transcript,
      matchedKeywords,
      lastEvent: transcript
        ? 'Backend transcript received'
        : 'Backend did not detect speech in this segment',
    });

    console.log('[AudioAnalysis] Backend transcript:', transcript || '(empty)');
    console.log('[AudioAnalysis] Matched keywords:', matchedKeywords.length ? matchedKeywords.join(', ') : 'none');

    if (matchedKeywords.length > 0) {
      this.triggerPanic(`Panic keyword detected in audio: ${matchedKeywords.join(', ')}`);
    }
  }

  findMatchedKeywords(text) {
    const normalizedText = this.normalizeTranscript(text);
    if (!normalizedText) return [];

    const words = normalizedText.split(' ').filter(Boolean);

    return PANIC_KEYWORD_GROUPS
      .filter((group) =>
        group.terms.some((term) => {
          const normalizedTerm = this.normalizeTranscript(term);
          if (!normalizedTerm) return false;

          if (normalizedText.includes(normalizedTerm)) {
            return true;
          }

          const termWords = normalizedTerm.split(' ').filter(Boolean);
          const candidates = this.phraseWindows(words, termWords.length);
          return candidates.some((candidate) => this.isFuzzyMatch(candidate, normalizedTerm));
        })
      )
      .map((group) => group.label);
  }

  analyzeDetectedText(textDetected, source = 'manual_test') {
    const matchedKeywords = this.findMatchedKeywords(textDetected);

    this.notifyDebugListeners({
      lastTranscript: textDetected || '',
      matchedKeywords,
      lastEvent: textDetected
        ? `Transcript analyzed from ${source}`
        : `No transcript received from ${source}`,
    });

    if (textDetected) {
      console.log('[AudioAnalysis] Received transcript:', textDetected);
      console.log('[AudioAnalysis] Matched keywords:', matchedKeywords.length ? matchedKeywords.join(', ') : 'none');
    }

    if (matchedKeywords.length > 0) {
      this.triggerPanic(`Panic keyword detected in audio: ${matchedKeywords.join(', ')}`);
    }

    return matchedKeywords;
  }

  normalizeTranscript(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  levenshteinDistance(left, right) {
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
  }

  isFuzzyMatch(value, keyword) {
    if (!value || !keyword) return false;

    const maxDistance = keyword.length <= 4 ? 1 : 2;
    return this.levenshteinDistance(value, keyword) <= maxDistance;
  }

  phraseWindows(words, size) {
    if (size <= 1) return words;

    const windows = [];
    for (let index = 0; index <= words.length - size; index += 1) {
      windows.push(words.slice(index, index + size).join(' '));
    }
    return windows;
  }

  simulateTranscript(textDetected) {
    return this.analyzeDetectedText(textDetected, 'manual_test');
  }

  triggerPanic(reason) {
    if (!this.isAnalyzing) return;

    const onPanicDetected = this.onPanicDetected;
    console.log('SOS', reason);
    this.notifyDebugListeners({
      lastPanicReason: reason,
      lastEvent: `SOS triggered: ${reason}`,
    });

    this.stopAnalysis();

    if (onPanicDetected) {
      onPanicDetected(reason);
    }
  }

  async stopAnalysis() {
    if (!this.isAnalyzing && !this.recording) return;

    this.isStopping = true;
    this.isAnalyzing = false;

    if (this.segmentTimeout) {
      clearTimeout(this.segmentTimeout);
      this.segmentTimeout = null;
    }

    const recording = this.recording;
    this.recording = null;

    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
      } catch (err) {
        console.log('[AudioAnalysis] Recording stop skipped:', err.message);
      }
    }

    this.meteringData = [];
    this.onPanicDetected = null;
    this.notifyDebugListeners({
      latestMetering: null,
      averageMetering: null,
      lastEvent: this.debugState.lastPanicReason
        ? 'Audio analysis stopped after SOS'
        : 'Audio analysis stopped',
    });
    this.notifyStatusListeners();
  }
}

export default new AudioTranscriptionService();
