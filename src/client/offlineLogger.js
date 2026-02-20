// src/client/offline-logger.js
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class OfflineLogger {
    constructor(baseURL = 'http://localhost:3005', apiKey) {
        this.baseURL = baseURL;
        this.apiKey = apiKey;
        this.queue = [];           // local offline queue
        this.isSyncing = false;
    }

    // Call this from your mobile/web app whenever an event happens
    log(event) {
        const logEntry = {
            ...event,
            process_id: event.process_id || uuidv4(),   // unique per log attempt
            created_at: event.created_at || new Date().toISOString(),
        };

        this.queue.push(logEntry);
        console.log(`[OfflineLogger] Queued: ${event.action} (process_id: ${logEntry.process_id})`);

        // Auto-sync if online (you can also call sync() manually)
        this.sync();
    }

    // Sync all queued logs to server
    async sync() {
        if (this.queue.length === 0 || this.isSyncing) return;

        this.isSyncing = true;
        const batch = [...this.queue]; // copy

        try {
            const payload = {
                comp_code: "COMP001",           // change dynamically in real app
                created_by: "MOBILE_USER",
                app_version: "1.2.3",
                logs: batch,
            };

            const response = await axios.post(`${this.baseURL}/audit/logs/batch`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                },
            });

            console.log(`[OfflineLogger] Sync successful! ${response.data.total_received} logs stored.`);

            // Clear only the logs that were sent
            this.queue = this.queue.filter(log => !batch.some(b => b.process_id === log.process_id));

        } catch (error) {
            console.error('[OfflineLogger] Sync failed, will retry later:', error.message);
            // Queue remains intact → retry on next call
        } finally {
            this.isSyncing = false;
        }
    }

    // Call this when app comes back online (e.g. network change listener)
    async forceSync() {
        await this.sync();
    }
}

// ==================== USAGE EXAMPLE ====================

const logger = new OfflineLogger(
    'http://localhost:3005',
    'super-secret-key-comp001-2026'   // ← your real key
);

// Simulate offline events
logger.log({
    emp_id: "EMP123",
    source_app: "MOBILE_APP",
    source_function: "CHECK_IN",
    action: "CHECK_IN_SUCCESS",
    description: "User checked in at office",
    metadata: { location: "Quezon City", lat: 14.676, lng: 121.043 }
});

logger.log({
    source_app: "MOBILE_APP",
    action: "SUBMIT_LEAVE",
    description: "Leave request submitted offline",
    metadata: { days: 3 }
});

// Simulate coming back online
setTimeout(() => logger.forceSync(), 4000);