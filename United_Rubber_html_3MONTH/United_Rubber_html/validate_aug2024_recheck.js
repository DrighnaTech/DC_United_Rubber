'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-08-01';
  const DATE_TO   = '2024-08-31';

  // User correctly points out:
  // LINV/242507012 (original) = Reverted in our DB
  // LINV/242507012-R          = Exported To GL in our DB
  // So original is NOT counted by either system.
  // The -R is Exported To GL but we exclude it with NOT LIKE '%-R'.
  // THEORY: CRD does NOT filter out -R documents → counts them as revenue → gap

  console.log('='.repeat(80));
  console.log('AUG 2024 — RE-EXAMINATION: LINV/242507012 and -R document analysis');
  console.log('='.repeat(80));

  // ── CHECK 1: Exact amounts for LINV/242507012 and its -R ──────────────────
  const inv = await db.query(`
    SELECT "Invoice_No_", "Status_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      "Invoice_Type_"
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" IN ('LINV/242507012','LINV/242507012-R','LINV/242507062','LINV/242507062-R')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Status_", "Invoice_Type_"
    ORDER BY "Invoice_No_", "Status_"
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Invoice_No_             | Status           | Type                    | Amount (Cr)');
  console.log('  ' + '-'.repeat(85));
  for (const r of inv.rows) {
    console.log(`  ${r['Invoice_No_'].padEnd(25)}| ${r['Status_'].padEnd(17)}| ${(r['Invoice_Type_']||'').padEnd(24)}| ${r.net_cr}`);
  }

  // ── CHECK 2: Aug 2024 — What does our standard formula give? ─────────────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 2 — Aug 2024 standard formula (Exported To GL, NOT LIKE %-R)');
  console.log('='.repeat(80));

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
  for (const r of std.rows) {
    total += parseFloat(r.net_cr);
    console.log(`  ${r.site}: ${r.inv} inv | ${r.net_cr} Cr`);
  }
  console.log(`  TOTAL: ${total.toFixed(4)} Cr`);

  // ── CHECK 3: What if CRD INCLUDES -R documents (Exported To GL)? ─────────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 3 — If CRD includes -R (Exported To GL) without excluding them');
  console.log('='.repeat(80));

  const withR = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let total2 = 0;
  for (const r of withR.rows) {
    total2 += parseFloat(r.net_cr);
    console.log(`  ${r.site}: ${r.inv} inv | ${r.net_cr} Cr`);
  }
  console.log(`  TOTAL (incl -R Exported): ${total2.toFixed(4)} Cr`);

  // ── CHECK 4: -R documents that are Exported To GL per site (Aug 2024) ─────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 4 — -R documents with Exported To GL status (Aug 2024)');
  console.log('Their positive or negative amount tells us direction of gap');
  console.log('='.repeat(80));

  const rDocs = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS r_inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS r_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let totalR = 0;
  for (const r of rDocs.rows) {
    totalR += parseFloat(r.r_cr);
    const sign = parseFloat(r.r_cr) > 0 ? 'POSITIVE — adds to CRD total if included' : 'NEGATIVE — reduces CRD total if included';
    console.log(`  ${r.site}: ${r.r_inv} -R inv | ${r.r_cr} Cr | ${sign}`);
  }
  console.log(`  Total -R Exported To GL: ${totalR.toFixed(4)} Cr`);

  // ── CHECK 5: URIMH -R detail ───────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 5 — URIMH: detail of -R documents Exported To GL (Aug 2024)');
  console.log('='.repeat(80));

  const rDetail = await db.query(`
    SELECT r."Invoice_No_" AS r_doc,
      ROUND(SUM(DISTINCT CAST(r."Amount_" AS NUMERIC))/1e7, 6) AS r_cr,
      ARRAY_AGG(DISTINCT orig."Status_") AS orig_statuses,
      ROUND(SUM(DISTINCT CAST(orig."Amount_" AS NUMERIC))/1e7, 6) AS orig_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all" r
    LEFT JOIN "LandingStage2"."mf_sales_si_siheader_all" orig
      ON orig."Invoice_No_" = REPLACE(r."Invoice_No_", '-R', '')
      AND orig."Invoice_Date_(Date)" BETWEEN $1 AND $2
    WHERE r."Invoice_No_" LIKE '%-R'
      AND r."Status_" = 'Exported To GL'
      AND r."Site_" = 'URIMH'
      AND r."Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY r."Invoice_No_"
    ORDER BY r_cr DESC
    LIMIT 20
  `, [DATE_FROM, DATE_TO]);

  console.log('  -R Document              | -R Cr        | Original Status   | Original Cr');
  console.log('  ' + '-'.repeat(80));
  for (const r of rDetail.rows) {
    const origSt = (r.orig_statuses || []).join(',') || 'NOT FOUND';
    console.log(`  ${r.r_doc.padEnd(25)}| ${String(r.r_cr).padEnd(13)}| ${origSt.padEnd(18)}| ${r.orig_cr}`);
  }

  // ── CHECK 6: Standard formula WITHOUT -R + adding back -R Exported ────────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 6 — Summary: what combination matches Aug 2024 CRD?');
  console.log('='.repeat(80));
  console.log(`  Our standard (excl -R):       ${total.toFixed(4)} Cr`);
  console.log(`  Including -R Exported To GL:  ${total2.toFixed(4)} Cr`);
  console.log(`  Value of -R Exported To GL:   ${totalR.toFixed(4)} Cr  (difference)`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
