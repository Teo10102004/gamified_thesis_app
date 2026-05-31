import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Image, ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import FandomBackground from '../components/FandomBackground';
import { getCurrentUser } from '../services/authService';
import {
    searchUserByExactUsername,
    sendFriendRequest,
    getPendingRequests,
    acceptFriendRequest,
    getFriendsList
} from '../services/socialService';

const Avatar = ({ uri, size = 44, borderColor }) => (
    uri
        ? <Image source={{ uri }} style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, borderColor }]} />
        : <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2, borderColor }]}>
            <Ionicons name="person" size={size * 0.5} color={borderColor} />
          </View>
);

export default function FriendsDashboard({ navigation }) {
    const { theme } = useTheme();
    const { primaryColor, secondaryColor, textColor } = theme;

    const [currentUserId, setCurrentUserId] = useState(null);
    const [friends, setFriends] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const user = await getCurrentUser();
            if (user) {
                setCurrentUserId(user.id);
                const [friendsRes, reqRes] = await Promise.all([
                    getFriendsList(user.id),
                    getPendingRequests(user.id)
                ]);

                if (friendsRes.success) setFriends(friendsRes.friends);
                if (reqRes.success) setRequests(reqRes.requests);
            }
        } catch (e) {
            console.error('Friends load error:', e.message);
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

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setSearchLoading(true);
        setSearchResult(null);
        
        const res = await searchUserByExactUsername(searchQuery);
        if (res.success && res.user && res.user.userId !== currentUserId) {
            setSearchResult(res.user);
        } else {
            setSearchResult('not_found');
        }
        setSearchLoading(false);
    };

    const handleSendRequest = async (receiverId) => {
        const res = await sendFriendRequest(currentUserId, receiverId);
        if (res.success) {
            alert('Friend request sent!');
            setSearchResult(null);
            setSearchQuery('');
        } else {
            alert(res.error || 'Could not send request.');
        }
    };

    const handleAcceptRequest = async (requestId) => {
        const res = await acceptFriendRequest(requestId);
        if (res.success) {
            loadData(true);
        } else {
            alert('Failed to accept request.');
        }
    };

    const renderFriend = ({ item }) => (
        <TouchableOpacity 
            style={styles.card}
            onPress={() => navigation.navigate('ChatScreen', { 
                friendId: item.userId, 
                friendName: item.userName, 
                avatarUrl: item.avatarUrl 
            })}
        >
            <Avatar uri={item.avatarUrl} size={50} borderColor={primaryColor} />
            <View style={styles.cardInfo}>
                <Text style={styles.cardName} numberOfLines={1}>{item.userName}</Text>
                <Text style={[styles.cardClass, { color: secondaryColor }]} numberOfLines={1}>
                    {item.playerClass} {item.fandomName ? `· ${item.fandomName}` : ''}
                </Text>
            </View>
            <Ionicons name="chatbubbles" size={24} color={primaryColor} />
        </TouchableOpacity>
    );

    const renderRequest = ({ item }) => (
        <View style={styles.card}>
            <Avatar uri={item.sender.avatarUrl} size={50} borderColor={secondaryColor} />
            <View style={styles.cardInfo}>
                <Text style={styles.cardName} numberOfLines={1}>{item.sender.userName}</Text>
                <Text style={[styles.cardClass, { color: 'gray' }]} numberOfLines={1}>{item.sender.playerClass}</Text>
            </View>
            <TouchableOpacity 
                style={[styles.acceptBtn, { backgroundColor: primaryColor }]}
                onPress={() => handleAcceptRequest(item.id)}
            >
                <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: textColor }]}>Friends</Text>
                <View style={{ width: 28 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : null}>
                {/* Search Box */}
                <View style={styles.searchSection}>
                    <Text style={[styles.sectionTitle, { color: primaryColor }]}>ADD FRIEND</Text>
                    <View style={styles.searchRow}>
                        <TextInput
                            style={[styles.searchInput, { borderColor: primaryColor }]}
                            placeholder="Exact username..."
                            placeholderTextColor="gray"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={handleSearch}
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                        <TouchableOpacity 
                            style={[styles.searchBtn, { backgroundColor: primaryColor }]} 
                            onPress={handleSearch}
                        >
                            <Ionicons name="search" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>

                    {searchLoading && <ActivityIndicator color={primaryColor} style={{ marginTop: 10 }} />}
                    
                    {searchResult === 'not_found' && (
                        <Text style={styles.notFoundText}>Player not found.</Text>
                    )}

                    {searchResult && searchResult !== 'not_found' && (
                        <View style={styles.searchResultCard}>
                            <Avatar uri={searchResult.avatarUrl} size={40} borderColor={secondaryColor} />
                            <Text style={styles.searchResultName}>{searchResult.userName}</Text>
                            <TouchableOpacity 
                                style={[styles.addBtn, { backgroundColor: secondaryColor }]}
                                onPress={() => handleSendRequest(searchResult.userId)}
                            >
                                <Ionicons name="person-add" size={16} color="#000" />
                                <Text style={styles.addBtnText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={primaryColor} />
                    </View>
                ) : (
                    <FlatList
                        data={friends}
                        keyExtractor={item => item.userId}
                        renderItem={renderFriend}
                        contentContainerStyle={styles.list}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
                        ListHeaderComponent={
                            <>
                                {requests.length > 0 && (
                                    <View style={styles.requestsSection}>
                                        <Text style={[styles.sectionTitle, { color: secondaryColor }]}>PENDING REQUESTS ({requests.length})</Text>
                                        {requests.map(req => (
                                            <React.Fragment key={req.id}>
                                                {renderRequest({ item: req })}
                                            </React.Fragment>
                                        ))}
                                    </View>
                                )}
                                <Text style={[styles.sectionTitle, { color: primaryColor, marginTop: 10 }]}>MY FRIENDS ({friends.length})</Text>
                            </>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={60} color="rgba(255,255,255,0.2)" />
                                <Text style={styles.emptyText}>You haven't added any friends yet.</Text>
                            </View>
                        }
                    />
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
    },
    headerTitle: { fontSize: 22, fontWeight: '900' },

    sectionTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 10, marginLeft: 4 },

    searchSection: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)'
    },
    searchRow: { flexDirection: 'row', alignItems: 'center' },
    searchInput: {
        flex: 1, height: 44, borderWidth: 1, borderRadius: 8,
        paddingHorizontal: 15, color: '#FFF', backgroundColor: 'rgba(255,255,255,0.05)',
        marginRight: 10
    },
    searchBtn: { width: 44, height: 44, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    
    notFoundText: { color: '#ff4444', marginTop: 10, fontSize: 14 },
    searchResultCard: {
        flexDirection: 'row', alignItems: 'center', marginTop: 15,
        backgroundColor: 'rgba(255,255,255,0.05)', padding: 10, borderRadius: 10
    },
    searchResultName: { flex: 1, color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 12 },
    addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    addBtnText: { color: '#000', fontWeight: 'bold', marginLeft: 4, fontSize: 12 },

    list: { padding: 16, paddingBottom: 40 },
    requestsSection: { marginBottom: 20 },

    card: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12, borderRadius: 12, marginBottom: 10,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
    },
    cardInfo: { flex: 1, marginLeft: 12 },
    cardName: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
    cardClass: { fontSize: 12 },
    
    acceptBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    acceptBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

    avatar: { borderWidth: 1 },
    avatarFallback: {
        borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center', alignItems: 'center',
    },

    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyText: { color: 'gray', marginTop: 15 }
});
