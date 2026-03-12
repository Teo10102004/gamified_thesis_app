

export const searchFandoms = async (playerCLass, query) => {
    if (!query || query.length < 3) {
        return [];
    }

    try{
        let results = []; // Initialize an empty array to hold the search results

        if(playerCLass === 'Otaku') {
            //jikan api call to search for anime titles matching the query
            const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
            const json = await response.json(); // Parse the JSON response from the Jikan API
            
            if(json.data){
                results = json.data.map(item => ({ // Map the relevant data from the Jikan API response to our desired format
                    id: item.mal_id, // Use the MyAnimeList ID as the unique identifier for the fandom
                    title: item.title, // The title of the anime
                    imageUrl: item.images?.jpg?.image_url || item.images?.webp?.image_url, // The URL of the anime's image
                }));
            }
        }

        else if(playerCLass === 'Gamer') {
            //TODO: RAWG api call to search for video game titles matching the query
            results = [{id: 1, title: "Games coming soon...", imageUrl: null}]; // Placeholder for RAWG API results
        }else if(playerCLass === 'Cinephile') {
            //TODO: TMDB api call to search for movie titles matching the query
            results = [{id: 1, title: "Movies coming soon...", imageUrl: null}]; // Placeholder for movie API results
        }

        return results; // Return the array of search results
    } catch (error) {
        console.error('Error searching fandoms:', error);
        return []; // Return an empty array if there was an error during the search process
    }
};