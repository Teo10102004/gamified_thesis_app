import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getDeckCards } from '../services/userService';

export default function FlashcardStudy({ navigation, route }) {
    const { theme } = useTheme();
    const { deckId, deckTitle } = route.params;

    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);

    // Animation values
    const flipAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadCards();
    }, []);

    //Fetch the cards function
    const loadCards = async () => {
        try {
            const result = await getDeckCards(deckId);
            if (result.success) setCards(result.cards);
        } catch (error) {
            Alert.alert("Error", "Failed to load cards.");
        } finally {
            setLoading(false);
        }
    };

    //Function to flip the cards 
    const handleFlip = () => {
        const toValue = isFlipped ? 0 : 180;
        Animated.spring(flipAnim, {
            toValue,
            friction: 8,
            tension: 10,
            useNativeDriver: true,
        }).start();
        setIsFlipped(!isFlipped);
    };

    //Function to move to the next card
    const handleNext = () => {
        if (currentIndex < cards.length - 1) {
            // Reset flip before moving to next
            setIsFlipped(false);
            flipAnim.setValue(0);
            setCurrentIndex(currentIndex + 1);
        } else {
            Alert.alert("Session Complete!", "You've reviewed all cards in this deck.", [
                { text: "Finish", onPress: () => navigation.goBack() }
            ]);
        }
    };

    // Interpolate the rotation for the 3D effect
    const frontInterpolate = flipAnim.interpolate({
        inputRange: [0, 180],
        outputRange: ['0deg', '180deg'],
    });
    const backInterpolate = flipAnim.interpolate({
        inputRange: [0, 180],
        outputRange: ['180deg', '360deg'],
    });

    const frontOpacity = flipAnim.interpolate({
        inputRange: [89, 90],
        outputRange: [1, 0],
    });
    const backOpacity = flipAnim.interpolate({
        inputRange: [89, 90],
        outputRange: [0, 1],
    });

    if (loading) return (
        <View style={[styles.center, { backgroundColor: theme.backgroundColor }]}>
            <ActivityIndicator size="large" color={theme.primaryColor} />
        </View>
    );

    if (cards.length === 0) return (
        <View style={[styles.center, { backgroundColor: theme.backgroundColor }]}>
            <Text style={{ color: theme.textColor }}>No cards found in this deck.</Text>
        </View>
    );

    const currentCard = cards[currentIndex];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={28} color={theme.secondaryColor} />
                </TouchableOpacity>
                <View style={styles.headerTextContainer}>
                    <Text style={[styles.headerTitle, { color: theme.textColor }]}>{deckTitle}</Text>
                    <Text style={[styles.headerSubtitle, { color: 'gray' }]}>Card {currentIndex + 1} of {cards.length}</Text>
                </View>
                <View style={{ width: 28 }} />
            </View>

            <View style={styles.studyArea}>
                <TouchableOpacity activeOpacity={1} onPress={handleFlip} style={styles.cardContainer}>
                    {/* Front Side */}
                    <Animated.View style={[
                        styles.card, 
                        { 
                            borderColor: theme.primaryColor, 
                            transform: [{ rotateY: frontInterpolate }],
                            opacity: frontOpacity
                        }
                    ]}>
                        <Text style={[styles.cardText, { color: theme.textColor }]}>{currentCard.front}</Text>
                        <Text style={styles.hint}>Tap to reveal answer</Text>
                    </Animated.View>

                    {/* Back Side */}
                    <Animated.View style={[
                        styles.card, 
                        styles.cardBack,
                        { 
                            borderColor: theme.secondaryColor, 
                            transform: [{ rotateY: backInterpolate }],
                            opacity: backOpacity
                        }
                    ]}>
                        <Text style={[styles.cardText, { color: theme.textColor }]}>{currentCard.back}</Text>
                        <Text style={[styles.hint, { color: theme.secondaryColor }]}>Tap to flip back</Text>
                    </Animated.View>
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <TouchableOpacity style={[styles.actionBtn, { borderColor: 'gray' }]} onPress={handleNext}>
                    <Text style={{ color: 'gray', fontWeight: 'bold' }}>SKIP</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: theme.primaryColor, flex: 2 }]} 
                    onPress={handleNext}
                >
                    <Text style={styles.actionBtnText}>GOT IT</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    headerTextContainer: { alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },
    headerSubtitle: { fontSize: 12 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    studyArea: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    cardContainer: { width: '100%', height: 400 },
    card: { 
        position: 'absolute',
        width: '100%', 
        height: '100%', 
        backgroundColor: 'rgba(255,255,255,0.05)', 
        borderRadius: 25, 
        borderWidth: 2, 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: 30,
        backfaceVisibility: 'hidden' 
    },
    cardBack: { backgroundColor: 'rgba(0,0,0,0.4)' },
    cardText: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
    hint: { position: 'absolute', bottom: 30, color: 'gray', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    footer: { flexDirection: 'row', padding: 30, gap: 15 },
    actionBtn: { height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', borderWidth: 1, flex: 1 },
    actionBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 }
});
