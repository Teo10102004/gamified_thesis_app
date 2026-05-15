import { supabase } from './supabase';

export const createUserProfile = async (userId, email) => { // Insert a new user profile into the 'User' table with the provided userId and email
    const { error } = await supabase
        .from('User')
        .insert([{ userId, email }]);
    if (error) throw error;
};

export const updateFullProfile = async (userId, updates) => {
    try {
        // --- STAGE 1: THE FULL UPDATE ---
        const { error } = await supabase
            .from('User')
            .update(updates)
            .eq('userId', userId);

        // --- STAGE 2: THE SMART FALLBACK ---
        // If the database says a column is missing (like visualConfig or avatarUrl), we don't panic!
        // We identify which property failed, strip it out, and try to save the rest.
        if (error && (error.message.toLowerCase().includes('column') || error.message.toLowerCase().includes('schema cache'))) {
            console.warn("DB Column missing. Attempting to filter and save basic data...");
            
            // We find the missing column name from the error message (e.g. 'avatarUrl')
            const missingColMatch = error.message.match(/'([^']+)'/);
            const missingCol = missingColMatch ? missingColMatch[1] : null;

            if (missingCol && updates[missingCol]) {
                const { [missingCol]: _, ...filteredUpdates } = updates;
                // Recursive call to try saving without the bad column
                return await updateFullProfile(userId, filteredUpdates);
            }
        }

        if (error) throw error;

    } catch (error) {
        console.error("Error updating profile:", error.message);
        throw error;
    }
};

/**
 * Uploads a profile picture to Supabase Storage.
 * This takes a local file URI (from an image picker) and pushes it to the cloud.
 */
