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
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../context/ThemeContext';
import { getCurrentUser, logoutUser } from '../services/authService';
import { updateFullProfile, uploadAvatar } from '../services/userService';
import { generateSeriesAesthetic } from '../services/aiService';
import { supabase } from '../services/supabase';

export default function ProfileSettings({ navigation }) {
    const { theme, updateTheme } = useTheme();
    const { primaryColor, secondaryColor, backgroundColor, textColor, visualConfig } = theme;

    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [profile, setProfile] = useState({
        userName: '',
        playerClass: '',
        fandomName: '',
        avatarUrl: null
    });

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
                    setProfile({
                        userName: data.userName || '',
                        playerClass: data.playerClass || '',
                        fandomName: data.fandomName || '',
                        avatarUrl: data.avatarUrl || null
                    });
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

            Alert.alert("Success", "Profile information updated!");
        } catch (error) {
            Alert.alert("Error", "Failed to save changes.");
        } finally {
            setLoading(false);
        }
    };

    //what this does is to generate a new aesthetic for the app using ai based on the theme of the app
    const handleRegenerateDNA = async () => {
        if (!profile.fandomName) {
            Alert.alert("Wait!", "Enter a series name first so we can forge its DNA.");
            return;
        }

        try {
            setLoading(true);
            Alert.alert("Forging DNA...", "Asking the AI to redefine your app's aesthetic.");

            const aesthetic = await generateSeriesAesthetic(profile.fandomName);
            if (aesthetic) {
                const user = await getCurrentUser();

                // Save the new DNA to database
                await updateFullProfile(user.id, {
                    visualConfig: aesthetic,
                    primaryColor: aesthetic.primaryColor,
                    secondaryColor: aesthetic.secondaryColor,
                    backgroundColor: aesthetic.backgroundColor
                });

                // Update the global theme immediately
                updateTheme({
                    ...aesthetic,
                    fandomName: profile.fandomName
                });

                Alert.alert("Evolution Complete!", "Your app has been re-forged with new Visual DNA.");
            }
        } catch (error) {
            Alert.alert("Forge Failed", "AI was unable to generate DNA at this time.");
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
                                        onPress={() => setProfile({ ...profile, playerClass: c })}
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
                            <Text style={[styles.label, { color: secondaryColor }]}>ACTIVE FANDOM (DNA SOURCE)</Text>
                            <TextInput
                                style={[styles.input, { borderColor: 'rgba(255,255,255,0.1)', color: textColor }]}
                                value={profile.fandomName}
                                onChangeText={(text) => setProfile({ ...profile, fandomName: text })}
                                placeholder="e.g. Naruto, Cyberpunk 2077"
                                placeholderTextColor="gray"
                            />
                            <TouchableOpacity
                                onPress={handleRegenerateDNA}
                                style={[styles.forgeButton, { borderColor: primaryColor }]}
                            >
                                <Ionicons name="flash" size={18} color={primaryColor} />
                                <Text style={[styles.forgeButtonText, { color: primaryColor }]}>RE-FORGE VISUAL DNA</Text>
                            </TouchableOpacity>
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
