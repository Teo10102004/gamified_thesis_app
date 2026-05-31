import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// FRIENDSHIP & SOCIAL SERVICE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searches for a user by exactly matching their username.
 * We use an exact match for privacy.
 */
export const searchUserByExactUsername = async (username) => {
    try {
        const { data, error } = await supabase
            .from('User')
            .select('userId, userName, avatarUrl, playerClass, fandomName')
            .eq('userName', username.trim())
            .single(); // Use single because username should be unique

        if (error) {
            // If no rows found, single() throws an error, we catch it gracefully
            return { success: false, user: null };
        }
        return { success: true, user: data };
    } catch (e) {
        return { success: false, user: null };
    }
};

/**
 * Sends a friend request.
 */
export const sendFriendRequest = async (senderId, receiverId) => {
    try {
        // Check if a request already exists (either direction)
        const { data: existing, error: checkError } = await supabase
            .from('friendship')
            .select('*')
            .or(`and(user_id_1.eq.${senderId},user_id_2.eq.${receiverId}),and(user_id_1.eq.${receiverId},user_id_2.eq.${senderId})`);
            
        if (existing && existing.length > 0) {
            return { success: false, error: 'Friendship or request already exists' };
        }

        const { error } = await supabase
            .from('friendship')
            .insert({
                user_id_1: senderId,
                user_id_2: receiverId,
                status: 'pending'
            });

        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('Error sending friend request:', e.message);
        return { success: false, error: e.message };
    }
};

/**
 * Fetches pending requests RECEIVED by the user.
 */
export const getPendingRequests = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('friendship')
            .select('*')
            .eq('user_id_2', userId)
            .eq('status', 'pending');

        if (error) throw error;
        if (!data || data.length === 0) return { success: true, requests: [] };

        // Fetch user profiles for senders
        const senderIds = data.map(r => r.user_id_1);
        const { data: users, error: userError } = await supabase
            .from('User')
            .select('userId, userName, avatarUrl, playerClass')
            .in('userId', senderIds);

        if (userError) throw userError;

        const requests = data.map(req => {
            const sender = users.find(u => u.userId === req.user_id_1);
            return {
                id: req.id,
                user_id_1: req.user_id_1,
                sender: sender || { userName: 'Unknown' }
            };
        });

        return { success: true, requests };
    } catch (e) {
        console.error('Error getting requests:', e.message);
        return { success: false, requests: [] };
    }
};

/**
 * Accepts a pending friend request.
 */
export const acceptFriendRequest = async (requestId) => {
    try {
        const { error } = await supabase
            .from('friendship')
            .update({ status: 'accepted' })
            .eq('id', requestId);

        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('Error accepting request:', e.message);
        return { success: false, error: e.message };
    }
};

/**
 * Fetches the user's accepted friends.
 */
export const getFriendsList = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('friendship')
            .select('*')
            .eq('status', 'accepted')
            .or(`user_id_1.eq.${userId},user_id_2.eq.${userId}`);

        if (error) throw error;
        if (!data || data.length === 0) return { success: true, friends: [] };

        // Collect all friend IDs
        const friendIds = data.map(f => f.user_id_1 === userId ? f.user_id_2 : f.user_id_1);

        const { data: users, error: userError } = await supabase
            .from('User')
            .select('userId, userName, avatarUrl, playerClass, fandomName')
            .in('userId', friendIds);

        if (userError) throw userError;

        return { success: true, friends: users };
    } catch (e) {
        console.error('Error getting friends:', e.message);
        return { success: false, friends: [] };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CHAT SERVICE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches chat history between two users.
 */
export const getChatHistory = async (userId1, userId2) => {
    try {
        const { data, error } = await supabase
            .from('chat_message')
            .select('*')
            .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return { success: true, messages: data };
    } catch (e) {
        console.error('Error getting chat history:', e.message);
        return { success: false, messages: [] };
    }
};

/**
 * Sends a chat message.
 */
export const sendMessage = async (senderId, receiverId, text) => {
    try {
        const { data, error } = await supabase
            .from('chat_message')
            .insert({
                sender_id: senderId,
                receiver_id: receiverId,
                message_text: text
            })
            .select();

        if (error) throw error;
        return { success: true, message: data[0] };
    } catch (e) {
        console.error('Error sending message:', e.message);
        return { success: false, error: e.message };
    }
};
