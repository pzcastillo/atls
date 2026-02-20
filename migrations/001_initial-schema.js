exports.up = (pgm) => {
    pgm.createTable('tbl_audit_trail_logs', {
        id: 'bigserial primary key',
        process_id: { type: 'varchar(100)', notNull: true, unique: true },
        comp_code: { type: 'varchar(50)', notNull: true },
        emp_id: 'varchar(50)',
        source_app: { type: 'varchar(100)', notNull: true },
        source_function: 'varchar(150)',
        reference_id: 'varchar(150)',
        action: { type: 'varchar(100)', notNull: true },
        description: 'text',
        metadata: 'jsonb',
        created_by: { type: 'varchar(50)', notNull: true },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
        app_version: 'varchar(20)',
        batch_id: 'varchar(100)',
    });

    pgm.createIndex('tbl_audit_trail_logs', 'comp_code');
    pgm.createIndex('tbl_audit_trail_logs', { name: 'created_at', sort: 'DESC' });
    pgm.createIndex('tbl_audit_trail_logs', 'source_app');
    pgm.createIndex('tbl_audit_trail_logs', ['source_app', 'source_function']);
    pgm.createIndex('tbl_audit_trail_logs', 'emp_id');
    pgm.createIndex('tbl_audit_trail_logs', 'reference_id');
    pgm.createIndex('tbl_audit_trail_logs', 'batch_id');
    pgm.createIndex('tbl_audit_trail_logs', 'process_id');
    pgm.createIndex('tbl_audit_trail_logs', 'metadata', { method: 'GIN' });

    pgm.createIndex('tbl_audit_trail_logs', ['comp_code', { name: 'created_at', sort: 'DESC' }], {
        where: "created_at > CURRENT_DATE - INTERVAL '30 days'",
        name: 'idx_recent_logs'
    });

    pgm.sql(`
        ALTER TABLE tbl_audit_trail_logs ENABLE ROW LEVEL SECURITY;
        ALTER TABLE tbl_audit_trail_logs FORCE ROW LEVEL SECURITY;

        CREATE POLICY tenant_isolation ON tbl_audit_trail_logs
            FOR ALL
            USING (comp_code = current_setting('app.current_tenant')::text)
            WITH CHECK (comp_code = current_setting('app.current_tenant')::text);
    `);
};

exports.down = (pgm) => {
    pgm.dropTable('tbl_audit_trail_logs');
};