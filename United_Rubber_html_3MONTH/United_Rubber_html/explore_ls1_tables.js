'use strict';
const db = require('./db/connection');

(async () => {
  // Find distinct table name patterns in LandingStage1
  const r = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage1' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  // Group by prefix
  const patterns = {};
  for (const row of r.rows) {
    const name = row.table_name;
    const match = name.match(/^(mf_\w+?)_(\d{4}|all)/);
    const prefix = match ? match[1] : name;
    if (!patterns[prefix]) patterns[prefix] = [];
    patterns[prefix].push(name);
  }

  console.log('='.repeat(80));
  console.log('TABLE GROUPS in LandingStage1:');
  console.log('='.repeat(80));
  for (const [p, tables] of Object.entries(patterns).sort()) {
    // Find if any table has dec_2024 data
    const decTables = tables.filter(t => t.includes('2024_dec') || t.includes('dec'));
    console.log(`\n${p} (${tables.length} tables)`);
    if (decTables.length > 0) console.log(`  Dec 2024 tables: ${decTables.slice(0,5).join(', ')}`);
    else console.log(`  Sample tables: ${tables.slice(0,3).join(', ')}`);
  }

  // ── Find SI Header tables specifically ────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('SI HEADER tables (daily granular):');
  console.log('='.repeat(80));

  const siHeaderTables = r.rows
    .map(x => x.table_name)
    .filter(n => n.includes('siheader') && !n.includes('all'));

  console.log(`\nTotal SI header tables: ${siHeaderTables.length}`);

  // Find Dec 2024 SI header tables
  const decSiTables = siHeaderTables.filter(n => n.includes('2024_dec'));
  console.log(`Dec 2024 SI header tables (${decSiTables.length}):`);
  for (const t of decSiTables.sort()) console.log(`  ${t}`);

  // ── Check one Dec SI header table structure ──────────────────────────────
  if (decSiTables.length > 0) {
    const sampleTable = decSiTables[0];
    console.log(`\n--- Sample table structure: ${sampleTable} ---`);

    const cnt = await db.query(`SELECT COUNT(*) AS cnt FROM "LandingStage1"."${sampleTable}"`);
    console.log(`Rows: ${cnt.rows[0].cnt}`);

    const cols = await db.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'LandingStage1' AND table_name = $1
      ORDER BY ordinal_position
    `, [sampleTable]);
    console.log('Columns:');
    for (const c of cols.rows) console.log(`  ${c.column_name.padEnd(45)} ${c.data_type}`);

    // Sample data
    const sample = await db.query(`SELECT * FROM "LandingStage1"."${sampleTable}" LIMIT 3`);
    console.log('\nSample rows:');
    for (const row of sample.rows) {
      console.log(JSON.stringify(row).substring(0, 200));
    }
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
