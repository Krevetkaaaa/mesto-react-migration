import preflight from '../lib/supabase-schema-preflight.js';

try {
  const result = preflight.runSupabaseSchemaPreflight();
  console.log(`Supabase schema preflight passed for ${result.target}: ${result.checks} redacted checks; workflow publishing=${result.workflow.publishing}, backlog=${result.workflow.backlog}.`);
} catch (error) {
  console.error(error?.message || 'MESTO_SCHEMA_PREFLIGHT_FAILED');
  process.exitCode = 1;
}
