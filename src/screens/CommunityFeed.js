import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Image, ActivityIndicator, RefreshControl, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import FandomBackground from '../components/FandomBackground';
import { getLeaderboard, getRecentActivity } from '../services/userService';
import { getCurrentUser } from '../services/authService';

const TABS = ['🏆 Leaderboard', '⚡ Activity'];

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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CommunityFeed({ navigation }) {
    const { theme } = useTheme();
    const { primaryColor, secondaryColor, backgroundColor, textColor } = theme;

    const [activeTab, setActiveTab] = useState(0);
    const [leaderboard, setLeaderboard] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUserId, setCurrentUserId] = useState(null);
    const [myRank, setMyRank] = useState(null);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const user = await getCurrentUser();
            if (user) setCurrentUserId(user.id);

            const [lbResult, actResult] = await Promise.all([
                getLeaderboard(),
                getRecentActivity(),
            ]);

            if (lbResult.success) {
                setLeaderboard(lbResult.leaderboard);
                if (user) {
                    const idx = lbResult.leaderboard.findIndex(e => e.userId === user.id);
                    setMyRank(idx >= 0 ? idx + 1 : null);
                }
            }
            if (actResult.success) setActivities(actResult.activities);
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
                {TABS.map((tab, idx) => (
                    <TouchableOpacity
                        key={idx}
                        style={[
                            styles.tab,
                            activeTab === idx && { borderBottomColor: primaryColor, borderBottomWidth: 2.5 }
                        ]}
                        onPress={() => setActiveTab(idx)}
                    >
                        <Text style={[
                            styles.tabText,
                            { color: activeTab === idx ? primaryColor : 'gray' }
                        ]}>
                            {tab}
                        </Text>
                    </TouchableOpacity>
                ))}
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
            ) : (
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
            )}
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

    // Empty
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyText: { color: 'gray', fontSize: 15, textAlign: 'center', marginTop: 20, lineHeight: 24 },
});
