// API Types
export interface Masjid {
  id: number;
  name: string;
  url: string;
  city: string;
  state: string;
  timezone: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
}

export interface PrayerTime {
  adhan: string;
  iqama: string;
  adhan12: string;
  iqama12: string;
}

export interface PrayerTimes {
  masjid_id: number;
  date: string;
  fajr: PrayerTime;
  dhuhr: PrayerTime;
  asr: PrayerTime;
  maghrib: PrayerTime;
  isha: PrayerTime;
}

export interface Prayer {
  name: string;
  time: PrayerTime;
}

export interface RegisterDeviceRequest {
  token: string;
  platform: 'ios' | 'android';
  masjid_id?: number;
  notifications_enabled: boolean;
}

export interface UpdateDeviceRequest {
  masjid_id?: number;
  notifications_enabled?: boolean;
}

// Local Storage Types
export interface AppStorage {
  selectedMasjidId: number | null;
  notificationsEnabled: boolean;
  cachedPrayerTimes: Record<number, PrayerTimes>; // masjidId -> PrayerTimes
  deviceToken: string | null;
}

// Navigation Types
import { NavigatorScreenParams } from '@react-navigation/native';

// Root stack: tabs + PrayerTimesBrowse as a full-screen overlay.
// Swipe-back on PrayerTimesBrowse pops it off the root stack → tabs resume
// with FindMasjid active (the screen the user navigated from).
export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<TabParamList> | undefined;
  PrayerTimesBrowse: { masjidId: number };
};

export type TabParamList = {
  FindMasjid: undefined;
  PrayerTimes: { masjidId: number } | undefined;
  QiblaCompass: undefined;
};
