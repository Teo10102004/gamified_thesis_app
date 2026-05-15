import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../context/ThemeContext';
import { generateFlashcardsFromFile } from '../services/aiService';
import { createNewDeck, saveFlashcards } from '../services/userService';
import { getCurrentUser } from '../services/authService';

export default function FlashcardSetup({ navigation }) {
    const { theme } = useTheme();
    const [deckName, setDeckName] = useState('');
    const [cardCount, setCardCount] = useState(10);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'text/plain'],
                copyToCacheDirectory: true
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const pickedFile = result.assets[0];
                setSelectedFile(pickedFile);
                if (!deckName) setDeckName(pickedFile.name.split('.')[0] + " Deck");
            }
        } catch (error) {
            Alert.alert("Error", "Could not pick the file.");
        }
    };

    const handleGenerate = async () => {
        if (!selectedFile || !deckName.trim()) {
            Alert.alert("Information Needed", "Please provide a deck name and upload a file!");
            return;
        }

        setIsGenerating(true);
        try {
            const user = await getCurrentUser();
            if (!user) throw new Error("No active user session.");

            // 1. Read file and call AI
            const fileBase64 = await FileSystem.readAsStringAsync(selectedFile.uri, { encoding: FileSystem.EncodingType.Base64 });
            const cards = await generateFlashcardsFromFile(fileBase64, selectedFile.mimeType, cardCount);

            if (cards && cards.length > 0) {
                // 2. Save Deck record
                const deckResult = await createNewDeck(user.id, deckName);
                if (deckResult.success) {
                    // 3. Save Cards
                    await saveFlashcards(deckResult.deckId, cards);
                    Alert.alert("Success!", `Generated ${cards.length} flashcards for your vault.`);
                    navigation.navigate('FlashcardDashboard');
                }
            } else {
                throw new Error("AI failed to generate cards. Try a different file.");
            }
        } catch (error) {
            Alert.alert("Generation Error", error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={28} color={theme.secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.textColor }]}>Forge New Deck</Text>
                <View style={{ width: 28 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={[styles.label, { color: theme.primaryColor }]}>1. Deck Identity</Text>
                <TextInput
                    style={[styles.input, { color: theme.textColor, borderColor: theme.secondaryColor }]}
                    placeholder="Enter Deck Name"
                    placeholderTextColor="gray"
                    value={deckName}
                    onChangeText={setDeckName}
                />

                <Text style={[styles.label, { color: theme.primaryColor, marginTop: 20 }]}>2. Knowledge Source</Text>
                <TouchableOpacity 
                    style={[styles.uploadBox, { borderColor: theme.secondaryColor }]} 
                    onPress={pickDocument}
                >
                    <Ionicons name={selectedFile ? "document-text" : "cloud-upload-outline"} size={50} color={selectedFile ? theme.primaryColor : "gray"} />
                    <Text style={[styles.uploadText, { color: theme.textColor }]}>
                        {selectedFile ? selectedFile.name : "Tap to Upload PDF/TXT"}
                    </Text>
                </TouchableOpacity>

                <View style={styles.counterSection}>
                    <Text style={[styles.label, { color: theme.primaryColor }]}>3. Card Count</Text>
                    <View style={styles.counterRow}>
                        <TouchableOpacity onPress={() => setCardCount(Math.max(5, cardCount - 5))} style={styles.countBtn}>
                            <Ionicons name="remove" size={24} color={theme.secondaryColor} />
                        </TouchableOpacity>
                        <Text style={[styles.countText, { color: theme.textColor }]}>{cardCount}</Text>
                        <TouchableOpacity onPress={() => setCardCount(Math.min(30, cardCount + 5))} style={styles.countBtn}>
                            <Ionicons name="add" size={24} color={theme.secondaryColor} />
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <TouchableOpacity 
                    style={[styles.generateBtn, { backgroundColor: theme.primaryColor, opacity: isGenerating ? 0.6 : 1 }]} 
                    onPress={handleGenerate}
                    disabled={isGenerating}
                >
                    {isGenerating ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.generateBtnText}>Forge Deck</Text>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    headerTitle: { fontSize: 22, fontWeight: 'bold' },
    scrollContent: { padding: 20 },
    label: { fontSize: 16, fontWeight: '900', textTransform: 'uppercase', marginBottom: 15 },
    input: { borderWidth: 2, borderRadius: 12, padding: 15, fontSize: 16, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)' },
    uploadBox: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 15, padding: 40, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
    uploadText: { marginTop: 15, fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
    counterSection: { marginTop: 30 },
    counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 15, padding: 10 },
    countBtn: { padding: 15 },
    countText: { fontSize: 20, fontWeight: 'bold' },
    footer: { padding: 20 },
    generateBtn: { paddingVertical: 18, borderRadius: 30, alignItems: 'center' },
    generateBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900', textTransform: 'uppercase' }
});
