import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// USERNAME UNIQUENESS CHECK
// excludeUserId: pass the current user's ID when editing profile so their
// own existing name doesn't falsely fail the check.
// ─────────────────────────────────────────────────────────────────────────────
export const checkUsernameAvailable = async (username, excludeUserId = null) => {
    try {
        let query = supabase
            .from('User')
            .select('userId')
            .eq('userName', username.trim()); // case-sensitive — "Teo" and "teo" are different

        if (excludeUserId) {
            query = query.neq('userId', excludeUserId);
        }

        const { data, error } = await query;
        if (error) throw error;

        return { available: data.length === 0 };
    } catch (error) {
        console.error('checkUsernameAvailable error:', error.message);
        return { available: true }; // fail open — don't block the user on network errors
    }
};

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

// ─────────────────────────────────────────────────────────────────────────────
// FANDOM DNA CACHE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export const getFandomCache = async (fandomName, playerClass) => {
    try {
        const { data, error } = await supabase
            .from('fandom_cache')
            .select('*')
            .eq('fandom_name', fandomName)
            .eq('player_class', playerClass)
            .maybeSingle();

        if (error) throw error;
        return data; // Returns the cached object, or null if not found
    } catch (error) {
        console.error("Error fetching fandom cache:", error.message);
        return null; 
    }
};

