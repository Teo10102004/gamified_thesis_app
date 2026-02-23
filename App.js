import 'react-native-url-polyfill/auto';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import Auth from './components/Auth'; // Import the Auth component from the components/Auth.js file

export default function App() {
  return (
    <View style={styles.container}>
      <Auth /> {/* Render the Auth component to display the authentication UI, */}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({ // Define styles for the App component using StyleSheet.create.
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
