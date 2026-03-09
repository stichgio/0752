export const POMODORO_STORAGE_KEY = 'pomodoro-state';

export const DEFAULT_POMODORO_SETTINGS = Object.freeze({
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    soundEnabled: true,
    notificationsEnabled: false,
});

export const MODE_LABELS = Object.freeze({
    work: 'WORK',
    short: 'SHRT',
    long: 'LONG',
});

const MODE_TO_SETTING_KEY = Object.freeze({
    work: 'workMinutes',
    short: 'shortBreakMinutes',
    long: 'longBreakMinutes',
});

const VALID_MODES = new Set(Object.keys(MODE_TO_SETTING_KEY));
const VALID_STATUSES = new Set(['idle', 'running', 'paused']);
const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toRoundedNumber = (value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? Math.round(numericValue) : null;
};

const normalizeDuration = (value, fallback) => {
    const roundedValue = toRoundedNumber(value);
    if (roundedValue === null) {
        return fallback;
    }

    return clamp(roundedValue, MIN_DURATION_MINUTES, MAX_DURATION_MINUTES);
};

export const normalizePomodoroSettings = (settings = {}) => ({
    workMinutes: normalizeDuration(settings.workMinutes, DEFAULT_POMODORO_SETTINGS.workMinutes),
    shortBreakMinutes: normalizeDuration(settings.shortBreakMinutes, DEFAULT_POMODORO_SETTINGS.shortBreakMinutes),
    longBreakMinutes: normalizeDuration(settings.longBreakMinutes, DEFAULT_POMODORO_SETTINGS.longBreakMinutes),
    soundEnabled: settings.soundEnabled !== false,
    notificationsEnabled: settings.notificationsEnabled === true,
});

export const getModeDurationSeconds = (mode, settings = DEFAULT_POMODORO_SETTINGS) => {
    const normalizedSettings = normalizePomodoroSettings(settings);
    const durationKey = MODE_TO_SETTING_KEY[mode] ?? MODE_TO_SETTING_KEY.work;
    return normalizedSettings[durationKey] * 60;
};

export const getPomodoroStatusLabel = (status) => {
    if (status === 'running') return 'RUNNING';
    if (status === 'paused') return 'PAUSED';
    return 'IDLE';
};

export const getPomodoroActionLabel = (status) => {
    if (status === 'running') return 'Pause';
    if (status === 'paused') return 'Resume';
    return 'Start';
};

export const normalizeCompletedPomodoros = (value) => {
    const roundedValue = toRoundedNumber(value);
    if (roundedValue === null) {
        return 0;
    }

    return clamp(roundedValue, 0, 4);
};

const normalizeMode = (mode) => (VALID_MODES.has(mode) ? mode : 'work');

const normalizeStatus = (status, isActive) => {
    if (VALID_STATUSES.has(status)) {
        return status;
    }

    return isActive ? 'running' : 'idle';
};

export const createPomodoroState = ({
    mode = 'work',
    status = 'idle',
    remainingSeconds,
    endTime = null,
    completedPomodoros = 0,
    settings = DEFAULT_POMODORO_SETTINGS,
}) => {
    const normalizedSettings = normalizePomodoroSettings(settings);
    const normalizedMode = normalizeMode(mode);
    const durationSeconds = getModeDurationSeconds(normalizedMode, normalizedSettings);
    const resolvedRemainingSeconds = remainingSeconds == null
        ? durationSeconds
        : clamp(toRoundedNumber(remainingSeconds) ?? durationSeconds, 0, durationSeconds);

    return {
        mode: normalizedMode,
        status: normalizeStatus(status, false),
        remainingSeconds: resolvedRemainingSeconds,
        endTime: Number.isFinite(endTime) ? endTime : null,
        completedPomodoros: normalizeCompletedPomodoros(completedPomodoros),
        settings: normalizedSettings,
    };
};

export const getNextPomodoroPhase = (mode, completedPomodoros = 0) => {
    const normalizedMode = normalizeMode(mode);
    const normalizedCompletedPomodoros = normalizeCompletedPomodoros(completedPomodoros);

    if (normalizedMode === 'work') {
        const nextCompletedPomodoros = clamp(normalizedCompletedPomodoros + 1, 0, 4);
        if (nextCompletedPomodoros >= 4) {
            return {
                mode: 'long',
                completedPomodoros: 4,
            };
        }

        return {
            mode: 'short',
            completedPomodoros: nextCompletedPomodoros,
        };
    }

    if (normalizedMode === 'long') {
        return {
            mode: 'work',
            completedPomodoros: 0,
        };
    }

    return {
        mode: 'work',
        completedPomodoros: normalizedCompletedPomodoros,
    };
};

