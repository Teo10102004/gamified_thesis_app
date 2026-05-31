import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native'; // Refreshes the list when we come back
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getCurrentUser } from '../services/authService';
import { getUserQuizzes, deleteQuiz, fetchQuizQuestions, toggleQuizPublic } from '../services/userService';
import { generateQuizDescription } from '../services/aiService';
import FandomBackground from '../components/FandomBackground';


export default function QuizDashboard({ navigation }) {
    // We pull our dynamic fandom colors from the context
    const { theme } = useTheme();

    // State to hold our list of quizzes and the loading status
    const [quizzes, setQuizzes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingQuizId, setLoadingQuizId] = useState(null);

    // This function fetches the quizzes from Supabase
    const loadQuizzes = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();
            if (user) {
                const result = await getUserQuizzes(user.id);
                if (result.success) {
                    setQuizzes(result.quizzes);
                }
            }
        } catch (error) {
            Alert.alert("Error", "Failed to load your quests.");
        } finally {
            setLoading(false);
        }
    };

    // We use 'useFocusEffect' so the list refreshes every time the user enters this screen
    useFocusEffect(
        useCallback(() => {
            loadQuizzes();
        }, [])
    );

    // This function handles the deletion of a quiz
    const handleDelete = (quizId) => {
        Alert.alert(
            "Delete Quest",
            "Are you sure you want to permanently remove this quest and its scores?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        const result = await deleteQuiz(quizId);
                        if (result.success) {
                            loadQuizzes(); // Refresh the list
                        } else {
                            Alert.alert("Error", "Could not delete the quiz.");
                        }
                    }
                }
            ]
        );
    };

    const handleTogglePublic = async (quiz) => {
        const newStatus = !quiz.ispublic;
        let publicDescription = quiz.public_description;

        // If turning public and no description exists, we generate one
        if (newStatus && !publicDescription) {
            setLoadingQuizId(quiz.quizid);
            
            const result = await fetchQuizQuestions(quiz.quizid);
            if (result.success && result.questions.length > 0) {
                publicDescription = await generateQuizDescription(result.questions);
            }
            
            setLoadingQuizId(null);
        }

        // Optimistically update UI
        setQuizzes(prev => prev.map(q => q.quizid === quiz.quizid ? { ...q, ispublic: newStatus, public_description: publicDescription } : q));
        
        const result = await toggleQuizPublic(quiz.quizid, newStatus, publicDescription);
        if (!result.success) {
            Alert.alert("Error", "Could not change privacy status.");
            // Revert on failure
            setQuizzes(prev => prev.map(q => q.quizid === quiz.quizid ? { ...q, ispublic: quiz.ispublic, public_description: quiz.public_description } : q));
        }
    };

    // This is how we render each individual quiz row in the list
    const renderQuizItem = ({ item }) => (
        <View style={[
            styles.quizCard, 
            { 
                borderColor: theme.secondaryColor, 
                backgroundColor: '#0A0A0A',
                // --- AI VISUAL DNA ---
                // Apply dynamic border radius and shadow effects based on the theme's visual configuration
                borderRadius: theme.visualConfig?.borderRadius || 15,
                shadowColor: theme.secondaryColor,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: (theme.visualConfig?.shadowOpacity || 0.5) / 3,
                shadowRadius: (theme.visualConfig?.glowIntensity || 10) / 2,
                elevation: 3
            }
        ]}>
            <TouchableOpacity
                style={styles.quizInfo}
                onPress={async () => {
                    // --- THE REDO FIX ---
                    // When the user taps a quiz, we fetch the questions from the database.
                    const result = await fetchQuizQuestions(item.quizid);

                    if (result.success && result.questions.length > 0) {
                        // We send the user to the QuizScreen with the questions we just pulled!
                        navigation.navigate('QuizScreen', {
                            questions: result.questions,
                            quizId: item.quizid
                        });
                    } else {
                        Alert.alert("Redo Error", "Could not find questions for this quest.");
                    }
                }}
            >
                <View style={[styles.iconCircle, { backgroundColor: theme.primaryColor }]}>
                    <Ionicons name="journal" size={24} color="#FFF" />
                </View>
                <View style={styles.textContainer}>
                    <Text style={[styles.quizTitle, { color: theme.textColor }]} numberOfLines={2}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text style={[styles.quizStats, { color: 'gray', marginRight: 12 }]}>Best: {item.bestScore} XP</Text>
                        {item.likes > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="heart" size={14} color="#FF4444" />
                                <Text style={{ color: 'gray', fontSize: 12 }}>{item.likes}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>

            <View style={styles.actionButtons}>
                <TouchableOpacity onPress={() => handleTogglePublic(item)} style={styles.actionButton}>
                    {loadingQuizId === item.quizid ? (
                        <ActivityIndicator size="small" color="#44FF44" />
                    ) : (
                        <Ionicons name={item.ispublic ? "globe" : "lock-closed"} size={24} color={item.ispublic ? "#44FF44" : "gray"} />
                    )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.quizid)} style={styles.actionButton}>
                    <Ionicons name="trash-outline" size={24} color="#FF4444" />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />

            {/* Header Section */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={theme.secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.textColor }]}>Quest Library</Text>
                <TouchableOpacity onPress={() => navigation.navigate('QuestSetup')}>
                    <Ionicons name="add-circle" size={32} color={theme.primaryColor} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.primaryColor} />
                </View>
            ) : (
                <FlatList
                    data={quizzes}
                    keyExtractor={(item) => item.quizid.toString()}
                    renderItem={renderQuizItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="document-text-outline" size={80} color="rgba(255,255,255,0.2)" />
                            <Text style={[styles.emptyText, { color: 'gray' }]}>No quests found. Generate your first one!</Text>
                            <TouchableOpacity
                                style={[styles.createButton, { backgroundColor: theme.primaryColor }]}
                                onPress={() => navigation.navigate('QuestSetup')}
                            >
                                <Text style={styles.createButtonText}>Create New Quest</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 20 },
    quizCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 15,
        borderRadius: 15,
        borderWidth: 1,
        marginBottom: 15
    },
    quizInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    iconCircle: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    textContainer: { flex: 1 },
    quizTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    quizStats: { fontSize: 14 },
    actionButtons: { flexDirection: 'row', alignItems: 'center' },
    actionButton: { padding: 10, marginLeft: 5 },
    emptyContainer: { alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 16, marginTop: 20, textAlign: 'center', paddingHorizontal: 40 },
    createButton: { marginTop: 30, paddingVertical: 15, paddingHorizontal: 30, borderRadius: 25 },
    createButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});
