// src/services/aiService.js

// IMPORTANT: Ensure this key was created inside your new PAID Google Cloud Project!
// This key acts as your "password" to use Google's powerful AI models.
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY; 

// We define our models in an array to create a fallback chain.
const MODELS = [
    "gemini-2.5-flash",       // Primary: The smartest and most capable model.
    "gemini-2.5-flash-lite"   // 1st Fallback: The faster, lighter version.
];

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

// Helper: wait for a number of milliseconds (used for retry delays)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: shuffle options for a list of questions so the correct answer isn't always the same index
const shuffleQuestionsOptions = (questions) => {
    if (!Array.isArray(questions)) return questions;
    return questions.map(q => {
        if (!q.options || q.correctIndex === undefined) return q;
        let optionsWithIndex = q.options.map((opt, idx) => ({ text: opt, isCorrect: idx === q.correctIndex }));
        for (let i = optionsWithIndex.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [optionsWithIndex[i], optionsWithIndex[j]] = [optionsWithIndex[j], optionsWithIndex[i]];
        }
        return {
            ...q,
            options: optionsWithIndex.map(opt => opt.text),
            correctIndex: optionsWithIndex.findIndex(opt => opt.isCorrect)
        };
    });
};

// This is the "Brain" of our service. It handles the actual communication, retry logic, and "Plan B" backup.
const callGemini = async (payload, modelIndex = 0, attempt = 1) => {
    const model = MODELS[modelIndex];
    if (!model) {
        console.error(`[AI] All models exhausted.`);
        return null;
    }

    // Retries: 3 for primary model, 1 for fallbacks to avoid long wait times for the user
    const MAX_RETRIES = modelIndex === 0 ? 3 : 1;
    
    try {
        // We use 'fetch' to send our prompt to Google. 'await' makes the code wait until the reply comes back.
        const response = await fetch(getApiUrl(model), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        console.log(`[AI] ${model} HTTP status: ${response.status} (attempt ${attempt}/${MAX_RETRIES})`);

        // --- RETRY LOGIC FOR RATE LIMITS (429) ---
        if (response.status === 429) {
            if (attempt < MAX_RETRIES) {
                // Exponential backoff: wait 2s, then 4s, then 8s...
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(`[AI] Rate limited. Waiting ${delay / 1000}s before retry...`);
                await sleep(delay);
                return await callGemini(payload, modelIndex, attempt + 1);
            }
            
            // All retries exhausted on this model — try next fallback model if we have one
            if (modelIndex < MODELS.length - 1) {
                console.warn(`[AI] ${model} exhausted retries. Trying fallback: ${MODELS[modelIndex + 1]}`);
                return await callGemini(payload, modelIndex + 1, 1);
            }
            
            // All models exhausted
            console.error(`[AI] All models rate-limited after retries.`);
            return null;
        }

        // We turn the response from Google back into a JavaScript object.
        const data = await response.json();
        
        // We use our helper function above to check if the data is valid or if the model is busy.
        const result = parseAIResponse(data);

        // --- THE "PLAN B" LOGIC (for non-429 overload errors) ---
        if (result.isOverloaded && modelIndex < MODELS.length - 1) {
            console.warn(`Model ${model} overloaded (non-429). Trying fallback: ${MODELS[modelIndex + 1]}`);
            return await callGemini(payload, modelIndex + 1, 1);
        }

        // If the AI returned an error and it's not just overloaded, log it!
        if (result.error && !result.isOverloaded) {
            console.error(`[AI Service Error] ${model}:`, result.error);
        }

        // If everything is fine, we return the parsed data (or null if it failed).
        return result.data || null;
    } catch (error) {
        // This catches internet connection errors or other "hard" failures.
        console.error(`[AI HARD ERROR] (${model}):`, error.message);
        
        // Even if the internet hiccuped, if we have more models, try the next one.
        if (modelIndex < MODELS.length - 1) {
            return await callGemini(payload, modelIndex + 1, 1);
        }
        return null;
    }
};

// This is the function for generating a quiz just by typing a topic (like "Naruto History").
export const generateQuiz = async (topic, count, difficulty) => {
    const CHUNK_SIZE = 35;
    const numChunks = Math.ceil(count / CHUNK_SIZE);
    
    const chunkPromises = [];
    for (let i = 0; i < numChunks; i++) {
        const questionsInThisChunk = (i === numChunks - 1) ? (count - i * CHUNK_SIZE) : CHUNK_SIZE;
        
        const prompt = `Generate exactly ${questionsInThisChunk} multiple-choice questions about "${topic}" at ${difficulty} difficulty.
        
        STRICT RULES:
        1. Each 'question' must be under 25 words.
        2. Each 'option' must be under 15 words.
        
        Return ONLY a raw JSON array: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}]`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        
        // Fast stagger: 250ms
        chunkPromises.push(sleep(i * 250).then(() => callGemini(payload, 1)));
    }
    
    const results = await Promise.all(chunkPromises);
    let allQuestions = results.filter(res => res !== null).flat();

    // --- TOP-UP LOGIC ---
    // If the AI missed a few questions, request the exact missing amount
    let retries = 0;
    while (allQuestions.length < count && retries < 2) {
        const missing = count - allQuestions.length;
        console.log(`[AI] Missing ${missing} questions. Running top-up...`);
        
        const prompt = `Generate exactly ${missing} MORE multiple-choice questions about "${topic}" at ${difficulty} difficulty.
        
        STRICT RULES:
        1. Each 'question' must be under 25 words.
        2. Each 'option' must be under 15 words.
        
        Return ONLY a raw JSON array: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}]`;
        
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        
        const topUpResult = await callGemini(payload, 1);
        if (topUpResult) {
            allQuestions = allQuestions.concat(topUpResult);
        }
        retries++;
    }

    // Trim just in case the AI over-generated by 1 or 2
    if (allQuestions.length > count) {
        allQuestions = allQuestions.slice(0, count);
    }

    return shuffleQuestionsOptions(allQuestions);
};

// This is the function used when you upload a PDF or TXT file.
export const generateQuizFromFile = async (fileBase64, mimeType, count, difficulty) => {
    const CHUNK_SIZE = 35;
    const numChunks = Math.ceil(count / CHUNK_SIZE);
    
    const chunkPromises = [];
    for (let i = 0; i < numChunks; i++) {
        const questionsInThisChunk = (i === numChunks - 1) ? (count - i * CHUNK_SIZE) : CHUNK_SIZE;
        
        const prompt = `Based on the attached file, generate exactly ${questionsInThisChunk} multiple-choice questions at ${difficulty} difficulty.
        
        STRICT RULES:
        1. Each 'question' must be under 25 words.
        2. Each 'option' must be under 15 words.
        
        Return ONLY a raw JSON array: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}]`;
        
        const payload = {
            contents: [{ 
                parts: [
                    { text: prompt },
                    // inline_data is how we send files directly in the request.
                    { inline_data: { mime_type: mimeType, data: fileBase64 } } 
                ] 
            }]
        };
        
        // Fast stagger: 250ms
        chunkPromises.push(sleep(i * 250).then(() => callGemini(payload, 1)));
    }
    
    const results = await Promise.all(chunkPromises);
    let allQuestions = results.filter(res => res !== null).flat();

    // --- TOP-UP LOGIC ---
    let retries = 0;
    while (allQuestions.length < count && retries < 2) {
        const missing = count - allQuestions.length;
        console.log(`[AI] Missing ${missing} questions from file. Running top-up...`);
        
        const prompt = `Based on the attached file, generate exactly ${missing} MORE multiple-choice questions at ${difficulty} difficulty.
        
        STRICT RULES:
        1. Each 'question' must be under 25 words.
        2. Each 'option' must be under 15 words.
        
        Return ONLY a raw JSON array: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0}]`;
        
        const payload = {
            contents: [{ 
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: fileBase64 } } 
                ] 
            }]
        };
        
        const topUpResult = await callGemini(payload, 1);
        if (topUpResult) {
            allQuestions = allQuestions.concat(topUpResult);
        }
        retries++;
    }

    if (allQuestions.length > count) {
        allQuestions = allQuestions.slice(0, count);
    }

    return shuffleQuestionsOptions(allQuestions);
};