export const saveFandomCache = async (fandomName, playerClass, primaryColor, secondaryColor, backgroundColor, visualConfig, fandomRanks) => {
    // 1. Check if it already exists to decide whether to INSERT or UPDATE
    const { data: existing } = await supabase
        .from('fandom_cache')
        .select('id')
        .eq('fandom_name', fandomName)
        .eq('player_class', playerClass)
        .maybeSingle();

    let result;
    if (existing) {
        // Update existing cache entry
        result = await supabase
            .from('fandom_cache')
            .update({
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                background_color: backgroundColor,
                visual_config: visualConfig,
                fandom_ranks: fandomRanks
            })
            .eq('id', existing.id)
            .select();
    } else {
        // Insert new cache entry
        result = await supabase
            .from('fandom_cache')
            .insert({
                fandom_name: fandomName,
                player_class: playerClass,
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                background_color: backgroundColor,
                visual_config: visualConfig,
                fandom_ranks: fandomRanks
            })
            .select();
    }

    console.log("[CACHE] Save result data:", result.data);

    if (result.error) {
        console.error("Fandom cache save error details:", result.error);
        throw result.error;
    }
    
    if (!result.data || result.data.length === 0) {
        throw new Error("Supabase accepted the request but returned 0 saved rows. This is usually caused by Row Level Security (RLS) silently blocking the INSERT.");
    }

    return true;
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
export const createNewQuiz = async (userId, title, description = "", maxXP = 150) => {
    try {
        const { data, error } = await supabase
            .from('quiz')
            .insert([{
                userid: userId,
                title: title,
                description: description,
                basexp: 100, 
                max_xp: maxXP,
                ispublic: false
            }])
            .select();

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

        // Update streak
        await updateUserStreak(userId);

        return { success: true };

    } catch (error) {
        console.error("Error saving score to database:", error.message);
        return { success: false, error };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// STREAK TRACKING
// ─────────────────────────────────────────────────────────────────────────────
export const updateUserStreak = async (userId) => {
    try {
        const { data: user, error: fetchError } = await supabase
            .from('User')
            .select('streak_count, last_active_date')
            .eq('userId', userId)
            .single();

        if (fetchError) throw fetchError;

        const today = new Date().toISOString().split('T')[0];
        const lastActive = user.last_active_date;
        
        let newStreak = user.streak_count || 0;

        if (!lastActive) {
            // First time ever
            newStreak = 1;
        } else if (lastActive === today) {
            // Already active today, do nothing
            return { success: true, streak_count: newStreak };
        } else {
            // Check if last active was yesterday
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayString = yesterday.toISOString().split('T')[0];

            if (lastActive === yesterdayString) {
                newStreak += 1;
            } else {
                // Streak broken
                newStreak = 1;
            }
        }

        const { error: updateError } = await supabase
            .from('User')
            .update({
                streak_count: newStreak,
                last_active_date: today
            })
            .eq('userId', userId);

        if (updateError) throw updateError;

        return { success: true, streak_count: newStreak };
    } catch (error) {
        console.error("Error updating streak:", error.message);
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
        // Step 1: Fetch all the quizzes created by THIS user from the 'quiz' table
        const { data: quizzes, error: quizError } = await supabase
            .from('quiz')
            .select('*')
            .eq('userid', userId) // <-- THE FIX: Only fetch their own quizzes
            .neq('is_deleted', true) // Hide soft-deleted quizzes
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
        // Soft-delete the quiz so it vanishes from the user's library but preserves their XP history and prevents XP farming
        const { error } = await supabase
            .from('quiz')
            .update({ is_deleted: true })
            .eq('quizid', quizId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Error deleting quiz:", error.message);
        return { success: false, error };
    }
};

// --- ANTI-CHEAT ---

export const checkDocumentUsed = async (userId, exactDescription) => {
    try {
        const { data, error } = await supabase
            .from('quiz')
            .select('quizid, is_deleted')
            .eq('userid', userId)
            .eq('description', exactDescription);
            
        if (error) throw error;
        if (data && data.length > 0) {
            return { used: true, quizId: data[0].quizid, isDeleted: data[0].is_deleted };
        }
        return { used: false };
    } catch (e) {
        console.error("Error checking document anti-cheat:", e.message);
        return { used: false };
    }
};

export const restoreDeletedQuiz = async (quizId) => {
    try {
        const { error } = await supabase
            .from('quiz')
            .update({ is_deleted: false })
            .eq('quizid', quizId);
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Error restoring quiz:", error.message);
        return { success: false };
    }
};

// --- PUBLIC QUIZZES & DISCOVERY ---

export const toggleQuizPublic = async (quizId, isPublic, publicDescription = null) => {
    try {
        const updateData = { ispublic: isPublic };
        if (publicDescription) {
            updateData.public_description = publicDescription;
        }

        const { error } = await supabase
            .from('quiz')
            .update(updateData)
            .eq('quizid', quizId);

        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error("Error toggling public status:", error.message);
        return { success: false, error: error.message };
    }
};

export const likeQuiz = async (quizId, userId) => {
    try {
        // Fetch current likes and liked_by array
        const { data: quiz, error: fetchError } = await supabase
            .from('quiz')
            .select('likes, liked_by')
            .eq('quizid', quizId)
            .single();

        if (fetchError) throw fetchError;

        let likedBy = quiz.liked_by || [];
        
        // Prevent duplicate likes
        if (likedBy.includes(userId)) {
            return { success: false, message: "Already liked" };
        }

        likedBy.push(userId);
        const newLikes = (quiz.likes || 0) + 1;

        const { error: updateError } = await supabase
            .from('quiz')
            .update({ likes: newLikes, liked_by: likedBy })
            .eq('quizid', quizId);

        if (updateError) throw updateError;
        
        return { success: true, newLikes };
    } catch (error) {
        console.error("Error liking quiz:", error.message);
        return { success: false, error: error.message };
    }
};

export const getPublicQuizzes = async (currentUserId) => {
    try {
        const { data: quizzes, error } = await supabase
            .from('quiz')
            .select('*')
            .eq('ispublic', true)
            .neq('userid', currentUserId)
            .neq('is_deleted', true)
            .order('quizid', { ascending: false });

        if (error) throw error;
        
        if (!quizzes || quizzes.length === 0) {
            return { success: true, quizzes: [] };
        }

        // Get unique user IDs
        const userIds = [...new Set(quizzes.map(q => q.userid))];

        // Fetch User profiles
        const { data: usersData, error: userError } = await supabase
            .from('User')
            .select('userId, userName, playerClass, fandomName')
            .in('userId', userIds);

        if (userError) throw userError;

        // Map users for quick lookup
        const userMap = {};
        if (usersData) {
            usersData.forEach(u => {
                userMap[u.userId] = {
                    userName: u.userName,
                    playerClass: u.playerClass,
                    fandomName: u.fandomName
                };
            });
        }

        // Merge creator info into quizzes
        const enrichedQuizzes = quizzes.map(q => ({
            ...q,
            creator: userMap[q.userid] || { userName: 'Unknown' }
        }));

        return { success: true, quizzes: enrichedQuizzes };
    } catch (e) {
        console.error("Error fetching public quizzes:", e.message);
        return { success: false, quizzes: [] };
    }
};

export const cloneQuizToLibrary = async (quizId, newUserId) => {
    try {
        // 1. Fetch original quiz
        const { data: originalQuiz, error: fetchErr } = await supabase
            .from('quiz')
            .select('*')
            .eq('quizid', quizId)
            .single();

        if (fetchErr) throw fetchErr;

        // Check if user already cloned this exact quiz by name
        const cloneTitle = originalQuiz.title.endsWith('(Clone)') ? originalQuiz.title : originalQuiz.title + ' (Clone)';
        const { data: existingClone, error: checkErr } = await supabase
            .from('quiz')
            .select('quizid, is_deleted')
            .eq('userid', newUserId)
            .eq('title', cloneTitle);

        if (checkErr) throw checkErr;
        
        if (existingClone && existingClone.length > 0) {
            const clone = existingClone[0];
            if (clone.is_deleted) {
                // If they deleted it in the past, just restore it instead of duplicating!
                const { error: restoreErr } = await supabase
                    .from('quiz')
                    .update({ is_deleted: false })
                    .eq('quizid', clone.quizid);
                if (restoreErr) throw restoreErr;
                return { success: true, message: "Restored to your library!" };
            } else {
                throw new Error("You already have this quest in your library!");
            }
        }

        // 2. Clone into a new row
        const { data: newQuizData, error: cloneErr } = await supabase
            .from('quiz')
            .insert([{
                userid: newUserId,
                title: cloneTitle,
                description: originalQuiz.description,
                basexp: originalQuiz.basexp,
                max_xp: originalQuiz.max_xp || 150,
                ispublic: false
            }])
            .select();

        if (cloneErr) throw cloneErr;
        const newQuizId = newQuizData[0].quizid;

        // 3. Fetch original questions
        const { data: originalQuestions, error: qErr } = await supabase
            .from('question')
            .select('*')
            .eq('quizid', quizId);

        if (qErr) throw qErr;

        if (originalQuestions && originalQuestions.length > 0) {
            // Duplicate questions
            const clonedQuestionsToInsert = originalQuestions.map(q => ({
                quizid: newQuizId,
                text: q.text
            }));
            
            const { data: insertedQuestions, error: insQErr } = await supabase
                .from('question')
                .insert(clonedQuestionsToInsert)
                .select();

            if (insQErr) throw insQErr;

            // 4. Fetch all answers for original questions
            const originalQuestionIds = originalQuestions.map(q => q.questionid);
            const { data: originalAnswers, error: ansErr } = await supabase
                .from('answer')
                .select('*')
                .in('questionid', originalQuestionIds);
                
            if (ansErr) throw ansErr;

            // Map old question IDs to new question IDs
            const questionIdMap = {};
            originalQuestions.forEach((oq, index) => {
                const newQ = insertedQuestions.find(iq => iq.text === oq.text);
                if (newQ) {
                    questionIdMap[oq.questionid] = newQ.questionid;
                }
            });

            // Prepare answers for insertion
            const clonedAnswersToInsert = [];
            for (const ans of originalAnswers) {
                const newQuestionId = questionIdMap[ans.questionid];
                if (newQuestionId) {
                    clonedAnswersToInsert.push({
                        questionid: newQuestionId,
                        text: ans.text,
                        iscorrect: ans.iscorrect
                    });
                }
            }

            if (clonedAnswersToInsert.length > 0) {
                const { error: insAnsErr } = await supabase
                    .from('answer')
                    .insert(clonedAnswersToInsert);
                if (insAnsErr) throw insAnsErr;
            }
        }

        return { success: true, newQuizId };
    } catch (e) {
        console.error("Error cloning quiz:", e.message);
        return { success: false, error: e.message };
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

        // Update streak
        await updateUserStreak(userId);

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

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY — LEADERBOARD
// Fetches all users and computes their total XP (quiz + reading) to rank them.
// ─────────────────────────────────────────────────────────────────────────────
export const getLeaderboard = async () => {
    try {
        // 1. All public profiles
        const { data: users, error: usersError } = await supabase
            .from('User')
            .select('userId, userName, avatarUrl, fandomName, fandom_ranks, playerClass');
        if (usersError) throw usersError;

        // 2. All quiz scores — we'll compute max per quiz per user in JS
        const { data: quizScores } = await supabase
            .from('userquizscore')
            .select('userid, quizid, xpreward');

        // 3. All reading XP
        const { data: readingScores } = await supabase
            .from('reading_session')
            .select('userid, xp_earned');

        // Build quiz XP map: max per (userid, quizid)
        const quizMap = {};
        (quizScores || []).forEach(row => {
            if (!quizMap[row.userid]) quizMap[row.userid] = {};
            const prev = quizMap[row.userid][row.quizid] || 0;
            quizMap[row.userid][row.quizid] = Math.max(prev, row.xpreward || 0);
        });
        const quizTotal = {};
        Object.entries(quizMap).forEach(([uid, quizzes]) => {
            quizTotal[uid] = Object.values(quizzes).reduce((a, b) => a + b, 0);
        });

        // Build reading XP map
        const readingTotal = {};
        (readingScores || []).forEach(row => {
            readingTotal[row.userid] = (readingTotal[row.userid] || 0) + (row.xp_earned || 0);
        });

        // Assemble leaderboard entries
        const leaderboard = (users || []).map(user => {
            const totalXP = (quizTotal[user.userId] || 0) + (readingTotal[user.userId] || 0);
            const level = Math.floor(totalXP / 500) + 1;

            let rankTitle = user.playerClass || 'Explorer';
            try {
                const ranks = user.fandom_ranks ? JSON.parse(user.fandom_ranks) : null;
                if (ranks && ranks.length > 0) {
                    const rankIndex = Math.min(level - 1, ranks.length - 1);
                    rankTitle = ranks[rankIndex];
                }
            } catch (_) {}

            return {
                userId: user.userId,
                userName: user.userName || 'Unknown',
                avatarUrl: user.avatarUrl || null,
                fandomName: user.fandomName || '',
                totalXP,
                level,
                rankTitle,
            };
        });

        leaderboard.sort((a, b) => b.totalXP - a.totalXP);
        return { success: true, leaderboard };
    } catch (error) {
        console.error('getLeaderboard error:', error.message);
        return { success: false, leaderboard: [] };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY — ACTIVITY FEED
// Merges recent quiz completions and reading sessions into a single feed.
// Can be filtered by friends if currentUserId is provided.
// ─────────────────────────────────────────────────────────────────────────────
export const getRecentActivity = async (currentUserId = null) => {
    try {
        let allowedUserIds = null;

        // If filtering by friends, fetch accepted friends list first
        if (currentUserId) {
            const { data: friendships } = await supabase
                .from('friendship')
                .select('user_id_1, user_id_2')
                .eq('status', 'accepted')
                .or(`user_id_1.eq.${currentUserId},user_id_2.eq.${currentUserId}`);

            const friends = new Set([currentUserId]);
            if (friendships) {
                friendships.forEach(f => {
                    friends.add(f.user_id_1);
                    friends.add(f.user_id_2);
                });
            }
            allowedUserIds = Array.from(friends);
        }

        // Recent quiz scores
        let quizQuery = supabase
            .from('userquizscore')
            .select('userid, quizid, attemptno, score, xpreward, date')
            .order('date', { ascending: false })
            .limit(20);

        if (allowedUserIds) quizQuery = quizQuery.in('userid', allowedUserIds);
        const { data: quizActivity } = await quizQuery;

        // Recent reading sessions
        let readQuery = supabase
            .from('reading_session')
            .select('userid, xp_earned, duration_seconds, session_date, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        if (allowedUserIds) readQuery = readQuery.in('userid', allowedUserIds);
        const { data: readingActivity } = await readQuery;

        // Collect all involved user IDs
        const userIds = new Set([
            ...(quizActivity || []).map(q => q.userid),
            ...(readingActivity || []).map(r => r.userid),
        ]);

        if (userIds.size === 0) return { success: true, activities: [] };

        // Fetch their profiles
        const { data: users } = await supabase
            .from('User')
            .select('userId, userName, avatarUrl, fandomName')
            .in('userId', Array.from(userIds));

        const userMap = {};
        (users || []).forEach(u => { userMap[u.userId] = u; });

        const activities = [];

        // Map quiz events
        (quizActivity || []).forEach(item => {
            const user = userMap[item.userid];
            if (!user || !item.xpreward) return;
            activities.push({
                id: `quiz-${item.userid}-${item.quizid}-${item.attemptno ?? Math.random()}`,
                type: 'quiz',
                userName: user.userName || 'Unknown',
                avatarUrl: user.avatarUrl || null,
                fandomName: user.fandomName || '',
                xp: item.xpreward,
                score: Math.round((item.score || 0) * 100),
                timestamp: new Date(item.date).getTime() || 0,
                dateLabel: item.date,
            });
        });

        // Map reading events
        (readingActivity || []).forEach(item => {
            const user = userMap[item.userid];
            if (!user || !item.xp_earned) return;
            const mins = Math.round((item.duration_seconds || 0) / 60);
            activities.push({
                id: `read-${item.userid}-${item.created_at}`,
                type: 'reading',
                userName: user.userName || 'Unknown',
                avatarUrl: user.avatarUrl || null,
                fandomName: user.fandomName || '',
                xp: item.xp_earned,
                durationMins: mins,
                timestamp: new Date(item.created_at || item.session_date).getTime() || 0,
                dateLabel: item.session_date,
            });
        });

        activities.sort((a, b) => b.timestamp - a.timestamp);
        return { success: true, activities: activities.slice(0, 30) };
    } catch (error) {
        console.error('getRecentActivity error:', error.message);
        return { success: false, activities: [] };
    }
};