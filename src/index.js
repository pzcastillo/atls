require('dotenv').config();
const express = require('express');
const auditRoutes = require('./routes/auditRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

// Middlewares
const requestLogger = require('./middleware/requestLogger');
const auth = require('./middleware/auth');
const tenantContext = require('./middleware/tenantContext');

const app = express();

app.use(express.json({ limit: '10mb' })); // allow reasonably large batches

// Global logging (before any routes)
app.use(requestLogger);

// Public health check (no auth needed)
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'ATLS' }));

// Protected audit routes: auth → tenant context → routes
app.use('/audit', auth, tenantContext, auditRoutes);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`Audit Trail Logs Service running on port ${PORT}`);
});