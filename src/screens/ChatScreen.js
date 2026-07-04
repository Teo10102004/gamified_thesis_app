import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    TextInput, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import FandomBackground from '../components/FandomBackground';
import { getCurrentUser } from '../services/authService';
import { getChatHistory, sendMessage, checkIsMuted } from '../services/socialService';

export default function ChatScreen({ route, navigation }) {
    const { friendId, friendName, avatarUrl } = route.params;
    const { theme } = useTheme();
    const { primaryColor, secondaryColor, textColor } = theme;

    const [currentUserId, setCurrentUserId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [isMuted, setIsMuted] = useState(false);

    const pollInterval = useRef(null);

    const loadMessages = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            let uid = currentUserId;
            if (!uid) {
                const user = await getCurrentUser();
                uid = user.id;
                setCurrentUserId(user.id);
            }
            
            if (uid) {
                const muted = await checkIsMuted(uid);
                setIsMuted(muted);
                const res = await getChatHistory(uid, friendId);
                if (res.success) {
                    // Reverse because FlatList is inverted (newest at bottom)
                    setMessages(res.messages.reverse());
                }
            }
        } catch (e) {
            console.error('Chat load error:', e.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [currentUserId, friendId]);

    useEffect(() => {
        loadMessages();
        
        // Simple polling for new messages every 5 seconds
        pollInterval.current = setInterval(() => {
            loadMessages(true);
        }, 5000);

        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current);
        };
    }, [loadMessages]);

    const handleSend = async () => {
        if (!inputText.trim() || !currentUserId) return;
        
        const textToSend = inputText.trim();
        setInputText(''); // clear immediately for better UX
        setSending(true);

        const res = await sendMessage(currentUserId, friendId, textToSend);
        if (res.success) {
            // Optimistically add to list
            setMessages(prev => [res.message, ...prev]);
        } else {
            alert('Failed to send message.');
            setInputText(textToSend); // restore
        }
        
        setSending(false);
    };

    const renderMessage = ({ item }) => {
        const isMe = item.sender_id === currentUserId;
        return (
            <View style={[
                styles.messageBubble,
                isMe ? [styles.myBubble, { backgroundColor: primaryColor }] : [styles.theirBubble, { backgroundColor: 'rgba(255,255,255,0.1)' }]
            ]}>
                <Text style={[styles.messageText, { color: isMe ? '#000' : '#FFF' }]}>
                    {item.message_text}
                </Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: textColor }]}>{friendName}</Text>
                <View style={{ width: 28 }} />
            </View>

            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator size="large" color={primaryColor} />
                    </View>
                ) : (
                    <FlatList
                        data={messages}
                        keyExtractor={item => item.message_id.toString()}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.list}
                        inverted={true} // Newest messages at the bottom
                        ListEmptyComponent={
                            <View style={[styles.center, { transform: [{ scaleY: -1 }] }]}>
                                <Text style={styles.emptyText}>No messages yet. Say hi!</Text>
                            </View>
                        }
                    />
                )}

                {/* Input Area */}
                <View style={styles.inputArea}>
                    <TextInput
                        style={styles.textInput}
                        placeholder={isMuted ? "You are muted." : "Type a message..."}
                        placeholderTextColor={isMuted ? "#FF3B30" : "gray"}
                        value={inputText}
                        onChangeText={setInputText}
                        multiline
                        maxLength={500}
                        editable={!isMuted}
                    />
                    <TouchableOpacity 
                        style={[
                            styles.sendBtn, 
                            { backgroundColor: (inputText.trim() && !isMuted) ? primaryColor : 'rgba(255,255,255,0.1)' }
                        ]}
                        onPress={handleSend}
                        disabled={!inputText.trim() || sending || isMuted}
                    >
                        <Ionicons name="send" size={18} color={(inputText.trim() && !isMuted) ? '#000' : 'gray'} />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold' },

    list: { padding: 16 },

    messageBubble: {
        maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 10,
    },
    myBubble: {
        alignSelf: 'flex-end', borderBottomRightRadius: 4,
    },
    theirBubble: {
        alignSelf: 'flex-start', borderBottomLeftRadius: 4,
    },
    messageText: { fontSize: 15, lineHeight: 20 },

    inputArea: {
        flexDirection: 'row', alignItems: 'flex-end', padding: 12,
        backgroundColor: 'rgba(0,0,0,0.5)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)'
    },
    textInput: {
        flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
        color: '#FFF', fontSize: 15, marginRight: 10
    },
    sendBtn: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center', marginBottom: 2
    },
    
    emptyText: { color: 'gray', fontSize: 15 }
});
