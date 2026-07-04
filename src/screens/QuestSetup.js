import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import FandomBackground from '../components/FandomBackground';

// We use these tools to let the user pick a file and then read that file's content.
import * as DocumentPicker from 'expo-document-picker'; 
// Expo 54 requires us to import from '/legacy' if we want to use the older readAsStringAsync method.
import * as FileSystem from 'expo-file-system/legacy'; 
import { generateQuizFromFile } from '../services/aiService';
import { createNewQuiz, saveQuizQuestions, checkDocumentUsed, restoreDeletedQuiz, fetchQuizQuestions } from '../services/userService'; // Import our new tool for creating quiz records
import { getCurrentUser } from '../services/authService';

export default function QuestSetup({ navigation }) {
    const { theme } = useTheme();

    // The AI Setup State
    const [topic, setTopic] = useState(''); 
    const [questionCount, setQuestionCount] = useState(5); 
    const [difficulty, setDifficulty] = useState('Medium');
    const [isGenerating, setIsGenerating] = useState(false);
    
    // --- THE CUSTOM NAME FIX ---
    // We add a state to hold the name of the quest. 
    // This will be saved to the 'quiz' table in your database.
    const [questName, setQuestName] = useState(''); 
    
    // State to hold the selected file's info
    const [selectedFile, setSelectedFile] = useState(null); 

    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*', 
                copyToCacheDirectory: true,
                multiple: false
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const pickedFile = result.assets[0];
                setSelectedFile(pickedFile);
                
                // If the user hasn't typed a name yet, we use the filename as a helpful default!
                if (!questName) {
                    setQuestName(pickedFile.name.split('.')[0]); // Remove the .pdf or .txt extension for a cleaner look
                }
                
                Alert.alert("File Attached", `Successfully attached: ${pickedFile.name}`);
            }
        } catch (error) {
            console.error("Document Picker Error:", error);
            Alert.alert("Access Denied", "Could not read that specific file.");
        }
    };

    const handleLaunchQuest = async () => {
        // Logic check: We need a file AND a name to proceed
        if (!selectedFile) {
            Alert.alert("Missing Information", "Please upload a file to start!");
            return;
        }

        if (!questName.trim()) {
            Alert.alert("Missing Name", "Every heroic quest needs a name!");
            return;
        }

        setIsGenerating(true);
        let generatedQuestions = null;

        try {
            // Convert file to base64
            const base64Data = await FileSystem.readAsStringAsync(selectedFile.uri, {
                encoding: 'base64', 
            });
            
            const mimeType = selectedFile.mimeType || 'application/pdf';
            
            const user = await getCurrentUser();
            if (!user) throw new Error("Not logged in");

            // --- ANTI-CHEAT CHECK ---
            const exactDescription = `AI quest generated from ${selectedFile.name} [Difficulty: ${difficulty}] [Length: ${questionCount}]`;
            const checkResult = await checkDocumentUsed(user.id, exactDescription);
            
            if (checkResult.used) {
                // If it was deleted, restore it so they can see it in their library again
                if (checkResult.isDeleted) {
                    await restoreDeletedQuiz(checkResult.quizId);
                }
                
                // Fetch the original questions instead of generating new ones
                const { success, questions } = await fetchQuizQuestions(checkResult.quizId);
                
                if (success && questions.length > 0) {
                    Alert.alert(
                        "Anti-Cheat Active", 
                        `You have already generated a ${difficulty} quest from this document with ${questionCount} questions. We have restored your original quest instead of generating a new one.`
                    );
                    setIsGenerating(false);
                    // Navigate to the restored quiz!
                    navigation.navigate('QuizScreen', { 
                        questions: questions,
                        quizId: checkResult.quizId 
                    });
                    return;
                }
            }

            // 3. Call AI
            generatedQuestions = await generateQuizFromFile(base64Data, mimeType, questionCount, difficulty);

            // If the AI successfully gave us back a list of questions...
            if (generatedQuestions && generatedQuestions.length > 0) {
                
                // Calculate max possible XP for this quiz to track completion
                const difficultyMultiplier = difficulty === 'Hard' ? 1.5 : difficulty === 'Medium' ? 1.2 : 1;
                // Base XP is 10 per question. Flawless bonus is 50.
                const maxXP = Math.round(questionCount * 10 * difficultyMultiplier) + 50;

                // Before we start playing, we register this specific quiz in the database.
                // We pass the exactDescription so we can track it later for anti-cheat.
                const quizResult = await createNewQuiz(user.id, questName, exactDescription, maxXP);

                if (quizResult.success) {
                    // --- THE REDO FIX ---
                    // Now we save the actual questions and answers to the DB.
                    // This is what makes the "Redo" button possible later!
                    await saveQuizQuestions(quizResult.quizId, generatedQuestions);

                    // We go to the QuizScreen and pass BOTH the questions AND the real ID of this quiz!
                    navigation.navigate('QuizScreen', { 
                        questions: generatedQuestions,
                        quizId: quizResult.quizId 
                    });
                } else {
                    // If the database failed to create the quiz, we warn the user.
                    Alert.alert("Database Error", "The quiz was generated, but we couldn't create a record for it in the DB.");
                }

            } else {
                Alert.alert("Generation Failed", "The AI couldn't read the document clearly.");
            }
        } catch (error) {
            console.error("Error in Quest Launch:", error);
            Alert.alert("File Error", "Could not process the uploaded file.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />
            
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={theme.secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.textColor }]}>Configure Quest</Text>
                <View style={{ width: 28 }} /> 
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                
                <Text style={[styles.sectionLabel, { color: theme.primaryColor }]}>1. Source Material</Text>
                
                {/* --- CUSTOM NAME INPUT --- */}
                <Text style={[styles.inputLabel, { color: theme.textColor }]}>Quest Title</Text>
                <TextInput
                    style={[styles.nameInput, { color: theme.textColor, borderColor: theme.secondaryColor }]}
                    placeholder="e.g. The Final Exam Boss"
                    placeholderTextColor="gray"
                    value={questName}
                    onChangeText={setQuestName}
                />

                <TouchableOpacity 
                    style={[
                        styles.uploadBox, 
                        { borderColor: selectedFile ? theme.primaryColor : theme.secondaryColor }
                    ]}
                    onPress={pickDocument} 
                >
                    <Ionicons 
                        name={selectedFile ? "document-text" : "cloud-upload-outline"} 
                        size={50} 
                        color={selectedFile ? theme.primaryColor : theme.textColor} 
                    />
                    <Text style={[styles.uploadText, { color: theme.textColor }]}>
                        {selectedFile ? selectedFile.name : "Tap to Upload PDF or .TXT"}
                    </Text>
                    {selectedFile && (
                        <Text style={{ color: theme.secondaryColor, marginTop: 5 }}>File Attached Successfully</Text>
                    )}
                </TouchableOpacity>

                <Text style={[styles.sectionLabel, { color: theme.primaryColor, marginTop: 30 }]}>2. Quest Length</Text>
                <View style={styles.counterRow}>
                    <TouchableOpacity onPress={() => setQuestionCount(Math.max(3, (Number(questionCount) || 0) - 1))} style={[styles.counterButton, { backgroundColor: theme.secondaryColor }]}>
                        <Ionicons name="remove" size={24} color="#000" />
                    </TouchableOpacity>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <TextInput 
                            style={[styles.counterText, { color: theme.textColor, textAlign: 'center', minWidth: 45, borderBottomWidth: 1, borderBottomColor: theme.secondaryColor }]}
                            keyboardType="numeric"
                            maxLength={3}
                            value={String(questionCount)}
                            onChangeText={(text) => {
                                const parsed = parseInt(text.replace(/[^0-9]/g, ''), 10);
                                if (!isNaN(parsed)) {
                                    setQuestionCount(Math.min(100, parsed));
                                } else if (text === '') {
                                    setQuestionCount('');
                                }
                            }}
                            onEndEditing={() => {
                                if (questionCount === '' || questionCount < 3) {
                                    setQuestionCount(3);
                                }
                            }}
                        />
                        <Text style={[styles.counterText, { color: theme.textColor }]}> Questions</Text>
                    </View>
                    <TouchableOpacity onPress={() => setQuestionCount(Math.min(100, (Number(questionCount) || 0) + 1))} style={[styles.counterButton, { backgroundColor: theme.secondaryColor }]}>
                        <Ionicons name="add" size={24} color="#000" />
                    </TouchableOpacity>
                </View>

                <Text style={[styles.sectionLabel, { color: theme.primaryColor, marginTop: 30 }]}>3. Difficulty</Text>
                <View style={styles.difficultyRow}>
                    {['Easy', 'Medium', 'Hard'].map((level) => (
                        <TouchableOpacity 
                            key={level}
                            style={[
                                styles.diffButton, 
                                { borderColor: theme.primaryColor },
                                difficulty === level && { backgroundColor: theme.primaryColor }
                            ]}
                            onPress={() => setDifficulty(level)}
                        >
                            <Text style={[styles.diffText, { color: difficulty === level ? '#000' : theme.textColor }]}>{level}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity 
                    style={[styles.launchButton, { backgroundColor: isGenerating || !selectedFile ? 'gray' : theme.primaryColor }]}
                    disabled={isGenerating || !selectedFile}
                    onPress={handleLaunchQuest}
                >
                    {isGenerating ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.launchText}>
                            {selectedFile ? "Generate AI Quiz" : "Upload File to Start"}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10 },
    headerTitle: { fontSize: 22, fontWeight: 'bold' },
    scrollContent: { padding: 20 },
    sectionLabel: { fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 15 },
    inputLabel: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 10 },
    nameInput: { borderWidth: 2, borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)' },
    uploadBox: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 15, padding: 40, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
    uploadText: { marginTop: 15, fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
    counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 15, padding: 10 },
    counterButton: { padding: 15, borderRadius: 10 },
    counterText: { fontSize: 20, fontWeight: 'bold' },
    difficultyRow: { flexDirection: 'row', justifyContent: 'space-between' },
    diffButton: { flex: 1, borderWidth: 2, paddingVertical: 15, borderRadius: 10, marginHorizontal: 5, alignItems: 'center' },
    diffText: { fontWeight: 'bold', fontSize: 16 },
    footer: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
    launchButton: { paddingVertical: 18, borderRadius: 30, alignItems: 'center', minHeight: 60, justifyContent: 'center' },
    launchText: { color: '#FFF', fontSize: 18, fontWeight: '900', textTransform: 'uppercase' }
});