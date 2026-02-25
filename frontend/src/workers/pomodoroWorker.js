let intervalId = null;

self.onmessage = function (e) {
    const { type } = e.data;

    if (type === 'start') {
        if (intervalId !== null) {
            clearInterval(intervalId);
        }
        intervalId = setInterval(() => {
            self.postMessage({ type: 'tick' });
        }, 500);
    }

    if (type === 'stop') {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }
};
