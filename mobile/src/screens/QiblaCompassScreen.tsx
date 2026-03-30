import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Alert,
  Dimensions,
  TouchableOpacity,
  Easing,
} from 'react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useResponsive } from '../hooks/useResponsive';

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;
const { width } = Dimensions.get('window');

// ─── Math helpers ────────────────────────────────────────────────────────────

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

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
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

/** Normalize angle to [-180, 180] */
function normalizeAngle(angle: number): number {
  let a = angle % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  return a;
}

/** Return shortest-path difference between two accumulated rotation values */
function shortestRotation(current: number, target: number): number {
  const diff = normalizeAngle(target - current);
  return current + diff;
}

function getCardinalDirection(degrees: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const KaabaIcon: React.FC<{ size: number; aligned: boolean }> = ({ size, aligned }) => (
  <View style={[styles.kaabaContainer, { width: size, height: size }]}>
    <View style={[styles.kaabaBody, { width: size * 0.7, height: size * 0.7 }]}>
      <View style={[styles.kaabaGoldBand, { top: size * 0.25 }]} />
      <View style={[styles.kaabaDoor, { width: size * 0.15, height: size * 0.25 }]} />
    </View>
    {aligned && (
      <View style={[styles.kaabaGlow, { width: size * 1.2, height: size * 1.2 }]} />
    )}
  </View>
);

const IslamicPattern: React.FC = () => (
  <View style={styles.patternContainer}>
    {[...Array(8)].map((_, i) => (
      <View key={i} style={[styles.patternLine, { transform: [{ rotate: `${i * 45}deg` }] }]} />
    ))}
  </View>
);

// ─── Main screen ─────────────────────────────────────────────────────────────

const QiblaCompassScreen: React.FC = () => {
  const { isTablet } = useResponsive();

  const [qiblaDirection, setQiblaDirection] = useState<number | null>(null);
  const [distanceToKaaba, setDistanceToKaaba] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [isAligned, setIsAligned] = useState(false);
  const [hasVibratedForAlignment, setHasVibratedForAlignment] = useState(false);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const [displayHeading, setDisplayHeading] = useState(0);

  // Accumulated rotation values to avoid wrap-around jumps
  const compassAccum = useRef(0);
  const qiblaAccum = useRef(0);
  const compassAnim = useRef(new Animated.Value(0)).current;
  const qiblaAnim = useRef(new Animated.Value(0)).current;
  const alignmentScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const kaabaScale = useRef(new Animated.Value(0.8)).current;

  const headingSubscription = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    startPulseAnimation();
    initializeCompass();
    return () => {
      headingSubscription.current?.remove();
    };
  }, []);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  };

  const initializeCompass = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude: userLat, longitude: userLon } = location.coords;

      // Reverse geocode
      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude: userLat, longitude: userLon });
        if (geocode.length > 0) {
          const p = geocode[0];
          setLocationName(p.city || p.region || p.country || '');
        }
      } catch {
        // non-critical
      }

      const qibla = calculateQiblaDirection(userLat, userLon);
      const dist = calculateDistance(userLat, userLon, KAABA_LAT, KAABA_LON);
      setQiblaDirection(qibla);
      setDistanceToKaaba(dist);
      setLoading(false);

      Animated.spring(kaabaScale, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }).start();

      // Use platform native heading — far more accurate than raw magnetometer
      headingSubscription.current = await Location.watchHeadingAsync((headingData) => {
        // trueHeading is best; fall back to magHeading
        const raw = headingData.trueHeading >= 0 ? headingData.trueHeading : headingData.magHeading;
        const accuracy = headingData.accuracy; // 0-3 on iOS (3=best), -1=unavailable
        setNeedsCalibration(accuracy !== undefined && accuracy < 2 && accuracy >= 0);
        updateCompass(raw, qibla);
      });
    } catch (error) {
      console.error('Error initializing compass:', error);
      setLoading(false);
      Alert.alert('Error', 'Failed to initialize compass. Please try again.');
    }
  };

  const updateCompass = useCallback((heading: number, qibla: number) => {
    setDisplayHeading(Math.round(heading));

    // Compass rose rotates opposite to heading so N always points north
    const targetCompass = shortestRotation(compassAccum.current, -heading);
    compassAccum.current = targetCompass;

    // Qibla arrow points at (qibla - heading) from the top of the screen
    const rawQibla = qibla - heading;
    const targetQibla = shortestRotation(qiblaAccum.current, rawQibla);
    qiblaAccum.current = targetQibla;

    Animated.timing(compassAnim, {
      toValue: targetCompass,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    Animated.timing(qiblaAnim, {
      toValue: targetQibla,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    // Alignment check
    const offset = normalizeAngle(qibla - heading);
    const aligned = Math.abs(offset) < 5;
    setIsAligned(aligned);

    if (aligned) {
      if (!hasVibratedForAlignment) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setHasVibratedForAlignment(true);
      }
      Animated.spring(alignmentScale, { toValue: 1.15, friction: 5, useNativeDriver: true }).start();
      Animated.timing(glowOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else {
      setHasVibratedForAlignment(false);
      Animated.spring(alignmentScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
      Animated.timing(glowOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [hasVibratedForAlignment]);

  // Compass rotation as deg string
  const compassRotateDeg = compassAnim.interpolate({
    inputRange: [-720, 720],
    outputRange: ['-720deg', '720deg'],
    extrapolate: 'extend',
  });
  const qiblaRotateDeg = qiblaAnim.interpolate({
    inputRange: [-720, 720],
    outputRange: ['-720deg', '720deg'],
    extrapolate: 'extend',
  });

  const offset = normalizeAngle((qiblaDirection ?? 0) - displayHeading);
  const compassSize = isTablet ? 400 : Math.min(width * 0.75, 320);

  if (loading) {
    return (
      <LinearGradient colors={['#0A0E27', '#1a1f3a', '#0A0E27']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={[styles.loadingEmoji, isTablet && { fontSize: 80 }]}>🕋</Text>
          </Animated.View>
          <Text style={[styles.loadingText, isTablet && { fontSize: 20 }]}>
            Finding Qibla direction...
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (permissionDenied) {
    return (
      <LinearGradient colors={['#0A0E27', '#1a1f3a', '#0A0E27']} style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorEmoji, isTablet && { fontSize: 80 }]}>📍</Text>
          <Text style={[styles.errorTitle, isTablet && { fontSize: 28 }]}>
            Location Access Required
          </Text>
          <Text style={[styles.errorText, isTablet && { fontSize: 18 }]}>
            Please enable location permissions in your device settings to use the Qibla compass.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={isAligned ? ['#0A0E27', '#1a3a2a', '#0A0E27'] : ['#0A0E27', '#1a1f3a', '#0A0E27']}
      style={styles.container}
    >
      {/* Background pattern */}
      <View style={styles.backgroundPattern}>
        <IslamicPattern />
      </View>

      {/* Header */}
      <View style={[styles.header, isTablet && styles.headerTablet]}>
        <Text style={[styles.title, isTablet && { fontSize: 36 }]}>Qibla Compass</Text>
        <View style={styles.locationContainer}>
          {locationName ? (
            <Text style={[styles.locationText, isTablet && { fontSize: 18 }]}>📍 {locationName}</Text>
          ) : null}
          {distanceToKaaba != null && (
            <Text style={[styles.distance, isTablet && { fontSize: 16 }]}>
              {distanceToKaaba.toFixed(0)} km to Kaaba
            </Text>
          )}
        </View>
        {needsCalibration && (
          <TouchableOpacity
            style={styles.calibrationBanner}
            onPress={() => Alert.alert(
              'Calibrate Compass',
              'Move your phone in a figure-8 pattern to improve accuracy.',
              [{ text: 'OK' }]
            )}
          >
            <Text style={styles.calibrationBannerText}>⚠️ Move in figure-8 to calibrate</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Compass */}
      <View style={styles.compassContainer}>
        {isAligned && (
          <Animated.View
            style={[
              styles.alignmentBadge,
              isTablet && styles.alignmentBadgeTablet,
              { transform: [{ scale: alignmentScale }] },
            ]}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.alignmentBadgeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={[styles.alignmentBadgeText, isTablet && { fontSize: 20 }]}>
                ✓ Facing Qibla
              </Text>
            </LinearGradient>
          </Animated.View>
        )}

        <View style={[styles.compass, { width: compassSize, height: compassSize }]}>
          {/* Outer glow ring when aligned */}
          <Animated.View
            style={[
              styles.compassGlowRing,
              { width: compassSize + 20, height: compassSize + 20, opacity: glowOpacity },
            ]}
          />

          {/* Compass background ring */}
          <View style={[styles.compassRing, { width: compassSize, height: compassSize }]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
              style={[styles.compassRingGradient, { width: compassSize, height: compassSize, borderRadius: compassSize / 2 }]}
            />
          </View>

          {/* Rotating compass rose — spins opposite to heading so N stays pointing north */}
          <Animated.View
            style={[
              styles.compassRotating,
              { width: compassSize, height: compassSize },
              { transform: [{ rotate: compassRotateDeg }] },
            ]}
          >
            {/* Cardinal labels */}
            <View style={[styles.cardinalMark, styles.northMark, { top: isTablet ? 15 : 10 }]}>
              <View style={styles.northBackground}>
                <Text style={[styles.cardinalText, styles.northText, isTablet && { fontSize: 24 }]}>N</Text>
              </View>
            </View>
            <View style={[styles.cardinalMark, styles.eastMark, { right: isTablet ? 15 : 10 }]}>
              <Text style={[styles.cardinalText, isTablet && { fontSize: 20 }]}>E</Text>
            </View>
            <View style={[styles.cardinalMark, styles.southMark, { bottom: isTablet ? 15 : 10 }]}>
              <Text style={[styles.cardinalText, isTablet && { fontSize: 20 }]}>S</Text>
            </View>
            <View style={[styles.cardinalMark, styles.westMark, { left: isTablet ? 15 : 10 }]}>
              <Text style={[styles.cardinalText, isTablet && { fontSize: 20 }]}>W</Text>
            </View>

            {/* Tick marks at 30° intervals */}
            {[30, 60, 120, 150, 210, 240, 300, 330].map((deg) => (
              <View key={deg} style={[styles.degreeMark, { transform: [{ rotate: `${deg}deg` }] }]}>
                <View style={[styles.degreeMarkLine, { height: isTablet ? 20 : 15, width: isTablet ? 3 : 2 }]} />
              </View>
            ))}
          </Animated.View>

          {/* Qibla arrow — always points toward Mecca */}
          <Animated.View
            style={[
              styles.qiblaArrowContainer,
              { transform: [{ rotate: qiblaRotateDeg }, { scale: kaabaScale }] },
            ]}
          >
            {/* Arrowhead tip */}
            <View style={styles.qiblaArrowTip} />
            {/* Arrow shaft */}
            <View style={[styles.qiblaLine, isTablet && { height: 100 }]} />
            {/* Kaaba icon at arrow end */}
            <View style={{ marginTop: -40 }}>
              <KaabaIcon size={isTablet ? 60 : 45} aligned={isAligned} />
            </View>
          </Animated.View>

          {/* Center dot */}
          <View style={[styles.centerDot, isTablet && { width: 24, height: 24 }]}>
            <LinearGradient
              colors={['#FFFFFF', '#E5E7EB']}
              style={[styles.centerDotGradient, isTablet && { width: 24, height: 24, borderRadius: 12 }]}
            />
          </View>
        </View>

        {/* Heading readout */}
        <View style={[styles.headingInfo, isTablet && { marginTop: 48 }]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
            style={styles.headingInfoGradient}
          >
            <Text style={[styles.headingDegrees, isTablet && { fontSize: 56 }]}>
              {displayHeading}°
            </Text>
            <Text style={[styles.headingDirection, isTablet && { fontSize: 24 }]}>
              {getCardinalDirection(displayHeading)}
            </Text>
          </LinearGradient>
        </View>
      </View>

      {/* Instructions */}
      <View style={[styles.instructionsContainer, isTablet && { paddingHorizontal: 60 }]}>
        {isAligned ? (
          <View style={styles.alignedContainer}>
            <Text style={[styles.instructionText, styles.alignedText, isTablet && { fontSize: 20 }]}>
              ✓ You are facing the Qibla direction
            </Text>
            <Text style={[styles.alignedSubtext, isTablet && { fontSize: 16 }]}>
              Perfect alignment
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.instructionText, isTablet && { fontSize: 18 }]}>
              {`Rotate ${offset > 0 ? 'clockwise' : 'counter-clockwise'}`}
            </Text>
            <Text style={[styles.instructionSubtext, isTablet && { fontSize: 16 }]}>
              {Math.abs(Math.round(offset))}° {offset > 0 ? 'to the right' : 'to the left'}
            </Text>
          </>
        )}
      </View>

      {/* Footer */}
      <View style={[styles.footer, isTablet && { paddingBottom: 40 }]}>
        <Text style={[styles.footerText, isTablet && { fontSize: 16 }]}>
          💡 Hold device flat and away from metal objects
        </Text>
      </View>
    </LinearGradient>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundPattern: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.03,
  },
  patternContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  patternLine: {
    position: 'absolute',
    width: width * 2,
    height: 1,
    backgroundColor: '#FFFFFF',
  },
  header: { paddingTop: 60, paddingBottom: 20, alignItems: 'center' },
  headerTablet: { paddingTop: 80, paddingBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  locationContainer: { alignItems: 'center', marginTop: 4 },
  locationText: { fontSize: 16, color: '#FFFFFF', fontWeight: '600', marginBottom: 4 },
  distance: { fontSize: 14, color: '#9CA3AF' },
  calibrationBanner: {
    marginTop: 10,
    backgroundColor: 'rgba(245,158,11,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  calibrationBannerText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  compassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  alignmentBadge: {
    position: 'absolute',
    top: 20,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 10,
  },
  alignmentBadgeTablet: { borderRadius: 32 },
  alignmentBadgeGradient: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  alignmentBadgeText: { fontSize: 16, fontWeight: 'bold', color: '#FFFFFF' },
  compass: { justifyContent: 'center', alignItems: 'center', position: 'relative' },
  compassGlowRing: {
    position: 'absolute',
    borderRadius: 1000,
    backgroundColor: 'transparent',
    borderWidth: 4,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  compassRing: {
    position: 'absolute',
    borderRadius: 1000,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  compassRingGradient: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(17,24,39,0.8)',
  },
  compassRotating: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardinalMark: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  northMark: { top: 10 },
  northBackground: { backgroundColor: 'rgba(239,68,68,0.3)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  eastMark: { right: 10 },
  southMark: { bottom: 10 },
  westMark: { left: 10 },
  cardinalText: { fontSize: 18, fontWeight: 'bold', color: '#9CA3AF' },
  northText: { color: '#FFFFFF' },
  degreeMark: { position: 'absolute', width: '100%', height: '100%', alignItems: 'center' },
  degreeMarkLine: { backgroundColor: '#374151' },
  qiblaArrowContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qiblaArrowTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#10B981',
    marginBottom: -2,
  },
  qiblaLine: {
    width: 3,
    height: 80,
    backgroundColor: '#10B981',
    borderRadius: 2,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  kaabaContainer: { justifyContent: 'center', alignItems: 'center', position: 'relative' },
  kaabaBody: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  kaabaGoldBand: { position: 'absolute', width: '100%', height: '20%', backgroundColor: '#D4AF37' },
  kaabaDoor: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#B8860B',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  kaabaGlow: {
    position: 'absolute',
    borderRadius: 1000,
    backgroundColor: 'transparent',
    borderWidth: 3,
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  centerDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  centerDotGradient: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(31,41,55,0.5)',
  },
  headingInfo: { marginTop: 32, alignItems: 'center' },
  headingInfoGradient: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headingDegrees: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headingDirection: { fontSize: 20, color: '#9CA3AF', marginTop: 4 },
  instructionsContainer: { paddingHorizontal: 40, paddingVertical: 24, alignItems: 'center' },
  alignedContainer: { alignItems: 'center' },
  instructionText: { fontSize: 16, color: '#FFFFFF', textAlign: 'center', fontWeight: '600' },
  instructionSubtext: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
  alignedText: { color: '#10B981', fontSize: 18 },
  alignedSubtext: { fontSize: 14, color: '#6EE7B7', marginTop: 6 },
  footer: { paddingBottom: 24, alignItems: 'center', paddingHorizontal: 20 },
  footerText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingEmoji: { fontSize: 64, marginBottom: 20 },
  loadingText: { fontSize: 18, color: '#9CA3AF' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  errorEmoji: { fontSize: 64, marginBottom: 20 },
  errorTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 16, textAlign: 'center' },
  errorText: { fontSize: 16, color: '#9CA3AF', textAlign: 'center', lineHeight: 24 },
});

export default QiblaCompassScreen;
