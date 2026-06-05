import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
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

type PrayerTimesScreenNavigationProp = BottomTabNavigationProp<TabParamList, 'PrayerTimes'>;
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

const PRAYER_META: Record<string, { icon: string; subtitle: string }> = {
  Fajr:    { icon: '🌙', subtitle: 'Dawn prayer' },
  Dhuhr:   { icon: '☀️', subtitle: 'Midday prayer' },
  Asr:     { icon: '🌤', subtitle: 'Afternoon prayer' },
  Maghrib: { icon: '🌅', subtitle: 'Sunset prayer' },
  Isha:    { icon: '🌃', subtitle: 'Night prayer' },
};

const PRAYER_ORDER = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// ── Shimmer component ──
const ShimmerBox: React.FC<{ width: number | string; height: number; borderRadius?: number; style?: object }> = ({
  width, height, borderRadius = 8, style,
}) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = anim;
  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: 'rgba(255,255,255,0.07)', opacity },
        style,
      ]}
    />
  );
};

// ── Loading skeleton ──
const LoadingSkeleton: React.FC<{ insets: any }> = ({ insets }) => (
  <View style={{ flex: 1, backgroundColor: '#0d0d14' }}>
    {/* Hero shimmer */}
    <LinearGradient
      colors={['#1a3a6b', '#0d2447', '#0a1f3d']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 32 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <ShimmerBox width={6} height={6} borderRadius={3} />
        <ShimmerBox width={160} height={12} />
      </View>
      <ShimmerBox width={200} height={12} style={{ marginBottom: 28 }} />
      <ShimmerBox width={80} height={10} style={{ marginBottom: 8 }} />
      <ShimmerBox width={140} height={44} borderRadius={8} style={{ marginBottom: 8 }} />
      <ShimmerBox width={100} height={18} style={{ marginBottom: 16 }} />
      <ShimmerBox width={110} height={30} borderRadius={100} />
    </LinearGradient>

    {/* Section label */}
    <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 10 }}>
      <ShimmerBox width={100} height={10} borderRadius={4} />
    </View>

    {/* 5 card skeletons */}
    <View style={{ paddingHorizontal: 16, gap: 10 }}>
      {[70, 60, 50, 80, 55].map((w, i) => (
        <View key={i} style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
            <ShimmerBox width={36} height={36} borderRadius={10} />
            <View>
              <ShimmerBox width={w} height={14} style={{ marginBottom: 5 }} />
              <ShimmerBox width={w + 20} height={10} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <View style={{ alignItems: 'center' }}>
              <ShimmerBox width={40} height={8} style={{ marginBottom: 4 }} />
              <ShimmerBox width={52} height={14} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <ShimmerBox width={40} height={8} style={{ marginBottom: 4 }} />
              <ShimmerBox width={52} height={14} />
            </View>
          </View>
        </View>
      ))}
    </View>
  </View>
);

// ── Prayer card ──
interface PrayerCardProps {
  name: string;
  time: PrayerTime;
  isNext: boolean;
  isAdhan: boolean;
}

