import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const migrationPath = new URL(
  "../supabase/migrations/20260830093324_reconcile_mood_record_content_constraints.sql",
  import.meta.url,
);

const migration = await readFile(migrationPath, "utf8");

async function loadPGlite() {
  const moduleSpecifier = process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href
    : "@electric-sql/pglite";

  try {
    return await import(moduleSpecifier);
  } catch (error) {
    throw new Error(
      "Install @electric-sql/pglite or set PGLITE_MODULE_PATH to its ESM entrypoint before running this fixture.",
      { cause: error },
    );
  }
}

const { PGlite } = await loadPGlite();

const baseSchema = `
  create table public.mood_records (
    user_id text not null,
    mood_date date not null,
    details jsonb,
    clinic_phrase text,
    primary key (user_id, mood_date)
  );
`;

const devConstraints = `
  alter table public.mood_records
    add constraint mood_records_details_is_object
      check (details is null or pg_catalog.jsonb_typeof(details) = 'object'),
    add constraint mood_records_clinic_phrase_length
      check (
        clinic_phrase is null
        or pg_catalog.char_length(pg_catalog.btrim(clinic_phrase)) between 1 and 600
      );
`;

async function expectCheckViolation(operation, label) {
  await assert.rejects(
    operation,
    (error) => error?.code === "23514",
    `${label}: expected SQLSTATE 23514`,
  );
}

async function readSchema(db) {
  const columns = await db.query(`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'mood_records'
      and column_name in ('details', 'clinic_phrase')
    order by column_name;
  `);

  const constraints = await db.query(`
    select
      constraint_name,
      check_clause
    from information_schema.check_constraints
    where constraint_schema = 'public'
      and constraint_name in (
        'mood_records_details_is_object',
        'mood_records_clinic_phrase_length'
      )
    order by constraint_name;
  `);

  const validation = await db.query(`
    select conname, convalidated
    from pg_catalog.pg_constraint
    where conrelid = 'public.mood_records'::pg_catalog.regclass
      and conname in (
        'mood_records_details_is_object',
        'mood_records_clinic_phrase_length'
      )
    order by conname;
  `);

  const indexes = await db.query(`
    select indexname, indexdef
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'mood_records'
    order by indexname;
  `);

  return {
    columns: columns.rows,
    constraints: constraints.rows,
    validation: validation.rows,
    indexes: indexes.rows,
  };
}

function assertCanonicalSchema(schema, label) {
  assert.deepEqual(
    schema.columns,
    [
      {
        column_name: "clinic_phrase",
        data_type: "text",
        is_nullable: "YES",
        column_default: null,
      },
      {
        column_name: "details",
        data_type: "jsonb",
        is_nullable: "YES",
        column_default: null,
      },
    ],
    `${label}: canonical column contract mismatch`,
  );

  assert.equal(
    schema.constraints.length,
    2,
    `${label}: expected two CHECK constraints`,
  );
  const detailsConstraint = schema.constraints.find(
    ({ constraint_name }) => constraint_name === "mood_records_details_is_object",
  );
  const clinicConstraint = schema.constraints.find(
    ({ constraint_name }) => constraint_name === "mood_records_clinic_phrase_length",
  );

  assert.ok(detailsConstraint, `${label}: details CHECK constraint is missing`);
  assert.match(
    detailsConstraint.check_clause,
    /details IS NULL.*jsonb_typeof\(details\).*'object'/i,
    `${label}: details CHECK definition mismatch`,
  );
  assert.ok(clinicConstraint, `${label}: clinic_phrase CHECK constraint is missing`);
  assert.match(
    clinicConstraint.check_clause,
    /clinic_phrase IS NULL.*char_length\(btrim\(clinic_phrase\)\).*1.*300/is,
    `${label}: clinic_phrase CHECK definition mismatch`,
  );
  assert.deepEqual(
    schema.validation,
    [
      { conname: "mood_records_clinic_phrase_length", convalidated: true },
      { conname: "mood_records_details_is_object", convalidated: true },
    ],
    `${label}: constraints must finish validated`,
  );
  assert.equal(schema.indexes.length, 1, `${label}: migration must not add an index`);
  assert.equal(schema.indexes[0].indexname, "mood_records_pkey");
}

