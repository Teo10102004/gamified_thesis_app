import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { searchFandoms } from '../services/apiService';

const NEON_PINK = '#FF00FF'; 
const NEON_BLUE = '#00FFFF'; 
const TEXR_COLOR = '#FFFFFF';

export default function FandomSearch({ playerClass, onSelect }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // --- THE FIX: DEBOUNCED SEARCH ---
    useEffect(() => {
        // 1. If the word is too short, clear results and stop.
        if (query.length < 3) {
            setResults([]);
            setLoading(false);
            return;
        }

        // 2. Start the loading spinner
        setLoading(true);

        // 3. Set a timer to wait 500ms before calling the API
        const delaySearch = setTimeout(async () => {
            const data = await searchFandoms(playerClass, query);
            setResults(data);
            setLoading(false);
        }, 500);

        // 4. CLEANUP: If the user types another letter before 500ms is up, cancel the timer!
        return () => clearTimeout(delaySearch);
        
    }, [query, playerClass]); // This runs every time 'query' changes

    return (
        // I changed the fixed height to minHeight so it can grow if needed!
        <View style={styles.container}>
            <TextInput
                style={styles.searchInput}
                placeholder={`Search for an anime title...`}
                placeholderTextColor="rgba(255, 255, 255, 0.5)"
                value={query}
                onChangeText={(text) => setQuery(text)} // Now it just updates the text, the useEffect handles the API!
            />

            {loading && <ActivityIndicator color={NEON_PINK} style={{ margin: 10 }} />}

            {/* Render the results using .map() */}
            <View>
                {results.map((item) => (
                    <TouchableOpacity //a rouchable oapcity is like a button but with more styling options
                        key={item.id.toString()} 
                        style={styles.resultItem} 
                        onPress={() => onSelect(item.id, item.title, item.imageUrl)} // When a result is pressed, call the onSelect function passed as a prop with the item's details
                    >
                        {item.imageUrl ? (
                            <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} resizeMode='cover' />
                        ) : (
                            <View style={styles.placeholderImage} />
                        )}
                        <Text style={styles.resultText} numberOfLines={2}>{item.title}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { width: '100%', minHeight: 250, marginTop: 10 },
    searchInput: { 
        backgroundColor: 'rgba(0, 255, 255, 0.1)', 
        color: TEXR_COLOR, 
        padding: 15, 
        borderRadius: 10, 
        borderWidth: 1,
        borderColor: NEON_BLUE,
        marginBottom: 15 
    },
    resultItem: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        marginBottom: 10, 
        backgroundColor: 'rgba(255, 0, 255, 0.1)', 
        borderRadius: 8, 
        padding: 10,
        borderWidth: 1,
        borderColor: 'rgba(255, 0, 255, 0.3)'
    },
    thumbnail: { width: 50, height: 50, borderRadius: 5, marginRight: 15 },
    placeholderImage: { width: 50, height: 50, borderRadius: 5, marginRight: 15, backgroundColor: '#333' },
    resultText: { color: TEXR_COLOR, fontSize: 16, fontWeight: 'bold', flex: 1 }
});