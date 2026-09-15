const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transformSync } = require('next/dist/build/swc');

function loadTypeScript(file, dependencies = {}) {
  const output = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
    module: { type: 'commonjs' },
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const contract = loadTypeScript('lib/notification-contract.ts');
const now = new Date('2026-09-15T05:00:00.000Z');
const cutoff = contract.getNotificationCutoff(now);
const row = (id, fired_at, kind = 'medication') => ({
  notification_id: id, fired_at, kind, title: 'Synthetic QA', body: 'Synthetic QA',
  url: '/', read_at: null,
});
const seed = [
  row('expired', new Date(Date.parse(cutoff) - 1).toISOString()),
  row('boundary', cutoff),
  row('recent', '2026-09-15T04:59:00.000Z'),
  row('middle', '2026-08-30T05:00:00.000Z'),
  row('hidden-kind', now.toISOString(), 'focus'),
];
let rows = seed;
const queries = [];
const repository = loadTypeScript('lib/notifications.ts', {
  '@/lib/notification-contract': contract,
  '@/lib/supabase/client': {
    createBrowserSupabaseClient() {
      return {
        from(table) {
          assert.equal(table, 'app_notifications');
          let result = [...rows];
          const query = {
            select() { return query; },
            in(column, values) { result = result.filter(row => values.includes(row[column])); return query; },
            gte(column, value) { queries.push(['gte', column, value]); result = result.filter(row => row[column] >= value); return query; },
            order(column, { ascending }) {
              queries.push(['order', column, ascending]);
              result.sort((a, b) => ascending ? a[column].localeCompare(b[column]) : b[column].localeCompare(a[column]));
              return Promise.resolve({ data: result, error: null });
            },
          };
          return query;
        },
      };
    },
  },
});
(async () => {
  assert.deepEqual((await repository.listRecentNotifications(now)).map(n => n.id), ['recent', 'middle', 'boundary']);
  assert.deepEqual(queries, [['gte', 'fired_at', cutoff], ['order', 'fired_at', false]]);
  assert.equal(Date.parse(now) - Date.parse(cutoff), 90 * 24 * 60 * 60 * 1000);
  rows = [];
  assert.deepEqual(await repository.listRecentNotifications(now), []);
  console.log('PASS actual notification repository: descending, inclusive 90-day cutoff, expired exclusion, hidden kinds, empty; network=0');
})().catch(error => { console.error(error); process.exitCode = 1; });
