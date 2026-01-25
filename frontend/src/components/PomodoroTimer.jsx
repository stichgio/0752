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
            // Play alarm sound when timer ends - loops until user starts new cycle
            const alarmAudio = new Audio('https://res.cloudinary.com/dzhp64paw/video/upload/v1769028824/Pvta_hbf66q.mp3');
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
        <div className="flex-1 min-w-0 flex items-center justify-center bg-[#0a0a0a] border border-[#222] rounded-lg p-3 h-[110px]">
            {/* Main Timer Container */}
            <div className="flex items-center justify-center gap-4">

                {/* Left Controls: Play/Pause & Reset */}
                <div className="flex flex-col items-center gap-1.5">
                    <button
                        onClick={togglePomodoro}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 border ${isPomodoroActive
                            ? 'bg-[#D71921] border-[#D71921] text-white hover:bg-white hover:text-[#D71921]'
                            : 'bg-transparent border-white text-white hover:bg-white hover:text-black'}`}
                        style={{ boxShadow: isPomodoroActive ? '0 0 12px rgba(215, 25, 33, 0.4)' : 'none' }}
                    >
                        {isPomodoroActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                    </button>

                    <button
                        onClick={resetPomodoro}
                        className="w-8 h-8 rounded-full bg-transparent border border-[#444] text-[#666] flex items-center justify-center transition-all duration-150 hover:border-white hover:text-white"
                        title="Reset"
                    >
                        <RotateCcw size={12} />
                    </button>
                </div>

                {/* Center: Timer Display - Dot Matrix Style */}
                <div className="flex flex-col items-center">
                    <span
                        className={`text-[32px] text-white tracking-[0.15em] pomodoro-timer-display ${isPomodoroActive ? 'pomodoro-active' : ''}`}
                    >
                        {formatTime(pomodoroTime)}
                    </span>

                    {/* Nothing Glyph Progress Bar - Optimized */}
                    <div className="flex gap-[2px] mt-5">
                        <PomodoroProgressBar activeCount={progressBarActiveCount} />
                    </div>
                </div>

                {/* Right: Mode Selection - Nothing Style */}
                <div className="flex flex-col gap-1 min-w-[48px]">
                    <button
                        onClick={() => changePomodoroMode('work')}
                        className={`px-2 py-1 text-[9px] rounded transition-all duration-150 border tracking-wide ${pomodoroMode === 'work'
                            ? 'bg-[#D71921] border-[#D71921] text-white'
                            : 'bg-transparent border-[#333] text-[#666] hover:border-white hover:text-white'
                            }`}
                        style={{ fontFamily: "'DotGothic16', monospace" }}
                    >
                        WORK
                    </button>
                    <button
                        onClick={() => changePomodoroMode('short')}
                        className={`px-2 py-1 text-[9px] rounded transition-all duration-150 border tracking-wide ${pomodoroMode === 'short'
                            ? 'bg-[#D71921] border-[#D71921] text-white'
                            : 'bg-transparent border-[#333] text-[#666] hover:border-white hover:text-white'
                            }`}
                        style={{ fontFamily: "'DotGothic16', monospace" }}
                    >
                        SHORT
                    </button>
                    <button
                        onClick={() => changePomodoroMode('long')}
                        className={`px-2 py-1 text-[9px] rounded transition-all duration-150 border tracking-wide ${pomodoroMode === 'long'
                            ? 'bg-[#D71921] border-[#D71921] text-white'
                            : 'bg-transparent border-[#333] text-[#666] hover:border-white hover:text-white'
                            }`}
                        style={{ fontFamily: "'DotGothic16', monospace" }}
                    >
                        LONG
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PomodoroTimer;
