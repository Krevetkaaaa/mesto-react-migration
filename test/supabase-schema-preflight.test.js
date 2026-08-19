const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');

const {
  APP_TABLE_GRANTS,
  CHECK_CONSTRAINTS,
  EXPECTED_CHECK_COUNT,
  FOREIGN_KEYS,
  PRIMARY_KEYS,
  REQUIRED_ACL_MIGRATION_VERSION,
  REQUIRED_ADVISOR_MIGRATION_VERSION,
  REQUIRED_COLUMNS,
  RPCS,
  SUPPORTING_INDEXES,
  UNIQUE_INDEXES,
  buildSupabaseSchemaPreflightSql,
  childEnvironment,
  parseTarget,
  readMigrationVersions,
  runSupabaseSchemaPreflight,
  validateConnectionEnvironment,
  validatePsqlPath
} = require('../lib/supabase-schema-preflight');

const rootDirectory = path.join(__dirname, '..');
const projectRef = 'abcdefghijklmnopqrst';
const forbiddenProjectRef = 'qrstuvwxyzabcdefghij';
const trustedPsqlPath = path.join(rootDirectory, 'trusted-tools', 'psql.exe');
const fakePsqlBytes = Buffer.from('deterministic fake psql executable');
const fakePsqlSha256 = crypto.createHash('sha256').update(fakePsqlBytes).digest('hex');
const validEnvironment = {
  SystemRoot: 'C:\\Windows',
  MESTO_RELEASE_TARGET: 'production',
  MESTO_SUPABASE_PROJECT_REF: projectRef,
  MESTO_FORBIDDEN_SUPABASE_PROJECT_REF: forbiddenProjectRef,
  MESTO_PSQL_PATH: trustedPsqlPath,
  MESTO_PSQL_SHA256: fakePsqlSha256,
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_DB_URL: `postgresql://postgres.${projectRef}:opaque@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require`,
  VERCEL_TOKEN: 'must-not-be-inherited',
  MESTO_ADMIN_SESSION_SECRET: 'must-not-be-inherited'
};

test('migration discovery is exact, ordered, and rejects malformed or duplicate versions', () => {
  const versions = readMigrationVersions({ rootDirectory });
  assert.deepEqual(versions, [
    '20260728', '20260808', '20260810222309', '20260811160000',
    '20260811163000', '20260811185937', '20260811212027', '20260817092029',
    '20260817121310'
  ]);
  assert.equal(versions.includes(REQUIRED_ACL_MIGRATION_VERSION), true);
  assert.equal(versions.includes(REQUIRED_ADVISOR_MIGRATION_VERSION), true);
  assert.throws(
    () => readMigrationVersions({ migrationNames: ['20260101_one.sql', '20260101_two.sql'] }),
    /versions must be unique/
  );
  assert.throws(() => readMigrationVersions({ migrationNames: ['not-a-migration.sql'] }), /Invalid Supabase migration filename/);
  assert.throws(
    () => readMigrationVersions({ migrationNames: ['20260101_one.sql'] }),
    /Required Supabase ACL migration/
  );
  assert.throws(
    () => readMigrationVersions({ migrationNames: ['20260817092029_acl.sql'] }),
    /Required Supabase advisor migration/
  );
});

