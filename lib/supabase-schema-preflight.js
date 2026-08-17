const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const APP_TABLE_GRANTS = Object.freeze({
  venues: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  venue_submissions: ['SELECT', 'INSERT'],
  media_assets: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  review_submissions: ['SELECT', 'INSERT'],
  reviews: ['SELECT'],
  profiles: ['SELECT', 'INSERT', 'UPDATE'],
  external_identities: ['SELECT', 'INSERT'],
  favorites: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  venue_memberships: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  menu_items: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  promotions: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  audit_log: ['INSERT']
});

const REQUIRED_COLUMNS = Object.freeze({
  venues: {
    id: ['uuid', true], slug: ['text', true], title: ['text', true], city: ['text', true],
    category: ['text', true], cuisine: ['text', false], description: ['text', true], address: ['text', false],
    phone: ['text', false], website: ['text', false], hours: ['text', false], average_check: ['text', false],
    features: ['jsonb', true], photos: ['_text', true], latitude: ['float8', false], longitude: ['float8', false],
    source: ['text', true], status: ['text', true], created_by: ['uuid', false], owner_id: ['uuid', false],
    created_at: ['timestamptz', true], updated_at: ['timestamptz', true]
  },
  venue_submissions: {
    id: ['uuid', true], submitted_by: ['uuid', false], contact_name: ['text', true], contact_email: ['text', true],
    title: ['text', true], city: ['text', true], category: ['text', true], cuisine: ['text', false],
    description: ['text', true], address: ['text', false], phone: ['text', false], website: ['text', false],
    hours: ['text', false], average_check: ['text', false], features: ['jsonb', true], photos: ['_text', true],
    status: ['text', true], moderation_note: ['text', false], moderated_by: ['text', false],
    moderated_at: ['timestamptz', false], approved_venue_id: ['uuid', false],
    created_at: ['timestamptz', true], updated_at: ['timestamptz', true]
  },
  media_assets: {
    id: ['uuid', true], owner_id: ['uuid', true], submission_id: ['uuid', false], status: ['text', true],
    declared_content_type: ['text', true], declared_size: ['int4', true], actual_content_type: ['text', false],
    width: ['int4', false], height: ['int4', false], staging_path: ['text', true],
    staging_token_expires_at: ['timestamptz', true], review_manifest: ['jsonb', true], public_manifest: ['jsonb', true],
    publication_lease_id: ['uuid', false], staging_cleanup_pending: ['bool', true],
    review_cleanup_pending: ['bool', true], public_cleanup_pending: ['bool', true], expires_at: ['timestamptz', true],
    created_at: ['timestamptz', true], updated_at: ['timestamptz', true]
  },
  review_submissions: {
    id: ['uuid', true], venue_id: ['uuid', false], external_venue_id: ['text', false], venue_title: ['text', true],
    submitted_by: ['uuid', false], author_name: ['text', true], rating: ['int2', true], body: ['text', true],
    status: ['text', true], moderation_note: ['text', false], moderated_by: ['text', false],
    moderated_at: ['timestamptz', false], created_at: ['timestamptz', true]
  },
  reviews: {
    id: ['uuid', true], venue_id: ['uuid', false], external_venue_id: ['text', false], venue_title: ['text', true],
    author_name: ['text', true], rating: ['int2', true], body: ['text', true], source_submission_id: ['uuid', false],
    created_at: ['timestamptz', true], author_id: ['uuid', false]
  },
  profiles: {
    id: ['uuid', true], username: ['text', false], display_name: ['text', true], email: ['text', true],
    email_is_internal: ['bool', true], phone: ['text', true], role: ['text', true], status: ['text', true],
    must_change_password: ['bool', true], session_version: ['int4', true], last_login_at: ['timestamptz', false],
    created_at: ['timestamptz', true], updated_at: ['timestamptz', true]
  },
  external_identities: {
    id: ['uuid', true], user_id: ['uuid', true], provider: ['text', true], provider_subject: ['text', true],
    created_at: ['timestamptz', true]
  },
  favorites: {
    user_id: ['uuid', true], venue_key: ['text', true], venue_id: ['uuid', false], external_venue_id: ['text', false],
    snapshot: ['jsonb', true], created_at: ['timestamptz', true]
  },
  venue_memberships: {
    id: ['uuid', true], venue_id: ['uuid', true], user_id: ['uuid', true], membership_role: ['text', true],
    permissions: ['jsonb', true], created_at: ['timestamptz', true]
  },
  menu_items: {
    id: ['uuid', true], venue_id: ['uuid', true], section: ['text', true], title: ['text', true],
    description: ['text', true], price: ['numeric', false], photo_url: ['text', true], is_available: ['bool', true],
    sort_order: ['int4', true], created_at: ['timestamptz', true], updated_at: ['timestamptz', true]
  },
  promotions: {
    id: ['uuid', true], venue_id: ['uuid', true], title: ['text', true], description: ['text', true],
    starts_at: ['timestamptz', false], ends_at: ['timestamptz', false], status: ['text', true],
    created_at: ['timestamptz', true], updated_at: ['timestamptz', true]
  },
  audit_log: {
    id: ['int8', true], actor_id: ['uuid', false], actor_label: ['text', true], actor_role: ['text', true],
    action: ['text', true], entity_type: ['text', true], entity_id: ['text', false], details: ['jsonb', true],
    created_at: ['timestamptz', true]
  }
});

