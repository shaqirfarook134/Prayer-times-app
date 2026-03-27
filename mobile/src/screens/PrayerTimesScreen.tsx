import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  Switch,
  AppState,
  Animated,
} from 'react-native';
import Constants from 'expo-constants';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, PrayerTimes, Masjid, Prayer, PrayerTime } from '../types';
import apiService from '../services/api';
import storageService from '../services/storage';
import notificationService from '../services/notifications';
import websocketService from '../services/websocket';
import networkService, { ConnectionStatus } from '../services/network';
import { useResponsive } from '../hooks/useResponsive';
// import adhanSoundService from '../services/adhanSound'; // Temporarily disabled - expo-av version incompatibility

type PrayerTimesScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'PrayerTimes'
>;

type PrayerTimesScreenRouteProp = RouteProp<RootStackParamList, 'PrayerTimes'>;

interface Props {
  navigation: PrayerTimesScreenNavigationProp;
  route: PrayerTimesScreenRouteProp;
}

const PrayerTimesScreen: React.FC<Props> = ({ navigation, route }) => {
  const { masjidId } = route.params;
  const { isTablet, isIPad } = useResponsive();
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [masjid, setMasjid] = useState<Masjid | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPrayer, setNextPrayer] = useState<Prayer | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermissionDenied, setNotificationPermissionDenied] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(networkService.getStatus());
  const [websocketConnected, setWebsocketConnected] = useState(websocketService.isConnected());
  const [currentAdhanPrayer, setCurrentAdhanPrayer] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasAttemptedRefresh = React.useRef(false);

  useEffect(() => {
    loadData();
    loadNotificationSettings();
    requestNotificationPermissions();

    // Initialize adhan sound service
    // adhanSoundService.initialize(); // Temporarily disabled - expo-av version incompatibility

    // Listen for network status changes
    const handleNetworkChange = (status: ConnectionStatus) => {
      console.log('📶 Network status changed in screen:', status);
      setConnectionStatus(status);
      if (status === 'online') {
        loadData(); // Refresh data when network restored
      }
    };
    networkService.addListener(handleNetworkChange);

    // Listen for WebSocket connection state changes
    const handleWebSocketChange = (connected: boolean) => {
      console.log('🔌 WebSocket status changed in screen:', connected);
      setWebsocketConnected(connected);
    };
    websocketService.onConnectionStateChange(handleWebSocketChange);

    // Listen for prayer times updates (WebSocket connected globally in App.tsx)
    websocketService.onPrayerTimesUpdated((data) => {
      if (data.masjidId === masjidId) {
        console.log('🔥 Received real-time prayer times update!');
        loadData();
      }
    });

    // Update countdown every minute
    const countdownInterval = setInterval(updateNextPrayer, 60000);

    // Check for current adhan prayer every second (for blinking animation)
    // Temporarily disabled - expo-av version incompatibility
    // const adhanCheckInterval = setInterval(() => {
    //   setCurrentAdhanPrayer(adhanSoundService.getCurrentAdhanPrayer());
    // }, 1000);

    // Auto-refresh data every 5 minutes (backup to WebSocket)
    const refreshInterval = setInterval(() => {
      console.log('Auto-refreshing prayer times...');
      loadData();
    }, 5 * 60 * 1000);

    // Auto-refresh when app comes from background
    let previousAppState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      console.log('AppState changed:', previousAppState, '->', nextAppState);
      if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App returned to foreground - refreshing data');
        loadData();
      }
      previousAppState = nextAppState;
    });

    return () => {
      clearInterval(countdownInterval);
      // clearInterval(adhanCheckInterval); // Temporarily disabled - expo-av version incompatibility
      clearInterval(refreshInterval);
      subscription.remove();
      networkService.removeListener(handleNetworkChange);
      websocketService.removeConnectionStateListener(handleWebSocketChange);
      websocketService.removeAllListeners();
      // adhanSoundService.cleanup(); // Temporarily disabled - expo-av version incompatibility
    };
  }, [masjidId]);

  // FIX #3: Fallback notification scheduling (safety net if background task fails)
  useEffect(() => {
    const scheduleNotifications = async () => {
      if (prayerTimes && masjid && notificationsEnabled) {
        console.log('🔔 Scheduling prayer notifications (fallback safety net)');
        console.log('   This runs whenever app opens or prayer times update');

        const success = await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);

        if (!success) {
          console.error('❌ Failed to schedule notifications');
          setNotificationPermissionDenied(true);
        } else {
          console.log('✅ Notifications scheduled successfully');
          setNotificationPermissionDenied(false);
        }
      }
      // Schedule adhan sound checks
      // adhanSoundService.scheduleAdhanChecks(prayerTimes); // Temporarily disabled - expo-av version incompatibility
    };

    if (prayerTimes) {
      updateNextPrayer();
      scheduleNotifications();
    }
  }, [prayerTimes, notificationsEnabled]);

  // FIX #2: Auto-refresh if data is stale (from previous day)
  // Only attempt refresh once to prevent infinite loop when API returns 404
  useEffect(() => {
    if (prayerTimes && !hasAttemptedRefresh.current) {
      const today = new Date().toDateString();
      const dataDate = new Date(prayerTimes.date).toDateString();

      if (today !== dataDate) {
        console.log('⚠️ Stale data detected! Data is from', dataDate, 'but today is', today);
        console.log('🔄 Auto-refreshing to get fresh prayer times...');
        hasAttemptedRefresh.current = true; // Mark that we've attempted refresh
        // Automatically fetch fresh data
        loadData();
      }
    }
  }, [prayerTimes]);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [masjidId])
  );

  const loadNotificationSettings = async () => {
    const enabled = await storageService.getNotificationsEnabled();
    setNotificationsEnabled(enabled);
  };

  const requestNotificationPermissions = async () => {
    try {
      console.log('🔔 Requesting notification permissions...');
      const hasPermission = await notificationService.requestPermissions();

      if (!hasPermission) {
        console.log('❌ Notification permissions denied');
        setNotificationPermissionDenied(true);
      } else {
        console.log('✅ Notification permissions granted');
        setNotificationPermissionDenied(false);
      }
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      setNotificationPermissionDenied(true);
    }
  };

  const loadData = async () => {
    try {
      setError(null);

      // Fetch fresh data from API (instant with Starter plan - <100ms)
      const [prayerData, masjidData] = await Promise.all([
        apiService.getPrayerTimes(masjidId),
        apiService.getMasjidById(masjidId),
      ]);

      setPrayerTimes(prayerData);
      setMasjid(masjidData);
      setLastUpdated(new Date()); // Track when data was fetched
      hasAttemptedRefresh.current = false; // Reset refresh flag on success

      // Cache the fresh data for offline support
      await storageService.setCachedPrayerTimes(masjidId, prayerData);

      console.log('✅ Prayer times loaded successfully at', new Date().toLocaleString());
    } catch (err: any) {
      console.error('Error loading data:', err);

      // Determine error type for better user messaging
      const statusCode = err.response?.status;
      let errorMessage = '';

      if (statusCode === 404) {
        errorMessage = "Prayer times are being prepared. Please check back in a few minutes.";
      } else if (err.message?.includes('Network Error') || !err.response) {
        errorMessage = 'No internet connection. Showing cached data.';
      } else {
        errorMessage = 'Unable to load prayer times. Showing cached data.';
      }

      // Fallback to cached data only if API fails (offline mode)
      const cached = await storageService.getCachedPrayerTimes(masjidId);
      if (cached) {
        setPrayerTimes(cached);
        setError(errorMessage);
      } else {
        // No cached data available
        if (statusCode === 404) {
          setError('Prayer times are being prepared. Please check back in a few minutes.');
        } else {
          setError('Failed to load prayer times. Please check your internet connection.');
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateNextPrayer = () => {
    if (!prayerTimes) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const prayers: Prayer[] = [
      { name: 'Fajr', time: prayerTimes.fajr },
      { name: 'Dhuhr', time: prayerTimes.dhuhr },
      { name: 'Asr', time: prayerTimes.asr },
      { name: 'Maghrib', time: prayerTimes.maghrib },
      { name: 'Isha', time: prayerTimes.isha },
    ];

    for (const prayer of prayers) {
      const [hours, minutes] = prayer.time.adhan.split(':').map(Number);
      const prayerMinutes = hours * 60 + minutes;

      if (prayerMinutes > currentMinutes) {
        setNextPrayer(prayer);
        return;
      }
    }

    // If all prayers passed, next prayer is tomorrow's Fajr
    setNextPrayer(prayers[0]);
  };

  const getTimeUntilPrayer = (): string => {
    if (!nextPrayer) return '';

    const now = new Date();
    const [hours, minutes] = nextPrayer.time.adhan.split(':').map(Number);
    const prayerTime = new Date(now);
    prayerTime.setHours(hours, minutes, 0, 0);

    // If prayer time has passed today, it's tomorrow
    if (prayerTime <= now) {
      prayerTime.setDate(prayerTime.getDate() + 1);
    }

    const diff = prayerTime.getTime() - now.getTime();
    const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
    const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hoursLeft > 0) {
      return `${hoursLeft}h ${minutesLeft}m`;
    }
    return `${minutesLeft}m`;
  };

  const toggleNotifications = async (value: boolean) => {
    if (value) {
      // Request permissions when enabling notifications
      const hasPermission = await notificationService.requestPermissions();
      if (!hasPermission) {
        console.log('❌ Cannot enable notifications - permission denied');
        setNotificationPermissionDenied(true);
        return; // Don't toggle if permission denied
      }
      setNotificationPermissionDenied(false);
    }

    setNotificationsEnabled(value);
    await storageService.setNotificationsEnabled(value);
    await notificationService.updatePreferences(masjidId, value);

    if (value && prayerTimes && masjid) {
      const success = await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);
      if (!success) {
        console.error('❌ Failed to schedule notifications');
        setNotificationPermissionDenied(true);
      }
    } else {
      await notificationService.cancelAll();
    }
  };

  const changeMasjid = async () => {
    await storageService.setSelectedMasjidId(0);
    navigation.replace('MasjidSelection');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // Create dynamic styles based on device type
  const dynamicStyles = StyleSheet.create({
    contentContainer: {
      width: '100%',
    },
    header: {
      ...styles.header,
      padding: isTablet ? 32 : 24,
      paddingTop: isTablet ? 80 : 60,
    },
    masjidName: {
      ...styles.masjidName,
      fontSize: isTablet ? 32 : 24,
    },
    date: {
      ...styles.date,
      fontSize: isTablet ? 20 : 16,
    },
    prayerTimesContainer: {
      ...styles.prayerTimesContainer,
      margin: isTablet ? 24 : 16,
      borderRadius: isTablet ? 16 : 12,
    },
    settingsCard: {
      ...styles.settingsCard,
      margin: isTablet ? 24 : 16,
      padding: isTablet ? 28 : 20,
      borderRadius: isTablet ? 16 : 12,
    },
    changeMasjidButton: {
      ...styles.changeMasjidButton,
      margin: isTablet ? 24 : 16,
      padding: isTablet ? 20 : 16,
    },
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadData();
        }} />
      }
    >
      <View style={dynamicStyles.contentContainer}>
        {/* Header */}
        <View style={dynamicStyles.header}>
          <Text style={dynamicStyles.masjidName}>{masjid?.name || 'Prayer Times'}</Text>
          <Text style={dynamicStyles.date}>
            Prayer Times for {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
          {lastUpdated && (
            <Text style={styles.lastUpdated}>
              Last updated: {lastUpdated.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })} at {lastUpdated.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </Text>
          )}
        </View>

      {/* Connection Status Indicator */}
      {connectionStatus !== 'online' && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionText}>
            {connectionStatus === 'offline' ? '⚠️ Offline (using cached data)' : '🔄 Connecting...'}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {notificationPermissionDenied && (
        <View style={styles.notificationBanner}>
          <Text style={styles.notificationText}>
            ⚠️ Notification permissions denied. Enable notifications in Settings to receive prayer alerts.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={requestNotificationPermissions}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

        {/* Prayer Times List */}
        {prayerTimes && (
          <View style={dynamicStyles.prayerTimesContainer}>
            {/* Header Row */}
            <View style={styles.headerRow}>
              <Text style={[styles.headerPrayerName, isTablet && { fontSize: 16 }]}>Prayer</Text>
              <View style={styles.timesContainer}>
                <Text style={[styles.headerTimeLabel, isTablet && { fontSize: 16, width: 90 }]}>Adhan</Text>
                <Text style={[styles.headerTimeLabel, isTablet && { fontSize: 16, width: 90 }]}>Iqama</Text>
              </View>
            </View>

            <PrayerTimeRow name="Fajr" time={prayerTimes.fajr} isNext={nextPrayer?.name === 'Fajr'} isAdhan={currentAdhanPrayer === 'Fajr'} isTablet={isTablet} />
            <PrayerTimeRow name="Dhuhr" time={prayerTimes.dhuhr} isNext={nextPrayer?.name === 'Dhuhr'} isAdhan={currentAdhanPrayer === 'Dhuhr'} isTablet={isTablet} />
            <PrayerTimeRow name="Asr" time={prayerTimes.asr} isNext={nextPrayer?.name === 'Asr'} isAdhan={currentAdhanPrayer === 'Asr'} isTablet={isTablet} />
            <PrayerTimeRow name="Maghrib" time={prayerTimes.maghrib} isNext={nextPrayer?.name === 'Maghrib'} isAdhan={currentAdhanPrayer === 'Maghrib'} isTablet={isTablet} />
            <PrayerTimeRow name="Isha" time={prayerTimes.isha} isNext={nextPrayer?.name === 'Isha'} isAdhan={currentAdhanPrayer === 'Isha'} isTablet={isTablet} />
          </View>
        )}

        {/* Notification Settings */}
        <View style={dynamicStyles.settingsCard}>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, isTablet && { fontSize: 20 }]}>Prayer Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#D0D0D0', true: '#34C759' }}
            />
          </View>
          <Text style={[styles.settingDescription, isTablet && { fontSize: 16 }]}>
            Receive notifications 10 minutes before each prayer
          </Text>
        </View>

        {/* Change Masjid Button */}
        <TouchableOpacity style={dynamicStyles.changeMasjidButton} onPress={changeMasjid}>
          <Text style={[styles.changeMasjidText, isTablet && { fontSize: 18 }]}>Change Masjid</Text>
        </TouchableOpacity>

        {/* Version Number */}
        <Text style={styles.versionText}>v{Constants.expoConfig?.version || '1.3.1'}</Text>
      </View>
    </ScrollView>
  );
};

