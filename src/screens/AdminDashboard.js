import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getAppStats, getAllUsers, setAdminStatus, setUserBanStatus, hideAllUserQuests, broadcastAnnouncement } from '../services/adminService';
import { Alert, Modal } from 'react-native';

export default function AdminDashboard({ navigation }) {
    const [stats, setStats] = useState({ users: 0, quizzes: 0, sessions: 0 });
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showBroadcastModal, setShowBroadcastModal] = useState(false);
    const [broadcastText, setBroadcastText] = useState('');
    const [isBroadcasting, setIsBroadcasting] = useState(false);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const [statsRes, usersRes] = await Promise.all([
                getAppStats(),
                getAllUsers()
            ]);

            if (statsRes.success) setStats(statsRes.stats);
            if (usersRes.success) {
                setUsers(usersRes.users);
                setFilteredUsers(usersRes.users);
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
        Alert.alert(
            `Manage ${user.userName}`,
            "Select an action:",
            [
                { 
                    text: user.is_admin ? "Revoke Admin" : "Promote to Admin", 
                    onPress: async () => {
                        const res = await setAdminStatus(user.userId, !user.is_admin);
                        if (res.success) {
                            Alert.alert("Success", `User is now ${!user.is_admin ? 'an Admin' : 'a regular user'}.`);
                            loadData(true);
                        } else {
                            Alert.alert("Error", res.error);
                        }
                    }
                },
                {
                    text: user.is_banned ? "Unban User" : "Ban User",
                    style: user.is_banned ? 'default' : 'destructive',
                    onPress: async () => {
                        const res = await setUserBanStatus(user.userId, !user.is_banned);
                        if (res.success) {
                            Alert.alert("Success", `User has been ${user.is_banned ? 'unbanned' : 'banned'}.`);
                            loadData(true);
                        } else {
                            Alert.alert("Error", res.error);
                        }
                    }
                },
                {
                    text: "Hide Public Quests",
                    style: 'destructive',
                    onPress: async () => {
                        const res = await hideAllUserQuests(user.userId);
                        if (res.success) Alert.alert("Success", "User's public quests are now hidden.");
                        else Alert.alert("Error", res.error);
                    }
                },
                { text: "Cancel", style: "cancel" }
            ]
        );
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

    const renderUser = ({ item }) => (
        <View style={[styles.card, item.is_banned && styles.bannedCard]}>
            <View style={styles.cardInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.userNameText}>{item.userName || item.email}</Text>
                    {item.is_admin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View>}
                    {item.is_banned && <View style={styles.bannedBadge}><Text style={styles.bannedBadgeText}>BANNED</Text></View>}
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

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color="#FF00FF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Admin Dashboard</Text>
                <View style={{ width: 28 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : null}>
                
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

                {/* Actions Section */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity style={styles.broadcastBtn} onPress={() => setShowBroadcastModal(true)}>
                        <Ionicons name="megaphone" size={20} color="#000" />
                        <Text style={styles.broadcastBtnText}>Broadcast Announcement</Text>
                    </TouchableOpacity>
                </View>

                {/* Search Box */}
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

                {/* User List */}
                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color="#FF00FF" />
                    </View>
                ) : (
                    <FlatList
                        data={filteredUsers}
                        keyExtractor={item => item.userId}
                        renderItem={renderUser}
                        contentContainerStyle={styles.list}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF00FF" />}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>No users found.</Text>
                            </View>
                        }
                    />
                )}
            </KeyboardAvoidingView>

            {/* Broadcast Modal */}
            <Modal visible={showBroadcastModal} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.broadcastModalContent}>
                        <Text style={styles.modalTitle}>New Announcement</Text>
                        <TextInput
                            style={styles.broadcastInput}
                            placeholder="Type your message here..."
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

        </SafeAreaView>
    );
}

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
    bannedCard: { borderColor: '#FF3B30', borderWidth: 1, opacity: 0.7 },
    classText: { color: '#00FFFF', fontSize: 14, marginTop: 4 },

    actionBtn: { padding: 10 },

    emptyContainer: { alignItems: 'center', marginTop: 40 },
    emptyText: { color: 'gray', fontSize: 16 },

    // Broadcast Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
    broadcastModalContent: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FF00FF' },
    modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginBottom: 15 },
    broadcastInput: { 
        backgroundColor: '#0A0A0A', color: '#FFF', borderRadius: 10, padding: 15, 
        height: 120, textAlignVertical: 'top', fontSize: 16, borderWidth: 1, borderColor: '#333', marginBottom: 20
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15 },
    modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 20 },
    modalCancelText: { color: 'gray', fontSize: 16, fontWeight: 'bold' },
    modalSendBtn: { backgroundColor: '#FF00FF', paddingVertical: 10, paddingHorizontal: 25, borderRadius: 8 },
    modalSendText: { color: '#000', fontSize: 16, fontWeight: 'bold' }
});
