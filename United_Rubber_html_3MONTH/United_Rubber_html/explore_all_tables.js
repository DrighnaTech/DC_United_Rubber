'use strict';
const db = require('./db/connection');

(async () => {
  // List all tables in both schemas
  const tables = await db.query(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema IN ('LandingStage1','LandingStage2')
    ORDER BY table_schema, table_name
  `);

  console.log('ALL TABLES:');
  for (const r of tables.rows) {
    console.log(`  ${r.table_schema}.${r.table_name}`);
  }

  // Get columns for ALL LandingStage2 tables (not just siheader_all)
  const cols = await db.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'LandingStage2'
      AND table_name != 'mf_sales_si_siheader_all'
    ORDER BY table_name, ordinal_position
  `);

  console.log('\nLandingStage2 NON-HEADER TABLE COLUMNS:');
  let curTable = '';
  for (const r of cols.rows) {
    if (r.table_name !== curTable) {
      curTable = r.table_name;
      console.log(`\n  === ${curTable} ===`);
    }
    console.log(`    ${r.column_name} (${r.data_type})`);
  }

  // Count rows in each LandingStage2 table
  const ls2Tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage2' ORDER BY table_name
  `);

  console.log('\nROW COUNTS:');
  for (const t of ls2Tables.rows) {
    const cnt = await db.query(`SELECT COUNT(*) AS c FROM "LandingStage2"."${t.table_name}"`);
    console.log(`  ${t.table_name}: ${cnt.rows[0].c} rows`);
  }

  // List LandingStage1 Dec 2024 tables
  const decTables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage1'
      AND table_name LIKE '%dec%'
    ORDER BY table_name
  `);

  console.log('\nLandingStage1 DECEMBER TABLES:');
  for (const r of decTables.rows) {
    console.log(`  ${r.table_name}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
