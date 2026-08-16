import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const remote = args.includes('--remote');
const command = args.find((arg) => !arg.startsWith('--')) ?? 'overview';
const release = args.find((arg) => arg.startsWith('--release='))?.slice('--release='.length);
const runId = args.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
const hours = Math.max(1, Math.min(720, Number(args.find((arg) => arg.startsWith('--hours='))?.slice('--hours='.length) ?? 24)));
const since = Date.now() - hours * 3_600_000;
const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;
const releaseFilter = release ? ` AND release_version = ${literal(release)}` : '';

const queries = {
  overview: `SELECT release_version, flush_reason, COUNT(*) AS batches, COUNT(DISTINCT run_id) AS runs FROM telemetry_batches WHERE received_at >= ${since}${releaseFilter} GROUP BY release_version, flush_reason ORDER BY release_version, flush_reason LIMIT 200;`,
  incidents: `SELECT b.release_version, i.kind, i.stage, i.error_name, i.error_fingerprint, COUNT(*) AS occurrences FROM telemetry_incidents i JOIN telemetry_batches b ON b.batch_id = i.batch_id WHERE i.happened_at >= ${since}${releaseFilter} GROUP BY b.release_version, i.kind, i.stage, i.error_name, i.error_fingerprint ORDER BY occurrences DESC LIMIT 200;`,
  timeline: runId ? `SELECT batch_id, flush_reason, started_at, ended_at, summary_json FROM telemetry_batches WHERE run_id = ${literal(runId)} ORDER BY started_at LIMIT 100;` : null,
  uploads: `SELECT release_version, storage_mode, COUNT(*) AS outcomes, SUM(json_extract(summary_json, '$.upload.completed')) AS completed, SUM(json_extract(summary_json, '$.upload.partial')) AS partial, SUM(json_extract(summary_json, '$.upload.failed')) AS failed, SUM(json_extract(summary_json, '$.upload.bytes')) AS bytes, SUM(json_extract(summary_json, '$.upload.job.total_ms')) AS duration_ms FROM telemetry_batches WHERE received_at >= ${since} AND flush_reason = 'upload_complete'${releaseFilter} GROUP BY release_version, storage_mode LIMIT 200;`,
  reliability: `SELECT release_version, COUNT(DISTINCT CASE WHEN flush_reason = 'recording_complete' THEN run_id END) AS sealed_runs, COUNT(DISTINCT CASE WHEN flush_reason IN ('incident','recovery') THEN run_id END) AS affected_runs, SUM(json_extract(summary_json, '$.capture.attempts')) AS capture_attempts, SUM(json_extract(summary_json, '$.capture.failures')) AS capture_failures FROM telemetry_batches WHERE received_at >= ${since}${releaseFilter} GROUP BY release_version LIMIT 200;`,
};

const sql = queries[command];
if (!sql) {
  console.error(command === 'timeline' ? 'timeline requires --run-id=<telemetry-run-uuid>' : `Unknown query: ${command}`);
  process.exitCode = 2;
} else if (!remote) {
  console.log(sql);
  console.log('\nGenerated only. Add --remote to execute this read-only query against D1.');
} else {
  const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'recording-extension-telemetry', '--remote', '--command', sql], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
