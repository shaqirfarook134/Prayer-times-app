import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppStorage, PrayerTimes } from '../types';

const STORAGE_KEYS = {
  SELECTED_MASJID_ID: '@prayer_times:selected_masjid_id',
  NOTIFICATIONS_ENABLED: '@prayer_times:notifications_enabled',
  CACHED_PRAYER_TIMES: '@prayer_times:cached_prayer_times',
  DEVICE_TOKEN: '@prayer_times:device_token',
  LAST_SYNC: '@prayer_times:last_sync',
};

class StorageService {
  // Selected Masjid ID
  async getSelectedMasjidId(): Promise<number | null> {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEYS.SELECTED_MASJID_ID);
      return value ? parseInt(value, 10) : null;
    } catch (error) {
      console.error('Error getting selected masjid ID:', error);
      return null;
    }
  }

  async setSelectedMasjidId(masjidId: number): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SELECTED_MASJID_ID, masjidId.toString());
    } catch (error) {
      console.error('Error setting selected masjid ID:', error);
    }
  }

  // Notifications Enabled
  async getNotificationsEnabled(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
      return value === 'true';
    } catch (error) {
      console.error('Error getting notifications enabled:', error);
      return true; // Default to enabled
    }
  }

  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, enabled.toString());
    } catch (error) {
      console.error('Error setting notifications enabled:', error);
    }
  }

  // Cached Prayer Times
  async getCachedPrayerTimes(masjidId: number): Promise<PrayerTimes | null> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_PRAYER_TIMES);
      if (cached) {
        const allCached: Record<number, PrayerTimes> = JSON.parse(cached);
        return allCached[masjidId] || null;
      }
      return null;
    } catch (error) {
      console.error('Error getting cached prayer times:', error);
      return null;
    }
  }

  async setCachedPrayerTimes(masjidId: number, prayerTimes: PrayerTimes): Promise<void> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_PRAYER_TIMES);
      const allCached: Record<number, PrayerTimes> = cached ? JSON.parse(cached) : {};
      allCached[masjidId] = prayerTimes;
      await AsyncStorage.setItem(STORAGE_KEYS.CACHED_PRAYER_TIMES, JSON.stringify(allCached));

      // Update last sync time
      await this.setLastSync();
    } catch (error) {
      console.error('Error setting cached prayer times:', error);
    }
  }

  // Device Token
  async getDeviceToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_TOKEN);
    } catch (error) {
      console.error('Error getting device token:', error);
      return null;
    }
  }

  async setDeviceToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_TOKEN, token);
    } catch (error) {
      console.error('Error setting device token:', error);
    }
  }

  // Last Sync Time
  async getLastSync(): Promise<Date | null> {
    try {
      const value = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC);
      return value ? new Date(value) : null;
    } catch (error) {
      console.error('Error getting last sync:', error);
      return null;
    }
  }

  async setLastSync(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
    } catch (error) {
      console.error('Error setting last sync:', error);
    }
  }

  // Clear all data
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }
}

export default new StorageService();
