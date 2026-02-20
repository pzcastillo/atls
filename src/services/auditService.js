// src/services/auditService.js
const { v4: uuidv4 } = require('uuid');

/**
 * Stores a batch of audit logs in a transaction
 * @param {Object} client - pg client from req.dbClient
 * @param {Object} payload - validated batch payload
 * @returns {Promise<{ batch_id: string, total_received: number }>}
 */
async function storeBatchLogs(client, payload) {
    const { comp_code, app_version, created_by, logs } = payload;
    const batch_id = `BATCH_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${uuidv4().slice(0,8)}`;

    try {
        await client.query('BEGIN');

        for (const log of logs) {
            await client.query(`
                INSERT INTO tbl_audit_trail_logs (
                    process_id, comp_code, emp_id, source_app, source_function,
                    reference_id, action, description, metadata,
                    created_by, created_at, app_version, batch_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (process_id) DO NOTHING
            `, [
                log.process_id || uuidv4(),
                comp_code,
                log.emp_id || null,
                log.source_app,
                log.source_function || null,
                log.reference_id || null,
                log.action,
                log.description || null,
                log.metadata ? JSON.stringify(log.metadata) : '{}',
                created_by,
                log.created_at ? new Date(log.created_at) : new Date(),
                app_version || null,
                batch_id,
            ]);
        }

        await client.query('COMMIT');

        return { batch_id, total_received: logs.length };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err; // let controller handle
    }
}

/**
 * Get logs for a user with pagination & filters
 * @param {Object} client - pg client
 * @param {Object} filters - { comp_code, emp_id, limit, offset, from, to }
 * @returns {Promise<{ rows: any[], total_count: number }>}
 */
async function getUserLogs(client, filters) {
    const { comp_code, emp_id, limit, offset, from, to } = filters;

    // Total count
    let countSql = `SELECT COUNT(*) FROM tbl_audit_trail_logs WHERE comp_code = $1 AND emp_id = $2`;
    const countParams = [comp_code, emp_id];
    let countIdx = 3;
    if (from) { countSql += ` AND created_at >= $${countIdx++}`; countParams.push(new Date(from)); }
    if (to)   { countSql += ` AND created_at <= $${countIdx++}`; countParams.push(new Date(to)); }

    const countRes = await client.query(countSql, countParams);
    const total_count = parseInt(countRes.rows[0].count, 10);

    // Paged data
    let sql = `SELECT * FROM tbl_audit_trail_logs WHERE comp_code = $1 AND emp_id = $2`;
    const params = [comp_code, emp_id];
    let idx = 3;
    if (from) { sql += ` AND created_at >= $${idx++}`; params.push(new Date(from)); }
    if (to)   { sql += ` AND created_at <= $${idx++}`; params.push(new Date(to)); }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(limit, offset);

    const result = await client.query(sql, params);

    return { rows: result.rows, total_count };
}

/**
 * Get logs for an app with pagination & filters
 * @param {Object} client - pg client
 * @param {Object} filters - { comp_code, source_app, source_function?, limit, offset, from, to }
 * @returns {Promise<{ rows: any[], total_count: number }>}
 */
async function getAppLogs(client, filters) {
    const { comp_code, source_app, source_function, limit, offset, from, to } = filters;

    // Total count
    let countSql = `SELECT COUNT(*) FROM tbl_audit_trail_logs WHERE comp_code = $1 AND source_app = $2`;
    const countParams = [comp_code, source_app];
    let countIdx = 3;
    if (source_function) { countSql += ` AND source_function = $${countIdx++}`; countParams.push(source_function); }
    if (from) { countSql += ` AND created_at >= $${countIdx++}`; countParams.push(new Date(from)); }
    if (to)   { countSql += ` AND created_at <= $${countIdx++}`; countParams.push(new Date(to)); }

    const countRes = await client.query(countSql, countParams);
    const total_count = parseInt(countRes.rows[0].count, 10);

    // Paged data
    let sql = `SELECT * FROM tbl_audit_trail_logs WHERE comp_code = $1 AND source_app = $2`;
    const params = [comp_code, source_app];
    let idx = 3;
    if (source_function) { sql += ` AND source_function = $${idx++}`; params.push(source_function); }
    if (from) { sql += ` AND created_at >= $${idx++}`; params.push(new Date(from)); }
    if (to)   { sql += ` AND created_at <= $${idx++}`; params.push(new Date(to)); }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`;
    params.push(limit, offset);

    const result = await client.query(sql, params);

    return { rows: result.rows, total_count };
}

/**
 * Flexible search for logs
 * @param {Object} client - pg client
 * @param {Object} filters - all possible search params
 * @returns {Promise<{ rows: any[], total_count: number }>}
 */
async function searchLogs(client, filters) {
    const { comp_code, limit, offset, from, to, source_app, source_function, reference_id, created_by, action, metadata } = filters;

    // Total count
    let countSql = `SELECT COUNT(*) FROM tbl_audit_trail_logs WHERE comp_code = $1`;
    const countParams = [comp_code];
    let countIdx = 2;

    if (source_app)     { countSql += ` AND source_app = $${countIdx++}`;     countParams.push(source_app); }
    if (source_function) { countSql += ` AND source_function = $${countIdx++}`; countParams.push(source_function); }
    if (reference_id)   { countSql += ` AND reference_id = $${countIdx++}`;   countParams.push(reference_id); }
    if (created_by)     { countSql += ` AND created_by = $${countIdx++}`;     countParams.push(created_by); }
    if (action)         { countSql += ` AND action = $${countIdx++}`;         countParams.push(action); }
    if (from)           { countSql += ` AND created_at >= $${countIdx++}`;    countParams.push(new Date(from)); }
    if (to)             { countSql += ` AND created_at <= $${countIdx++}`;    countParams.push(new Date(to)); }
    if (metadata)       { countSql += ` AND metadata @> $${countIdx++}::jsonb`; countParams.push(metadata); }

    const countRes = await client.query(countSql, countParams);
    const total_count = parseInt(countRes.rows[0].count, 10);

    // Paged data (same conditions)
    let sql = `SELECT * FROM tbl_audit_trail_logs WHERE comp_code = $1`;
    const params = [comp_code];
    let paramIdx = 2;

    if (source_app)     { sql += ` AND source_app = $${paramIdx++}`;     params.push(source_app); }
    if (source_function) { sql += ` AND source_function = $${paramIdx++}`; params.push(source_function); }
    if (reference_id)   { sql += ` AND reference_id = $${paramIdx++}`;   params.push(reference_id); }
    if (created_by)     { sql += ` AND created_by = $${paramIdx++}`;     params.push(created_by); }
    if (action)         { sql += ` AND action = $${paramIdx++}`;         params.push(action); }
    if (from)           { sql += ` AND created_at >= $${paramIdx++}`;    params.push(new Date(from)); }
    if (to)             { sql += ` AND created_at <= $${paramIdx++}`;    params.push(new Date(to)); }
    if (metadata)       { sql += ` AND metadata @> $${paramIdx++}::jsonb`; params.push(metadata); }

    sql += ` ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const result = await client.query(sql, params);

    return { rows: result.rows, total_count };
}

module.exports = {
    storeBatchLogs,
    getUserLogs,
    getAppLogs,
    searchLogs,
};