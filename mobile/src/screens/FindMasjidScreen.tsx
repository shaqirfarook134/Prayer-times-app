import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
  RefreshControl,
  Alert,
  AppState,
  Linking,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabParamList, RootStackParamList, Masjid } from '../types';
import apiService from '../services/api';
import storageService from '../services/storage';
import notificationService from '../services/notifications';
import { useResponsive } from '../hooks/useResponsive';

// Composite type gives access to both tab methods AND root stack methods
// so we can push PrayerTimesBrowse onto the root stack directly.
type FindMasjidScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'FindMasjid'>,
  StackNavigationProp<RootStackParamList>
>;

interface Props {
  navigation: FindMasjidScreenNavigationProp;
}

interface MasjidWithDistance extends Masjid {
  distance?: number;
}

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

// ── Shimmer ────────────────────────────────────────────────────────────────────
const ShimmerBox: React.FC<{ width: number | string; height: number; borderRadius?: number; style?: object }> = ({
  width, height, borderRadius = 10, style,
}) => {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.04, 0.10] });
  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: '#fff', opacity }, style]}
    />
  );
};

const LoadingSkeleton: React.FC = () => (
  <>
    {/* Section label shimmer */}
    <ShimmerBox width={110} height={10} borderRadius={4} style={{ margin: 18, marginBottom: 10 }} />
    {/* Card shimmers */}
    {[150, 170, 140, 160, 130].map((w, i) => (
      <View key={i} style={styles.shimmerCard}>
        <ShimmerBox width={44} height={44} borderRadius={14} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <ShimmerBox width={w} height={14} style={{ marginBottom: 6 }} />
          <ShimmerBox width={100} height={11} style={{ marginBottom: 5 }} />
          <ShimmerBox width={75} height={11} />
        </View>
      </View>
    ))}
  </>
);