async function assertPayloadContract(db, label) {
  await db.exec(`
    insert into public.mood_records (user_id, mood_date, details, clinic_phrase)
    values ('valid-object', date '2026-01-01', '{"focus": 4}'::jsonb, ' 진료 메모 ');
  `);

  await expectCheckViolation(
    () =>
      db.exec(`
        insert into public.mood_records (user_id, mood_date, details)
        values ('invalid-array', date '2026-01-02', '[]'::jsonb);
      `),
    `${label}: details array`,
  );

  await expectCheckViolation(
    () =>
      db.exec(`
        insert into public.mood_records (user_id, mood_date, clinic_phrase)
        values ('invalid-blank', date '2026-01-03', '   ');
      `),
    `${label}: blank clinic_phrase`,
  );

  await expectCheckViolation(
    () =>
      db.exec(`
        insert into public.mood_records (user_id, mood_date, clinic_phrase)
        values ('invalid-301', date '2026-01-04', pg_catalog.repeat('가', 301));
      `),
    `${label}: 301-character clinic_phrase`,
  );

  await db.exec(`
    insert into public.mood_records (user_id, mood_date, clinic_phrase)
    values ('valid-300', date '2026-01-05', pg_catalog.repeat('가', 300));

    insert into public.mood_records (user_id, mood_date, details, clinic_phrase)
    values ('valid-null', date '2026-01-06', null, null);
  `);
}

async function runSchemaScenario(label, setupSql) {
  const db = new PGlite();
  await db.waitReady;

  try {
    await db.exec(baseSchema);
    if (setupSql) {
      await db.exec(setupSql);
    }

    await db.exec(migration);
    const initialSchema = await readSchema(db);
    assertCanonicalSchema(initialSchema, label);
    await assertPayloadContract(db, label);

    // Reapplying the forward reconciliation must leave the same canonical schema.
    await db.exec(migration);
    const reappliedSchema = await readSchema(db);
    assert.deepEqual(reappliedSchema, initialSchema, `${label}: reapply changed schema`);

    return initialSchema;
  } finally {
    await db.close();
  }
}

async function runPreflightFailure(
  label,
  setupSql,
  violatingInsert,
  expectedMessage,
  expectedConstraintCount,
) {
  const db = new PGlite();
  await db.waitReady;

  try {
    await db.exec(baseSchema);
    if (setupSql) {
      await db.exec(setupSql);
    }
    await db.exec(violatingInsert);
    await assert.rejects(
      () => db.exec(migration),
      (error) => error?.code === "23514" && error.message.includes(expectedMessage),
      `${label}: migration must fail before changing schema`,
    );

    const rowCount = await db.query(
      "select pg_catalog.count(*)::integer as count from public.mood_records;",
    );
    assert.equal(rowCount.rows[0].count, 1, `${label}: violating data was modified`);

    const constraints = await db.query(`
      select pg_catalog.count(*)::integer as count
      from pg_catalog.pg_constraint
      where conrelid = 'public.mood_records'::pg_catalog.regclass
        and conname in (
          'mood_records_details_is_object',
          'mood_records_clinic_phrase_length'
        );
    `);
    assert.equal(
      constraints.rows[0].count,
      expectedConstraintCount,
      `${label}: constraints changed after failure`,
    );
  } finally {
    await db.close();
  }
}

const versionDb = new PGlite();
await versionDb.waitReady;
const version = (await versionDb.query("select version() as version;")).rows[0]
  .version;
await versionDb.close();

const productionSchema = await runSchemaScenario("Production-shaped schema", "");
const devSchema = await runSchemaScenario("Dev-shaped schema", devConstraints);
assert.deepEqual(devSchema, productionSchema, "Production and Dev did not converge");

await runPreflightFailure(
  "non-object details preflight",
  "",
  `insert into public.mood_records (user_id, mood_date, details)
   values ('existing-array', date '2026-02-01', '[]'::jsonb);`,
  "details_non_object=1",
  0,
);
await runPreflightFailure(
  "blank clinic_phrase preflight",
  "",
  `insert into public.mood_records (user_id, mood_date, clinic_phrase)
   values ('existing-blank', date '2026-02-02', '   ');`,
  "clinic_phrase_blank=1",
  0,
);
await runPreflightFailure(
  "Dev 600-to-300 clinic_phrase preflight",
  devConstraints,
  `insert into public.mood_records (user_id, mood_date, clinic_phrase)
   values ('existing-301', date '2026-02-03', pg_catalog.repeat('가', 301));`,
  "clinic_phrase_over_300=1",
  2,
);

console.log(`Mood record content constraint DB fixtures passed on ${version}`);
