import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export default function AnnouncementModal({ message, onClose }) {
    const { theme } = useTheme();
    const { primaryColor } = theme;

    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(50)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 0, duration: 400, useNativeDriver: true })
        ]).start();
    }, []);

    const handleDismiss = () => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
            Animated.timing(translateY, { toValue: 50, duration: 300, useNativeDriver: true })
        ]).start(() => onClose());
    };

    return (
        <Animated.View style={[styles.overlay, { opacity }]}>
            <Animated.View style={[styles.modalBox, { transform: [{ translateY }], borderColor: primaryColor }]}>
                <View style={styles.header}>
                    <Ionicons name="megaphone" size={28} color={primaryColor} />
                    <Text style={styles.title}>System Broadcast</Text>
                </View>
                <Text style={styles.message}>{message}</Text>
                
                <TouchableOpacity style={[styles.btn, { backgroundColor: primaryColor }]} onPress={handleDismiss}>
                    <Text style={styles.btnText}>Got it!</Text>
                </TouchableOpacity>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 9999, elevation: 9999
    },
    modalBox: {
        width: width * 0.85,
        backgroundColor: '#1A1A1A',
        borderRadius: 20, padding: 24,
        borderWidth: 2,
        shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 10 }
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
    title: { color: '#FFF', fontSize: 22, fontWeight: '900' },
    message: { color: '#CCC', fontSize: 16, lineHeight: 24, marginBottom: 24 },
    btn: {
        paddingVertical: 14, borderRadius: 12, alignItems: 'center'
    },
    btnText: { color: '#000', fontWeight: 'bold', fontSize: 16 }
});
