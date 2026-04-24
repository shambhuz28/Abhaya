import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

// ⚠️ Replace this IP with YOUR computer's local IP (run: hostname -I)
// This ensures physical devices on the same WiFi can reach the backend.
const LOCAL_IP = '10.14.3.122';

const extractHostFromScriptUrl = (scriptURL) => {
  if (!scriptURL || typeof scriptURL !== 'string') return null;
  // Examples:
  // - http://192.168.1.10:8081/index.bundle?...
  // - exp://192.168.1.10:19000
  const match = scriptURL.match(/^(?:https?|exp):\/\/([^:/]+)(?::\d+)?\//i);
  return match?.[1] || null;
};

const isPrivateHost = (host) => {
  if (!host) return false;
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;

  // IPv4 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  const parts = h.split('.').map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 127) return true;
  return false;
};

const getHostFromHttpUrl = (urlString) => {
  try {
    const url = new URL(urlString);
    return url.hostname || null;
  } catch {
    return null;
  }
};

const getBaseUrl = () => {
  const envUrl = String(
    process.env.EXPO_PUBLIC_API_URL ||
      process.env.EXPO_PUBLIC_BACKEND_API_URL ||
      process.env.BACKEND_API_URL ||
      ''
  ).trim();
  if (envUrl) {
    const base = envUrl.replace(/\/+$/, '');
    const host = getHostFromHttpUrl(base);
    // 0.0.0.0 is a server bind address, not a reachable client address.
    if (host === '0.0.0.0') {
      // eslint-disable-next-line no-console
      console.warn('[api] Ignoring EXPO_PUBLIC_BACKEND_API_URL=0.0.0.0 (unreachable). Use your PC LAN IP instead.');
    } else {
      return base.endsWith('/api') ? base : `${base}/api`;
    }
  }

  // Web browser can use localhost directly
  if (Platform.OS === 'web') {
    return 'http://localhost:5000/api';
  }
  // Mobile (physical device or emulator) — use LAN IP
  // In Expo/RN dev mode this contains the Metro URL, e.g. http://192.168.x.x:8081/...
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  const devHost = extractHostFromScriptUrl(scriptURL);
  if (devHost && isPrivateHost(devHost)) {
    return `http://${devHost}:5000/api`;
  }

  // Android emulator host loopback (fallback)
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5000/api';
  }

  return `http://${LOCAL_IP}:5000/api`;
};

const BASE_URL = getBaseUrl();

if (__DEV__) {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  // eslint-disable-next-line no-console
  console.log('[api] BASE_URL =', BASE_URL);
  // eslint-disable-next-line no-console
  console.log('[api] scriptURL =', scriptURL);
}

// Storage keys
const TOKEN_KEY = '@safeguard_token';
const REFRESH_KEY = '@safeguard_refresh';
const USER_KEY = '@safeguard_user';

/**
 * Make an API request with optional auth token.
 */
const apiRequest = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Attach auth token if available
  if (options.authenticated !== false) {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json();

    // If token expired, try to refresh
    if (response.status === 401 && data.error?.includes('expired')) {
      const refreshed = await refreshToken();
      if (refreshed) {
        // Retry the original request with new token
        const newToken = await AsyncStorage.getItem(TOKEN_KEY);
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(url, {
          ...options,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        return await retryResponse.json();
      }
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error.message);
    return {
      success: false,
      error: `Network error. Cannot reach backend at ${BASE_URL}. If you are using Expo Tunnel, set EXPO_PUBLIC_BACKEND_API_URL in .env to http://<your-pc-ip>:5000 and restart with \"expo start -c\".`,
    };
  }
};

/**
 * Store auth data after login/signup.
 */
const storeAuthData = async (data) => {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, data.idToken],
    [REFRESH_KEY, data.refreshToken],
    [USER_KEY, JSON.stringify({
      uid: data.uid,
      email: data.email,
      displayName: data.displayName,
    })],
  ]);
};

/**
 * Clear all auth data on logout.
 */
const clearAuthData = async () => {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
};

/**
 * Get the stored user data.
 */
const getStoredUser = async () => {
  try {
    const userJson = await AsyncStorage.getItem(USER_KEY);
    return userJson ? JSON.parse(userJson) : null;
  } catch {
    return null;
  }
};

/**
 * Refresh the ID token.
 */
