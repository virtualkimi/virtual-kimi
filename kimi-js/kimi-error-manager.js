// ===== KIMI ERROR MANAGEMENT SYSTEM =====
class KimiErrorManager {
    constructor() {
        this.errorLog = [];
        this.maxLogSize = 100;
        this.errorHandlers = new Map();
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        // Handle unhandled promise rejections
        window.addEventListener("unhandledrejection", event => {
            this.logError("UnhandledPromiseRejection", event.reason, {
                promise: event.promise,
                timestamp: new Date().toISOString()
            });
            event.preventDefault();
        });

        // Handle JavaScript errors
        window.addEventListener("error", event => {
            this.logError("JavaScriptError", event.error || event.message, {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: new Date().toISOString()
            });
        });
    }

    logError(type, error, context = {}) {
        const errorEntry = {
            id: this.generateErrorId(),
            type,
            message: error?.message || error,
            stack: error?.stack,
            context,
            timestamp: new Date().toISOString(),
            severity: this.determineSeverity(type, error)
        };

        this.errorLog.push(errorEntry);

        // Keep log size manageable
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }

        // Console logging with appropriate level
        this.consoleLog(errorEntry);

        // Trigger registered handlers
        this.triggerHandlers(errorEntry);

        return errorEntry.id;
    }

    generateErrorId() {
        return "err_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    }

    determineSeverity(type, error) {
        const criticalTypes = ["UnhandledPromiseRejection", "DatabaseError", "InitializationError"];
        const criticalMessages = ["failed to fetch", "network error", "connection refused"];

        if (criticalTypes.includes(type)) return "critical";

        const message = (error?.message || error || "").toLowerCase();
        if (criticalMessages.some(cm => message.includes(cm))) return "critical";

        return "warning";
    }

    consoleLog(errorEntry) {
        const { type, message, severity, context } = errorEntry;

        switch (severity) {
            case "critical":
                console.error(`🚨 [${type}]`, message, context);
                break;
            case "warning":
                console.warn(`⚠️ [${type}]`, message, context);
                break;
            default:
                console.info(`ℹ️ [${type}]`, message, context);
        }
    }

    triggerHandlers(errorEntry) {
        const handlers = this.errorHandlers.get(errorEntry.type) || [];
        handlers.forEach(handler => {
            try {
                handler(errorEntry);
            } catch (handlerError) {
                console.error("Error in error handler:", handlerError);
            }
        });
    }

    registerHandler(errorType, handler) {
        if (!this.errorHandlers.has(errorType)) {
            this.errorHandlers.set(errorType, []);
        }
        this.errorHandlers.get(errorType).push(handler);
    }

    unregisterHandler(errorType, handler) {
        const handlers = this.errorHandlers.get(errorType);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    getErrorLog(filter = null) {
        if (!filter) return [...this.errorLog];

        return this.errorLog.filter(entry => {
            if (filter.type && entry.type !== filter.type) return false;
            if (filter.severity && entry.severity !== filter.severity) return false;
            if (filter.since && new Date(entry.timestamp) < filter.since) return false;
            return true;
        });
    }

    clearErrorLog() {
        this.errorLog.length = 0;
    }

    // Helper methods for different error types
    logInitError(component, error, context = {}) {
        return this.logError("InitializationError", error, { component, ...context });
    }

    logDatabaseError(operation, error, context = {}) {
        return this.logError("DatabaseError", error, { operation, ...context });
    }

    logAPIError(endpoint, error, context = {}) {
        return this.logError("APIError", error, { endpoint, ...context });
    }

    logValidationError(field, error, context = {}) {
        return this.logError("ValidationError", error, { field, ...context });
    }

    logUIError(component, error, context = {}) {
        return this.logError("UIError", error, { component, ...context });
    }

    // Async wrapper for functions
    async wrapAsync(fn, errorContext = {}) {
        try {
            return await fn();
        } catch (error) {
            this.logError("AsyncOperationError", error, errorContext);
            throw error;
        }
    }

    // Sync wrapper for functions
    wrapSync(fn, errorContext = {}) {
        try {
            return fn();
        } catch (error) {
            this.logError("SyncOperationError", error, errorContext);
            throw error;
        }
    }

    // Debug helpers for development
    getErrorSummary() {
        const summary = {
            totalErrors: this.errorLog.length,
            critical: this.errorLog.filter(e => e.severity === "critical").length,
            warning: this.errorLog.filter(e => e.severity === "warning").length,
            recent: this.errorLog.filter(e => {
                const errorTime = new Date(e.timestamp);
                const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                return errorTime > fiveMinutesAgo;
            }).length,
            types: [...new Set(this.errorLog.map(e => e.type))]
        };
        return summary;
    }

    printErrorSummary() {
        const summary = this.getErrorSummary();
        console.group("🔍 Kimi Error Manager Summary");
        console.log(`📊 Total Errors: ${summary.totalErrors}`);
        console.log(`🚨 Critical: ${summary.critical}`);
        console.log(`⚠️ Warnings: ${summary.warning}`);
        console.log(`⏰ Recent (5min): ${summary.recent}`);
        console.log(`📋 Error Types:`, summary.types);
        if (summary.totalErrors > 0) {
            console.log(`💡 Use kimiErrorManager.getErrorLog() to see details`);
        }
        console.groupEnd();
        return summary;
    }

    clearAndSummarize() {
        const summary = this.getErrorSummary();
        this.clearErrorLog();
        console.log("🧹 Error log cleared. Previous summary:", summary);
        return summary;
    }
}

// Create global instance
window.kimiErrorManager = new KimiErrorManager();

// Export class for manual instantiation if needed
window.KimiErrorManager = KimiErrorManager;

// Global debugging helper
window.kimiDebugErrors = () => window.kimiErrorManager.printErrorSummary();
