Audit Trail Logs Service (ATLS) – README
    A centralized, multi-tenant microservice for capturing, storing, managing, and retrieving audit logs from various applications and services.
    Built with Node.js + Express and PostgreSQL, with strong focus on security (multi-tenancy via RLS), performance (indexed queries, pagination), and offline sync support (idempotent batch inserts).

# Features
    Batch logging via REST API (POST /audit/logs/batch)
    Flexible retrieval endpoints:
        GET /audit/logs/user/:emp_id
        GET /audit/logs/app/:source_app
        GET /audit/logs/search (advanced filtering)
    Multi-tenant isolation (application-level + PostgreSQL Row-Level Security)
    Idempotent inserts (safe retries for offline clients)
    Pagination + total count
    JSONB metadata storage with GIN indexing
    Swagger/OpenAPI documentation at /api-docs

# Prerequisites
    Node.js ≥ 18
    PostgreSQL ≥ 12 (local, Docker, or hosted like Neon/Supabase)
    npm or yarn

Setup on Another Device
1. Clone the repository
    git clone <your-repo-url>
    cd audit-trail-service
2. Install dependencies
    npm install
    //or
    yarn install
3. In .env file, replace 'yourpassword' with actual PostgreSQL password.
4. Set up PostgreSQL database
    Option A: Local PostgreSQL
        1. Make sure PostgreSQL is running
        2. Create the database:
            createdb audit_trail_db
        or from psql:
            CREATE DATABASE audit_trail_db;
    Option B: Docker (recommended for clean setup)
        docker run --name atls-postgres \
        -e POSTGRES_PASSWORD=your_password \
        -e POSTGRES_DB=audit_trail_db \
        -p 5432:5432 \
        -d postgres:16
5. Run database migrations to create the table, indexes, constraints and RLS policy.
    npm run migrate
6. Start the server
    Development mode (with auto-restart):
        npm run dev
    Production mode:
        npm start
    You should see:
        Audit Trail Logs Service running on port 3005
8. Access the API
    Health check: http://localhost:3005/health
    Interactive docs (Swagger UI): http://localhost:3005/api-docs
    Test endpoints with Postman / curl / Swagger (use x-api-key header)
9. Verify database
    Connect to psql:
        psql -U postgres -d audit_trail_db
    Check table:
        \d tbl_audit_trail_logs
        SELECT * FROM tbl_audit_trail_logs LIMIT 5;

Troubleshooting
    Connection refused → PostgreSQL not running or wrong DATABASE_URL
    Authentication failed → Wrong password in DATABASE_URL
    Table not found → Run npm run migrate
    401 Unauthorized → Missing or wrong x-api-key header
    Empty results with RLS → Make sure tenant context middleware is running and currentCompCode is set correctly