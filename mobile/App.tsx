import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Platform, StyleSheet, View, Text, TouchableOpacity, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList, TabParamList } from './src/types';
import FindMasjidScreen from './src/screens/FindMasjidScreen';
import PrayerTimesScreen from './src/screens/PrayerTimesScreen';
import QiblaCompassScreen from './src/screens/QiblaCompassScreen';
import ErrorBoundary from './src/components/ErrorBoundary';
import notificationService from './src/services/notifications';
import websocketService from './src/services/websocket';
import backgroundTaskService from './src/services/backgroundTasks';
import apiService from './src/services/api';
import storageService from './src/services/storage';
import networkService from './src/services/network';

const Stack = createStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Track app startup time
const APP_START_TIME = Date.now();

// ── Custom iOS tab bar ────────────────────────────────────────────────────────
// Module level — stable reference, never recreated on re-renders.
const IOSTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();

  const TAB_ICONS: Record<string, { focused: string; outline: string }> = {
    FindMasjid:    { focused: 'search',  outline: 'search-outline'  },
    PrayerTimes:   { focused: 'time',    outline: 'time-outline'    },
    QiblaCompass:  { focused: 'compass', outline: 'compass-outline' },
  };
  const TAB_LABELS: Record<string, string> = {
    FindMasjid:   'Find Masjid',
    PrayerTimes:  'Prayer Times',
    QiblaCompass: 'Qibla',
  };

  const activeFocusedColor = '#FFFFFF';
  const inactiveColor = 'rgba(255,255,255,0.45)';

  return (
    <View style={[tabBarStyles.wrapper, { bottom: insets.bottom + 10 }]}>
      <BlurView tint="dark" intensity={90} style={tabBarStyles.pill}>
        <View style={tabBarStyles.row}>
          {state.routes.map((route, index) => {
            const focused = state.index === index;
            const icons = TAB_ICONS[route.name] ?? { focused: 'ellipse', outline: 'ellipse-outline' };
            const color = focused ? activeFocusedColor : inactiveColor;

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                style={tabBarStyles.tab}
              >
                {focused && <View style={tabBarStyles.activePill} />}
                <Ionicons name={focused ? icons.focused : icons.outline as any} size={22} color={color} />
                <Text style={[tabBarStyles.label, { color }]}>{TAB_LABELS[route.name]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
};

// ── Fade wrapper for tab screens ──────────────────────────────────────────────
// Wraps each tab screen in a subtle opacity fade on focus. This gives a smooth
// feel without using Tab.Navigator animation (which caused white screen bugs).
// animation: 'none' stays on the navigator — the fade happens per-screen here.
function FadeScreen({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useFocusEffect(
    useCallback(() => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return () => {
        opacity.setValue(0);
      };
    }, [])
  );
  return (
    <Animated.View style={{ flex: 1, opacity, backgroundColor: '#0d0d14' }}>
      {children}
    </Animated.View>
  );
}

// Module-level screen wrappers — stable references required by React Navigation.
const FadeFindMasjid    = (props: any) => <FadeScreen><FindMasjidScreen {...props} /></FadeScreen>;
const FadePrayerTimes   = (props: any) => <FadeScreen><PrayerTimesScreen {...props} /></FadeScreen>;
const FadeQiblaCompass  = (props: any) => <FadeScreen><QiblaCompassScreen {...props} /></FadeScreen>;

// Stable module-level render function for the tab bar.
// React Navigation calls tabBar as a render function (not as a mounted component),
// so IOSTabBar must be rendered as JSX (not called directly) to preserve hook context.
const renderIOSTabBar = (props: BottomTabBarProps) => <IOSTabBar {...props} />;

// ── Main tab navigator ────────────────────────────────────────────────────────
// Module level — never recreated on re-renders.
// initialTab and initialMasjidId are resolved by App before this mounts,
// so there is no null-render / remount cycle.
interface MainTabsProps {
  initialTab: keyof TabParamList;
  initialMasjidId: number;
}

function MainTabs({ initialTab, initialMasjidId }: MainTabsProps) {
  const isIOS = Platform.OS === 'ios';
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      // Pass component reference directly — stable, no new function on re-renders.
      tabBar={isIOS ? renderIOSTabBar : undefined}
      screenOptions={{
        headerShown: false,
        animation: 'none',
        sceneStyle: { backgroundColor: '#0d0d14' },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: isIOS ? { display: 'none' } : {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E5EA',
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 8,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          letterSpacing: 0.2,
        },
      }}
      initialRouteName={initialTab}
    >
      <Tab.Screen
        name="FindMasjid"
        component={FadeFindMasjid}
        options={{
          tabBarLabel: 'Find Masjid',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="PrayerTimes"
        component={FadePrayerTimes}
        initialParams={{ masjidId: initialMasjidId }}
        options={{
          tabBarLabel: 'Prayer Times',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="QiblaCompass"
        component={FadeQiblaCompass}
        options={{
          tabBarLabel: 'Qibla',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'compass' : 'compass-outline'} size={24} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// Module-level config — set once by App before NavigationContainer mounts.
// MainTabsScreen reads from here so we avoid passing through initialParams
// (which would require widening RootStackParamList, fighting the TS type).
const _mainTabsConfig = { initialTab: 'FindMasjid' as keyof TabParamList, initialMasjidId: 0 };

// Stable module-level component — React Navigation requires a stable reference.
// Reads initial values from _mainTabsConfig, which App sets before mounting the navigator.
function MainTabsScreen() {
  return (
    <MainTabs
      initialTab={_mainTabsConfig.initialTab}
      initialMasjidId={_mainTabsConfig.initialMasjidId}
    />
  );
}

// ── Root app ──────────────────────────────────────────────────────────────────
export default function App() {
  // Resolve storage BEFORE mounting NavigationContainer so the navigator tree
  // is built once with the correct initialRouteName — no remount, no white screen.
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      console.log('⏱️  [PERF] App initialization started');

      // Resolve initial tab/masjid from storage first — NavigationContainer
      // will not mount until this is done, preventing the null→mount remount cycle.
      const storedId = await storageService.getSelectedMasjidId();
      if (storedId && storedId !== 0) {
        // Write to module-level config before mounting the navigator
        _mainTabsConfig.initialTab = 'PrayerTimes';
        _mainTabsConfig.initialMasjidId = storedId;
      }
      setAppReady(true);

      // Defer non-critical init so the first frame paints fast
      setTimeout(() => {
        notificationService.requestPermissions().catch(console.error);
      }, 500);

      setTimeout(() => {
        backgroundTaskService.registerDailyPrayerRefresh().catch(console.error);
      }, 1000);

      console.log('🌐 Initializing global WebSocket connection...');
      setTimeout(() => {
        websocketService.connect();
      }, 1500);

      console.log(`⏱️  [PERF] Total time from app start: ${Date.now() - APP_START_TIME}ms`);
    };

    initializeApp();

    const handleNetworkChange = (status: 'online' | 'offline' | 'connecting') => {
      if (status === 'online') {
        console.log('✅ Network restored - reconnecting WebSocket');
        websocketService.resetReconnection();
        websocketService.connect();
      }
    };
    networkService.addListener(handleNetworkChange);

    const receivedSubscription = notificationService.addNotificationReceivedListener(
      async (notification) => {
        console.log('Notification received:', notification);
        if (notification.request.content.data?.type === 'daily_refresh') {
          console.log('🔄 Daily refresh notification received, updating cache...');
          const masjidId = await storageService.getSelectedMasjidId();
          if (masjidId) {
            try {
              const prayerTimes = await apiService.getPrayerTimes(masjidId);
              await storageService.setCachedPrayerTimes(masjidId, prayerTimes);
              console.log('✅ Prayer times cache updated from daily notification');
            } catch (error) {
              console.error('❌ Failed to refresh prayer times:', error);
            }
          }
        }
      }
    );

    const responseSubscription = notificationService.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification tapped:', response);
      }
    );

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
      networkService.removeListener(handleNetworkChange);
      websocketService.disconnect();
    };
  }, []);

  // Render a plain dark view while storage resolves — no navigator tree at all,
  // so there is nothing to remount when appReady flips to true.
  if (!appReady) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#0d0d14' }} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer
          theme={{ dark: true, colors: { background: '#0d0d14', card: '#0d0d14', text: '#ffffff', border: 'transparent', primary: '#007AFF', notification: '#007AFF' }, fonts: { regular: { fontFamily: 'System', fontWeight: '400' }, medium: { fontFamily: 'System', fontWeight: '500' }, bold: { fontFamily: 'System', fontWeight: '700' }, heavy: { fontFamily: 'System', fontWeight: '900' } } }}
          onReady={() => {
            console.log(`⏱️  [PERF] Navigation ready in ${Date.now() - APP_START_TIME}ms`);
          }}
        >
          <StatusBar style="light" />
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {/* MainTabs: all three tabs */}
            <Stack.Screen
              name="MainTabs"
              component={MainTabsScreen}
            />
            {/* PrayerTimesBrowse: pushed from FindMasjid when user taps a masjid.
                Lives on the ROOT stack so the iOS swipe-back gesture pops it off
                entirely and reveals the tabs with FindMasjid still active. */}
            <Stack.Screen
              name="PrayerTimesBrowse"
              component={PrayerTimesScreen}
              options={{
                gestureEnabled: true,
                gestureDirection: 'horizontal',
                cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
                // Dark card background prevents white flash during the slide transition
                cardStyle: { backgroundColor: '#0d0d14' },
                transitionSpec: {
                  open:  { animation: 'spring', config: { stiffness: 1000, damping: 500, mass: 3, overshootClamping: true, restDisplacementThreshold: 10, restSpeedThreshold: 10 } },
                  close: { animation: 'spring', config: { stiffness: 1000, damping: 500, mass: 3, overshootClamping: true, restDisplacementThreshold: 10, restSpeedThreshold: 10 } },
                },
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const tabBarStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    elevation: 12,
  },
  pill: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,20,30,0.6)',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  activePill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 4,
    right: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
