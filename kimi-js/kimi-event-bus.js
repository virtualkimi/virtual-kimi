// Simple lightweight event bus with optional debug buffer
(function () {
    const listeners = new Map(); // event -> Set<fn>
    const debugBuffer = [];
    const MAX_DEBUG = 300;
    let debugEnabled = false;

    function on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(handler);
        return () => off(event, handler);
    }
    function once(event, handler) {
        const wrap = payload => {
            off(event, wrap);
            try {
                handler(payload);
            } catch (e) {
                console.error(e);
            }
        };
        return on(event, wrap);
    }
    function off(event, handler) {
        const set = listeners.get(event);
        if (set) {
            set.delete(handler);
            if (set.size === 0) listeners.delete(event);
        }
    }
    function emit(event, payload) {
        if (debugEnabled) {
            debugBuffer.push({ ts: Date.now(), event, payload });
            if (debugBuffer.length > MAX_DEBUG) debugBuffer.shift();
        }
        const set = listeners.get(event);
        if (set) {
            for (const h of [...set]) {
                try {
                    h(payload);
                } catch (e) {
                    console.error("Event handler error", event, e);
                }
            }
        }
    }
    function enableDebug(v = true) {
        debugEnabled = !!v;
    }
    function getDebug() {
        return debugBuffer.slice();
    }

    window.kimiEventBus = { on, once, off, emit, enableDebug, getDebug };
})();
