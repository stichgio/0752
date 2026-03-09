import { useState, useRef, useMemo, useEffect, memo } from 'react';
import {
    Zap,
    RotateCcw,
    Play,
    Pause,
    Bell,
    BellOff,
    Volume2,
    VolumeX,
} from 'lucide-react';
import {
    POMODORO_STORAGE_KEY,
    MODE_LABELS,
    applyPomodoroSettings,
    buildPhaseNotification,
    createNextPhaseState,
    getModeDurationSeconds,
    getPomodoroActionLabel,
    getPomodoroStatusLabel,
    resolveRestoredPomodoroState,
} from './pomodoro/pomodoroLogic';

const ALARM_SOUNDS = [
    'https://res.cloudinary.com/dzhp64paw/video/upload/v1769028824/Pvta_hbf66q.mp3',
    'https://res.cloudinary.com/dzhp64paw/video/upload/v1769875111/Staying_wcbczi.mp3',
];

const loadSavedState = () => {
    try {
        const raw = localStorage.getItem(POMODORO_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        localStorage.removeItem(POMODORO_STORAGE_KEY);
        return null;
    }
};

const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const PomodoroProgressBar = memo(({ activeCount }) => (
    <>
        {Array.from({ length: 20 }).map((_, index) => (
            <div
                key={index}
                className={`pomodoro-bar-segment ${index < activeCount ? 'active' : ''}`}
            />
        ))}
    </>
));

const PomodoroCycleDots = memo(({ activeCount }) => (
    <div className="flex items-center gap-1">
        {Array.from({ length: 4 }).map((_, index) => (
            <span
                key={index}
                className={`h-1.5 w-3 rounded-sm transition-colors ${index < activeCount
                    ? 'bg-[#D71921] shadow-[0_0_6px_rgba(215,25,33,0.5)]'
                    : 'bg-[#333]'
                    }`}
            />
        ))}
    </div>
));

const SettingInput = memo(({ label, value, onChange }) => (
    <label className="flex flex-col gap-1 rounded-md border border-neutral-800 bg-[#0d0d0d] px-2 py-2">
        <span className="text-[9px] font-['DotGothic16'] tracking-wide text-[#666]">{label}</span>
        <input
            type="number"
            min="1"
            max="180"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full border-0 bg-transparent p-0 text-xs font-['DotGothic16'] text-white outline-none"
        />
    </label>
));

const PomodoroTimer = () => {
    const restoredState = useMemo(() => resolveRestoredPomodoroState(loadSavedState()), []);
    const [timerState, setTimerState] = useState(restoredState);
    const [isOpen, setIsOpen] = useState(false);

    const workerRef = useRef(null);
    const timerStateRef = useRef(restoredState);
    const completionHandlerRef = useRef(() => { });
    const pomodoroAlarmRef = useRef(null);
    const audioUnlockedRef = useRef(false);
    const preloadedAudioRef = useRef([]);

    useEffect(() => {
        timerStateRef.current = timerState;
    }, [timerState]);

    const stopPomodoroAlarm = () => {
        const currentAlarm = pomodoroAlarmRef.current;
        if (!currentAlarm) {
            return;
        }

        currentAlarm.pause?.();
        currentAlarm.currentTime = 0;
        pomodoroAlarmRef.current = null;
    };

    const preloadAlarmSounds = () => {
        if (preloadedAudioRef.current.length > 0) {
            return;
        }

        preloadedAudioRef.current = ALARM_SOUNDS.map((url) => {
            const audio = new Audio();
            audio.preload = 'auto';
            audio.src = url;
            audio.load();
            return audio;
        });
    };

    const unlockAudio = () => {
        if (audioUnlockedRef.current) {
            return;
        }

        audioUnlockedRef.current = true;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                const context = new AudioContextClass();
                const buffer = context.createBuffer(1, 1, 22050);
                const source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                source.start(0);
                if (context.state === 'suspended') {
                    context.resume().catch(() => { });
                }
            }
        } catch (error) {
            console.warn('Audio unlock failed:', error);
        }

        preloadAlarmSounds();
    };

    const playAlarm = () => {
        if (!timerStateRef.current.settings.soundEnabled) {
            return;
        }

        preloadAlarmSounds();
        stopPomodoroAlarm();

        const soundIndex = Math.floor(Math.random() * ALARM_SOUNDS.length);
        const cachedAudio = preloadedAudioRef.current[soundIndex];
        const alarmAudio = typeof cachedAudio?.cloneNode === 'function'
            ? cachedAudio.cloneNode(true)
            : new Audio(ALARM_SOUNDS[soundIndex]);

        alarmAudio.preload = 'auto';
        alarmAudio.loop = false;
        alarmAudio.currentTime = 0;
        alarmAudio.onended = () => {
            if (pomodoroAlarmRef.current === alarmAudio) {
                pomodoroAlarmRef.current = null;
            }
        };

        pomodoroAlarmRef.current = alarmAudio;
        alarmAudio.play().catch((error) => {
            console.warn('Audio playback failed:', error);
            if (pomodoroAlarmRef.current === alarmAudio) {
                pomodoroAlarmRef.current = null;
            }
        });
    };

    const showPhaseNotification = (completedMode, nextState) => {
        if (!timerStateRef.current.settings.notificationsEnabled) {
            return;
        }

        if (typeof window === 'undefined' || !('Notification' in window)) {
            return;
        }

        if (Notification.permission !== 'granted') {
            return;
        }

        const notification = buildPhaseNotification(completedMode, nextState);

        try {
            new Notification(notification.title, {
                body: notification.body,
                tag: 'pomodoro-phase',
            });
        } catch (error) {
            console.warn('Notification failed:', error);
        }
    };

    const handlePhaseCompletion = () => {
        const currentState = timerStateRef.current;
        if (currentState.status !== 'running') {
            return;
        }

        const completedMode = currentState.mode;
        const nextState = createNextPhaseState(currentState, {
            autoStart: true,
            now: Date.now(),
        });

        playAlarm();
        showPhaseNotification(completedMode, nextState);
        setTimerState(nextState);
    };

    useEffect(() => {
        completionHandlerRef.current = handlePhaseCompletion;
    });

    useEffect(() => {
        workerRef.current = new Worker(
            new URL('../workers/pomodoroWorker.js', import.meta.url),
            { type: 'module' }
        );

        workerRef.current.onmessage = (event) => {
            if (event.data.type === 'tick') {
                setTimerState((previousState) => {
                    if (previousState.status !== 'running') {
                        return previousState;
                    }

                    if (previousState.remainingSeconds === event.data.remainingSeconds) {
                        return previousState;
                    }

                    return {
                        ...previousState,
                        remainingSeconds: event.data.remainingSeconds,
                    };
                });
                return;
            }

            if (event.data.type === 'done') {
                completionHandlerRef.current();
            }
        };

        const currentState = timerStateRef.current;
        if (currentState.status === 'running' && currentState.endTime) {
            workerRef.current.postMessage({
                type: 'start',
                endTime: currentState.endTime,
            });
        }

        return () => {
            stopPomodoroAlarm();
            workerRef.current?.postMessage({ type: 'stop' });
            workerRef.current?.terminate();
            workerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!workerRef.current) {
            return;
        }

        if (timerState.status === 'running' && timerState.endTime) {
            workerRef.current.postMessage({
                type: 'start',
                endTime: timerState.endTime,
            });
            return;
        }

        workerRef.current.postMessage({ type: 'stop' });
    }, [timerState.status, timerState.endTime]);

    useEffect(() => {
        try {
            localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify(timerState));
        } catch {
        }
    }, [timerState]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            const isCtrlQ = (event.ctrlKey || event.metaKey) && (event.key === 'q' || event.key === 'Q');
            if (!isCtrlQ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            setIsOpen((previousValue) => !previousValue);
        };

        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, []);

    const totalSeconds = useMemo(
        () => getModeDurationSeconds(timerState.mode, timerState.settings),
        [timerState.mode, timerState.settings]
    );

    const progressBarActiveCount = useMemo(() => {
        const progress = (totalSeconds - timerState.remainingSeconds) / totalSeconds;
        return Math.max(0, Math.min(20, Math.floor(progress * 20)));
    }, [timerState.remainingSeconds, totalSeconds]);

    const currentActionLabel = useMemo(
        () => getPomodoroActionLabel(timerState.status),
        [timerState.status]
    );

    const completedPomodorosDisplay = timerState.mode === 'long'
        ? 4
        : timerState.completedPomodoros;

    const notificationsSupported = typeof window !== 'undefined' && 'Notification' in window;

    const togglePomodoro = () => {
        stopPomodoroAlarm();

        if (timerStateRef.current.status === 'running') {
            setTimerState((previousState) => ({
                ...previousState,
                status: 'paused',
                endTime: null,
            }));
            return;
        }

        unlockAudio();

        if (timerStateRef.current.remainingSeconds <= 0) {
            setTimerState((previousState) => createNextPhaseState(previousState, {
                autoStart: false,
                now: Date.now(),
            }));
            return;
        }

        const nextEndTime = Date.now() + (timerStateRef.current.remainingSeconds * 1000);
        setTimerState((previousState) => ({
            ...previousState,
            status: 'running',
            endTime: nextEndTime,
        }));
    };

    const resetPomodoro = () => {
        stopPomodoroAlarm();
        setTimerState((previousState) => ({
            ...previousState,
            status: 'idle',
            endTime: null,
            remainingSeconds: getModeDurationSeconds(previousState.mode, previousState.settings),
        }));
    };

    const changePomodoroMode = (mode) => {
        stopPomodoroAlarm();
        setTimerState((previousState) => ({
            ...previousState,
            mode,
            status: 'idle',
            endTime: null,
            remainingSeconds: getModeDurationSeconds(mode, previousState.settings),
        }));
    };

    const handleSettingChange = (settingKey, value) => {
        setTimerState((previousState) => applyPomodoroSettings(previousState, {
            [settingKey]: value,
        }));
    };

    const toggleSound = (event) => {
        event.stopPropagation();
        if (timerStateRef.current.settings.soundEnabled) {
            stopPomodoroAlarm();
        }

        setTimerState((previousState) => applyPomodoroSettings(previousState, {
            soundEnabled: !previousState.settings.soundEnabled,
        }));
    };

    const toggleNotifications = async (event) => {
        event.stopPropagation();

        if (!notificationsSupported) {
            return;
        }

        const enableNotifications = !timerStateRef.current.settings.notificationsEnabled;
        if (enableNotifications && Notification.permission === 'default') {
            try {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    return;
                }
            } catch {
                return;
            }
        }

        if (enableNotifications && Notification.permission !== 'granted') {
            return;
        }

        setTimerState((previousState) => applyPomodoroSettings(previousState, {
            notificationsEnabled: enableNotifications,
        }));
    };

    const statusLabel = getPomodoroStatusLabel(timerState.status);

    return (
        <div className="relative cursor-pointer group z-[100]">
            <div
                className={`p-2 transition-all duration-300 rounded-lg ${timerState.status === 'running' ? 'text-red-500 bg-red-500/10' : 'text-white hover:text-red-500'}`}
                onClick={() => setIsOpen((previousValue) => !previousValue)}
            >
                <Zap size={20} className={timerState.status === 'running' ? 'fill-red-500 animate-pulse' : 'fill-white'} />
            </div>

            <div className={`absolute top-10 left-0 w-80 bg-black border border-neutral-800 shadow-2xl rounded-xl transition-all duration-300 origin-top-left flex flex-col p-4 z-[100] transform ${isOpen ? 'opacity-100 visible translate-y-2 pointer-events-auto' : 'opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:translate-y-2 group-hover:pointer-events-auto'} pointer-events-none`}>
                <div className={`absolute inset-0 bg-red-900/5 transition-opacity duration-1000 pointer-events-none ${timerState.status === 'running' ? 'opacity-100' : 'opacity-0'}`} />

                <div className="relative z-10 flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-col items-start pl-2">
                            <span
                                className={`text-[42px] leading-none font-['DotGothic16'] tracking-wider transition-colors duration-300 ${timerState.status === 'running' ? 'text-[#ff3333] drop-shadow-[0_0_8px_rgba(255,0,0,0.5)]' : 'text-[#e0e0e0]'}`}
                            >
                                {formatTime(timerState.remainingSeconds)}
                            </span>
                            <div className="flex gap-[3px] mt-2 opacity-60">
                                <PomodoroProgressBar activeCount={progressBarActiveCount} />
                            </div>
                            <div className="mt-3 flex items-center gap-2 text-[9px] font-['DotGothic16'] tracking-wide text-[#666]">
                                <span>{MODE_LABELS[timerState.mode]}</span>
                                <span>/</span>
                                <span>{statusLabel}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <PomodoroCycleDots activeCount={completedPomodorosDisplay} />
                                <span className="text-[9px] font-['DotGothic16'] tracking-wide text-[#666]">
                                    P {completedPomodorosDisplay}/4
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-3">
                            <div className="flex gap-1">
                                {[
                                    { id: 'work', label: 'WORK' },
                                    { id: 'short', label: 'SHRT' },
                                    { id: 'long', label: 'LONG' },
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            changePomodoroMode(mode.id);
                                        }}
                                        className={`px-2 py-[2px] text-[10px] rounded-sm transition-all duration-200 font-['DotGothic16'] tracking-wide border ${timerState.mode === mode.id
                                            ? 'bg-[#D71921] border-[#D71921] text-white shadow-[0_0_10px_rgba(215,25,33,0.3)]'
                                            : 'bg-transparent border-[#333] text-[#555] hover:border-[#555] hover:text-[#888]'}`}
                                    >
                                        {mode.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        resetPomodoro();
                                    }}
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-[#444] hover:text-[#888] hover:bg-[#1a1a1a] transition-all"
                                    title="Reset"
                                    aria-label="Reset"
                                >
                                    <RotateCcw size={14} />
                                </button>

                                <button
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        togglePomodoro();
                                    }}
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border ${timerState.status === 'running'
                                        ? 'bg-[#D71921] border-[#D71921] text-white shadow-[0_0_15px_rgba(215,25,33,0.4)] hover:shadow-[0_0_20px_rgba(215,25,33,0.6)]'
                                        : 'bg-[#111] border-[#333] text-white hover:border-white'}`}
                                    title={currentActionLabel}
                                    aria-label={currentActionLabel}
                                >
                                    {timerState.status === 'running'
                                        ? <Pause size={18} fill="currentColor" />
                                        : <Play size={18} fill="currentColor" className="ml-1" />}
                                </button>
                            </div>

                            <span className="text-[9px] font-['DotGothic16'] tracking-wide text-[#555]">
                                {currentActionLabel.toUpperCase()}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <SettingInput
                            label="WORK"
                            value={timerState.settings.workMinutes}
                            onChange={(value) => handleSettingChange('workMinutes', value)}
                        />
                        <SettingInput
                            label="SHORT"
                            value={timerState.settings.shortBreakMinutes}
                            onChange={(value) => handleSettingChange('shortBreakMinutes', value)}
                        />
                        <SettingInput
                            label="LONG"
                            value={timerState.settings.longBreakMinutes}
                            onChange={(value) => handleSettingChange('longBreakMinutes', value)}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-neutral-800 pt-3">
                        <button
                            onClick={toggleSound}
                            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] font-['DotGothic16'] tracking-wide transition-colors ${timerState.settings.soundEnabled
                                ? 'border-[#D71921] text-white bg-[#D71921]/10'
                                : 'border-neutral-800 text-[#666] hover:text-white hover:border-neutral-600'}`}
                            title={timerState.settings.soundEnabled ? 'Disable sound' : 'Enable sound'}
                            aria-label={timerState.settings.soundEnabled ? 'Disable sound' : 'Enable sound'}
                        >
                            {timerState.settings.soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                            SOUND
                        </button>

                        <button
                            onClick={toggleNotifications}
                            disabled={!notificationsSupported}
                            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] font-['DotGothic16'] tracking-wide transition-colors ${timerState.settings.notificationsEnabled
                                ? 'border-[#D71921] text-white bg-[#D71921]/10'
                                : 'border-neutral-800 text-[#666] hover:text-white hover:border-neutral-600'} ${!notificationsSupported ? 'cursor-not-allowed opacity-50' : ''}`}
                            title={timerState.settings.notificationsEnabled ? 'Disable alerts' : 'Enable alerts'}
                            aria-label={timerState.settings.notificationsEnabled ? 'Disable alerts' : 'Enable alerts'}
                        >
                            {timerState.settings.notificationsEnabled ? <Bell size={12} /> : <BellOff size={12} />}
                            ALERTS
                        </button>
                    </div>

                    <p className="min-h-[18px] text-[9px] font-['DotGothic16'] tracking-wide text-[#555]">
                        {timerState.status === 'running'
                            ? 'Running: time changes apply on the next reset or phase.'
                            : 'Idle or paused: time changes apply to this mode now.'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PomodoroTimer;
