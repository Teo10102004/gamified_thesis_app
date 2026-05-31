import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Image, ActivityIndicator, RefreshControl, Animated, Alert, Modal, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import FandomBackground from '../components/FandomBackground';
import { getLeaderboard, getRecentActivity, getPublicQuizzes, cloneQuizToLibrary, likeQuiz } from '../services/userService';
import { getCurrentUser } from '../services/authService';

const TABS = ['🏆 Leaderboard', '⚡ Activity', '🌍 Public Quests'];

const MEDALS = ['🥇', '🥈', '🥉'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const Avatar = ({ uri, size = 44, borderColor }) => (
    uri
        ? <Image source={{ uri }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderColor }]} />
        : <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, borderColor }]}>
            <Ionicons name="person" size={size * 0.5} color={borderColor} />
          </View>
);

const timeAgo = (timestamp) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const LeaderboardCard = ({ item, rank, currentUserId, primaryColor, secondaryColor }) => {
    const isMe = item.userId === currentUserId;
    const medal = MEDALS[rank - 1] || null;

    return (
        <View style={[
            styles.lbCard,
            isMe && { borderColor: primaryColor, borderWidth: 1.5 }
        ]}>
            {/* Rank */}
            <View style={styles.lbRank}>
                {medal
                    ? <Text style={styles.lbMedal}>{medal}</Text>
                    : <Text style={[styles.lbRankNum, { color: rank <= 10 ? secondaryColor : 'gray' }]}>#{rank}</Text>
                }
            </View>

            {/* Avatar */}
            <Avatar uri={item.avatarUrl} size={46} borderColor={isMe ? primaryColor : 'rgba(255,255,255,0.15)'} />

            {/* Info */}
            <View style={styles.lbInfo}>
                <View style={styles.lbNameRow}>
                    <Text style={[styles.lbName, { color: isMe ? primaryColor : '#FFF' }]} numberOfLines={1}>
                        {item.userName}
                        {isMe && <Text style={{ fontSize: 11, color: primaryColor }}> (you)</Text>}
                    </Text>
                </View>
                <Text style={[styles.lbRankTitle, { color: secondaryColor }]} numberOfLines={1}>
                    Lv.{item.level} · {item.rankTitle}
                </Text>
                {item.fandomName ? (
                    <Text style={styles.lbFandom} numberOfLines={1}>{item.fandomName}</Text>
                ) : null}
            </View>

            {/* XP */}
            <View style={styles.lbXPBox}>
                <Text style={[styles.lbXP, { color: primaryColor }]}>{item.totalXP}</Text>
                <Text style={styles.lbXPLabel}>XP</Text>
            </View>
        </View>
    );
};

const ActivityCard = ({ item, primaryColor, secondaryColor }) => {
    const isQuiz = item.type === 'quiz';
    const icon = isQuiz ? 'flash' : 'book';
    const color = isQuiz ? primaryColor : secondaryColor;

    const description = isQuiz
        ? `completed a quiz · scored ${item.score}%`
        : `read for ${item.durationMins} min`;

    return (
        <View style={styles.actCard}>
            {/* Avatar */}
            <Avatar uri={item.avatarUrl} size={40} borderColor={color} />

            {/* Text */}
            <View style={styles.actInfo}>
                <Text style={styles.actName} numberOfLines={1}>
                    <Text style={{ color: '#FFF', fontWeight: '700' }}>{item.userName}</Text>
                    <Text style={{ color: 'gray' }}> {description}</Text>
                </Text>
                {item.fandomName ? (
                    <Text style={styles.actFandom}>{item.fandomName}</Text>
                ) : null}
            </View>

            {/* XP badge + time */}
            <View style={styles.actRight}>
                <View style={[styles.actXPBadge, { backgroundColor: color + '22', borderColor: color }]}>
                    <Ionicons name={icon} size={12} color={color} />
                    <Text style={[styles.actXPText, { color }]}>+{item.xp}</Text>
                </View>
                <Text style={styles.actTime}>{timeAgo(item.timestamp)}</Text>
            </View>
        </View>
    );
};

