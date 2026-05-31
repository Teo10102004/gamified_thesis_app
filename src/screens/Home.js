import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Dimensions, Animated, TouchableWithoutFeedback, ScrollView, Image, Linking, TextInput, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native'; // Import this to detect when the user looks at this screen
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { getCurrentUser, logoutUser } from '../services/authService';
import { fetchUserTotalXPWithReading, getUserQuizzes, fetchQuizQuestions } from '../services/userService';
import { useTheme } from '../context/ThemeContext'; // Sync colors into global theme after login
import AsyncStorage from '@react-native-async-storage/async-storage';
import FandomBackground from '../components/FandomBackground';
import StreakIncreaseModal from '../components/StreakIncreaseModal';
import LevelUpModal from '../components/LevelUpModal';
import { getAllAnnouncements } from '../services/notificationService';

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
    const [activeQuests, setActiveQuests] = useState([]);
    
    // Modal States
    const [showStreakModal, setShowStreakModal] = useState(false);
    const [modalData, setModalData] = useState({ oldStreak: 0, newStreak: 0 });
    
    // Level Up Modal States
    const [showLevelUpModal, setShowLevelUpModal] = useState(false);
    const [levelUpData, setLevelUpData] = useState({ oldLevel: 1, newLevel: 1, newRankTitle: '' });

    // Notification Badge State
    const [unreadCount, setUnreadCount] = useState(0);

    // Menu Animation States
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const slideAnim = useRef(new Animated.Value(-MENU_WIDTH)).current;

    // Spotify State
    const [customSpotifyUrl, setCustomSpotifyUrl] = useState('');
    const [showSpotifySettings, setShowSpotifySettings] = useState(false);
    const [tempSpotifyUrl, setTempSpotifyUrl] = useState('');

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

                // Streak Increase Logic
                if (data.streak_count > 0 && data.last_active_date) {
                    const todayStr = new Date().toISOString().split('T')[0];
                    // Only trigger if their active date matches local today (they earned it today)
                    if (data.last_active_date === todayStr) {
                        const animKey = `streakAnimShown_${user.id}_${todayStr}`;
                        const hasShown = await AsyncStorage.getItem(animKey);
                        
                        if (hasShown !== 'true') {
                            setModalData({ 
                                oldStreak: Math.max(0, data.streak_count - 1), 
                                newStreak: data.streak_count 
                            });
                            setShowStreakModal(true);
                            await AsyncStorage.setItem(animKey, 'true');
                        }
                    }
                }

                const xpData = await fetchUserTotalXPWithReading(user.id);
                if (xpData.success) {
                    const currentLevel = xpData.currentLevel;
                    
                    // Determine Rank Title for Level Up Modal
                    let rankTitle = data.playerClass;
                    try {
                        const ranks = data.fandom_ranks ? JSON.parse(data.fandom_ranks) : null;
                        if (ranks && ranks.length > 0) {
                            const rankIndex = Math.min(currentLevel - 1, ranks.length - 1);
                            rankTitle = ranks[rankIndex];
                        }
                    } catch (e) {}

                    // Level Up Detection Logic
                    const prevLevelKey = `prevLevel_${user.id}`;
                    const prevLevelStr = await AsyncStorage.getItem(prevLevelKey);
                    
                    if (prevLevelStr) {
                        const prevLevel = parseInt(prevLevelStr, 10);
                        if (currentLevel > prevLevel) {
                            setLevelUpData({ oldLevel: prevLevel, newLevel: currentLevel, newRankTitle: rankTitle });
                            setShowLevelUpModal(true);
                        }
                    }
                    
                    await AsyncStorage.setItem(prevLevelKey, currentLevel.toString());

                    setStats({
                        level: currentLevel,
                        currentXP: xpData.currentLevelXP
                    });
                }
                
                // Fetch user quizzes and filter for Active Quests
                const quizzesData = await getUserQuizzes(user.id);
                if (quizzesData.success) {
                    const active = quizzesData.quizzes.filter(q => q.bestScore < q.max_xp);
                    setActiveQuests(active);
                }

                // Check for Unread Announcements to display badge
                const annRes = await getAllAnnouncements();
                if (annRes.success && annRes.announcements) {
                    const lastSeenIdStr = await AsyncStorage.getItem(`last_seen_notification_${user.id}`);
                    const lastSeenId = parseInt(lastSeenIdStr) || 0;
                    
                    const unread = annRes.announcements.filter(a => a.id > lastSeenId).length;
                    setUnreadCount(unread);
                }

                // Load custom Spotify URL
                const savedSpotify = await AsyncStorage.getItem(`spotifyUrl_${user.id}`);
                if (savedSpotify) {
                    setCustomSpotifyUrl(savedSpotify);
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

    const handleOpenSpotify = async () => {
        let targetUrl = customSpotifyUrl.trim();
        if (!targetUrl) {
            targetUrl = 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn';
        }
        let spotifyUri = targetUrl;
        if (targetUrl.includes('open.spotify.com')) {
            const urlParts = targetUrl.split('open.spotify.com/')[1]?.split('?')[0]; 
            if (urlParts) {
                spotifyUri = `spotify:${urlParts.replace('/', ':')}`;
            }
        }
        try {
            const supported = await Linking.canOpenURL(spotifyUri);
            if (supported) {
                await Linking.openURL(spotifyUri);
            } else {
                await Linking.openURL(targetUrl); 
            }
        } catch (error) {
            Alert.alert("Error", "Could not open Spotify.");
        }
    };

    const handleSaveSpotifyUrl = async () => {
        const user = await getCurrentUser();
        if (!user) return;
        try {
            await AsyncStorage.setItem(`spotifyUrl_${user.id}`, tempSpotifyUrl);
            setCustomSpotifyUrl(tempSpotifyUrl);
            setShowSpotifySettings(false);
            Alert.alert("Saved", "Your custom Spotify playlist has been linked!");
        } catch (error) {
            Alert.alert("Error", "Failed to save Spotify URL.");
        }
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
        <View style={styles.container}>
            <FandomBackground showAnimation={true} />
            
            {showStreakModal && profile && (
                <StreakIncreaseModal 
                    oldStreak={modalData.oldStreak}
                    newStreak={modalData.newStreak}
                    playerClass={profile.playerClass}
                    onComplete={() => setShowStreakModal(false)}
                />
            )}

            {showLevelUpModal && (
                <LevelUpModal
                    oldLevel={levelUpData.oldLevel}
                    newLevel={levelUpData.newLevel}
                    newRankTitle={levelUpData.newRankTitle}
                    onComplete={() => setShowLevelUpModal(false)}
                />
            )}

            {/* Top Bar */}
            <View style={styles.topBar}>
                <TouchableOpacity onPress={toggleMenu} style={{ zIndex: 10 }}>
                    <Ionicons name="menu" size={32} color={secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.welcomeText, { color: '#FFFFFF', flex: 1, textAlign: 'center', marginHorizontal: 10 }]} numberOfLines={1} adjustsFontSizeToFit>Player Hub</Text>
                
                <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
                    <TouchableOpacity 
                        onPress={handleOpenSpotify}
                        onLongPress={() => {
                            setTempSpotifyUrl(customSpotifyUrl);
                            setShowSpotifySettings(true);
                        }}
                    >
                        <Ionicons name="musical-notes" size={26} color="#1DB954" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                        style={{ position: 'relative' }}
                        onPress={() => {
                            setUnreadCount(0);
                            navigation.navigate('NotificationsScreen', { userId: profile.userId });
                        }}
                    >
                        <Ionicons name="notifications-outline" size={26} color={secondaryColor} />
                        {unreadCount > 0 && (
                            <View style={styles.badge}>
                                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* Player Identity Card with AI Visual DNA */}
            <View style={[
                styles.card, 
                { 
                    backgroundColor: '#0A0A0A', // Opaque so the glow doesn't bleed inside
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
                <View style={{ paddingRight: 85 }}>
                    <Text style={[styles.fandomText, { color: secondaryColor }]} numberOfLines={1} adjustsFontSizeToFit>{profile.fandomName}</Text>
                    <Text style={[styles.userName, { color: primaryColor }]} numberOfLines={1} adjustsFontSizeToFit>{profile.userName}</Text>
                    <Text style={[styles.classBadge, { color: '#FFFFFF' }]} numberOfLines={1} adjustsFontSizeToFit>
                        {(() => {
                            // Parse the AI-generated fandom rank array saved during Setup
                            // Falls back to the generic playerClass if ranks aren't generated yet
                            try {
                                const ranks = profile.fandom_ranks ? JSON.parse(profile.fandom_ranks) : null;
                                let rankTitle = profile.playerClass;
                                if (ranks && ranks.length > 0) {
                                    // Cap the index to the highest available rank if they over-level
                                    const rankIndex = Math.min(stats.level - 1, ranks.length - 1);
                                    rankTitle = ranks[rankIndex];
                                }
                                return `Lv. ${stats.level}  ${rankTitle}`;
                            } catch {
                                return `Lv. ${stats.level}  ${profile.playerClass}`;
                            }
                        })()}
                    </Text>
                </View>

                {profile.streak_count > 0 && (
                    <View style={[
                        styles.streakBadge, 
                        { backgroundColor: secondaryColor + '22', borderColor: secondaryColor }
                    ]}>
                        <Text style={styles.streakBadgeEmoji}>{theme.visualConfig?.streakEmoji || '🔥'}</Text>
                        <Text style={[styles.streakBadgeText, { color: secondaryColor }]}>{profile.streak_count}</Text>
                    </View>
                )}
                
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

            {activeQuests.length > 0 ? (
                activeQuests.slice(0, 3).map(quest => {
                    const maxXP = quest.max_xp || 150;
                    const remainingXP = maxXP - quest.bestScore;
                    return (
                        <TouchableOpacity 
                            key={quest.quizid}
                            style={[
                                styles.questButton, 
                                { 
                                    backgroundColor: '#0A0A0A', 
                                    borderColor: secondaryColor,
                                    shadowColor: secondaryColor,
                                    shadowOffset: { width: 0, height: 0 },
                                    shadowOpacity: (theme.visualConfig?.shadowOpacity || 0.5) / 2,
                                    shadowRadius: (theme.visualConfig?.glowIntensity || 10) / 2,
                                    elevation: 5,
                                    borderRadius: theme.visualConfig?.borderRadius || 15
                                }
                            ]}
                            onPress={async () => {
                                const result = await fetchQuizQuestions(quest.quizid);
                                if (result.success && result.questions.length > 0) {
                                    navigation.navigate('QuizScreen', {
                                        questions: result.questions,
                                        quizId: quest.quizid
                                    });
                                } else {
                                    Alert.alert("Error", "Could not load quest questions.");
                                }
                            }}
                        >
                            <View style={styles.questInfo}>
                                <Ionicons 
                                    name={theme.visualConfig?.iconName || 'star'} 
                                    size={32} 
                                    color={secondaryColor} 
                                />
                                <View style={styles.questTextContainer}>
                                    <Text style={[styles.questTitle, { color: '#FFFFFF' }]} numberOfLines={1}>{quest.title}</Text>
                                    <Text style={[styles.questReward, { color: primaryColor }]}>{remainingXP} XP Remaining</Text>
                                </View>
                            </View>
                            <Ionicons name="play-circle" size={40} color={primaryColor} />
                        </TouchableOpacity>
                    );
                })
            ) : (
                <View style={{ alignItems: 'center', marginVertical: 20 }}>
                    <Text style={{ color: 'gray', fontStyle: 'italic' }}>No active quests. Check the Quest Library!</Text>
                </View>
            )}

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
                    <TouchableOpacity 
                        style={{ alignItems: 'center' }}
                        onPress={() => {
                            toggleMenu();
                            navigation.navigate('ProfileSettings');
                        }}
                    >
                        {profile.avatarUrl ? (
                            <Image
                                source={{ uri: profile.avatarUrl }}
                                style={[
                                    styles.sidebarAvatar,
                                    { borderColor: primaryColor }
                                ]}
                            />
                        ) : (
                            <Ionicons name="person-circle" size={80} color={primaryColor} />
                        )}
                    </TouchableOpacity>
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

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                        toggleMenu();
                        navigation.navigate('CommunityFeed');
                    }}>
                        <Ionicons name="globe-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Community Feed</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                        toggleMenu(); // Close the sidebar first
                        navigation.navigate('FriendsDashboard');
                    }}>
                        <Ionicons name="people-outline" size={24} color={secondaryColor} />
                        <Text style={[styles.menuText, { color: '#FFF' }]}>Friends & Chat</Text>
                    </TouchableOpacity>

                    {/* Admin Dashboard Entry Point */}
                    {profile?.is_admin && (
                        <TouchableOpacity 
                            style={[styles.menuItem, { backgroundColor: 'rgba(255,0,0,0.1)', borderColor: '#FF4444', borderWidth: 1 }]}
                            onPress={() => {
                                toggleMenu();
                                navigation.navigate('AdminDashboard');
                            }}
                        >
                            <Ionicons name="shield-checkmark" size={22} color="#FF4444" />
                            <Text style={[styles.menuText, { color: '#FF4444', fontWeight: 'bold' }]}>Admin Dashboard</Text>
                        </TouchableOpacity>
                    )}
                    {/* Logout Button */}
                    <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
                        <Ionicons name="log-out-outline" size={24} color="#FF4444" />
                        <Text style={[styles.menuText, { color: '#FF4444' }]}>Logout</Text>
                    </TouchableOpacity>
                </ScrollView>
            </Animated.View>

            {/* ── SPOTIFY SETTINGS MODAL ── */}
            <Modal
                visible={showSpotifySettings}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: '#0A0A0A', borderColor: '#1DB954', borderWidth: 1 }]}>
                        <Ionicons name="musical-notes" size={50} color="#1DB954" style={{ alignSelf: 'center', marginBottom: 10 }} />
                        <Text style={[styles.modalTitle, { color: '#1DB954' }]}>Study Music Settings</Text>
                        <Text style={[styles.modalDesc, { color: theme.textColor }]}>
                            Paste a link to your favorite Spotify Playlist. Leave blank to use the default Lofi Beats playlist.
                        </Text>
                        
                        <View style={{ width: '100%', marginVertical: 15 }}>
                            <Text style={{ color: theme.textColor, marginBottom: 5, fontWeight: 'bold' }}>Spotify Playlist URL</Text>
                            <TextInput
                                style={[styles.settingsInput, { color: theme.textColor, borderColor: theme.secondaryColor, width: '100%' }]}
                                value={tempSpotifyUrl}
                                onChangeText={setTempSpotifyUrl}
                                placeholder="https://open.spotify.com/playlist/..."
                                placeholderTextColor="gray"
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.modalActions}>
                            <TouchableOpacity 
                                style={[styles.modalBtn, { borderColor: theme.secondaryColor, borderWidth: 1 }]}
                                onPress={() => setShowSpotifySettings(false)}
                            >
                                <Text style={[styles.modalBtnText, { color: theme.textColor }]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={[styles.modalBtn, { backgroundColor: '#1DB954' }]}
                                onPress={handleSaveSpotifyUrl}
                            >
                                <Text style={[styles.modalBtnText, { color: '#000' }]}>Save URL</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    container: { flex: 1, padding: 20, paddingTop: 60 },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 10,
        zIndex: 2,
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#FF3B30',
        borderRadius: 10,
        width: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#000'
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    
    // Global Modal Styles for Home Screen
    modalOverlay: {
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.85)', 
        justifyContent: 'center', 
        padding: 20
    },
    modalContent: {
        borderRadius: 20, 
        padding: 22,
        alignItems: 'center'
    },
    modalTitle: {
        fontSize: 20, 
        fontWeight: '900', 
        marginBottom: 8
    },
    modalDesc: {
        fontSize: 13, 
        textAlign: 'center', 
        lineHeight: 20,
        opacity: 0.8
    },
    settingsInput: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#FFF',
        padding: 12,
        fontSize: 16,
    },
    modalActions: {
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        width: '100%', 
        gap: 10,
        marginTop: 15
    },
    modalBtn: {
        flex: 1, 
        paddingVertical: 14, 
        borderRadius: 12, 
        alignItems: 'center'
    },
    modalBtnText: {
        fontWeight: 'bold', 
        fontSize: 15
    },
    welcomeText: {
        fontSize: 28,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    card: { padding: 25, borderRadius: 20, borderWidth: 1, marginBottom: 40 },
    fandomText: { fontSize: 14, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 5 },
    userName: { fontSize: 36, fontWeight: '900', marginBottom: 5 },
    classBadge: { fontSize: 16, fontWeight: '600', opacity: 0.8 },
    streakBadge: { position: 'absolute', top: 20, right: 20, width: 75, height: 75, borderRadius: 37.5, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    streakBadgeEmoji: { fontSize: 24, marginBottom: -4 },
    streakBadgeText: { fontSize: 20, fontWeight: '900' },
    xpContainer: { marginTop: 25 },
    xpTextRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    xpTrack: { width: '100%', height: 12, borderRadius: 10, overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: 10 },
    sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, letterSpacing: 1 },
    questButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 15, borderWidth: 1, marginBottom: 15 },
    questInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 15 },
    questTextContainer: { marginLeft: 15, flex: 1 },
    questTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
    questReward: { fontSize: 14, fontWeight: 'bold' },

    // Sidebar Styles
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 },
    sidebar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: MENU_WIDTH, zIndex: 100, paddingVertical: 60, paddingHorizontal: 20, borderRightWidth: 1, elevation: 20, shadowColor: '#000', shadowOffset: { width: 5, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10 },
    sidebarHeader: { borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 20, marginBottom: 20, alignItems: 'center' },
    sidebarAvatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, marginBottom: 12 },
    sidebarUsername: { fontSize: 22, fontWeight: 'bold' },
    menuItems: { flexGrow: 1 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
    menuText: { fontSize: 18, marginLeft: 15, fontWeight: '500' },
    settingsButton: { flexDirection: 'row', alignItems: 'center', paddingTop: 20, borderTopWidth: 1, borderTopColor: '#333' }
});