import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootStackParamList, TabParamList } from './src/types';
import MasjidSelectionScreen from './src/screens/MasjidSelectionScreen';
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

export default function App() {
  useEffect(() => {
    const initializeApp = async () => {
      const initStartTime = Date.now();
      console.log('⏱️  [PERF] App initialization started');

      // Request notification permissions on app start (non-blocking, delayed)
      setTimeout(() => {
        notificationService.requestPermissions().catch(console.error);
      }, 500);

      // Register daily background task for 12:30 AM prayer time refresh (non-blocking, delayed)
      setTimeout(() => {
        backgroundTaskService.registerDailyPrayerRefresh().catch(console.error);
      }, 1000);

      // Connect to WebSocket for real-time updates (non-blocking - runs in background)
      console.log('🌐 Initializing global WebSocket connection...');
      // Delay WebSocket connection to allow UI to render first
      setTimeout(() => {
        websocketService.connect();
      }, 1500);

      // Log initialization completion time
      const initEndTime = Date.now();
      const initDuration = initEndTime - initStartTime;
      console.log(`⏱️  [PERF] App initialization completed in ${initDuration}ms`);
      console.log(`⏱️  [PERF] Total time from app start: ${initEndTime - APP_START_TIME}ms`);
    };

    initializeApp();

    // Listen for network restoration and reconnect WebSocket
    const handleNetworkChange = (status: 'online' | 'offline' | 'connecting') => {
      if (status === 'online') {
        console.log('✅ Network restored - reconnecting WebSocket');
        websocketService.resetReconnection();
        websocketService.connect();
      }
    };
    networkService.addListener(handleNetworkChange);

    // Add notification listeners
    const receivedSubscription = notificationService.addNotificationReceivedListener(
      async (notification) => {
        console.log('Notification received:', notification);

        // If this is the daily refresh notification, update the cache only.
        // Scheduling is handled exclusively by backgroundTasks.ts to avoid duplicates.
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

  // Custom iOS tab bar using GlassView (true Liquid Glass on iOS 26+, BlurView fallback)
  const IOSTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
    const insets = useSafeAreaInsets();
    const useGlass = isLiquidGlassAvailable();

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

    // Dark pill — white icons/labels visible on all screens including Qibla
    const activeFocusedColor = '#FFFFFF';
    const inactiveColor = 'rgba(255,255,255,0.45)';

    const inner = (
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
    );

    return (
      <View style={[tabBarStyles.wrapper, { bottom: insets.bottom + 10 }]}>
        <BlurView tint="dark" intensity={90} style={tabBarStyles.pill}>
          {inner}
        </BlurView>
      </View>
    );
  };

  const MainTabs = ({ route }: any) => {
    const paramMasjidId = route?.params?.params?.masjidId;
    // initialMasjidId falls back to storage so the hardcoded 9 (Al Taqwa) is never used
    const [initialMasjidId, setInitialMasjidId] = useState<number>(paramMasjidId || 0);
    const isIOS = Platform.OS === 'ios';
    const insets = useSafeAreaInsets();

    useEffect(() => {
      if (!paramMasjidId) {
        storageService.getSelectedMasjidId().then(id => {
          if (id) setInitialMasjidId(id);
        });
      }
    }, []);

    return (
      <Tab.Navigator
        tabBar={isIOS ? (props) => <IOSTabBar {...props} /> : undefined}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#8E8E93',
          // Android flat tab bar with safe area inset
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
        initialRouteName={route?.params?.screen || 'PrayerTimes'}
      >
        <Tab.Screen
          name="FindMasjid"
          component={FindMasjidScreen}
          options={{
            tabBarLabel: 'Find Masjid',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'search' : 'search-outline'} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="PrayerTimes"
          component={PrayerTimesScreen}
          options={{
            tabBarLabel: 'Prayer Times',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'time' : 'time-outline'} size={24} color={color} />
            ),
          }}
          initialParams={{ masjidId: initialMasjidId }}
        />
        <Tab.Screen
          name="QiblaCompass"
          component={QiblaCompassScreen}
          options={{
            tabBarLabel: 'Qibla',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'compass' : 'compass-outline'} size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    );
  };

  return (
    <SafeAreaProvider>
    <ErrorBoundary>
      <NavigationContainer
        onReady={() => {
          const navReadyTime = Date.now();
          console.log(`⏱️  [PERF] Navigation ready in ${navReadyTime - APP_START_TIME}ms`);
        }}
      >
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="MasjidSelection" component={MasjidSelectionScreen} />
          <Stack.Screen name="MainTabs" component={MainTabs} />
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
