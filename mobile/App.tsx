import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from './src/types';
import MasjidSelectionScreen from './src/screens/MasjidSelectionScreen';
import PrayerTimesScreen from './src/screens/PrayerTimesScreen';
import notificationService from './src/services/notifications';

const Stack = createStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    // Request notification permissions on app start
    notificationService.requestPermissions();

    // Add notification listeners
    const receivedSubscription = notificationService.addNotificationReceivedListener(
      (notification) => {
        console.log('Notification received:', notification);
      }
    );

    const responseSubscription = notificationService.addNotificationResponseReceivedListener(
      (response) => {
        console.log('Notification tapped:', response);
      }
    );

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, []);

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="MasjidSelection" component={MasjidSelectionScreen} />
        <Stack.Screen name="PrayerTimes" component={PrayerTimesScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
