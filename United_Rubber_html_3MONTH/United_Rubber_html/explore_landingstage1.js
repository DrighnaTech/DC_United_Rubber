'use strict';
const db = require('./db/connection');

(async () => {

  // ── STEP 1: All tables in LandingStage1 schema ────────────────────────────
  console.log('='.repeat(80));
  console.log('STEP 1 — All tables in LandingStage1 schema');
  console.log('='.repeat(80));

  const tablesRes = await db.query(`
    SELECT table_name,
      pg_size_pretty(pg_total_relation_size(quote_ident(table_schema)||'.'||quote_ident(table_name))) AS size
    FROM information_schema.tables
    WHERE table_schema = 'LandingStage1'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  for (const r of tablesRes.rows) {
    console.log(`  ${r.table_name.padEnd(60)} ${r.size}`);
  }
  console.log(`\n  Total tables: ${tablesRes.rows.length}`);

  // ── STEP 2: Find tables with SI (Sales Invoice) in name ───────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — Tables with "si" or "sales" in name');
  console.log('='.repeat(80));

  const siTables = tablesRes.rows.filter(r =>
    r.table_name.toLowerCase().includes('si') ||
    r.table_name.toLowerCase().includes('sales') ||
    r.table_name.toLowerCase().includes('invoice')
  );
  for (const r of siTables) {
    console.log(`  ${r.table_name.padEnd(60)} ${r.size}`);
  }

  // ── STEP 3: Check row counts and date range for SI-related tables ─────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — Row counts and date range for SI tables');
  console.log('='.repeat(80));

  for (const t of siTables.slice(0, 15)) {
    try {
      const cnt = await db.query(`SELECT COUNT(*) AS cnt FROM "LandingStage1"."${t.table_name}"`);
      console.log(`\n  ${t.table_name}: ${cnt.rows[0].cnt} rows`);

      // Get column names
      const cols = await db.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'LandingStage1' AND table_name = $1
        ORDER BY ordinal_position LIMIT 30
      `, [t.table_name]);
      const colNames = cols.rows.map(r => r.column_name);
      console.log(`    Columns (first 30): ${colNames.join(', ')}`);

      // Try to find a date column and check Dec 2024 data
      const dateCol = colNames.find(c =>
        c.toLowerCase().includes('date') || c.toLowerCase().includes('period')
      );
      if (dateCol && parseInt(cnt.rows[0].cnt) > 0) {
        try {
          const dateRange = await db.query(`
            SELECT MIN("${dateCol}") AS min_date, MAX("${dateCol}") AS max_date
            FROM "LandingStage1"."${t.table_name}"
          `);
          console.log(`    Date range (${dateCol}): ${dateRange.rows[0].min_date} → ${dateRange.rows[0].max_date}`);
        } catch(e) { /* ignore */ }
      }
    } catch(e) {
      console.log(`  ${t.table_name}: ERROR — ${e.message.substring(0,60)}`);
    }
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
