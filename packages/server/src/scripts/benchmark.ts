/**
 * autocannon benchmark for the public API.
 *
 * Usage: assumes the server is already running on http://localhost:3000
 * (start with `npm run dev` in another shell) and that the Bundesbank
 * fixture has been uploaded (otherwise BIC lookups will all be cache-negative
 * misses, which is still meaningful but won't show the positive-cache win).
 */
// @ts-expect-error - no type declarations published for autocannon
import autocannon from 'autocannon';

const URL = process.env.BENCH_URL ?? 'http://localhost:3000';
const DURATION = Number(process.env.BENCH_DURATION ?? 10);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 50);

async function run(title: string, path: string) {
  console.log(`\n=== ${title} ===`);
  const result = await autocannon({
    url: `${URL}${path}`,
    duration: DURATION,
    connections: CONNECTIONS,
  });
  console.log(`  req/s avg:   ${result.requests.average.toFixed(0)}`);
  console.log(`  latency p50: ${result.latency.p50}ms  p99: ${result.latency.p99}ms`);
  console.log(`  non-2xx:     ${result.non2xx}`);
}

async function main() {
  await run('validate (no BIC)', '/validate/DE89370400440532013000');
  await run('validate (with BIC, cached)', '/validate/DE89370400440532013000?getBIC=true');
  await run('validate (unknown bank, negative cache)', '/validate/DE89999999990000000000?getBIC=true');
  await run('countries', '/countries');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
