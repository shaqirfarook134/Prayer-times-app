const IS_DEV = process.env.APP_ENV === 'development';

// Config plugin to explicitly remove foreground service permissions AND the
// expo-location LocationTaskService from the merged manifest.
//
// Root cause of Google Play rejection: expo-location's AAR manifest injects:
//   <service android:name="expo.modules.location.services.LocationTaskService"
//            android:foregroundServiceType="location"/>
// A service with foregroundServiceType triggers Play Store policy review even
// without an explicit <uses-permission FOREGROUND_SERVICE> entry.
//
// The app uses expo-background-fetch (JobScheduler) for background work and
// expo-location only for one-time foreground permission + getCurrentPositionAsync().
// No background or task-based location is used.
const withRemoveForegroundService = (config) => {
  const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;

    // Ensure xmlns:tools is declared on the manifest root — required for
    // tools:node="remove" directives to take effect during Gradle manifest merge.
    AndroidConfig.Manifest.ensureToolsAvailable(manifest);

    // Remove <uses-permission> entries for all foreground service variants.
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const permsToRemove = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      // expo-sensors injects this for Pedometer/DeviceMotion — app only uses
      // magnetometer for Qibla compass, no activity recognition needed.
      'android.permission.ACTIVITY_RECOGNITION',
    ];
    permsToRemove.forEach((perm) => {
      const existing = manifest.manifest['uses-permission'].find(
        (p) => p.$?.['android:name'] === perm
      );
      if (existing) {
        // If expo-location's plugin already added it, override with remove directive.
        existing.$['tools:node'] = 'remove';
      } else {
        manifest.manifest['uses-permission'].push({
          $: { 'android:name': perm, 'tools:node': 'remove' },
        });
      }
    });

    // Remove the expo-location LocationTaskService <service> element.
    // This is the actual trigger for all 3 Google Play foreground service violations.
    const mainApplication = manifest.manifest.application?.[0];
    if (mainApplication) {
      if (!mainApplication.service) mainApplication.service = [];
      const svcName = 'expo.modules.location.services.LocationTaskService';
      const existing = mainApplication.service.find(
        (s) => s.$?.['android:name'] === svcName
      );
      if (existing) {
        existing.$['tools:node'] = 'remove';
      } else {
        mainApplication.service.push({
          $: { 'android:name': svcName, 'tools:node': 'remove' },
        });
      }
    }

    return config;
  });
};

module.exports = {
  expo: {
    name: IS_DEV ? 'My Masjid Dev' : 'My Masjid App',
    slug: 'mymasjid',
    version: '1.9.6',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV
        ? 'com.shaqirfarook.mymasjid.dev'
        : 'com.shaqirfarook.mymasjid',
      config: {
        usesNonExemptEncryption: false
      },
      infoPlist: {
        UIBackgroundModes: ['remote-notification'],
        NSLocationWhenInUseUsageDescription: 'We need your location to find nearby masjids and help you determine the Qibla direction for prayer.'
      }
    },
    android: {
      versionCode: 6,
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png'
      },
      predictiveBackGestureEnabled: false,
      package: IS_DEV
        ? 'com.shaqirfarook.mymasjid.dev'
        : 'com.shaqirfarook.mymasjid',
      permissions: [
        'RECEIVE_BOOT_COMPLETED',
        'POST_NOTIFICATIONS',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_FINE_LOCATION',
        'USE_EXACT_ALARM',
        'SCHEDULE_EXACT_ALARM',
      ]
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#ffffff'
        }
      ],
      [
        '@sentry/react-native/expo',
        {
          organization: 'scaleup-e6',
          project: 'react-native'
        }
      ],
      withRemoveForegroundService,
    ],
    extra: {
      isDev: IS_DEV,
      apiUrl: IS_DEV
        ? 'http://localhost:3000'
        : 'https://api.altaqwa.org.au',
      sentryDsn: 'https://1a1b064b8d659dfca866fea0e098e222@o4511566264860672.ingest.us.sentry.io/4511566268203009',
      eas: {
        projectId: 'b828c5f0-5109-4b00-b058-b8e6211e632d'
      }
    }
  }
};
