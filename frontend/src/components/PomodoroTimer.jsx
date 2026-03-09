import { useState, useRef, useMemo, useEffect, memo } from 'react';
import { Zap, RotateCcw, Play, Pause } from 'lucide-react';

const STORAGE_KEY = 'pomodoro-state';

const MODE_DURATIONS = {
    work: 25 * 60,
    short: 5 * 60,
    long: 15 * 60,
};

const ALARM_SOUNDS = [
    'https://res.cloudinary.com/dzhp64paw/video/upload/v1769028824/Pvta_hbf66q.mp3',
    'https://res.cloudinary.com/dzhp64paw/video/upload/v1769875111/Staying_wcbczi.mp3',
];

const loadSavedState = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
};

// Memoized Progress Bar component
const PomodoroProgressBar = memo(({ activeCount }) => (
    <>
        {Array.from({ length: 20 }).map((_, i) => (
            <div
                key={i}
                className={`pomodoro-bar-segment ${i < activeCount ? 'active' : ''}`}
            />
        ))}
    </>
));

const PomodoroTimer = () => {
    // Restore saved state once on mount
    const savedState = useMemo(() => loadSavedState(), []);

    const [pomodoroMode, setPomodoroMode] = useState(
        () => savedState?.mode || 'work'
    );

    const [pomodoroTime, setPomodoroTime] = useState(() => {
        if (!savedState) return MODE_DURATIONS['work'];
        if (savedState.isActive && savedState.endTime) {
            const remaining = Math.round((savedState.endTime - Date.now()) / 1000);
            return Math.max(0, remaining);
        }
        return savedState.remainingSeconds ?? MODE_DURATIONS[savedState.mode || 'work'];
    });

    const [isPomodoroActive, setIsPomodoroActive] = useState(() => {
        if (!savedState?.isActive) return false;
        if (savedState.endTime && savedState.endTime > Date.now()) return true;
        return false;
    });

    const [isOpen, setIsOpen] = useState(false);

    // Refs
    const endTimeRef = useRef(null);
    const workerRef = useRef(null);
    const pomodoroAlarmRef = useRef(null);
    const audioUnlockedRef = useRef(false);
    const preloadedAudioRef = useRef([]);

    // Helper function to stop the Pomodoro alarm completely
    const stopPomodoroAlarm = () => {
        if (pomodoroAlarmRef.current) {
            pomodoroAlarmRef.current.pause();
            pomodoroAlarmRef.current.currentTime = 0;
            pomodoroAlarmRef.current = null;
        }
    };

    // Unlock AudioContext on first user interaction so alarm can play in background tabs
    const unlockAudio = () => {
        if (audioUnlockedRef.current) return;
        audioUnlockedRef.current = true;

        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
        } catch (err) {
            console.log('AudioContext unlock failed:', err);
        }

        // Preload alarm sounds so they're cached and ready
        preloadedAudioRef.current = ALARM_SOUNDS.map(url => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = url;
            audio.load();
            return audio;
        });
    };

    // Effect A: Worker lifecycle — create on mount, terminate on unmount
    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../workers/pomodoroWorker.js', import.meta.url),
            { type: 'module' }
        );

        workerRef.current.onmessage = (e) => {
            if (e.data.type === 'tick') {
                if (endTimeRef.current !== null) {
                    const remaining = Math.max(
                        0,
                        Math.round((endTimeRef.current - Date.now()) / 1000)
                    );
                    setPomodoroTime(remaining);
                }
            }
        };

        // If restoring an active timer from localStorage, start the worker immediately
        const saved = loadSavedState();
        if (saved?.isActive && saved?.endTime && saved.endTime > Date.now()) {
            endTimeRef.current = saved.endTime;
            workerRef.current.postMessage({ type: 'start' });
        }

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    // Effect B: Alarm trigger when time reaches 0
    useEffect(() => {
        if (pomodoroTime === 0 && !pomodoroAlarmRef.current) {
            setIsPomodoroActive(false);
            endTimeRef.current = null;
            workerRef.current?.postMessage({ type: 'stop' });

            const randomIndex = Math.floor(Math.random() * ALARM_SOUNDS.length);
            let alarmAudio;
            if (preloadedAudioRef.current[randomIndex]) {
                alarmAudio = preloadedAudioRef.current[randomIndex];
                alarmAudio.currentTime = 0;
            } else {
                alarmAudio = new Audio(ALARM_SOUNDS[randomIndex]);
            }
            alarmAudio.loop = true;
            pomodoroAlarmRef.current = alarmAudio;
            alarmAudio.play().catch(err => console.warn('Audio playback failed:', err));
        }
    }, [pomodoroTime]);

    // Effect C: Persist state to localStorage on every relevant change
    useEffect(() => {
        const state = {
            mode: pomodoroMode,
            endTime: endTimeRef.current,
            remainingSeconds: pomodoroTime,
            isActive: isPomodoroActive,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [pomodoroMode, pomodoroTime, isPomodoroActive]);

    const togglePomodoro = () => {
        stopPomodoroAlarm();

        if (!isPomodoroActive) {
            // Starting the timer
            unlockAudio();
            endTimeRef.current = Date.now() + pomodoroTime * 1000;
            workerRef.current?.postMessage({ type: 'start' });
            setIsPomodoroActive(true);
        } else {
            // Pausing the timer
            endTimeRef.current = null;
            workerRef.current?.postMessage({ type: 'stop' });
            setIsPomodoroActive(false);
        }
    };

    const resetPomodoro = () => {
        stopPomodoroAlarm();
        workerRef.current?.postMessage({ type: 'stop' });
        endTimeRef.current = null;
        setIsPomodoroActive(false);
        setPomodoroTime(MODE_DURATIONS[pomodoroMode]);
    };

    const changePomodoroMode = (mode) => {
        stopPomodoroAlarm();
        workerRef.current?.postMessage({ type: 'stop' });
        endTimeRef.current = null;
        setPomodoroMode(mode);
        setIsPomodoroActive(false);
        setPomodoroTime(MODE_DURATIONS[mode]);
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Memoized progress bar data to prevent re-renders
    const totalSeconds = useMemo(() => MODE_DURATIONS[pomodoroMode], [pomodoroMode]);

    const progressBarActiveCount = useMemo(() => {
        const progress = (totalSeconds - pomodoroTime) / totalSeconds;
        return Math.floor(progress * 20);
    }, [pomodoroTime, totalSeconds]);

    // Keyboard shortcut to toggle pomodoro (CTRL + Q)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Check for CTRL+Q or CMD+Q (Mac)
            const isCtrlQ = (e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q');

            if (isCtrlQ) {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(prev => !prev);
            }
        };

        // Use capture phase to catch event before other handlers
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    return (

        <div className="relative cursor-pointer group z-[100]">
            {/* Trigger Icon (Logo) */}
            <div
                className={`p-2 transition-all duration-300 rounded-lg ${isPomodoroActive ? 'text-red-500 bg-red-500/10' : 'text-white hover:text-red-500'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <Zap size={20} className={isPomodoroActive ? 'fill-red-500 animate-pulse' : 'fill-white'} />
            </div>

            {/* Timer Dropdown */}
            <div className={`absolute top-10 left-0 w-80 h-48 bg-black border border-neutral-800 shadow-2xl rounded-xl transition-all duration-300 origin-top-left flex flex-col p-4 z-[100] transform ${isOpen ? 'opacity-100 visible translate-y-2 pointer-events-auto' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:translate-y-2 group-hover:pointer-events-auto'} pointer-events-none`}>
                {/* Ambient Background Glow */}
                <div className={`absolute inset-0 bg-red-900/5 transition-opacity duration-1000 pointer-events-none ${isPomodoroActive ? 'opacity-100' : 'opacity-0'}`} />

                <div className="relative z-10 w-full flex items-center justify-between gap-4 h-full">

                    {/* Timer Display - Left Side */}
                    <div className="flex flex-col items-start pl-2">
                        <span
                            className={`text-[42px] leading-none font-['DotGothic16'] tracking-wider transition-colors duration-300 ${isPomodoroActive ? 'text-[#ff3333] drop-shadow-[0_0_8px_rgba(255,0,0,0.5)]' : 'text-[#e0e0e0]'
                                }`}
                        >
                            {formatTime(pomodoroTime)}
                        </span>
                        <div className="flex gap-[3px] mt-2 opacity-60">
                            <PomodoroProgressBar activeCount={progressBarActiveCount} />
                        </div>
                    </div>

                    {/* Right Side: Controls & Modes */}
                    <div className="flex flex-col items-end gap-3">

                        {/* Mode Selectors */}
                        <div className="flex gap-1">
                            {[
                                { id: 'work', label: 'WORK' },
                                { id: 'short', label: 'SHRT' },
                                { id: 'long', label: 'LONG' }
                            ].map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={(e) => { e.stopPropagation(); changePomodoroMode(mode.id); }}
                                    className={`px-2 py-[2px] text-[10px] rounded-sm transition-all duration-200 font-['DotGothic16'] tracking-wide border ${pomodoroMode === mode.id
                                        ? 'bg-[#D71921] border-[#D71921] text-white shadow-[0_0_10px_rgba(215,25,33,0.3)]'
                                        : 'bg-transparent border-[#333] text-[#555] hover:border-[#555] hover:text-[#888]'
                                        }`}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>

                        {/* Play Controls */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); resetPomodoro(); }}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[#444] hover:text-[#888] hover:bg-[#1a1a1a] transition-all"
                                title="Reset"
                            >
                                <RotateCcw size={14} />
                            </button>

                            <button
                                onClick={(e) => { e.stopPropagation(); togglePomodoro(); }}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border ${isPomodoroActive
                                    ? 'bg-[#D71921] border-[#D71921] text-white shadow-[0_0_15px_rgba(215,25,33,0.4)] hover:shadow-[0_0_20px_rgba(215,25,33,0.6)]'
                                    : 'bg-[#111] border-[#333] text-white hover:border-white'
                                    }`}
                            >
                                {isPomodoroActive ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PomodoroTimer;
