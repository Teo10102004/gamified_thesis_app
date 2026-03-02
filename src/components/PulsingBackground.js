import React, {useEffect, useRef} from "react"; //these will help us create the pulsing animation effect by allowing us to create a reference to the animated value and perform side effects when the component mounts
import { Animated, Easing, StyleSheet, View } from "react-native"; //Animated is a library that provides a way to create smooth and performant animations in React Native. StyleSheet is used to create styles for the component, and View is a basic building block for the UI.

export default function PulsingBackground({ color = "#FF00FF"}) {
    //animated values for scale and opacity
    const scale = useRef(new Animated.Value(1)).current;
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        //defining the animation loop
        const pulseAnimation = Animated.loop(
            Animated.parallel([
                Animated.sequence([
                Animated.timing(scale, {
                    toValue: 1.2, // Scale up to 1.2 times the original size
                    duration: 2000, // Duration of the animation in milliseconds
                    easing: Easing.inOut(Easing.ease), // this is used for a smooth transition between the start and end values of the animation, creating a more natural pulsing effect
                    useNativeDriver: true, // Use native driver for better performance
                }),
                Animated.timing(scale, {
                    toValue: 1, 
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),

            ]),
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.5, // Fade opacity to 0.5 (half transparent)
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 1, // Fade opacity back to 1 (fully opaque)
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        ])
    );


        pulseAnimation.start(); // Start the animation loop
        return () => pulseAnimation.stop(); // Clean up the animation when the component unmounts

    }, []);

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    backgroundColor: color, // Set the background color to the provided color prop (default is neon pink)
                    transform: [{ scale }], 
                    opacity, 
                },
            ]}
        />
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute', 
        bottom: -700 , 
        left: -150, 
        width: 300, 
        height: 300, 
        borderRadius: 150, 
    },
});