const PRIMARY_KEYS = Object.freeze({
  venues: ['id'], venue_submissions: ['id'], media_assets: ['id'], review_submissions: ['id'], reviews: ['id'],
  profiles: ['id'], external_identities: ['id'], favorites: ['user_id', 'venue_key'], venue_memberships: ['id'],
  menu_items: ['id'], promotions: ['id'], audit_log: ['id']
});

const FOREIGN_KEYS = Object.freeze([
  ['venues_created_by_fkey', 'venues', 'created_by', 'auth', 'users', 'id', 'n'],
  ['venues_owner_id_fkey', 'venues', 'owner_id', 'auth', 'users', 'id', 'n'],
  ['venue_submissions_submitted_by_fkey', 'venue_submissions', 'submitted_by', 'auth', 'users', 'id', 'n'],
  ['venue_submissions_approved_venue_id_fkey', 'venue_submissions', 'approved_venue_id', 'public', 'venues', 'id', 'n'],
  ['media_assets_owner_id_fkey', 'media_assets', 'owner_id', 'auth', 'users', 'id', 'r'],
  ['media_assets_submission_id_fkey', 'media_assets', 'submission_id', 'public', 'venue_submissions', 'id', 'r'],
  ['review_submissions_venue_id_fkey', 'review_submissions', 'venue_id', 'public', 'venues', 'id', 'c'],
  ['review_submissions_submitted_by_fkey', 'review_submissions', 'submitted_by', 'auth', 'users', 'id', 'n'],
  ['reviews_venue_id_fkey', 'reviews', 'venue_id', 'public', 'venues', 'id', 'c'],
  ['reviews_source_submission_id_fkey', 'reviews', 'source_submission_id', 'public', 'review_submissions', 'id', 'n'],
  ['reviews_author_id_fkey', 'reviews', 'author_id', 'auth', 'users', 'id', 'n'],
  ['profiles_id_fkey', 'profiles', 'id', 'auth', 'users', 'id', 'c'],
  ['external_identities_user_id_fkey', 'external_identities', 'user_id', 'auth', 'users', 'id', 'c'],
  ['favorites_user_id_fkey', 'favorites', 'user_id', 'auth', 'users', 'id', 'c'],
  ['favorites_venue_id_fkey', 'favorites', 'venue_id', 'public', 'venues', 'id', 'c'],
  ['venue_memberships_venue_id_fkey', 'venue_memberships', 'venue_id', 'public', 'venues', 'id', 'c'],
  ['venue_memberships_user_id_fkey', 'venue_memberships', 'user_id', 'auth', 'users', 'id', 'c'],
  ['menu_items_venue_id_fkey', 'menu_items', 'venue_id', 'public', 'venues', 'id', 'c'],
  ['promotions_venue_id_fkey', 'promotions', 'venue_id', 'public', 'venues', 'id', 'c'],
  ['audit_log_actor_id_fkey', 'audit_log', 'actor_id', 'auth', 'users', 'id', 'n']
]);

const CHECK_CONSTRAINTS = Object.freeze([
  ['venues_source_check', 'venues', 'source', "checksource=anyarray['editorial'::text,'community'::text,'merchant'::text]"],
  ['venues_status_check', 'venues', 'status', "checkstatus=anyarray['draft'::text,'published'::text,'archived'::text]"],
  ['venue_submissions_status_check', 'venue_submissions', 'status', "checkstatus=anyarray['pending'::text,'approved'::text,'rejected'::text]"],
  ['media_assets_status_check', 'media_assets', 'status', "checkstatus=anyarray['signed'::text,'processing'::text,'processed'::text,'attached'::text,'publishing'::text,'published'::text,'cleanup_pending'::text,'failed'::text]"],
  ['media_assets_declared_content_type_check', 'media_assets', 'declared_content_type', "checkdeclared_content_type=anyarray['image/jpeg'::text,'image/png'::text,'image/webp'::text]"],
  ['media_assets_declared_size_check', 'media_assets', 'declared_size', 'checkdeclared_size>=1anddeclared_size<=6291456'],
  ['media_assets_actual_content_type_check', 'media_assets', 'actual_content_type', "checkactual_content_typeisnulloractual_content_type=anyarray['image/jpeg'::text,'image/png'::text,'image/webp'::text]"],
  ['media_assets_width_check', 'media_assets', 'width', 'checkwidthisnullorwidth>=1andwidth<=8192'],
  ['media_assets_height_check', 'media_assets', 'height', 'checkheightisnullorheight>=1andheight<=8192'],
  ['media_assets_review_manifest_check', 'media_assets', 'review_manifest', "checkjsonb_typeofreview_manifest='object'::text"],
  ['media_assets_public_manifest_check', 'media_assets', 'public_manifest', "checkjsonb_typeofpublic_manifest='object'::text"],
  ['media_assets_check', 'media_assets', 'width,height', 'checkwidthisnullorheightisnullorwidth::bigint*height::bigint<=40000000'],
  ['media_assets_publication_lease_state_check', 'media_assets', 'status,publication_lease_id', "checkstatus='publishing'::text=publication_lease_idisnotnull"],
  ['media_assets_staging_token_expiry_check', 'media_assets', 'staging_token_expires_at,created_at', 'checkstaging_token_expires_at>=created_at'],
  ['review_submissions_rating_check', 'review_submissions', 'rating', 'checkrating>=1andrating<=5'],
  ['review_submissions_status_check', 'review_submissions', 'status', "checkstatus=anyarray['pending'::text,'approved'::text,'rejected'::text]"],
  ['reviews_rating_check', 'reviews', 'rating', 'checkrating>=1andrating<=5'],
  ['profiles_role_check', 'profiles', 'role', "checkrole=anyarray['customer'::text,'merchant'::text,'admin'::text]"],
  ['profiles_status_check', 'profiles', 'status', "checkstatus=anyarray['invited'::text,'active'::text,'suspended'::text]"],
  ['external_identities_provider_check', 'external_identities', 'provider', "checkprovider=anyarray['vk'::text,'yandex'::text]"],
  ['venue_memberships_membership_role_check', 'venue_memberships', 'membership_role', "checkmembership_role=anyarray['owner'::text,'manager'::text,'content_editor'::text,'analyst'::text]"],
  ['promotions_status_check', 'promotions', 'status', "checkstatus=anyarray['draft'::text,'active'::text,'archived'::text]"]
]);

