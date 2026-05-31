import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { getAllAnnouncements } from '../services/notificationService';
import FandomBackground from '../components/FandomBackground';

export default function NotificationsScreen({ route, navigation }) {
    const { userId } = route.params || {};
    const { theme } = useTheme();
    const { primaryColor, secondaryColor, textColor } = theme;

    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const { success, announcements: data } = await getAllAnnouncements();
            if (success) {
                setAnnouncements(data);
                
                // Clear the unread badge globally for this user
                if (data.length > 0 && userId) {
                    const highestId = Math.max(...data.map(d => d.id));
                    await AsyncStorage.setItem(`last_seen_notification_${userId}`, highestId.toString());
                }
            }
        } catch (e) {
            console.error('Failed to load notifications:', e);
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

    const renderItem = ({ item }) => {
        const dateStr = new Date(item.created_at).toLocaleDateString(undefined, { 
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });

        return (
            <View style={[styles.card, { borderColor: 'rgba(255,255,255,0.1)' }]}>
                <View style={styles.cardHeader}>
                    <Ionicons name="megaphone" size={20} color={primaryColor} />
                    <Text style={styles.dateText}>{dateStr}</Text>
                </View>
                <Text style={[styles.messageText, { color: textColor }]}>{item.message}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />
            
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={28} color={secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: textColor }]}>Notifications</Text>
                <View style={{ width: 28 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={primaryColor} />
                </View>
            ) : (
                <FlatList
                    data={announcements}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="notifications-off-outline" size={60} color="rgba(255,255,255,0.2)" />
                            <Text style={styles.emptyText}>No new notifications.</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)'
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold' },
    backBtn: { zIndex: 10 },
    list: { padding: 16 },
    card: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12, padding: 16, marginBottom: 12,
        borderWidth: 1
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    dateText: { color: 'gray', fontSize: 12 },
    messageText: { fontSize: 16, lineHeight: 24 },
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyText: { color: 'gray', fontSize: 16, marginTop: 16 }
});
