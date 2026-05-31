import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export const checkIsAdmin = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('User')
            .select('is_admin')
            .eq('userId', userId)
            .single();

        if (error) throw error;
        return data?.is_admin === true;
    } catch (e) {
        console.error('Admin check failed:', e.message);
        return false;
    }
};

export const getAppStats = async () => {
    try {
        const [{ count: userCount }, { count: quizCount }, { count: sessionCount }] = await Promise.all([
            supabase.from('User').select('*', { count: 'exact', head: true }),
            supabase.from('quiz').select('*', { count: 'exact', head: true }),
            supabase.from('reading_session').select('*', { count: 'exact', head: true })
        ]);

        return {
            success: true,
            stats: {
                users: userCount || 0,
                quizzes: quizCount || 0,
                sessions: sessionCount || 0
            }
        };
    } catch (e) {
        console.error('Error fetching app stats:', e.message);
        return { success: false, stats: { users: 0, quizzes: 0, sessions: 0 } };
    }
};

export const getAllUsers = async () => {
    try {
        const { data, error } = await supabase
            .from('User')
            .select('userId, email, userName, playerClass, fandomName, createdAt, is_admin, is_banned')
            .order('createdAt', { ascending: false });

        if (error) throw error;
        return { success: true, users: data };
    } catch (e) {
        console.error('Error fetching all users:', e.message);
        return { success: false, users: [] };
    }
};

// --- MODERATION ACTIONS ---

export const setAdminStatus = async (userId, isAdmin) => {
    try {
        const { error } = await supabase
            .from('User')
            .update({ is_admin: isAdmin })
            .eq('userId', userId);
            
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('Error setting admin status:', e.message);
        return { success: false, error: e.message };
    }
};

export const setUserBanStatus = async (userId, isBanned) => {
    try {
        const { error } = await supabase
            .from('User')
            .update({ is_banned: isBanned })
            .eq('userId', userId);
            
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('Error setting ban status:', e.message);
        return { success: false, error: e.message };
    }
};

export const hideAllUserQuests = async (userId) => {
    try {
        const { error } = await supabase
            .from('quiz')
            .update({ ispublic: false, is_deleted: true })
            .eq('userid', userId);
            
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('Error hiding user quests:', e.message);
        return { success: false, error: e.message };
    }
};

export const broadcastAnnouncement = async (message) => {
    try {
        const { error } = await supabase
            .from('global_announcement')
            .insert([{ message }]);
            
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('Error broadcasting:', e.message);
        return { success: false, error: e.message };
    }
};
