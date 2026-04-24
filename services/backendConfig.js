import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = '5000';

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const normalizeBaseUrl = (value) => {
  const trimmed = trimTrailingSlash(value.trim());
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const extractHost = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  return value
    .replace(/^[a-z]+:\/\//i, '')
    .split('/')[0]
    .split(':')[0];
};

const getExpoHost = () =>
  extractHost(Constants.expoConfig?.hostUri) ||
  extractHost(Constants.expoGoConfig?.debuggerHost) ||
  extractHost(Constants.platform?.hostUri) ||
  extractHost(Constants.manifest?.debuggerHost);

const getBaseUrl = () => {
  const configuredBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL || process.env.EXPO_PUBLIC_BACKEND_URL;

  if (configuredBaseUrl?.trim()) {
    return normalizeBaseUrl(configuredBaseUrl);
  }

  if (Platform.OS === 'web') {
    return `http://localhost:${API_PORT}/api`;
  }

  const expoHost = getExpoHost();
  if (expoHost) {
    return `http://${expoHost}:${API_PORT}/api`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}/api`;
  }

  return `http://localhost:${API_PORT}/api`;
};

export const BASE_URL = getBaseUrl();
export const HEALTH_URL = `${BASE_URL}/health`;

export const backendUnavailableMessage = `Cannot reach the backend at ${BASE_URL}. Start the backend with "cd Abhaya/backend && npm start", then open ${HEALTH_URL} from this device/browser. If it does not open, set EXPO_PUBLIC_API_BASE_URL to your computer LAN IP, for example http://192.168.1.10:5000/api, and restart Expo.`;
