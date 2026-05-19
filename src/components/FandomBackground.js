import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import FandomAnimation from './FandomAnimation';

export default function FandomBackground({ showAnimation = false }) {
    const { theme } = useTheme();

    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {/* 1. Fandom Background Image (if available) */}
            {theme.visualConfig?.backgroundImageUrl && (
                <Image 
                    source={{ uri: theme.visualConfig.backgroundImageUrl }} 
                    style={StyleSheet.absoluteFillObject} 
                    resizeMode="cover"
                    blurRadius={8} // Soften the image so it's not overstimulating
                />
            )}
            
            {/* 2. Dark Cinematic Overlay: Ensures text is always readable */}
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.75)' }]} />

            {/* 3. Particle Animation Layer (Only on Home Dashboard) */}
            {showAnimation && (
                <FandomAnimation 
                    animationType={theme.visualConfig?.animationType} 
                    color={theme.primaryColor} 
                    secondaryColor={theme.secondaryColor} 
                />
            )}
        </View>
    );
}
