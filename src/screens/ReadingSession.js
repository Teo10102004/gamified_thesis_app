import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, Modal, AppState, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getCurrentUser } from '../services/authService';
import {
    getDocumentForReading,
    saveReadingSession,
    checkDocumentReadToday,
} from '../services/userService';

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-CHEAT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const IDLE_TIMEOUT_MS       = 60_000;   // Pause XP after 60s of no scrolling
const PING_INTERVAL_MS      = 3 * 60_000; // Fire a comprehension ping every 3 minutes
const MIN_SESSION_SECONDS   = 120;       // Sessions under 2 min earn 0 XP

export default function ReadingSession({ navigation, route }) {
    const { documentId, documentTitle } = route.params;
    const { theme } = useTheme();

    // ── Document State ──────────────────────────────────────────────────────
    const [docData, setDocData]       = useState(null);
    const [loading, setLoading]       = useState(true);
    const [currentUser, setCurrentUser] = useState(null);
    const [alreadyReadToday, setAlreadyReadToday] = useState(false);

    // ── Timer State ─────────────────────────────────────────────────────────
    const [activeSeconds, setActiveSeconds]       = useState(0);
    const [isRunning, setIsRunning]               = useState(false);  // active = timer counting
    const [isPaused, setIsPaused]                 = useState(false);  // reason for pause shown in HUD
    const [pauseReason, setPauseReason]           = useState('');

    // ── Anti-Cheat Refs ─────────────────────────────────────────────────────
    const timerRef         = useRef(null);   // setInterval for active seconds
    const idleTimerRef     = useRef(null);   // setTimeout for scroll idle
    const pingTimerRef     = useRef(null);   // setTimeout for next ping
    const lastScrollY      = useRef(0);
    const isRunningRef     = useRef(false);  // mirrors isRunning for use inside closures

    // ── Ping / Comprehension State ──────────────────────────────────────────
    const [pingVisible, setPingVisible]           = useState(false);
    const [currentPing, setCurrentPing]           = useState(null);
    const [pingIndex, setPingIndex]               = useState(0);
    const [selectedPingAnswer, setSelectedPingAnswer] = useState(null);
    const [pingAnswered, setPingAnswered]         = useState(false);
    const [pingStats, setPingStats]               = useState({ total: 0, correct: 0 });
    const pingCountdownRef = useRef(null);
    const [pingCountdown, setPingCountdown]       = useState(30); // 30s to answer

    // ── Results State ───────────────────────────────────────────────────────
    const [sessionFinished, setSessionFinished]   = useState(false);
    const [sessionResult, setSessionResult]       = useState(null);

    // ── Animated XP preview pulse ───────────────────────────────────────────
    const xpPulse = useRef(new Animated.Value(1)).current;

    // ─────────────────────────────────────────────────────────────────────────
    // LOAD DOCUMENT
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            try {
                const user = await getCurrentUser();
                if (!user) return;
                setCurrentUser(user);

                const [docResult, readCheck] = await Promise.all([
                    getDocumentForReading(documentId),
                    checkDocumentReadToday(user.id, documentId),
                ]);

                if (docResult.success && docResult.document) {
                    setDocData(docResult.document);
                } else {
                    Alert.alert('Error', 'Could not load document.');
                    navigation.goBack();
                    return;
                }

                if (readCheck.alreadyRead) {
                    setAlreadyReadToday(true);
                }
            } catch (error) {
                Alert.alert('Error', error.message);
            } finally {
                setLoading(false);
            }
        };
        init();

        // Cleanup on unmount
        return () => {
            clearAllTimers();
        };
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // APPSTATE — pause when app goes to background
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (nextState !== 'active') {
                // App went to background/inactive — pause immediately
                pauseSession('App backgrounded');
            } else {
                // App came back — don't auto-resume, let user tap Resume
                // (This prevents exploit where user flicks app open/close)
            }
        });
        return () => subscription.remove();
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // TIMER HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    const clearAllTimers = () => {
        clearInterval(timerRef.current);
        clearTimeout(idleTimerRef.current);
        clearTimeout(pingTimerRef.current);
        clearInterval(pingCountdownRef.current);
    };

    const startSession = () => {
        if (alreadyReadToday) {
            Alert.alert(
                '📅 Daily XP Cap',
                'You already earned XP from this document today. You can still read, but no XP will be awarded until tomorrow.',
            );
        }

        setIsRunning(true);
        isRunningRef.current = true;
        setIsPaused(false);

        // Active seconds ticker
        timerRef.current = setInterval(() => {
            setActiveSeconds(s => s + 1);
        }, 1000);

        // Start idle watchdog
        resetIdleTimer();

        // Schedule first ping
        schedulePing();
    };

    const pauseSession = (reason = '') => {
        if (!isRunningRef.current) return;
        setIsRunning(false);
        isRunningRef.current = false;
        setIsPaused(true);
        setPauseReason(reason);
        clearAllTimers();
    };

    const resumeSession = () => {
        setIsPaused(false);
        setIsRunning(true);
        isRunningRef.current = true;

        timerRef.current = setInterval(() => {
            setActiveSeconds(s => s + 1);
        }, 1000);

        resetIdleTimer();
        schedulePing();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // IDLE DETECTION — no scroll for 60s → pause
    // ─────────────────────────────────────────────────────────────────────────
    const resetIdleTimer = () => {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
            if (isRunningRef.current) {
                pauseSession('No scrolling detected for 60 seconds');
            }
        }, IDLE_TIMEOUT_MS);
    };

    const handleScroll = (event) => {
        const newY = event.nativeEvent.contentOffset.y;
        // Only reset if actually scrolled (avoids false positives from touch jiggles)
        if (Math.abs(newY - lastScrollY.current) > 5) {
            lastScrollY.current = newY;
            if (isRunningRef.current) {
                resetIdleTimer();
            }
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // COMPREHENSION PINGS
    // ─────────────────────────────────────────────────────────────────────────
    const schedulePing = () => {
        clearTimeout(pingTimerRef.current);
        pingTimerRef.current = setTimeout(() => {
            if (isRunningRef.current) {
                firePing();
            }
        }, PING_INTERVAL_MS);
    };

    const firePing = () => {
        if (!docData?.ping_questions?.length) return;

        const questions = docData.ping_questions;
        const index = pingIndex % questions.length;  // cycle through available questions
        setCurrentPing(questions[index]);
        setPingIndex(prev => prev + 1);
        setSelectedPingAnswer(null);
        setPingAnswered(false);
        setPingCountdown(30);
        setPingVisible(true);

        // Pause XP accrual during the ping
        clearInterval(timerRef.current);

        // 30-second countdown
        pingCountdownRef.current = setInterval(() => {
            setPingCountdown(prev => {
                if (prev <= 1) {
                    // Time's up — count as wrong
                    clearInterval(pingCountdownRef.current);
                    handlePingTimeout();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handlePingTimeout = () => {
        setPingStats(prev => ({ total: prev.total + 1, correct: prev.correct })); // wrong
        closePing();
    };

    const handlePingAnswer = (index) => {
        if (pingAnswered) return;
        setSelectedPingAnswer(index);
        setPingAnswered(true);
        clearInterval(pingCountdownRef.current);

        const isCorrect = index === currentPing.correctIndex;
        setPingStats(prev => ({
            total: prev.total + 1,
            correct: prev.correct + (isCorrect ? 1 : 0),
        }));

        // Short feedback delay before closing
        setTimeout(() => closePing(), 1500);
    };

    const closePing = () => {
        setPingVisible(false);
        // Resume timer if session is still active
        if (isRunningRef.current) {
            timerRef.current = setInterval(() => {
                setActiveSeconds(s => s + 1);
            }, 1000);
            resetIdleTimer();
            schedulePing();
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // END SESSION
    // ─────────────────────────────────────────────────────────────────────────
    const handleEndSession = () => {
        Alert.alert(
            'End Session?',
            'This will stop the timer and save your XP.',
            [
                { text: 'Keep Reading', style: 'cancel' },
                { text: 'End & Save', onPress: finishSession }
            ]
        );
    };

    const finishSession = async () => {
        clearAllTimers();
        setIsRunning(false);
        isRunningRef.current = false;

        if (!currentUser) return;

        if (alreadyReadToday) {
            setSessionResult({ xpEarned: 0, alreadyRead: true, activeSeconds, pingStats });
            setSessionFinished(true);
            return;
        }

        const result = await saveReadingSession(
            currentUser.id,
            documentId,
            activeSeconds,
            pingStats.correct,
            pingStats.total,
        );

        // XP pulse animation
        Animated.sequence([
            Animated.timing(xpPulse, { toValue: 1.4, duration: 200, useNativeDriver: true }),
            Animated.timing(xpPulse, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();

        setSessionResult({ ...result, activeSeconds, pingStats });
        setSessionFinished(true);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // UI HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    const formatTime = (secs) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const previewXP = () => {
        if (alreadyReadToday) return 0;
        const mins = activeSeconds / 60;
        if (mins < 2) return 0;
        const engagement = pingStats.total > 0 ? (pingStats.correct / pingStats.total) : 0.5;
        return Math.max(
            Math.floor(mins * 5 * engagement),
            Math.floor(mins * 2)
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // LOADING STATE
    // ─────────────────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: theme.backgroundColor }]}>
                <ActivityIndicator size="large" color={theme.primaryColor} />
                <Text style={{ color: 'gray', marginTop: 16 }}>Loading document…</Text>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESULTS SCREEN
    // ─────────────────────────────────────────────────────────────────────────
    if (sessionFinished && sessionResult) {
        const { xpEarned, tooShort, alreadyRead, activeSeconds: finalSecs, pingStats: ps } = sessionResult;
        return (
            <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
                <View style={styles.resultsContainer}>
                    <Ionicons name="trophy" size={80} color={theme.primaryColor} />
                    <Text style={[styles.resultsTitle, { color: theme.primaryColor }]}>
                        Session Complete!
                    </Text>

                    <View style={[styles.resultsStat, { borderColor: theme.secondaryColor }]}>
                        <Text style={styles.resultsLabel}>Time Read</Text>
                        <Text style={[styles.resultsValue, { color: theme.textColor }]}>
                            {formatTime(finalSecs)}
                        </Text>
                    </View>

                    <View style={[styles.resultsStat, { borderColor: theme.secondaryColor }]}>
                        <Text style={styles.resultsLabel}>Comprehension Pings</Text>
                        <Text style={[styles.resultsValue, { color: theme.textColor }]}>
                            {ps.correct} / {ps.total} Correct
                        </Text>
                    </View>

                    <View style={[styles.resultsStat, { borderColor: theme.primaryColor, borderWidth: 2 }]}>
                        <Text style={styles.resultsLabel}>XP Earned</Text>
                        <Animated.Text style={[styles.xpValue, { color: theme.primaryColor, transform: [{ scale: xpPulse }] }]}>
                            +{xpEarned} XP
                        </Animated.Text>
                    </View>

                    {tooShort && (
                        <Text style={styles.warningText}>
                            ⚠️ Session under 2 minutes — no XP awarded. Read longer next time!
                        </Text>
                    )}
                    {alreadyRead && (
                        <Text style={styles.warningText}>
                            📅 You already earned XP from this document today. Come back tomorrow!
                        </Text>
                    )}

                    <TouchableOpacity
                        style={[styles.doneBtn, { backgroundColor: theme.primaryColor }]}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.doneBtnText}>Back to Library</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN READING SCREEN
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>

            {/* ── TOP HUD ── */}
            <View style={[styles.hud, { borderBottomColor: theme.primaryColor + '44' }]}>
                <TouchableOpacity onPress={handleEndSession}>
                    <Ionicons name="close" size={26} color={theme.secondaryColor} />
                </TouchableOpacity>

                <View style={styles.hudCenter}>
                    <Text style={[styles.hudTimer, { color: isRunning ? theme.primaryColor : '#FF4444' }]}>
                        {formatTime(activeSeconds)}
                    </Text>
                    {isPaused && (
                        <Text style={styles.hudPauseLabel}>PAUSED — {pauseReason}</Text>
                    )}
                    {!isRunning && !isPaused && (
                        <Text style={styles.hudPauseLabel}>Tap ▶ to start reading</Text>
                    )}
                </View>

                <View style={styles.hudRight}>
                    <Text style={[styles.hudXP, { color: theme.secondaryColor }]}>~{previewXP()} XP</Text>
                    <Text style={styles.hudPingScore}>
                        {pingStats.correct}/{pingStats.total} ✓
                    </Text>
                </View>
            </View>

            {/* ── DOCUMENT TITLE ── */}
            <Text style={[styles.docTitle, { color: theme.textColor }]} numberOfLines={2}>
                {documentTitle}
            </Text>

            {/* ── SCROLLABLE TEXT ── */}
            <ScrollView
                style={styles.textScroll}
                contentContainerStyle={styles.textContent}
                onScroll={handleScroll}
                scrollEventThrottle={500}
            >
                <Text style={[styles.bodyText, { color: theme.textColor }]}>
                    {docData?.extracted_text || 'No content available.'}
                </Text>
            </ScrollView>

            {/* ── CONTROL BAR ── */}
            <View style={[styles.controlBar, { borderTopColor: theme.primaryColor + '44' }]}>
                {!isRunning ? (
                    <TouchableOpacity
                        style={[styles.controlBtn, { backgroundColor: theme.primaryColor }]}
                        onPress={isPaused ? resumeSession : startSession}
                    >
                        <Ionicons name="play" size={22} color="#FFF" />
                        <Text style={styles.controlBtnText}>{isPaused ? 'Resume' : 'Start Reading'}</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={[styles.controlBtn, { backgroundColor: 'rgba(255,68,68,0.2)', borderColor: '#FF4444', borderWidth: 1 }]}
                        onPress={() => pauseSession('Manually paused')}
                    >
                        <Ionicons name="pause" size={22} color="#FF4444" />
                        <Text style={[styles.controlBtnText, { color: '#FF4444' }]}>Pause</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.endBtn} onPress={handleEndSession}>
                    <Ionicons name="flag" size={22} color={theme.secondaryColor} />
                    <Text style={[styles.endBtnText, { color: theme.secondaryColor }]}>End Session</Text>
                </TouchableOpacity>
            </View>

            {/* ── COMPREHENSION PING MODAL ── */}
            <Modal visible={pingVisible} transparent animationType="slide">
                <View style={styles.pingOverlay}>
                    <View style={[styles.pingBox, { backgroundColor: '#0D0D0D', borderColor: theme.primaryColor }]}>
                        {/* Ping Header */}
                        <View style={styles.pingHeader}>
                            <Ionicons name="flash" size={22} color={theme.primaryColor} />
                            <Text style={[styles.pingHeaderText, { color: theme.primaryColor }]}>
                                Comprehension Check
                            </Text>
                            <Text style={[styles.pingCountdown, {
                                color: pingCountdown <= 10 ? '#FF4444' : 'gray'
                            }]}>
                                {pingCountdown}s
                            </Text>
                        </View>

                        <Text style={[styles.pingQuestion, { color: '#FFFFFF' }]}>
                            {currentPing?.question}
                        </Text>

                        {/* Answer Options */}
                        {currentPing?.options?.map((option, idx) => {
                            let btnStyle = [styles.pingOption, { borderColor: 'rgba(255,255,255,0.15)' }];
                            let txtColor = '#FFFFFF';

                            if (pingAnswered) {
                                if (idx === currentPing.correctIndex) {
                                    btnStyle = [...btnStyle, { backgroundColor: 'rgba(0,255,128,0.15)', borderColor: '#00FF80' }];
                                    txtColor = '#00FF80';
                                } else if (idx === selectedPingAnswer && idx !== currentPing.correctIndex) {
                                    btnStyle = [...btnStyle, { backgroundColor: 'rgba(255,68,68,0.15)', borderColor: '#FF4444' }];
                                    txtColor = '#FF4444';
                                }
                            }

                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={btnStyle}
                                    onPress={() => handlePingAnswer(idx)}
                                    disabled={pingAnswered}
                                >
                                    <Text style={[styles.pingOptionText, { color: txtColor }]}>
                                        {String.fromCharCode(65 + idx)}. {option}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}

                        {pingAnswered && (
                            <Text style={[styles.pingFeedback, {
                                color: selectedPingAnswer === currentPing.correctIndex ? '#00FF80' : '#FF4444'
                            }]}>
                                {selectedPingAnswer === currentPing.correctIndex ? '✅ Correct! XP bonus earned.' : '❌ Wrong. Keep focused!'}
                            </Text>
                        )}
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // HUD
    hud: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
    },
    hudCenter: { alignItems: 'center' },
    hudTimer: { fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
    hudPauseLabel: { fontSize: 10, color: '#FF4444', textAlign: 'center', marginTop: 2 },
    hudRight: { alignItems: 'flex-end' },
    hudXP: { fontSize: 16, fontWeight: '800' },
    hudPingScore: { fontSize: 11, color: 'gray', marginTop: 2 },

    // Document
    docTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
    textScroll: { flex: 1 },
    textContent: { padding: 20, paddingTop: 0 },
    bodyText: { fontSize: 16, lineHeight: 28, letterSpacing: 0.3 },

    // Controls
    controlBar: {
        flexDirection: 'row', padding: 16, gap: 12,
        borderTopWidth: 1, alignItems: 'center',
    },
    controlBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 14, borderRadius: 12,
    },
    controlBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
    endBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 14,
        borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    },
    endBtnText: { fontWeight: '700', fontSize: 14 },

    // Ping Modal
    pingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end', padding: 16, paddingBottom: 40 },
    pingBox: { borderRadius: 20, borderWidth: 1.5, padding: 22 },
    pingHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    pingHeaderText: { fontWeight: '900', fontSize: 16, textTransform: 'uppercase', flex: 1, marginLeft: 8 },
    pingCountdown: { fontSize: 18, fontWeight: '900' },
    pingQuestion: { fontSize: 17, fontWeight: '600', lineHeight: 24, marginBottom: 18 },
    pingOption: {
        borderWidth: 1.5, borderRadius: 10, padding: 14, marginBottom: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    pingOptionText: { fontSize: 15, fontWeight: '600' },
    pingFeedback: { fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: 8 },

    // Results Screen
    resultsContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    resultsTitle: { fontSize: 30, fontWeight: '900', marginTop: 20, marginBottom: 30 },
    resultsStat: {
        width: '100%', borderWidth: 1, borderRadius: 14, padding: 18,
        marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
    },
    resultsLabel: { color: 'gray', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    resultsValue: { fontSize: 24, fontWeight: '800' },
    xpValue: { fontSize: 36, fontWeight: '900' },
    warningText: { color: '#FF8C00', fontSize: 13, textAlign: 'center', marginTop: 10, lineHeight: 20 },
    doneBtn: { marginTop: 30, paddingVertical: 16, paddingHorizontal: 50, borderRadius: 30 },
    doneBtnText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
});