// ── Masjid Card ────────────────────────────────────────────────────────────────
const MasjidCard: React.FC<{
  masjid: MasjidWithDistance;
  isSelected: boolean;
  isNearby: boolean;
  onPress: () => void;
}> = ({ masjid, isSelected, isNearby, onPress }) => {
  const formatDistance = (distance?: number): string => {
    if (distance === undefined) return '';
    if (distance < 1) return `${(distance * 1000).toFixed(0)}m away`;
    return `${distance.toFixed(1)}km away`;
  };

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={styles.cardOuter}>
      {/* Blue left accent bar for selected */}
      {isSelected && (
        <LinearGradient
          colors={['#6091ff', '#3d6ce8']}
          style={styles.selectedAccentBar}
        />
      )}

      {/* Card background */}
      {isSelected ? (
        <LinearGradient
          colors={['rgba(26,62,140,0.5)', 'rgba(20,45,100,0.6)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cardInner, styles.cardInnerSelected, isNearby && styles.cardInnerNearby]}
        >
          <CardContent masjid={masjid} isSelected={isSelected} isNearby={isNearby} formatDistance={formatDistance} />
        </LinearGradient>
      ) : (
        <View style={[styles.cardInner, isNearby && styles.cardInnerNearby]}>
          <CardContent masjid={masjid} isSelected={isSelected} isNearby={isNearby} formatDistance={formatDistance} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const CardContent: React.FC<{
  masjid: MasjidWithDistance;
  isSelected: boolean;
  isNearby: boolean;
  formatDistance: (d?: number) => string;
}> = ({ masjid, isSelected, isNearby, formatDistance }) => (
  <View style={styles.cardRow}>
    {/* Mosque icon */}
    <View style={[
      styles.masjidIcon,
      isSelected && styles.masjidIconSelected,
      isNearby && !isSelected && styles.masjidIconNearby,
    ]}>
      <Text style={styles.masjidIconEmoji}>🕌</Text>
    </View>

    {/* Text info */}
    <View style={styles.cardText}>
      <Text style={[styles.masjidName, isSelected && styles.masjidNameSelected]} numberOfLines={1}>
        {masjid.name}
      </Text>
      <Text style={styles.masjidLocation}>{masjid.city}, {masjid.state}</Text>
      {masjid.distance !== undefined && (
        <Text style={[styles.masjidDistance, isNearby && styles.masjidDistanceNearby]}>
          {formatDistance(masjid.distance)}
        </Text>
      )}
    </View>

    {/* Right badge */}
    <View style={styles.cardRight}>
      {isSelected ? (
        <>
          <LinearGradient colors={['#3d6ce8', '#6091ff']} style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeCheck}>✓</Text>
          </LinearGradient>
          <Text style={styles.selectedLabel}>My Masjid</Text>
        </>
      ) : isNearby ? (
        <View style={styles.nearbyBadge}>
          <Text style={styles.nearbyBadgeText}>📍 Nearby</Text>
        </View>
      ) : null}
    </View>
  </View>
);

// ── Main Screen ────────────────────────────────────────────────────────────────
const FindMasjidScreen: React.FC<Props> = ({ navigation }) => {
  const { isTablet } = useResponsive();
  const insets = useSafeAreaInsets();

  const [masjids, setMasjids] = useState<MasjidWithDistance[]>([]);
  const [nearbyMasjids, setNearbyMasjids] = useState<MasjidWithDistance[]>([]);
  const [otherMasjids, setOtherMasjids] = useState<MasjidWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [locationName, setLocationName] = useState<string>('');
  const [selectedMasjidId, setSelectedMasjidId] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [notifOsBlocked, setNotifOsBlocked] = useState(false);
  const [notifInAppOff, setNotifInAppOff] = useState(false);
  const [hasMasjid, setHasMasjid] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const savedScrollOffset = useRef<number>(0);
  const returningFromBrowse = useRef<boolean>(false);

  useEffect(() => {
    requestLocationPermission();
    loadMasjids();

    // Re-check notification status whenever app comes back to foreground
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') checkNotifStatus();
    });
    return () => subscription.remove();
  }, []);

  const checkNotifStatus = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      const osGranted = status === 'granted';
      setNotifOsBlocked(!osGranted);
      const masjidId = await storageService.getSelectedMasjidId();
      setHasMasjid(!!masjidId && masjidId !== 0);
      if (osGranted) {
        const inAppEnabled = await storageService.getNotificationsEnabled();
        setNotifInAppOff(!inAppEnabled);
      } else {
        setNotifInAppOff(false); // OS banner takes priority
      }
    } catch { /* non-critical */ }
  };

  useFocusEffect(
    React.useCallback(() => {
      storageService.getSelectedMasjidId().then((id) => setSelectedMasjidId(id));
      checkNotifStatus();
      if (returningFromBrowse.current) {
        // Restore scroll position after returning from a masjid browse
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({ offset: savedScrollOffset.current, animated: false });
        }, 0);
      } else {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      }
      returningFromBrowse.current = false;
    }, [])
  );

  useEffect(() => {
    if (userLocation && masjids.length > 0) {
      calculateDistances();
    }
  }, [userLocation, masjids]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setLocationPermission(true);
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation(location);
        try {
          const geocode = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
          if (geocode.length > 0) {
            const p = geocode[0];
            setLocationName(p.city || p.region || p.country || '');
          }
        } catch { /* non-critical */ }
      } else {
        Alert.alert(
          'Location Permission',
          'Enable location to find nearby masjids. You can still browse all masjids.',
          [{ text: 'OK' }]
        );
      }
    } catch (err) {
      console.error('Error requesting location permission:', err);
    }
  };

  const loadMasjids = async () => {
    try {
      setError(null);
      const data = await apiService.getMasjids();
      setMasjids(data);
    } catch (err) {
      setError('Failed to load masjids. Please check your connection.');
      console.error('Error loading masjids:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const calculateDistances = () => {
    if (!userLocation) return;
    const masjidsWithDistance = masjids.map((masjid) => {
      if (masjid.latitude && masjid.longitude) {
        const distance = calculateDistance(
          userLocation.coords.latitude,
          userLocation.coords.longitude,
          masjid.latitude,
          masjid.longitude
        );
        return { ...masjid, distance };
      }
      return masjid;
    });
    const sorted = masjidsWithDistance.sort((a, b) => {
      if (a.distance === undefined) return 1;
      if (b.distance === undefined) return -1;
      return a.distance - b.distance;
    });
    setNearbyMasjids(sorted.filter((m) => m.distance !== undefined && m.distance <= 50));
    setOtherMasjids(sorted.filter((m) => m.distance === undefined || m.distance > 50));
  };

  const handleMasjidSelect = async (masjid: Masjid) => {
    if (isSelecting) return;
    setIsSelecting(true);
    try {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch { /* ignore */ }
      // Remember we're going into browse mode so we can restore scroll on return
      returningFromBrowse.current = true;
      // Push PrayerTimesBrowse onto the ROOT stack — this gives native iOS swipe-back
      // that returns to the tabs (FindMasjid active) rather than another prayer screen.
      navigation.navigate('PrayerTimesBrowse', { masjidId: masjid.id });
    } catch (err) {
      console.error('Error selecting masjid:', err);
    } finally {
      setIsSelecting(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMasjids();
    if (locationPermission) requestLocationPermission();
  };

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error && !loading) {
    return (
      <View style={styles.errorContainer}>
        <LinearGradient colors={['#1a3a6b', '#0d2447', '#0a1f3d']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Find Your Masjid</Text>
          <Text style={styles.headerSubtitle}>Tap to view prayer times — set default from there</Text>
        </LinearGradient>
        <View style={styles.errorBody}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Couldn't Load Masjids</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadMasjids}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Combined list data with section headers ──────────────────────────────────
  type ListItem =
    | { type: 'header'; title: string }
    | { type: 'masjid'; masjid: MasjidWithDistance };

  const listData: ListItem[] = [];
  if (loading) {
    // Render nothing — header renders shimmer via ListHeaderComponent
  } else {
    if (nearbyMasjids.length > 0) {
      listData.push({ type: 'header', title: 'Nearby Masjids' });
      nearbyMasjids.forEach((m) => listData.push({ type: 'masjid', masjid: m }));
    }
    if (otherMasjids.length > 0) {
      listData.push({
        type: 'header',
        title: nearbyMasjids.length > 0 ? 'Other Masjids' : 'All Masjids',
      });
      otherMasjids.forEach((m) => listData.push({ type: 'masjid', masjid: m }));
    }
    if (!loading && nearbyMasjids.length === 0 && otherMasjids.length === 0 && masjids.length > 0) {
      listData.push({ type: 'header', title: 'All Masjids' });
      masjids.forEach((m) => listData.push({ type: 'masjid', masjid: m }));
    }
  }

  return (
    <View style={styles.container}>
      {/* Fixed header — always visible, never scrolls */}
      <LinearGradient colors={['#1a3a6b', '#0d2447', '#0a1f3d']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, isTablet && { fontSize: 36 }]}>
          Find Your Masjid
        </Text>
        <Text style={styles.headerSubtitle}>
          Tap to view prayer times — set default from there
        </Text>
        {locationPermission && (
          <View style={styles.locationPill}>
            <View style={styles.locationDot} />
            <Text style={styles.locationPillText}>
              {locationName ? `${locationName} · Location active` : 'Location active'}
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* ── OS notifications blocked banner ── */}
      {hasMasjid && notifOsBlocked && (
        <View style={styles.notifBanner}>
          <View style={styles.notifBannerLeft}>
            <Text style={styles.notifBannerTitle}>Reminders are blocked by iOS</Text>
            <Text style={styles.notifBannerDesc}>Go to Settings to allow notifications</Text>
          </View>
          <TouchableOpacity style={styles.notifBannerBtn} onPress={() => Linking.openSettings()}>
            <Text style={styles.notifBannerBtnText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── In-app reminders off banner ── */}
      {hasMasjid && !notifOsBlocked && notifInAppOff && (
        <View style={styles.remindersOffBanner}>
          <View style={styles.notifBannerLeft}>
            <Text style={styles.remindersOffTitle}>Reminders are off</Text>
            <Text style={styles.remindersOffDesc}>You won't be notified before prayers</Text>
          </View>
          <TouchableOpacity
            style={styles.remindersOffBtn}
            onPress={async () => {
              await storageService.setNotificationsEnabled(true);
              await notificationService.requestPermissions();
              setNotifInAppOff(false);
            }}
          >
            <Text style={styles.remindersOffBtnText}>Turn on</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={loading ? [] : listData}
        keyExtractor={(item, index) =>
          item.type === 'header' ? `header-${index}` : `masjid-${item.masjid.id}`
        }
        ListHeaderComponent={loading ? <LoadingSkeleton /> : null}
        onScroll={(e) => { savedScrollOffset.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <Text style={styles.sectionLabel}>{item.title}</Text>;
          }
          const m = item.masjid;
          const isNearby = m.distance !== undefined && m.distance <= 10;
          return (
            <MasjidCard
              masjid={m}
              isSelected={m.id === selectedMasjidId}
              isNearby={isNearby}
              onPress={() => handleMasjidSelect(m)}
            />
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="rgba(255,255,255,0.3)"
          />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      />

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d14',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '400',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    marginTop: 14,
  },
  locationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34c759',
  },
  locationPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },

  // ── Section label ────────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },

  // ── Cards ────────────────────────────────────────────────────────────────────
  cardOuter: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  selectedAccentBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3,
    borderRadius: 3,
    zIndex: 2,
  },
  cardInner: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 18,
    padding: 16,
    paddingLeft: 18,
  },
  cardInnerSelected: {
    borderColor: 'rgba(96,145,255,0.35)',
    shadowColor: '#000032',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 6,
  },
  cardInnerNearby: {
    borderColor: 'rgba(52,199,89,0.2)',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  masjidIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  masjidIconSelected: {
    backgroundColor: 'rgba(96,145,255,0.15)',
  },
  masjidIconNearby: {
    backgroundColor: 'rgba(52,199,89,0.10)',
  },
  masjidIconEmoji: {
    fontSize: 20,
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  masjidName: {
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.2,
  },
  masjidNameSelected: {
    color: '#fff',
  },
  masjidLocation: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
    fontWeight: '500',
  },
  masjidDistance: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6091ff',
    marginTop: 3,
  },
  masjidDistanceNearby: {
    color: '#34c759',
  },
  cardRight: {
    flexShrink: 0,
    alignItems: 'center',
  },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3d6ce8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  selectedBadgeCheck: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  selectedLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6091ff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  nearbyBadge: {
    backgroundColor: 'rgba(52,199,89,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.25)',
    borderRadius: 100,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  nearbyBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#34c759',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Shimmer card shell ───────────────────────────────────────────────────────
  shimmerCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  // ── Error state ──────────────────────────────────────────────────────────────
  errorContainer: {
    flex: 1,
    backgroundColor: '#0d0d14',
  },
  errorBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  retryBtn: {
    backgroundColor: 'rgba(96,145,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(96,145,255,0.3)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6091ff',
  },

  // ── Notification banners ──────────────────────────────────────────────────────
  notifBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(255,80,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.2)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifBannerLeft: {
    flex: 1,
  },
  notifBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff5252',
    marginBottom: 2,
  },
  notifBannerDesc: {
    fontSize: 12,
    color: 'rgba(255,82,82,0.7)',
    fontWeight: '400',
  },
  notifBannerBtn: {
    backgroundColor: 'rgba(255,80,80,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,80,80,0.28)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  notifBannerBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff5252',
  },
  remindersOffBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: 'rgba(255,159,10,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.22)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  remindersOffTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff9f0a',
    marginBottom: 2,
  },
  remindersOffDesc: {
    fontSize: 12,
    color: 'rgba(255,159,10,0.7)',
    fontWeight: '400',
  },
  remindersOffBtn: {
    backgroundColor: 'rgba(255,159,10,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.3)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  remindersOffBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ff9f0a',
  },

});

export default FindMasjidScreen;
