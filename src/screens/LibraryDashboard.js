import React, { useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, Alert, TextInput, Modal, Animated,
    AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../context/ThemeContext';
import FandomBackground from '../components/FandomBackground';
import { getCurrentUser } from '../services/authService';
import {
    getUserFolders,
    getFolderDocuments,
    createFolder,
    deleteFolder,
    deleteDocument,
    saveLibraryDocument,
} from '../services/userService';
import { extractDocumentText, generateReadingPings } from '../services/aiService';

export default function LibraryDashboard({ navigation }) {
    const { theme } = useTheme();
    const [folders, setFolders] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    // New-folder modal state
    const [showFolderModal, setShowFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const loadLibrary = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();
            if (!user) return;
            setCurrentUser(user);

            const [foldersResult, docsResult] = await Promise.all([
                getUserFolders(user.id, null),       // root folders
                getFolderDocuments(user.id, null),   // root documents
            ]);

            if (foldersResult.success) setFolders(foldersResult.folders);
            if (docsResult.success) setDocuments(docsResult.documents);
        } catch (error) {
            Alert.alert('Error', 'Failed to load your library.');
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadLibrary(); }, []));

    // ── Folder actions ────────────────────────────────────────────────────────

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const result = await createFolder(currentUser.id, newFolderName.trim(), null);
        if (result.success) {
            setNewFolderName('');
            setShowFolderModal(false);
            loadLibrary();
        } else {
            Alert.alert('Error', 'Could not create folder. Did you run the SQL in Supabase?');
        }
    };

    const handleDeleteFolder = (folderId, folderName) => {
        Alert.alert(
            'Delete Folder',
            `Delete "${folderName}" and all its documents? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                        await deleteFolder(folderId);
                        loadLibrary();
                    }
                }
            ]
        );
    };

    // ── Document upload ───────────────────────────────────────────────────────

    const handleUploadDocument = async (folderId = null) => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'text/plain'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.length) return;

            const file = result.assets[0];
            setUploading(true);

            Alert.alert(
                '📖 Processing Document',
                'Gemini AI is reading and indexing your document. This may take 15–30 seconds...',
                [], { cancelable: false }
            );

            // Step 1: read as base64
            const fileBase64 = await FileSystem.readAsStringAsync(file.uri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            // Step 2: extract plain text via AI
            const extractedText = await extractDocumentText(fileBase64, file.mimeType || 'application/pdf');

            if (!extractedText) {
                Alert.alert('Error', 'Could not extract text from the document. Try a different file.');
                setUploading(false);
                return;
            }

            // Step 3: pre-generate comprehension pings
            const pings = await generateReadingPings(extractedText);

            // Step 4: save to DB
            const docTitle = file.name.replace(/\.[^/.]+$/, ''); // strip extension
            const saveResult = await saveLibraryDocument(
                currentUser.id,
                docTitle,
                file.mimeType || 'application/pdf',
                file.size || 0,
                extractedText,
                pings || [],
                folderId,
            );

            if (saveResult.success) {
                Alert.alert('✅ Indexed!', `"${docTitle}" has been added to your library.`);
                loadLibrary();
            } else {
                Alert.alert('Error', 'Failed to save document. Check Supabase SQL setup.');
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteDocument = (docId, docTitle) => {
        Alert.alert(
            'Delete Document',
            `Delete "${docTitle}"? All reading history will also be lost.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                        await deleteDocument(docId);
                        loadLibrary();
                    }
                }
            ]
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const renderFolder = ({ item }) => (
        <TouchableOpacity
            style={[styles.card, { borderColor: theme.primaryColor, shadowColor: theme.primaryColor }]}
            onPress={() => navigation.navigate('FolderView', {
                folderId: item.folderid,
                folderName: item.name,
                userId: currentUser?.id,
            })}
            onLongPress={() => handleDeleteFolder(item.folderid, item.name)}
        >
            <View style={[styles.iconCircle, { backgroundColor: theme.primaryColor + '33' }]}>
                <Ionicons name="folder" size={28} color={theme.primaryColor} />
            </View>
            <View style={styles.cardText}>
                <Text style={[styles.cardTitle, { color: theme.textColor }]}>{item.name}</Text>
                <Text style={styles.cardSub}>Long-press to delete</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="gray" />
        </TouchableOpacity>
    );

    const renderDocument = ({ item }) => (
        <TouchableOpacity
            style={[styles.card, { borderColor: theme.secondaryColor, shadowColor: theme.secondaryColor }]}
            onPress={() => navigation.navigate('ReadingSession', {
                documentId: item.documentid,
                documentTitle: item.title,
            })}
            onLongPress={() => handleDeleteDocument(item.documentid, item.title)}
        >
            <View style={[styles.iconCircle, { backgroundColor: theme.secondaryColor + '33' }]}>
                <Ionicons name="document-text" size={28} color={theme.secondaryColor} />
            </View>
            <View style={styles.cardText}>
                <Text style={[styles.cardTitle, { color: theme.textColor }]} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardSub}>
                    {item.file_size ? `${Math.round(item.file_size / 1024)} KB` : 'Document'} · Long-press to delete
                </Text>
            </View>
            <Ionicons name="book-outline" size={20} color={theme.primaryColor} />
        </TouchableOpacity>
    );

    const ListHeader = () => (
        <>
            {/* Section: Folders */}
            {folders.length > 0 && (
                <Text style={[styles.sectionTitle, { color: theme.primaryColor }]}>
                    📁 Folders
                </Text>
            )}
            {folders.map(f => (
                <View key={`f-${f.folderid}`}>{renderFolder({ item: f })}</View>
            ))}

            {/* Section: Documents */}
            <Text style={[styles.sectionTitle, { color: theme.primaryColor, marginTop: 20 }]}>
                📄 Documents
            </Text>
        </>
    );

    return (
        <SafeAreaView style={styles.container}>
            <FandomBackground />
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={theme.secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.textColor }]}>Knowledge Vault</Text>
                <View style={{ width: 28 }} />
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: theme.primaryColor }]}
                    onPress={() => setShowFolderModal(true)}
                >
                    <Ionicons name="folder-open-outline" size={18} color={theme.primaryColor} />
                    <Text style={[styles.actionBtnText, { color: theme.primaryColor }]}>New Folder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: theme.secondaryColor, opacity: uploading ? 0.5 : 1 }]}
                    onPress={() => handleUploadDocument(null)}
                    disabled={uploading}
                >
                    {uploading ? (
                        <ActivityIndicator size="small" color={theme.secondaryColor} />
                    ) : (
                        <Ionicons name="cloud-upload-outline" size={18} color={theme.secondaryColor} />
                    )}
                    <Text style={[styles.actionBtnText, { color: theme.secondaryColor }]}>
                        {uploading ? 'Indexing…' : 'Upload Doc'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Content */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={theme.primaryColor} />
                </View>
            ) : (
                <FlatList
                    data={documents}
                    keyExtractor={(item) => `doc-${item.documentid}`}
                    renderItem={renderDocument}
                    ListHeaderComponent={<ListHeader />}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        folders.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="library-outline" size={80} color="rgba(255,255,255,0.15)" />
                                <Text style={styles.emptyText}>
                                    Your Knowledge Vault is empty.{'\n'}Upload a document or create a folder to begin.
                                </Text>
                            </View>
                        ) : null
                    }
                />
            )}

            {/* New Folder Modal */}
            <Modal visible={showFolderModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalBox, { backgroundColor: '#111', borderColor: theme.primaryColor }]}>
                        <Text style={[styles.modalTitle, { color: theme.primaryColor }]}>New Folder</Text>
                        <TextInput
                            style={[styles.modalInput, { color: theme.textColor, borderColor: theme.secondaryColor }]}
                            placeholder="Folder name…"
                            placeholderTextColor="gray"
                            value={newFolderName}
                            onChangeText={setNewFolderName}
                            autoFocus
                        />
                        <View style={styles.modalButtons}>
                            <TouchableOpacity onPress={() => setShowFolderModal(false)} style={styles.modalCancelBtn}>
                                <Text style={{ color: 'gray', fontSize: 16 }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleCreateFolder}
                                style={[styles.modalConfirmBtn, { backgroundColor: theme.primaryColor }]}
                            >
                                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>Create</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    headerTitle: { fontSize: 24, fontWeight: 'bold' },
    actionRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 10 },
    actionBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
        backgroundColor: 'rgba(255,255,255,0.04)'
    },
    actionBtnText: { fontWeight: '700', fontSize: 14 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 20, paddingTop: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },
    card: {
        flexDirection: 'row', alignItems: 'center', padding: 15,
        borderRadius: 14, borderWidth: 1, marginBottom: 12,
        backgroundColor: '#0A0A0A',
        shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
    },
    iconCircle: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    cardText: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
    cardSub: { fontSize: 12, color: 'gray' },
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyText: { color: 'gray', fontSize: 15, textAlign: 'center', marginTop: 20, lineHeight: 24, paddingHorizontal: 30 },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 30 },
    modalBox: { borderRadius: 20, borderWidth: 1.5, padding: 24 },
    modalTitle: { fontSize: 20, fontWeight: '900', marginBottom: 18 },
    modalInput: { borderWidth: 1.5, borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.05)' },
    modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
    modalCancelBtn: { paddingVertical: 12, paddingHorizontal: 20 },
    modalConfirmBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
});
