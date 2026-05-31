import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export const getLatestAnnouncement = async () => {
    try {
        const { data, error } = await supabase
            .from('global_announcement')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return { success: true, announcement: data };
    } catch (e) {
        console.error('Error fetching latest announcement:', e.message);
        return { success: false, announcement: null };
    }
};

export const getAllAnnouncements = async () => {
    try {
        const { data, error } = await supabase
            .from('global_announcement')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, announcements: data || [] };
    } catch (e) {
        console.error('Error fetching announcements:', e.message);
        return { success: false, announcements: [] };
    }
};
