import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';

const { width, height } = Dimensions.get('window');
const NUM_PARTICLES = 30; // Max number of particles

const Particle = ({ type, color, secondaryColor }) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const translateX = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(1)).current;

    const [config] = useState(() => {
        const size = Math.random() * 6 + 2;
        const startX = Math.random() * width;
        const speed = Math.random() * 4000 + 3000;
        const delay = Math.random() * 3000; // Shorter delay so they appear faster
        return { size, startX, speed, delay };
    });

    useEffect(() => {
        let isMounted = true;

        const animateParticle = () => {
            if (!isMounted) return;

            if (type === 'embers') {
                translateY.setValue(height);
                translateX.setValue(config.startX);
                opacity.setValue(0);
                scale.setValue(1);

                Animated.sequence([
                    Animated.delay(Math.random() * 2000), // Randomize slightly on each loop
                    Animated.parallel([
                        Animated.timing(opacity, { toValue: Math.random() * 0.8 + 0.2, duration: 500, useNativeDriver: true }),
                        Animated.timing(translateY, { toValue: -100, duration: config.speed, useNativeDriver: true }),
                        Animated.timing(translateX, { toValue: config.startX + (Math.random() * 100 - 50), duration: config.speed, useNativeDriver: true }),
                        Animated.sequence([
                            Animated.delay(config.speed * 0.8),
                            Animated.timing(opacity, { toValue: 0, duration: config.speed * 0.2, useNativeDriver: true })
                        ])
                    ])
                ]).start(({ finished }) => {
                    if (finished) animateParticle();
                });
            } else if (type === 'snow') {
                translateY.setValue(-50);
                translateX.setValue(config.startX);
                // Start with lower opacity to fade in nicely
                opacity.setValue(0);
                
                Animated.sequence([
                    Animated.delay(Math.random() * 2000),
                    Animated.parallel([
                        Animated.timing(opacity, { toValue: Math.random() * 0.5 + 0.3, duration: 1000, useNativeDriver: true }),
                        Animated.timing(translateY, { toValue: height + 50, duration: config.speed * 1.5, useNativeDriver: true }),
                        Animated.timing(translateX, { toValue: config.startX + (Math.random() * 100 - 50), duration: config.speed * 1.5, useNativeDriver: true }),
                        Animated.sequence([
                            Animated.delay(config.speed * 1.2),
                            Animated.timing(opacity, { toValue: 0, duration: config.speed * 0.3, useNativeDriver: true })
                        ])
                    ])
                ]).start(({ finished }) => {
                    if (finished) animateParticle();
                });
            } else if (type === 'bubbles') {
                translateY.setValue(height + 50);
                translateX.setValue(config.startX);
                opacity.setValue(0);
                
                Animated.sequence([
                    Animated.delay(Math.random() * 2000),
                    Animated.parallel([
                        Animated.timing(opacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
                        Animated.timing(translateY, { toValue: -50, duration: config.speed * 1.2, useNativeDriver: true }),
                        Animated.timing(scale, { toValue: 1.5, duration: config.speed * 1.2, useNativeDriver: true }),
                        Animated.sequence([
                            Animated.delay(config.speed * 1.0),
                            Animated.timing(opacity, { toValue: 0, duration: config.speed * 0.2, useNativeDriver: true })
                        ])
                    ])
                ]).start(({ finished }) => {
                    if (finished) animateParticle();
                });
            } else if (type === 'stars') {
                translateY.setValue(Math.random() * height);
                translateX.setValue(config.startX);
                opacity.setValue(0);
                scale.setValue(Math.random() * 1.5 + 0.5);
                
                Animated.sequence([
                    Animated.delay(Math.random() * 2000),
                    Animated.timing(opacity, { toValue: Math.random() * 0.8 + 0.2, duration: 2000, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0.1, duration: 2000, useNativeDriver: true })
                ]).start(({ finished }) => {
                    if (finished) animateParticle();
                });
            } else if (type === 'matrix') {
                 translateY.setValue(-100);
                 translateX.setValue(config.startX);
                 opacity.setValue(0);
                 scale.setValue(Math.random() * 1 + 0.5);

                 Animated.sequence([
                    Animated.delay(Math.random() * 2000),
                    Animated.parallel([
                        Animated.timing(opacity, { toValue: 0.8, duration: 200, useNativeDriver: true }),
                        Animated.timing(translateY, { toValue: height + 100, duration: config.speed * 0.8, useNativeDriver: true }),
                        Animated.sequence([
                            Animated.delay(config.speed * 0.6),
                            Animated.timing(opacity, { toValue: 0, duration: config.speed * 0.2, useNativeDriver: true })
                        ])
                    ])
                ]).start(({ finished }) => {
                    if (finished) animateParticle();
                });
            } else if (type === 'particles') {
                translateY.setValue(height + 50);
                translateX.setValue(config.startX);
                opacity.setValue(0);
                
                Animated.sequence([
                    Animated.delay(Math.random() * 2000),
                    Animated.parallel([
                        Animated.timing(opacity, { toValue: 0.4, duration: 2000, useNativeDriver: true }),
                        Animated.timing(translateY, { toValue: -50, duration: config.speed * 2, useNativeDriver: true }),
                        Animated.timing(translateX, { toValue: config.startX + (Math.random() * 60 - 30), duration: config.speed * 2, useNativeDriver: true }),
                        Animated.sequence([
                            Animated.delay(config.speed * 1.5),
                            Animated.timing(opacity, { toValue: 0, duration: config.speed * 0.5, useNativeDriver: true })
                        ])
                    ])
                ]).start(({ finished }) => {
                    if (finished) animateParticle();
                });
            }
        };

        // Kick off the first animation after the initial delay!
        setTimeout(animateParticle, config.delay);

        return () => {
            isMounted = false;
        };
    }, [type]);

    const getStyle = () => {
        if (type === 'embers') {
            return {
                width: config.size,
                height: config.size,
                borderRadius: config.size / 2,
                backgroundColor: color || '#FF4500',
                shadowColor: color || '#FF4500',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: config.size,
            };
        } else if (type === 'snow') {
            return {
                width: config.size * 1.5,
                height: config.size * 1.5,
                borderRadius: config.size * 0.75,
                backgroundColor: '#FFFFFF',
                opacity: 0.8,
            };
        } else if (type === 'bubbles') {
            return {
                width: config.size * 2,
                height: config.size * 2,
                borderRadius: config.size,
                borderWidth: 1,
                borderColor: secondaryColor || color || '#00FFFF',
                backgroundColor: 'transparent',
            };
        } else if (type === 'stars') {
            return {
                width: 3,
                height: 3,
                borderRadius: 1.5,
                backgroundColor: '#FFFFFF',
                shadowColor: '#FFFFFF',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 5,
            };
        } else if (type === 'matrix') {
             return {
                 width: 2,
                 height: config.size * 10,
                 backgroundColor: color || '#00FF00',
                 opacity: 0.8,
             };
        } else if (type === 'particles') {
            return {
                width: config.size,
                height: config.size,
                borderRadius: config.size / 2,
                backgroundColor: color || '#FFFFFF',
                opacity: 0.5,
                shadowColor: color || '#FFFFFF',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: config.size,
            };
        }
        return {};
    };

    // Removed early return for 'none' to allow the fallback to kick in

    return (
        <Animated.View
            style={[
                styles.particle,
                getStyle(),
                {
                    transform: [
                        { translateY },
                        { translateX },
                        { scale }
                    ],
                    opacity,
                }
            ]}
        />
    );
};

export default function FandomAnimation({ animationType, color, secondaryColor }) {
    // If the AI decides not to assign an animation ('none') or fails to, we fall back to a subtle 'particles' animation
    // so the dashboard always feels alive and immersive.
    const resolvedType = (!animationType || animationType === 'none') ? 'particles' : animationType;

    const particles = Array.from({ length: NUM_PARTICLES }).map((_, i) => (
        <Particle key={i} type={resolvedType} color={color} secondaryColor={secondaryColor} />
    ));

    return (
        <View style={styles.container} pointerEvents="none">
            {particles}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
    },
    particle: {
        position: 'absolute',
        top: 0,
        left: 0,
    }
});
