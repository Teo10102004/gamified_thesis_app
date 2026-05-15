// src/services/aiService.js

// IMPORTANT: Ensure this key was created inside your new PAID Google Cloud Project!
// This key acts as your "password" to use Google's powerful AI models.
const GEMINI_API_KEY = 'AIzaSyB1j-V-07Lpan1PLDmsAyoS3ne8ntxrP7k'; 

// We define our models in an object so it's easy to switch them out in one place later.
const MODELS = {
    PRIMARY: "gemini-2.5-flash",      // The "smartest" and most capable model for complex reasoning.
    FALLBACK: "gemini-2.5-flash-lite"  // The faster, lighter version used as a "backup" if the primary is busy.
};

// This helper function builds the full URL needed to talk to the Google API.
// It uses a "template literal" (the backticks ``) to inject the model name and your API key into the string.
const getApiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

// This function takes the raw data from Google and tries to turn it into a clean list of questions.
const parseAIResponse = (data) => {
    try {
        // If Google sent back an error object, we need to look at it.
        if (data.error) {
            // We check if the error is specifically about being busy (503 = Service Unavailable, 429 = Too Many Requests).
            // We also check if the error message itself mentions "high demand".
            const isOverloaded = data.error.code === 503 || data.error.code === 429 || data.error.message.includes("high demand");
            return { error: data.error.message, isOverloaded }; // We return this info so our other function knows if it should try the backup model.
        }
        
        // If there are no "candidates" or "parts", it means the AI didn't give us an answer.
        if (!data.candidates || !data.candidates[0].content.parts[0].text) {
            return { error: "Empty AI response parts", isOverloaded: false };
        }

        // We pull the raw text string out of the AI's response.
        let text = data.candidates[0].content.parts[0].text;
        
        // Sometimes the AI wraps its answer in "markdown" code blocks (like ```json ... ```).
        // We use .replace() to scrub those out so we are left with ONLY the raw JSON list.
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // JSON.parse() turns that text string into a real JavaScript Array that our app can loop through.
        return { data: JSON.parse(cleanJson), isOverloaded: false };
    } catch (e) {
        // If anything goes wrong during parsing (like the AI sent broken JSON), we catch the error here.
        console.error("Parsing Error:", e.message);
        return { error: e.message, isOverloaded: false };
    }
};

// This is the "Brain" of our service. It handles the actual communication and the "Plan B" backup logic.
const callGemini = async (payload, model = MODELS.PRIMARY) => {
    try {
        // We use 'fetch' to send our prompt to Google. 'await' makes the code wait until the reply comes back.
        const response = await fetch(getApiUrl(model), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }, // We tell Google we are sending them a JSON object.
            body: JSON.stringify(payload) // We turn our JavaScript object into a text string for the transmission.
        });

        // We turn the response from Google back into a JavaScript object.
        const data = await response.json();
        
        // We use our helper function above to check if the data is valid or if the model is busy.
        const result = parseAIResponse(data);

        // --- THE "PLAN B" LOGIC ---
        // If the primary model told us it's busy (overloaded), AND we are currently using the primary model...
        if (result.isOverloaded && model === MODELS.PRIMARY) {
            console.warn(`Model ${model} overloaded. Trying fallback: ${MODELS.FALLBACK}`);
            // We call this SAME function again (recursion), but this time we pass in the FALLBACK model!
            return await callGemini(payload, MODELS.FALLBACK);
        }

        // If everything is fine, we return the list of questions (or null if it failed).
        return result.data || null;
    } catch (error) {
        // This catches internet connection errors or other "hard" failures.
        console.error(`AI Error (${model}):`, error.message);
        
        // Even if the internet hiccuped, if we were on the primary model, let's try one last time with the Lite one.
        if (model === MODELS.PRIMARY) {
            return await callGemini(payload, MODELS.FALLBACK);
        }
        return null;
    }
};

// This is the function for generating a quiz just by typing a topic (like "Naruto History").
export const generateQuiz = async (topic, count, difficulty) => {
    // We create a "Prompt" which is a set of instructions for the AI.
    // We add STRICT RULES to ensure the content fits well on a mobile screen.
    const prompt = `Generate exactly ${count} multiple-choice questions about "${topic}" at ${difficulty} difficulty.
    
    STRICT RULES:
    1. Each 'question' must be under 25 words.
    2. Each 'option' must be under 15 words.
    
    Return ONLY a raw JSON array: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}]`;

    // We wrap that prompt in the format Google expects.
    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    // We send it to our "Brain" function above.
    return await callGemini(payload);
};

// This is the function used when you upload a PDF or TXT file.
export const generateQuizFromFile = async (fileBase64, mimeType, count, difficulty) => {
    // Same instructions as before, but based on the file content provided.
    const prompt = `Based on the attached file, generate exactly ${count} multiple-choice questions at ${difficulty} difficulty.
    
    STRICT RULES:
    1. Each 'question' must be under 25 words.
    2. Each 'option' must be under 15 words.
    
    Return ONLY a raw JSON array: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}]`;

    // This time, the payload includes BOTH the text prompt AND the file data (encoded as base64).
    const payload = {
        contents: [{ 
            parts: [
                { text: prompt },
                // inline_data is how we send files directly in the request.
                { inline_data: { mime_type: mimeType, data: fileBase64 } } 
            ] 
        }]
    };

    // Send it off!
    return await callGemini(payload);
};

