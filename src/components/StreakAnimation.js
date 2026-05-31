import React, { useEffect, useState, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions, Text, Easing } from 'react-native';

const { width, height } = Dimensions.get('window');
const PARTICLES_COUNT = 25;

const StreakAnimation = ({ playerClass }) => {
    const [isVisible, setIsVisible] = useState(true);

    let emoji = '🔥';
    if (playerClass === 'Gamer') emoji = '👾';
    else if (playerClass === 'Otaku') emoji = '🌸';
    else if (playerClass === 'Cinephile') emoji = '🍿';

    // Initialize Animated Values synchronously so they exist on first render
    const particles = useRef(
        Array.from({ length: PARTICLES_COUNT }).map((_, i) => {
            const centerX = width / 2;
            const centerY = height / 3;
            const angle = (Math.PI * 2 * i) / PARTICLES_COUNT;
            const distance = 100 + Math.random() * 200; // Explode outwards
            
            return {
                id: i,
                x: new Animated.Value(centerX),
                y: new Animated.Value(centerY),
                opacity: new Animated.Value(1),
                scale: new Animated.Value(0.01),
                targetX: centerX + Math.cos(angle) * distance,
                targetY: centerY + Math.sin(angle) * distance,
            };
        })
    ).current;

    useEffect(() => {
        const animations = particles.map((p) => {
            const duration = 1500 + Math.random() * 1000;

            return Animated.parallel([
                Animated.timing(p.scale, {
                    toValue: 1 + Math.random() * 1.5,
                    duration: 400,
                    easing: Easing.out(Easing.back(1.5)),
                    useNativeDriver: true,
                }),
                Animated.timing(p.x, {
                    toValue: p.targetX,
                    duration: duration,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(p.y, {
                    toValue: p.targetY,
                    duration: duration,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.sequence([
                    Animated.delay(duration * 0.5),
                    Animated.timing(p.opacity, {
                        toValue: 0,
                        duration: duration * 0.5,
                        useNativeDriver: true,
                    })
                ])
            ]);
        });

        // Small delay to ensure the screen has fully transitioned before playing
        const timeout = setTimeout(() => {
            Animated.parallel(animations).start(() => {
                setIsVisible(false);
            });
        }, 300);

        return () => clearTimeout(timeout);
    }, [particles]);

    if (!isVisible) return null;

    return (
        <View style={styles.container} pointerEvents="none">
            {particles.map((p) => (
                <Animated.View
                    key={p.id}
                    style={[
                        styles.particle,
                        {
                            transform: [
                                { translateX: p.x },
                                { translateY: p.y },
                                { scale: p.scale }
                            ],
                            opacity: p.opacity,
                        }
                    ]}
                >
                    <Text style={{ fontSize: 35 }}>{emoji}</Text>
                </Animated.View>
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        elevation: 9999,
    },
    particle: {
        position: 'absolute',
        top: -20,
        left: -20,
    }
});

export default StreakAnimation;