const PrayerCard: React.FC<PrayerCardProps> = ({ name, time, isNext, isAdhan }) => {
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const meta = PRAYER_META[name] ?? { icon: '🕌', subtitle: '' };

  useEffect(() => {
    if (isAdhan) {
      const blink = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      blink.start();
      return () => { blink.stop(); blinkAnim.setValue(1); };
    } else {
      blinkAnim.setValue(1);
    }
  }, [isAdhan]);

  const timeColor = isNext ? '#c8d8ff' : 'rgba(255,255,255,0.75)';
  const timeLabelColor = isNext ? 'rgba(150,185,255,0.5)' : 'rgba(255,255,255,0.25)';

  if (isNext) {
    return (
      <Animated.View style={{ opacity: blinkAnim }}>
        <LinearGradient
          colors={['rgba(26,62,140,0.5)', 'rgba(20,45,100,0.6)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.card, styles.cardNext]}
        >
          {/* Left accent bar */}
          <View style={styles.cardAccentBar} />
          {/* Icon */}
          <View style={[styles.prayerIcon, styles.prayerIconNext]}>
            <Text style={styles.prayerIconEmoji}>{meta.icon}</Text>
          </View>
          {/* Info */}
          <View style={styles.prayerInfo}>
            <Text style={[styles.prayerName, { color: '#fff' }]}>{name}</Text>
            <Text style={[styles.prayerSubtitle, { color: 'rgba(150,185,255,0.7)' }]}>{meta.subtitle}</Text>
          </View>
          {/* Times */}
          <View style={styles.timesRight}>
            <View style={styles.timeCol}>
              <Text style={[styles.timeLabel, { color: timeLabelColor }]}>ADHAN</Text>
              <Text style={[styles.timeValue, { color: timeColor }]}>{time.adhan12}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeCol}>
              <Text style={[styles.timeLabel, { color: timeLabelColor }]}>IQAMA</Text>
              <Text style={[styles.timeValue, { color: timeColor }]}>{time.iqama12}</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, { opacity: blinkAnim }]}>
      <View style={styles.prayerIcon}>
        <Text style={styles.prayerIconEmoji}>{meta.icon}</Text>
      </View>
      <View style={styles.prayerInfo}>
        <Text style={styles.prayerName}>{name}</Text>
        <Text style={styles.prayerSubtitle}>{meta.subtitle}</Text>
      </View>
      <View style={styles.timesRight}>
        <View style={styles.timeCol}>
          <Text style={styles.timeLabel}>ADHAN</Text>
          <Text style={[styles.timeValue, { color: 'rgba(255,255,255,0.75)' }]}>{time.adhan12}</Text>
        </View>
        <View style={styles.timeDivider} />
        <View style={styles.timeCol}>
          <Text style={styles.timeLabel}>IQAMA</Text>
          <Text style={[styles.timeValue, { color: 'rgba(255,255,255,0.75)' }]}>{time.iqama12}</Text>
        </View>
      </View>
    </Animated.View>
  );
};

