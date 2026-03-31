import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import apiService from './api';
import storageService from './storage';
import notificationService from './notifications';

const DAILY_PRAYER_REFRESH_TASK = 'DAILY_PRAYER_REFRESH_TASK';

// Define the background task
TaskManager.defineTask(DAILY_PRAYER_REFRESH_TASK, async () => {
  try {
    console.log('🌙 Background task running at', new Date().toLocaleString());

    // Get user's selected masjid
    const masjidId = await storageService.getSelectedMasjidId();
    if (!masjidId) {
      console.log('No masjid selected, skipping background refresh');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Check if notifications are enabled
    const notificationsEnabled = await storageService.getNotificationsEnabled();
    if (!notificationsEnabled) {
      console.log('Notifications disabled, skipping background refresh');
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // Fetch fresh prayer times from API
    const [prayerTimes, masjid] = await Promise.all([
      apiService.getPrayerTimes(masjidId),
      apiService.getMasjidById(masjidId),
    ]);

    // Cache the data
    await storageService.setCachedPrayerTimes(masjidId, prayerTimes);

    // Reschedule all notifications for today
    await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);

    console.log('✅ Background task completed: Prayer times updated and notifications rescheduled');
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('❌ Background task failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

class BackgroundTaskService {
  // Register the daily background task
  async registerDailyPrayerRefresh(): Promise<void> {
    try {
      // Check if task is already registered
      const isRegistered = await TaskManager.isTaskRegisteredAsync(DAILY_PRAYER_REFRESH_TASK);

      if (isRegistered) {
        console.log('Daily prayer refresh task already registered');
        return;
      }

      // Register the background fetch task
      await BackgroundFetch.registerTaskAsync(DAILY_PRAYER_REFRESH_TASK, {
        minimumInterval: 24 * 60 * 60, // 24 hours (daily)
        stopOnTerminate: false, // Continue even if app is terminated
        startOnBoot: true, // Start on device boot
      });

      console.log('✅ Daily prayer refresh task registered successfully');

      // Also schedule a daily notification at 12:30 AM to trigger the task
      await this.scheduleDailyTriggerNotification();
    } catch (error) {
      console.error('Failed to register background task:', error);
    }
  }

  // Schedule a daily notification at 12:30 AM to ensure task runs
  async scheduleDailyTriggerNotification(): Promise<void> {
    try {
      // Calculate next 12:30 AM
      const now = new Date();
      const next1230AM = new Date(now);
      next1230AM.setHours(0, 30, 0, 0);

      // If 12:30 AM already passed today, schedule for tomorrow
      if (next1230AM <= now) {
        next1230AM.setDate(next1230AM.getDate() + 1);
      }

      // Schedule daily repeating notification at 12:30 AM
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Prayer Times Updated',
          body: 'Fetching latest prayer times for today...',
          sound: null, // Silent notification
          data: { type: 'daily_refresh' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 0,
          minute: 30,
          repeats: true,
        },
      });

      console.log('✅ Daily 12:30 AM trigger notification scheduled');
    } catch (error) {
      console.error('Failed to schedule daily trigger notification:', error);
    }
  }

  // Unregister the background task
  async unregisterDailyPrayerRefresh(): Promise<void> {
    try {
      await BackgroundFetch.unregisterTaskAsync(DAILY_PRAYER_REFRESH_TASK);
      console.log('Daily prayer refresh task unregistered');
    } catch (error) {
      console.error('Failed to unregister background task:', error);
    }
  }

  // Check task status
  async getTaskStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
    try {
      return await BackgroundFetch.getStatusAsync();
    } catch (error) {
      console.error('Failed to get task status:', error);
      return null;
    }
  }
}

export default new BackgroundTaskService();
