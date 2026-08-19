const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const migrationDirectory = path.join(root, 'supabase', 'migrations');
const hardeningMigrationName = '20260817092029_explicit_data_api_acl_and_function_hardening.sql';
const advisorMigrationName = '20260817121310_close_database_advisor_findings.sql';
const migration = fs.readFileSync(path.join(migrationDirectory, hardeningMigrationName), 'utf8');
const advisorMigration = fs.readFileSync(path.join(migrationDirectory, advisorMigrationName), 'utf8');
const schema = fs.readFileSync(path.join(root, 'supabase', 'schema.sql'), 'utf8');

const appTables = [
  'venues',
  'venue_submissions',
  'media_assets',
  'review_submissions',
  'reviews',
  'profiles',
  'external_identities',
  'favorites',
  'venue_memberships',
  'menu_items',
  'promotions',
  'audit_log'
];

const serviceRoleTableGrants = new Map([
  ['venues', 'select, insert, update, delete'],
  ['venue_submissions', 'select, insert'],
  ['media_assets', 'select, insert, update, delete'],
  ['review_submissions', 'select, insert'],
  ['reviews', 'select'],
  ['profiles', 'select, insert, update'],
  ['external_identities', 'select, insert'],
  ['favorites', 'select, insert, update, delete'],
  ['venue_memberships', 'select, insert, update, delete'],
  ['menu_items', 'select, insert, update, delete'],
  ['promotions', 'select, insert, update, delete'],
  ['audit_log', 'insert']
]);

const callableFunctions = [
  'public_catalog_summary\\(\\)',
  'moderate_venue_submission\\(uuid,text,text,text\\)',
  'create_venue_submission_with_media\\(jsonb,uuid\\[\\],uuid\\)',
  'moderate_venue_submission_with_media\\(uuid,text,text,text,jsonb,uuid\\)',
  'delete_venue_with_media\\(uuid\\)',
  'moderate_review_submission\\(uuid,text,text,text\\)'
];

const securityDefinerFunctions = [
  'moderate_venue_submission',
  'create_venue_submission_with_media',
  'moderate_venue_submission_with_media',
  'delete_venue_with_media',
  'moderate_review_submission'
];

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Supabase migration versions are unique and the ACL hardening migration follows the audited migrations', () => {
  const names = fs.readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort();
  const versions = names.map((name) => name.match(/^(\d+)_/)?.[1]);
  assert.equal(versions.every(Boolean), true);
  assert.equal(new Set(versions).size, versions.length);
  assert.ok(names.indexOf(hardeningMigrationName) > names.indexOf('20260811212027_venue_media_cleanup_receipts.sql'));
  assert.ok(names.indexOf(advisorMigrationName) > names.indexOf(hardeningMigrationName));
});

test('every app table is RLS-enabled, closed to browser roles, and minimally granted to service_role', () => {
  for (const table of appTables) {
    const name = escaped(table);
    assert.match(migration, new RegExp(`alter table public\\.${name} enable row level security;`, 'i'));
    for (const sql of [migration, schema]) {
      assert.match(
        sql,
        new RegExp(`revoke all on table public\\.${name} from public, anon, authenticated, service_role;`, 'i')
      );
      assert.match(
        sql,
        new RegExp(`grant ${serviceRoleTableGrants.get(table)} on table public\\.${name} to service_role;`, 'i')
      );
      assert.doesNotMatch(
        sql,
        new RegExp(`grant [^;]+ on table public\\.${name} to (?:public|anon|authenticated);`, 'i')
      );
      const serviceGrants = [...sql.matchAll(
        new RegExp(`grant ([^;]+) on table public\\.${name} to service_role;`, 'gi')
      )].map((match) => match[1].toLowerCase());
      assert.deepEqual(serviceGrants, [serviceRoleTableGrants.get(table)]);
      assert.match(sql, new RegExp(`alter table public\\.${name} enable row level security;`, 'i'));
    }
  }
});

test('the only app sequence is private and service_role receives usage only', () => {
  for (const sql of [migration, schema]) {
    assert.match(
      sql,
      /revoke all on sequence public\.audit_log_id_seq from public, anon, authenticated, service_role;/i
    );
    assert.match(sql, /grant usage on sequence public\.audit_log_id_seq to service_role;/i);
  }
  assert.doesNotMatch(migration, /grant (?:select|update|all).*sequence public\.audit_log_id_seq to service_role/i);
});