// --- THE LEGENDARY THEME FORGE ---
// This function is the "Art Director" of your app. 
// It uses AI to analyze ANY series and generate a custom "Visual DNA" for it.
export const generateSeriesAesthetic = async (seriesName) => {
    const prompt = `You are a UI designer creating a mobile app theme inspired by "${seriesName}".
    
    CRITICAL: The theme MUST feel authentic to the series. Examples:
    - "Stardew Valley" → warm earthy greens, soft browns, cozy light background (#F5ECD7), rounded corners, slow animations
    - "Cyberpunk 2077" → neon magenta, electric cyan, pitch black background (#0A0A0A), sharp corners, fast animations
    - "Naruto" → bold orange, deep blue, dark background (#111111), medium corners, energetic animations
    - "The Witcher" → dark silver, blood red, near-black background (#0D0D0D), sharp corners, slow ominous animations
    - "Animal Crossing" → pastel green, soft pink, warm cream background (#FFF8E7), very rounded corners, gentle animations
    
    Return ONLY a raw JSON object with these exact keys:
    {
        "primaryColor": "The signature hex color of the series",
        "secondaryColor": "A complementary accent hex color",
        "backgroundColor": "A background hex that matches the series mood — dark for gritty/sci-fi, warm/light for cozy/wholesome",
        "textColor": "Use #FFFFFF for dark backgrounds, #1A1A1A for light backgrounds",
        "glowIntensity": 5 to 30 (integer — low for cozy series, high for neon/sci-fi),
        "shadowOpacity": 0.1 to 1.0 (float),
        "animationSpeed": 100 to 800 (ms — fast for action, slow for peaceful),
        "borderRadius": 0 to 30 (px — sharp for edgy, round for friendly),
        "animationType": "One of: 'embers', 'snow', 'matrix', 'bubbles', 'stars', 'none' - based on the vibe of the series",
        "iconName": "A valid Ionicons name that represents the series (e.g. 'planet', 'flash', 'leaf', 'hardware-chip', 'shield', 'skull', 'aperture', 'musical-notes')",
        "tabEmojis": ["emoji for Leaderboard", "emoji for Activity", "emoji for Quests"],
        "streakEmoji": "A single emoji representing a 'streak' or 'energy' for this series (e.g. '🔥', '⚡', '🌟', '❄️', '🗡️')",
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

        for (let i = 0; i < MODELS.length; i++) {
            const model = MODELS[i];
            const response = await fetch(getApiUrl(model), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.error) {
                // Try next fallback model if this one is overloaded or rate limited
                if (data.error.code === 503 || data.error.code === 429) {
                    console.warn(`[AI] ${model} overloaded/rate-limited for text extraction. Moving to next.`);
                    continue;
                }
                return null;
            }

            return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        }
        return null;
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
    // We send the entire document to Gemini. Gemini 1.5/2.5 Flash has a massive context window.
    const prompt = `Based on the following document, generate exactly 20 short comprehension check questions.
    
    CRITICAL: These questions must be evenly distributed throughout the chronological flow of the text. The first questions should be from the beginning of the text, the middle questions from the middle, and the last questions from the end of the text.

    These questions are used to verify a reader is paying attention. They must be:
    1. Simple and answerable in one sentence.
    2. Based only on facts stated directly in the text.
    3. Each with exactly 3 options (A, B, C), one correct.
    4. Very short — question under 20 words, each option under 10 words.
    
    Return ONLY a raw JSON array:
    [{"question": "...", "options": ["A", "B", "C"], "correctIndex": 0}]
    
    Document text:
    "${documentText}"`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    const result = await callGemini(payload);
    return shuffleQuestionsOptions(result);
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

// --- PUBLIC QUEST DESCRIPTION GENERATOR ---
// Generates a short, catchy description for a quest when it is made public.
export const generateQuizDescription = async (questions) => {
    // We only send a sample of the questions to save tokens and keep the description general.
    const questionSample = questions.slice(0, 3).map(q => q.question).join(" ");
    
    const prompt = `Based on these sample questions, write a short, catchy 1-2 sentence description for a gamified quest.
    
    STRICT RULES:
    1. Do NOT mention that this is an AI generated quiz.
    2. Write it like a teaser for a game level (e.g. "Test your knowledge on ancient Rome! Can you survive the Colosseum?").
    3. Keep it under 25 words total.
    
    Sample questions:
    "${questionSample}"`;

    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        // We bypass JSON parsing and extract raw text
        for (let i = 0; i < MODELS.length; i++) {
            const model = MODELS[i];
            const response = await fetch(getApiUrl(model), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.error) {
                if (data.error.code === 503 || data.error.code === 429) continue;
                return null;
            }

            return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
        }
        return null;
    } catch (error) {
        console.error('Description generation error:', error.message);
        return null;
    }
};