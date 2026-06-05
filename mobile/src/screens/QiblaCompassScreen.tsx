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
const { width } = Dimensions.get('window');

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

// ── Compass Ring with tick marks and cardinal labels ──────────────────────────
const CompassRing: React.FC<{ size: number; isAligned: boolean }> = ({ size, isAligned }) => {
  const radius = size / 2;
  // 18 ticks every 20° — alternating major/minor
  const ticks = Array.from({ length: 18 }, (_, i) => ({ deg: i * 20, major: i % 2 === 1 }));

  return (
    <View style={{ width: size, height: size, position: 'absolute' }}>
      {/* Outer ring */}
      <View
        style={{
          position: 'absolute', inset: 0, borderRadius: radius,
          borderWidth: 1,
          borderColor: isAligned ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.06)',
        }}
      />
      {/* Mid ring */}
      <View
        style={{
          position: 'absolute', top: 20, left: 20, right: 20, bottom: 20,
          borderRadius: radius - 20,
          borderWidth: 1,
          borderColor: isAligned ? 'rgba(52,211,153,0.08)' : 'rgba(255,255,255,0.04)',
        }}
      />

      {/* Tick marks */}
      {ticks.map(({ deg, major }) => {
        const rad = (deg * Math.PI) / 180;
        const tickLen = major ? 12 : 8;
        const tickW = major ? 1.5 : 1;
        const outerR = radius - 4;
        const innerR = outerR - tickLen;
        const x1 = radius + outerR * Math.sin(rad);
        const y1 = radius - outerR * Math.cos(rad);
        const x2 = radius + innerR * Math.sin(rad);
        const y2 = radius - innerR * Math.cos(rad);
        const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        return (
          <View
            key={deg}
            style={{
              position: 'absolute',
              width: length,
              height: tickW,
              backgroundColor: major ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)',
              left: x1,
              top: y1 - tickW / 2,
              transformOrigin: '0 50%',
              transform: [{ rotate: `${angle}deg` }],
            } as any}
          />
        );
      })}

      {/* Cardinal labels */}
      <Text style={[
        styles.cardinalN,
        { left: radius - 6, top: 6 },
        isAligned && { color: 'rgba(52,211,153,0.5)' },
      ]}>N</Text>
      <Text style={[styles.cardinalOther, { left: radius - 5, bottom: 6 }]}>S</Text>
      <Text style={[styles.cardinalOther, { right: 8, top: radius - 8 }]}>E</Text>
      <Text style={[styles.cardinalOther, { left: 8, top: radius - 8 }]}>W</Text>
    </View>
  );
};

