import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { PrayerTimes } from '../types';
import apiService from './api';
import storageService from './storage';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  // Request notification permissions
  async requestPermissions(): Promise<boolean> {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return false;
    }

    return true;
  }

  // Get push notification token
  async getExpoPushToken(): Promise<string | null> {
    try {
      // Check if running on physical device
      if (!Constants.isDevice) {
        console.log('Must use physical device for push notifications');
        return null;
      }

      // Request permissions first
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      return tokenData.data;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  // Register device with backend
  async registerDevice(masjidId?: number): Promise<void> {
    try {
      const token = await this.getExpoPushToken();
      if (!token) {
        console.log('No push token available');
        return;
      }

      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const notificationsEnabled = await storageService.getNotificationsEnabled();

      await apiService.registerDevice({
        token,
        platform,
        masjid_id: masjidId,
        notifications_enabled: notificationsEnabled,
      });

      // Save token locally
      await storageService.setDeviceToken(token);

      console.log('Device registered successfully');
    } catch (error) {
      console.error('Error registering device:', error);
    }
  }

  // Schedule local notifications for prayer times
  async schedulePrayerNotifications(prayerTimes: PrayerTimes, masjidName: string): Promise<void> {
    try {
      // Cancel all existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();

      const prayers = [
        { name: 'Fajr', time: prayerTimes.fajr },
        { name: 'Dhuhr', time: prayerTimes.dhuhr },
        { name: 'Asr', time: prayerTimes.asr },
        { name: 'Maghrib', time: prayerTimes.maghrib },
        { name: 'Isha', time: prayerTimes.isha },
      ];

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      for (const prayer of prayers) {
        // Parse prayer time (HH:MM format) - use adhan time
        const [hours, minutes] = prayer.time.adhan.split(':').map(Number);
        const prayerDate = new Date(today);
        prayerDate.setHours(hours, minutes, 0, 0);

        // Calculate notification time (10 minutes before)
        const notificationDate = new Date(prayerDate.getTime() - 10 * 60 * 1000);

        // Only schedule if notification time is in the future
        if (notificationDate > now) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `${prayer.name} Prayer`,
              body: `${prayer.name} in 10 minutes at ${masjidName}`,
              sound: 'default',
              data: {
                prayer: prayer.name,
                adhanTime: prayer.time.adhan12,
                iqamaTime: prayer.time.iqama12,
              },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: notificationDate,
            },
          });

          console.log(`Scheduled notification for ${prayer.name} at ${notificationDate.toLocaleTimeString()}`);
        }
      }
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  }

  // Update device preferences
  async updatePreferences(masjidId?: number, notificationsEnabled?: boolean): Promise<void> {
    try {
      const token = await storageService.getDeviceToken();
      if (!token) {
        console.log('No device token found');
        return;
      }

      await apiService.updateDevicePreferences(token, {
        masjid_id: masjidId,
        notifications_enabled: notificationsEnabled,
      });

      if (notificationsEnabled !== undefined) {
        await storageService.setNotificationsEnabled(notificationsEnabled);
      }

      console.log('Device preferences updated');
    } catch (error) {
      console.error('Error updating device preferences:', error);
    }
  }

  // Cancel all notifications
  async cancelAll(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('All notifications cancelled');
    } catch (error) {
      console.error('Error cancelling notifications:', error);
    }
  }

  // Add notification received listener
  addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void) {
    return Notifications.addNotificationReceivedListener(callback);
  }

  // Add notification response listener (when user taps notification)
  addNotificationResponseReceivedListener(
    callback: (response: Notifications.NotificationResponse) => void
  ) {
    return Notifications.addNotificationResponseReceivedListener(callback);
  }
}

export default new NotificationService();
