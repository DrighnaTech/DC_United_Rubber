'use strict';
const db = require('./db/connection');

(async () => {
  // First list ALL LandingStage2 tables
  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage2' ORDER BY table_name
  `);

  console.log('LandingStage2 tables:');
  for (const t of tables.rows) {
    console.log(`  ${t.table_name}`);
  }

  // For each non-header table, check if it has Site_, Invoice_No_, Amount_ columns
  for (const t of tables.rows) {
    if (t.table_name === 'mf_sales_si_siheader_all') continue;

    const cols = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'LandingStage2' AND table_name = $1
      ORDER BY ordinal_position
    `, [t.table_name]);

    console.log(`\n=== ${t.table_name} ===`);
    console.log(`  Columns: ${cols.rows.map(c => c.column_name).join(', ')}`);

    // Check row count
    const cnt = await db.query(`SELECT COUNT(*) AS c FROM "LandingStage2"."${t.table_name}"`);
    console.log(`  Rows: ${cnt.rows[0].c}`);

    // Sample 3 rows
    const sample = await db.query(`SELECT * FROM "LandingStage2"."${t.table_name}" LIMIT 3`);
    if (sample.rows.length > 0) {
      console.log(`  Sample row keys: ${Object.keys(sample.rows[0]).join(', ')}`);
      for (const r of sample.rows) {
        const vals = Object.entries(r).map(([k,v]) => `${k}=${v}`).join(' | ');
        console.log(`    ${vals.substring(0, 200)}`);
      }
    }
  }

  // Now check: does the item detail table have different Amount totals for URIMP Dec?
  // Try to find invoice-level amounts from the export/item tables
  console.log('\n' + '='.repeat(80));
  console.log('CHECKING: Do export tables have URIMP Dec 2024 data?');
  console.log('='.repeat(80));

  for (const t of tables.rows) {
    if (t.table_name === 'mf_sales_si_siheader_all') continue;

    // Check if table has Invoice_No_ column
    const hasInv = await db.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'LandingStage2' AND table_name = $1
        AND column_name = 'Invoice_No_'
    `, [t.table_name]);

    if (hasInv.rows.length === 0) {
      console.log(`  ${t.table_name}: NO Invoice_No_ column`);
      continue;
    }

    // Check if has Site_ column
    const hasSite = await db.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'LandingStage2' AND table_name = $1
        AND column_name = 'Site_'
    `, [t.table_name]);

    // Check if has any date column
    const dateCols = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'LandingStage2' AND table_name = $1
        AND column_name LIKE '%Date%'
    `, [t.table_name]);

    console.log(`  ${t.table_name}: Has Invoice_No_=YES, Site_=${hasSite.rows.length > 0 ? 'YES' : 'NO'}, Date cols: ${dateCols.rows.map(c => c.column_name).join(', ') || 'NONE'}`);

    // Try to count URIMP Dec invoices if possible
    if (hasSite.rows.length > 0) {
      try {
        const invCnt = await db.query(`
          SELECT COUNT(DISTINCT "Invoice_No_") AS cnt
          FROM "LandingStage2"."${t.table_name}"
          WHERE "Site_" = 'URIMP'
            AND "Invoice_No_" NOT LIKE '%-R'
        `);
        console.log(`    URIMP invoice count (all dates): ${invCnt.rows[0].cnt}`);
      } catch(e) {
        console.log(`    Error querying: ${e.message.substring(0,100)}`);
      }
    }
  }

  // Also check: TrendCTE on _all for URIMP Dec — with 6 decimal precision
  console.log('\n' + '='.repeat(80));
  console.log('URIMP Dec 2024 TrendCTE — 6 decimal precision');
  console.log('='.repeat(80));

  const precise = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      COUNT(*) AS rows,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS net_cr,
      SUM("Amount_"::NUMERIC) AS raw_sum
    FROM deduped
  `);

  console.log(`  Rows: ${precise.rows[0].rows}`);
  console.log(`  Invoices: ${precise.rows[0].inv}`);
  console.log(`  Net Cr (6dp): ${precise.rows[0].net_cr}`);
  console.log(`  Raw sum: ${precise.rows[0].raw_sum}`);
  console.log(`  CRD: 3.4010 Cr = 34010000 raw`);
  console.log(`  Diff raw: ${parseFloat(precise.rows[0].raw_sum) - 34010000}`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