export const createNextPhaseState = (state, options = {}) => {
    const normalizedState = createPomodoroState(state);
    const { autoStart = true, now = Date.now() } = options;
    const nextPhase = getNextPomodoroPhase(normalizedState.mode, normalizedState.completedPomodoros);
    const nextDurationSeconds = getModeDurationSeconds(nextPhase.mode, normalizedState.settings);

    return createPomodoroState({
        ...normalizedState,
        mode: nextPhase.mode,
        status: autoStart ? 'running' : 'idle',
        remainingSeconds: nextDurationSeconds,
        endTime: autoStart ? now + (nextDurationSeconds * 1000) : null,
        completedPomodoros: nextPhase.completedPomodoros,
    });
};

export const applyPomodoroSettings = (state, partialSettings) => {
    const normalizedState = createPomodoroState(state);
    const nextSettings = normalizePomodoroSettings({
        ...normalizedState.settings,
        ...partialSettings,
    });

    const nextDurationSeconds = getModeDurationSeconds(normalizedState.mode, nextSettings);
    let nextRemainingSeconds = normalizedState.remainingSeconds;
    let nextEndTime = normalizedState.endTime;

    if (normalizedState.status === 'idle') {
        nextRemainingSeconds = nextDurationSeconds;
        nextEndTime = null;
    } else if (normalizedState.status === 'paused') {
        nextRemainingSeconds = Math.min(normalizedState.remainingSeconds, nextDurationSeconds);
        nextEndTime = null;
    }

    return createPomodoroState({
        ...normalizedState,
        settings: nextSettings,
        remainingSeconds: nextRemainingSeconds,
        endTime: nextEndTime,
    });
};

export const buildPhaseNotification = (completedMode, nextState) => {
    const nextModeLabel = MODE_LABELS[nextState.mode] ?? MODE_LABELS.work;
    const completedModeLabel = MODE_LABELS[normalizeMode(completedMode)] ?? MODE_LABELS.work;

    if (completedMode === 'work') {
        return {
            title: 'Pomodoro completado',
            body: `Sesion ${nextState.completedPomodoros}/4 lista. Sigue ${nextModeLabel}.`,
        };
    }

    return {
        title: `${completedModeLabel} completado`,
        body: `Sigue ${nextModeLabel}.`,
    };
};

export const resolveRestoredPomodoroState = (savedState, now = Date.now()) => {
    const settings = normalizePomodoroSettings(savedState?.settings);
    const mode = normalizeMode(savedState?.mode);
    const durationSeconds = getModeDurationSeconds(mode, settings);
    const completedPomodoros = normalizeCompletedPomodoros(savedState?.completedPomodoros);
    const rawRemainingSeconds = toRoundedNumber(savedState?.remainingSeconds);
    const isActive = savedState?.isActive === true;
    const initialStatus = normalizeStatus(savedState?.status, isActive);
    const savedEndTime = Number(savedState?.endTime);

    const remainingSeconds = rawRemainingSeconds == null
        ? durationSeconds
        : clamp(rawRemainingSeconds, 0, durationSeconds);

    if (initialStatus === 'running') {
        let activeMode = mode;
        let activeCompletedPomodoros = completedPomodoros;
        let activeEndTime = Number.isFinite(savedEndTime)
            ? savedEndTime
            : now + (remainingSeconds * 1000);
        let guard = 0;

        while (activeEndTime <= now && guard < 512) {
            const nextPhase = getNextPomodoroPhase(activeMode, activeCompletedPomodoros);
            activeMode = nextPhase.mode;
            activeCompletedPomodoros = nextPhase.completedPomodoros;
            activeEndTime += getModeDurationSeconds(activeMode, settings) * 1000;
            guard += 1;
        }

        return createPomodoroState({
            mode: activeMode,
            status: 'running',
            remainingSeconds: Math.max(0, Math.ceil((activeEndTime - now) / 1000)),
            endTime: activeEndTime,
            completedPomodoros: activeCompletedPomodoros,
            settings,
        });
    }

    if (remainingSeconds === 0) {
        return createNextPhaseState({
            mode,
            status: 'idle',
            remainingSeconds,
            endTime: null,
            completedPomodoros,
            settings,
        }, {
            autoStart: false,
            now,
        });
    }

    const resolvedStatus = initialStatus === 'paused'
        ? 'paused'
        : remainingSeconds === durationSeconds
            ? 'idle'
            : 'paused';

    return createPomodoroState({
        mode,
        status: resolvedStatus,
        remainingSeconds,
        endTime: null,
        completedPomodoros,
        settings,
    });
};
