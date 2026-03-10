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
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, PrayerTimes, Masjid, Prayer, PrayerTime } from '../types';
import apiService from '../services/api';
import storageService from '../services/storage';
import notificationService from '../services/notifications';

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
  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [masjid, setMasjid] = useState<Masjid | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPrayer, setNextPrayer] = useState<Prayer | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  useEffect(() => {
    loadData();
    loadNotificationSettings();

    // Update countdown every minute
    const countdownInterval = setInterval(updateNextPrayer, 60000);

    // Auto-refresh data every 5 minutes
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
      clearInterval(refreshInterval);
      subscription.remove();
    };
  }, [masjidId]);

  useEffect(() => {
    if (prayerTimes) {
      updateNextPrayer();
      if (masjid && notificationsEnabled) {
        notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);
      }
    }
  }, [prayerTimes, notificationsEnabled]);

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

  const loadData = async () => {
    try {
      setError(null);

      // Try to load from cache first (offline support)
      const cached = await storageService.getCachedPrayerTimes(masjidId);
      if (cached && !refreshing) {
        setPrayerTimes(cached);
      }

      // Fetch fresh data
      const [prayerData, masjidData] = await Promise.all([
        apiService.getPrayerTimes(masjidId),
        apiService.getMasjidById(masjidId),
      ]);

      setPrayerTimes(prayerData);
      setMasjid(masjidData);

      // Cache the data
      await storageService.setCachedPrayerTimes(masjidId, prayerData);
    } catch (err) {
      console.error('Error loading data:', err);
      // If we have cached data, use it
      const cached = await storageService.getCachedPrayerTimes(masjidId);
      if (cached) {
        setPrayerTimes(cached);
        setError('Using cached data (offline mode)');
      } else {
        setError('Failed to load prayer times');
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
    setNotificationsEnabled(value);
    await storageService.setNotificationsEnabled(value);
    await notificationService.updatePreferences(masjidId, value);

    if (value && prayerTimes && masjid) {
      await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.masjidName}>{masjid?.name || 'Prayer Times'}</Text>
        <Text style={styles.date}>
          {prayerTimes?.date ? new Date(prayerTimes.date).toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }) : ''}
        </Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Next Prayer Countdown */}
      {nextPrayer && (
        <View style={styles.nextPrayerCard}>
          <Text style={styles.nextPrayerLabel}>Next Prayer</Text>
          <Text style={styles.nextPrayerName}>{nextPrayer.name}</Text>
          <Text style={styles.nextPrayerTime}>{nextPrayer.time.adhan12}</Text>
          <Text style={styles.countdown}>{getTimeUntilPrayer()}</Text>
        </View>
      )}

      {/* Prayer Times List */}
      {prayerTimes && (
        <View style={styles.prayerTimesContainer}>
          <PrayerTimeRow name="Fajr" time={prayerTimes.fajr} isNext={nextPrayer?.name === 'Fajr'} />
          <PrayerTimeRow name="Dhuhr" time={prayerTimes.dhuhr} isNext={nextPrayer?.name === 'Dhuhr'} />
          <PrayerTimeRow name="Asr" time={prayerTimes.asr} isNext={nextPrayer?.name === 'Asr'} />
          <PrayerTimeRow name="Maghrib" time={prayerTimes.maghrib} isNext={nextPrayer?.name === 'Maghrib'} />
          <PrayerTimeRow name="Isha" time={prayerTimes.isha} isNext={nextPrayer?.name === 'Isha'} />
        </View>
      )}

      {/* Notification Settings */}
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

      {/* Change Masjid Button */}
      <TouchableOpacity style={styles.changeMasjidButton} onPress={changeMasjid}>
        <Text style={styles.changeMasjidText}>Change Masjid</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

interface PrayerTimeRowProps {
  name: string;
  time: PrayerTime;
  isNext: boolean;
}

const PrayerTimeRow: React.FC<PrayerTimeRowProps> = ({ name, time, isNext }) => (
  <View style={[styles.prayerRow, isNext && styles.prayerRowHighlight]}>
    <Text style={[styles.prayerName, isNext && styles.prayerNameHighlight]}>{name}</Text>
    <View style={styles.timesContainer}>
      <View style={styles.timeColumn}>
        <Text style={styles.timeLabel}>Adhan</Text>
        <Text style={[styles.prayerTime, isNext && styles.prayerTimeHighlight]}>{time.adhan12}</Text>
      </View>
      <View style={styles.timeColumn}>
        <Text style={styles.timeLabel}>Iqama</Text>
        <Text style={[styles.prayerTime, isNext && styles.prayerTimeHighlight]}>{time.iqama12}</Text>
      </View>
    </View>
  </View>
);

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
    marginTop: 0,
    borderRadius: 12,
    overflow: 'hidden',
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
  timesContainer: {
    flexDirection: 'row',
    gap: 24,
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
});

export default PrayerTimesScreen;
