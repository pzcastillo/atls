const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const auditService = require('../services/auditService');

const router = express.Router();

// ────────────────────────────────────────────────
// Zod Schemas
// ────────────────────────────────────────────────

// Single log entry schema
const logSchema = z.object({
    emp_id: z.string().max(50).optional(),
    process_id: z.string().max(100).optional(), // auto-generated if missing
    source_app: z.string().max(100),
    source_function: z.string().max(150).optional(),
    reference_id: z.string().max(150).optional(),
    action: z.string().max(100),
    description: z.string().optional(),
    created_at: z.string().datetime({ offset: true }).optional(), // ISO 8601
    metadata: z.any()
        .transform((val) => {
            if (val === null || val === undefined) return {};
            if (typeof val === 'object' && !Array.isArray(val)) return val;
            if (typeof val === 'string') {
                try {
                    const parsed = JSON.parse(val);
                    if (typeof parsed === 'object' && parsed !== null) return parsed;
                } catch {
                    // silent fallback
                }
                return {};
            }
            return {};
        })
        .optional()
        .default({}),
}).strict();

// Batch payload schema
const batchSchema = z.object({
    comp_code: z.string().max(50).min(1),
    app_version: z.string().max(20).optional(),
    created_by: z.string().max(50).default('SYSTEM'),
    logs: z.array(logSchema).min(1).max(1000),
}).strict();

// Common query params schema
const querySchema = z.object({
    comp_code: z.string().max(50).min(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
}).strict();

// ────────────────────────────────────────────────
// POST /audit/logs/batch
// ────────────────────────────────────────────────
/**
 * @swagger
 * /audit/logs/batch:
 *   post:
 *     summary: Upload a batch of audit logs
 *     description: Allows microservices or clients to send multiple audit log entries in a single request. Supports idempotency via process_id.
 *     tags: [Audit Logs]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comp_code
 *               - logs
 *             properties:
 *               comp_code:
 *                 type: string
 *                 example: COMP001
 *                 description: Company/tenant identifier
 *               app_version:
 *                 type: string
 *                 example: 1.0.5
 *                 nullable: true
 *               created_by:
 *                 type: string
 *                 example: SYSTEM
 *                 default: SYSTEM
 *               logs:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 1000
 *                 items:
 *                   type: object
 *                   required:
 *                     - source_app
 *                     - action
 *                   properties:
 *                     emp_id:
 *                       type: string
 *                       maxLength: 50
 *                       nullable: true
 *                     process_id:
 *                       type: string
 *                       maxLength: 100
 *                       nullable: true
 *                     source_app:
 *                       type: string
 *                       maxLength: 100
 *                     source_function:
 *                       type: string
 *                       maxLength: 150
 *                       nullable: true
 *                     reference_id:
 *                       type: string
 *                       maxLength: 150
 *                       nullable: true
 *                     action:
 *                       type: string
 *                       maxLength: 100
 *                     description:
 *                       type: string
 *                       nullable: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     metadata:
 *                       type: object
 *                       additionalProperties: true
 *                       nullable: true
 *     responses:
 *       201:
 *         description: Logs successfully stored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 total_received:
 *                   type: integer
 *                 batch_id:
 *                   type: string
 *       400:
 *         description: Invalid payload or validation error
 *       401:
 *         description: Unauthorized (invalid/missing API key)
 *       500:
 *         description: Server error during storage
 */

// ────────────────────────────────────────────────
// POST /audit/logs/batch
// ────────────────────────────────────────────────
router.post('/logs/batch', async (req, res) => {
    let validated;

    try {
        validated = batchSchema.parse(req.body);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: err.errors.map(e => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            });
        }
        return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    if (!req.dbClient) {
        return res.status(500).json({ success: false, message: 'Database client not available' });
    }

    try {
        const result = await auditService.storeBatchLogs(req.dbClient, validated);
        res.status(201).json({
            success: true,
            message: 'Logs successfully stored',
            total_received: result.total_received,
            batch_id: result.batch_id,
        });
    } catch (err) {
        console.error('Batch insert failed:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to store logs',
            error: process.env.NODE_ENV === 'development' ? err.message : undefined,
        });
    }
});

// ────────────────────────────────────────────────
// GET /audit/logs/user/:emp_id
// ────────────────────────────────────────────────
/**
 * @swagger
 * /audit/logs/user/{emp_id}:
 *   get:
 *     summary: Retrieve audit logs for a specific employee
 *     description: Returns paginated logs filtered by employee ID, company, date range, etc.
 *     tags: [Audit Logs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: emp_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Employee ID
 *       - in: query
 *         name: comp_code
 *         required: true
 *         schema:
 *           type: string
 *         description: Company/tenant code
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *         description: Number of logs per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Skip this many logs (for pagination)
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date (ISO 8601)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date (ISO 8601)
 *     responses:
 *       200:
 *         description: Paginated logs for the employee
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 total_count:
 *                   type: integer
 *                 total_returned:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Query failed
 */

// ────────────────────────────────────────────────
// GET /audit/logs/user/:emp_id
// ────────────────────────────────────────────────
router.get('/logs/user/:emp_id', async (req, res) => {
    let validatedQuery;

    try {
        validatedQuery = querySchema.parse(req.query);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid query parameters',
                errors: err.errors.map(e => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            });
        }
        return res.status(400).json({ success: false, message: 'Bad request' });
    }

    if (!req.dbClient) {
        return res.status(500).json({ success: false, message: 'Database client not available' });
    }

    const { emp_id } = req.params;
    const filters = { ...validatedQuery, emp_id };

    try {
        const { rows, total_count } = await auditService.getUserLogs(req.dbClient, filters);
        res.json({
            success: true,
            data: rows,
            total_count,
            total_returned: rows.length,
            limit: filters.limit,
            offset: filters.offset,
        });
    } catch (err) {
        console.error('User logs query failed:', err);
        res.status(500).json({ success: false, message: 'Query failed' });
    }
});

