import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import StreakAnimation from './StreakAnimation';

const { width, height } = Dimensions.get('window');

export default function StreakIncreaseModal({ oldStreak, newStreak, playerClass, onComplete }) {
    const { theme } = useTheme();
    const { primaryColor, secondaryColor } = theme;

    const [currentNumber, setCurrentNumber] = useState(oldStreak);
    const [showExplosion, setShowExplosion] = useState(false);

    // Animations
    const bgOpacity = useRef(new Animated.Value(0)).current;
    const circleScale = useRef(new Animated.Value(0.01)).current; // Start hidden
    const textScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Sequence:
        // 1. Fade in BG
        // 2. Scale up circle with old number
        // 3. Pause
        // 4. "Pop" text down and up, changing number
        // 5. Trigger explosion
        // 6. Wait
        // 7. Fade out BG

        Animated.sequence([
            // 1. Fade in BG
            Animated.timing(bgOpacity, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            // 2. Pop circle in
            Animated.timing(circleScale, {
                toValue: 1,
                duration: 500,
                easing: Easing.out(Easing.back(1.5)),
                useNativeDriver: true,
            }),
            // 3. Pause for user to see old number
            Animated.delay(800),
            // 4. Animate text scale down
            Animated.timing(textScale, {
                toValue: 0.01,
                duration: 200,
                useNativeDriver: true,
            }),
        ]).start(() => {
            // Change number halfway through pop
            setCurrentNumber(newStreak);

            // Trigger explosion right when the new number pops up
            setShowExplosion(true);

            Animated.sequence([
                // Scale text back up with a bounce
                Animated.timing(textScale, {
                    toValue: 1.2,
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
                // 6. Wait for explosion to finish
                Animated.delay(2000),
                // 7. Fade entire modal out
                Animated.timing(bgOpacity, {
                    toValue: 0,
                    duration: 400,
                    useNativeDriver: true,
                })
            ]).start(() => {
                if (onComplete) onComplete();
            });
        });
    }, []);

    return (
        <Animated.View style={[styles.overlay, { opacity: bgOpacity }]}>
            {/* The Explosion is rendered behind the circle but inside the overlay */}
            {showExplosion && <StreakAnimation playerClass={playerClass} />}

            <Animated.View 
                style={[
                    styles.circle, 
                    { 
                        backgroundColor: 'rgba(0,0,0,0.8)', 
                        borderColor: secondaryColor,
                        transform: [{ scale: circleScale }] 
                    }
                ]}
            >
                <Text style={styles.emoji}>{theme.visualConfig?.streakEmoji || '🔥'}</Text>
                <Animated.Text 
                    style={[
                        styles.number, 
                        { 
                            color: secondaryColor,
                            transform: [{ scale: textScale }]
                        }
                    ]}
                >
                    {currentNumber}
                </Animated.Text>
            </Animated.View>

            <Animated.Text style={[styles.title, { opacity: circleScale, color: '#FFF' }]}>
                Streak Maintained!
            </Animated.Text>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.9)',
        zIndex: 10000,
        elevation: 10000,
        justifyContent: 'center',
        alignItems: 'center',
    },
    circle: {
        width: 200,
        height: 200,
        borderRadius: 100,
        borderWidth: 6,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#FFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    emoji: {
        fontSize: 60,
        marginBottom: 5,
    },
    number: {
        fontSize: 70,
        fontWeight: '900',
    },
    title: {
        marginTop: 40,
        fontSize: 28,
        fontWeight: 'bold',
        letterSpacing: 2,
    }
});
