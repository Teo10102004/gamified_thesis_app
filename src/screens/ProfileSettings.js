import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Image,
    ScrollView,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    LayoutAnimation,
    UIManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../context/ThemeContext';
import { getCurrentUser, logoutUser } from '../services/authService';
import { updateFullProfile, uploadAvatar, checkUsernameAvailable, saveFandomCache, getFandomCache } from '../services/userService';
import { generateSeriesAesthetic, generateFandomRanks } from '../services/aiService';
import { supabase } from '../services/supabase';
import FandomSearch from '../components/FandomSearch';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ProfileSettings({ navigation }) {
    const { theme, updateTheme } = useTheme();
    
    // Fallback theme colors
    const primaryColor = theme.primaryColor || '#FF00FF';
    const secondaryColor = theme.secondaryColor || '#00FFFF';
    const backgroundColor = theme.backgroundColor || '#0A0A0A';
    const textColor = theme.textColor || '#FFFFFF';
    const visualConfig = theme.visualConfig || {};

    const [profile, setProfile] = useState({
        userName: '',
        playerClass: '',
        fandomName: '',
        avatarUrl: null
    });
    const [originalProfile, setOriginalProfile] = useState({});
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showFandomSearch, setShowFandomSearch] = useState(false);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();
            if (user) {
                const { data, error } = await supabase
                    .from('User')
                    .select('*')
                    .eq('userId', user.id)
                    .single();

                if (error) throw error;
                if (data) {
                    const loadedProfile = {
                        userName: data.userName || '',
                        playerClass: data.playerClass || '',
                        fandomName: data.fandomName || '',
                        avatarUrl: data.avatarUrl || null
                    };
                    setProfile(loadedProfile);
                    setOriginalProfile(loadedProfile);
                }
            }
        } catch (error) {
            Alert.alert("Error", "Failed to load profile details.");
        } finally {
            setLoading(false);
        }
    };

    const handlePickImage = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'image/*',
                copyToCacheDirectory: true
            });

            if (result.canceled) return;

            const asset = result.assets[0];
            setUploading(true);

            const user = await getCurrentUser();
            const uploadResult = await uploadAvatar(user.id, asset.uri);

            if (uploadResult.success) {
                // Update local profile state
                setProfile(prev => ({ ...prev, avatarUrl: uploadResult.publicUrl }));
                // Save to database profile
                await updateFullProfile(user.id, { avatarUrl: uploadResult.publicUrl });
                Alert.alert("Success", "Avatar updated!");
            } else {
                Alert.alert("Upload Failed", uploadResult.error);
            }
        } catch (error) {
            Alert.alert("Error", "Something went wrong picking the image.");
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();

            // Check username uniqueness (exclude current user so they can keep their own name)
            if (profile.userName?.trim()) {
                const { available } = await checkUsernameAvailable(profile.userName.trim(), user.id);
                if (!available) {
                    Alert.alert(
                        'Name Taken ⚔️',
                        `"${profile.userName.trim()}" is already used by another player. Please choose a different name.`
                    );
                    setLoading(false);
                    return;
                }
            }

            if (!profile.fandomName || profile.fandomName.trim() === '') {
                Alert.alert("Missing Fandom", "You must select an Active Fandom for your Player Class!");
                setLoading(false);
                return;
            }

            // 1. Basic Update
            await updateFullProfile(user.id, {
                userName: profile.userName,
                playerClass: profile.playerClass,
                fandomName: profile.fandomName
            });

            // 2. Global Theme Sync (Broadcast to rest of app)
            updateTheme({
                fandomName: profile.fandomName
            });

            // Check if identity changed
            const identityChanged = 
                profile.fandomName !== originalProfile.fandomName || 
                profile.playerClass !== originalProfile.playerClass;
            
            // Sync original to prevent double firing
            setOriginalProfile(profile);

            if (identityChanged) {
                // If they changed who they are, we MUST forge new DNA!
                await handleRegenerateDNA(true); 
            } else {
                Alert.alert("Success", "Profile information updated!");
            }
        } catch (error) {
            Alert.alert("Error", "Failed to save changes.");
        } finally {
            setLoading(false);
        }
    };

    const handleFandomSelect = async (id, title, imageUrl) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setShowFandomSearch(false);
        
        const updatedProfile = { ...profile, fandomName: title };
        setProfile(updatedProfile);

        // Immediately trigger a DNA generation for the newly selected fandom
        await handleRegenerateDNA(true, title, false, imageUrl);
        
        // Sync originalProfile so "SAVE IDENTITY" doesn't detect a stale change
        setOriginalProfile(updatedProfile);
    };

    //what this does is to generate a new aesthetic for the app using ai based on the theme of the app
    const handleRegenerateDNA = async (isAutomatic = false, overrideFandomName = null, forceNewColors = false, imageUrl = null) => {
        const targetFandom = overrideFandomName || profile.fandomName;
        
        if (!targetFandom) {
            Alert.alert("Wait!", "Enter a series name first so we can forge its DNA.");
            return;
        }

        try {
            setLoading(true);
            
            if (isAutomatic) {
                // We are switching identities. Use cache if possible.
                Alert.alert("Identity Shift Detected", "Syncing with the global Fandom network...");
            } else {
                // They explicitly clicked re-roll
                Alert.alert("Re-rolling DNA...", "Asking the AI to redefine your app's aesthetic.");
            }

            // Check cache first
            const cachedDNA = await getFandomCache(targetFandom, profile.playerClass);
            
            // Extract image URL from cache if we didn't get one passed in
            const finalImageUrl = imageUrl || (cachedDNA?.visual_config?.backgroundImageUrl) || null;

            // Check if cache is old (missing new features like ranks or animationType)
            const isCacheMissingRanks = cachedDNA && (!cachedDNA.fandom_ranks || cachedDNA.fandom_ranks.length === 0);
            const isCacheMissingAnimation = cachedDNA && (!cachedDNA.visual_config || !cachedDNA.visual_config.animationType);
            // Also force regeneration if we have an image URL now, but the cache doesn't have it
            const isCacheMissingImage = cachedDNA && finalImageUrl && (!cachedDNA.visual_config || !cachedDNA.visual_config.backgroundImageUrl);
            
            const needsRegeneration = !cachedDNA || forceNewColors || isCacheMissingRanks || isCacheMissingAnimation || isCacheMissingImage;
            
            let finalRanks = null;
            if (cachedDNA && cachedDNA.fandom_ranks && !isCacheMissingRanks) {
                // Keep the eternal ranks!
                finalRanks = typeof cachedDNA.fandom_ranks === 'string' 
                        ? JSON.parse(cachedDNA.fandom_ranks) 
                        : cachedDNA.fandom_ranks;
            } else {
                // First time anyone has ever chosen this fandom + class (or cache is old), so generate them!
                finalRanks = await generateFandomRanks(targetFandom, profile.playerClass);
            }

            let aesthetic = null;
            if (!needsRegeneration) {
                // Use cached colors since we are just switching to this fandom
                aesthetic = {
                    primaryColor: cachedDNA.primary_color,
                    secondaryColor: cachedDNA.secondary_color,
                    backgroundColor: cachedDNA.background_color,
                    ...cachedDNA.visual_config
                };
            } else {
                // Generate a new visual aesthetic
                aesthetic = await generateSeriesAesthetic(targetFandom);
                
                // If AI failed but we have cached colors, fall back gracefully
                if (!aesthetic && cachedDNA) {
                    aesthetic = {
                        primaryColor: cachedDNA.primary_color,
                        secondaryColor: cachedDNA.secondary_color,
                        backgroundColor: cachedDNA.background_color,
                        ...cachedDNA.visual_config
                    };
                    Alert.alert("AI Busy", "Couldn't generate new colors right now. Using existing fandom colors instead.");
                }
            }

            if (aesthetic) {
                // Attach the background image URL if we have one
                if (finalImageUrl) {
                    aesthetic.backgroundImageUrl = finalImageUrl;
                }

                const user = await getCurrentUser();

                const updates = {
                    fandomName: targetFandom,
                    visualConfig: aesthetic,
                    primaryColor: aesthetic.primaryColor,
                    secondaryColor: aesthetic.secondaryColor,
                    backgroundColor: aesthetic.backgroundColor
                };

                // Add ranks to the update payload
                if (finalRanks && finalRanks.length > 0) {
                    updates.fandom_ranks = JSON.stringify(finalRanks);
                }

                // Save the new DNA + fandom name to database
                await updateFullProfile(user.id, updates);

                // Update the global theme immediately
                updateTheme({
                    ...aesthetic,
                    fandomName: targetFandom
                });

                // Overwrite the global cache so future users get this improved DNA!
                await saveFandomCache(
                    targetFandom,
                    profile.playerClass,
                    aesthetic.primaryColor,
                    aesthetic.secondaryColor,
                    aesthetic.backgroundColor,
                    aesthetic,
                    finalRanks && finalRanks.length > 0 ? JSON.stringify(finalRanks) : null
                );

                Alert.alert("Evolution Complete!", "Your app has been re-forged with new Visual DNA.");
            } else {
                throw new Error("AI failed to generate a valid visual aesthetic.");
            }
        } catch (error) {
            Alert.alert("Forge Failed", `AI was unable to generate DNA at this time. Details: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await logoutUser();
            navigation.replace('Auth');
        } catch (error) {
            Alert.alert("Error", "Failed to logout.");
        }
    };

    if (loading && !profile.userName) {
        return (
            <View style={[styles.center, { backgroundColor }]}>
                <ActivityIndicator size="large" color={primaryColor} />
            </View>
        );
    }

    return (
        <SafeAreaView style={[styles.container, { backgroundColor }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()}>
                        <Ionicons name="arrow-back" size={28} color={secondaryColor} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: textColor }]}>Profile Command</Text>
                    <View style={{ width: 28 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scrollContainer}>

                    {/* Avatar Section */}
                    <View style={styles.avatarContainer}>
                        <TouchableOpacity
                            onPress={handlePickImage}
                            style={[
                                styles.avatarWrapper,
                                {
                                    borderColor: primaryColor,
                                    shadowColor: primaryColor,
                                    shadowRadius: visualConfig?.glowIntensity || 10,
                                    shadowOpacity: visualConfig?.shadowOpacity || 0.5,
                                    elevation: 10,
                                    borderRadius: 75
                                }
                            ]}
                        >
                            {profile.avatarUrl ? (
                                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
                            ) : (
                                <Ionicons name="person" size={60} color={primaryColor} />
                            )}

                            {uploading && (
                                <View style={styles.uploadOverlay}>
                                    <ActivityIndicator color="#FFF" />
                                </View>
                            )}
                        </TouchableOpacity>
                        <Text style={[styles.changeAvatarText, { color: secondaryColor }]}>TAP TO CHANGE AVATAR</Text>
                    </View>

                    {/* Form Section */}
                    <View style={styles.formSection}>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: secondaryColor }]}>GAMER TAG</Text>
                            <TextInput
                                style={[styles.input, { borderColor: 'rgba(255,255,255,0.1)', color: textColor }]}
                                value={profile.userName}
                                onChangeText={(text) => setProfile({ ...profile, userName: text })}
                                placeholder="Enter Tag"
                                placeholderTextColor="gray"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: secondaryColor }]}>PLAYER CLASS</Text>
                            <View style={styles.classPicker}>
                                {['Otaku', 'Gamer', 'Cinephile'].map((c) => (
                                    <TouchableOpacity
                                        key={c}
                                        onPress={() => {
                                            if (profile.playerClass !== c) {
                                                // Clear the fandom if the class changes, forcing them to pick a matching one
                                                setProfile({ ...profile, playerClass: c, fandomName: '' });
                                                setShowFandomSearch(true); // Auto-open search to help them out
                                            }
                                        }}
                                        style={[
                                            styles.classChip,
                                            {
                                                backgroundColor: profile.playerClass === c ? primaryColor : 'rgba(255,255,255,0.05)',
                                                borderColor: profile.playerClass === c ? primaryColor : 'rgba(255,255,255,0.2)'
                                            }
                                        ]}
                                    >
                                        <Text style={[styles.chipText, { color: profile.playerClass === c ? '#000' : 'gray' }]}>{c}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <View style={styles.inputGroup}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                <Text style={[styles.label, { color: secondaryColor, marginBottom: 0 }]}>ACTIVE FANDOM</Text>
                                {profile.fandomName ? (
                                    <TouchableOpacity onPress={() => handleRegenerateDNA(false, null, true)} style={{ padding: 5 }}>
                                        <Ionicons name="color-palette" size={20} color={primaryColor} />
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                            
                            {/* Read-only badge of current fandom */}
                            <View style={[styles.input, { borderColor: primaryColor, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center' }]}>
                                <Text style={{ color: textColor, fontSize: 16, fontWeight: 'bold' }}>
                                    {profile.fandomName || 'None Selected'}
                                </Text>
                            </View>

                            <TouchableOpacity
                                onPress={() => {
                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                    setShowFandomSearch(!showFandomSearch);
                                }}
                                style={[styles.forgeButton, { borderColor: primaryColor, marginTop: 10 }]}
                            >
                                <Ionicons name="search" size={18} color={primaryColor} />
                                <Text style={[styles.forgeButtonText, { color: primaryColor }]}>
                                    {showFandomSearch ? "CANCEL SEARCH" : "SEARCH NEW FANDOM"}
                                </Text>
                            </TouchableOpacity>

                            {showFandomSearch && (
                                <View style={{ marginTop: 20, zIndex: 50 }}>
                                    <FandomSearch 
                                        playerClass={profile.playerClass} 
                                        onSelect={handleFandomSelect} 
                                    />
                                </View>
                            )}
                        </View>

                        <TouchableOpacity
                            onPress={handleSave}
                            style={[
                                styles.saveButton,
                                {
                                    backgroundColor: primaryColor,
                                    borderRadius: visualConfig?.borderRadius || 15
                                }
                            ]}
                        >
                            <Text style={styles.saveButtonText}>SAVE IDENTITY</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleLogout}
                            style={styles.logoutButton}
                        >
                            <Ionicons name="log-out-outline" size={20} color="#FF4444" />
                            <Text style={styles.logoutText}>LOGOUT</Text>
                        </TouchableOpacity>

                    </View>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Full Screen Loading Overlay */}
            {loading && profile.userName ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center' }]}>
                    <ActivityIndicator size="large" color={primaryColor} />
                    <Text style={{ color: primaryColor, marginTop: 15, fontWeight: 'bold', fontSize: 16 }}>Syncing Identity...</Text>
                </View>
            ) : null}

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
    scrollContainer: { paddingHorizontal: 25, paddingBottom: 50 },
    avatarContainer: { alignItems: 'center', marginVertical: 30 },
    avatarWrapper: {
        width: 120,
        height: 120,
        borderWidth: 3,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.05)'
    },
    avatar: { width: '100%', height: '100%' },
    uploadOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    changeAvatarText: { marginTop: 15, fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
    formSection: { marginTop: 10 },
    inputGroup: { marginBottom: 25 },
    label: { fontSize: 12, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1.5 },
    input: {
        borderWidth: 1,
        borderRadius: 10,
        padding: 15,
        fontSize: 16,
        backgroundColor: 'rgba(255,255,255,0.05)'
    },
    classPicker: { flexDirection: 'row', justifyContent: 'space-between' },
    classChip: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 20,
        borderWidth: 1,
        flex: 0.3,
        alignItems: 'center'
    },
    chipText: { fontSize: 13, fontWeight: 'bold' },
    forgeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        alignSelf: 'flex-start',
        borderWidth: 1,
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20
    },
    forgeButtonText: { marginLeft: 8, fontSize: 12, fontWeight: 'bold' },
    saveButton: {
        paddingVertical: 18,
        alignItems: 'center',
        marginTop: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8
    },
    saveButtonText: { color: '#000', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 40,
        padding: 15
    },
    logoutText: { color: '#FF4444', marginLeft: 10, fontSize: 16, fontWeight: 'bold' }
});
