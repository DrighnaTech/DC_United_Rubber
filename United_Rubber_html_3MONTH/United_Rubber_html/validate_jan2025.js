'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2025-01-01';
  const DATE_TO   = '2025-01-28';

  // Jan 1-28 2025: validate vs client CRD
  // We don't know the exact CRD values yet — run this to see what our DB gives
  // and identify any Approved invoices that could have been Exported at CRD snapshot time.

  const CRD = { URIMH: null, URIMP: null, URIPB: null, URIPU: null }; // fill in if known

  console.log('='.repeat(80));
  console.log('JAN 2025 (1-28) — Standard formula: Exported To GL, NOT LIKE %-R');
  console.log('='.repeat(80));

  // ── STEP 1: Our standard formula per site ─────────────────────────────────
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
  console.log('\n  Site   | Invoices | Net Cr (our DB)');
  console.log('  ' + '-'.repeat(45));
  for (const r of standard.rows) {
    total += parseFloat(r.net_cr);
    console.log(`  ${r.site.padEnd(7)}| ${String(r.inv).padEnd(9)}| ${r.net_cr}`);
  }
  console.log(`\n  TOTAL: ${total.toFixed(4)} Cr`);

  // ── STEP 2: Approved invoices (not exported) — candidates for CRD gap ─────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — Approved (not Exported) invoices in Jan 2025 window');
  console.log('These might explain CRD gap if they were Exported at CRD snapshot time');
  console.log('='.repeat(80));

  const approved = await db.query(`
    SELECT "Site_" AS site, "Invoice_Type_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" IN ('Approved','Released')
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site, "Invoice_Type_"
    ORDER BY site, net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  for (const r of approved.rows) {
    console.log(`  ${r.site} | ${(r['Invoice_Type_']||'').padEnd(25)} | ${r.inv} inv | ${r.net_cr} Cr`);
  }

  // ── STEP 3: Status breakdown ───────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — Full status breakdown per site');
  console.log('='.repeat(80));

  const statusBrk = await db.query(`
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

  for (const r of statusBrk.rows) {
    const mark = r['Status_'] === 'Exported To GL' ? ' ←' : '';
    console.log(`  ${r.site.padEnd(7)}| ${(r['Status_']||'').padEnd(20)} | ${String(r.inv).padEnd(6)} inv | ${r.net_cr} Cr${mark}`);
  }

  // ── STEP 4: STO (Stock Transfer) Approved invoices — high priority ─────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — STO (Stock Transfer) Approved invoices detail');
  console.log('(Same pattern as Dec 2024 URIMH gap — STO exported late)');
  console.log('='.repeat(80));

  const stoApproved = await db.query(`
    SELECT "Invoice_No_", "Site_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      ARRAY_AGG(DISTINCT "Status_") AS statuses,
      TO_CHAR(MAX("Created_Date"::TIMESTAMP),'YYYY-MM-DD') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Invoice_Type_" LIKE 'STO%'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    ORDER BY "Site_", net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  for (const r of stoApproved.rows) {
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${r['Site_'].padEnd(6)} | ${(r['Invoice_Type_']||'').padEnd(20)} | ${String(r.net_cr).padEnd(12)} Cr | ${r.statuses.join(',')}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
