import { Platform, Linking, Alert } from 'react-native';
import { NativeModules } from 'react-native';

const { NotificationSchedulerModule } = NativeModules;

export interface AlarmPermissionStatus {
  canScheduleExactAlarms: boolean;
  permissionGranted: boolean;
}

/**
 * Check if app can schedule exact alarms (Android 12+)
 */
export async function checkAlarmPermission(): Promise<AlarmPermissionStatus> {
  if (Platform.OS !== 'android') {
    return { canScheduleExactAlarms: true, permissionGranted: true };
  }

  try {
    // Call native module to check permission
    const canSchedule = await NotificationSchedulerModule.canScheduleExactAlarms();
    return {
      canScheduleExactAlarms: canSchedule,
      permissionGranted: canSchedule,
    };
  } catch (error) {
    console.error('Error checking alarm permission:', error);
    // Assume granted on older Android versions
    return { canScheduleExactAlarms: true, permissionGranted: true };
  }
}

/**
 * Request alarm permission by opening Settings
 * Shows a dialog explaining why, then opens Settings
 */
export async function requestAlarmPermission(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  return new Promise((resolve) => {
    Alert.alert(
      'Enable Prayer Notifications',
      'To receive prayer time notifications at the exact time, please enable "Alarms & reminders" in the next screen.\n\n' +
        'This ensures you never miss a prayer time.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(),
        },
        {
          text: 'Open Settings',
          onPress: async () => {
            try {
              // Open the exact alarm settings page
              await Linking.openSettings();
              resolve();
            } catch (error) {
              console.error('Error opening settings:', error);
              resolve();
            }
          },
        },
      ]
    );
  });
}

/**
 * Check and request permission if needed
 * Returns true if permission is granted, false otherwise
 */
export async function ensureAlarmPermission(): Promise<boolean> {
  const status = await checkAlarmPermission();

  if (!status.canScheduleExactAlarms) {
    await requestAlarmPermission();
    // Check again after user returns from settings
    const newStatus = await checkAlarmPermission();
    return newStatus.canScheduleExactAlarms;
  }

  return true;
}
