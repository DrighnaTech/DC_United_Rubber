'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2025-01-01';
  const DATE_TO   = '2025-01-28';

  // CRD from email (Jan 29 2025 email, date range 01/04/2024 to 28/01/2025)
  const CRD = { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41 };
  const CRD_TOTAL = 16.12;

  console.log('='.repeat(80));
  console.log('JAN 2025 (1-28) — DB vs CRD (from email dated Jan 29, 2025)');
  console.log('CRD: URIMH=8.82, URIMP=5.34, URIPB=0.55, URIPU=1.41, Total=16.12 Cr');
  console.log('='.repeat(80));

  // ── STEP 1: Standard formula per site ─────────────────────────────────────
  const standard = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let total = 0;
  console.log('\n  Site   | Our DB Cr | CRD Cr | Gap     | Gap%');
  console.log('  ' + '-'.repeat(55));
  for (const r of standard.rows) {
    total += parseFloat(r.net_cr);
    const gap = (parseFloat(r.net_cr) - CRD[r.site]).toFixed(4);
    const pct = ((parseFloat(r.net_cr) - CRD[r.site]) / CRD[r.site] * 100).toFixed(1);
    console.log(`  ${r.site.padEnd(7)}| ${String(r.net_cr).padEnd(10)}| ${CRD[r.site].toFixed(2).padEnd(7)}| ${gap.padEnd(8)} | ${pct}%`);
  }
  console.log(`\n  TOTAL  | ${total.toFixed(4).padEnd(10)}| ${CRD_TOTAL.toFixed(2).padEnd(7)}| ${(total - CRD_TOTAL).toFixed(4).padEnd(8)} | ${((total - CRD_TOTAL) / CRD_TOTAL * 100).toFixed(1)}%`);

  // ── STEP 2: Invoice date distribution for URIMP — coverage check ──────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — URIMP: Invoice date distribution in our DB for Jan 2025');
  console.log('(Check if we have full-month coverage or only partial weeks)');
  console.log('='.repeat(80));

  const urimpDist = await db.query(`
    SELECT DATE_TRUNC('week', "Invoice_Date_(Date)"::DATE) AS week_start,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr,
      MIN("Invoice_Date_(Date)") AS min_date,
      MAX("Invoice_Date_(Date)") AS max_date
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY 1 ORDER BY 1
  `, [DATE_FROM, DATE_TO]);

  for (const r of urimpDist.rows) {
    console.log(`  Week of ${r.week_start?.toISOString().substring(0,10)}: ${r.inv} inv | ${r.net_cr} Cr | dates: ${r.min_date} → ${r.max_date}`);
  }

  // ── STEP 3: All Jan 2025 URIMP data — max invoice date in DB ──────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — URIMP: what is the latest invoice date in our DB for Jan 2025?');
  console.log('='.repeat(80));

  const maxDate = await db.query(`
    SELECT MIN("Invoice_Date_(Date)") AS min_inv_date,
           MAX("Invoice_Date_(Date)") AS max_inv_date,
           COUNT(DISTINCT "Invoice_No_") AS total_inv
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
  `, [DATE_FROM, DATE_TO]);
  console.log(`  URIMP Jan 2025 coverage: ${maxDate.rows[0].min_inv_date} → ${maxDate.rows[0].max_inv_date}`);
  console.log(`  Total invoices (all statuses): ${maxDate.rows[0].total_inv}`);

  // Same for URIMH
  const maxDateH = await db.query(`
    SELECT MIN("Invoice_Date_(Date)") AS min_inv_date,
           MAX("Invoice_Date_(Date)") AS max_inv_date,
           COUNT(DISTINCT "Invoice_No_") AS total_inv
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
  `, [DATE_FROM, DATE_TO]);
  console.log(`  URIMH Jan 2025 coverage: ${maxDateH.rows[0].min_inv_date} → ${maxDateH.rows[0].max_inv_date}`);
  console.log(`  Total invoices (all statuses): ${maxDateH.rows[0].total_inv}`);

  // ── STEP 4: Check what partitions exist for Jan 2025 in LandingStage2 ──────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — What is the Created_Date range for Jan 2025 rows in our DB?');
  console.log('(When was this data actually captured in our ETL?)');
  console.log('='.repeat(80));

  const etlRange = await db.query(`
    SELECT "Site_" AS site,
      MIN("Created_Date"::TIMESTAMP) AS etl_min,
      MAX("Created_Date"::TIMESTAMP) AS etl_max,
      COUNT(DISTINCT "Invoice_No_") AS inv
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  for (const r of etlRange.rows) {
    console.log(`  ${r.site}: ETL Created ${r.etl_min?.toISOString().substring(0,10)} → ${r.etl_max?.toISOString().substring(0,10)} | ${r.inv} inv`);
  }

  // ── STEP 5: Row count per partition for Jan 2025 data ─────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 5 — LandingStage1: Jan 2025 partition tables (do they exist?)');
  console.log('='.repeat(80));

  const janTables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage1'
      AND table_name LIKE '%2025_jan%'
    ORDER BY table_name
  `);
  if (janTables.rows.length === 0) {
    console.log('  NO Jan 2025 partition tables found in LandingStage1!');
    console.log('  This means Jan 2025 data was captured in Dec 2024 partition or later tables only.');
  } else {
    for (const r of janTables.rows) console.log(`  ${r.table_name}`);
  }

  // ── STEP 6: All URIMP Jan 2025 data across all statuses with amounts ──────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 6 — URIMP: Total across ALL statuses vs CRD 5.34 Cr');
  console.log('='.repeat(80));

  const allStatus = await db.query(`
    SELECT "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Status_"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  let urimpTotal = 0;
  for (const r of allStatus.rows) {
    urimpTotal += parseFloat(r.net_cr || 0);
    console.log(`  ${(r['Status_']||'').padEnd(22)} | ${String(r.inv).padEnd(6)} inv | ${r.net_cr} Cr`);
  }
  console.log(`\n  URIMP ALL statuses total: ${urimpTotal.toFixed(4)} Cr | CRD: 5.34 Cr | Gap: ${(urimpTotal - 5.34).toFixed(4)} Cr`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
