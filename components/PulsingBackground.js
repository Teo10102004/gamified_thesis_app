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
        //we make it wavy at the top of the screen by giving it a large border radius, and we make it larger than the screen width to create a more dramatic pulsing effect as it scales up and down.
        position: 'absolute', // Position the pulsing background absolutely to allow it to overlap other content
        bottom: -700 , // Move the pulsing background up to create a wavy effect at the top of the screen
        left: -150, // Move the pulsing background to the left to center it on the screen
        width: 300, // Set the width of the pulsing background to be larger than the screen width for a more dramatic effect
        height: 300, // Set the height of the pulsing background
        borderRadius: 150, // Make the pulsing background circular by setting a large border radius
    },
});