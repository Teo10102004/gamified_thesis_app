import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../services/supabase'; // Adjust path if needed
import { getCurrentUser } from '../services/authService'; // Adjust path if needed

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // 1. Start with the defaults just in case
    const [theme, setTheme] = useState({
        primaryColor: '#FF00FF',
        secondaryColor: '#00FFFF',
        backgroundColor: '#000000',
        textColor: '#FFFFFF',
        fandomName: 'Unknown',
        // Default visual DNA
        visualConfig: {
            glowIntensity: 10,
            shadowOpacity: 0.5,
            animationSpeed: 300,
            borderRadius: 15
        }
    });

    // 2. Fetch from database when the app opens
    useEffect(() => {
        loadUserTheme();
    }, []);

    const loadUserTheme = async () => {
        try {
            const user = await getCurrentUser();
            if (!user) return;

            // --- STAGE 1: THE OPTIMISTIC FETCH ---
            // We try to get everything, including the fancy AI-generated Visual DNA.
            let { data, error } = await supabase
                .from('User')
                .select('primaryColor, secondaryColor, backgroundColor, fandomName, visualConfig')
                .eq('userId', user.id)
                .single();

            // --- STAGE 2: THE "MISSING COLUMN" FALLBACK ---
            // If the database complains that 'visualConfig' doesn't exist, we don't panic!
            if (error && error.message.toLowerCase().includes('visualconfig')) {
                console.warn("VisualConfig column missing in DB. Using standard colors only.");
                const fallback = await supabase
                    .from('User')
                    .select('primaryColor, secondaryColor, backgroundColor, fandomName')
                    .eq('userId', user.id)
                    .single();
                data = fallback.data;
                error = fallback.error;
            }

            if (error) throw error;

            if (data) {
                // If visualConfig exists, we use it. If not, we use the hardcoded defaults.
                setTheme({
                    primaryColor: data.primaryColor || '#FF00FF',
                    secondaryColor: data.secondaryColor || '#00FFFF',
                    backgroundColor: data.backgroundColor || '#000000',
                    textColor: '#FFFFFF',
                    fandomName: data.fandomName || 'Unknown',
                    visualConfig: data.visualConfig || {
                        glowIntensity: 10,
                        shadowOpacity: 0.5,
                        animationSpeed: 300,
                        borderRadius: 15
                    }
                });
            }
        } catch (error) {
            console.error("Error loading global theme:", error.message);
        }
    };

    // Allows components to update the theme (like after a new setup)
    const updateTheme = (newConfig) => {
        setTheme((prevTheme) => ({
            ...prevTheme,
            ...newConfig,
            // If the newConfig has visualConfig, it will overwrite the old one
        }));
    };

    return (
        <ThemeContext.Provider value={{ theme, updateTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    return useContext(ThemeContext);
};