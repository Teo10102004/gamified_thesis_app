import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import FandomAnimation from './FandomAnimation';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function LevelUpModal({ oldLevel, newLevel, newRankTitle, onComplete }) {
    const { theme } = useTheme();
    const { primaryColor, secondaryColor, visualConfig } = theme;

    const [currentLevelNum, setCurrentLevelNum] = useState(oldLevel);

    // Animations
    const bgOpacity = useRef(new Animated.Value(0)).current;
    const circleScale = useRef(new Animated.Value(0.01)).current; 
    const textScale = useRef(new Animated.Value(1)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Animation Sequence:
        // 1. Fade in background
        // 2. Pop in old level circle
        // 3. Pause
        // 4. Shrink text, swap number, explode text
        // 5. Fade in celebratory text

        Animated.sequence([
            // 1. Fade in BG
            Animated.timing(bgOpacity, {
                toValue: 1,
                duration: 500,
                useNativeDriver: true,
            }),
            // 2. Pop circle in with old level
            Animated.timing(circleScale, {
                toValue: 1,
                duration: 600,
                easing: Easing.out(Easing.back(1.5)),
                useNativeDriver: true,
            }),
            // 3. Pause to register old level
            Animated.delay(800),
            // 4. Shrink text down quickly
            Animated.timing(textScale, {
                toValue: 0.01,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            // Swap the number when it's shrunk
            setCurrentLevelNum(newLevel);

            Animated.sequence([
                // Explode text back up
                Animated.timing(textScale, {
                    toValue: 1.3,
                    duration: 300,
                    easing: Easing.out(Easing.back(2)),
                    useNativeDriver: true,
                }),
                // Settle text scale
                Animated.timing(textScale, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                // 5. Fade in the "LEVEL UP!" and Rank titles
                Animated.timing(textOpacity, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
            ]).start();
        });
    }, []);

    const handleDismiss = () => {
        Animated.timing(bgOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
        }).start(() => {
            if (onComplete) onComplete();
        });
    };

    return (
        <Animated.View style={[styles.overlay, { opacity: bgOpacity }]}>
            {/* Ambient Fandom Background Animation */}
            {visualConfig?.animationType && (
                <View style={StyleSheet.absoluteFillObject} opacity={0.6}>
                    <FandomAnimation 
                        animationType={visualConfig.animationType} 
                        color={primaryColor} 
                        secondaryColor={secondaryColor} 
                    />
                </View>
            )}

            <View style={styles.contentContainer}>
                <Animated.Text style={[styles.title, { opacity: textOpacity, color: primaryColor, textShadowColor: primaryColor }]}>
                    LEVEL UP!
                </Animated.Text>

                <Animated.View 
                    style={[
                        styles.circle, 
                        { 
                            backgroundColor: 'rgba(10,10,10,0.9)', 
                            borderColor: secondaryColor,
                            shadowColor: secondaryColor,
                            transform: [{ scale: circleScale }] 
                        }
                    ]}
                >
                    <Text style={[styles.lvText, { color: 'gray' }]}>Lv.</Text>
                    <Animated.Text 
                        style={[
                            styles.number, 
                            { 
                                color: secondaryColor,
                                transform: [{ scale: textScale }]
                            }
                        ]}
                    >
                        {currentLevelNum}
                    </Animated.Text>
                </Animated.View>

                <Animated.View style={[styles.rankContainer, { opacity: textOpacity }]}>
                    <Text style={styles.rankSubtitle}>Rank Unlocked</Text>
                    <Text style={[styles.rankTitle, { color: '#FFF' }]}>
                        {newRankTitle}
                    </Text>
                </Animated.View>

                <Animated.View style={{ opacity: textOpacity, marginTop: 50 }}>
                    <TouchableOpacity 
                        style={[styles.continueButton, { backgroundColor: primaryColor }]} 
                        onPress={handleDismiss}
                    >
                        <Text style={styles.continueText}>Continue</Text>
                        <Ionicons name="arrow-forward" size={20} color="#000" />
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.92)',
        zIndex: 10000,
        elevation: 10000,
        justifyContent: 'center',
        alignItems: 'center',
    },
    contentContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        padding: 20,
        zIndex: 10,
    },
    title: {
        fontSize: 48,
        fontWeight: '900',
        letterSpacing: 4,
        marginBottom: 40,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    circle: {
        width: 180,
        height: 180,
        borderRadius: 90,
        borderWidth: 4,
        justifyContent: 'center',
        alignItems: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 25,
        elevation: 15,
        marginBottom: 40,
    },
    lvText: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: -10,
    },
    number: {
        fontSize: 80,
        fontWeight: '900',
    },
    rankContainer: {
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    rankSubtitle: {
        fontSize: 14,
        color: 'gray',
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 5,
    },
    rankTitle: {
        fontSize: 26,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    continueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 25,
        borderRadius: 30,
    },
    continueText: {
        color: '#000',
        fontWeight: 'bold',
        fontSize: 18,
        marginRight: 8,
    }
});
