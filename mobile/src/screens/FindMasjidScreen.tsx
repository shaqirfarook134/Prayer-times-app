import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CommonActions } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { RootStackParamList, Masjid } from '../types';
import apiService from '../services/api';
import storageService from '../services/storage';
import notificationService from '../services/notifications';
import { useResponsive } from '../hooks/useResponsive';

type FindMasjidScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'MasjidSelection'
>;

interface Props {
  navigation: FindMasjidScreenNavigationProp;
}

interface MasjidWithDistance extends Masjid {
  distance?: number; // in kilometers
}

// Haversine formula to calculate distance between two coordinates
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
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

const toRad = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

const FindMasjidScreen: React.FC<Props> = ({ navigation }) => {
  const { isTablet } = useResponsive();
  const [masjids, setMasjids] = useState<MasjidWithDistance[]>([]);
  const [nearbyMasjids, setNearbyMasjids] = useState<MasjidWithDistance[]>([]);
  const [otherMasjids, setOtherMasjids] = useState<MasjidWithDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [selectedMasjidId, setSelectedMasjidId] = useState<number | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Animation values
  const successOpacity = useRef(new Animated.Value(0)).current;
  const successTranslateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    requestLocationPermission();
    loadMasjids();
    loadSelectedMasjidId();
  }, []);

  const loadSelectedMasjidId = async () => {
    const selectedId = await storageService.getSelectedMasjidId();
    setSelectedMasjidId(selectedId);
  };

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
        console.log('📍 User location:', location.coords.latitude, location.coords.longitude);
      } else {
        console.log('⚠️  Location permission denied');
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
      console.log('🌐 Fetching masjids from API...');
      const data = await apiService.getMasjids();
      setMasjids(data);
      console.log('✅ Masjids loaded:', data.length);
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

    // Sort by distance
    const sorted = masjidsWithDistance.sort((a, b) => {
      if (a.distance === undefined) return 1;
      if (b.distance === undefined) return -1;
      return a.distance - b.distance;
    });

    // Split into nearby (within 50km) and other
    const nearby = sorted.filter((m) => m.distance !== undefined && m.distance <= 50);
    const other = sorted.filter((m) => m.distance === undefined || m.distance > 50);

    setNearbyMasjids(nearby);
    setOtherMasjids(other);
  };

  const showSuccessMessage = (message: string) => {
    setSuccessMessage(message);

    // Animate in
    Animated.parallel([
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(successTranslateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Animate out after delay
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(successTranslateY, {
          toValue: -20,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSuccessMessage(null);
      });
    }, 2000);
  };

  const handleMasjidSelect = async (masjid: Masjid) => {
    if (isSelecting) return; // Prevent double-tap

    setIsSelecting(true);

    try {
      // Haptic feedback
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.warn('Haptics not available');
      }

      // Update UI immediately
      setSelectedMasjidId(masjid.id);

      // Show success message
      showSuccessMessage(`✓ ${masjid.name} set as your default masjid`);

      // Save selected masjid
      await storageService.setSelectedMasjidId(masjid.id);

      // Register device for notifications
      await notificationService.registerDevice(masjid.id);

      // Wait for visual feedback before navigating
      setTimeout(() => {
        // Navigate to Prayer Times tab
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [
              {
                name: 'MainTabs',
                state: {
                  routes: [
                    { name: 'FindMasjid' },
                    { name: 'PrayerTimes', params: { masjidId: masjid.id } },
                    { name: 'QiblaCompass' },
                  ],
                  index: 1, // Set Prayer Times tab as active
                },
              },
            ],
          })
        );
      }, 800);
    } catch (err) {
      console.error('Error selecting masjid:', err);
      setIsSelecting(false);
      // Continue navigation even if notification registration fails
      setTimeout(() => {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [
              {
                name: 'MainTabs',
                state: {
                  routes: [
                    { name: 'FindMasjid' },
                    { name: 'PrayerTimes', params: { masjidId: masjid.id } },
                    { name: 'QiblaCompass' },
                  ],
                  index: 1, // Set Prayer Times tab as active
                },
              },
            ],
          })
        );
      }, 800);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMasjids();
    if (locationPermission) {
      requestLocationPermission();
    }
  };

  const formatDistance = (distance?: number): string => {
    if (distance === undefined) return '';
    if (distance < 1) {
      return `${(distance * 1000).toFixed(0)}m away`;
    }
    return `${distance.toFixed(1)}km away`;
  };

  const renderMasjidCard = (masjid: MasjidWithDistance) => {
    const isSelected = masjid.id === selectedMasjidId;
    return (
      <TouchableOpacity
        key={masjid.id}
        style={[
          dynamicStyles.masjidCard,
          isSelected && styles.selectedCard,
        ]}
        onPress={() => handleMasjidSelect(masjid)}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardTextContainer}>
            <Text style={dynamicStyles.masjidName}>{masjid.name}</Text>
            <Text style={dynamicStyles.masjidLocation}>
              {masjid.city}, {masjid.state}
            </Text>
            {masjid.distance !== undefined && (
              <Text style={dynamicStyles.distanceText}>{formatDistance(masjid.distance)}</Text>
            )}
          </View>
          {isSelected ? (
            <View style={styles.selectedBadgeContainer}>
              <View style={[styles.checkmarkContainer, isTablet && { width: 48, height: 48 }]}>
                <Text style={[styles.checkmark, isTablet && { fontSize: 28 }]}>✓</Text>
              </View>
              <Text style={[styles.defaultLabel, isTablet && { fontSize: 14 }]}>Default</Text>
            </View>
          ) : (
            masjid.distance !== undefined && masjid.distance <= 10 && (
              <View style={styles.nearbyBadge}>
                <Text style={styles.nearbyBadgeText}>📍 Nearby</Text>
              </View>
            )
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Finding masjids...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadMasjids}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Dynamic styles for iPad
  const dynamicStyles = StyleSheet.create({
    container: {
      ...styles.container,
    },
    header: {
      ...styles.header,
      padding: isTablet ? 32 : 20,
      paddingTop: isTablet ? 80 : 60,
    },
    title: {
      ...styles.title,
      fontSize: isTablet ? 36 : 28,
    },
    subtitle: {
      ...styles.subtitle,
      fontSize: isTablet ? 20 : 16,
    },
    sectionHeader: {
      ...styles.sectionHeader,
      fontSize: isTablet ? 24 : 20,
      padding: isTablet ? 24 : 16,
      paddingBottom: isTablet ? 12 : 8,
    },
    masjidCard: {
      ...styles.masjidCard,
      padding: isTablet ? 28 : 20,
      marginHorizontal: isTablet ? 24 : 16,
      borderRadius: isTablet ? 16 : 12,
    },
    masjidName: {
      ...styles.masjidName,
      fontSize: isTablet ? 22 : 18,
    },
    masjidLocation: {
      ...styles.masjidLocation,
      fontSize: isTablet ? 16 : 14,
    },
    distanceText: {
      ...styles.distanceText,
      fontSize: isTablet ? 15 : 13,
    },
  });

  return (
    <View style={dynamicStyles.container}>
      <View style={dynamicStyles.header}>
        <Text style={dynamicStyles.title}>Find Your Masjid</Text>
        <Text style={dynamicStyles.subtitle}>
          {locationPermission
            ? 'Masjids sorted by distance from your location'
            : 'Browse all available masjids'}
        </Text>
      </View>

      <FlatList
        data={[...nearbyMasjids, ...otherMasjids]}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item, index }) => {
          const isFirstOther = index === nearbyMasjids.length && otherMasjids.length > 0;
          return (
            <>
              {index === 0 && nearbyMasjids.length > 0 && (
                <Text style={dynamicStyles.sectionHeader}>Nearby Masjids</Text>
              )}
              {isFirstOther && (
                <Text style={dynamicStyles.sectionHeader}>
                  {nearbyMasjids.length > 0 ? 'Other Masjids' : 'All Masjids'}
                </Text>
              )}
              {renderMasjidCard(item)}
            </>
          );
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
      />

      {/* Success Toast */}
      {successMessage && (
        <Animated.View
          style={[
            styles.successToast,
            isTablet && styles.successToastTablet,
            {
              opacity: successOpacity,
              transform: [{ translateY: successTranslateY }],
            },
          ]}
        >
          <Text style={[styles.successText, isTablet && { fontSize: 18 }]}>
            {successMessage}
          </Text>
        </Animated.View>
      )}
    </View>
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
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    backgroundColor: '#F5F5F5',
    padding: 16,
    paddingBottom: 8,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
  masjidCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
  },
  masjidName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  masjidLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  distanceText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  nearbyBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  nearbyBadgeText: {
    color: '#2E7D32',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#D32F2F',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedCard: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  selectedBadgeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkmarkContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  checkmark: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  defaultLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 4,
  },
  successToast: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  successToastTablet: {
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 16,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default FindMasjidScreen;
