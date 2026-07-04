import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView, Platform, ScrollView, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';

const screenWidth = Dimensions.get("window").width;
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAppStats, getAllUsers, setAdminStatus, setUserBanStatus, setUserQuestsHiddenStatus, broadcastAnnouncement, getAdminAnalytics, resetUserXP, setUserMuteStatus } from '../services/adminService';
import { Alert, Modal } from 'react-native';

export default function AdminDashboard({ navigation }) {
    const [stats, setStats] = useState({ users: 0, quizzes: 0, sessions: 0 });
    const [analytics, setAnalytics] = useState(null);
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showBroadcastModal, setShowBroadcastModal] = useState(false);
    const [broadcastText, setBroadcastText] = useState('');
    const [isBroadcasting, setIsBroadcasting] = useState(false);
    const [fullScreenChart, setFullScreenChart] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [statsRes, usersRes, analyticsRes] = await Promise.all([
                getAppStats(),
                getAllUsers(),
                getAdminAnalytics()
            ]);

            if (statsRes.success) setStats(statsRes.stats);
            if (usersRes.success) {
                setUsers(usersRes.users);
                setFilteredUsers(usersRes.users);
            }
            if (analyticsRes && analyticsRes.success) {
                setAnalytics(analyticsRes);
            }
        } catch (e) {
            console.error('Admin load error:', e.message);
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

    const handleSearch = (text) => {
        setSearchQuery(text);
        if (!text.trim()) {
            setFilteredUsers(users);
        } else {
            const query = text.toLowerCase();
            const filtered = users.filter(u => 
                (u.userName && u.userName.toLowerCase().includes(query)) ||
                (u.email && u.email.toLowerCase().includes(query))
            );
            setFilteredUsers(filtered);
        }
    };

    const handleManageUser = (user) => {
        setSelectedUser(user);
    };

    const handleSendBroadcast = async () => {
        if (!broadcastText.trim()) return;
        setIsBroadcasting(true);
        const res = await broadcastAnnouncement(broadcastText.trim());
        setIsBroadcasting(false);
        if (res.success) {
            Alert.alert("Success", "Announcement broadcasted to all users!");
            setBroadcastText('');
            setShowBroadcastModal(false);
        } else {
            Alert.alert("Error", res.error);
        }
    };

    const renderUser = ({ item }) => {
        const isMuted = item.visualConfig && item.visualConfig.is_muted;
        return (
            <View style={[styles.card, item.is_banned && styles.bannedCard]}>
                <View style={styles.cardInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.userNameText}>{item.userName || item.email}</Text>
                        {item.is_admin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>}
                        {item.is_banned && <View style={styles.bannedBadge}><Text style={styles.bannedBadgeText}>BANNED</Text></View>}
                        {isMuted && <View style={styles.mutedBadge}><Text style={styles.mutedBadgeText}>MUTED</Text></View>}
                    </View>
                    <Text style={styles.classText}>{item.playerClass} · {item.fandomName}</Text>
                    <Text style={styles.dateText}>Joined {new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
                <TouchableOpacity 
                    style={styles.actionBtn}
                    onPress={() => handleManageUser(item)}
                >
                    <Ionicons name="ellipsis-vertical" size={20} color="gray" />
                </TouchableOpacity>
            </View>
        );
    };

    const renderHeader = () => {
        return (
        <>
            {/* Stats Section */}
            <View style={styles.statsContainer}>
                <View style={styles.statBox}>
                    <Ionicons name="people" size={24} color="#00FFFF" />
                    <Text style={styles.statValue}>{stats.users}</Text>
                    <Text style={styles.statLabel}>Users</Text>
                </View>
                <View style={styles.statBox}>
                    <Ionicons name="game-controller" size={24} color="#00FFFF" />
                    <Text style={styles.statValue}>{stats.quizzes}</Text>
                    <Text style={styles.statLabel}>Quests</Text>
                </View>
                <View style={styles.statBox}>
                    <Ionicons name="book" size={24} color="#00FFFF" />
                    <Text style={styles.statValue}>{stats.sessions}</Text>
                    <Text style={styles.statLabel}>Sessions</Text>
                </View>
            </View>

            {/* Analytics Charts */}
            {analytics && (
                <View style={styles.chartsWrapper}>
                    <Text style={styles.sectionHeading}>Platform Analytics</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartsScroll}>
                        
                        <TouchableOpacity style={styles.chartCard} onPress={() => setFullScreenChart({ type: 'dau', title: 'Daily Active Users (7D)' })}>
                            <Text style={styles.chartTitle}>Daily Active Users (7D)</Text>
                            <LineChart
                                data={analytics.dauChart}
                                width={screenWidth * 0.85}
                                height={220}
                                yAxisLabel=""
                                yAxisInterval={1}
                                chartConfig={chartConfig}
                                bezier
                                style={styles.chartStyle}
                                fromZero={true}
                                formatYLabel={(y) => {
                                    const num = parseFloat(y);
                                    return Number.isInteger(num) ? String(num) : "";
                                }}
                            />
                            <Text style={styles.chartDescription}>Tracks the number of unique users who logged in each day over the past week. Tap to expand.</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.chartCard} onPress={() => setFullScreenChart({ type: 'activity', title: 'Reading vs Quizzes' })}>
                            <Text style={styles.chartTitle}>Reading vs Quizzes</Text>
                            <PieChart
                                data={analytics.activityPie}
                                width={screenWidth * 0.85}
                                height={220}
                                chartConfig={chartConfig}
                                accessor={"count"}
                                backgroundColor={"transparent"}
                                paddingLeft={"15"}
                                absolute
                            />
                            <Text style={styles.chartDescription}>Compares the total number of reading sessions vs played quests. Tap to expand.</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.chartCard} onPress={() => setFullScreenChart({ type: 'content', title: 'Content Created' })}>
                            <Text style={styles.chartTitle}>Content Created</Text>
                            <BarChart
                                data={analytics.contentChart}
                                width={screenWidth * 0.85}
                                height={220}
                                yAxisLabel=""
                                chartConfig={{ ...chartConfig, decimalPlaces: 0 }}
                                segments={Math.max(1, Math.min(5, Math.max(...analytics.contentChart.datasets[0].data)))}
                                style={styles.chartStyle}
                                fromZero={true}
                            />
                            <Text style={styles.chartDescription}>Shows the total amount of user-generated reading documents, quests, and flashcards. Tap to expand.</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.chartCard} onPress={() => setFullScreenChart({ type: 'fandoms', title: 'Top Fandoms' })}>
                            <Text style={styles.chartTitle}>Top Fandoms</Text>
                            <BarChart
                                data={analytics.fandomChart}
                                width={screenWidth * 0.85}
                                height={240}
                                yAxisLabel=""
                                chartConfig={{ ...chartConfig, decimalPlaces: 0 }}
                                segments={Math.max(1, Math.min(5, Math.max(...analytics.fandomChart.datasets[0].data)))}
                                style={styles.chartStyle}
                                showValuesOnTopOfBars
                                verticalLabelRotation={45}
                                fromZero={true}
                            />
                            <Text style={styles.chartDescription}>Displays the most popular fandoms currently selected by the student body. Tap to expand.</Text>
                        </TouchableOpacity>

                    </ScrollView>
                </View>
            )}

            <View style={styles.actionsContainer}>
                <TouchableOpacity style={styles.broadcastBtn} onPress={() => setShowBroadcastModal(true)}>
                    <Ionicons name="megaphone" size={20} color="#000" />
                    <Text style={styles.broadcastBtnText}>Broadcast Announcement</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.searchSection}>
                <View style={styles.searchRow}>
                    <Ionicons name="search" size={20} color="gray" style={{ marginLeft: 10 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by username or email..."
                        placeholderTextColor="gray"
                        value={searchQuery}
                        onChangeText={handleSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            </View>
        </>
        );
    };

    const renderFullScreenChart = () => {
        if (!fullScreenChart) return null;
        const width = screenWidth * 0.9;
        const height = 400; // Large height for better visibility

        switch (fullScreenChart.type) {
            case 'dau':
                return (
                    <LineChart
                        data={analytics.dauChart}
                        width={width}
                        height={height}
                        yAxisLabel=""
                        yAxisInterval={1}
                        chartConfig={chartConfig}
                        bezier
                        style={styles.fullScreenChartStyle}
                        fromZero={true}
                        formatYLabel={(y) => {
                            const num = parseFloat(y);
                            return Number.isInteger(num) ? String(num) : "";
                        }}
                    />
                );
            case 'activity':
                return (
                    <PieChart
                        data={analytics.activityPie}
                        width={width}
                        height={260} // Adjusted to prevent legend overlap
                        chartConfig={chartConfig}
                        accessor={"count"}
                        backgroundColor={"transparent"}
                        paddingLeft={"15"}
                        center={[10, 0]}
                        absolute
                    />
                );
            case 'content':
                return (
                    <BarChart
                        data={analytics.contentChart}
                        width={width}
                        height={height}
                        yAxisLabel=""
                        chartConfig={{ ...chartConfig, decimalPlaces: 0 }}
                        segments={Math.max(1, Math.min(5, Math.max(...analytics.contentChart.datasets[0].data)))}
                        style={styles.fullScreenChartStyle}
                        fromZero={true}
                    />
                );
            case 'fandoms':
                return (
                    <BarChart
                        data={analytics.fandomChart}
                        width={width}
                        height={height}
                        yAxisLabel=""
                        chartConfig={{ ...chartConfig, decimalPlaces: 0 }}
                        segments={Math.max(1, Math.min(5, Math.max(...analytics.fandomChart.datasets[0].data)))}
                        style={styles.fullScreenChartStyle}
                        showValuesOnTopOfBars
                        verticalLabelRotation={45}
                        fromZero={true}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color="#FF00FF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Admin Dashboard</Text>
                <View style={{ width: 28 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : null}>
                <FlatList
                    data={filteredUsers}
                    keyExtractor={item => item.userId}
                    renderItem={renderUser}
                    contentContainerStyle={styles.list}
                    ListHeaderComponent={renderHeader}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF00FF" />}
                    ListEmptyComponent={
                        loading ? (
                            <View style={styles.center}>
                                <ActivityIndicator size="large" color="#FF00FF" />
                            </View>
                        ) : (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>No users found.</Text>
                            </View>
                        )
                    }
                />
            </KeyboardAvoidingView>

            <Modal visible={showBroadcastModal} transparent animationType="slide" onRequestClose={() => setShowBroadcastModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.broadcastModalContent}>
                        <Text style={styles.modalTitle}>Broadcast Announcement</Text>
                        <TextInput
                            style={styles.broadcastInput}
                            placeholder="Write your announcement..."
                            placeholderTextColor="gray"
                            multiline
                            value={broadcastText}
                            onChangeText={setBroadcastText}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowBroadcastModal(false)}>
                                <Text style={styles.modalCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalSendBtn} onPress={handleSendBroadcast} disabled={isBroadcasting}>
                                {isBroadcasting ? <ActivityIndicator color="#000" /> : <Text style={styles.modalSendText}>Send</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Manage User Action Sheet Modal */}
            <Modal visible={!!selectedUser} transparent animationType="slide" onRequestClose={() => setSelectedUser(null)}>
                <View style={styles.modalOverlayBottom}>
                    <View style={styles.actionSheetContent}>
                        <Text style={styles.actionSheetTitle}>Manage {selectedUser?.userName}</Text>
                        
                        <TouchableOpacity style={styles.actionBtnItem} onPress={async () => {
                            const res = await setAdminStatus(selectedUser.userId, !selectedUser.is_admin);
                            if (res.success) {
                                Alert.alert("Success", `User is now ${!selectedUser.is_admin ? 'an Admin' : 'a regular user'}.`);
                                loadData(true);
                            } else Alert.alert("Error", res.error);
                            setSelectedUser(null);
                        }}>
                            <Text style={styles.actionBtnText}>{selectedUser?.is_admin ? "Revoke Admin" : "Promote to Admin"}</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={styles.actionBtnItem} onPress={async () => {
                            const isMuted = selectedUser?.visualConfig?.is_muted;
                            const res = await setUserMuteStatus(selectedUser.userId, !isMuted);
                            if (res.success) {
                                Alert.alert("Success", `User has been ${isMuted ? 'unmuted' : 'muted'}.`);
                                loadData(true);
                            } else Alert.alert("Error", res.error);
                            setSelectedUser(null);
                        }}>
                            <Text style={selectedUser?.visualConfig?.is_muted ? styles.actionBtnText : styles.actionBtnTextDestructive}>
                                {selectedUser?.visualConfig?.is_muted ? "Unmute User" : "Mute User"}
                            </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity style={styles.actionBtnItem} onPress={() => {
                            Alert.alert("Confirm Reset", "Are you sure you want to delete all XP for this user? This cannot be undone.", [
                                { text: "Cancel", style: "cancel" },
                                { text: "Reset", style: "destructive", onPress: async () => {
                                    const res = await resetUserXP(selectedUser.userId);
                                    if (res.success) {
                                        Alert.alert("Success", "User XP has been reset.");
                                        loadData(true);
                                    } else Alert.alert("Error", res.error);
                                    setSelectedUser(null);
                                }}
                            ]);
                        }}>
                            <Text style={styles.actionBtnTextDestructive}>Reset XP (Level 1)</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionBtnItem} onPress={async () => {
                            const res = await setUserBanStatus(selectedUser.userId, !selectedUser.is_banned);
                            if (res.success) {
                                Alert.alert("Success", `User has been ${selectedUser.is_banned ? 'unbanned' : 'banned'}.`);
                                loadData(true);
                            } else Alert.alert("Error", res.error);
                            setSelectedUser(null);
                        }}>
                            <Text style={selectedUser?.is_banned ? styles.actionBtnText : styles.actionBtnTextDestructive}>
                                {selectedUser?.is_banned ? "Unban User" : "Ban User"}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.actionBtnItem} onPress={async () => {
                            const isHidden = selectedUser?.visualConfig?.is_quests_hidden;
                            const res = await setUserQuestsHiddenStatus(selectedUser.userId, !isHidden);
                            if (res.success) {
                                Alert.alert("Success", `User's public quests are now ${isHidden ? 'visible' : 'hidden'}.`);
                                loadData(true);
                            } else Alert.alert("Error", res.error);
                            setSelectedUser(null);
                        }}>
                            <Text style={selectedUser?.visualConfig?.is_quests_hidden ? styles.actionBtnText : styles.actionBtnTextDestructive}>
                                {selectedUser?.visualConfig?.is_quests_hidden ? "Show Public Quests" : "Hide Public Quests"}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.actionBtnItem, { borderBottomWidth: 0, marginTop: 10 }]} onPress={() => setSelectedUser(null)}>
                            <Text style={[styles.actionBtnText, { color: 'gray', fontWeight: 'bold' }]}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Full Screen Chart Modal */}
            <Modal visible={!!fullScreenChart} animationType="fade" transparent={true} onRequestClose={() => setFullScreenChart(null)}>
                <View style={styles.fullScreenOverlay}>
                    <View style={styles.fullScreenCard}>
                        <TouchableOpacity style={styles.closeFullScreenBtn} onPress={() => setFullScreenChart(null)}>
                            <Ionicons name="close" size={32} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.fullScreenTitle}>{fullScreenChart?.title}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fullScreenScroll}>
                            {renderFullScreenChart()}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

        </SafeAreaView>
    );
}