// ── Main screen ──
const PrayerTimesScreen: React.FC<Props> = ({ navigation, route }) => {
  const { masjidId } = route.params;
  const { isTablet } = useResponsive();
  const [activeMasjidId, setActiveMasjidId] = useState<number>(masjidId);
  const insets = useSafeAreaInsets();
  const tabBarClearance = Platform.OS === 'ios' ? 60 + 10 + insets.bottom + 8 : insets.bottom;

  const [prayerTimes, setPrayerTimes] = useState<PrayerTimes | null>(null);
  const [masjid, setMasjid] = useState<Masjid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextPrayer, setNextPrayer] = useState<Prayer | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPermissionDenied, setNotificationPermissionDenied] = useState(false);
  const [currentAdhanPrayer, setCurrentAdhanPrayer] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const hasAttemptedRefresh = useRef(false);
  const isLoadingRef = useRef(false);
  const dataFromCache = useRef(false);
  const isSchedulingNotificationsRef = useRef(false);

  useEffect(() => {
    loadData();
    loadNotificationSettings();
    requestNotificationPermissions();

    websocketService.onPrayerTimesUpdated((data) => {
      if (data.masjidId === activeMasjidId) {
        loadData();
      }
    });

    const countdownInterval = setInterval(updateNextPrayer, 60000);
    const refreshInterval = setInterval(() => { loadData(); }, 5 * 60 * 1000);

    let previousAppState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
        loadData();
      }
      previousAppState = nextAppState;
    });

    return () => {
      clearInterval(countdownInterval);
      clearInterval(refreshInterval);
      subscription.remove();
      websocketService.removeAllListeners();
    };
  }, [activeMasjidId]);

  useEffect(() => {
    const scheduleNotifications = async () => {
      if (!prayerTimes || !masjid || !notificationsEnabled) return;
      if (isSchedulingNotificationsRef.current) return;
      isSchedulingNotificationsRef.current = true;
      try {
        const today = new Date().toDateString();
        const lastScheduledDate = await storageService.getLastNotificationScheduledDate();
        if (lastScheduledDate === today) return;
        const success = await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);
        if (!success) {
          setNotificationPermissionDenied(true);
        } else {
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

  useEffect(() => {
    if (prayerTimes && !hasAttemptedRefresh.current && !dataFromCache.current) {
      const today = new Date().toDateString();
      const dataDate = new Date(prayerTimes.date).toDateString();
      if (today !== dataDate) {
        hasAttemptedRefresh.current = true;
        loadData();
      }
    }
  }, [prayerTimes]);

  useFocusEffect(
    React.useCallback(() => {
      const syncMasjidFromStorage = async () => {
        const storedId = await storageService.getSelectedMasjidId();
        if (storedId && storedId !== activeMasjidId) {
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
      const hasPermission = await notificationService.requestPermissions();
      setNotificationPermissionDenied(!hasPermission);
    } catch {
      setNotificationPermissionDenied(true);
    }
  };

  const loadData = async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      setError(null);
      dataFromCache.current = false;
      const [prayerData, masjidData] = await Promise.all([
        apiService.getPrayerTimes(activeMasjidId),
        apiService.getMasjidById(activeMasjidId),
      ]);
      setPrayerTimes(prayerData);
      setMasjid(masjidData);
      setLastUpdated(new Date());
      hasAttemptedRefresh.current = false;
      await storageService.setCachedPrayerTimes(activeMasjidId, prayerData);
    } catch (err: any) {
      const statusCode = err.response?.status;
      let errorMessage = '';
      if (statusCode === 404) {
        errorMessage = 'Prayer times are being prepared. Please check back in a few minutes.';
      } else if (err.message?.includes('Network Error') || !err.response) {
        errorMessage = 'No internet connection. Showing cached data.';
      } else {
        errorMessage = 'Unable to load prayer times. Showing cached data.';
      }
      const cached = await storageService.getCachedPrayerTimes(activeMasjidId);
      if (cached) {
        dataFromCache.current = true;
        setPrayerTimes(cached);
        setError(errorMessage);
      } else {
        setError(statusCode === 404
          ? 'Prayer times are being prepared. Please check back in a few minutes.'
          : 'Failed to load prayer times. Please check your internet connection.');
      }
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  const updateNextPrayer = () => {
    if (!prayerTimes) return;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const prayers: Prayer[] = [
      { name: 'Fajr',    time: prayerTimes.fajr },
      { name: 'Dhuhr',   time: prayerTimes.dhuhr },
      { name: 'Asr',     time: prayerTimes.asr },
      { name: 'Maghrib', time: prayerTimes.maghrib },
      { name: 'Isha',    time: prayerTimes.isha },
    ];
    for (const prayer of prayers) {
      const [h, m] = prayer.time.adhan.split(':').map(Number);
      if (h * 60 + m > currentMinutes) {
        setNextPrayer(prayer);
        return;
      }
    }
    setNextPrayer(prayers[0]);
  };

  const getTimeUntilPrayer = (): string => {
    if (!nextPrayer) return '';
    const now = new Date();
    const [h, m] = nextPrayer.time.adhan.split(':').map(Number);
    const prayerTime = new Date(now);
    prayerTime.setHours(h, m, 0, 0);
    if (prayerTime <= now) prayerTime.setDate(prayerTime.getDate() + 1);
    const diff = prayerTime.getTime() - now.getTime();
    const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
    const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return hoursLeft > 0 ? `${hoursLeft}h ${minutesLeft}m` : `${minutesLeft}m`;
  };

  // Progress bar: fraction of time elapsed between prev prayer and next prayer
  const getProgressInfo = (): { progress: number; prevName: string; prevTime12: string; nextName: string; nextTime12: string } => {
    if (!prayerTimes || !nextPrayer) return { progress: 0, prevName: '', prevTime12: '', nextName: '', nextTime12: '' };
    const prayers: Prayer[] = [
      { name: 'Fajr',    time: prayerTimes.fajr },
      { name: 'Dhuhr',   time: prayerTimes.dhuhr },
      { name: 'Asr',     time: prayerTimes.asr },
      { name: 'Maghrib', time: prayerTimes.maghrib },
      { name: 'Isha',    time: prayerTimes.isha },
    ];
    const nextIdx = prayers.findIndex(p => p.name === nextPrayer.name);
    const prevIdx = nextIdx === 0 ? prayers.length - 1 : nextIdx - 1;
    const prev = prayers[prevIdx];
    const next = prayers[nextIdx];

    const toMins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const prevMins = toMins(prev.time.adhan);
    const nextMins = toMins(next.time.adhan);

    let elapsed = nowMins - prevMins;
    let total = nextMins - prevMins;
    if (total <= 0) total += 1440;
    if (elapsed < 0) elapsed += 1440;

    return {
      progress: Math.min(1, Math.max(0, elapsed / total)),
      prevName: prev.name,
      prevTime12: prev.time.adhan12,
      nextName: next.name,
      nextTime12: next.time.adhan12,
    };
  };

  const toggleNotifications = async (value: boolean) => {
    if (value) {
      const hasPermission = await notificationService.requestPermissions();
      if (!hasPermission) { setNotificationPermissionDenied(true); return; }
      setNotificationPermissionDenied(false);
    }
    setNotificationsEnabled(value);
    await storageService.setNotificationsEnabled(value);
    await notificationService.updatePreferences(masjidId, value);
    if (value && prayerTimes && masjid) {
      await storageService.setLastNotificationScheduledDate('');
      const success = await notificationService.schedulePrayerNotifications(prayerTimes, masjid.name);
      if (!success) {
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
    return <LoadingSkeleton insets={insets} />;
  }

  const hijriDate = getHijriDate();
  const timeUntil = getTimeUntilPrayer();
  const progress = getProgressInfo();

  return (
    <View style={styles.container}>
      {/* ── Hero ── */}
      <LinearGradient
        colors={['#1a3a6b', '#0d2447', '#0a1f3d']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 16 }]}
      >
        {/* Gold radial glow */}
        <View style={styles.heroGlow} pointerEvents="none" />

        {/* Location */}
        <View style={styles.locationRow}>
          <View style={styles.locationDot} />
          <Text style={styles.locationText} numberOfLines={1}>
            {masjid?.name || 'Prayer Times'}
            {masjid?.city ? `  ·  ${masjid.city}` : ''}
          </Text>
        </View>

        {/* Date */}
        <Text style={styles.dateText}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {hijriDate ? `  ·  ${hijriDate}` : ''}
        </Text>

        {/* Next prayer */}
        {nextPrayer && (
          <>
            <Text style={styles.nextLabel}>Next Prayer</Text>
            <Text style={styles.nextPrayerName}>{nextPrayer.name}</Text>
            <Text style={styles.nextPrayerTime}>{nextPrayer.time.adhan12}</Text>
            {timeUntil ? (
              <View style={styles.countdownPill}>
                <Text style={styles.countdownText}>⏱ in {timeUntil}</Text>
              </View>
            ) : null}
          </>
        )}

        {/* Progress bar */}
        {nextPrayer && (
          <>
            <View style={styles.progressBarWrap}>
              <View style={[styles.progressBarFill, { width: `${progress.progress * 100}%` as any }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressLabel}>{progress.prevName} {progress.prevTime12}</Text>
              <Text style={styles.progressLabel}>{progress.nextName} {progress.nextTime12}</Text>
            </View>
          </>
        )}
      </LinearGradient>

      {/* ── Error banner ── */}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️  {error}</Text>
        </View>
      )}

      {/* ── Notification permission denied ── */}
      {notificationPermissionDenied && (
        <View style={styles.notifBanner}>
          <Text style={styles.notifBannerText} numberOfLines={2}>
            Notification permissions denied. Enable in Settings to receive prayer alerts.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={requestNotificationPermissions}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Prayer list ── */}
      {prayerTimes && (
        <>
          <Text style={styles.sectionLabel}>Today's Prayers</Text>
          <View style={styles.prayerList}>
            <PrayerCard name="Fajr"    time={prayerTimes.fajr}    isNext={nextPrayer?.name === 'Fajr'}    isAdhan={currentAdhanPrayer === 'Fajr'} />
            <PrayerCard name="Dhuhr"   time={prayerTimes.dhuhr}   isNext={nextPrayer?.name === 'Dhuhr'}   isAdhan={currentAdhanPrayer === 'Dhuhr'} />
            <PrayerCard name="Asr"     time={prayerTimes.asr}     isNext={nextPrayer?.name === 'Asr'}     isAdhan={currentAdhanPrayer === 'Asr'} />
            <PrayerCard name="Maghrib" time={prayerTimes.maghrib} isNext={nextPrayer?.name === 'Maghrib'} isAdhan={currentAdhanPrayer === 'Maghrib'} />
            <PrayerCard name="Isha"    time={prayerTimes.isha}    isNext={nextPrayer?.name === 'Isha'}    isAdhan={currentAdhanPrayer === 'Isha'} />
          </View>
        </>
      )}

      {/* ── Settings ── */}
      <View style={styles.settingsCard}>
        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingTitle}>Prayer Notifications</Text>
            <Text style={styles.settingDesc}>10 min before each prayer</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={toggleNotifications}
            trackColor={{ false: 'rgba(255,255,255,0.12)', true: '#34c759' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* ── Change Masjid ── */}
      <TouchableOpacity style={styles.changeMasjidBtn} onPress={changeMasjid}>
        <Text style={styles.changeMasjidText}>⇄  Change Masjid</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>v{Constants.expoConfig?.version || '1.3.1'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a3a6b',
  },

  // ── Hero ──
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 18,
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  locationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffc951',
    flexShrink: 0,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.2,
    flex: 1,
  },
  dateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '400',
    marginBottom: 14,
    letterSpacing: 0.1,
  },
  nextLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffc951',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  nextPrayerName: {
    fontSize: 42,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1.5,
    lineHeight: 46,
    marginBottom: 4,
  },
  nextPrayerTime: {
    fontSize: 20,
    fontWeight: '300',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  countdownPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,201,81,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,201,81,0.25)',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 0,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffc951',
    letterSpacing: 0.3,
  },
  progressBarWrap: {
    marginTop: 20,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 3,
    backgroundColor: '#ffc951',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '500',
  },

  // ── Banners ──
  errorBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(255,170,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,170,0,0.25)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#ffaa00',
    fontWeight: '500',
  },
  notifBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(255,80,80,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.2)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifBannerText: {
    fontSize: 12,
    color: '#ff5252',
    flex: 1,
    marginRight: 8,
  },
  retryBtn: {
    backgroundColor: 'rgba(255,80,80,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ff5252',
  },

  // ── Section label ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 6,
  },

  // ── Prayer list ──
  prayerList: {
    paddingHorizontal: 16,
  },

  // ── Card (base — normal) ──
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    position: 'relative',
    overflow: 'hidden',
  },
  cardNext: {
    borderWidth: 1,
    borderColor: 'rgba(96,145,255,0.3)',
  },
  cardAccentBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    backgroundColor: '#3d6ce8',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  // ── Prayer icon ──
  prayerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  prayerIconNext: {
    backgroundColor: 'rgba(96,145,255,0.15)',
  },
  prayerIconEmoji: {
    fontSize: 16,
  },

  // ── Prayer info ──
  prayerInfo: {
    flex: 1,
  },
  prayerName: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.2,
  },
  prayerSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '500',
    marginTop: 1,
  },

  // ── Times ──
  timesRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  timeCol: {
    alignItems: 'center',
    minWidth: 52,
  },
  timeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  timeDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 10,
    flexShrink: 0,
  },

  // ── Settings ──
  settingsCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    marginHorizontal: 16,
    marginTop: 10,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  settingDesc: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },

  // ── Change Masjid ──
  changeMasjidBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(96,145,255,0.3)',
    backgroundColor: 'rgba(96,145,255,0.08)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  changeMasjidText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6091ff',
  },

  // ── Version ──
  versionText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.15)',
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
});

export default PrayerTimesScreen;