// --- THE LEGENDARY THEME FORGE ---
// This function is the "Art Director" of your app. 
// It uses AI to analyze ANY series and generate a custom "Visual DNA" for it.
export const generateSeriesAesthetic = async (seriesName) => {
    const prompt = `Analyze the visual aesthetic of the series "${seriesName}". 
    Think about its color palette, lighting, and mood.
    
    Return ONLY a raw JSON object with these exact keys:
    {
        "primaryColor": "A hex code representatve of the series (e.g. #FF0000)",
        "secondaryColor": "A contrasting hex code",
        "backgroundColor": "A dark background hex code (usually #000 to #111)",
        "glowIntensity": 5 to 30 (integer),
        "shadowOpacity": 0.1 to 1.0 (float),
        "animationSpeed": 100 to 800 (ms),
        "borderRadius": 0 to 30 (px),
        "vibeDescription": "A 5-word summary of the look"
    }`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    // We use our Brain function to get the DNA
    const result = await callGemini(payload);
    return result; // This returns the full style packet!
};

// This function is for generating Flashcards! 
// Instead of 4-option questions, it asks the AI for "Front/Back" concept pairs.
export const generateFlashcardsFromFile = async (fileBase64, mimeType, count) => {
    // We give the AI a different set of instructions for flashcards.
    const prompt = `Based on the attached file, extract ${count} key concepts and their definitions.
    
    STRICT RULES:
    1. Each 'front' should be a concise term or question (under 10 words).
    2. Each 'back' should be a clear definition or answer (under 30 words).
    
    Return ONLY a raw JSON array: [{"front": "Term", "back": "Definition"}]`;

    const payload = {
        contents: [{ 
            parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: fileBase64 } } 
            ] 
        }]
    };

    // We use the same "Brain" function (callGemini) we built earlier!
    return await callGemini(payload);
};

// --- LEARNING SESSIONS: DOCUMENT TEXT EXTRACTION ---
// When a user uploads a document to their library, we call this once to extract
// the full readable text from it. We store this text in the DB so the reading
// session can display it without needing the original file again.
export const extractDocumentText = async (fileBase64, mimeType) => {
    const prompt = `Extract and return the full readable text content from this document.
    
    STRICT RULES:
    1. Return ONLY the raw text content — no summaries, no bullet points, no commentary.
    2. Preserve paragraph breaks using double newlines.
    3. Remove headers/footers/page numbers if present.
    4. Return the text as a plain string, NOT JSON.`;

    // For text extraction we bypass parseAIResponse (which expects JSON)
    // and read the raw text directly from the Gemini response.
    try {
        const payload = {
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: fileBase64 } }
                ]
            }]
        };

        const response = await fetch(getApiUrl(MODELS.PRIMARY), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.error) {
            // Try fallback model if primary is overloaded
            if (data.error.code === 503 || data.error.code === 429) {
                const fallbackResponse = await fetch(getApiUrl(MODELS.FALLBACK), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const fallbackData = await fallbackResponse.json();
                return fallbackData?.candidates?.[0]?.content?.parts?.[0]?.text || null;
            }
            return null;
        }

        return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error) {
        console.error('Text extraction error:', error.message);
        return null;
    }
};

// --- LEARNING SESSIONS: PRE-GENERATE COMPREHENSION PINGS ---
// Called once at upload time. Generates 5 short "are you paying attention?" questions
// from the document text. These are used during the reading session as anti-cheat checks.
// Pre-generating saves API quota — no AI calls happen during active reading.
export const generateReadingPings = async (documentText) => {
    // We only send the first 3000 characters to stay within token limits
    const snippet = documentText.substring(0, 3000);

    const prompt = `Based on the following document excerpt, generate exactly 5 short comprehension check questions.
    
    These questions are used to verify a reader is paying attention. They must be:
    1. Simple and answerable in one sentence.
    2. Based only on facts stated directly in the text.
    3. Each with exactly 3 options (A, B, C), one correct.
    4. Very short — question under 20 words, each option under 10 words.
    
    Return ONLY a raw JSON array:
    [{"question": "...", "options": ["A", "B", "C"], "correctIndex": 0}]
    
    Document excerpt:
    "${snippet}"`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    return await callGemini(payload);
};

// --- FANDOM RANK HIERARCHY GENERATOR ---
// Called once during character setup after the user picks their fandom.
// Generates 10 fandom-specific rank titles that replace the generic class label
// as the player levels up. For example, a Naruto Otaku would see:
//   Lv1: Academy Student → Lv2: Genin → ... → Lv10: Hokage
// The ranks array is saved to the User table and read by Home.js.
export const generateFandomRanks = async (fandomName, playerClass) => {
    const prompt = `The player has chosen the fandom "${fandomName}" and the player class "${playerClass}".
    
    Generate exactly 10 rank titles that represent a progression from beginner to legendary within the world of "${fandomName}".
    
    RULES:
    1. The titles must be authentic names, roles, or ranks from within the "${fandomName}" universe.
    2. They must go from weakest/lowest to most powerful/prestigious (index 0 = Level 1, index 9 = Level 10+).
    3. Titles must be short (1–4 words max).
    4. If "${fandomName}" does not have an obvious hierarchy, invent thematic titles that feel authentic to its world.
    5. Return ONLY a raw JSON array of exactly 10 strings, nothing else.
    
    Example output for "Naruto": ["Academy Student","Genin","Chunin","Special Jonin","Jonin","ANBU","ANBU Captain","Sannin","Kage","Sage of Six Paths"]`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    return await callGemini(payload);
};
