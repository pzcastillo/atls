const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Audit Trail Logs Service (ATLS)',
            version: '1.0.0',
            description: 'Centralized multi-tenant audit logging API',
        },
        servers: [
            {
                url: 'http://localhost:3005',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'API key for authentication',
                },
            },
        },
        security: [{ ApiKeyAuth: [] }],
    },
    apis: ['./src/routes/*.js'], // or wherever your routes are
};

const specs = swaggerJsdoc(options);

module.exports = specs;