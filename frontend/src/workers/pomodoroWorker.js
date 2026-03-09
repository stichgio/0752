let timeoutId = null;
let activeEndTime = null;

const clearTimer = () => {
    if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }
};

const scheduleNextTick = () => {
    clearTimer();

    if (!Number.isFinite(activeEndTime)) {
        activeEndTime = null;
        return;
    }

    const now = Date.now();
    const remainingMilliseconds = Math.max(0, activeEndTime - now);
    const remainingSeconds = Math.ceil(remainingMilliseconds / 1000);

    self.postMessage({
        type: 'tick',
        remainingSeconds,
    });

    if (remainingMilliseconds <= 0) {
        activeEndTime = null;
        self.postMessage({ type: 'done' });
        return;
    }

    const nextDelay = Math.max(
        50,
        remainingMilliseconds - ((remainingSeconds - 1) * 1000)
    );

    timeoutId = setTimeout(scheduleNextTick, nextDelay);
};

self.onmessage = (event) => {
    const { type, endTime } = event.data;

    if (type === 'start') {
        activeEndTime = Number(endTime);
        scheduleNextTick();
        return;
    }

    if (type === 'stop') {
        activeEndTime = null;
        clearTimer();
    }
};
