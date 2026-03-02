import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';


import Auth from './src/screens/Auth'; 
import Setup from './src/screens/Setup';

const Stack = createNativeStackNavigator(); // Create a stack navigator for handling screen navigation

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Auth" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={Auth} /> 
        <Stack.Screen name="Setup" component={Setup} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({ // Define styles for the App component using StyleSheet.create.
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
