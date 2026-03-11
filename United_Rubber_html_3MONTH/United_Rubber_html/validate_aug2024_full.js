'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-08-01';
  const DATE_TO   = '2024-08-31';

  // CRD from Jan-29-2025 email:
  const CRD = { URIMH: 9.14, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66 };
  const CRD_TOTAL = 14.79;

  console.log('='.repeat(80));
  console.log('AUG 2024 — FULL RE-ANALYSIS vs CRD (from Jan-29 email)');
  console.log('CRD: URIMH=9.14, URIMP=3.13, URIPB=0.86, URIPU=1.66, Total=14.79 Cr');
  console.log('='.repeat(80));

  // ── STEP 1: Standard formula per site ─────────────────────────────────────
  const std = await db.query(`
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
  console.log('\n  Site   | DB Cr     | CRD Cr | Gap     | Gap%');
  console.log('  ' + '-'.repeat(55));
  for (const r of std.rows) {
    total += parseFloat(r.net_cr);
    const gap = (parseFloat(r.net_cr) - CRD[r.site]).toFixed(4);
    const pct = ((parseFloat(r.net_cr) - CRD[r.site]) / CRD[r.site] * 100).toFixed(1);
    console.log(`  ${r.site.padEnd(7)}| ${String(r.net_cr).padEnd(10)}| ${CRD[r.site].toFixed(2).padEnd(7)}| ${gap.padEnd(8)} | ${pct}%`);
  }
  console.log(`\n  TOTAL: ${total.toFixed(4)} Cr | CRD: ${CRD_TOTAL} | diff: ${(total - CRD_TOTAL).toFixed(4)}`);

  // ── STEP 2: Full status breakdown ─────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — All statuses per site (Aug 2024) — completeness check');
  console.log('='.repeat(80));

  const allSt = await db.query(`
    SELECT "Site_" AS site, "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Status_" NOT IN ('0','')
    GROUP BY site, "Status_"
    ORDER BY site, net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  let grandTotal = 0;
  for (const r of allSt.rows) {
    grandTotal += parseFloat(r.net_cr || 0);
    const mark = r['Status_'] === 'Exported To GL' ? ' ←' : '';
    console.log(`  ${r.site.padEnd(7)}| ${(r['Status_']||'').padEnd(22)} | ${String(r.inv).padEnd(6)} inv | ${r.net_cr} Cr${mark}`);
  }
  console.log(`\n  ALL statuses combined (excl -R): Grand total = ${grandTotal.toFixed(4)} Cr | CRD: ${CRD_TOTAL}`);
  console.log(`  Gap even with all statuses: ${(grandTotal - CRD_TOTAL).toFixed(4)} Cr`);

  // ── STEP 3: Invoice date coverage check ───────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — Date coverage: do we have full Aug 2024 data in DB?');
  console.log('='.repeat(80));

  const coverage = await db.query(`
    SELECT "Site_" AS site,
      MIN("Invoice_Date_(Date)") AS min_date,
      MAX("Invoice_Date_(Date)") AS max_date,
      COUNT(DISTINCT "Invoice_No_") AS total_inv
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  for (const r of coverage.rows) {
    console.log(`  ${r.site}: ${r.min_date} → ${r.max_date} | ${r.total_inv} total invoices (all statuses)`);
  }

  // ── STEP 4: LandingStage1 Aug 2024 partitions ─────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — LandingStage1 Aug 2024 partitions');
  console.log('='.repeat(80));

  const augTables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage1'
      AND table_name LIKE '%2024_aug%'
      AND table_name LIKE '%siheader%'
    ORDER BY table_name
  `);

  if (augTables.rows.length === 0) {
    console.log('  NO Aug 2024 siheader partition tables in LandingStage1!');
  } else {
    for (const row of augTables.rows) {
      const cnt = await db.query(`SELECT COUNT(*) AS c FROM "LandingStage1"."${row.table_name}"`);
      console.log(`  ${row.table_name}: ${cnt.rows[0].c} rows`);
    }
  }

  // ── STEP 5: URIMH weekly distribution ─────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 5 — URIMH: invoice week-by-week distribution (Exported To GL)');
  console.log('='.repeat(80));

  const weekDist = await db.query(`
    SELECT DATE_TRUNC('week', "Invoice_Date_(Date)"::DATE) AS wk,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr,
      MIN("Invoice_Date_(Date)") AS min_d,
      MAX("Invoice_Date_(Date)") AS max_d
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY 1 ORDER BY 1
  `, [DATE_FROM, DATE_TO]);

  for (const r of weekDist.rows) {
    console.log(`  Week of ${r.wk?.toISOString().substring(0,10)}: ${r.inv} inv | ${r.net_cr} Cr | ${r.min_d} → ${r.max_d}`);
  }

  // ── STEP 6: Approved invoices for URIMH Aug 2024 ──────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 6 — URIMH Aug 2024: Approved invoices (potential timing gap)');
  console.log('='.repeat(80));

  const approved = await db.query(`
    SELECT "Invoice_Type_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Approved'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_Type_"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  let approvedTotal = 0;
  for (const r of approved.rows) {
    approvedTotal += parseFloat(r.net_cr || 0);
    console.log(`  ${(r['Invoice_Type_']||'').padEnd(30)} | ${r.inv} inv | ${r.net_cr} Cr`);
  }
  console.log(`  URIMH Approved total: ${approvedTotal.toFixed(4)} Cr`);
  console.log(`  URIMH CRD gap: ${(7.6161 - 9.14).toFixed(4)} Cr`);
  console.log(`  If Approved were Exported in CRD: 7.6161 + ${approvedTotal.toFixed(4)} = ${(7.6161 + approvedTotal).toFixed(4)} Cr vs CRD 9.14`);

  // ── STEP 7: All URIMH Aug — all statuses vs CRD ───────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 7 — URIMH Aug: ALL statuses combined vs CRD 9.14 Cr');
  console.log('='.repeat(80));

  const urimhAll = await db.query(`
    SELECT "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Status_"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  let urimhGrand = 0;
  for (const r of urimhAll.rows) {
    if (r['Status_'] && r['Status_'] !== '0') urimhGrand += parseFloat(r.net_cr || 0);
    const mark = r['Status_'] === 'Exported To GL' ? ' ←' : '';
    console.log(`  ${(r['Status_']||'0').padEnd(22)} | ${String(r.inv).padEnd(6)} inv | ${r.net_cr} Cr${mark}`);
  }
  console.log(`\n  URIMH ALL statuses total: ${urimhGrand.toFixed(4)} Cr | CRD: 9.14 Cr | gap: ${(urimhGrand - 9.14).toFixed(4)}`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
