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
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { TabParamList, PrayerTimes, Masjid, Prayer, PrayerTime } from '../types';
import apiService from '../services/api';
import storageService from '../services/storage';
import notificationService from '../services/notifications';
import websocketService from '../services/websocket';
import { useResponsive } from '../hooks/useResponsive';
// import adhanSoundService from '../services/adhanSound'; // Temporarily disabled - expo-av version incompatibility

type PrayerTimesScreenNavigationProp = BottomTabNavigationProp<
  TabParamList,
  'PrayerTimes'
>;

type PrayerTimesScreenRouteProp = RouteProp<TabParamList, 'PrayerTimes'>;

interface Props {
  navigation: PrayerTimesScreenNavigationProp;
  route: PrayerTimesScreenRouteProp;
}

function getHijriDate(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US-u-ca-islamic', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(new Date());
  } catch {
    return '';
  }
}

const PrayerTimesScreen: React.FC<Props> = ({ navigation, route }) => {
  const { masjidId } = route.params;
  const { isTablet, isIPad } = useResponsive();
  // activeMasjidId is the source of truth — read from storage on focus
  // so switching masjids and returning from tabs always loads the correct one
  const [activeMasjidId, setActiveMasjidId] = useState<number>(masjidId);
  const insets = useSafeAreaInsets();
  // Tab bar clearance — floating pill (60pt) + margin (10pt) + insets.bottom
  const tabBarClearance = Platform.OS === 'ios' ? 60 + 10 + insets.bottom + 8 : insets.bottom;
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [masjid, setMasjid] = useState<Masjid | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPrayer, setNextPrayer] = useState<Prayer | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermissionDenied, setNotificationPermissionDenied] = useState(false);
  const [currentAdhanPrayer, setCurrentAdhanPrayer] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasAttemptedRefresh = React.useRef(false);
  const isLoadingRef = React.useRef(false); // Prevent concurrent loadData() calls
  const dataFromCache = React.useRef(false); // Track if current data is from cache fallback
  const isSchedulingNotificationsRef = React.useRef(false); // Prevent duplicate notification scheduling

  useEffect(() => {
    loadData();
    loadNotificationSettings();
    requestNotificationPermissions();

    // Initialize adhan sound service
    // adhanSoundService.initialize(); // Temporarily disabled - expo-av version incompatibility

    // Listen for WebSocket connection state changes (no-op stub — handled globally in App.tsx)

    // Listen for prayer times updates (WebSocket connected globally in App.tsx)
    websocketService.onPrayerTimesUpdated((data) => {
      if (data.masjidId === activeMasjidId) {
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
      websocketService.removeAllListeners();
      // adhanSoundService.cleanup(); // Temporarily disabled - expo-av version incompatibility
    };
  }, [activeMasjidId]);

  // Schedule notifications once per day — guard prevents rescheduling on every loadData() call
  useEffect(() => {
    const scheduleNotifications = async () => {
      if (!prayerTimes || !masjid || !notificationsEnabled) return;

      // Synchronous in-memory lock — prevents a second call slipping through before
      // the AsyncStorage date guard is written (which only happens after scheduling completes).
      if (isSchedulingNotificationsRef.current) {
        console.log('⏭️ Notifications already being scheduled, skipping');
        return;
      }
      isSchedulingNotificationsRef.current = true;

      try {
        const today = new Date().toDateString();
        const lastScheduledDate = await storageService.getLastNotificationScheduledDate();
        if (lastScheduledDate === today) {
          console.log('⏭️ Notifications already scheduled today, skipping');
          return;
        }

        console.log('🔔 Scheduling prayer notifications for today');
        const success = await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);

        if (!success) {
          console.error('❌ Failed to schedule notifications');
          setNotificationPermissionDenied(true);
        } else {
          console.log('✅ Notifications scheduled successfully');
          setNotificationPermissionDenied(false);
          await storageService.setLastNotificationScheduledDate(today);
        }
      } finally {
        isSchedulingNotificationsRef.current = false;
      }
    };

    if (prayerTimes) {
      updateNextPrayer();
      scheduleNotifications();
    }
  }, [prayerTimes, notificationsEnabled]);

  // FIX #2: Auto-refresh if data is stale (from previous day)
  // Only attempt refresh once to prevent infinite loop when API returns 404
  // Skip stale detection if data came from cache fallback (to prevent infinite loop)
  useEffect(() => {
    if (prayerTimes && !hasAttemptedRefresh.current && !dataFromCache.current) {
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

  // Sync masjid selection from storage whenever screen comes into focus.
  // Handles tab-switching, returning from Qibla, and the overnight case where
  // the 12:30 AM notification wakes the app with a stale route.params.masjidId.
  useFocusEffect(
    React.useCallback(() => {
      const syncMasjidFromStorage = async () => {
        const storedId = await storageService.getSelectedMasjidId();
        if (storedId && storedId !== activeMasjidId) {
          console.log(`🔄 Masjid changed in storage (${activeMasjidId} → ${storedId}), reloading`);
          hasAttemptedRefresh.current = false;
          dataFromCache.current = false;
          isLoadingRef.current = false;
          setActiveMasjidId(storedId);
        }
      };
      syncMasjidFromStorage();
    }, [activeMasjidId])
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
    // GUARD: Prevent concurrent loadData() calls to avoid race conditions
    if (isLoadingRef.current) {
      console.log('⏭️ Skipping loadData() - already loading');
      return;
    }

    isLoadingRef.current = true;

    try {
      setError(null);
      dataFromCache.current = false; // Reset cache flag - we're fetching fresh data

      // Fetch fresh data from API (instant with Starter plan - <100ms)
      const [prayerData, masjidData] = await Promise.all([
        apiService.getPrayerTimes(activeMasjidId),
        apiService.getMasjidById(activeMasjidId),
      ]);

      setPrayerTimes(prayerData);
      setMasjid(masjidData);
      setLastUpdated(new Date()); // Track when data was fetched
      hasAttemptedRefresh.current = false; // Reset refresh flag on success

      // Cache the fresh data for offline support
      await storageService.setCachedPrayerTimes(activeMasjidId, prayerData);

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
      const cached = await storageService.getCachedPrayerTimes(activeMasjidId);
      if (cached) {
        dataFromCache.current = true; // Mark that this data is from cache (prevents stale detection loop)
        setPrayerTimes(cached);
        setError(errorMessage);
        console.log('📦 Using cached prayer times from', new Date(cached.date).toLocaleDateString());
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
      isLoadingRef.current = false; // Reset loading guard
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
      // Clear the date guard so the useEffect reschedules immediately
      await storageService.setLastNotificationScheduledDate('');
      const success = await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);
      if (!success) {
        console.error('❌ Failed to schedule notifications');
        setNotificationPermissionDenied(true);
      } else {
        await storageService.setLastNotificationScheduledDate(new Date().toDateString());
      }
    } else {
      await notificationService.cancelAll();
    }
  };

  const changeMasjid = async () => {
    await storageService.setSelectedMasjidId(0);
    (navigation as any).getParent()?.replace('MasjidSelection');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  const hijriDate = getHijriDate();
  const timeUntil = getTimeUntilPrayer();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarClearance }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          loadData();
        }} />
      }
    >
      {/* ── Hero card ── */}
      <LinearGradient
        colors={['#1a3a6b', '#0d2447', '#0a1f3d']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 16 }]}
      >
        {/* Radial glow top-right */}
        <View style={styles.heroGlow} pointerEvents="none" />

        {/* Location + date */}
        <Text style={styles.heroLocation}>
          📍 {masjid?.name || 'Prayer Times'}
          {masjid?.city ? `  ·  ${masjid.city}` : ''}
        </Text>
        <Text style={styles.heroDate}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {hijriDate ? `  ·  ${hijriDate}` : ''}
        </Text>

        {/* Next prayer */}
        {nextPrayer && (
          <>
            <Text style={styles.nextPrayerLabel}>Next Prayer</Text>
            <Text style={styles.nextPrayerName}>{nextPrayer.name}</Text>
            <Text style={styles.nextPrayerTime}>{nextPrayer.time.adhan12}</Text>
            {timeUntil ? (
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>⏱ in {timeUntil}</Text>
              </View>
            ) : null}
          </>
        )}
      </LinearGradient>
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {notificationPermissionDenied && (
        <View style={styles.notificationBanner}>
          <Text style={styles.notificationText}>
            ⚠️ Notification permissions denied. Enable in Settings to receive prayer alerts.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={requestNotificationPermissions}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Prayer list ── */}
      {prayerTimes && (
        <View style={styles.prayerList}>
          <PrayerTimeRow name="Fajr"    time={prayerTimes.fajr}    isNext={nextPrayer?.name === 'Fajr'}    isAdhan={currentAdhanPrayer === 'Fajr'}    isTablet={isTablet} />
          <PrayerTimeRow name="Dhuhr"   time={prayerTimes.dhuhr}   isNext={nextPrayer?.name === 'Dhuhr'}   isAdhan={currentAdhanPrayer === 'Dhuhr'}   isTablet={isTablet} />
          <PrayerTimeRow name="Asr"     time={prayerTimes.asr}     isNext={nextPrayer?.name === 'Asr'}     isAdhan={currentAdhanPrayer === 'Asr'}     isTablet={isTablet} />
          <PrayerTimeRow name="Maghrib" time={prayerTimes.maghrib} isNext={nextPrayer?.name === 'Maghrib'} isAdhan={currentAdhanPrayer === 'Maghrib'} isTablet={isTablet} />
          <PrayerTimeRow name="Isha"    time={prayerTimes.isha}    isNext={nextPrayer?.name === 'Isha'}    isAdhan={currentAdhanPrayer === 'Isha'}    isTablet={isTablet} />
        </View>
      )}

      {/* ── Settings ── */}
      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Prayer Notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: '#D0D0D0', true: '#34C759' }}
          />
        </View>
        <Text style={styles.settingDescription}>
          Receive notifications 10 minutes before each prayer
        </Text>
      </View>

      <TouchableOpacity style={styles.changeMasjidButton} onPress={changeMasjid}>
        <Text style={styles.changeMasjidText}>Change Masjid</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>v{Constants.expoConfig?.version || '1.3.1'}</Text>
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
      const blink = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      );
      blink.start();
      return () => { blink.stop(); blinkAnim.setValue(1); };
    } else {
      blinkAnim.setValue(1);
    }
  }, [isAdhan]);

  const rowColor = isAdhan ? '#FF6F00' : isNext ? '#007AFF' : '#1c1c1e';
  const timeColor = isAdhan ? '#FF6F00' : isNext ? '#007AFF' : '#48484a';

  return (
    <Animated.View
      style={[
        styles.prayerRow,
        isNext && !isAdhan && styles.prayerRowHighlight,
        isAdhan && styles.prayerRowAdhan,
        { opacity: blinkAnim },
      ]}
    >
      <Text style={[styles.prayerName, { color: rowColor }, isTablet && { fontSize: 18 }]}>
        {name}
      </Text>
      <View style={styles.timesContainer}>
        <View style={styles.timeColumn}>
          <Text style={[styles.timeLabel]}>Adhan</Text>
          <Text style={[styles.prayerTime, { color: timeColor }, isTablet && { fontSize: 16 }]}>{time.adhan12}</Text>
        </View>
        <View style={styles.timeColumn}>
          <Text style={styles.timeLabel}>Iqama</Text>
          <Text style={[styles.prayerTime, { color: timeColor }, isTablet && { fontSize: 16 }]}>{time.iqama12}</Text>
        </View>
      </View>
      {isNext && !isAdhan && <View style={styles.activeDot} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Hero card ──
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    position: 'relative',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,200,50,0.12)',
  },
  heroLocation: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginBottom: 4,
  },
  heroDate: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
    marginBottom: 20,
  },
  nextPrayerLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
    marginBottom: 4,
  },
  nextPrayerName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  nextPrayerTime: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
    fontWeight: '500',
  },
  countdownPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffd60a',
    letterSpacing: 0.3,
  },

  // ── Status banners ──
  connectionBanner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  connectionText: { color: '#856404', fontSize: 14, fontWeight: '500' },
  errorBanner: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  errorText: { color: '#856404', fontSize: 14 },
  notificationBanner: {
    backgroundColor: '#FFE5E5',
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#FF5252',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationText: { color: '#C62828', fontSize: 14, flex: 1, marginRight: 12 },
  retryButton: {
    backgroundColor: '#FF5252',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  // ── Prayer list ──
  prayerList: {
    marginHorizontal: 16,
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  prayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  prayerRowHighlight: {
    backgroundColor: '#eef4ff',
    borderLeftWidth: 3,
    borderLeftColor: '#007AFF',
  },
  prayerRowAdhan: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 3,
    borderLeftColor: '#FF6F00',
  },
  prayerName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  timesContainer: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
  },
  timeColumn: {
    alignItems: 'center',
    minWidth: 60,
  },
  timeLabel: {
    fontSize: 10,
    color: '#8e8e93',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  prayerTime: {
    fontSize: 15,
    fontWeight: '600',
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },

  // ── Settings ──
  settingsCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 18,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  settingLabel: { fontSize: 16, color: '#1c1c1e', fontWeight: '500' },
  settingDescription: { fontSize: 14, color: '#8e8e93' },
  changeMasjidButton: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  changeMasjidText: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  versionText: {
    fontSize: 11,
    color: '#c7c7cc',
    textAlign: 'center',
    marginBottom: 8,
  },
});

export default PrayerTimesScreen;
