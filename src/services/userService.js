import { supabase } from './supabase'; 

export const createUserProfile = async (userId, email) => { // Insert a new user profile into the 'User' table with the provided userId and email
    const { error } = await supabase
        .from('User')
        .insert([{ userId, email }]);
    if (error) throw error;
};

export const updateFullProfile = async (userId, updates) => { // Update the user profile in the 'User' table for the given userId with the provided updates (e.g., name, avatarUrl, etc.)
    const { error } = await supabase
        .from('User')
        .update(updates) //this method takes a JavaScript object containing the columns to be updated and their new values, and updates the corresponding row in the 'User' table with those values
        .eq('userId', userId); // Use the eq method to specify that we want to update the row where the userId matches the provided userId
    if (error) throw error;
};