// ────────────────────────────────────────────────
// GET /audit/logs/app/:source_app
// ────────────────────────────────────────────────
/**
 * @swagger
 * /audit/logs/app/{source_app}:
 *   get:
 *     summary: Retrieve audit logs for a specific application
 *     description: Returns paginated logs filtered by source application, company, function, date range, etc.
 *     tags: [Audit Logs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: source_app
 *         required: true
 *         schema:
 *           type: string
 *         description: Source application name (e.g., MOBILE_APP)
 *       - in: query
 *         name: comp_code
 *         required: true
 *         schema:
 *           type: string
 *         description: Company/tenant code
 *       - in: query
 *         name: source_function
 *         schema:
 *           type: string
 *         description: Optional source function/module
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *         description: Number of logs per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Skip this many logs
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date (ISO 8601)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date (ISO 8601)
 *     responses:
 *       200:
 *         description: Paginated logs for the application
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 total_count:
 *                   type: integer
 *                 total_returned:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Query failed
 */

// ────────────────────────────────────────────────
// GET /audit/logs/app/:source_app
// ────────────────────────────────────────────────
router.get('/logs/app/:source_app', async (req, res) => {
    let validatedQuery;

    try {
        validatedQuery = querySchema.parse(req.query);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid query parameters',
                errors: err.errors.map(e => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            });
        }
        return res.status(400).json({ success: false, message: 'Bad request' });
    }

    if (!req.dbClient) {
        return res.status(500).json({ success: false, message: 'Database client not available' });
    }

    const { source_app } = req.params;
    const filters = { ...validatedQuery, source_app, source_function: req.query.source_function };

    try {
        const { rows, total_count } = await auditService.getAppLogs(req.dbClient, filters);
        res.json({
            success: true,
            data: rows,
            total_count,
            total_returned: rows.length,
            limit: filters.limit,
            offset: filters.offset,
        });
    } catch (err) {
        console.error('App logs query failed:', err);
        res.status(500).json({ success: false, message: 'Query failed' });
    }
});

// ────────────────────────────────────────────────
// GET /audit/logs/search
// ────────────────────────────────────────────────
/**
 * @swagger
 * /audit/logs/search:
 *   get:
 *     summary: Flexible search for audit logs
 *     description: Advanced search with multiple filters (source_app, function, reference, created_by, action, metadata, date range)
 *     tags: [Audit Logs]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: comp_code
 *         required: true
 *         schema:
 *           type: string
 *         description: Company/tenant code
 *       - in: query
 *         name: source_app
 *         schema:
 *           type: string
 *         description: Source application name
 *       - in: query
 *         name: source_function
 *         schema:
 *           type: string
 *         description: Source function/module
 *       - in: query
 *         name: reference_id
 *         schema:
 *           type: string
 *         description: Related entity ID
 *       - in: query
 *         name: created_by
 *         schema:
 *           type: string
 *         description: User or system who created the log
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Event action (e.g., LOGIN_SUCCESS)
 *       - in: query
 *         name: metadata
 *         schema:
 *           type: string
 *         description: JSONB containment query (stringified JSON, e.g. '{"device":"Android"}')
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *         description: Number of logs per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Skip this many logs
 *     responses:
 *       200:
 *         description: Paginated search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditLog'
 *                 total_count:
 *                   type: integer
 *                 total_returned:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Query failed
 */

// ────────────────────────────────────────────────
// GET /audit/logs/search
// ────────────────────────────────────────────────
router.get('/logs/search', async (req, res) => {
    let validated;

    try {
        const searchSchema = querySchema.extend({
            source_app: z.string().max(100).optional(),
            source_function: z.string().max(150).optional(),
            reference_id: z.string().max(150).optional(),
            created_by: z.string().max(50).optional(),
            action: z.string().max(100).optional(),
            metadata: z.string().optional(),
        });

        validated = searchSchema.parse(req.query);
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                success: false,
                message: 'Invalid query parameters',
                errors: err.errors.map(e => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            });
        }
        return res.status(400).json({ success: false, message: 'Bad request' });
    }

    if (!req.dbClient) {
        return res.status(500).json({ success: false, message: 'Database client not available' });
    }

    try {
        const { rows, total_count } = await auditService.searchLogs(req.dbClient, validated);
        res.json({
            success: true,
            data: rows,
            total_count,
            total_returned: rows.length,
            limit: validated.limit,
            offset: validated.offset,
        });
    } catch (err) {
        console.error('Search query failed:', err);
        res.status(500).json({ success: false, message: 'Query failed' });
    }
});

// ────────────────────────────────────────────────
// Reusable Audit Log schema for Swagger
// ────────────────────────────────────────────────
/**
 * @swagger
 * components:
 *   schemas:
 *     AuditLog:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         process_id:
 *           type: string
 *         comp_code:
 *           type: string
 *         emp_id:
 *           type: string
 *           nullable: true
 *         source_app:
 *           type: string
 *         source_function:
 *           type: string
 *           nullable: true
 *         reference_id:
 *           type: string
 *           nullable: true
 *         action:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *           nullable: true
 *         created_by:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         app_version:
 *           type: string
 *           nullable: true
 *         batch_id:
 *           type: string
 *           nullable: true
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: x-api-key
 */

module.exports = router;