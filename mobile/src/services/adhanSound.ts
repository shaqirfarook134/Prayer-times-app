import { Audio } from 'expo-av';
import { PrayerTimes } from '../types';

class AdhanSoundService {
  private sound: Audio.Sound | null = null;
  private checkIntervals: NodeJS.Timeout[] = [];
  private currentAdhanPrayer: string | null = null;
  private adhanEndTimeout: NodeJS.Timeout | null = null;

  // Initialize audio mode
  async initialize() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });
      console.log('🔊 Adhan sound service initialized');
    } catch (error) {
      console.error('Error initializing adhan sound:', error);
    }
  }

  // Load the adhan sound file
  private async loadSound(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.unloadAsync();
      }

      // Load the adhan sound
      // TODO: Replace with actual adhan MP3 - for now using a notification bell sound
      const { sound } = await Audio.Sound.createAsync(
        // This is a simple beep sound - replace with assets/adhan.mp3 when available
        { uri: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZTA0PVqzn77BhGgU7k9nyw3gpBSl+zPLaizsIGGS65+ijUBELTKXh8bllHAU5jtLyz4A2Bhxx' },
        { shouldPlay: false, volume: 1.0 }
      );

      this.sound = sound;
      console.log('🔊 Adhan sound loaded (using placeholder bell - add assets/adhan.mp3 for custom adhan)');
    } catch (error) {
      console.error('Error loading adhan sound:', error);
    }
  }

  // Play adhan sound
  async playAdhan(prayerName: string): Promise<void> {
    try {
      await this.loadSound();

      if (this.sound) {
        this.currentAdhanPrayer = prayerName;
        await this.sound.playAsync();
        console.log(`🔊 Playing adhan for ${prayerName}`);

        // Auto-stop after 1 minute
        if (this.adhanEndTimeout) {
          clearTimeout(this.adhanEndTimeout);
        }
        this.adhanEndTimeout = setTimeout(() => {
          this.stopAdhan();
        }, 60000); // 1 minute
      }
    } catch (error) {
      console.error('Error playing adhan sound:', error);
    }
  }

  // Stop adhan sound
  async stopAdhan(): Promise<void> {
    try {
      if (this.sound) {
        await this.sound.stopAsync();
        await this.sound.unloadAsync();
        this.sound = null;
        console.log('🔊 Adhan sound stopped');
      }

      this.currentAdhanPrayer = null;

      if (this.adhanEndTimeout) {
        clearTimeout(this.adhanEndTimeout);
        this.adhanEndTimeout = null;
      }
    } catch (error) {
      console.error('Error stopping adhan sound:', error);
    }
  }

  // Get currently playing prayer (for UI blinking)
  getCurrentAdhanPrayer(): string | null {
    return this.currentAdhanPrayer;
  }

  // Schedule adhan time checks
  scheduleAdhanChecks(prayerTimes: PrayerTimes): void {
    // Clear existing intervals
    this.clearSchedule();

    const prayers = [
      { name: 'Fajr', time: prayerTimes.fajr.adhan },
      { name: 'Dhuhr', time: prayerTimes.dhuhr.adhan },
      { name: 'Asr', time: prayerTimes.asr.adhan },
      { name: 'Maghrib', time: prayerTimes.maghrib.adhan },
      { name: 'Isha', time: prayerTimes.isha.adhan },
    ];

    // Check every second if it's time for adhan
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentSeconds = now.getSeconds();

      // Only trigger at exactly :00 seconds to avoid multiple triggers
      if (currentSeconds === 0) {
        for (const prayer of prayers) {
          if (prayer.time === currentTime) {
            console.log(`🕌 Adhan time reached for ${prayer.name} at ${currentTime}`);
            this.playAdhan(prayer.name);
            break;
          }
        }
      }
    }, 1000);

    this.checkIntervals.push(interval);
    console.log('⏰ Adhan time checks scheduled');
  }

  // Clear all scheduled checks
  clearSchedule(): void {
    this.checkIntervals.forEach(interval => clearInterval(interval));
    this.checkIntervals = [];
    this.stopAdhan();
  }

  // Cleanup
  async cleanup(): Promise<void> {
    this.clearSchedule();
    if (this.sound) {
      await this.sound.unloadAsync();
      this.sound = null;
    }
  }
}

export default new AdhanSoundService();
