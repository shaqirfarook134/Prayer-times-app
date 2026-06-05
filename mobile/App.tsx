import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
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

  // Custom iOS tab bar — dark pill matching approved mockup design
  const IOSTabBar = ({ state, navigation }: BottomTabBarProps) => {
    const insets = useSafeAreaInsets();

    const TAB_EMOJIS: Record<string, string> = {
      FindMasjid:   '🔍',
      PrayerTimes:  '🕌',
      QiblaCompass: '🧭',
    };

    return (
      <View style={[tabBarStyles.wrapper, { bottom: insets.bottom + 10 }]}>
        <BlurView tint="dark" intensity={80} style={tabBarStyles.pill}>
          <View style={tabBarStyles.row}>
            {state.routes.map((route, index) => {
              const focused = state.index === index;
              const emoji = TAB_EMOJIS[route.name] ?? '●';
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
                  <Text style={[tabBarStyles.tabEmoji, { opacity: focused ? 1 : 0.3 }]}>{emoji}</Text>
                  {focused && <View style={tabBarStyles.activeDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
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
    left: 20,
    right: 20,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 12,
  },
  pill: {
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'rgba(18,18,28,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 24,
    gap: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  tabEmoji: {
    fontSize: 22,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6091ff',
  },
});
