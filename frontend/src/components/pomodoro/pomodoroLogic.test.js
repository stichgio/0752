import {
    DEFAULT_POMODORO_SETTINGS,
    applyPomodoroSettings,
    createNextPhaseState,
    createPomodoroState,
    getNextPomodoroPhase,
    resolveRestoredPomodoroState,
} from './pomodoroLogic';

describe('pomodoroLogic', () => {
    it('advances to a long break after the fourth completed pomodoro', () => {
        expect(getNextPomodoroPhase('work', 2)).toEqual({
            mode: 'short',
            completedPomodoros: 3,
        });

        expect(getNextPomodoroPhase('work', 3)).toEqual({
            mode: 'long',
            completedPomodoros: 4,
        });

        expect(getNextPomodoroPhase('long', 4)).toEqual({
            mode: 'work',
            completedPomodoros: 0,
        });
    });

    it('keeps the running timeline aligned after reloads and elapsed phases', () => {
        const now = new Date('2026-03-09T16:00:00.000Z').getTime();
        const restored = resolveRestoredPomodoroState({
            mode: 'work',
            status: 'running',
            endTime: now - (8 * 60 * 1000),
            remainingSeconds: 25 * 60,
            completedPomodoros: 0,
            settings: DEFAULT_POMODORO_SETTINGS,
        }, now);

        expect(restored.mode).toBe('work');
        expect(restored.status).toBe('running');
        expect(restored.completedPomodoros).toBe(1);
        expect(restored.remainingSeconds).toBe(22 * 60);
    });

    it('applies new idle settings immediately and defers running changes to the next phase', () => {
        const idleState = createPomodoroState({
            mode: 'work',
            status: 'idle',
            settings: DEFAULT_POMODORO_SETTINGS,
        });

        expect(applyPomodoroSettings(idleState, { workMinutes: 30 })).toMatchObject({
            mode: 'work',
            status: 'idle',
            remainingSeconds: 30 * 60,
        });

        const runningState = createPomodoroState({
            mode: 'work',
            status: 'running',
            remainingSeconds: 18 * 60,
            endTime: 123456789,
            settings: DEFAULT_POMODORO_SETTINGS,
        });

        expect(applyPomodoroSettings(runningState, { workMinutes: 20 })).toMatchObject({
            mode: 'work',
            status: 'running',
            remainingSeconds: 18 * 60,
            endTime: 123456789,
        });
    });

    it('can advance to the next phase without auto-starting when restoring a finished timer', () => {
        const nextState = createNextPhaseState({
            mode: 'work',
            status: 'idle',
            remainingSeconds: 0,
            completedPomodoros: 0,
            settings: DEFAULT_POMODORO_SETTINGS,
        }, {
            autoStart: false,
            now: 1000,
        });

        expect(nextState).toMatchObject({
            mode: 'short',
            status: 'idle',
            remainingSeconds: 5 * 60,
            endTime: null,
            completedPomodoros: 1,
        });
    });
});