export const uploadAvatar = async (userId, fileUri) => {
    try {
        console.log("[STORAGE] Starting Binary Upload for:", userId);

        // --- STEP 1: CONVERT TO ARRAYBUFFER ---
        // ArrayBuffer is raw binary data, which is often more stable than Blobs in React Native.
        const arrayBuffer = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = function() {
                // We read the response as an ArrayBuffer
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsArrayBuffer(xhr.response);
            };
            xhr.onerror = (e) => reject(new Error("Local read failed"));
            xhr.responseType = "blob";
            xhr.open("GET", fileUri, true);
            xhr.send(null);
        });
        
        console.log("[STORAGE] Binary conversion successful. Size:", arrayBuffer.byteLength);

        // --- STEP 2: PREPARE PATH ---
        const fileExt = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${userId}/${Date.now()}.${fileExt}`;
        const filePath = `public/${fileName}`;

        // --- STEP 3: THE UPLOAD ---
        console.log("[STORAGE] Pushing ArrayBuffer to Supabase...");
        const { data, error } = await supabase.storage
            .from('avatars')
            .upload(filePath, arrayBuffer, {
                contentType: 'image/' + (fileExt === 'jpg' ? 'jpeg' : fileExt),
                upsert: true
            });

        if (error) {
            console.error("[STORAGE] UPLOAD REJECTED:", error.message);
            throw error;
        }

        console.log("[STORAGE] Success! Path:", data.path);

        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        return { success: true, publicUrl };

    } catch (error) {
        console.error("[STORAGE] CRITICAL FAILURE:", error.message);
        return { success: false, error: "Network was too slow or blocked. Try a smaller image." };
    }
};


// This function creates a brand new "Quest" (Quiz) record in your database.
// We call this right after the AI finishes generating the questions.
export const createNewQuiz = async (title, description = "") => {
    try {
        // We insert a new row into the 'quiz' table.
        // We don't need to provide 'quizid' because your database creates it automatically (Serial).
        const { data, error } = await supabase
            .from('quiz')
            .insert([{
                title: title,
                description: description,
                basexp: 100, // We set a default base XP for this quiz
                ispublic: false
            }])
            .select(); // .select() tells Supabase to send back the row it just created so we can get the new ID!

        if (error) throw error;

        // We return the 'quizid' of the row we just created so we can use it in the QuizScreen.
        return { success: true, quizId: data[0].quizid };

    } catch (error) {
        console.error("Error creating new quiz:", error.message);
        return { success: false, error };
    }
};

// This function saves the user's result after they finish a quiz.
// Instead of a hardcoded "1", it now takes the real 'quizId' as an argument.
export const saveQuizScore = async (userId, quizId, score, earnedXP) => {
    try {
        // We generate a random number for 'attemptno' just to keep every try unique in the DB.
        const safeAttemptNo = Math.floor(Math.random() * 100000);

        // We insert the result into 'userquizscore'.
        // This table links the User (userid) to the Quiz (quizid).
        const { error: insertError } = await supabase
            .from('userquizscore')
            .insert({
                userid: userId,
                quizid: quizId, // The real ID of the quiz they just played
                attemptno: safeAttemptNo,
                mode: 'mock',
                score: score, // The number of correct answers
                xpreward: earnedXP, // The XP calculated in the QuizScreen
                date: new Date().toISOString()
            });

        if (insertError) throw insertError;

        return { success: true };

    } catch (error) {
        console.error("Error saving score to database:", error.message);
        return { success: false, error };
    }
};

export const fetchUserTotalXP = async (userId) => {
    try {
        // 1. Fetch ALL attempts for this user, i need both the quiz ID and the XP
        const { data, error } = await supabase
            .from('userquizscore')
            .select('quizid, xpreward')
            .eq('userid', userId);

        if (error) throw error;

        // 2. The "High Score" Filter
        // We create an empty object to keep track of the highest score per quiz
        const highestScores = {};

        data.forEach(row => {
            const currentQuizId = row.quizid;
            const currentXP = row.xpreward || 0;

            // If we haven't seen this quiz yet, OR if this score is higher than the one we saved, we replace it in the highestScores object
            if (!highestScores[currentQuizId] || currentXP > highestScores[currentQuizId]) {
                highestScores[currentQuizId] = currentXP;
            }
        });

        // 3. Now add up all the filtered high scores!
        // highestScores looks like: { "1": 200, "2": 500 } -> Object.values turns it into [200, 500]
        const totalXP = Object.values(highestScores).reduce((sum, xp) => sum + xp, 0);

        // 4. Calculate the level (Assuming 500 XP per level)
        const currentLevel = Math.floor(totalXP / 500) + 1; //floor rounds down to the nearest whole number, so we add 1 to make it 1-indexed (Level 1 starts at 0 XP)
        const currentLevelXP = totalXP % 500; // This gives us the XP towards the next level by calculating the remainder after dividing totalXP by 500

        return { success: true, totalXP, currentLevel, currentLevelXP };

    } catch (error) {
        console.error("Error fetching XP:", error.message);
        return { success: false, totalXP: 0, currentLevel: 1, currentLevelXP: 0 };
    }
};

// This function fetches every quiz the user has ever generated.
// We refactored this to do two separate fetches and merge them manually,
// which avoids "Relationship Not Found" errors if Foreign Keys aren't set up in Supabase.
export const getUserQuizzes = async (userId) => {
    try {
        // Step 1: Fetch all the quizzes from the 'quiz' table
        const { data: quizzes, error: quizError } = await supabase
            .from('quiz')
            .select('*')
            .order('quizid', { ascending: false });

        if (quizError) throw quizError;

        // Step 2: Fetch all the scores for THIS user from 'userquizscore'
        const { data: scores, error: scoreError } = await supabase
            .from('userquizscore')
            .select('quizid, xpreward')
            .eq('userid', userId);

        if (scoreError) throw scoreError;

        // Step 3: Combine them! 
        // We loop through each quiz and look for the highest score in our 'scores' list.
        const quizzesWithBestScore = quizzes.map(quiz => {
            // Find all attempts for this specific quiz ID
            const quizAttempts = scores.filter(s => s.quizid === quiz.quizid);

            // Extract just the XP numbers
            const xpValues = quizAttempts.map(a => a.xpreward);

            // Find the maximum (Personal Best)
            const bestScore = xpValues.length > 0 ? Math.max(...xpValues) : 0;

            return {
                ...quiz,
                bestScore: bestScore
            };
        });

        return { success: true, quizzes: quizzesWithBestScore };

    } catch (error) {
        console.error("Error fetching user quizzes:", error.message);
        return { success: false, quizzes: [] };
    }
};

// This function removes a quiz from the database.
export const deleteQuiz = async (quizId) => {
    try {
        // We simply tell Supabase to delete the row where the quizid matches.
        const { error } = await supabase
            .from('quiz')
            .delete()
            .eq('quizid', quizId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Error deleting quiz:", error.message);
        return { success: false, error };
    }
};

// --- FLASHCARD SERVICE FUNCTIONS ---

// 1. Create a new deck (the container for cards)
export const createNewDeck = async (userId, title, description = "") => {
    try {
        const { data, error } = await supabase
            .from('flashcard_deck')
            .insert([{ userid: userId, title, description }])
            .select();

        if (error) throw error;
        return { success: true, deckId: data[0].deckid };
    } catch (error) {
        console.error("Error creating deck:", error.message);
        return { success: false, error };
    }
};

// 2. Save multiple flashcards into a deck
export const saveFlashcards = async (deckId, cards) => {
    try {
        // We map the AI format to our database columns
        const cardsToInsert = cards.map(c => ({
            deckid: deckId,
            front_text: c.front,
            back_text: c.back,
            mastery_level: 0 // All cards start as "New"
        }));

        const { error } = await supabase
            .from('flashcard')
            .insert(cardsToInsert);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Error saving flashcards:", error.message);
        return { success: false, error };
    }
};

// 3. Fetch all decks for a user
export const getUserDecks = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('flashcard_deck')
            .select(`
                *,
                flashcard(cardid)
            `)
            .eq('userid', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // We add a 'cardCount' property for the UI
        const formattedDecks = data.map(deck => ({
            ...deck,
            cardCount: deck.flashcard.length
        }));

        return { success: true, decks: formattedDecks };
    } catch (error) {
        console.error("Error fetching decks:", error.message);
        return { success: false, decks: [] };
    }
};

// 4. Delete a deck and all its cards
export const deleteDeck = async (deckId) => {
    try {
        const { error } = await supabase
            .from('flashcard_deck')
            .delete()
            .eq('deckid', deckId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Error deleting deck:", error.message);
        return { success: false, error };
    }
};

// 5. Fetch all cards for a specific deck
export const getDeckCards = async (deckId) => {
    try {
        const { data, error } = await supabase
            .from('flashcard')
            .select('*')
            .eq('deckid', deckId);

        if (error) throw error;

        // Re-map the database columns to the simple format the UI expects
        const formattedCards = data.map(c => ({
            id: c.cardid,
            front: c.front_text,
            back: c.back_text,
            mastery: c.mastery_level
        }));

        return { success: true, cards: formattedCards };
    } catch (error) {
        console.error("Error fetching cards:", error.message);
        return { success: false, cards: [] };
    }
};

// This function saves the actual AI-generated questions into the database.
// We call this right after the quiz record is created in QuestSetup.
export const saveQuizQuestions = async (quizId, questions) => {
    try {
        // We loop through each question provided by the AI
        for (const q of questions) {
            // 1. Insert the question text into the 'question' table
            const { data: qData, error: qError } = await supabase
                .from('question')
                .insert([{ quizid: quizId, text: q.question }])
                .select();

            if (qError) throw qError;
            const questionId = qData[0].questionid;

            // 2. Prepare the 4 answers (options) for this question
            const answersToInsert = q.options.map((optText, index) => ({
                questionid: questionId,
                text: optText,
                iscorrect: index === q.correctIndex // It's correct if its index matches the AI's correctIndex
            }));

            // 3. Insert all 4 answers at once into the 'answer' table
            const { error: aError } = await supabase
                .from('answer')
                .insert(answersToInsert);

            if (aError) throw aError;
        }

        return { success: true };
    } catch (error) {
        console.error("Error saving quiz questions:", error.message);
        return { success: false, error };
    }
};

// This function pulls questions back out of the database for a "Redo".
// It re-formats them so the QuizScreen can understand them.
export const fetchQuizQuestions = async (quizId) => {
    try {
        // We fetch all questions for this quiz, and include their answers in the result!
        // Supabase allows this nested selection (like a join).
        const { data, error } = await supabase
            .from('question')
            .select(`
                questionid,
                text,
                answer (
                    text,
                    iscorrect
                )
            `)
            .eq('quizid', quizId);

        if (error) throw error;

        // We "translate" the database rows back into the format the AI uses.
        // The QuizScreen expects: { question, options: [], correctIndex }
        const formattedQuestions = data.map(q => {
            const options = q.answer.map(a => a.text);
            const correctIndex = q.answer.findIndex(a => a.iscorrect);

            return {
                question: q.text,
                options: options,
                correctIndex: correctIndex
            };
        });

        return { success: true, questions: formattedQuestions };

    } catch (error) {
        console.error("Error fetching quiz questions:", error.message);
        return { success: false, questions: [] };
    }
};

// =============================================================================
// LEARNING SESSIONS — LIBRARY & READING SESSION SERVICE FUNCTIONS
// =============================================================================

// ── FOLDER OPERATIONS ─────────────────────────────────────────────────────────

/**
 * Creates a new folder in the user's library.
 * parentId = null  →  root-level folder
 * parentId = <id>  →  subfolder inside that folder
 */
export const createFolder = async (userId, name, parentId = null) => {
    try {
        const { data, error } = await supabase
            .from('library_folder')
            .insert([{ userid: userId, name, parent_id: parentId }])
            .select();

        if (error) throw error;
        return { success: true, folder: data[0] };
    } catch (error) {
        console.error('Error creating folder:', error.message);
        return { success: false, error };
    }
};

/**
 * Fetches all folders for a user at a given level.
 * parentId = null  →  returns root-level folders
 * parentId = <id>  →  returns subfolders of that parent
 */
export const getUserFolders = async (userId, parentId = null) => {
    try {
        let query = supabase
            .from('library_folder')
            .select('*')
            .eq('userid', userId)
            .order('folderid', { ascending: true });

        // Supabase: filter by NULL or specific parentId
        if (parentId === null) {
            query = query.is('parent_id', null);
        } else {
            query = query.eq('parent_id', parentId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, folders: data };
    } catch (error) {
        console.error('Error fetching folders:', error.message);
        return { success: false, folders: [] };
    }
};

/**
 * Deletes a folder and all documents inside it.
 * Note: cascade delete is expected to be set on the DB side.
 * As a safety net, we delete documents manually first.
 */
export const deleteFolder = async (folderId) => {
    try {
        // Delete all documents in this folder first
        await supabase.from('document').delete().eq('folderid', folderId);

        // Then delete the folder itself
        const { error } = await supabase
            .from('library_folder')
            .delete()
            .eq('folderid', folderId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error deleting folder:', error.message);
        return { success: false, error };
    }
};

// ── DOCUMENT OPERATIONS ───────────────────────────────────────────────────────

/**
 * Saves a new document record into the library.
 * 'extractedText'  = plain text pulled from the file by Gemini AI
 * 'pingQuestions'  = pre-generated comprehension ping questions (JSON string)
 * 'folderId'       = null for root-level documents
 */
export const saveLibraryDocument = async (userId, title, mimeType, fileSize, extractedText, pingQuestions, folderId = null) => {
    try {
        const { data, error } = await supabase
            .from('document')
            .insert([{
                userid: userId,
                title: title,
                folderid: folderId,
                fileurl: '',           // No cloud storage in MVP — text is stored directly
                mime_type: mimeType,
                file_size: fileSize,
                extracted_text: extractedText,
                ping_questions: JSON.stringify(pingQuestions || []),
                uploaddate: new Date().toISOString().split('T')[0], // Required NOT NULL column
            }])
            .select();

        if (error) throw error;
        return { success: true, document: data[0] };
    } catch (error) {
        console.error('Error saving document:', error.message);
        return { success: false, error };
    }
};

/**
 * Fetches all documents in a specific folder (or root if folderId = null).
 */
export const getFolderDocuments = async (userId, folderId = null) => {
    try {
        let query = supabase
            .from('document')
            .select('documentid, title, file_size, mime_type')
            .eq('userid', userId)
            .order('documentid', { ascending: false });

        if (folderId === null) {
            query = query.is('folderid', null);
        } else {
            query = query.eq('folderid', folderId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, documents: data };
    } catch (error) {
        console.error('Error fetching documents:', error.message);
        return { success: false, documents: [] };
    }
};

/**
 * Fetches the full text + ping questions for a single document (for reading).
 */
export const getDocumentForReading = async (documentId) => {
    try {
        const { data, error } = await supabase
            .from('document')
            .select('documentid, title, extracted_text, ping_questions')
            .eq('documentid', documentId)
            .single();

        if (error) throw error;

        return {
            success: true,
            document: {
                ...data,
                // Parse ping_questions back from its stored JSON string
                ping_questions: data.ping_questions ? JSON.parse(data.ping_questions) : []
            }
        };
    } catch (error) {
        console.error('Error fetching document for reading:', error.message);
        return { success: false, document: null };
    }
};

/**
 * Deletes a document and all its reading session history.
 */
export const deleteDocument = async (documentId) => {
    try {
        // Delete reading sessions for this doc first
        await supabase.from('reading_session').delete().eq('documentid', documentId);

        const { error } = await supabase
            .from('document')
            .delete()
            .eq('documentid', documentId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error deleting document:', error.message);
        return { success: false, error };
    }
};

// ── READING SESSION OPERATIONS ────────────────────────────────────────────────

/**
 * Checks whether the user has already earned XP from reading this document today.
 * This is the daily XP cap — prevents re-reading the same doc for infinite XP.
 */
export const checkDocumentReadToday = async (userId, documentId) => {
    try {
        const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

        const { data, error } = await supabase
            .from('reading_session')
            .select('sessionid')
            .eq('userid', userId)
            .eq('documentid', documentId)
            .eq('session_date', today);

        if (error) throw error;
        return { alreadyRead: data.length > 0 };
    } catch (error) {
        console.error('Error checking read status:', error.message);
        return { alreadyRead: false }; // Default to allowing XP on error
    }
};

/**
 * Saves a completed reading session to the database and awards XP.
 *
 * XP Formula:
 *   engagementScore  = (correctPings / totalPings) * 100   → 0 to 100
 *   minutesRead      = activeSeconds / 60
 *   earnedXP         = floor(minutesRead × 5 × (engagementScore / 100))
 *   minXP            = if minutesRead >= 2 → floor(minutesRead × 2), else 0
 *   finalXP          = max(earnedXP, minXP)
 *
 * A session under 2 minutes always earns 0 XP.
 */
export const saveReadingSession = async (userId, documentId, activeSeconds, correctPings, totalPings) => {
    try {
        const minutesRead = activeSeconds / 60;

        // Guard: sessions under 2 minutes award 0 XP
        if (minutesRead < 2) {
            return { success: true, xpEarned: 0, tooShort: true };
        }

        const engagementScore = totalPings > 0 ? (correctPings / totalPings) * 100 : 50; // 50% default if no pings fired
        const earnedXP = Math.floor(minutesRead * 5 * (engagementScore / 100));
        const minXP = Math.floor(minutesRead * 2);
        const finalXP = Math.max(earnedXP, minXP);

        const today = new Date().toISOString().split('T')[0];

        const { error } = await supabase
            .from('reading_session')
            .insert([{
                userid: userId,
                documentid: documentId,
                duration_seconds: Math.round(activeSeconds),
                xp_earned: finalXP,
                engagement_score: Math.round(engagementScore),
                session_date: today,
            }]);

        if (error) throw error;
        return { success: true, xpEarned: finalXP, tooShort: false };
    } catch (error) {
        console.error('Error saving reading session:', error.message);
        return { success: false, xpEarned: 0 };
    }
};

/**
 * Extends fetchUserTotalXP to also include XP from reading sessions.
 * Returns the same shape as the original so Home.js needs no changes.
 */
export const fetchUserTotalXPWithReading = async (userId) => {
    try {
        // ── Quiz XP (existing logic) ─────────────────────────────────────────
        const { data: quizData, error: quizError } = await supabase
            .from('userquizscore')
            .select('quizid, xpreward')
            .eq('userid', userId);

        if (quizError) throw quizError;

        const highestScores = {};
        (quizData || []).forEach(row => {
            const id = row.quizid;
            const xp = row.xpreward || 0;
            if (!highestScores[id] || xp > highestScores[id]) highestScores[id] = xp;
        });
        const quizXP = Object.values(highestScores).reduce((sum, xp) => sum + xp, 0);

        // ── Reading XP (new) ─────────────────────────────────────────────────
        const { data: readData, error: readError } = await supabase
            .from('reading_session')
            .select('xp_earned')
            .eq('userid', userId);

        if (readError) throw readError;
        const readingXP = (readData || []).reduce((sum, row) => sum + (row.xp_earned || 0), 0);

        // ── Combined ─────────────────────────────────────────────────────────
        const totalXP = quizXP + readingXP;
        const currentLevel = Math.floor(totalXP / 500) + 1;
        const currentLevelXP = totalXP % 500;

        return { success: true, totalXP, currentLevel, currentLevelXP };
    } catch (error) {
        console.error('Error fetching total XP:', error.message);
        return { success: false, totalXP: 0, currentLevel: 1, currentLevelXP: 0 };
    }
};