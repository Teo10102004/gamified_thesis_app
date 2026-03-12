import { supabase } from './supabase'; // Import the configured Supabase client instance from the supabaseConfig.js file

export const signUpUser = async (email, password) => { // Use the signUp method from Supabase's auth module to create a new user with the provided email and password
    //create the user in the supabse auth system
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
    });
    if (error) throw error; // If there is an error during the sign-up process, throw the error to be handled by the calling function

    //insert the id and email in the user table
    if(data?.user){
        const {error: insertError} = await supabase
        .from('User')
        .insert([{ 
            userId: data.user.id, email: data.user.email 
        }]);

        if(insertError) {
            console.error('Error inserting user profile:', insertError);
            throw insertError; // Throw the error to be handled by the calling function
        }
    }


    return data;
};

export const signInUser = async (email, password) => {      // Use the signInWithPassword method from Supabase's auth module to authenticate the user with the provided email and password
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });
    if (error) throw error;
    return data;
};

export const getCurrentUser = async () => { // Use the getUser method from Supabase's auth module to retrieve the currently authenticated user's information
    const {data, error} = await supabase.auth.getUser();

    if(error){
        console.error('Error fetching current user:', error);
        return null; // Return null if there was an error fetching the user information
    }

    return data?.user || null; // Return the user object if it exists, otherwise return null
}

export const logoutUser = async () => { // Use the signOut method from Supabase's auth module to log out the current user
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
};