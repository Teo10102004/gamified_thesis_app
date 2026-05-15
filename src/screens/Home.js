import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Dimensions, Animated, TouchableWithoutFeedback, ScrollView, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native'; // Import this to detect when the user looks at this screen
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { getCurrentUser, logoutUser } from '../services/authService';
import { fetchUserTotalXPWithReading } from '../services/userService';
import { useTheme } from '../context/ThemeContext'; // Sync colors into global theme after login


const { width, height } = Dimensions.get('window');
const MENU_WIDTH = width * 0.75;

export default function Home({ navigation }) {
    // We pull BOTH the current theme object AND the update function from our global context.
    const { theme, updateTheme } = useTheme();
    // Destructure colors for easier use in the UI
    const { primaryColor, secondaryColor } = theme;
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState({ level: 1, currentXP: 0 });
    const [loading, setLoading] = useState(true);

    // Menu Animation States
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;

    // --- THE REFRESH FIX ---
    // 'useFocusEffect' is a special tool from React Navigation.
    // It runs the code inside it EVERY TIME this screen becomes visible to the user.
    // This is perfect for updating the XP bar right after a quiz finishes!
    useFocusEffect(
        useCallback(() => {
            // We call our fetch function here so it runs every time we return to this screen.
            fetchUserProfile();

            // This 'return' part is optional, but it's where you'd put code to "clean up" if needed.
            return () => { };
        }, [])
    );

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

                // --- THE THEME SYNC FIX ---
                // After we successfully get the user's data from the database, we update the global theme.
                // This ensures that screens like 'QuizScreen' will use the correct colors for THIS user,
                // and won't accidentally use colors left over from a previous account.
                updateTheme({
                    primaryColor: data.primaryColor || '#FF00FF',
                    secondaryColor: data.secondaryColor || '#00FFFF',
                    backgroundColor: data.backgroundColor || '#000000',
                    fandomName: data.fandomName || 'Unknown',
                    visualConfig: data.visualConfig // Pass the AI-generated DNA
                });

                const xpData = await fetchUserTotalXPWithReading(user.id);
                if (xpData.success) {
                    setStats({
                        level: xpData.currentLevel,
                        currentXP: xpData.currentLevelXP
                    });
                }
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

    const xpForNextLevel = 500;
    const progress = stats.currentXP / xpForNextLevel;

    return (
        <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>

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

            {/* Player Identity Card with AI Visual DNA */}
            <View style={[
                styles.card, 
                { 
                    backgroundColor: 'rgba(0,0,0,0.5)', 
                    borderColor: primaryColor,
                    // --- AI GLOW ---
                    shadowColor: primaryColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: theme.visualConfig?.shadowOpacity || 0.5,
                    shadowRadius: theme.visualConfig?.glowIntensity || 10,
                    elevation: theme.visualConfig?.glowIntensity || 5,
                    borderRadius: theme.visualConfig?.borderRadius || 20
                }
            ]}>
                <Text style={[styles.fandomText, { color: secondaryColor }]}>{profile.fandomName}</Text>
                <Text style={[styles.userName, { color: primaryColor }]}>{profile.userName}</Text>
                <Text style={[styles.classBadge, { color: '#FFFFFF' }]}>
                    {(() => {
                        // Parse the AI-generated fandom rank array saved during Setup
                        // Falls back to the generic playerClass if ranks aren't generated yet
                        try {
                            const ranks = profile.fandom_ranks ? JSON.parse(profile.fandom_ranks) : null;
                            const rankTitle = ranks && ranks[stats.level - 1]
                                ? ranks[stats.level - 1]
                                : profile.playerClass;
                            return `Lv. ${stats.level}  ${rankTitle}`;
                        } catch {
                            return `Lv. ${stats.level}  ${profile.playerClass}`;
                        }
                    })()}
                </Text>
                
                <View style={styles.xpContainer}>
                    <View style={styles.xpTextRow}>
                        <Text style={{ color: '#FFFFFF', fontSize: 12 }}>XP Progress</Text>
                        <Text style={{ color: '#FFFFFF', fontSize: 12 }}>{stats.currentXP} / {xpForNextLevel}</Text>
                    </View>
                    <View style={[styles.xpTrack, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                        <View style={[styles.xpFill, { width: `${progress * 100}%`, backgroundColor: primaryColor }]} />
                    </View>
                </View>
            </View>

            <Text style={[styles.sectionTitle, { color: '#FFFFFF' }]}>Active Quests</Text>

            <TouchableOpacity 
                style={[
                    styles.questButton, 
                    { 
                        backgroundColor: 'rgba(0,0,0,0.4)', 
                        borderColor: secondaryColor,
                        // --- AI GLOW ---
                        shadowColor: secondaryColor,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: (theme.visualConfig?.shadowOpacity || 0.5) / 2,
                        shadowRadius: (theme.visualConfig?.glowIntensity || 10) / 2,
                        elevation: 5,
                        borderRadius: theme.visualConfig?.borderRadius || 15
                    }
                ]}
                onPress={() => {
                    // We now navigate to the Quest Library (Dashboard) instead of jumping straight to setup.
                    navigation.navigate('QuizDashboard');
                }}
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
            <Animated.View style={[
                styles.sidebar, 
                { 
                    transform: [{ translateX: slideAnim }], 
                    backgroundColor: 'rgba(10,10,10,0.95)', 
                    borderRightColor: primaryColor,
                    // --- SIDEBAR GLOW ---
                    shadowColor: primaryColor,
                    shadowOffset: { width: 5, height: 0 },
                    shadowOpacity: (theme.visualConfig?.shadowOpacity || 0.5) / 2,
                    shadowRadius: theme.visualConfig?.glowIntensity || 10
                }
            ]}>
                <View style={styles.sidebarHeader}>
                    {/* Show avatar photo if saved, otherwise fall back to the generic icon */}
                    {profile.avatarUrl ? (
                        <Image
                            source={{ uri: profile.avatarUrl }}
                            style={[
                                styles.sidebarAvatar,
                                { borderColor: primaryColor }
                            ]}
                        />
                    ) : (
                        <Ionicons name="person-circle" size={50} color={primaryColor} />
                    )}
                    <Text style={[styles.sidebarUsername, { color: primaryColor }]}>{profile.userName}</Text>
                    <Text style={{ color: 'gray' }}>{profile.playerClass}</Text>
                </View>

                <ScrollView contentContainerStyle={styles.menuItems}>
                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                        toggleMenu(); // Close the sidebar first
                        // Navigate to the new Quiz Dashboard (Quest Library)
                        navigation.navigate('QuizDashboard');
                    }}>
                        <Ionicons name="game-controller-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Quiz Engine</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                        toggleMenu(); // Close sidebar
                        navigation.navigate('FlashcardDashboard'); // Go to the vault
                    }}>
                        <Ionicons name="albums-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Flashcards</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                        toggleMenu();
                        navigation.navigate('LibraryDashboard');
                    }}>
                        <Ionicons name="library-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Learning Sessions</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert("Routing...", "To Community")}>
                        <Ionicons name="globe-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Community Feed</Text>
                    </TouchableOpacity>
                </ScrollView>

                {/* Bottom Settings Button - Now leads to the Command Center! */}
                <TouchableOpacity 
                    style={styles.settingsButton} 
                    onPress={() => {
                        toggleMenu(); // Close sidebar first
                        navigation.navigate('ProfileSettings');
                    }}
                >
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
    sidebarAvatar: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, marginBottom: 4 },
    sidebarUsername: { fontSize: 22, fontWeight: 'bold', marginTop: 10 },
    menuItems: { flexGrow: 1 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
    menuText: { fontSize: 18, marginLeft: 15, fontWeight: '500' },
    settingsButton: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, borderTopWidth: 1, borderTopColor: '#333' }
});