test('Data API function execution is deny-by-default with an explicit service_role allowlist', () => {
  for (const signature of callableFunctions) {
    for (const sql of [migration, schema]) {
      assert.match(
        sql,
        new RegExp(`revoke execute on function public\\.${signature} from public, anon, authenticated, service_role;`, 'i')
      );
      assert.match(
        sql,
        new RegExp(`grant execute on function public\\.${signature} to service_role;`, 'i')
      );
    }
  }
  for (const triggerFunction of ['touch_updated_at', 'guard_media_staging_tombstone']) {
    for (const sql of [migration, schema]) {
      assert.match(
        sql,
        new RegExp(`revoke execute on function public\\.${triggerFunction}\\(\\) from public, anon, authenticated, service_role;`, 'i')
      );
    }
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${triggerFunction}\\(\\)`, 'i'));
    assert.doesNotMatch(schema, new RegExp(`grant execute on function public\\.${triggerFunction}\\(\\)`, 'i'));
  }
});

test('every SECURITY DEFINER function has an empty search_path in the final schema', () => {
  assert.doesNotMatch(schema, /security definer set search_path = public/i);
  const securityDefiners = schema.match(/security definer set search_path = ''/gi) || [];
  assert.equal(securityDefiners.length, 5);
  for (const signature of callableFunctions.slice(1)) {
    assert.match(migration, new RegExp(`alter function public\\.${signature} set search_path = '';`, 'i'));
  }
  for (const functionName of securityDefinerFunctions) {
    const start = schema.indexOf(`create or replace function public.${functionName}(`);
    assert.notEqual(start, -1);
    const end = schema.indexOf('$$;', start);
    assert.notEqual(end, -1);
    const definition = schema.slice(start, end);
    for (const table of appTables) {
      const tablePattern = new RegExp(`\\b${escaped(table)}\\b`, 'gi');
      for (const match of definition.matchAll(tablePattern)) {
        assert.equal(
          definition.slice(Math.max(0, match.index - 7), match.index).toLowerCase(),
          'public.',
          `${functionName} must qualify ${table} while search_path is empty`
        );
      }
    }
  }
});

test('trigger helpers pin an empty search_path and remain uncallable', () => {
  for (const functionName of ['touch_updated_at', 'guard_media_staging_tombstone']) {
    assert.match(advisorMigration, new RegExp(`alter function public\\.${functionName}\\(\\) set search_path = '';`, 'i'));
    assert.match(schema, new RegExp(`function public\\.${functionName}\\(\\)[\\s\\S]*?language plpgsql set search_path = '' as \\$\\$`, 'i'));
  }
});

test('authenticated ownership policies use one initplan auth lookup', () => {
  const policies = [
    ['profiles', 'Users can read own profile', 'id'],
    ['favorites', 'Users manage own favorites', 'user_id'],
    ['venue_memberships', 'Merchants read own memberships', 'user_id']
  ];
  for (const [table, policy, column] of policies) {
    const policyPattern = new RegExp(
      `create policy "${policy}"[\\s\\S]*?on public\\.${table}[\\s\\S]*?to authenticated[\\s\\S]*?\\(\\(select auth\\.uid\\(\\)\\) = ${column}\\)`,
      'i'
    );
    assert.match(advisorMigration, policyPattern);
    assert.match(schema, policyPattern);
  }
  assert.doesNotMatch(schema, /using \(auth\.uid\(\) = (?:id|user_id)\)/i);
});

test('every advisor-reported foreign key has an exact partial covering index', () => {
  const indexes = [
    ['audit_log_actor_id_idx', 'audit_log', 'actor_id'],
    ['favorites_venue_id_idx', 'favorites', 'venue_id'],
    ['review_submissions_submitted_by_idx', 'review_submissions', 'submitted_by'],
    ['review_submissions_venue_id_idx', 'review_submissions', 'venue_id'],
    ['reviews_author_id_idx', 'reviews', 'author_id'],
    ['reviews_venue_id_idx', 'reviews', 'venue_id'],
    ['venue_submissions_submitted_by_idx', 'venue_submissions', 'submitted_by'],
    ['venues_created_by_idx', 'venues', 'created_by'],
    ['venues_owner_id_idx', 'venues', 'owner_id']
  ];
  for (const [name, table, column] of indexes) {
    const definition = new RegExp(
      `create index if not exists ${name}\\s+on public\\.${table}\\(${column}\\) where ${column} is not null;`,
      'i'
    );
    assert.match(advisorMigration, definition);
    assert.match(schema, definition);
  }
});

test('future public-schema objects do not inherit Data API privileges', () => {
  for (const sql of [migration, schema]) {
    assert.match(sql, /revoke all on schema public from public, anon, authenticated, service_role;/i);
    assert.match(sql, /grant usage on schema public to service_role;/i);
    assert.doesNotMatch(sql, /grant create on schema public to (?:public|anon|authenticated|service_role)/i);
    const schemaGrants = [...sql.matchAll(/grant ([^;]+) on schema public to service_role;/gi)]
      .map((match) => match[1].toLowerCase());
    assert.deepEqual(schemaGrants, ['usage']);
    assert.match(sql, /alter default privileges for role postgres in schema public\s+revoke all on tables from public, anon, authenticated, service_role;/i);
    assert.match(sql, /alter default privileges for role postgres in schema public\s+revoke all on sequences from public, anon, authenticated, service_role;/i);
    assert.match(sql, /alter default privileges for role postgres in schema public\s+revoke execute on functions from public, anon, authenticated, service_role;/i);
  }
});
