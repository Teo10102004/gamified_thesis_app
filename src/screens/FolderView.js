import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '../context/ThemeContext';
import { getCurrentUser } from '../services/authService';
import {
    getFolderDocuments,
    getUserFolders,
    deleteDocument,
    createFolder,
    saveLibraryDocument,
} from '../services/userService';
import { extractDocumentText, generateReadingPings } from '../services/aiService';

export default function FolderView({ navigation, route }) {
    const { folderId, folderName } = route.params;
    const { theme } = useTheme();

    const [documents, setDocuments] = useState([]);
    const [subfolders, setSubfolders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    const loadContents = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();
            if (!user) return;
            setCurrentUser(user);

            const [docsResult, subfoldersResult] = await Promise.all([
                getFolderDocuments(user.id, folderId),
                getUserFolders(user.id, folderId),
            ]);

            if (docsResult.success) setDocuments(docsResult.documents);
            if (subfoldersResult.success) setSubfolders(subfoldersResult.folders);
        } catch (error) {
            Alert.alert('Error', 'Failed to load folder contents.');
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadContents(); }, []));

    const handleUploadDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'text/plain'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.length) return;

            const file = result.assets[0];
            setUploading(true);

            Alert.alert(
                '📖 Indexing Document',
                'Gemini AI is reading your document. This takes ~15–30 seconds…',
                [], { cancelable: false }
            );

            const fileBase64 = await FileSystem.readAsStringAsync(file.uri, {
                encoding: FileSystem.EncodingType.Base64,
            });

            const extractedText = await extractDocumentText(fileBase64, file.mimeType || 'application/pdf');
            if (!extractedText) {
                Alert.alert('Error', 'Could not extract text from this file. Try a different one.');
                setUploading(false);
                return;
            }

            const pings = await generateReadingPings(extractedText);
            const docTitle = file.name.replace(/\.[^/.]+$/, '');

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
                Alert.alert('✅ Done!', `"${docTitle}" added to ${folderName}.`);
                loadContents();
            } else {
                Alert.alert('Error', 'Failed to save document.');
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
            `Delete "${docTitle}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete', style: 'destructive',
                    onPress: async () => {
                        await deleteDocument(docId);
                        loadContents();
                    }
                }
            ]
        );
    };

    const renderSubfolder = ({ item }) => (
        <TouchableOpacity
            style={[styles.card, { borderColor: theme.primaryColor }]}
            onPress={() => navigation.push('FolderView', {
                folderId: item.folderid,
                folderName: item.name,
            })}
        >
            <View style={[styles.iconCircle, { backgroundColor: theme.primaryColor + '33' }]}>
                <Ionicons name="folder" size={26} color={theme.primaryColor} />
            </View>
            <Text style={[styles.cardTitle, { color: theme.textColor }]}>{item.name}</Text>
            <Ionicons name="chevron-forward" size={20} color="gray" />
        </TouchableOpacity>
    );

    const renderDocument = ({ item }) => (
        <TouchableOpacity
            style={[styles.card, { borderColor: theme.secondaryColor }]}
            onPress={() => navigation.navigate('ReadingSession', {
                documentId: item.documentid,
                documentTitle: item.title,
            })}
            onLongPress={() => handleDeleteDocument(item.documentid, item.title)}
        >
            <View style={[styles.iconCircle, { backgroundColor: theme.secondaryColor + '33' }]}>
                <Ionicons name="document-text" size={26} color={theme.secondaryColor} />
            </View>
            <View style={styles.cardText}>
                <Text style={[styles.cardTitle, { color: theme.textColor }]} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.cardSub}>
                    {item.file_size ? `${Math.round(item.file_size / 1024)} KB` : 'Text Document'} · Long-press to delete
                </Text>
            </View>
        </TouchableOpacity>
    );

    const ListHeader = () => (
        <>
            {subfolders.length > 0 && (
                <>
                    <Text style={[styles.sectionLabel, { color: theme.primaryColor }]}>Subfolders</Text>
                    {subfolders.map(sf => (
                        <View key={`sf-${sf.folderid}`}>{renderSubfolder({ item: sf })}</View>
                    ))}
                    <Text style={[styles.sectionLabel, { color: theme.primaryColor, marginTop: 16 }]}>Documents</Text>
                </>
            )}
        </>
    );

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={28} color={theme.secondaryColor} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: theme.textColor }]} numberOfLines={1}>{folderName}</Text>
                <TouchableOpacity
                    onPress={handleUploadDocument}
                    disabled={uploading}
                    style={{ opacity: uploading ? 0.5 : 1 }}
                >
                    {uploading
                        ? <ActivityIndicator size="small" color={theme.primaryColor} />
                        : <Ionicons name="add-circle" size={32} color={theme.primaryColor} />
                    }
                </TouchableOpacity>
            </View>

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
                        subfolders.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="document-outline" size={70} color="rgba(255,255,255,0.12)" />
                                <Text style={styles.emptyText}>
                                    This folder is empty.{'\n'}Tap + to upload a document.
                                </Text>
                            </View>
                        ) : null
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
    headerTitle: { fontSize: 22, fontWeight: 'bold', flex: 1, textAlign: 'center', marginHorizontal: 10 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    list: { padding: 20, paddingTop: 8 },
    sectionLabel: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10 },
    card: {
        flexDirection: 'row', alignItems: 'center', padding: 14,
        borderRadius: 14, borderWidth: 1, marginBottom: 12,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    iconCircle: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    cardText: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
    cardSub: { fontSize: 12, color: 'gray' },
    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyText: { color: 'gray', fontSize: 15, textAlign: 'center', marginTop: 20, lineHeight: 24 },
});