const UNIQUE_INDEXES = Object.freeze([
  ['venues_slug_key', 'venues', 'slug', '', 'u'],
  ['venue_submissions_approved_venue_uidx', 'venue_submissions', 'approved_venue_id', 'approved_venue_idisnotnull', ''],
  ['media_assets_staging_path_key', 'media_assets', 'staging_path', '', 'u'],
  ['reviews_source_submission_id_key', 'reviews', 'source_submission_id', '', 'u'],
  ['profiles_username_key', 'profiles', 'username', '', 'u'],
  ['external_identities_provider_provider_subject_key', 'external_identities', 'provider,provider_subject', '', 'u'],
  ['external_identities_user_id_provider_key', 'external_identities', 'user_id,provider', '', 'u'],
  ['venue_memberships_venue_id_user_id_key', 'venue_memberships', 'venue_id,user_id', '', 'u']
]);

const RPCS = Object.freeze([
  { signature: 'public.public_catalog_summary()', securityDefiner: false, defaults: 0, volatility: 's' },
  { signature: 'public.moderate_venue_submission(uuid,text,text,text)', securityDefiner: true, defaults: 2, volatility: 'v' },
  { signature: 'public.create_venue_submission_with_media(jsonb,uuid[],uuid)', securityDefiner: true, defaults: 0, volatility: 'v' },
  { signature: 'public.moderate_venue_submission_with_media(uuid,text,text,text,jsonb,uuid)', securityDefiner: true, defaults: 4, volatility: 'v' },
  { signature: 'public.delete_venue_with_media(uuid)', securityDefiner: true, defaults: 0, volatility: 'v' },
  { signature: 'public.moderate_review_submission(uuid,text,text,text)', securityDefiner: true, defaults: 2, volatility: 'v' }
]);

