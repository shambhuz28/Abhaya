import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL, backendUnavailableMessage } from './backendConfig';

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
      headers.Authorization = `Bearer ${token}`;
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
        headers.Authorization = `Bearer ${newToken}`;
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
    console.error(`API Error [${endpoint}] (${url}):`, error.message);
    return {
      success: false,
      error: backendUnavailableMessage,
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
    [
      USER_KEY,
      JSON.stringify({
        uid: data.uid,
        email: data.email,
        displayName: data.displayName,
      }),
    ],
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
