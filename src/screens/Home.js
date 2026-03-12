import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Dimensions, Animated, TouchableWithoutFeedback, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { getCurrentUser, logoutUser } from '../services/authService';

const { width, height } = Dimensions.get('window');
const MENU_WIDTH = width * 0.75; 

export default function Home({ navigation }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Menu Animation States
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current; 

    useEffect(() => {
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        try {
            const user = await getCurrentUser();
            if (user) {
                const { data, error } = await supabase
                    .from('User')
                    .select('*')
                    .eq('userId', user.id)
                    .single();

                if (error) throw error;
                setProfile(data);
            }
        } catch (error) {
            Alert.alert('Supabase Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logoutUser();
            navigation.replace('Auth');
        } catch (error) {
            Alert.alert('Error', 'Failed to logout.');
        }
    };

    const toggleMenu = () => {
        const toValue = isMenuOpen ? -MENU_WIDTH : 0;
        Animated.timing(slideAnim, {
            toValue,
            duration: 300,
            useNativeDriver: true,
        }).start();
        setIsMenuOpen(!isMenuOpen);
    };

    if (loading || !profile) {
        return (
            <View style={[styles.centerContainer, { backgroundColor: '#000' }]}>
                <ActivityIndicator size="large" color="#FF00FF" />
            </View>
        );
    }

    // Safely get colors from DB
    const primaryColor = profile.primaryColor || '#FF00FF';
    const secondaryColor = profile.secondaryColor || '#00FFFF';
    const backgroundColor = profile.backgroundColor || '#000000';

    const currentXP = 350;
    const xpForNextLevel = 500;
    const progress = currentXP / xpForNextLevel;

    return (
        <View style={[styles.container, { backgroundColor: backgroundColor }]}>
            
            {/* Top Bar */}
            <View style={styles.topBar}>
                <TouchableOpacity onPress={toggleMenu} style={{ zIndex: 10 }}>
                    <Ionicons name="menu" size={32} color={secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.welcomeText, { color: '#FFFFFF' }]}>Player Hub</Text>
                <TouchableOpacity onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={28} color={secondaryColor} />
                </TouchableOpacity>
            </View>

            {/* Player Identity Card */}
            <View style={[styles.card, { backgroundColor: 'rgba(0,0,0,0.5)', borderColor: primaryColor }]}>
                <Text style={[styles.fandomText, { color: secondaryColor }]}>{profile.fandomName}</Text>
                <Text style={[styles.userName, { color: primaryColor }]}>{profile.userName}</Text>
                <Text style={[styles.classBadge, { color: '#FFFFFF' }]}>Lv. 1 {profile.playerClass}</Text>
                
                <View style={styles.xpContainer}>
                    <View style={styles.xpTextRow}>
                        <Text style={{ color: '#FFFFFF', fontSize: 12 }}>XP Progress</Text>
                        <Text style={{ color: '#FFFFFF', fontSize: 12 }}>{currentXP} / {xpForNextLevel}</Text>
                    </View>
                    <View style={[styles.xpTrack, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                        <View style={[styles.xpFill, { width: `${progress * 100}%`, backgroundColor: primaryColor }]} />
                    </View>
                </View>
            </View>

            <Text style={[styles.sectionTitle, { color: '#FFFFFF' }]}>Active Quests</Text>
            
            <TouchableOpacity 
                style={[styles.questButton, { backgroundColor: 'rgba(0,0,0,0.4)', borderColor: secondaryColor }]}
                onPress={() => Alert.alert("Coming Soon", "The Quiz Engine is next!")}
            >
                <View style={styles.questInfo}>
                    <Ionicons name="skull" size={32} color={secondaryColor} />
                    <View style={styles.questTextContainer}>
                        <Text style={[styles.questTitle, { color: '#FFFFFF' }]}>Daily Knowledge Check</Text>
                        <Text style={[styles.questReward, { color: primaryColor }]}>+150 XP Reward</Text>
                    </View>
                </View>
                <Ionicons name="play-circle" size={40} color={primaryColor} />
            </TouchableOpacity>

            {/* --- SLIDE OUT MENU OVERLAY --- */}
            {isMenuOpen && (
                <TouchableWithoutFeedback onPress={toggleMenu}>
                    <View style={styles.overlay} />
                </TouchableWithoutFeedback>
            )}

            {/* --- ANIMATED SIDEBAR --- */}
            <Animated.View style={[styles.sidebar, { transform: [{ translateX: slideAnim }], backgroundColor: 'rgba(10,10,10,0.95)', borderRightColor: primaryColor }]}>
                <View style={styles.sidebarHeader}>
                    <Ionicons name="person-circle" size={50} color={primaryColor} />
                    <Text style={[styles.sidebarUsername, { color: primaryColor }]}>{profile.userName}</Text>
                    <Text style={{ color: 'gray' }}>{profile.playerClass}</Text>
                </View>

                {/* Sidebar Navigation Items */}
                <ScrollView contentContainerStyle={styles.menuItems}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert("Routing...", "To Quizzes")}>
                        <Ionicons name="game-controller-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Quiz Engine</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert("Routing...", "To Flashcards")}>
                        <Ionicons name="albums-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Flashcards</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert("Routing...", "To Learning Sessions")}>
                        <Ionicons name="hourglass-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Learning Sessions</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert("Routing...", "To Community")}>
                        <Ionicons name="globe-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Community Feed</Text>
                    </TouchableOpacity>
                </ScrollView>

                {/* Bottom Settings Button */}
                <TouchableOpacity style={styles.settingsButton} onPress={() => Alert.alert("Routing...", "To Settings")}>
                    <Ionicons name="settings-outline" size={24} color="gray" />
                    <Text style={{ color: 'gray', marginLeft: 15, fontSize: 16 }}>Settings</Text>
                </TouchableOpacity>
            </Animated.View>

        </View>
    );
}

const styles = StyleSheet.create({
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1, padding: 20, paddingTop: 60 },
    topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
    welcomeText: { fontSize: 24, fontWeight: 'bold' },
    card: { padding: 25, borderRadius: 20, borderWidth: 1, marginBottom: 40 },
    fandomText: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5 },
    userName: { fontSize: 36, fontWeight: '900', marginBottom: 5 },
    classBadge: { fontSize: 16, fontWeight: '600', opacity: 0.8 },
    xpContainer: { marginTop: 25 },
    xpTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    xpTrack: { width: '100%', height: 12, borderRadius: 10, overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: 10 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
    questButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 15, borderWidth: 1 },
    questInfo: { flexDirection: 'row', alignItems: 'center' },
    questTextContainer: { marginLeft: 15 },
    questTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    questReward: { fontSize: 14, fontWeight: 'bold' },
    
    // Sidebar Styles
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 },
    sidebar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: MENU_WIDTH, zIndex: 100, paddingVertical: 60, paddingHorizontal: 20, borderRightWidth: 1, elevation: 20, shadowColor: '#000', shadowOffset: { width: 5, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10 },
    sidebarHeader: { borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 20, marginBottom: 20 },
    sidebarUsername: { fontSize: 22, fontWeight: 'bold', marginTop: 10 },
    menuItems: { flexGrow: 1 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
    menuText: { fontSize: 18, marginLeft: 15, fontWeight: '500' },
    settingsButton: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, borderTopWidth: 1, borderTopColor: '#333' }
});