const refreshToken = async () => {
  try {
    const storedRefresh = await AsyncStorage.getItem(REFRESH_KEY);
    if (!storedRefresh) return false;

    const result = await apiRequest('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: storedRefresh },
      authenticated: false,
    });

    if (result.success) {
      await AsyncStorage.setItem(TOKEN_KEY, result.data.idToken);
      await AsyncStorage.setItem(REFRESH_KEY, result.data.refreshToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

// ─── Auth API Methods ────────────────────────────────────────

const authAPI = {
  /**
   * Sign up with email, password, and name.
   */
  signup: async (email, password, displayName) => {
    const result = await apiRequest('/auth/signup', {
      method: 'POST',
      body: { email, password, displayName },
      authenticated: false,
    });

    if (result.success) {
      await storeAuthData(result.data);
    }
    return result;
  },

  /**
   * Sign in with email and password.
   */
  login: async (email, password) => {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
      authenticated: false,
    });

    if (result.success) {
      await storeAuthData(result.data);
    }
    return result;
  },

  /**
   * Sign out and clear stored data.
   */
  logout: async () => {
    await clearAuthData();
    return { success: true };
  },

  /**
   * Get the current user's profile from the backend.
   */
  getProfile: async () => {
    return await apiRequest('/auth/profile', { method: 'GET' });
  },

  /**
   * Update user profile.
   */
  updateProfile: async (data) => {
    return await apiRequest('/auth/profile', {
      method: 'PUT',
      body: data,
    });
  },

  /**
   * Delete the user's account.
   */
  deleteAccount: async () => {
    const result = await apiRequest('/auth/account', { method: 'DELETE' });
    if (result.success) await clearAuthData();
    return result;
  },

  /**
   * Check if user is logged in (has stored token).
   */
  getStoredUser,

  /**
   * Check if token is still valid.
   */
  validateSession: async () => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return { valid: false };

    const result = await apiRequest('/auth/profile', { method: 'GET' });
    if (result.success) {
      return { valid: true, user: result.data };
    }

    // Try refresh
    const refreshed = await refreshToken();
    if (refreshed) {
      const retryResult = await apiRequest('/auth/profile', { method: 'GET' });
      if (retryResult.success) {
        return { valid: true, user: retryResult.data };
      }
    }

    await clearAuthData();
    return { valid: false };
  },
};

export default authAPI;

// â”€â”€â”€ Incident / Evidence (mocked) â”€â”€â”€

const getCloudinaryUploadConfig = () => {
  const uploadUrl =
    process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_URL || process.env.CLOUDINARY_UPLOAD_URL;
  const uploadPreset =
    process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || process.env.CLOUDINARY_UPLOAD_PRESET;

  return {
    uploadUrl: uploadUrl ? String(uploadUrl).trim() : '',
    uploadPreset: uploadPreset ? String(uploadPreset).trim() : '',
  };
};

export const incidentAPI = {
  createMockIncident: async (payload = {}) => {
    return await apiRequest('/incidents/mock', {
      method: 'POST',
      body: payload,
    });
  },

  getLatestIncident: async () => {
    return await apiRequest('/incidents/latest', { method: 'GET' });
  },

  getIncident: async (incidentId) => {
    return await apiRequest(`/incidents/${incidentId}`, { method: 'GET' });
  },

  listVideos: async (incidentId) => {
    return await apiRequest(`/incidents/${incidentId}/videos`, { method: 'GET' });
  },

  addVideo: async (incidentId, { url, label }) => {
    return await apiRequest(`/incidents/${incidentId}/videos`, {
      method: 'POST',
      body: { url, label },
    });
  },

  uploadVideoToCloudinary: async (videoUri) => {
    const { uploadUrl, uploadPreset } = getCloudinaryUploadConfig();
    if (!uploadUrl) {
      return {
        success: false,
        error:
          'Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_UPLOAD_URL (and optionally EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET).',
      };
    }

    try {
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[cloudinary] uploadUrl =', uploadUrl);
        // eslint-disable-next-line no-console
        console.log('[cloudinary] uploadPreset =', uploadPreset || '(missing)');
      }

      const form = new FormData();
      form.append('file', {
        uri: videoUri,
        type: 'video/mp4',
        name: `evidence-${Date.now()}.mp4`,
      });
      if (uploadPreset) {
        form.append('upload_preset', uploadPreset);
      }

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: form,
        headers: {
          Accept: 'application/json',
        },
      });

      const data = await response.json();
      if (!response.ok) {
        const cloudMessage = data?.error?.message || 'Cloudinary upload failed.';
        if (String(cloudMessage).toLowerCase().includes('upload preset not found')) {
          return {
            success: false,
            error:
              'Cloudinary: Upload preset not found. Create an UNSIGNED upload preset in Cloudinary (Settings → Upload → Upload presets), then set EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in root .env. Also confirm EXPO_PUBLIC_CLOUDINARY_UPLOAD_URL has the correct cloud name.',
          };
        }
        return {
          success: false,
          error: cloudMessage,
        };
      }

      return {
        success: true,
        data: {
          url: data?.secure_url || data?.url || '',
          uploadedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'Cloudinary upload failed.',
      };
    }
  },
};
