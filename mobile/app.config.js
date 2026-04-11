const IS_DEV = process.env.APP_ENV === 'development';

// Config plugin to explicitly remove foreground service permissions from the merged manifest.
// The app uses expo-background-fetch (Android JobScheduler) — not a foreground service.
// Without this removal, EAS builds on Expo SDK 55 may inherit FOREGROUND_SERVICE from
// transitive dependencies, causing Google Play to require a foreground service declaration.
const withRemoveForegroundService = (config) => {
  const { withAndroidManifest } = require('@expo/config-plugins');
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const permsToRemove = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
    ];
    // Add tools:node="remove" entries to strip these from the merged manifest
    permsToRemove.forEach((perm) => {
      const already = manifest.manifest['uses-permission'].find(
        (p) => p.$?.['android:name'] === perm
      );
      if (!already) {
        manifest.manifest['uses-permission'].push({
          $: {
            'android:name': perm,
            'tools:node': 'remove',
          },
        });
      }
    });
    return config;
  });
};

export default {
  expo: {
    name: IS_DEV ? 'My Masjid Dev' : 'My Masjid App',
    slug: 'mymasjid',
    version: '1.4.0',
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
      versionCode: 2,
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
      withRemoveForegroundService,
    ],
    extra: {
      isDev: IS_DEV,
      apiUrl: IS_DEV
        ? 'http://localhost:3000'
        : 'https://api.altaqwa.org.au',
      eas: {
        projectId: 'b828c5f0-5109-4b00-b058-b8e6211e632d'
      }
    }
  }
};