const PublicQuestCard = ({ item, primaryColor, secondaryColor, onClone, onPress }) => {
    const description = item.public_description || "A community generated quest.";
    
    return (
        <TouchableOpacity style={styles.actCard} onPress={() => onPress(item)}>
            <View style={[styles.actInfo, { flex: 1, marginRight: 10 }]}>
                <Text style={styles.actName} numberOfLines={1}>
                    <Text style={{ color: '#FFF', fontWeight: '700' }}>{item.title}</Text>
                </Text>
                <Text style={{ color: 'gray', fontSize: 12, marginTop: 4, fontStyle: 'italic' }} numberOfLines={2}>
                    "{description}"
                </Text>
                <Text style={{ color: primaryColor, fontSize: 11, marginTop: 4, fontWeight: 'bold' }}>
                    By {item.creator?.userName || 'Unknown'} • {item.max_xp} Max XP
                </Text>
            </View>
            <TouchableOpacity 
                style={[styles.actXPBadge, { backgroundColor: primaryColor, borderColor: primaryColor, paddingHorizontal: 12, paddingVertical: 8 }]}
                onPress={() => onClone(item.quizid)}
            >
                <Ionicons name="add-circle" size={16} color="#FFF" />
                <Text style={[styles.actXPText, { color: '#FFF' }]}>Add</Text>
            </TouchableOpacity>
        </TouchableOpacity>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CommunityFeed({ navigation }) {
    const { theme } = useTheme();
    const { primaryColor, secondaryColor, backgroundColor, textColor } = theme;

    const [activeTab, setActiveTab] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [activities, setActivities] = useState([]);
    const [publicQuests, setPublicQuests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [myRank, setMyRank] = useState(null);
    
    const [selectedQuest, setSelectedQuest] = useState(null);
    const [isLiking, setIsLiking] = useState(false);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const user = await getCurrentUser();
            if (user) setCurrentUserId(user.id);

            const [lbResult, actResult, publicResult] = await Promise.all([
                getLeaderboard(),
                getRecentActivity(user?.id),
                getPublicQuizzes(user?.id)
            ]);

            if (lbResult.success) {
                setLeaderboard(lbResult.leaderboard);
                if (user) {
                    const idx = lbResult.leaderboard.findIndex(e => e.userId === user.id);
                    setMyRank(idx >= 0 ? idx + 1 : null);
                }
            }
            if (actResult.success) setActivities(actResult.activities);
            if (publicResult.success) setPublicQuests(publicResult.quizzes);
        } catch (e) {
            console.error('Community load error:', e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, []));

    const onRefresh = () => {
        setRefreshing(true);
        loadData(true);
    };

    const handleClone = async (quizId) => {
        if (!currentUserId) return;
        Alert.alert(
            "Add to Library",
            "This will clone this quest into your personal library. Proceed?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Add", onPress: async () => {
                    const result = await cloneQuizToLibrary(quizId, currentUserId);
                    if (result.success) {
                        Alert.alert("Success", "Quest added to your library!");
                        if (selectedQuest) setSelectedQuest(null);
                    } else {
                        Alert.alert("Error", result.message || "Could not clone quest.");
                    }
                }}
            ]
        );
    };

    const handleLike = async () => {
        if (!selectedQuest || isLiking) return;
        setIsLiking(true);
        const result = await likeQuiz(selectedQuest.quizid, currentUserId);
        setIsLiking(false);
        
        if (result.success) {
            // Update local state to reflect the new like immediately
            const updatedQuest = { 
                ...selectedQuest, 
                likes: result.newLikes,
                liked_by: [...(selectedQuest.liked_by || []), currentUserId] 
            };
            setSelectedQuest(updatedQuest);
            setPublicQuests(prev => prev.map(q => q.quizid === updatedQuest.quizid ? updatedQuest : q));
        } else if (result.message === "Already liked") {
            Alert.alert("Already Liked", "You've already liked this quest!");
        } else {
            Alert.alert("Error", "Could not like this quest right now.");
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={secondaryColor} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={[styles.headerTitle, { color: textColor }]}>Community</Text>
                    {myRank && (
                        <Text style={[styles.headerSub, { color: secondaryColor }]}>
                            Your Rank: #{myRank}
                        </Text>
                    )}
                </View>
                <TouchableOpacity onPress={onRefresh}>
                    <Ionicons name="refresh" size={24} color={secondaryColor} />
                </TouchableOpacity>
            </View>

            {/* Tab Bar */}
            <View style={[styles.tabBar, { borderBottomColor: primaryColor + '33' }]}>
                {['Leaderboard', 'Activity', 'Public Quests'].map((tabName, idx) => {
                    const defaultEmojis = ['🏆', '⚡', '🌍'];
                    const emojis = theme.visualConfig?.tabEmojis || defaultEmojis;
                    const emoji = emojis[idx] || defaultEmojis[idx];
                    
                    return (
                        <TouchableOpacity
                            key={idx}
                            style={[
                                styles.tab,
                                activeTab === idx && { borderBottomWidth: 3, borderBottomColor: primaryColor }
                            ]}
                            onPress={() => setActiveTab(idx)}
                        >
                            <Text style={[
                                styles.tabText,
                                { color: activeTab === idx ? primaryColor : 'gray' }
                            ]}>
                                {emoji} {tabName}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <Text style={[styles.loadingText, { color: 'gray' }]}>Loading community data…</Text>
                </View>
            ) : activeTab === 0 ? (
                /* ── LEADERBOARD TAB ── */
                <FlatList
                    data={leaderboard}
                    keyExtractor={(item) => item.userId}
                    renderItem={({ item, index }) => (
                        <LeaderboardCard
                            item={item}
                            rank={index + 1}
                            currentUserId={currentUserId}
                            primaryColor={primaryColor}
                            secondaryColor={secondaryColor}
                        />
                    )}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="trophy-outline" size={70} color="rgba(255,255,255,0.12)" />
                            <Text style={styles.emptyText}>No players yet.{'\n'}Be the first to earn XP!</Text>
                        </View>
                    }
                    ListHeaderComponent={
                        leaderboard.length > 0 ? (
                            <Text style={[styles.sectionLabel, { color: primaryColor }]}>
                                {leaderboard.length} Players Ranked
                            </Text>
                        ) : null
                    }
                />
            ) : activeTab === 1 ? (
                /* ── ACTIVITY FEED TAB ── */
                <FlatList
                    data={activities}
                    keyExtractor={(item, index) => `${item.id}-${index}`}
                    renderItem={({ item }) => (
                        <ActivityCard
                            item={item}
                            primaryColor={primaryColor}
                            secondaryColor={secondaryColor}
                        />
                    )}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="pulse-outline" size={70} color="rgba(255,255,255,0.12)" />
                            <Text style={styles.emptyText}>No activity yet.{'\n'}Complete a quiz or reading session to appear here!</Text>
                        </View>
                    }
                    ListHeaderComponent={
                        activities.length > 0 ? (
                            <Text style={[styles.sectionLabel, { color: primaryColor }]}>
                                Recent Activity
                            </Text>
                        ) : null
                    }
                />
            ) : (
                /* ── PUBLIC QUESTS TAB ── */
                <FlatList
                    data={publicQuests}
                    keyExtractor={(item) => item.quizid.toString()}
                    renderItem={({ item }) => (
                        <PublicQuestCard
                            item={item}
                            primaryColor={primaryColor}
                            secondaryColor={secondaryColor}
                            onClone={handleClone}
                            onPress={setSelectedQuest}
                        />
                    )}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="globe-outline" size={70} color="rgba(255,255,255,0.12)" />
                            <Text style={styles.emptyText}>No public quests yet.{'\n'}Share yours from the Quest Library!</Text>
                        </View>
                    }
                    ListHeaderComponent={
                        publicQuests.length > 0 ? (
                            <Text style={[styles.sectionLabel, { color: primaryColor }]}>
                                Community Library
                            </Text>
                        ) : null
                    }
                />
            )}

            {/* --- QUEST DETAILS MODAL --- */}
            <Modal
                visible={!!selectedQuest}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectedQuest(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { borderColor: primaryColor }]}>
                        {selectedQuest && (
                            <>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>{selectedQuest.title}</Text>
                                    <TouchableOpacity onPress={() => setSelectedQuest(null)}>
                                        <Ionicons name="close-circle" size={28} color="gray" />
                                    </TouchableOpacity>
                                </View>
                                
                                <Text style={styles.modalCreator}>
                                    Created by: <Text style={{ color: primaryColor }}>{selectedQuest.creator?.userName || 'Unknown'}</Text>
                                </Text>
                                
                                <ScrollView style={styles.modalDescScroll}>
                                    <Text style={styles.modalDescription}>
                                        {selectedQuest.public_description || "A community generated quest. Jump in and test your knowledge!"}
                                    </Text>
                                </ScrollView>
                                
                                <View style={styles.modalStats}>
                                    <View style={styles.modalStatBox}>
                                        <Ionicons name="star" size={20} color="#FFD700" />
                                        <Text style={styles.modalStatText}>{selectedQuest.max_xp} Max XP</Text>
                                    </View>
                                    <View style={styles.modalStatBox}>
                                        <Ionicons name="heart" size={20} color="#FF4444" />
                                        <Text style={styles.modalStatText}>{selectedQuest.likes || 0} Likes</Text>
                                    </View>
                                </View>

                                <View style={styles.modalActions}>
                                    <TouchableOpacity 
                                        style={[
                                            styles.modalBtn, 
                                            styles.modalLikeBtn, 
                                            (selectedQuest.liked_by || []).includes(currentUserId) && { backgroundColor: '#FF4444' }
                                        ]}
                                        onPress={handleLike}
                                        disabled={isLiking || (selectedQuest.liked_by || []).includes(currentUserId)}
                                    >
                                        <Ionicons 
                                            name={(selectedQuest.liked_by || []).includes(currentUserId) ? "heart" : "heart-outline"} 
                                            size={20} 
                                            color="#FFF" 
                                        />
                                        <Text style={styles.modalBtnText}>
                                            {(selectedQuest.liked_by || []).includes(currentUserId) ? "Liked" : "Like"}
                                        </Text>
                                    </TouchableOpacity>
                                    
                                    <TouchableOpacity 
                                        style={[styles.modalBtn, { backgroundColor: primaryColor, flex: 2 }]}
                                        onPress={() => handleClone(selectedQuest.quizid)}
                                    >
                                        <Ionicons name="add-circle" size={20} color="#FFF" />
                                        <Text style={styles.modalBtnText}>Add to Library</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 14, fontSize: 14 },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
    },
    headerCenter: { alignItems: 'center' },
    headerTitle: { fontSize: 22, fontWeight: '900' },
    headerSub: { fontSize: 12, fontWeight: '700', marginTop: 2 },

    // Tabs
    tabBar: {
        flexDirection: 'row', borderBottomWidth: 1,
        marginHorizontal: 0, marginBottom: 8,
    },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
    tabText: { fontSize: 14, fontWeight: '800' },

    // List
    list: { padding: 16, paddingTop: 8 },
    sectionLabel: {
        fontSize: 11, fontWeight: '900', textTransform: 'uppercase',
        letterSpacing: 2, marginBottom: 12,
    },

    // Leaderboard Card
    lbCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 14, padding: 12, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    lbRank: { width: 36, alignItems: 'center' },
    lbMedal: { fontSize: 22 },
    lbRankNum: { fontSize: 14, fontWeight: '900' },
    lbInfo: { flex: 1, marginLeft: 12 },
    lbNameRow: { flexDirection: 'row', alignItems: 'center' },
    lbName: { fontSize: 15, fontWeight: '800', flex: 1 },
    lbRankTitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    lbFandom: { fontSize: 11, color: 'gray', marginTop: 1 },
    lbXPBox: { alignItems: 'flex-end', marginLeft: 8 },
    lbXP: { fontSize: 18, fontWeight: '900' },
    lbXPLabel: { fontSize: 10, color: 'gray', fontWeight: '700' },

    // Avatar
    avatar: { borderWidth: 2 },
    avatarFallback: {
        borderWidth: 2, backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center', alignItems: 'center',
    },

    // Activity Card
    actCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 14, padding: 12, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    },
    actInfo: { flex: 1, marginLeft: 12 },
    actName: { fontSize: 14, lineHeight: 20 },
    actFandom: { fontSize: 11, color: 'gray', marginTop: 2 },
    actRight: { alignItems: 'flex-end', marginLeft: 8, gap: 4 },
    actXPBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 20, borderWidth: 1,
    },
    actXPText: { fontSize: 12, fontWeight: '800' },
    actTime: { fontSize: 10, color: 'gray' },

    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyText: { color: 'gray', fontSize: 15, textAlign: 'center', marginTop: 20, lineHeight: 24 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalContent: {
        backgroundColor: '#111', borderTopWidth: 2, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 24, maxHeight: '80%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    modalTitle: { fontSize: 22, fontWeight: '900', color: '#FFF', flex: 1, marginRight: 16 },
    modalCreator: { fontSize: 14, color: 'gray', marginBottom: 16, fontWeight: '600' },
    modalDescScroll: { maxHeight: 150, marginBottom: 20 },
    modalDescription: { fontSize: 16, color: '#DDD', lineHeight: 24, fontStyle: 'italic' },
    modalStats: { flexDirection: 'row', gap: 16, marginBottom: 24, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#333' },
    modalStatBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    modalStatText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
    modalActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    modalBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, flex: 1 },
    modalLikeBtn: { backgroundColor: 'rgba(255, 68, 68, 0.2)', borderWidth: 1, borderColor: '#FF4444' },
    modalBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' }
});
