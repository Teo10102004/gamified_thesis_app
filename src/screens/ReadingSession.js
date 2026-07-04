import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    ActivityIndicator, Alert, Modal, AppState, Animated, TextInput, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { getCurrentUser } from '../services/authService';
import {
    getDocumentForReading,
    saveReadingSession,
    checkDocumentReadToday,
} from '../services/userService';
import FandomBackground from '../components/FandomBackground';

// ─────────────────────────────────────────────────────────────────────────────
// ANTI-CHEAT CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const IDLE_TIMEOUT_MS       = 60_000;   // Pause XP after 60s of no scrolling
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

    // ── Pomodoro State ──────────────────────────────────────────────────────
    const [isPomodoroEnabled, setIsPomodoroEnabled] = useState(false);
    const [pomodoroPhase, setPomodoroPhase]         = useState('focus'); // 'focus' | 'break'
    const [workDurationMins, setWorkDurationMins]   = useState(25);
    const [breakDurationMins, setBreakDurationMins] = useState(5);
    const [pomodoroSeconds, setPomodoroSeconds]     = useState(25 * 60);
    const [showSessionSettings, setShowSessionSettings] = useState(false);
    const [pingIntervalMins, setPingIntervalMins]   = useState(3);

    // ── Anti-Cheat Refs ─────────────────────────────────────────────────────
    const timerRef         = useRef(null);   // setInterval for active seconds
    const idleTimerRef     = useRef(null);   // setTimeout for scroll idle
    const pingTimerRef     = useRef(null);   // setTimeout for next ping
    const lastScrollY      = useRef(0);
    const isRunningRef     = useRef(false);  // mirrors isRunning for use inside closures

    // ── Pomodoro Refs ───────────────────────────────────────────────────────
    const isPomodoroEnabledRef = useRef(false);
    const pomodoroPhaseRef     = useRef('focus');
    const workDurationRef      = useRef(25);
    const breakDurationRef     = useRef(5);
    const pingIntervalRef      = useRef(3);
    const scrollPercentageRef  = useRef(0); // Tracks how far down the document the user is

    // ── Anti-Cheat: Scroll Speed ────────────────────────────────────────────
    const lastScrollTimeRef    = useRef(Date.now());
    const scrollViolationsRef  = useRef(0);

    // ── Ping / Comprehension State ──────────────────────────────────────────
    const [pingVisible, setPingVisible]           = useState(false);
    const [currentPing, setCurrentPing]           = useState(null);
    const [pingIndex, setPingIndex]               = useState(0);
    const [selectedPingAnswer, setSelectedPingAnswer] = useState(null);
    const [pingAnswered, setPingAnswered]         = useState(false);
    const [pingStats, setPingStats]               = useState({ total: 0, correct: 0 });
    const pingCountdownRef = useRef(null);
    const [pingCountdown, setPingCountdown]       = useState(30); // 30s to answer

    // ── Speed Warning Toast ─────────────────────────────────────────────────
    const [showSpeedWarning, setShowSpeedWarning] = useState(false);

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

    const handlePhaseSwitch = () => {
        if (pomodoroPhaseRef.current === 'focus') {
            pomodoroPhaseRef.current = 'break';
            setPomodoroPhase('break');
            setPomodoroSeconds(breakDurationRef.current * 60);
            Alert.alert("Break Time! ☕", "Time to rest your eyes. The document will be locked until the break is over.");
        } else {
            pomodoroPhaseRef.current = 'focus';
            setPomodoroPhase('focus');
            setPomodoroSeconds(workDurationRef.current * 60);
            Alert.alert("Focus Time! 🍅", "Break is over. Back to reading!");
        }
    };

    const startInterval = () => {
        timerRef.current = setInterval(() => {
            if (isPomodoroEnabledRef.current) {
                setPomodoroSeconds(prev => {
                    if (prev <= 1) {
                        handlePhaseSwitch();
                        return 0; // Phase switch resets this
                    }
                    return prev - 1;
                });
            }
            
            // Only increment XP if not in a break
            if (!isPomodoroEnabledRef.current || pomodoroPhaseRef.current === 'focus') {
                setActiveSeconds(s => s + 1);
            }
        }, 1000);
    };

    const togglePomodoro = () => {
        const newValue = !isPomodoroEnabled;
        setIsPomodoroEnabled(newValue);
        isPomodoroEnabledRef.current = newValue;
        if (newValue) {
            pomodoroPhaseRef.current = 'focus';
            setPomodoroPhase('focus');
            setPomodoroSeconds(workDurationRef.current * 60);
        }
    };

    const saveSessionSettings = (w, b, p) => {
        setWorkDurationMins(w);
        setBreakDurationMins(b);
        workDurationRef.current = w;
        breakDurationRef.current = b;
        
        pingIntervalRef.current = p;
        setPingIntervalMins(p);

        if (isPomodoroEnabled) {
            pomodoroPhaseRef.current = 'focus';
            setPomodoroPhase('focus');
            setPomodoroSeconds(w * 60);
        }
        
        if (isRunningRef.current) {
            schedulePing();
        }

        setShowSessionSettings(false);
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

        startInterval();

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

        startInterval();

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
        const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
        const newY = contentOffset.y;
        
        // Calculate scroll percentage mapping (0.0 to 1.0)
        const maxScroll = contentSize.height - layoutMeasurement.height;
        if (maxScroll > 0) {
            const currentPercentage = Math.min(1, Math.max(0, newY / maxScroll));
            // Only update if they've scrolled further down (prevents going backward from showing early questions)
            if (currentPercentage > scrollPercentageRef.current) {
                scrollPercentageRef.current = currentPercentage;
            }
        }

        // Only reset idle timer if actually scrolled (avoids false positives from touch jiggles)
        if (Math.abs(newY - lastScrollY.current) > 5) {
            const now = Date.now();
            const timeDiff = now - lastScrollTimeRef.current;
            
            if (timeDiff > 0) {
                const distance = Math.abs(newY - lastScrollY.current);
                const speed = distance / timeDiff; // pixels per ms
                
                // If they scroll more than 3px per millisecond (e.g. 1500px in 500ms)
                if (speed > 3.0) {
                    scrollViolationsRef.current += 1;
                    if (scrollViolationsRef.current >= 3) {
                        if (isRunningRef.current) {
                            setShowSpeedWarning(true);
                            setTimeout(() => {
                                setShowSpeedWarning(false);
                            }, 3000);
                        }
                        scrollViolationsRef.current = 0;
                    }
                } else {
                    // Slowly decay violations if they scroll normally
                    if (scrollViolationsRef.current > 0) {
                        scrollViolationsRef.current = Math.max(0, scrollViolationsRef.current - 0.5);
                    }
                }
            }
            lastScrollTimeRef.current = now;
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
        }, pingIntervalRef.current * 60_000);
    };

    const firePing = () => {
        if (!docData?.ping_questions?.length) return;

        const questions = docData.ping_questions;
        
        // Use scroll percentage to pick a question chronologically
        // e.g. 50% scrolled out of 20 questions = index 10
        let mappedIndex = Math.floor(scrollPercentageRef.current * questions.length);
        
        // Safety bounds
        if (mappedIndex >= questions.length) mappedIndex = questions.length - 1;
        if (mappedIndex < 0) mappedIndex = 0;

        setCurrentPing(questions[mappedIndex]);
        setPingIndex(prev => prev + 1); // Keep tracking total pings for engagement score
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
            startInterval();
            resetIdleTimer();
            schedulePing();
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // END SESSION
    // ─────────────────────────────────────────────────────────────────────────
    const handleEndSession = () => {
        if (activeSeconds === 0) {
            navigation.goBack();
            return;
        }

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
                <FandomBackground />
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
            <FandomBackground />

            {/* ── TOP HUD ── */}
            <View style={[styles.hud, { borderBottomColor: theme.primaryColor + '44' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity onPress={handleEndSession}>
                        <Ionicons name="close" size={26} color={theme.secondaryColor} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={togglePomodoro}
                        style={{ opacity: isPomodoroEnabled ? 1 : 0.6, marginLeft: 20 }}
                    >
                        <Text style={{ fontSize: 24 }}>🍅</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => setShowSessionSettings(true)}
                        style={{ marginLeft: 15 }}
                    >
                        <Ionicons name="settings" size={24} color={theme.secondaryColor} />
                    </TouchableOpacity>
                </View>

                {/* Speed Warning Toast */}
                {showSpeedWarning && (
                    <View style={[styles.speedWarningToast, { borderColor: theme.primaryColor }]}>
                        <Ionicons name="warning" size={24} color={theme.primaryColor} />
                        <Text style={styles.speedWarningText}>Scrolling too fast! Please read normally.</Text>
                    </View>
                )}

                <View style={styles.hudCenter}>
                    <Text style={[styles.hudTimer, { color: isRunning ? theme.primaryColor : '#FF4444' }]}>
                        {isPomodoroEnabled ? formatTime(pomodoroSeconds) : formatTime(activeSeconds)}
                    </Text>
                    {isPomodoroEnabled && (
                        <Text style={[styles.hudPauseLabel, { color: pomodoroPhase === 'focus' ? theme.primaryColor : '#FF8C00' }]}>
                            {pomodoroPhase === 'focus' ? 'FOCUS' : 'BREAK'}
                        </Text>
                    )}
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
            <View style={{ flex: 1 }}>
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

                {isPomodoroEnabled && pomodoroPhase === 'break' && (
                    <View style={[styles.breakOverlay, { backgroundColor: theme.backgroundColor }]}>
                        <Text style={{ fontSize: 60, marginBottom: 20 }}>☕</Text>
                        <Text style={[styles.resultsTitle, { color: '#FF8C00', textAlign: 'center', marginBottom: 10 }]}>Take a Break!</Text>
                        <Text style={{ color: theme.textColor, fontSize: 16, textAlign: 'center', paddingHorizontal: 40, lineHeight: 24 }}>
                            Your {breakDurationMins}-minute break has started. Look away from the screen and rest your eyes.
                        </Text>
                        <Text style={[styles.hudTimer, { color: '#FF8C00', marginTop: 40, fontSize: 48 }]}>
                            {formatTime(pomodoroSeconds)}
                        </Text>
                    </View>
                )}
            </View>

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

            {/* ── SESSION SETTINGS MODAL ── */}
            <Modal visible={showSessionSettings} transparent animationType="fade">
                <View style={styles.pingOverlay}>
                    <View style={[styles.pingBox, { backgroundColor: '#0D0D0D', borderColor: theme.primaryColor }]}>
                        <Text style={[styles.pingHeaderText, { color: theme.primaryColor, marginBottom: 20 }]}>
                            ⚙️ Session Settings
                        </Text>

                        <Text style={{ color: 'white', marginBottom: 8, fontWeight: 'bold' }}>Focus Duration (minutes)</Text>
                        <TextInput 
                            style={styles.settingsInput}
                            keyboardType="number-pad"
                            defaultValue={workDurationRef.current.toString()}
                            onChangeText={t => workDurationRef.current = parseInt(t) || 25}
                        />

                        <Text style={{ color: 'white', marginBottom: 8, marginTop: 15, fontWeight: 'bold' }}>Break Duration (minutes)</Text>
                        <TextInput 
                            style={styles.settingsInput}
                            keyboardType="number-pad"
                            defaultValue={breakDurationRef.current.toString()}
                            onChangeText={t => breakDurationRef.current = parseInt(t) || 5}
                        />

                        <Text style={{ color: 'white', marginBottom: 8, marginTop: 15, fontWeight: 'bold' }}>Question Popup Interval (minutes)</Text>
                        <TextInput 
                            style={styles.settingsInput}
                            keyboardType="number-pad"
                            defaultValue={pingIntervalRef.current.toString()}
                            onChangeText={t => pingIntervalRef.current = parseInt(t) || 3}
                        />

                        <TouchableOpacity 
                            style={[styles.doneBtn, { backgroundColor: theme.primaryColor, marginTop: 25, paddingVertical: 14 }]}
                            onPress={() => saveSessionSettings(workDurationRef.current, breakDurationRef.current, pingIntervalRef.current)}
                        >
                            <Text style={[styles.doneBtnText, { textAlign: 'center' }]}>Save Settings</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={{ marginTop: 15, paddingVertical: 10 }}
                            onPress={() => setShowSessionSettings(false)}
                        >
                            <Text style={{ color: 'gray', textAlign: 'center', fontWeight: 'bold' }}>Cancel</Text>
                        </TouchableOpacity>
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

    // Pomodoro Overlays
    breakOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    settingsInput: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#FFF',
        padding: 12,
        fontSize: 16,
    },

    // Global Modal Styles
    modalOverlay: {
        flex: 1, 
        backgroundColor: 'rgba(0,0,0,0.85)', 
        justifyContent: 'center', 
        padding: 20
    },
    modalContent: {
        borderRadius: 20, 
        padding: 22,
        alignItems: 'center'
    },
    modalTitle: {
        fontSize: 20, 
        fontWeight: '900', 
        marginBottom: 8
    },
    modalDesc: {
        fontSize: 13, 
        textAlign: 'center', 
        lineHeight: 20,
        opacity: 0.8
    },
    modalActions: {
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        width: '100%', 
        gap: 10,
        marginTop: 15
    },
    modalBtn: {
        flex: 1, 
        paddingVertical: 14, 
        borderRadius: 12, 
        alignItems: 'center'
    },
    modalBtnText: {
        fontWeight: 'bold', 
        fontSize: 15
    }
});
