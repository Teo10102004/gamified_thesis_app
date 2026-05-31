import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ThemeProvider } from './src/context/ThemeContext'; // Import the ThemeProvider to wrap the app and provide theme context to all components
import { SafeAreaProvider } from 'react-native-safe-area-context';

import Auth from './src/screens/Auth'; 
import Setup from './src/screens/Setup';
import Home from './src/screens/Home';
import QuizScreen from './src/screens/QuizScreen';
import QuestSetup from './src/screens/QuestSetup';
import QuizDashboard from './src/screens/QuizDashboard'; 
import FlashcardDashboard from './src/screens/FlashcardDashboard'; // Added for the new module
import FlashcardSetup from './src/screens/FlashcardSetup'; 
import FlashcardStudy from './src/screens/FlashcardStudy'; 
import ProfileSettings from './src/screens/ProfileSettings'; // The new Command Center!
import LibraryDashboard from './src/screens/LibraryDashboard'; // Learning Sessions — Knowledge Vault
import FolderView from './src/screens/FolderView';             // Learning Sessions — Folder contents
import ReadingSession from './src/screens/ReadingSession';     // Learning Sessions — Active reading mode
import CommunityFeed from './src/screens/CommunityFeed';       // Community — Leaderboard + Activity Feed
import FriendsDashboard from './src/screens/FriendsDashboard';
import ChatScreen from './src/screens/ChatScreen';
import AdminDashboard from './src/screens/AdminDashboard';
import NotificationsScreen from './src/screens/NotificationsScreen';

const Stack = createNativeStackNavigator(); // Create a stack navigator for handling screen navigation

export default function App() {
  return (
    <SafeAreaProvider> 
      <ThemeProvider> 
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Auth" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Auth" component={Auth} /> 
            <Stack.Screen name="Setup" component={Setup} />
            <Stack.Screen name="Home" component={Home} />
            <Stack.Screen name="QuizScreen" component={QuizScreen} />
            <Stack.Screen name="QuestSetup" component={QuestSetup} />
            <Stack.Screen name="QuizDashboard" component={QuizDashboard} />
            <Stack.Screen name="FlashcardDashboard" component={FlashcardDashboard} />
            <Stack.Screen name="FlashcardSetup" component={FlashcardSetup} />
            <Stack.Screen name="FlashcardStudy" component={FlashcardStudy} />
            <Stack.Screen name="ProfileSettings" component={ProfileSettings} />
            <Stack.Screen name="LibraryDashboard" component={LibraryDashboard} />
            <Stack.Screen name="FolderView" component={FolderView} />
            <Stack.Screen name="ReadingSession" component={ReadingSession} />
            <Stack.Screen name="CommunityFeed" component={CommunityFeed} />
            <Stack.Screen name="FriendsDashboard" component={FriendsDashboard} />
            <Stack.Screen name="ChatScreen" component={ChatScreen} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
            <Stack.Screen name="NotificationsScreen" component={NotificationsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ // Define styles for the App component using StyleSheet.create.
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
