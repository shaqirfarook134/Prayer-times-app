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
const ADHAN_CHANNEL_ID = 'adhan-sound'; // Sound-only channel (no banner)

// Configure notification handler:
// - daily_refresh: fully silent (no banner, no sound)
// - adhan: sound only (no banner, not stored in tray)
// - prayer reminders: banner + sound
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isDailyRefresh = notification.request.content.data?.type === 'daily_refresh';
    const isAdhan = notification.request.content.data?.type === 'adhan';
    return {
      shouldShowAlert: !isDailyRefresh && !isAdhan,
      shouldShowBanner: !isDailyRefresh && !isAdhan,
      shouldShowList: !isDailyRefresh && !isAdhan,
      shouldPlaySound: !isDailyRefresh,
      shouldSetBadge: false,
    };
  },
});

class NotificationService {
  private channelsCreated = false;
  private lastScheduledTimestamp: number = 0;
  private isScheduling = false;

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

      // Channel for adhan-time sound (no banner, no tray entry — sound only)
      await Notifications.setNotificationChannelAsync(ADHAN_CHANNEL_ID, {
        name: 'Adhan Sound',
        description: 'Prayer time sound only — no banner',
        importance: Notifications.AndroidImportance.MIN,
        sound: 'default',
        showBadge: false,
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
    // Mutex: prevent concurrent scheduling passes from racing each other
    if (this.isScheduling) {
      console.log('⏭️ Skipping — scheduling already in progress');
      return true;
    }

    this.isScheduling = true;
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
    } finally {
      this.isScheduling = false;
    }
  }

  // Helper method for Expo-notifications scheduling (used by iOS and Android fallback)
  private async scheduleExpoNotifications(prayerTimes: PrayerTimes, masjidName: string = 'Masjid'): Promise<void> {
    // Cancel ALL scheduled notifications to start clean (daily_refresh will be re-added below)
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduled) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
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

    let fajrScheduledForTomorrow = false;

    for (const prayer of prayers) {
      // Parse prayer time (HH:MM format) - use adhan time
      const [hours, minutes] = prayer.time.adhan.split(':').map(Number);
      const prayerDate = new Date(today);
      prayerDate.setHours(hours, minutes, 0, 0);

      // Calculate notification time (10 minutes before)
      const notificationDate = new Date(prayerDate.getTime() - 10 * 60 * 1000);

      // If notification time has already passed today, roll forward to tomorrow.
      // This fixes Fajr being missed when the app schedules late at night — Fajr
      // is an early-morning prayer so its time has already passed for "today".
      if (notificationDate <= now) {
        prayerDate.setDate(prayerDate.getDate() + 1);
        notificationDate.setDate(notificationDate.getDate() + 1);
        if (prayer.name === 'Fajr') fajrScheduledForTomorrow = true;
      }

      // 10-minutes-before reminder
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

      console.log(`✅ Scheduled 10-min reminder for ${prayer.name} at ${notificationDate.toLocaleTimeString()}`);

      // Adhan-time notification — sound only, no banner (iOS: handler suppresses visuals;
      // Android: ADHAN_CHANNEL_ID uses MIN importance so no heads-up banner)
      if (prayerDate > now) {
        const adhanContent: Notifications.NotificationContentInput = {
          title: `${prayer.name}`,
          body: '',
          sound: 'default',
          data: { prayer: prayer.name, type: 'adhan' },
        };
        if (Platform.OS === 'android') {
          (adhanContent as any).channelId = ADHAN_CHANNEL_ID;
        }
        await Notifications.scheduleNotificationAsync({
          content: adhanContent,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: prayerDate,
            channelId: Platform.OS === 'android' ? ADHAN_CHANNEL_ID : undefined,
          },
        });
        console.log(`✅ Scheduled Adhan sound for ${prayer.name} at ${prayerDate.toLocaleTimeString()}`);
      }
    }

    // Schedule Fajr for the next 7 days as a Doze-mode resilience measure.
    // Android Doze can suppress the 12:30 AM reschedule trigger overnight, so
    // pre-scheduling a week of Fajr alarms ensures delivery even if the daily
    // refresh fails for several consecutive nights.
    // Start at day 2 if Fajr was already rolled to tomorrow in the main loop above,
    // to avoid a duplicate Fajr notification for the same slot.
    const [fajrHours, fajrMinutes] = prayerTimes.fajr.adhan.split(':').map(Number);
    const fajrLoopStart = fajrScheduledForTomorrow ? 2 : 1;
    for (let day = fajrLoopStart; day <= 7; day++) {
      const futureAdhan = new Date(today);
      futureAdhan.setDate(futureAdhan.getDate() + day);
      futureAdhan.setHours(fajrHours, fajrMinutes, 0, 0);
      const futureNotif = new Date(futureAdhan.getTime() - 10 * 60 * 1000); // 10 min before

      if (futureNotif > now) {
        // 10-min-before reminder
        const reminderContent: Notifications.NotificationContentInput = {
          title: `Fajr in 10 minutes (${prayerTimes.fajr.adhan12})`,
          body: `${masjidName} • Iqama at ${prayerTimes.fajr.iqama12}`,
          sound: 'default',
          data: { prayer: 'Fajr', type: 'prayer' },
          priority: Platform.OS === 'android' ? Notifications.AndroidNotificationPriority.HIGH : undefined,
        };
        if (Platform.OS === 'android') {
          (reminderContent as any).channelId = PRAYER_CHANNEL_ID;
        }
        await Notifications.scheduleNotificationAsync({
          content: reminderContent,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: futureNotif,
            channelId: Platform.OS === 'android' ? PRAYER_CHANNEL_ID : undefined,
          },
        });

        // Adhan-time sound — no banner (same as main loop)
        const adhanContent: Notifications.NotificationContentInput = {
          title: 'Fajr',
          body: '',
          sound: 'default',
          data: { prayer: 'Fajr', type: 'adhan' },
        };
        if (Platform.OS === 'android') {
          (adhanContent as any).channelId = ADHAN_CHANNEL_ID;
        }
        await Notifications.scheduleNotificationAsync({
          content: adhanContent,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: futureAdhan,
            channelId: Platform.OS === 'android' ? ADHAN_CHANNEL_ID : undefined,
          },
        });
      }
    }
    console.log(`✅ Scheduled Fajr for next 7 days (Doze resilience)`);

    // Always re-schedule exactly one daily_refresh trigger.
    // scheduleDailyTriggerNotification() is idempotent — it checks for an existing entry first.
    await backgroundTaskService.scheduleDailyTriggerNotification();
    console.log('✅ Ensured 12:30 AM daily trigger notification exists');
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
