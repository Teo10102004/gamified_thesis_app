
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

// --- RAWG API (Games) ---
const RAWG_API_KEY = process.env.EXPO_PUBLIC_RAWG_API_KEY;

const searchRAWG = async (query) => {
    console.log(`[API] RAWG search for: ${query}`);
    try {
        const response = await fetch(
            `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=5`
        );
        if (!response.ok) {
            console.error(`[API] RAWG Error: ${response.status}`);
            return [];
        }
        const json = await response.json();
        return (json.results || []).map(item => ({
            id: `rawg-${item.id}`,
            title: item.name,
            imageUrl: item.background_image || null,
        }));
    } catch (e) {
        console.error('[API] RAWG search failed:', e.message);
        return [];
    }
};

// --- TMDB API (Movies & TV) ---
const TMDB_API_KEY = process.env.EXPO_PUBLIC_TMDB_API_KEY;

const searchTMDB = async (query) => {
    console.log(`[API] TMDB search for: ${query}`);
    try {
        const response = await fetch(
            `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=1&include_adult=false`
        );
        if (!response.ok) {
            console.error(`[API] TMDB Error: ${response.status}`);
            return [];
        }
        const json = await response.json();
        return (json.results || [])
            .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
            .slice(0, 5)
            .map(item => ({
                id: `tmdb-${item.id}`,
                title: item.title || item.name,
                imageUrl: item.poster_path
                    ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
                    : null,
            }));
    } catch (e) {
        console.error('[API] TMDB search failed:', e.message);
        return [];
    }
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
                return await searchKitsuFallback(query);
            }
        }

        if (playerClass === 'Gamer') {
            clearTimeout(timeoutId);
            return await searchRAWG(query);
        }

        if (playerClass === 'Cinephile') {
            clearTimeout(timeoutId);
            return await searchTMDB(query);
        }

        clearTimeout(timeoutId);
        return [];

    } catch (error) {
        clearTimeout(timeoutId);
        
        if (attempt < 2 && error.name !== 'AbortError') {
            await new Promise(r => setTimeout(r, 1000));
            return searchFandoms(playerClass, query, attempt + 1);
        }

        if (playerClass === 'Otaku') return await searchKitsuFallback(query);
        
        return [];
    }
};