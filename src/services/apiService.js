
// --- THE ULTIMATE FALLBACK: KITSU API ---
// We moved this to a helper so we can call it whenever Jikan fails (timeout OR error).
const searchKitsuFallback = async (query) => {
    console.log("[API] Attempting Kitsu Fallback...");
    try {
        const kitsuRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=5`);
        if (!kitsuRes.ok) return [];
        
        const kitsuJson = await kitsuRes.json();
        if (kitsuJson.data) {
            return kitsuJson.data.map(item => ({
                id: `kitsu-${item.id}`,
                title: item.attributes.canonicalTitle,
                imageUrl: item.attributes.posterImage?.small || item.attributes.posterImage?.original
            }));
        }
    } catch (e) {
        console.error("[API] Kitsu Fallback failed too:", e.message);
    }
    return [];
};

export const searchFandoms = async (playerClass, query, attempt = 1) => {
    if (!query || query.length < 3) return [];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s is plenty

    try {
        if (playerClass === 'Otaku') {
            console.log(`[API] Jikan Attempt ${attempt} for: ${query}...`);
            
            const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`, {
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error(`[API] Jikan Error: ${response.status}`);
                
                // If Jikan is overwhelmed (429/504), we switch to Kitsu immediately!
                if (playerClass === 'Otaku') return await searchKitsuFallback(query);
                return [];
            }

            const json = await response.json();
            if (json.data && json.data.length > 0) {
                return json.data.map(item => ({
                    id: item.mal_id,
                    title: item.title,
                    imageUrl: item.images?.jpg?.image_url || item.images?.webp?.image_url,
                }));
            } else {
                // If Jikan returns NO results, maybe Kitsu has them!
                return await searchKitsuFallback(query);
            }
        } 
        
        // ... Placeholder results for other classes ...
        if (playerClass === 'Gamer') return [{ id: 'games-soon', title: "Games library loading...", imageUrl: null }];
        if (playerClass === 'Cinephile') return [{ id: 'movies-soon', title: "Movies library loading...", imageUrl: null }];

        return [];

    } catch (error) {
        clearTimeout(timeoutId);
        
        if (attempt < 2 && error.name !== 'AbortError') {
            await new Promise(r => setTimeout(r, 1000));
            return searchFandoms(playerClass, query, attempt + 1);
        }

        // If all Jikan attempts fail (including timeouts), try Kitsu as a last resort!
        if (playerClass === 'Otaku') return await searchKitsuFallback(query);
        
        return [];
    }
};