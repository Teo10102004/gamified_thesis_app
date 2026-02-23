import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kbkobwnejjgjddlcsoju.supabase.co';
const supabaseAnonKey = 'sb_publishable_uoirzpfwpNPcpshywreCRw_Fna7gluR';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, //async storage is an unencrypted, asynchronous, persistent, key-value storage system that is global to the app. It should be used instead of LocalStorage.
    autoRefreshToken: true, // Automatically refresh the access token when it expires so that the user doesn't have to log in again
    persistSession: true, // Persist the session across app restarts
    detectSessionInUrl: false, // Disable URL session detection since it's not applicable in React Native, deep linking is not used because we are using Expo and React Native, which do not have a traditional URL structure like web applications.
  },
}); // Export the Supabase client for use in other parts of the app



