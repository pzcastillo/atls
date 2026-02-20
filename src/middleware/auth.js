// src/middleware/auth.js
require('dotenv').config();
const apiKeys = JSON.parse(process.env.API_KEYS || '{}');

module.exports = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    let comp_code;

    // For POST: from body
    if (req.method === 'POST') {
        comp_code = req.body.comp_code;
    }
    // For GET: from query (all your GETs require comp_code)
    else if (req.method === 'GET') {
        comp_code = req.query.comp_code;
    }

    if (!comp_code) {
        return res.status(400).json({
            success: false,
            message: 'comp_code is required for multi-tenant access',
        });
    }

    if (!apiKey || apiKeys[comp_code] !== apiKey) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized – invalid or missing API key for this company',
        });
    }

    // Optional: attach to req for logging later
    req.currentCompCode = comp_code;
    console.log('[auth] Set currentCompCode to:', req.currentCompCode);
    next();
};