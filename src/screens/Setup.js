import React, {useState} from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,    
    View,
    LayoutAnimation,
    UIManager
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCurrentUser } from '../services/authService';
import { updateFullProfile } from '../services/userService';
import ImageColors from 'react-native-image-colors';
import FandomSearch from '../components/FandomSearch';

import { useNavigation } from '@react-navigation/native';  // Import the useNavigation hook from React Navigation to enable navigation to the Home screen after character setup is complete



const NEON_PINK = '#FF00FF';
const NEON_BLUE = '#00FFFF';
const DARK_BG = '#000000';
const TEXR_COLOR = '#FFFFFF';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true); // Enable LayoutAnimation on Android for smooth transitions when showing/hiding the character setup form
}

export default function Setup() { 


    const navigation = useNavigation(); // Get the navigation object from the useNavigation hook to enable navigation to the Home screen after character setup is complete

    //set state for the character setup form
    const [step, setStep] = useState(1); // State variable to track the current step of the character setup process
    const [name, setName] = useState('');
    const [playerClass, setPlayerClass] = useState('');
    const [loading, setLoading] = useState(false); // State variable to indicate whether the profile update process is ongoing

    //animation helper
    const animateNextStep = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);// Configure the next layout change to use the easeInEaseOut animation preset for a smooth transition between steps in the character setup process
    };

    //logic 
    const handleNext = async () => {//function to handle the "Next" button press in the character setup process. It validates the input for the current step and moves to the next step if the input is valid.
        if (step === 1 && !name) {
            Alert.alert("Hold on!", "You need to make yourseld known! Please enter a name for your character.");
            return;
        }
        animateNextStep();
        setStep(step + 1);// Move to the next step of the character setup process
    };

    const selectClass = (choice) => {
        setPlayerClass(choice); // Set the selected player class in the state, the variavle choice is passed in from the onPress event of the class selection buttons
        handleNext(); // Move to the next step of the character setup process after selecting a class
    };

    const handleFinish = async (themeId, fandomName, imageUrl) => {
        setLoading(true); // Set loading to true to indicate that the profile update process has started

        try {
            const user = await getCurrentUser(); // Get the current authenticated user using the getCurrentUser function from the authService
            
            if (!user) {
                throw new Error("No authenticated user found. Please log in again."); // If there is no authenticated user, throw an error to be handled by the catch block
            }

            let primary = NEON_PINK; // Default primary color
            let secondary = NEON_BLUE; // Default secondary color
            let bg = DARK_BG; // Default background color

            if(imageUrl){
                const colors = await ImageColors.getColors(imageUrl, {
                    fallback: NEON_PINK, // Fallback color if the image colors cannot be extracted
                    cache: true, // Cache the extracted colors for better performance on subsequent requests
                    key: imageUrl, // Use the image URL as the cache key to ensure that colors are cached per image
                })

                //ios and android return different color properties, so we need to check the platform
                if(colors.platform === 'android'){
                    // Prioritize the loudest, most neon colors first!
                    primary = colors.vibrant || colors.lightVibrant || colors.dominant || primary; 
                    secondary = colors.lightVibrant || colors.vibrant || colors.average || secondary; 
                    
                    // Keep the background very dark so the vibrant text actually pops!
                    bg = colors.darkVibrant || '#0A0A0A'; 
                }else{
                    primary = colors.primary || primary; 
                    // iOS has a 'detail' color that is usually more vibrant than secondary
                    secondary = colors.detail || colors.secondary || secondary; 
                    bg = colors.background || '#0A0A0A'; 
                }
            }

            await updateFullProfile(user.id, { 
                userName: name,
                playerClass: playerClass, 
                themeId: themeId, 
                fandomName: fandomName, 
                primaryColor: primary,
                secondaryColor: secondary,
                backgroundColor: bg }); // Update the user's profile with the provided name, player class, theme ID, and fandom name using the updateFullProfile function from the userService
                

            Alert.alert('Character Setup Complete', `Welcome to the Gamified Learning App, ${name}!`); // Show a success alert when the character setup is complete

            navigation.navigate('Home'); // Route the user to the Home screen after completing the character setup process

        } catch (error) {
            Alert.alert('Error saving profile', error.message); // Show an error alert if there is an error during the profile update process
        } finally {
            setLoading(false); // Set loading to false when finished, regardless of success or failure
        }
    };


    //ui rendering using conditional rendering to show different steps of the character setup process
    
    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}> 
            <ScrollView contentContainerStyle={styles.scrollContainer}>
                
                {/* STEP 1: GAMER TAG */}
                {step === 1 && (
                    <View style={styles.card}>
                        <Ionicons name="person-circle-outline" size={80} color={NEON_BLUE} style={styles.iconStyle} />
                        <Text style={styles.headerText}>Identify Yourself</Text>
                        
                        <TextInput
                            style={styles.input}
                            onChangeText={setName}
                            value={name || ''}
                            placeholder="Enter Gamer Tag"
                            placeholderTextColor="rgba(255, 255, 255, 0.5)"
                            autoCapitalize="none"
                        />
                        
                        <TouchableOpacity onPress={handleNext} style={[styles.button, { borderColor: NEON_BLUE }]}> 
                            <Text style={[styles.buttonText, { color: NEON_BLUE }]}>Continue ➔</Text> 
                        </TouchableOpacity>
                    </View>
                )}

                {/* STEP 2: CHOOSE CLASS */}
                {step === 2 && (
                    <View style={styles.card}>
                        <Text style={styles.headerText}>Choose Your Path</Text>
                        <Text style={styles.subtitleText}>What defines you best, {name || 'Player'}?</Text>
                        
                        <TouchableOpacity style={styles.classButton} onPress={() => selectClass('Gamer')}>
                            <Ionicons name="game-controller" size={24} color={NEON_PINK} />
                            <Text style={styles.classButtonText}>Game Enjoyer</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.classButton} onPress={() => selectClass('Otaku')}>
                            <Ionicons name="book" size={24} color={NEON_PINK} />
                            <Text style={styles.classButtonText}>Anime Enjoyer</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.classButton} onPress={() => selectClass('Cinephile')}>
                            <Ionicons name="film" size={24} color={NEON_PINK} />
                            <Text style={styles.classButtonText}>Movie Enjoyer</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => { animateNextStep(); setStep(1); }} style={{marginTop: 20}}>
                            <Text style={{color: 'gray', textAlign: 'center'}}>← Back</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* STEP 3: API SEARCH PLACEHOLDER */}
                {step === 3 && (
                    <View style={styles.card}>
                        <Text style={styles.headerText}>The Final Choice</Text>
                        <Text style={styles.subtitleText}>Searching the database for {playerClass || 'Unknown'} titles...</Text>
                        
                        {/*Search component that takes in the playerClass as a prop and returns a list of fandoms to choose from*/}
                        <FandomSearch playerClass={playerClass} onSelect={handleFinish} />

                        {/* Temporary button just to test backend save function */} 
                        <TouchableOpacity  
                            onPress={() => handleFinish(1, 'Test Fandom')} 
                            style={[styles.button, { borderColor: NEON_PINK }]}
                            disabled={loading}
                        > 
                            <Text style={[styles.buttonText, { color: NEON_PINK }]}>
                                {loading ? 'Saving to Database...' : 'Finish Setup (Test)'}
                            </Text> 
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => { animateNextStep(); setStep(2); }} style={{marginTop: 20}}>
                            <Text style={{color: 'gray', textAlign: 'center'}}>← Change Class</Text>
                        </TouchableOpacity>
                    </View>
                )}

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
    card: {
        width: '100%',
        alignItems: 'center',
    },
    iconStyle: {
        textShadowColor: NEON_BLUE, 
        textShadowOffset: { width: 0, height: 0 }, 
        textShadowRadius: 20, 
        marginBottom: 10,
    },
    headerText: {
        color: TEXR_COLOR, 
        fontSize: 28, 
        textAlign: 'center', 
        marginBottom: 10, 
        fontWeight: 'bold', 
    },
    subtitleText: {
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 16,
        marginBottom: 30,
        textAlign: 'center'
    },
    input: {
        backgroundColor: 'transparent', 
        paddingVertical: 12, 
        paddingHorizontal: 15, 
        borderBottomColor: NEON_BLUE, 
        borderBottomWidth: 1, 
        marginBottom: 30, 
        fontSize: 18, 
        color: TEXR_COLOR, 
        width: '100%',
        textAlign: 'center',
    },
    button: {
        backgroundColor: 'transparent', 
        paddingVertical: 15, 
        paddingHorizontal: 40, 
        borderRadius: 30, 
        borderWidth: 1,
        alignItems: 'center', 
        shadowOffset: { width: 0, height: 0 }, 
        shadowOpacity: 0.5, 
        shadowRadius: 10, 
        elevation: 5, 
    },
    buttonText: {
        fontSize: 18, 
        fontWeight: 'bold', 
        textTransform: 'uppercase',
    },
    classButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 0, 255, 0.1)', 
        borderColor: NEON_PINK,
        borderWidth: 1,
        borderRadius: 10,
        padding: 15,
        marginBottom: 15,
        width: '100%',
    },
    classButtonText: {
        color: TEXR_COLOR,
        fontSize: 18,
        fontWeight: 'bold',
        marginLeft: 15,
    },
    placeholderBox: {
        width: '100%',
        height: 150,
        borderColor: '#333',
        borderWidth: 1,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 30,
        backgroundColor: '#111'
    }
});
        




