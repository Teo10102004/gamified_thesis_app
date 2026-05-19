import React, { useState } from "react"; 
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context'; 
import { useTheme } from '../context/ThemeContext'; 
import { saveQuizScore } from '../services/userService'; 
import { getCurrentUser } from '../services/authService'; 
import FandomBackground from '../components/FandomBackground'; 


export default function QuizScreen({ navigation, route }) {
    // Pull dynamic colors from theme context
    const { theme } = useTheme();

    // We pull the list of questions AND the specific ID of this quiz from the 'route params'.
    // These were passed to us by the 'QuestSetup' screen.
    const dynamicQuestions = route.params?.questions || []; 
    const quizId = route.params?.quizId; // The real ID from the 'quiz' table

    // Game state
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correctAnswers, setCorrectAnswers] = useState(0);
    const [isFinished, setIsFinished] = useState(false); 

    // Gameplay logic
    const handleAnswerPress = (selectedIndex) => {
        if (selectedIndex === dynamicQuestions[currentIndex].correctIndex) {
            setCorrectAnswers(correctAnswers + 1); 
        }

        // Move to the next question or finish the quiz
        if (currentIndex < dynamicQuestions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            setIsFinished(true);
        }
    };

    // --- RENDER RESULTS SCREEN ---
    if (isFinished) {
        // Calculate the XP math here for the UI display
        const difficultyMultiplier = 1.5; 
        const baseXP = correctAnswers * 10; 
        const flawlessBonus = correctAnswers === dynamicQuestions.length ? 50 : 0; 
        const earnedXP = Math.round(baseXP * difficultyMultiplier) + flawlessBonus; 

        // This function is called when the user clicks "Return to Dashboard"
        const handleFinishQuiz = async () => {
            try {
                const user = await getCurrentUser();
                if (user) {
                    // --- THE DATABASE FIX ---
                    // We now pass the 'quizId' we received earlier so the database 
                    // knows exactly which quest this score belongs to.
                    const response = await saveQuizScore(user.id, quizId, correctAnswers, earnedXP);
                    
                    if (response && !response.success) {
                        Alert.alert("Database Error", response.error?.message || "Check your Supabase schema constraints.");
                        return;
                    }
                }
                // Route them back to the dashboard once it successfully saves
                navigation.navigate('Home'); 
            } catch (error) {
                Alert.alert("Error", error.message);
            }
        };
        
        return (
            <SafeAreaView style={styles.container}>
                <FandomBackground />
                <View style={styles.card}>
                    <Text style={[styles.headerText, { color: theme.textColor }]}>Quiz Complete!</Text>
                    <Text style={[styles.scoreText, { color: theme.primaryColor }]}>
                        {correctAnswers} / {dynamicQuestions.length} Correct
                    </Text>
                    
                    <View style={[styles.xpBox, { borderColor: theme.secondaryColor }]}>
                        <Text style={[styles.xpText, { color: theme.textColor }]}>
                            +{earnedXP} XP Earned!
                        </Text>
                        {correctAnswers === dynamicQuestions.length && (
                            <Text style={[styles.bonusText, { color: theme.primaryColor }]}>
                                FLAWLESS BONUS APPLIED
                            </Text>
                        )}
                    </View>

                    <TouchableOpacity 
                        style={[styles.button, { backgroundColor: theme.primaryColor }]}
                        onPress={handleFinishQuiz} 
                    >
                        <Text style={styles.buttonText}>Return to Dashboard</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // --- RENDER GAMEPLAY SCREEN ---
    const currentQ = dynamicQuestions[currentIndex];

    if (!currentQ) { //This is a safety check. If for some reason we don't have a current question to display (which shouldn't happen), we show a loading state instead of crashing the app.
        return (
            <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <FandomBackground />
                <ActivityIndicator size="large" color={theme.primaryColor} />
                <Text style={{ color: theme.textColor, marginTop: 20, fontSize: 18 }}>
                    Preparing your quest...
                </Text>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />
            {/* We wrap everything in a ScrollView so that if the AI gives us 
                really long questions, the user can just scroll down to read them 
                instead of having the text overlap! */}
            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                <View style={styles.header}>
                    <Text style={[styles.progressText, { color: theme.secondaryColor }]}>
                        Question {currentIndex + 1} of {dynamicQuestions.length}
                    </Text>
                </View>

                <View style={styles.questionContainer}>
                    <Text style={[styles.questionText, { color: theme.textColor }]}>
                        {currentQ.question}
                    </Text>
                </View>

                <View style={styles.optionsContainer}>
                    {currentQ.options.map((option, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[styles.optionButton, { borderColor: theme.primaryColor }]}
                            onPress={() => handleAnswerPress(index)}
                        >
                            <Text style={[styles.optionText, { color: theme.textColor }]}>
                                {option}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    header: {
        marginTop: 20,
        marginBottom: 20,
        alignItems: 'center',
    },
    progressText: {
        fontSize: 16,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    questionContainer: {
        paddingVertical: 20,
        paddingHorizontal: 10,
    },
    questionText: {
        fontSize: 22, // Slightly smaller to fit more text
        fontWeight: 'bold',
        textAlign: 'center',
        lineHeight: 30,
    },
    optionsContainer: {
        marginTop: 20,
        paddingBottom: 20,
    },
    optionButton: {
        borderWidth: 2,
        borderRadius: 15,
        paddingVertical: 18,
        paddingHorizontal: 20,
        marginBottom: 15,
        backgroundColor: 'rgba(255,255,255,0.05)', 
    },
    optionText: {
        fontSize: 18,
        textAlign: 'center',
        fontWeight: '600',
    },
    card: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerText: {
        fontSize: 32,
        fontWeight: '900',
        marginBottom: 10,
    },
    scoreText: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 40,
    },
    xpBox: {
        borderWidth: 2,
        padding: 30,
        borderRadius: 20,
        alignItems: 'center',
        marginBottom: 50,
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    xpText: {
        fontSize: 28,
        fontWeight: '900',
    },
    bonusText: {
        marginTop: 10,
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    button: {
        paddingVertical: 15,
        paddingHorizontal: 40,
        borderRadius: 30,
        shadowOpacity: 0.3,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 3 },
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    }
});