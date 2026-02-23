import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../supabase'; 
import { Ionicons } from '@expo/vector-icons'; 
import PulsingBackground from './PulsingBackground';


const NEON_PINK = '#FF00FF'; //defining as constant so that we can change the color if the background color if we want to in the future, and also to make the code more readable by giving a descriptive name to the color value.
const NEON_BLUE = '#00FFFF'; //defining as constant so that we can change the color if the background color if we want to in the future, and also to make the code more readable by giving a descriptive name to the color value.
const DARK_BG = '#000000'; //defining as constant so that we can change the color if the background color if we want to in the future, and also to make the code more readable by giving a descriptive name to the color value.
const TEXR_COLOR = '#FFFFFF'; //defining as constant so that we can change the color if the background color if we want to in the future, and also to make the code more readable by giving a descriptive name to the color value.





export default function Auth() { 
    const [email, setEmail] = useState(''); 
    const [password, setPassword] = useState(''); 
    const [loading, setLoading] = useState(false); // State variable to indicate whether the sign-in process is ongoing
    const [isLogin, setIsLogin] = useState(true); // State variable to toggle between login and sign-up modes



    const handleAuth = async () => { // This function is called when the user presses the sign-in or sign-up button. It handles both login and registration based on the current mode (isLogin).
        setLoading(true); // Set loading to true to indicate that the authentication process has started
        const {error, data } = isLogin
            ? await supabase.auth.signInWithPassword({ email, password }) // If in login mode, call the signInWithPassword method to authenticate the user with the provided email and password
            : await supabase.auth.signUp({ email, password }); // If in sign-up mode, call the signUp method to create a new user account with the provided email and password

        if (error) {
            Alert.alert('Authentication Error', error.message); // If there is an error during authentication, display an alert with the error message
        } else {
            if (!isLogin && data?.session === null) {
                Alert.alert('Registration Successful', 'Please check your email to confirm your account.'); //Display an alert to inform the user that registration was successful and that they need to check their email to confirm their account. This is important because Supabase requires email confirmation for new accounts, and the user needs to be informed about this step.
            }else {
                Alert.alert('Authentication Successful', 'You have successfully logged in.'); // If authentication is successful, display an alert to inform the user.
            }
        }
        setLoading(false); //authentication process has completed
    }

    return (
        //pushes the content up when the keyboard is open, and ensures that the content is scrollable when the keyboard is open, preventing it from being hidden behind the keyboard. This is important for a good user experience, especially on smaller screens where the keyboard can take up a significant portion of the screen.
        <KeyboardAvoidingView behavior = {Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}> 
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                

                {/*Header Section with icon and pulse animation*/}
                <View style={styles.headerContainer}>
                    <PulsingBackground color={isLogin ? NEON_PINK : NEON_BLUE} /> {/* Render the PulsingBackground component with the appropriate neon color based on login mode */}
                    
                    <Ionicons name="game-controller-outline" size={100} color={isLogin ? NEON_PINK : NEON_BLUE} style={styles.iconStyle} /> {/* Render the Ionicons person-circle icon with a size of 100 and the text color, and apply the defined styles for the icon */}
                    
                    <Text style={styles.headerText}>{isLogin ? 'Welcome Back!' : 'Create an Account'}</Text> {/* Display a header text that changes based on whether the user is in login or sign-up mode */}
                </View>

                {/*Input fields for email and password*/}
                <View style={styles.formContainer}>
                    <TextInput
                        style={styles.input}
                        onChangeText = {setEmail}
                        value={email}
                        placeholder="Email"
                        placeholderTextColor = "rgba(255, 255, 255, 0.7)" // Set the placeholder text color to a semi-transparent white for better visibility against the dark background
                        autoCapitalize="none" // Disable auto-capitalization for the email input to ensure that the email is entered correctly
                        keyboardType="email-address" // Set the keyboard type to email-address to provide a more appropriate keyboard layout for entering email addresses
                    />
                    <TextInput
                        style={styles.input}
                        onChangeText={setPassword}
                        value={password}
                        secureTextEntry = {true} // Enable secure text entry for the password input to hide the entered characters for better security
                        placeholder="Password"
                        placeholderTextColor = "rgba(255, 255, 255, 0.7)" // Set the placeholder text color to a semi-transparent white for better visibility against the dark background
                        autoCapitalize="none" // Disable auto-capitalization for the password input to ensure that the password is entered correctly    
                    />
                </View>

                {/*Button to submit the login or sign-up form*/}
                <TouchableOpacity onPress={handleAuth} style={styles.button} disabled={loading}> {/* Disable the button while the authentication process is ongoing to prevent multiple submissions */}
                    <Text style={styles.buttonText}>{isLogin ? 'Log In' : 'Sign Up'}</Text> {/* Display the appropriate action text (Log In or Sign Up) based on the current mode */}
                </TouchableOpacity>
                    
                {/*Button to toggle between login and sign-up modes*/}
                <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.toggleButton}>
                    <Text style={styles.toggleButtonText}>{isLogin ? "Don't have an account? Sign Up" : "Already have an account? Log In"}</Text> {/* Display a toggle button that allows the user to switch between login and sign-up modes, with the text changing accordingly */}
                    <Text style = {{color: isLogin ? NEON_PINK : NEON_BLUE, fontWeight: 'bold'}}>{isLogin ? "Sign Up" : "Log In"}</Text> {/* Display the action text (Sign Up or Log In) in the neon color corresponding to the current mode for visual emphasis */}
                </TouchableOpacity>

                </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1, 
        backgroundColor: DARK_BG, // Set the background color to a dark color for a sleek and modern look
    },
    scrollContainer: {
        flexGrow: 1, 
        justifyContent: 'center', // Center the content vertically within the scroll view
        alignItems: 'center', // Center the content horizontally within the scroll view
        padding: 20, // Add padding around the content for better spacing
    },
    headerContainer: {
        alignItems: 'center', // Center the header content horizontally
        marginBottom: 40, // Add margin below the header for spacing
        position: 'relative', // in simple words, it allows us to position the pulsing background and the icon relative to this container, so that they can overlap each other correctly to create the desired visual effect.
    },

    iconStyle: {
        textShadowColor: NEON_PINK, // Set the text shadow color to neon pink for a glowing effect around the icon
        textShadowOffset: { width: 0, height: 0 }, // Set the text shadow offset to zero to create a uniform glow around the icon
        textShadowRadius: 30, // Set the text shadow radius to create a soft glow effect around the icon
    },
    



    headerText: {
        color: TEXR_COLOR, // Set the header text color to white for good contrast against the dark background
        fontSize: 24, // Increase the font size for better visibility and emphasis
        textAlign: 'center', // Center the header text horizontally
        marginTop: 20, // Add margin above the header text for spacing
        fontWeight: 'bold', // Make the header text bold for better emphasis
    },
    formContainer: {
        marginBottom: 20, // Add margin below the form container for spacing
        width: '100%', // Set the form container to take up the full width of the screen for better layout
    },
    input: {
        backgroundColor: 'transparent', // Set the input background to transparent to blend with the dark background
        paddingVertical: 12, // Add vertical padding for better touch targets
        paddingHorizontal: 15, // Add horizontal padding for better spacing within the input
        borderBottomColor: NEON_BLUE, // Set the bottom border color to neon blue for a stylish and modern look
        borderBottomWidth: 1, // Add a bottom border to the input for better visual separation
        marginBottom: 20, // Add margin below each input for spacing
        fontSize: 16, // Set the font size for the input text for better readability
        color: TEXR_COLOR, // Set the input text color to white for good contrast against the dark background
    },
    toggleButton: {
        paddingVertical: 12, // Add vertical padding for better touch targets
        borderRadius: 5, // Add border radius for a more modern and friendly look
        borderColor: NEON_PINK, // Set the border color to neon pink for a stylish and modern look
        borderWidth: 1, // Add a border to the toggle button for better visual separation
        alignItems: 'center', // Center the toggle button content horizontally
        shadowOffset: { width: 0, height: 2 }, // Add shadow offset for better visual depth
        shadowOpacity: 0.3, // Set the shadow opacity for better visual depth
        shadowRadius: 4, // Set the shadow radius for better visual depth
        elevation: 5, // Add elevation for better visual depth on Android devices
    },
    toggleButtonText: {
        color: TEXR_COLOR, // Set the toggle button text color to white for good contrast against the dark background
        fontSize: 14, // Set the font size for the toggle button text for better readability
        marginBottom: 5, // Add margin below the toggle button text for spacing
        fontWeight: 'bold', // Make the toggle button text bold for better emphasis
    },
    button: {
        backgroundColor: NEON_PINK, // Set the button background color to neon pink for a stylish and modern look
        paddingVertical: 12, // Add vertical padding for better touch targets
        paddingHorizontal: 20, // Add horizontal padding for better spacing within the button
        borderRadius: 5, // Add border radius for a more modern and friendly look
        alignItems: 'center', // Center the button content horizontally
        shadowOffset: { width: 0, height: 2 }, // Add shadow offset for better visual depth
        shadowOpacity: 0.3, // Set the shadow opacity for better visual depth
        shadowRadius: 4, // Set the shadow radius for better visual depth
        elevation: 5, // Add elevation for better visual depth on Android devices
        marginBottom: 20, // Add margin below the button for spacing
    },
    buttonText: {
        color: TEXR_COLOR, // Set the button text color to white for good contrast against the neon pink background
        fontSize: 16, // Set the font size for the button text for better readability
        fontWeight: 'bold', // Make the button text bold for better emphasis
    },
});

    