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

export const getAdminAnalytics = async () => {
    try {
        const getLocalYMD = (d) => {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const cutoffDateStr = getLocalYMD(sevenDaysAgo);
        const cutoffDate = new Date(cutoffDateStr); // Restore cutoffDate for quizzes/decks!

        const { data: dauData } = await supabase
            .from('User')
            .select('last_active_date')
            .gte('last_active_date', cutoffDateStr);

        const dauMap = {};
        // Initialize last 7 days with 0
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dauMap[getLocalYMD(d)] = 0;
        }

        (dauData || []).forEach(row => {
            if (row.last_active_date && dauMap[row.last_active_date] !== undefined) {
                dauMap[row.last_active_date]++;
            }
        });

        const dauChart = {
            labels: Object.keys(dauMap).map(d => d.slice(5)), // "MM-DD"
            datasets: [{ data: Object.values(dauMap) }]
        };

        // 2. Reading vs Quizzes
        const [{ count: readCount }, { count: quizCount }] = await Promise.all([
            supabase.from('reading_session').select('*', { count: 'exact', head: true }),
            supabase.from('userquizscore').select('*', { count: 'exact', head: true })
        ]);
        const activityPie = [
            { name: "Reading", count: readCount || 0, color: "#00FFFF", legendFontColor: "#7F7F7F", legendFontSize: 12 },
            { name: "Quizzes", count: quizCount || 0, color: "#FF00FF", legendFontColor: "#7F7F7F", legendFontSize: 12 }
        ];

        // 3. Fandom Popularity
        const { data: fandomData } = await supabase.from('User').select('fandomName');
        const fMap = {};
        (fandomData || []).forEach(u => {
            if (!u.fandomName) return;
            fMap[u.fandomName] = (fMap[u.fandomName] || 0) + 1;
        });
        
        // Helper to shorten long names like "Harry Potter" -> "Harry P..."
        const truncate = (str, n) => (str.length > n) ? str.substr(0, n-1) + '…' : str;
        
        const sortedFandoms = Object.entries(fMap).sort((a,b) => b[1]-a[1]).slice(0, 4);
        const fandomChart = {
            labels: sortedFandoms.length ? sortedFandoms.map(f => truncate(f[0], 10)) : ["None"],
            datasets: [{ data: sortedFandoms.length ? sortedFandoms.map(f => f[1]) : [0] }]
        };

        // 4. Content Creation Engine (Last 7 days)
        const [
            { data: docs },
            { data: allQuizzes },
            { data: allDecks }
        ] = await Promise.all([
            supabase.from('document').select('uploaddate').gte('uploaddate', cutoffDateStr),
            supabase.from('quiz').select('*'), // Fetch all, we will filter safely in JS
            supabase.from('flashcard_deck').select('*') // Fetch all decks too to avoid date column errors
        ]);

        // Safely filter quizzes by finding whatever date column they use (created_at, date_created, etc)
        // If there is no date column, we have to assume they don't count for the 7D graph.
        const recentQuizzes = (allQuizzes || []).filter(q => {
            const dStr = q.created_at || q.creationdate || q.date_created;
            if (!dStr) return false; // No date column found
            return new Date(dStr) >= cutoffDate;
        });

        const contentChart = {
            labels: ["Docs", "Quests", "Decks"],
            datasets: [{
                data: [
                    (docs || []).length,
                    (allQuizzes || []).length,
                    (allDecks || []).length
                ]
            }]
        }; 
        
        return { success: true, dauChart, activityPie, fandomChart, contentChart };
    } catch (e) {
        console.error('Error fetching admin analytics:', e.message);
        return { success: false };
    }
};

export const getAllUsers = async () => {
    try {
        const { data, error } = await supabase
            .from('User')
            .select('userId, email, userName, playerClass, fandomName, createdAt, is_admin, is_banned, visualConfig')
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

export const setUserMuteStatus = async (userId, isMuted) => {
    try {
        const { data: user, error: fetchError } = await supabase
            .from('User')
            .select('visualConfig')
            .eq('userId', userId)
            .single();
            
        if (fetchError) throw fetchError;
        
        const currentConfig = user.visualConfig || {};
        const newConfig = { ...currentConfig, is_muted: isMuted };
        
        const { error: updateError } = await supabase
            .from('User')
            .update({ visualConfig: newConfig })
            .eq('userId', userId);
            
        if (updateError) throw updateError;
        return { success: true };
    } catch (e) {
        console.error('Error setting mute status:', e.message);
        return { success: false, error: e.message };
    }
};

export const resetUserXP = async (userId) => {
    try {
        const { error } = await supabase
            .from('userquizscore')
            .delete()
            .eq('userid', userId);
            
        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error('Error resetting user XP:', e.message);
        return { success: false, error: e.message };
    }
};

export const setUserQuestsHiddenStatus = async (userId, isHidden) => {
    try {
        const { data: user, error: fetchError } = await supabase
            .from('User')
            .select('visualConfig')
            .eq('userId', userId)
            .single();
            
        if (fetchError) throw fetchError;
        
        const currentConfig = user.visualConfig || {};
        const newConfig = { ...currentConfig, is_quests_hidden: isHidden };
        
        const { error: updateError } = await supabase
            .from('User')
            .update({ visualConfig: newConfig })
            .eq('userId', userId);
            
        if (updateError) throw updateError;
        return { success: true };
    } catch (e) {
        console.error('Error setting quests hidden status:', e.message);
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
