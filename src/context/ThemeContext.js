import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../services/supabase'; // Adjust path if needed
import { getCurrentUser } from '../services/authService'; // Adjust path if needed

const ThemeContext = createContext();

// Helper: determine if text should be white or dark based on background brightness
const getTextColorForBackground = (bgColor) => {
    // Since we now apply a global dark cinematic overlay (rgba(0,0,0,0.75)) 
    // across all screens via FandomBackground, all text MUST be white 
    // to remain legible, regardless of the underlying AI background color.
    return '#FFFFFF';
};

// Helper: Ensure the AI doesn't generate massive values that break the UI layout
const clampVisualConfig = (config) => {
    if (!config) return null;
    return {
        ...config,
        // Cap glow/shadow radius and elevation so it doesn't push margins and overlap elements
        glowIntensity: Math.min(Math.max(config.glowIntensity || 10, 0), 15),
        // Cap border radius so it doesn't turn squares into perfect circles unintentionally
        borderRadius: Math.min(Math.max(config.borderRadius || 15, 0), 30),
        shadowOpacity: Math.min(Math.max(config.shadowOpacity || 0.5, 0), 1),
    };
};

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
            borderRadius: 15,
            animationType: 'none'
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
                    textColor: getTextColorForBackground(data.backgroundColor),
                    fandomName: data.fandomName || 'Unknown',
                    visualConfig: clampVisualConfig(data.visualConfig) || {
                        glowIntensity: 10,
                        shadowOpacity: 0.5,
                        animationSpeed: 300,
                        borderRadius: 15,
                        animationType: 'none'
                    }
                });
            }
        } catch (error) {
            console.error("Error loading global theme:", error.message);
        }
    };

    // Allows components to update the theme (like after a new setup)
    const updateTheme = (newConfig) => {
        setTheme((prevTheme) => {
            const merged = { ...prevTheme, ...newConfig };
            // Auto-compute textColor whenever backgroundColor changes
            if (newConfig.backgroundColor) {
                merged.textColor = getTextColorForBackground(newConfig.backgroundColor);
            }
            if (newConfig.visualConfig) {
                merged.visualConfig = clampVisualConfig(newConfig.visualConfig);
            }
            return merged;
        });
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