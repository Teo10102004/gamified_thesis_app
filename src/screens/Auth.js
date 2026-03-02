import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; 
import PulsingBackground from '../components/PulsingBackground';
// --- NEW API SERVICE IMPORT ---
// We removed the direct Supabase import and are now using our separated backend service!
import { signUpUser, signInUser } from '../services/authService'; 

const NEON_PINK = '#FF00FF'; //defining as constant so that we can change the color if we want to in the future
const NEON_BLUE = '#00FFFF'; 
const DARK_BG = '#000000'; 
const TEXR_COLOR = '#FFFFFF'; 

// Added { navigation } to the props so we can route the user to Setup after signing up!
export default function Auth({ navigation }) { 
    const [email, setEmail] = useState(''); 
    const [password, setPassword] = useState(''); 
    const [loading, setLoading] = useState(false); // State variable to indicate whether the sign-in process is ongoing
    const [isLogin, setIsLogin] = useState(true); // State variable to toggle between login and sign-up modes

    const handleAuth = async () => { 
        if (!email || !password) {
            Alert.alert("Hold on!", "Please enter both email and password.");
            return;
        }

        setLoading(true); // Set loading to true to indicate that the authentication process has started

        try {
            if (isLogin) { 
                // --- SEPARATED LOGIN LOGIC ---
                // We just call our service. It handles the Supabase complexity.
                await signInUser(email, password); 
                Alert.alert('Success', 'Logged in successfully!'); 
                
                // TODO: Send existing users straight to the main app here!
            } else {
                // --- SEPARATED SIGNUP LOGIC ---
                await signUpUser(email, password); 
                Alert.alert('Success', 'Account created! Please check Mailtrap to confirm your email.'); 
                
                // Route new users to the awesome RPG Character Setup screen!
                navigation.navigate('Setup');
            }
        } catch (error) {
            Alert.alert('Authentication Error', error.message); // Show an error alert if there is an error
        } finally {
            setLoading(false); // Set loading to false when finished, regardless of success or failure
        }
    };

    //pushes the content up when the keyboard is open, and ensures that the content is scrollable when the keyboard is open
    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}> 
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                
                <View style={styles.headerContainer}>
                    <PulsingBackground color={isLogin ? NEON_PINK : NEON_BLUE} /> 
                    
                    <Ionicons name="game-controller-outline" size={100} color={isLogin ? NEON_PINK : NEON_BLUE} style={styles.iconStyle} /> 
                    
                    <Text style={styles.headerText}>{isLogin ? 'Welcome Back!' : 'Create an Account'}</Text> 
                </View>

                <View style={styles.formContainer}>
                    <TextInput
                        style={styles.input}
                        onChangeText={setEmail}
                        value={email}
                        placeholder="Email"
                        placeholderTextColor="rgba(255, 255, 255, 0.7)" 
                        autoCapitalize="none" 
                        keyboardType="email-address" 
                    />
                    <TextInput
                        style={styles.input}
                        onChangeText={setPassword}
                        value={password}
                        secureTextEntry={true} 
                        placeholder="Password"
                        placeholderTextColor="rgba(255, 255, 255, 0.7)" 
                        autoCapitalize="none" 
                    />
                </View>

                <TouchableOpacity onPress={handleAuth} style={styles.button} disabled={loading}> 
                    <Text style={styles.buttonText}>
                        {loading ? 'Processing...' : (isLogin ? 'Log In' : 'Sign Up')}
                    </Text> 
                </TouchableOpacity>
                    
                <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.toggleButton}>
                    <Text style={styles.toggleButtonText}>{isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}</Text> 
                    <Text style={{color: isLogin ? NEON_PINK : NEON_BLUE, fontWeight: 'bold'}}>{isLogin ? "Sign Up" : "Log In"}</Text> 
                </TouchableOpacity>

            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1, 
        backgroundColor: DARK_BG, 
    },
    scrollContainer: {
        flexGrow: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: 20, 
    },
    headerContainer: {
        alignItems: 'center', 
        marginBottom: 40, 
        position: 'relative', 
    },
    iconStyle: {
        textShadowColor: NEON_PINK, 
        textShadowOffset: { width: 0, height: 0 }, 
        textShadowRadius: 30, 
    },
    headerText: {
        color: TEXR_COLOR, 
        fontSize: 24, 
        textAlign: 'center', 
        marginTop: 20, 
        fontWeight: 'bold', 
    },
    formContainer: {
        marginBottom: 20, 
        width: '100%', 
    },
    input: {
        backgroundColor: 'transparent', 
        paddingVertical: 12, 
        paddingHorizontal: 15, 
        borderBottomColor: NEON_BLUE, 
        borderBottomWidth: 1, 
        marginBottom: 20, 
        fontSize: 16, 
        color: TEXR_COLOR, 
    },
    toggleButton: {
        paddingVertical: 12, 
        borderRadius: 5, 
        borderColor: NEON_PINK, 
        borderWidth: 1, 
        alignItems: 'center', 
        width: '100%', // Added width to ensure it matches your previous layout
        marginBottom: 10,
    },
    toggleButtonText: {
        color: TEXR_COLOR, 
        fontSize: 14, 
        marginBottom: 5, 
        fontWeight: 'bold', 
    },
    button: {
        backgroundColor: NEON_PINK, 
        paddingVertical: 12, 
        paddingHorizontal: 20, 
        borderRadius: 5, 
        alignItems: 'center', 
        width: '100%', // Match form width
        shadowOffset: { width: 0, height: 2 }, 
        shadowOpacity: 0.3, 
        shadowRadius: 4, 
        elevation: 5, 
        marginBottom: 20, 
    },
    buttonText: {
        color: TEXR_COLOR, 
        fontSize: 16, 
        fontWeight: 'bold', 
    },
});