interface PrayerTimeRowProps {
  name: string;
  time: PrayerTime;
  isNext: boolean;
  isAdhan: boolean;
  isTablet: boolean;
}

const PrayerTimeRow: React.FC<PrayerTimeRowProps> = ({ name, time, isNext, isAdhan, isTablet }) => {
  const blinkAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (isAdhan) {
      // Start blinking animation
      const blink = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      blink.start();

      return () => {
        blink.stop();
        blinkAnim.setValue(1);
      };
    } else {
      blinkAnim.setValue(1);
    }
  }, [isAdhan]);

  return (
    <Animated.View
      style={[
        styles.prayerRow,
        isTablet && { padding: 28 },
        isNext && !isAdhan && styles.prayerRowHighlight,
        isAdhan && styles.prayerRowAdhan,
        { opacity: blinkAnim }
      ]}
    >
      <Text style={[
        styles.prayerName,
        isTablet && { fontSize: 22 },
        isNext && !isAdhan && styles.prayerNameHighlight,
        isAdhan && styles.prayerNameAdhan
      ]}>
        {name}
      </Text>
      <View style={[styles.timesContainer, isTablet && { width: 200, gap: 32 }]}>
        <Text style={[
          styles.prayerTime,
          isTablet && { fontSize: 20, width: 90 },
          isNext && !isAdhan && styles.prayerTimeHighlight,
          isAdhan && styles.prayerTimeAdhan
        ]}>
          {time.adhan12}
        </Text>
        <Text style={[
          styles.prayerTime,
          isTablet && { fontSize: 20, width: 90 },
          isNext && !isAdhan && styles.prayerTimeHighlight,
          isAdhan && styles.prayerTimeAdhan
        ]}>
          {time.iqama12}
        </Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 24,
    paddingTop: 60,
  },
  masjidName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  date: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  lastUpdated: {
    fontSize: 13,
    color: '#FFFFFF',
    opacity: 0.75,
    marginTop: 4,
    fontStyle: 'italic',
  },
  connectionBanner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  connectionText: {
    color: '#856404',
    fontSize: 14,
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  errorText: {
    color: '#856404',
    fontSize: 14,
  },
  notificationBanner: {
    backgroundColor: '#FFE5E5',
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF5252',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationText: {
    color: '#C62828',
    fontSize: 14,
    flex: 1,
    marginRight: 12,
  },
  retryButton: {
    backgroundColor: '#FF5252',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  nextPrayerCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  nextPrayerLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  nextPrayerName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  nextPrayerTime: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 12,
  },
  countdown: {
    fontSize: 20,
    color: '#666',
  },
  prayerTimesContainer: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 2,
    borderBottomColor: '#E0E0E0',
  },
  headerPrayerName: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    flex: 1,
    textTransform: 'uppercase',
  },
  headerTimeLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    textAlign: 'center',
    width: 70,
    textTransform: 'uppercase',
  },
  prayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  prayerRowHighlight: {
    backgroundColor: '#E3F2FD',
  },
  prayerRowAdhan: {
    backgroundColor: '#FFE0B2',
  },
  prayerName: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  prayerNameHighlight: {
    color: '#007AFF',
    fontWeight: '600',
  },
  prayerNameAdhan: {
    color: '#FF6F00',
    fontWeight: '700',
  },
  timesContainer: {
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'space-between',
    width: 164,
  },
  timeColumn: {
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  prayerTime: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  prayerTimeHighlight: {
    color: '#007AFF',
  },
  prayerTimeAdhan: {
    color: '#FF6F00',
    fontWeight: '700',
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
  },
  changeMasjidButton: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  changeMasjidText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  versionText: {
    fontSize: 11,
    color: '#999999',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
});

export default PrayerTimesScreen;
