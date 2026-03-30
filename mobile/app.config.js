const IS_DEV = process.env.APP_ENV === 'development';

export default {
  expo: {
    name: IS_DEV ? 'My Masjid Dev' : 'My Masjid App',
    slug: 'mymasjid',
    version: '1.3.5',
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
        'ACCESS_FINE_LOCATION'
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
      ]
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