const TABLE_PRIVILEGES = Object.freeze(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']);
const REQUIRED_ACL_MIGRATION_VERSION = '20260817092029';
const EXPECTED_CHECK_COUNT = 19;
const SAFE_FAILURE_PATTERN = /MESTO_SCHEMA_PREFLIGHT_[A-Z0-9_]+/;

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function valuesSql(rows) {
  return rows.map((row) => `(${row.map((value) => typeof value === 'boolean' ? String(value) : quoteLiteral(value)).join(',')})`).join(',\n      ');
}

function readMigrationVersions({ rootDirectory, migrationNames } = {}) {
  const directory = path.join(rootDirectory || path.join(__dirname, '..'), 'supabase', 'migrations');
  const names = migrationNames || fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
  if (names.length === 0) throw new Error('No Supabase migrations found.');
  const versions = names.map((name) => {
    const match = /^(\d+)_[-a-z0-9_]+\.sql$/i.exec(name);
    if (!match) throw new Error(`Invalid Supabase migration filename: ${name}`);
    return match[1];
  });
  if (new Set(versions).size !== versions.length) throw new Error('Supabase migration versions must be unique.');
  if (names.some((name, index) => index > 0 && name <= names[index - 1])) {
    throw new Error('Supabase migration files must be strictly ordered.');
  }
  if (!versions.includes(REQUIRED_ACL_MIGRATION_VERSION)) {
    throw new Error(`Required Supabase ACL migration ${REQUIRED_ACL_MIGRATION_VERSION} is missing.`);
  }
  return versions;
}

function buildSupabaseSchemaPreflightSql({ migrationVersions }) {
  if (!Array.isArray(migrationVersions) || migrationVersions.length === 0) {
    throw new Error('Expected migration versions are required.');
  }
  const tableRows = Object.keys(APP_TABLE_GRANTS).map((table) => [table]);
  const columnRows = Object.entries(REQUIRED_COLUMNS).flatMap(([table, columns]) =>
    Object.entries(columns).map(([column, [type, notNull]]) => [table, column, type, notNull])
  );
  const grantRows = Object.entries(APP_TABLE_GRANTS).flatMap(([table, privileges]) =>
    TABLE_PRIVILEGES.map((privilege) => [table, privilege, privileges.includes(privilege)])
  );
  const primaryKeyRows = Object.entries(PRIMARY_KEYS).map(([table, columns]) =>
    [`${table}_pkey`, table, columns.join(','), `primarykey${columns.join(',')}`]
  );
  const foreignKeyRows = FOREIGN_KEYS.map((row) => row);
  const checkConstraintRows = CHECK_CONSTRAINTS.map((row) => row);
  const uniqueIndexRows = UNIQUE_INDEXES.map(([name, table, columns, predicate, constraintType]) => [
    name,
    table,
    columns,
    predicate,
    constraintType,
    `createuniqueindex${name}onpublic.${table}usingbtree${columns}${predicate ? `where${predicate}` : ''}`
  ]);
  const rpcRows = RPCS.map(({ signature, securityDefiner, defaults, volatility }) =>
    [signature, securityDefiner, String(defaults), volatility]
  );
  const expectedMigrations = `ARRAY[${migrationVersions.map(quoteLiteral).join(',')}]::text[]`;

  return `\\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL idle_in_transaction_session_timeout = '25s';
SET LOCAL row_security = on;

DO $mesto_preflight$
DECLARE
  actual_migrations text[];
  publishing_count bigint;
  backlog_count bigint;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_MIGRATION_HISTORY';
  END IF;

  SELECT coalesce(array_agg(version::text ORDER BY version::text), '{}'::text[])
    INTO actual_migrations FROM supabase_migrations.schema_migrations;
  IF actual_migrations IS DISTINCT FROM ${expectedMigrations} THEN
    RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_MIGRATION_HISTORY';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_PGCRYPTO'; END IF;

  IF EXISTS (
    WITH expected(table_name) AS (VALUES
      ${valuesSql(tableRows)}
    )
    SELECT 1 FROM expected
    WHERE to_regclass(format('public.%I', table_name)) IS NULL
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_TABLES'; END IF;

  IF EXISTS (
    WITH expected(table_name,column_name,type_name,not_null) AS (VALUES
      ${valuesSql(columnRows)}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = expected.table_name AND c.relkind = 'r'
    LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = expected.column_name AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attname IS NULL OR t.typname::text IS DISTINCT FROM expected.type_name OR a.attnotnull IS DISTINCT FROM expected.not_null
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_COLUMNS'; END IF;

  IF EXISTS (
    WITH expected(constraint_name,table_name,column_names,normalized_definition) AS (VALUES
      ${valuesSql(primaryKeyRows)}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_constraint c
      ON c.connamespace = 'public'::regnamespace AND c.conname::text = expected.constraint_name
      AND c.conrelid = format('public.%I', expected.table_name)::regclass AND c.contype = 'p'
    LEFT JOIN LATERAL (
      SELECT string_agg(a.attname::text,',' ORDER BY key.ordinality) AS column_names
      FROM unnest(c.conkey) WITH ORDINALITY key(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
    ) actual ON true
    WHERE c.oid IS NULL OR NOT c.convalidated OR c.condeferrable OR c.condeferred
      OR NOT c.conislocal OR c.coninhcount <> 0 OR c.conparentid <> 0
      OR actual.column_names IS DISTINCT FROM expected.column_names
      OR regexp_replace(lower(pg_get_constraintdef(c.oid, true)), '[()[:space:]]', '', 'g')
        IS DISTINCT FROM expected.normalized_definition
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_PRIMARY_KEYS'; END IF;

  IF EXISTS (
    WITH expected(constraint_name,table_name,column_names,foreign_schema,foreign_table,foreign_columns,delete_action) AS (VALUES
      ${valuesSql(foreignKeyRows)}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_constraint c
      ON c.connamespace = 'public'::regnamespace AND c.conname::text = expected.constraint_name
      AND c.conrelid = format('public.%I', expected.table_name)::regclass AND c.contype = 'f'
    LEFT JOIN LATERAL (
      SELECT string_agg(a.attname::text,',' ORDER BY key.ordinality) AS column_names
      FROM unnest(c.conkey) WITH ORDINALITY key(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
    ) local_columns ON true
    LEFT JOIN LATERAL (
      SELECT string_agg(a.attname::text,',' ORDER BY key.ordinality) AS column_names
      FROM unnest(c.confkey) WITH ORDINALITY key(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = key.attnum
    ) foreign_columns ON true
    WHERE c.oid IS NULL OR NOT c.convalidated OR c.condeferrable OR c.condeferred
      OR NOT c.conislocal OR c.coninhcount <> 0 OR c.conparentid <> 0
      OR c.confrelid IS DISTINCT FROM format('%I.%I', expected.foreign_schema, expected.foreign_table)::regclass
      OR c.confdeltype::text IS DISTINCT FROM expected.delete_action OR c.confupdtype <> 'a' OR c.confmatchtype <> 's'
      OR local_columns.column_names IS DISTINCT FROM expected.column_names
      OR foreign_columns.column_names IS DISTINCT FROM expected.foreign_columns
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_FOREIGN_KEYS'; END IF;

  IF EXISTS (
    WITH expected(constraint_name,table_name,column_names,normalized_definition) AS (VALUES
      ${valuesSql(checkConstraintRows)}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_constraint c
      ON c.connamespace = 'public'::regnamespace AND c.conname::text = expected.constraint_name
      AND c.conrelid = format('public.%I', expected.table_name)::regclass AND c.contype = 'c'
    LEFT JOIN LATERAL (
      SELECT string_agg(a.attname::text,',' ORDER BY key.ordinality) AS column_names
      FROM unnest(c.conkey) WITH ORDINALITY key(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
    ) actual ON true
    WHERE c.oid IS NULL OR NOT c.convalidated OR c.connoinherit
      OR NOT c.conislocal OR c.coninhcount <> 0 OR c.conparentid <> 0
      OR actual.column_names IS DISTINCT FROM expected.column_names
      OR regexp_replace(lower(pg_get_constraintdef(c.oid, true)), '[()[:space:]]', '', 'g')
        IS DISTINCT FROM expected.normalized_definition
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_CHECK_CONSTRAINTS'; END IF;

  IF EXISTS (
    WITH expected(index_name,table_name,column_names,normalized_predicate,constraint_type,normalized_definition) AS (VALUES
      ${valuesSql(uniqueIndexRows)}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_class i ON i.relnamespace = 'public'::regnamespace AND i.relname::text = expected.index_name
    LEFT JOIN pg_index x ON x.indexrelid = i.oid
    LEFT JOIN pg_am am ON am.oid = i.relam
    LEFT JOIN pg_constraint c ON c.conindid = i.oid
    LEFT JOIN LATERAL (
      SELECT string_agg(a.attname::text,',' ORDER BY key.ordinality) AS column_names
      FROM unnest(x.indkey::smallint[]) WITH ORDINALITY key(attnum,ordinality)
      JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = key.attnum
    ) actual ON true
    WHERE i.oid IS NULL OR x.indrelid IS DISTINCT FROM format('public.%I', expected.table_name)::regclass
      OR NOT x.indisunique OR NOT x.indisvalid OR NOT x.indisready OR NOT x.indimmediate
      OR x.indisexclusion OR x.indnullsnotdistinct OR am.amname <> 'btree' OR x.indexprs IS NOT NULL
      OR actual.column_names IS DISTINCT FROM expected.column_names
      OR coalesce(regexp_replace(lower(pg_get_expr(x.indpred,x.indrelid)), '[()[:space:]]', '', 'g'),'')
        IS DISTINCT FROM expected.normalized_predicate
      OR coalesce(c.contype::text,'') IS DISTINCT FROM expected.constraint_type
      OR regexp_replace(lower(pg_get_indexdef(i.oid)), '[()[:space:]\"]', '', 'g')
        IS DISTINCT FROM expected.normalized_definition
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_UNIQUE_INDEXES'; END IF;

  IF EXISTS (
    WITH expected(table_name) AS (VALUES
      ${valuesSql(tableRows)}
    )
    SELECT 1 FROM expected JOIN pg_class c ON c.oid = format('public.%I', expected.table_name)::regclass
    WHERE NOT c.relrowsecurity OR c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_RLS'; END IF;

  IF EXISTS (
    WITH expected(table_name,privilege_name,allowed) AS (VALUES
      ${valuesSql(grantRows)}
    )
    SELECT 1 FROM expected
    WHERE has_table_privilege('service_role', format('public.%I', table_name), privilege_name) IS DISTINCT FROM allowed
  ) OR EXISTS (
    WITH expected(table_name) AS (VALUES
      ${valuesSql(tableRows)}
    ), roles(role_name) AS (VALUES ('anon'),('authenticated')),
    privileges(privilege_name) AS (VALUES ${TABLE_PRIVILEGES.map((privilege) => `(${quoteLiteral(privilege)})`).join(',')})
    SELECT 1 FROM expected CROSS JOIN roles CROSS JOIN privileges
    WHERE has_table_privilege(role_name::name, format('public.%I', table_name), privilege_name)
  ) OR EXISTS (
    WITH expected(table_name) AS (VALUES
      ${valuesSql(tableRows)}
    )
    SELECT 1 FROM expected
    JOIN pg_class c ON c.oid = format('public.%I', expected.table_name)::regclass
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    WHERE acl.grantee = 0
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_TABLE_ACL'; END IF;

  IF has_schema_privilege('anon','public','CREATE')
    OR has_schema_privilege('authenticated','public','CREATE')
    OR has_schema_privilege('service_role','public','CREATE')
    OR has_schema_privilege('anon','public','USAGE')
    OR has_schema_privilege('authenticated','public','USAGE')
    OR NOT has_schema_privilege('service_role','public','USAGE')
    OR EXISTS (
      SELECT 1 FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
      WHERE n.nspname = 'public' AND acl.grantee = 0 AND acl.privilege_type IN ('CREATE','USAGE')
    )
  THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_PUBLIC_SCHEMA_ACL'; END IF;

  IF EXISTS (
    WITH owner_role AS (
      SELECT oid FROM pg_roles WHERE rolname = 'postgres'
    ), object_types(objtype) AS (VALUES ('r'),('S'),('f')),
    effective_acl AS (
      SELECT object_types.objtype, acl.grantee
      FROM owner_role CROSS JOIN object_types
      LEFT JOIN pg_default_acl d
        ON d.defaclrole = owner_role.oid
        AND d.defaclnamespace = 'public'::regnamespace
        AND d.defaclobjtype::text = object_types.objtype
      CROSS JOIN LATERAL aclexplode(
        coalesce(d.defaclacl, acldefault(object_types.objtype::"char", owner_role.oid))
      ) acl
    )
    SELECT 1 FROM effective_acl
    WHERE effective_acl.grantee = 0 OR CASE WHEN effective_acl.grantee = 0 THEN false ELSE
      pg_has_role('anon',effective_acl.grantee,'USAGE')
      OR pg_has_role('authenticated',effective_acl.grantee,'USAGE')
      OR pg_has_role('service_role',effective_acl.grantee,'USAGE') END
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_DEFAULT_ACL'; END IF;

  IF has_sequence_privilege('anon','public.audit_log_id_seq','USAGE')
    OR has_sequence_privilege('anon','public.audit_log_id_seq','SELECT')
    OR has_sequence_privilege('anon','public.audit_log_id_seq','UPDATE')
    OR has_sequence_privilege('authenticated','public.audit_log_id_seq','USAGE')
    OR has_sequence_privilege('authenticated','public.audit_log_id_seq','SELECT')
    OR has_sequence_privilege('authenticated','public.audit_log_id_seq','UPDATE')
    OR NOT has_sequence_privilege('service_role','public.audit_log_id_seq','USAGE')
    OR has_sequence_privilege('service_role','public.audit_log_id_seq','SELECT')
    OR has_sequence_privilege('service_role','public.audit_log_id_seq','UPDATE')
  THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_SEQUENCE_ACL'; END IF;

  IF EXISTS (
    WITH expected(signature,security_definer,default_count,volatility) AS (VALUES
      ${valuesSql(rpcRows)}
    )
    SELECT 1 FROM expected
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
    WHERE p.oid IS NULL OR p.prorettype <> 'jsonb'::regtype OR p.prosecdef IS DISTINCT FROM expected.security_definer
      OR p.pronargdefaults IS DISTINCT FROM expected.default_count::integer
      OR p.provolatile::text IS DISTINCT FROM expected.volatility
      OR (expected.security_definer AND coalesce((
        SELECT split_part(config,'=',2) FROM unnest(p.proconfig) config
        WHERE split_part(config,'=',1) = 'search_path'
      ), 'missing') NOT IN ('','""'))
      OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      OR has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl WHERE acl.grantee = 0
      )
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_RPCS'; END IF;

  IF EXISTS (
    WITH expected(signature) AS (VALUES
      ('public.touch_updated_at()'),('public.guard_media_staging_tombstone()')
    ), roles(role_name) AS (VALUES ('service_role'),('anon'),('authenticated'))
    SELECT 1 FROM expected CROSS JOIN roles
    WHERE to_regprocedure(expected.signature) IS NULL
      OR has_function_privilege(role_name::name, to_regprocedure(expected.signature), 'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE p.oid = to_regprocedure(expected.signature) AND acl.grantee = 0
      )
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_TRIGGER_FUNCTION_ACL'; END IF;

  IF to_regclass('storage.buckets') IS NULL OR (
    WITH expected(id,is_public,size_limit,mime_types) AS (VALUES
      ('mesto-media-staging',false,6291456::bigint,ARRAY['image/jpeg','image/png','image/webp']::text[]),
      ('mesto-media-review',false,6291456::bigint,ARRAY['image/webp']::text[]),
      ('mesto-media-public',true,6291456::bigint,ARRAY['image/webp']::text[])
    )
    SELECT count(*) <> 3 OR bool_or(
      b.id IS NULL OR b.name IS DISTINCT FROM expected.id OR b.public IS DISTINCT FROM expected.is_public
      OR b.file_size_limit IS DISTINCT FROM expected.size_limit
      OR cardinality(b.allowed_mime_types) IS DISTINCT FROM cardinality(expected.mime_types)
      OR NOT (b.allowed_mime_types @> expected.mime_types AND expected.mime_types @> b.allowed_mime_types)
    )
    FROM expected LEFT JOIN storage.buckets b ON b.id = expected.id
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_BUCKETS'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind IN ('r','p','v','m','f','S')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend dependency
        WHERE dependency.classid = 'pg_class'::regclass AND dependency.objid = c.oid AND dependency.deptype = 'e'
      )
      AND (
        EXISTS (
          SELECT 1 FROM aclexplode(coalesce(
            c.relacl,
            acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner)
          )) acl WHERE acl.grantee = 0
        )
        OR (c.relkind = 'S' AND (
          has_sequence_privilege('anon',c.oid,'USAGE') OR has_sequence_privilege('anon',c.oid,'SELECT')
          OR has_sequence_privilege('anon',c.oid,'UPDATE') OR has_sequence_privilege('authenticated',c.oid,'USAGE')
          OR has_sequence_privilege('authenticated',c.oid,'SELECT') OR has_sequence_privilege('authenticated',c.oid,'UPDATE')
        ))
        OR (c.relkind <> 'S' AND EXISTS (
          WITH roles(role_name) AS (VALUES ('anon'),('authenticated')),
          privileges(privilege_name) AS (VALUES ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))
          SELECT 1 FROM roles CROSS JOIN privileges
          WHERE has_table_privilege(role_name::name,c.oid,privilege_name)
        ))
      )
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_depend dependency
      WHERE dependency.classid = 'pg_proc'::regclass AND dependency.objid = p.oid AND dependency.deptype = 'e'
    )
      AND (
        has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR EXISTS (
          SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl WHERE acl.grantee = 0
        )
      )
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_UNEXPECTED_PUBLIC_OBJECT_ACL'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles auditor
    WHERE auditor.rolname = current_user
      AND (
        auditor.rolsuper
        OR auditor.rolbypassrls
        OR (
          NOT EXISTS (
            WITH expected(table_name) AS (VALUES
              ${valuesSql(tableRows)}
            )
            SELECT 1 FROM expected
            JOIN pg_class c ON c.oid = format('public.%I', expected.table_name)::regclass
            WHERE c.relowner <> auditor.oid
          )
          AND NOT EXISTS (
            WITH expected(table_name) AS (VALUES
              ${valuesSql(tableRows)}
            )
            SELECT 1 FROM expected
            JOIN pg_class c ON c.oid = format('public.%I', expected.table_name)::regclass
            WHERE c.relforcerowsecurity
          )
        )
      )
  ) THEN RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_UNGOVERNED_AUDITOR'; END IF;

  SELECT count(*) FILTER (WHERE status = 'publishing'),
    count(*) FILTER (
      WHERE status IN ('cleanup_pending','failed')
        OR staging_cleanup_pending OR review_cleanup_pending OR public_cleanup_pending
    )
  INTO publishing_count, backlog_count FROM public.media_assets;
  IF publishing_count <> 0 OR backlog_count <> 0 THEN
    RAISE EXCEPTION 'MESTO_SCHEMA_PREFLIGHT_WORKFLOW_NOT_QUIESCENT';
  END IF;
END
$mesto_preflight$;

SELECT jsonb_build_object(
  'status','pass',
  'checks',${EXPECTED_CHECK_COUNT},
  'workflow',jsonb_build_object(
    'publishing',(SELECT count(*) FROM public.media_assets WHERE status = 'publishing'),
    'backlog',(SELECT count(*) FROM public.media_assets WHERE status IN ('cleanup_pending','failed')
      OR staging_cleanup_pending OR review_cleanup_pending OR public_cleanup_pending)
  )
)::text;
ROLLBACK;
`;
}

function parseTarget(args) {
  if (!Array.isArray(args)) throw new Error('Preflight arguments must be an array.');
  if (args.length !== 2 || args[0] !== '--target' || !['preview', 'production'].includes(args[1])) {
    throw new Error('Usage: npm run preflight:supabase-schema -- --target <preview|production>');
  }
  return args[1];
}

function canonicalProjectRef(value, name) {
  const raw = String(value || '');
  if (raw !== raw.trim() || !/^[a-z0-9]{8,40}$/.test(raw)) {
    throw new Error(`${name} must be a canonical Supabase project ref.`);
  }
  return raw;
}

function validateConnectionEnvironment(environment, target) {
  const databaseUrl = String(environment.SUPABASE_DB_URL || '');
  const supabaseUrl = String(environment.SUPABASE_URL || '');
  if (!['preview', 'production'].includes(target) || environment.MESTO_RELEASE_TARGET !== target) {
    throw new Error('MESTO_RELEASE_TARGET must exactly match --target.');
  }
  const expectedProjectRef = canonicalProjectRef(environment.MESTO_SUPABASE_PROJECT_REF, 'MESTO_SUPABASE_PROJECT_REF');
  const forbiddenProjectRef = canonicalProjectRef(
    environment.MESTO_FORBIDDEN_SUPABASE_PROJECT_REF,
    'MESTO_FORBIDDEN_SUPABASE_PROJECT_REF'
  );
  if (forbiddenProjectRef === expectedProjectRef) {
    throw new Error('The expected and forbidden Supabase project refs must differ.');
  }
  if (!databaseUrl || !supabaseUrl || /[\r\n]/.test(databaseUrl + supabaseUrl)) {
    throw new Error('SUPABASE_DB_URL and SUPABASE_URL are required.');
  }
  let database;
  let api;
  try {
    database = new URL(databaseUrl);
    api = new URL(supabaseUrl);
  } catch {
    throw new Error('Supabase connection environment is malformed.');
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.username || !database.password
    || api.protocol !== 'https:' || api.port || api.username || api.password) {
    throw new Error('Supabase connection environment is malformed.');
  }
  const projectMatch = /^([a-z0-9]{8,40})\.supabase\.co$/.exec(api.hostname);
  if (!projectMatch || api.pathname !== '/' || api.search || api.hash) {
    throw new Error('SUPABASE_URL must identify one canonical Supabase project.');
  }
  if (projectMatch[1] !== expectedProjectRef) {
    throw new Error('SUPABASE_URL must exactly match MESTO_SUPABASE_PROJECT_REF.');
  }
  let databaseUsername;
  try {
    databaseUsername = decodeURIComponent(database.username);
  } catch {
    throw new Error('Supabase connection environment is malformed.');
  }
  const databaseHost = database.hostname.toLowerCase();
  const directIdentity = databaseUsername === 'postgres' && databaseHost === `db.${expectedProjectRef}.supabase.co`
    && (!database.port || database.port === '5432');
  const poolerIdentity = databaseUsername === `postgres.${expectedProjectRef}`
    && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(databaseHost)
    && ['5432','6543'].includes(database.port);
  if ((!directIdentity && !poolerIdentity) || database.pathname !== '/postgres' || database.hash) {
    throw new Error('SUPABASE_DB_URL must exactly match MESTO_SUPABASE_PROJECT_REF.');
  }
  if (databaseHost.includes(forbiddenProjectRef) || databaseUsername.includes(forbiddenProjectRef)) {
    throw new Error('SUPABASE_DB_URL resolves to the forbidden other-target project ref.');
  }
  const sslMode = (database.searchParams.get('sslmode') || '').toLowerCase();
  if (!['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    throw new Error('SUPABASE_DB_URL must require TLS with sslmode.');
  }
  return { databaseUrl, sslMode, projectRef: expectedProjectRef };
}

function childEnvironment(source, { databaseUrl, sslMode }) {
  const allowed = ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'ComSpec', 'COMSPEC'];
  const result = {};
  for (const key of allowed) if (source[key]) result[key] = source[key];
  return {
    ...result,
    PGDATABASE: databaseUrl,
    PGSSLMODE: sslMode,
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'mesto-schema-preflight',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=20000'
  };
}

function validatePsqlPath(environment, fileSystem = fs) {
  const configured = String(environment.MESTO_PSQL_PATH || '');
  const expectedSha256 = String(environment.MESTO_PSQL_SHA256 || '');
  if (!configured || configured !== configured.trim() || /[\r\n]/.test(configured) || !path.isAbsolute(configured)) {
    throw new Error('MESTO_PSQL_PATH must be a trusted absolute psql executable path.');
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error('MESTO_PSQL_SHA256 must be one canonical lowercase SHA-256 digest.');
  }
  let resolved;
  let stats;
  try {
    resolved = fileSystem.realpathSync(configured);
    stats = fileSystem.statSync(resolved);
  } catch {
    throw new Error('MESTO_PSQL_PATH does not resolve to a trusted psql executable.');
  }
  if (!stats.isFile() || !/^psql(?:\.exe)?$/i.test(path.basename(resolved))) {
    throw new Error('MESTO_PSQL_PATH does not resolve to a trusted psql executable.');
  }
  if (process.platform !== 'win32' && ((stats.mode & 0o111) === 0 || (stats.mode & 0o022) !== 0)) {
    throw new Error('MESTO_PSQL_PATH permissions are not trusted.');
  }
  let executableBytes;
  try {
    executableBytes = fileSystem.readFileSync(resolved);
  } catch {
    throw new Error('MESTO_PSQL_PATH could not be hashed.');
  }
  const actualSha256 = crypto.createHash('sha256').update(executableBytes).digest();
  const expectedDigest = Buffer.from(expectedSha256, 'hex');
  if (!crypto.timingSafeEqual(actualSha256, expectedDigest)) {
    throw new Error('MESTO_PSQL_PATH SHA-256 does not match MESTO_PSQL_SHA256.');
  }
  return resolved;
}

function runSupabaseSchemaPreflight({
  args = process.argv.slice(2),
  environment = process.env,
  rootDirectory = path.join(__dirname, '..'),
  spawnSyncFn = spawnSync,
  validatePsqlPathFn = validatePsqlPath
} = {}) {
  const target = parseTarget(args);
  const connection = validateConnectionEnvironment(environment, target);
  const psqlPath = validatePsqlPathFn(environment);
  const migrationVersions = readMigrationVersions({ rootDirectory });
  const sql = buildSupabaseSchemaPreflightSql({ migrationVersions });
  const result = spawnSyncFn(psqlPath, ['-X', '--no-password', '--quiet', '--tuples-only', '--no-align', '--file=-'], {
    input: sql,
    encoding: 'utf8',
    env: childEnvironment(environment, connection),
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    const safeCode = `${result.stdout || ''}\n${result.stderr || ''}`.match(SAFE_FAILURE_PATTERN)?.[0];
    throw new Error(safeCode || 'MESTO_SCHEMA_PREFLIGHT_PSQL_FAILED');
  }
  const lines = String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) throw new Error('MESTO_SCHEMA_PREFLIGHT_UNEXPECTED_OUTPUT');
  let report;
  try {
    report = JSON.parse(lines[0]);
  } catch {
    throw new Error('MESTO_SCHEMA_PREFLIGHT_UNEXPECTED_OUTPUT');
  }
  if (report?.status !== 'pass' || report?.checks !== EXPECTED_CHECK_COUNT
    || report?.workflow?.publishing !== 0 || report?.workflow?.backlog !== 0) {
    throw new Error('MESTO_SCHEMA_PREFLIGHT_UNEXPECTED_OUTPUT');
  }
  return { target, checks: report.checks, workflow: report.workflow };
}

module.exports = {
  APP_TABLE_GRANTS,
  CHECK_CONSTRAINTS,
  EXPECTED_CHECK_COUNT,
  FOREIGN_KEYS,
  PRIMARY_KEYS,
  REQUIRED_COLUMNS,
  RPCS,
  REQUIRED_ACL_MIGRATION_VERSION,
  UNIQUE_INDEXES,
  buildSupabaseSchemaPreflightSql,
  childEnvironment,
  parseTarget,
  readMigrationVersions,
  runSupabaseSchemaPreflight,
  validateConnectionEnvironment,
  validatePsqlPath
};
