import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getCurrentUser } from '../services/authService';
import { getUserDecks, deleteDeck } from '../services/userService';

export default function FlashcardDashboard({ navigation }) {
    const { theme } = useTheme();
    const [decks, setDecks] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadDecks = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();
            if (user) {
                const result = await getUserDecks(user.id);
                if (result.success) {
                    setDecks(result.decks);
                }
            }
        } catch (error) {
            Alert.alert("Error", "Failed to load your decks.");
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadDecks();
        }, [])
    );

    const handleDelete = (deckId) => {
        Alert.alert(
            "Delete Deck",
            "This will permanently delete the deck and all its cards. Continue?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        const result = await deleteDeck(deckId);
                        if (result.success) loadDecks();
                    }
                }
            ]
        );
    };

    const renderDeckItem = ({ item }) => (
        <View style={[
            styles.deckCard, 
            { 
                borderColor: theme.primaryColor, 
                backgroundColor: 'rgba(255,255,255,0.05)',
                // --- AI VISUAL DNA ---
                // Applying dynamic visual configuration from the theme object
                borderRadius: theme.visualConfig?.borderRadius || 15,
                shadowColor: theme.primaryColor,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: (theme.visualConfig?.shadowOpacity || 0.5) / 3,
                shadowRadius: (theme.visualConfig?.glowIntensity || 10) / 2,
                elevation: 3
            }
        ]}>
            <TouchableOpacity
                style={styles.deckInfo}
                onPress={() => navigation.navigate('FlashcardStudy', {
                    deckId: item.deckid,
                    deckTitle: item.title
                })}
            >
                <View style={[styles.iconCircle, { backgroundColor: theme.secondaryColor }]}>
                    <Ionicons name="albums" size={24} color="#FFF" />
                </View>
                <View style={styles.textContainer}>
                    <Text style={[styles.deckTitle, { color: theme.textColor }]}>{item.title}</Text>
                    <Text style={[styles.deckStats, { color: 'gray' }]}>{item.cardCount} Cards</Text>
                </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleDelete(item.deckid)} style={styles.deleteButton}>
                <Ionicons name="trash-outline" size={24} color="#FF4444" />
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={theme.secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.textColor }]}>Card Vault</Text>
                <TouchableOpacity onPress={() => navigation.navigate('FlashcardSetup')}>
                    <Ionicons name="add-circle" size={32} color={theme.primaryColor} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.primaryColor} />
                </View>
            ) : (
                <FlatList
                    data={decks}
                    keyExtractor={(item) => item.deckid.toString()}
                    renderItem={renderDeckItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="copy-outline" size={80} color="rgba(255,255,255,0.2)" />
                            <Text style={[styles.emptyText, { color: 'gray' }]}>No flashcards yet. Transform a document into a deck!</Text>
                            <TouchableOpacity
                                style={[styles.createButton, { backgroundColor: theme.primaryColor }]}
                                onPress={() => navigation.navigate('FlashcardSetup')}
                            >
                                <Text style={styles.createButtonText}>Create New Deck</Text>
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
    deckCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 15, borderRadius: 15, borderWidth: 1, marginBottom: 15 },
    deckInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    iconCircle: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    textContainer: { flex: 1 },
    deckTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    deckStats: { fontSize: 14 },
    deleteButton: { padding: 10 },
    emptyContainer: { alignItems: 'center', marginTop: 100 },
    emptyText: { fontSize: 16, marginTop: 20, textAlign: 'center', paddingHorizontal: 40 },
    createButton: { marginTop: 30, paddingVertical: 15, paddingHorizontal: 30, borderRadius: 25 },
    createButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' }
});
