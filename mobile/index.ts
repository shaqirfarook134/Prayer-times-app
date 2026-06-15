import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// Initialise Sentry at the true entry point before anything else mounts.
// Placing it here (not in App.tsx) ensures the native layer is ready.
Sentry.init({
  dsn: Constants.expoConfig?.extra?.sentryDsn,
  enabled: !__DEV__,
  tracesSampleRate: 0,
  attachStacktrace: true,
  release: `${Constants.expoConfig?.ios?.bundleIdentifier}@${Constants.expoConfig?.version}`,
  dist: Constants.expoConfig?.version,
});

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
