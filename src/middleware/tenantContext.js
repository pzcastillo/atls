// src/middleware/tenantContext.js
const db = require('../config/db');

module.exports = async (req, res, next) => {
    console.log('[tenantContext] Incoming comp_code:', req.currentCompCode);

    if (!req.currentCompCode) {
        console.log('[tenantContext] ERROR: No currentCompCode set!');
        return res.status(500).json({ success: false, message: 'Tenant context not set' });
    }

    req.dbClient = await db.getClient();

    try {
        const tenant = req.currentCompCode.replace(/'/g, "''");
        console.log('[tenantContext] Setting tenant to:', tenant);
        await req.dbClient.query(`SET app.current_tenant = '${tenant}'`);

        // Verify immediately
        const check = await req.dbClient.query("SELECT current_setting('app.current_tenant') AS tenant");
        console.log('[tenantContext] Verified setting:', check.rows[0].tenant);

        next();
    } catch (err) {
        req.dbClient.release();
        console.error('[tenantContext] Setup failed:', err);
        res.status(500).json({ success: false, message: 'Tenant setup failed' });
        return;
    }

    res.on('finish', () => {
        if (req.dbClient) req.dbClient.release();
    });
};