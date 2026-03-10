import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, Masjid } from '../types';
import apiService from '../services/api';
import storageService from '../services/storage';
import notificationService from '../services/notifications';

type MasjidSelectionScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'MasjidSelection'
>;

interface Props {
  navigation: MasjidSelectionScreenNavigationProp;
}

const MasjidSelectionScreen: React.FC<Props> = ({ navigation }) => {
  const [masjids, setMasjids] = useState<Masjid[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMasjids();
    checkExistingSelection();
  }, []);

  // Auto-refresh when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadMasjids();
    }, [])
  );

  const checkExistingSelection = async () => {
    const selectedId = await storageService.getSelectedMasjidId();
    if (selectedId) {
      // Navigate directly to prayer times if already selected
      navigation.replace('PrayerTimes', { masjidId: selectedId });
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

  const handleMasjidSelect = async (masjid: Masjid) => {
    try {
      // Save selected masjid
      await storageService.setSelectedMasjidId(masjid.id);

      // Register device for notifications
      await notificationService.registerDevice(masjid.id);

      // Navigate to prayer times
      navigation.replace('PrayerTimes', { masjidId: masjid.id });
    } catch (err) {
      console.error('Error selecting masjid:', err);
      // Continue navigation even if notification registration fails
      navigation.replace('PrayerTimes', { masjidId: masjid.id });
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMasjids();
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading masjids...</Text>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Your Masjid</Text>
        <Text style={styles.subtitle}>Choose the masjid to receive prayer times</Text>
      </View>

      <FlatList
        data={masjids}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.masjidCard}
            onPress={() => handleMasjidSelect(item)}
          >
            <Text style={styles.masjidName}>{item.name}</Text>
            <Text style={styles.masjidLocation}>
              {item.city}, {item.state}
            </Text>
          </TouchableOpacity>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
      />
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
  listContent: {
    padding: 16,
  },
  masjidCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
});

export default MasjidSelectionScreen;
