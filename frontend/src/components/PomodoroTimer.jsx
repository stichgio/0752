import React, { useState, useRef, useMemo, useEffect, memo } from 'react';
import { RotateCcw, Play, Pause } from 'lucide-react';

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
    // Pomodoro State
    const [pomodoroTime, setPomodoroTime] = useState(25 * 60);
    const [isPomodoroActive, setIsPomodoroActive] = useState(false);
    const [pomodoroMode, setPomodoroMode] = useState('work'); // 'work', 'short', 'long'

    const pomodoroAlarmRef = useRef(null); // Reference to the alarm audio for loop control

    // Helper function to stop the Pomodoro alarm completely
    const stopPomodoroAlarm = () => {
        if (pomodoroAlarmRef.current) {
            pomodoroAlarmRef.current.pause();
            pomodoroAlarmRef.current.currentTime = 0;
            pomodoroAlarmRef.current = null;
        }
    };

    // Pomodoro Logic
    useEffect(() => {
        let interval = null;
        if (isPomodoroActive && pomodoroTime > 0) {
            interval = setInterval(() => {
                setPomodoroTime((time) => time - 1);
            }, 1000);
        } else if (pomodoroTime === 0 && !pomodoroAlarmRef.current) {
            // Only play alarm if timer reaches 0 and no alarm is already playing
            setIsPomodoroActive(false);
            // Array of alarm sounds - randomly select one
            const alarmSounds = [
                'https://res.cloudinary.com/dzhp64paw/video/upload/v1769028824/Pvta_hbf66q.mp3',
                'https://res.cloudinary.com/dzhp64paw/video/upload/v1769875111/Staying_wcbczi.mp3'
            ];
            const randomIndex = Math.floor(Math.random() * alarmSounds.length);
            const alarmAudio = new Audio(alarmSounds[randomIndex]);
            alarmAudio.loop = true; // Loop continuously until manually stopped
            pomodoroAlarmRef.current = alarmAudio;
            alarmAudio.play().catch(err => console.log('Audio playback failed:', err));
        }
        return () => clearInterval(interval);
    }, [isPomodoroActive, pomodoroTime]);

    const togglePomodoro = () => {
        // Stop the alarm completely when user presses Play/Pause
        stopPomodoroAlarm();
        setIsPomodoroActive(!isPomodoroActive);
    };

    const resetPomodoro = () => {
        // Stop the alarm completely when user presses Reset
        stopPomodoroAlarm();
        setIsPomodoroActive(false);
        if (pomodoroMode === 'work') setPomodoroTime(25 * 60);
        else if (pomodoroMode === 'short') setPomodoroTime(5 * 60);
        else if (pomodoroMode === 'long') setPomodoroTime(15 * 60);
    };

    const changePomodoroMode = (mode) => {
        // Stop the alarm completely when changing mode
        stopPomodoroAlarm();
        setPomodoroMode(mode);
        setIsPomodoroActive(false);
        if (mode === 'work') setPomodoroTime(25 * 60);
        else if (mode === 'short') setPomodoroTime(5 * 60);
        else if (mode === 'long') setPomodoroTime(15 * 60);
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Memoized progress bar data to prevent re-renders
    const totalSeconds = useMemo(() => {
        if (pomodoroMode === 'work') return 25 * 60;
        if (pomodoroMode === 'short') return 5 * 60;
        return 15 * 60;
    }, [pomodoroMode]);

    const progressBarActiveCount = useMemo(() => {
        const progress = (totalSeconds - pomodoroTime) / totalSeconds;
        return Math.floor(progress * 20);
    }, [pomodoroTime, totalSeconds]);


    return (
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-[#050505] border border-[#222] rounded-xl p-4 relative overflow-hidden group">
            {/* Ambient Background Glow */}
            <div className={`absolute inset-0 bg-red-900/5 transition-opacity duration-1000 ${isPomodoroActive ? 'opacity-100' : 'opacity-0'}`} />

            <div className="relative z-10 w-full flex items-center justify-between gap-4">

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
                                onClick={() => changePomodoroMode(mode.id)}
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
                            onClick={resetPomodoro}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-[#444] hover:text-[#888] hover:bg-[#1a1a1a] transition-all"
                            title="Reset"
                        >
                            <RotateCcw size={14} />
                        </button>

                        <button
                            onClick={togglePomodoro}
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
    );
};

export default PomodoroTimer;