test('SQL contract is one repeatable-read read-only snapshot with fail-closed release checks', () => {
  const sql = buildSupabaseSchemaPreflightSql({ migrationVersions: readMigrationVersions({ rootDirectory }) });
  assert.match(sql, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql, /SET LOCAL row_security = on;/);
  assert.match(sql, /supabase_migrations\.schema_migrations/);
  assert.match(sql, /actual_migrations IS DISTINCT FROM ARRAY\['20260728'/);
  assert.match(sql, /pg_extension WHERE extname = 'pgcrypto'/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_COLUMNS/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_PRIMARY_KEYS/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_FOREIGN_KEYS/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_CHECK_CONSTRAINTS/);
  assert.match(sql, /actual\.column_names IS DISTINCT FROM expected\.column_names/);
  assert.match(sql, /pg_get_constraintdef\(c\.oid, true\)/);
  assert.match(sql, /pg_get_expr\(x\.indpred,x\.indrelid\)/);
  assert.match(sql, /pg_get_indexdef\(i\.oid\)/);
  assert.match(sql, /coalesce\(c\.contype::text,''\) IS DISTINCT FROM expected\.constraint_type/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_RLS/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_SUPPORTING_INDEXES/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_RLS_POLICIES/);
  assert.equal((sql.match(/position\('selectauth\.uid' in/g) ?? []).length, 2);
  assert.doesNotMatch(sql, /selectauth\.uid\(\)/);
  assert.match(sql, /NOT c\.relrowsecurity OR c\.relforcerowsecurity/);
  assert.match(sql, /has_schema_privilege\('anon','public','CREATE'\)/);
  assert.match(sql, /has_schema_privilege\('anon','public','USAGE'\)/);
  assert.match(sql, /NOT has_schema_privilege\('service_role','public','USAGE'\)/);
  assert.match(sql, /acl\.privilege_type IN \('CREATE','USAGE'\)/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_DEFAULT_ACL/);
  assert.match(sql, /coalesce\(d\.defaclacl, acldefault\(object_types\.objtype::"char", owner_role\.oid\)\)/);
  assert.doesNotMatch(sql, /count\(DISTINCT d\.defaclobjtype\)/);
  assert.match(sql, /to_regprocedure\(expected\.signature\)/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_BUCKETS/);
  assert.match(sql, /b\.name IS DISTINCT FROM expected\.id/);
  assert.match(sql, /b\.allowed_mime_types @> expected\.mime_types/);
  assert.match(sql, /dependency\.deptype = 'e'/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_UNEXPECTED_PUBLIC_OBJECT_ACL/);
  assert.match(sql, /auditor\.rolsuper/);
  assert.match(sql, /auditor\.rolbypassrls/);
  assert.match(sql, /WHERE c\.relforcerowsecurity/);
  assert.doesNotMatch(sql, /auditor\.rolname = 'postgres'/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_UNGOVERNED_AUDITOR/);
  assert.match(sql, /status IN \('cleanup_pending','failed'\)/);
  assert.match(sql, /MESTO_SCHEMA_PREFLIGHT_WORKFLOW_NOT_QUIESCENT/);
  assert.equal(sql.indexOf('MESTO_SCHEMA_PREFLIGHT_UNGOVERNED_AUDITOR') < sql.indexOf('INTO publishing_count'), true);
  assert.match(sql, /ROLLBACK;/);
  assert.equal(Object.keys(APP_TABLE_GRANTS).length, 12);
  assert.equal(Object.keys(REQUIRED_COLUMNS).length, 12);
  assert.equal(Object.keys(PRIMARY_KEYS).length, 12);
  assert.equal(FOREIGN_KEYS.length, 20);
  assert.equal(CHECK_CONSTRAINTS.length, 22);
  assert.equal(UNIQUE_INDEXES.length, 8);
  assert.equal(SUPPORTING_INDEXES.length, 9);
  assert.equal(RPCS.length, 6);
  assert.equal(EXPECTED_CHECK_COUNT, 21);
});

test('connection validation binds a TLS PostgreSQL DSN to the canonical Supabase project', () => {
  assert.deepEqual(validateConnectionEnvironment(validEnvironment, 'production'), {
    databaseUrl: validEnvironment.SUPABASE_DB_URL,
    sslMode: 'require',
    projectRef
  });
  assert.throws(
    () => validateConnectionEnvironment(validEnvironment, 'preview'),
    /MESTO_RELEASE_TARGET/
  );
  assert.throws(
    () => validateConnectionEnvironment({ ...validEnvironment, MESTO_SUPABASE_PROJECT_REF: forbiddenProjectRef }, 'production'),
    /expected and forbidden/
  );
  assert.throws(
    () => validateConnectionEnvironment({ ...validEnvironment, SUPABASE_URL: `https://${forbiddenProjectRef}.supabase.co` }, 'production'),
    /exactly match/
  );
  assert.throws(
    () => validateConnectionEnvironment({
      ...validEnvironment,
      SUPABASE_DB_URL: `postgresql://postgres.${forbiddenProjectRef}:opaque@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require`
    }, 'production'),
    /exactly match/
  );
  assert.throws(
    () => validateConnectionEnvironment({ ...validEnvironment, SUPABASE_DB_URL: validEnvironment.SUPABASE_DB_URL.replace('sslmode=require', 'sslmode=disable') }, 'production'),
    /must require TLS/
  );
});

test('psql receives the DSN only in a minimal child environment and never in argv', () => {
  const connection = validateConnectionEnvironment(validEnvironment, 'production');
  const environment = childEnvironment(validEnvironment, connection);
  assert.equal(environment.PGDATABASE, validEnvironment.SUPABASE_DB_URL);
  assert.equal(environment.PGOPTIONS.includes('default_transaction_read_only=on'), true);
  assert.equal(environment.VERCEL_TOKEN, undefined);
  assert.equal(environment.MESTO_ADMIN_SESSION_SECRET, undefined);
  assert.equal(environment.PATH, undefined);
});

test('psql executable must be an explicitly trusted absolute resolved file', () => {
  const fakeFileSystem = {
    realpathSync(value) { return value; },
    statSync() { return { isFile: () => true, mode: 0o755 }; },
    readFileSync() { return fakePsqlBytes; }
  };
  assert.equal(validatePsqlPath(validEnvironment, fakeFileSystem), trustedPsqlPath);
  assert.throws(
    () => validatePsqlPath({ ...validEnvironment, MESTO_PSQL_PATH: 'psql' }, fakeFileSystem),
    /trusted absolute/
  );
  assert.throws(
    () => validatePsqlPath(validEnvironment, { ...fakeFileSystem, statSync: () => ({ isFile: () => false, mode: 0o755 }) }),
    /does not resolve/
  );
  assert.throws(
    () => validatePsqlPath({ ...validEnvironment, MESTO_PSQL_SHA256: fakePsqlSha256.toUpperCase() }, fakeFileSystem),
    /canonical lowercase/
  );
  assert.throws(
    () => validatePsqlPath({ ...validEnvironment, MESTO_PSQL_SHA256: '0'.repeat(64) }, fakeFileSystem),
    /does not match/
  );
  assert.throws(
    () => validatePsqlPath(validEnvironment, { ...fakeFileSystem, readFileSync: () => { throw new Error('sensitive path'); } }),
    /could not be hashed/
  );
});

test('runner returns only redacted aggregate evidence and invokes psql without connection argv', () => {
  let invocation;
  const result = runSupabaseSchemaPreflight({
    args: ['--target', 'production'],
    environment: validEnvironment,
    rootDirectory,
    validatePsqlPathFn: () => trustedPsqlPath,
    spawnSyncFn(command, args, options) {
      invocation = { command, args, options };
      return { status: 0, stdout: `{"status":"pass","checks":${EXPECTED_CHECK_COUNT},"workflow":{"publishing":0,"backlog":0}}\n`, stderr: '' };
    }
  });
  assert.deepEqual(result, { target: 'production', checks: EXPECTED_CHECK_COUNT, workflow: { publishing: 0, backlog: 0 } });
  assert.equal(invocation.command, trustedPsqlPath);
  assert.equal(invocation.args.some((arg) => arg.includes(projectRef) || arg.includes('opaque')), false);
  assert.match(invocation.options.input, /READ ONLY/);
  assert.equal(invocation.options.env.VERCEL_TOKEN, undefined);
});

test('runner exposes only controlled failure codes and rejects unexpected psql output', () => {
  const previewEnvironment = { ...validEnvironment, MESTO_RELEASE_TARGET: 'preview' };
  assert.throws(
    () => runSupabaseSchemaPreflight({
      args: ['--target', 'preview'], environment: previewEnvironment, rootDirectory,
      validatePsqlPathFn: () => trustedPsqlPath,
      spawnSyncFn: () => ({ status: 1, stdout: '', stderr: 'host secret.example password=secret MESTO_SCHEMA_PREFLIGHT_RLS' })
    }),
    (error) => error.message === 'MESTO_SCHEMA_PREFLIGHT_RLS'
  );
  assert.throws(
    () => runSupabaseSchemaPreflight({
      args: ['--target', 'preview'], environment: previewEnvironment, rootDirectory,
      validatePsqlPathFn: () => trustedPsqlPath,
      spawnSyncFn: () => ({ status: 1, stdout: '', stderr: 'host secret.example password=secret' })
    }),
    (error) => error.message === 'MESTO_SCHEMA_PREFLIGHT_PSQL_FAILED'
  );
  assert.throws(
    () => runSupabaseSchemaPreflight({
      args: ['--target', 'preview'], environment: previewEnvironment, rootDirectory,
      validatePsqlPathFn: () => trustedPsqlPath,
      spawnSyncFn: () => ({ status: 0, stdout: 'NOTICE: leaked\n{}\n', stderr: '' })
    }),
    /UNEXPECTED_OUTPUT/
  );
  assert.throws(
    () => runSupabaseSchemaPreflight({
      args: ['--target', 'preview'], environment: previewEnvironment, rootDirectory,
      validatePsqlPathFn: () => trustedPsqlPath,
      spawnSyncFn: () => ({ status: 0, stdout: '{"status":"pass","checks":18,"workflow":{"publishing":0,"backlog":0}}\n', stderr: '' })
    }),
    /UNEXPECTED_OUTPUT/
  );
});

test('target parser is explicit and fail-closed', () => {
  assert.equal(parseTarget(['--target', 'preview']), 'preview');
  assert.equal(parseTarget(['--target', 'production']), 'production');
  assert.throws(() => parseTarget([]), /Usage:/);
  assert.throws(() => parseTarget(['--target', 'staging']), /Usage:/);
  assert.throws(() => parseTarget(['--target', 'production', '--extra']), /Usage:/);
});
