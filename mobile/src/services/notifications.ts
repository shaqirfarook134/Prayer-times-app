import * as Notifications from 'expo-notifications';
import { Platform, NativeModules } from 'react-native';
import Constants from 'expo-constants';
import { PrayerTimes } from '../types';
import apiService from './api';
import storageService from './storage';
import backgroundTaskService from './backgroundTasks';

// Native module for Android notifications (works after device reboot)
const { NotificationSchedulerModule } = NativeModules;

// Notification channel IDs
const PRAYER_CHANNEL_ID = 'prayer-notifications';
const DAILY_REFRESH_CHANNEL_ID = 'daily-refresh';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  private channelsCreated = false;
  private lastScheduledTimestamp: number = 0;

  // Create Android notification channels (required for Android 8+)
  private async createNotificationChannels(): Promise<void> {
    if (Platform.OS !== 'android' || this.channelsCreated) {
      return;
    }

    try {
      // Channel for prayer notifications
      await Notifications.setNotificationChannelAsync(PRAYER_CHANNEL_ID, {
        name: 'Prayer Notifications',
        description: 'Notifications for upcoming prayer times',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#007AFF',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true, // Allow notifications even in Do Not Disturb
      });

      // Channel for daily refresh notifications (silent)
      await Notifications.setNotificationChannelAsync(DAILY_REFRESH_CHANNEL_ID, {
        name: 'Daily Prayer Times Refresh',
        description: 'Background updates for prayer times',
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        vibrationPattern: [0],
        showBadge: false,
      });

      this.channelsCreated = true;
      console.log('✅ Notification channels created successfully');
    } catch (error) {
      console.error('Failed to create notification channels:', error);
    }
  }

  // Request notification permissions
  async requestPermissions(): Promise<boolean> {
    // Create channels before requesting permissions
    await this.createNotificationChannels();

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

    // Request exact alarm permission on Android 12+
    if (Platform.OS === 'android') {
      await this.requestExactAlarmPermission();
    }

    return true;
  }

  // Exact alarm permission is declared in app.config.js:
  // USE_EXACT_ALARM (Android 13+) — auto-granted, no user action needed
  // SCHEDULE_EXACT_ALARM (Android 12) — fallback
  private async requestExactAlarmPermission(): Promise<void> {
    // No runtime prompt needed — handled via manifest permissions
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
  async schedulePrayerNotifications(prayerTimes: PrayerTimes, masjidName: string): Promise<boolean> {
    try {
      // Check permissions first
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        console.error('❌ Notification permissions not granted. Status:', status);
        return false;
      }

      // Prevent redundant scheduling - skip if we scheduled within last 30 seconds
      const now = Date.now();
      const timeSinceLastSchedule = now - this.lastScheduledTimestamp;

      if (timeSinceLastSchedule < 30000 && this.lastScheduledTimestamp > 0) {
        console.log(`⏭️ Skipping redundant notification scheduling (last scheduled ${Math.round(timeSinceLastSchedule / 1000)}s ago)`);
        return true; // Not an error, just skipped
      }

      // Ensure channels are created first (Android)
      await this.createNotificationChannels();

      // Use Expo-notifications for both Android and iOS
      await this.scheduleExpoNotifications(prayerTimes, masjidName);

      // Update timestamp after successful scheduling
      this.lastScheduledTimestamp = Date.now();

      console.log(`✅ All prayer notifications scheduled successfully`);
      return true;
    } catch (error) {
      console.error('❌ Error scheduling notifications:', error);
      return false;
    }
  }

  // Helper method for Expo-notifications scheduling (used by iOS and Android fallback)
  private async scheduleExpoNotifications(prayerTimes: PrayerTimes, masjidName: string = 'Masjid'): Promise<void> {
    // Cancel only prayer notifications — preserve the daily_refresh trigger
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      if (notification.content.data?.type !== 'daily_refresh') {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }

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
        const notificationContent: Notifications.NotificationContentInput = {
          title: `${prayer.name} in 10 minutes (${prayer.time.adhan12})`,
          body: `${masjidName} • Iqama at ${prayer.time.iqama12}`,
          sound: 'default',
          data: {
            prayer: prayer.name,
            adhanTime: prayer.time.adhan12,
            iqamaTime: prayer.time.iqama12,
          },
          priority: Platform.OS === 'android' ? Notifications.AndroidNotificationPriority.HIGH : undefined,
        };

        // Add Android-specific channel
        if (Platform.OS === 'android') {
          (notificationContent as any).channelId = PRAYER_CHANNEL_ID;
        }

        await Notifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notificationDate,
            channelId: Platform.OS === 'android' ? PRAYER_CHANNEL_ID : undefined,
          },
        });

        console.log(`✅ Scheduled notification for ${prayer.name} at ${notificationDate.toLocaleTimeString()}`);
      }
    }

    // Always ensure the 12:30 AM daily trigger exists — it may have been wiped by a previous
    // cancelAllScheduledNotificationsAsync call or never re-scheduled after first install.
    const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
    const hasDailyTrigger = allScheduled.some(n => n.content.data?.type === 'daily_refresh');
    if (!hasDailyTrigger) {
      await backgroundTaskService.scheduleDailyTriggerNotification();
      console.log('✅ Re-scheduled missing 12:30 AM daily trigger notification');
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