// ── Main Screen ────────────────────────────────────────────────────────────────
const QiblaCompassScreen: React.FC = () => {
  const { isTablet } = useResponsive();
  const insets = useSafeAreaInsets();
  // Clearance for floating tab bar
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

  // Compass circle size
  const compassSize = Math.min(width * 0.72, isTablet ? 320 : 280);
  const arrowShaftHeight = Math.round(compassSize * 0.31);
  const arrowHeadBorder = Math.round(compassSize * 0.035);
  const arrowHeadHeight = Math.round(compassSize * 0.07);
  const arrowShaftWidth = Math.round(compassSize * 0.012);
  const centerCircle = Math.round(compassSize * 0.185);

  const arrowColor = isAligned ? '#34d399' : '#6091ff';
  const arrowGlow = isAligned ? 'rgba(52,211,153,0.5)' : 'rgba(96,145,255,0.5)';

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <LinearGradient
        colors={['#0a0f20', '#0d1a3a', '#08101e']}
        style={[styles.container, { paddingBottom: tabBarClearance }]}
      >
        <View style={styles.centered}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Text style={styles.loadingKaaba}>🕋</Text>
          </Animated.View>
          <Text style={styles.loadingText}>Finding Qibla direction...</Text>
        </View>
      </LinearGradient>
    );
  }

  // ── Permission denied ────────────────────────────────────────────────────────
  if (permissionDenied) {
    return (
      <LinearGradient
        colors={['#0a0f20', '#0d1a3a', '#08101e']}
        style={[styles.container, { paddingBottom: tabBarClearance }]}
      >
        <View style={styles.centered}>
          <Text style={styles.loadingKaaba}>📍</Text>
          <Text style={styles.permTitle}>Location Access Required</Text>
          <Text style={styles.permText}>
            Please enable location permissions in your device settings to use the Qibla compass.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={
        isAligned
          ? ['#0a0f20', '#0d2e1a', '#08101e']
          : ['#0a0f20', '#0d1a3a', '#08101e']
      }
      style={styles.container}
    >
      {/* Radial background glow */}
      <Animated.View
        style={[
          styles.bgRadial,
          {
            opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.07] }),
            backgroundColor: isAligned ? 'transparent' : 'transparent',
          },
        ]}
        pointerEvents="none"
      />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Qibla</Text>
        <View style={styles.locationRow}>
          <Animated.View
            style={[
              styles.locationDot,
              {
                backgroundColor: glowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['#6091ff', '#34d399'],
                }),
              },
            ]}
          />
          {locationName ? <Text style={styles.locationText}>{locationName}</Text> : null}
        </View>
        {needsCalibration && (
          <View style={styles.calibrationBanner}>
            <Text style={styles.calibrationText}>⚠️ Move in figure-8 to calibrate</Text>
          </View>
        )}
      </View>

      {/* ── Instruction ── */}
      <View style={styles.instruction}>
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

      {/* ── Compass area ── */}
      <View style={styles.compassArea}>
        <View style={{ width: compassSize, height: compassSize, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>

          {/* Static compass rings + tick marks + cardinals */}
          <CompassRing size={compassSize} isAligned={isAligned} />

          {/* Aligned glow behind arrow */}
          <Animated.View
            style={[
              styles.alignedGlow,
              {
                width: compassSize * 0.69,
                height: compassSize * 0.69,
                borderRadius: compassSize * 0.345,
                opacity: glowAnim,
              },
            ]}
            pointerEvents="none"
          />

          {/* Aligned badge above center */}
          {isAligned && (
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.alignedBadge}
            >
              <Text style={styles.alignedBadgeText}>✓ Facing Qibla</Text>
            </LinearGradient>
          )}

          {/* Rotating arrow */}
          <Animated.View
            style={[
              { width: compassSize, height: compassSize, position: 'absolute', alignItems: 'center', justifyContent: 'flex-start' },
              { transform: [{ rotate: pointerRotate }] },
            ]}
          >
            {/* Arrowhead tip */}
            <View
              style={{
                position: 'absolute',
                top: Math.round(compassSize * 0.03),
                width: 0,
                height: 0,
                borderLeftWidth: arrowHeadBorder,
                borderRightWidth: arrowHeadBorder,
                borderBottomWidth: arrowHeadHeight,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: arrowColor,
                shadowColor: arrowGlow,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 6,
              }}
            />
            {/* Shaft */}
            <View
              style={{
                position: 'absolute',
                top: Math.round(compassSize * 0.03) + arrowHeadHeight - 2,
                width: arrowShaftWidth,
                height: arrowShaftHeight,
                borderRadius: arrowShaftWidth / 2,
                backgroundColor: arrowColor,
                shadowColor: arrowGlow,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: 8,
                elevation: 4,
              }}
            />
            {/* Tail notch */}
            <View
              style={{
                position: 'absolute',
                bottom: Math.round(compassSize * 0.03),
                width: 0,
                height: 0,
                borderLeftWidth: arrowHeadBorder * 0.7,
                borderRightWidth: arrowHeadBorder * 0.7,
                borderTopWidth: arrowHeadHeight * 0.5,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: `${arrowColor}55`,
              }}
            />
          </Animated.View>

          {/* Kaaba center circle */}
          <View
            style={[
              styles.kaabaCenter,
              {
                width: centerCircle,
                height: centerCircle,
                borderRadius: centerCircle / 2,
              },
              isAligned && styles.kaabaCenterAligned,
            ]}
          >
            <Text style={styles.kaabaEmoji}>🕋</Text>
          </View>
        </View>
      </View>

      {/* ── Info cards ── */}
      {qiblaDirection != null && (
        <View style={[styles.infoRow, { paddingBottom: tabBarClearance + 16 }]}>
          <View style={[styles.infoCard, isAligned && styles.infoCardAligned]}>
            <Text style={[styles.infoValue, isAligned && styles.infoValueAligned]}>
              {Math.round(qiblaDirection)}°
            </Text>
            <Text style={styles.infoLabel}>Qibla Bearing</Text>
          </View>
          {distanceToKaaba != null && (
            <View style={[styles.infoCard, isAligned && styles.infoCardAligned]}>
              <Text style={[styles.infoValue, isAligned && styles.infoValueAligned]}>
                {distanceToKaaba.toFixed(0)}
              </Text>
              <Text style={styles.infoLabel}>km to Kaaba</Text>
            </View>
          )}
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  loadingKaaba: {
    fontSize: 56,
    marginBottom: 16,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    textAlign: 'center',
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  permText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 22,
  },

  bgRadial: {
    position: 'absolute',
    inset: 0,
    // radial effect via large shadow on a centered View isn't trivial in RN —
    // the LinearGradient background + glowAnim on compass provide the effect
  } as any,

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingTop: 56,
    paddingBottom: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  locationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  locationText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
  calibrationBanner: {
    marginTop: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  calibrationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
  },

  // ── Instruction ──────────────────────────────────────────────────────────────
  instruction: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 18,
    minHeight: 72,
    justifyContent: 'center',
  },
  instructionTurn: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  instructionSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  instructionAligned: {
    fontSize: 20,
    fontWeight: '700',
    color: '#34d399',
    textAlign: 'center',
  },
  instructionAlignedSub: {
    fontSize: 15,
    color: 'rgba(52,211,153,0.55)',
    marginTop: 4,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // ── Compass ──────────────────────────────────────────────────────────────────
  compassArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cardinal labels
  cardinalN: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(96,145,255,0.5)',
    letterSpacing: 0.5,
  },
  cardinalOther: {
    position: 'absolute',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 0.5,
  },

  alignedGlow: {
    position: 'absolute',
    backgroundColor: 'rgba(52,211,153,0.12)',
    shadowColor: '#34d399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 0,
  },
  alignedBadge: {
    position: 'absolute',
    top: -20,
    borderRadius: 100,
    paddingVertical: 8,
    paddingHorizontal: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 10,
  },
  alignedBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  kaabaCenter: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  kaabaCenterAligned: {
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderColor: 'rgba(52,211,153,0.15)',
  },
  kaabaEmoji: {
    fontSize: 22,
  },

  // ── Info cards ───────────────────────────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  infoCardAligned: {
    borderColor: 'rgba(52,211,153,0.15)',
  },
  infoValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.5,
  },
  infoValueAligned: {
    color: '#34d399',
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
});

export default QiblaCompassScreen;