const chartConfig = {
    backgroundGradientFrom: "#1A1A1A",
    backgroundGradientTo: "#1A1A1A",
    color: (opacity = 1) => `rgba(0, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222'
    },
    headerTitle: { fontSize: 20, fontWeight: '900', color: '#FFF' },

    statsContainer: {
        flexDirection: 'row', justifyContent: 'space-around', padding: 20,
        backgroundColor: '#0A0A0A', borderBottomWidth: 1, borderBottomColor: '#222'
    },
    statBox: { alignItems: 'center' },
    statValue: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginVertical: 4 },
    statLabel: { fontSize: 12, color: 'gray', textTransform: 'uppercase' },

    chartsWrapper: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
    sectionHeading: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginLeft: 20, marginBottom: 10 },
    chartsScroll: { paddingHorizontal: 15 },
    chartCard: {
        backgroundColor: '#0A0A0A',
        borderRadius: 20,
        padding: 20,
        marginRight: 20,
        borderWidth: 1,
        borderColor: '#00FFFF',
        shadowColor: '#00FFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 5,
        alignItems: 'center'
    },
    chartTitle: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 15,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    chartDescription: {
        color: 'gray',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 15,
        paddingHorizontal: 10,
        fontStyle: 'italic',
        maxWidth: screenWidth * 0.8
    },
    chartStyle: { borderRadius: 16 },

    actionsContainer: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
    broadcastBtn: {
        backgroundColor: '#FF00FF', flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        paddingVertical: 12, borderRadius: 8
    },
    broadcastBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },

    searchSection: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
    searchRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A',
        borderRadius: 8, height: 44
    },
    searchInput: { flex: 1, color: '#FFF', paddingHorizontal: 10, fontSize: 16 },

    list: { padding: 15, paddingBottom: 40 },
    card: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A',
        padding: 15, borderRadius: 12, marginBottom: 10
    },
    cardInfo: { flex: 1 },
    userNameText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    dateText: { color: 'gray', fontSize: 12, marginTop: 4 },
    
    adminBadge: {
        backgroundColor: '#FF00FF', paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 4
    },
    adminBadgeText: { color: '#000', fontSize: 10, fontWeight: 'bold' },
    bannedBadge: { backgroundColor: '#FF3B30', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    bannedBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    mutedBadge: { backgroundColor: '#FF9500', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    mutedBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
    bannedCard: { borderColor: '#FF3B30', borderWidth: 1, opacity: 0.7 },
    classText: { color: '#00FFFF', fontSize: 14, marginTop: 4 },

    actionBtn: { padding: 10 },

    emptyContainer: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: 'gray', fontSize: 16 },

    // Broadcast Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
    modalOverlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end', padding: 20 },
    broadcastModalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FF00FF' },
    actionSheetContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#333', paddingBottom: 30 },
    actionSheetTitle: { color: 'gray', fontSize: 14, textAlign: 'center', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1 },
    actionBtnItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
    actionBtnText: { color: '#00FFFF', fontSize: 16, textAlign: 'center', fontWeight: '500' },
    actionBtnTextDestructive: { color: '#FF3B30', fontSize: 16, textAlign: 'center', fontWeight: '500' },
    
    modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
    broadcastInput: { height: 100, borderWidth: 1, borderColor: '#333', borderRadius: 10, padding: 15, color: '#FFF', textAlignVertical: 'top', marginBottom: 20 },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15 },
    modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 20 },
    modalCancelText: { color: 'gray', fontWeight: 'bold' },
    modalSendBtn: { backgroundColor: '#FF00FF', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
    modalSendText: { color: '#000', fontWeight: 'bold' },
    
    fullScreenOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    fullScreenCard: {
        width: '95%',
        backgroundColor: '#111',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333'
    },
    closeFullScreenBtn: {
        position: 'absolute',
        top: 15,
        right: 15,
        zIndex: 10
    },
    fullScreenTitle: {
        color: '#FFF',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20,
        marginTop: 10
    },
    fullScreenScroll: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    fullScreenChartStyle: {
        borderRadius: 16
    }
});
