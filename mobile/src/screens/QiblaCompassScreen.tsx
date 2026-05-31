import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Alert,
  Dimensions,
  Easing,
  Platform,
} from 'react-native';
import CompassHeading from 'react-native-compass-heading';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useResponsive } from '../hooks/useResponsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// @ts-ignore
import geomagnetism from 'geomagnetism';

const IS_IOS = Platform.OS === 'ios';

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;
const { width, height } = Dimensions.get('window');

function calculateQiblaDirection(userLat: number, userLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(userLat);
  const lat2 = toRad(KAABA_LAT);
  const dLon = toRad(KAABA_LON - userLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function shortestAngle(from: number, to: number): number {
  let diff = (to - from) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

// Subtle compass rose — 8 spokes, barely visible, never rotates
const CompassRose: React.FC<{ size: number }> = ({ size }) => (
  <View style={[rosStyles.rose, { width: size, height: size, borderRadius: size / 2 }]}>
    {[0, 45, 90, 135].map((deg) => (
      <View
        key={deg}
        style={[rosStyles.spoke, { transform: [{ rotate: `${deg}deg` }], width: size * 0.9 }]}
      />
    ))}
    <View style={[rosStyles.outerRing, { width: size, height: size, borderRadius: size / 2 }]} />
    <View style={[rosStyles.innerRing, { width: size * 0.5, height: size * 0.5, borderRadius: size * 0.25 }]} />
  </View>
);

const rosStyles = StyleSheet.create({
  rose: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  spoke: { position: 'absolute', height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  outerRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  innerRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

const QiblaCompassScreen: React.FC = () => {
  const { isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  // Tab bar: 60pt pill + 10pt margin + insets.bottom
  const tabBarClearance = IS_IOS ? 60 + 10 + insets.bottom + 8 : 0;

  const [qiblaDirection, setQiblaDirection] = useState<number | null>(null);
  const [distanceToKaaba, setDistanceToKaaba] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [isAligned, setIsAligned] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const [degreesOff, setDegreesOff] = useState(0);

  const pointerAnim = useRef(new Animated.Value(0)).current;
  const pointerAccum = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const hasVibratedRef = useRef(false);
  const qiblaRef = useRef<number | null>(null);
  const declinationRef = useRef<number>(0);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    startPulse();
    initializeLocation();
    return () => {
      CompassHeading.stop();
    };
  }, []);

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  };

  const initializeLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;

      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode.length > 0) {
          const p = geocode[0];
          setLocationName(p.city || p.region || p.country || '');
        }
      } catch { /* non-critical */ }

      try {
        const model = geomagnetism.model();
        const { decl } = model.point([latitude, longitude]);
        declinationRef.current = decl ?? 0;
      } catch {
        declinationRef.current = 0;
      }

      const qibla = calculateQiblaDirection(latitude, longitude);
      const dist = calculateDistance(latitude, longitude, KAABA_LAT, KAABA_LON);
      qiblaRef.current = qibla;
      setQiblaDirection(qibla);
      setDistanceToKaaba(dist);
      setLoading(false);

      const onHeading = (trueHeading: number, acc: number) => {
        // iOS accuracy: 0–3 scale from CoreLocation (3 = best). Show banner if < 2.
        // Android: react-native-compass-heading hardcodes accuracy=1, so skip calibration check.
        setNeedsCalibration(IS_IOS ? acc < 2 : false);

        const qibla = qiblaRef.current;
        if (qibla === null) return;

        const offset = shortestAngle(trueHeading, qibla);
        setDegreesOff(Math.round(offset));

        const newPointer = pointerAccum.current + shortestAngle(pointerAccum.current, offset);
        pointerAccum.current = newPointer;

        Animated.timing(pointerAnim, {
          toValue: newPointer,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();

        const aligned = Math.abs(offset) < 5;
        setIsAligned(aligned);

        if (aligned && !hasVibratedRef.current) {
          hasVibratedRef.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          Animated.timing(glowAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        } else if (!aligned && hasVibratedRef.current) {
          hasVibratedRef.current = false;
          Animated.timing(glowAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
        }
      };

      // Both platforms: react-native-compass-heading gives magnetic heading from
      // TYPE_ACCELEROMETER + TYPE_MAGNETIC_FIELD with screen-rotation compensation.
      // We apply WMM declination ourselves to convert magnetic → true heading.
      // This is consistent across iOS and Android and avoids expo-location's
      // unreliable trueHeading on Android (which depends on GPS lock and omits
      // screen-rotation correction).
      CompassHeading.start(3, ({ heading: magHeading, accuracy: acc }: { heading: number; accuracy: number }) => {
        const trueHeading = ((magHeading + declinationRef.current) % 360 + 360) % 360;
        onHeading(trueHeading, acc);
      });
    } catch (error) {
      console.error('Error initializing compass:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to initialize compass. Please try again.');
    }
  };

  const pointerRotate = pointerAnim.interpolate({
    inputRange: [-1440, 1440],
    outputRange: ['-1440deg', '1440deg'],
    extrapolate: 'extend',
  });

  // Arrow sized at 65% of screen width, capped
  const arrowSize = Math.min(width * 0.65, isTablet ? 300 : 260);
  const roseSize = arrowSize * 1.3;

  // Arrow proportions — bigger head, thicker shaft
  const headBorder = Math.round(arrowSize * 0.12);  // ~31px on standard phone
  const headHeight = Math.round(arrowSize * 0.26);  // ~68px
  const shaftWidth = Math.round(arrowSize * 0.07);  // ~18px
  const shaftHeight = Math.round(arrowSize * 0.38); // ~99px
  const headTopOffset = Math.round(arrowSize * 0.08);
  const shaftTopOffset = headTopOffset + headHeight - 4;

  if (loading) {
    return (
      <LinearGradient colors={['#0A0E27', '#1a1f3a', '#0A0E27']} style={styles.container}>
        <View style={styles.centered}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={styles.loadingEmoji}>🕋</Text>
          </Animated.View>
          <Text style={styles.loadingText}>Finding Qibla direction...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (permissionDenied) {
    return (
      <LinearGradient colors={['#0A0E27', '#1a1f3a', '#0A0E27']} style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.loadingEmoji}>📍</Text>
          <Text style={styles.errorTitle}>Location Access Required</Text>
          <Text style={styles.errorText}>
            Please enable location permissions in your device settings to use the Qibla compass.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  const arrowColor = isAligned ? '#34D399' : '#10B981';

  return (
    <LinearGradient
      colors={isAligned ? ['#0A0E27', '#0d2e1a', '#0A0E27'] : ['#0A0E27', '#1a1f3a', '#0A0E27']}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Qibla</Text>
        {locationName ? <Text style={styles.location}>📍 {locationName}</Text> : null}
        {needsCalibration && (
          <View style={styles.calibrationBanner}>
            <Text style={styles.calibrationText}>⚠️ Move in figure-8 to calibrate</Text>
          </View>
        )}
      </View>

      {/* Turn instruction — above the arrow so user reads direction before looking at arrow */}
      <View style={styles.instructionBox}>
        {isAligned ? (
          <>
            <Text style={styles.instructionAligned}>You are facing the Qibla</Text>
            <Text style={styles.instructionAlignedSub}>Allahu Akbar</Text>
          </>
        ) : (
          <>
            <Text style={styles.instructionTurn}>
              Turn {degreesOff > 0 ? 'right' : 'left'} {Math.abs(degreesOff)}°
            </Text>
            <Text style={styles.instructionSub}>
              {degreesOff > 0 ? 'Rotate clockwise ↻' : 'Rotate counter-clockwise ↺'}
            </Text>
          </>
        )}
      </View>

      {/* Arrow + compass rose */}
      <View style={styles.arrowSection}>

        {/* Aligned badge */}
        {isAligned && (
          <View style={styles.alignedBadge}>
            <LinearGradient colors={['#10B981', '#059669']} style={styles.alignedBadgeGradient}>
              <Text style={styles.alignedBadgeText}>✓ Facing Qibla</Text>
            </LinearGradient>
          </View>
        )}

        {/* Compass rose (static — never rotates) */}
        <CompassRose size={roseSize} />

        {/* Glow behind arrow when aligned */}
        <Animated.View
          style={[
            styles.glowCircle,
            { width: arrowSize * 0.7, height: arrowSize * 0.7, borderRadius: arrowSize * 0.35, opacity: glowAnim },
          ]}
        />

        {/* The rotating arrow */}
        <Animated.View
          style={[
            styles.arrowContainer,
            { width: arrowSize, height: arrowSize },
            { transform: [{ rotate: pointerRotate }] },
          ]}
        >
          {/* Arrowhead — tip at top */}
          <View
            style={[
              styles.arrowHead,
              {
                top: headTopOffset,
                borderLeftWidth: headBorder,
                borderRightWidth: headBorder,
                borderBottomWidth: headHeight,
                borderBottomColor: arrowColor,
              },
            ]}
          />
          {/* Shaft */}
          <View
            style={[
              styles.arrowShaft,
              {
                top: shaftTopOffset,
                width: shaftWidth,
                height: shaftHeight,
                backgroundColor: arrowColor,
                borderRadius: shaftWidth / 2,
              },
            ]}
          />
          {/* Tail notch */}
          <View
            style={[
              styles.arrowTail,
              {
                bottom: Math.round(arrowSize * 0.08),
                borderLeftWidth: headBorder * 0.7,
                borderRightWidth: headBorder * 0.7,
                borderTopWidth: headHeight * 0.5,
                borderTopColor: `${arrowColor}55`,
              },
            ]}
          />
        </Animated.View>
      </View>

      {/* Info cards — paddingBottom clears the floating tab bar */}
      {qiblaDirection != null && (
        <View style={[styles.bearingRow, { paddingBottom: tabBarClearance }]}>
          <View style={styles.bearingCard}>
            <Text style={styles.bearingValue}>{Math.round(qiblaDirection)}°</Text>
            <Text style={styles.bearingLabel}>Qibla bearing</Text>
          </View>
          {distanceToKaaba != null && (
            <View style={styles.bearingCard}>
              <Text style={styles.bearingValue}>{distanceToKaaba.toFixed(0)}</Text>
              <Text style={styles.bearingLabel}>km to Kaaba</Text>
            </View>
          )}
        </View>
      )}

    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  loadingEmoji: { fontSize: 64, marginBottom: 20, textAlign: 'center' },
  loadingText: { fontSize: 18, color: '#9CA3AF', textAlign: 'center' },
  errorTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16, textAlign: 'center' },
  errorText: { fontSize: 16, color: '#9CA3AF', textAlign: 'center', lineHeight: 24 },

  header: { paddingTop: 56, paddingBottom: 12, alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1, marginBottom: 4 },
  location: { fontSize: 14, color: '#9CA3AF', marginBottom: 2 },
  calibrationBanner: {
    marginTop: 8,
    backgroundColor: 'rgba(245,158,11,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
  },
  calibrationText: { fontSize: 12, fontWeight: '600', color: '#FFFFFF' },

  arrowSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  alignedBadge: {
    position: 'absolute',
    top: -8,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    zIndex: 10,
  },
  alignedBadgeGradient: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 },
  alignedBadgeText: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },

  glowCircle: {
    position: 'absolute',
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 0,
  },

  arrowContainer: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'relative',
  },
  arrowHead: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowShaft: {
    position: 'absolute',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  arrowTail: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  instructionBox: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 8,
    minHeight: 70,
    justifyContent: 'center',
  },
  instructionTurn: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  instructionSub: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 5,
    textAlign: 'center',
  },
  instructionAligned: {
    fontSize: 22,
    fontWeight: '700',
    color: '#34D399',
    textAlign: 'center',
  },
  instructionAlignedSub: {
    fontSize: 16,
    color: 'rgba(52,211,153,0.6)',
    marginTop: 5,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  bearingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingBottom: 12,
  },
  bearingCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  bearingValue: { fontSize: 26, fontWeight: '700', color: '#FFFFFF' },
  bearingLabel: { fontSize: 11, color: '#6B7280', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  footer: { paddingBottom: 24, alignItems: 'center' },
  footerText: { fontSize: 12, color: '#374151' },
});

export default QiblaCompassScreen;
