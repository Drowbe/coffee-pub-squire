import { MODULE, SQUIRE } from './const.js';

const moduleTimeouts = new Set();
const moduleIntervals = new Set();

export function trackModuleTimeout(callback, delay = 0, ...args) {
    const timeoutId = setTimeout((...cbArgs) => {
        moduleTimeouts.delete(timeoutId);
        callback?.(...cbArgs);
    }, delay, ...args);

    moduleTimeouts.add(timeoutId);
    return timeoutId;
}

export function trackModuleInterval(callback, delay = 0, ...args) {
    const intervalId = setInterval(callback, delay, ...args);
    moduleIntervals.add(intervalId);
    return intervalId;
}

export function registerTimeoutId(timeoutId) {
    if (timeoutId === undefined || timeoutId === null) {
        return;
    }
    moduleTimeouts.add(timeoutId);
}

export function registerIntervalId(intervalId) {
    if (intervalId === undefined || intervalId === null) {
        return;
    }
    moduleIntervals.add(intervalId);
}

export function clearTrackedTimeout(timeoutId) {
    if (timeoutId === undefined || timeoutId === null) {
        return;
    }

    clearTimeout(timeoutId);
    moduleTimeouts.delete(timeoutId);
}

export function clearTrackedInterval(intervalId) {
    if (intervalId === undefined || intervalId === null) {
        return;
    }

    clearInterval(intervalId);
    moduleIntervals.delete(intervalId);
}

export function moduleDelay(delay = 0) {
    return new Promise(resolve => {
        trackModuleTimeout(() => resolve(true), delay);
    });
}

export function clearAllModuleTimers() {
    moduleTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
    });
    moduleTimeouts.clear();

    moduleIntervals.forEach(intervalId => {
        clearInterval(intervalId);
    });
    moduleIntervals.clear();
}

