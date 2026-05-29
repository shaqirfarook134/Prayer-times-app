import { Dimensions, Platform } from 'react-native';
import { useState, useEffect } from 'react';

export interface ResponsiveConfig {
  isTablet: boolean;
  isIPad: boolean;
  screenWidth: number;
  screenHeight: number;
  orientation: 'portrait' | 'landscape';
}

/**
 * Hook to detect device type and screen dimensions
 * Used for iPad/tablet-optimized layouts
 */
export const useResponsive = (): ResponsiveConfig => {
  const [config, setConfig] = useState<ResponsiveConfig>(() => {
    const { width, height } = Dimensions.get('window');
    const isTablet = Math.min(width, height) >= 600; // iPad mini and larger
    const isIPad = Platform.OS === 'ios' && isTablet;

    return {
      isTablet,
      isIPad,
      screenWidth: width,
      screenHeight: height,
      orientation: width > height ? 'landscape' : 'portrait',
    };
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const { width, height } = window;
      const isTablet = Math.min(width, height) >= 600;
      const isIPad = Platform.OS === 'ios' && isTablet;

      setConfig({
        isTablet,
        isIPad,
        screenWidth: width,
        screenHeight: height,
        orientation: width > height ? 'landscape' : 'portrait',
      });
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  return config;
};
