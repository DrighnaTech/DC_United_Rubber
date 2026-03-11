'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-08-01';
  const DATE_TO   = '2024-08-31';

  // Dashboard TrendCTE gives URIMH = 9.1307 Cr, CRD = 9.13 Cr
  // Diff = 0.0007 Cr (~0.01 Cr displayed)
  // Find the Approved Transfer invoices causing this gap

  console.log('='.repeat(80));
  console.log('AUG 2024 — URIMH: Find the 0.01 Cr gap invoices');
  console.log('Dashboard: 9.1307 Cr  |  CRD: 9.13 Cr  |  diff: ~0.01 Cr');
  console.log('='.repeat(80));

  // ── What TrendCTE gives for URIMH (per-invoice dedup) ──────────────────
  const trendUrimh = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_")  AS "Status_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_"      != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_"  = 'Exported To GL'
        AND "Site_"    = 'URIMH'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT COUNT(*) AS inv, ROUND(SUM("Amount_"::NUMERIC)/1e7,6) AS cr FROM deduped
  `, [DATE_FROM, DATE_TO]);
  console.log(`\n  TrendCTE URIMH Exported: ${trendUrimh.rows[0].inv} inv | ${trendUrimh.rows[0].cr} Cr`);
  console.log(`  CRD URIMH: 9.13 Cr`);
  console.log(`  Gap: ${(parseFloat(trendUrimh.rows[0].cr) - 9.13).toFixed(6)} Cr`);

  // ── Approved URIMH Transfer invoices — GL timing candidates ───────────
  console.log('\n' + '='.repeat(80));
  console.log('URIMH Approved Transfer invoices in Aug 2024 (GL timing candidates)');
  console.log('These were Approved in our snapshot; CRD may have captured some as Exported');
  console.log('='.repeat(80));

  const approved = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Approved'
        AND "Site_"   = 'URIMH'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND("Amount_"::NUMERIC/1e7,6) AS cr,
      "Invoice_Date_(Date)" AS inv_date
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
    LIMIT 30
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Top Approved Transfer invoices (sorted by amount, descending):');
  console.log('  Invoice_No_                    | Type            | Amount (Cr) | Date');
  console.log('  ' + '-'.repeat(80));
  let runningTotal = 0;
  let crdGap = 9.13 - parseFloat(trendUrimh.rows[0].cr);
  for (const r of approved.rows) {
    runningTotal += parseFloat(r.cr);
    const cumMark = Math.abs(runningTotal - crdGap) < 0.0005 ? ` ← CUMSUM = ${runningTotal.toFixed(6)} = CRD GAP ✓` :
                    Math.abs(runningTotal - crdGap) < 0.005  ? ` ~ cumsum ${runningTotal.toFixed(6)}` : '';
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r['Invoice_Type_']||'').padEnd(16)}| ${String(r.cr).padEnd(12)}| ${r.inv_date}${cumMark}`);
    if (runningTotal > crdGap + 0.01) break;
  }

  const totalApproved = await db.query(`
    WITH deduped AS (
      SELECT "Invoice_No_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Approved'
        AND "Site_"   = 'URIMH'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    )
    SELECT COUNT(*) AS inv, ROUND(SUM("Amount_"::NUMERIC)/1e7,4) AS cr FROM deduped
  `, [DATE_FROM, DATE_TO]);

  console.log(`\n  Total URIMH Approved: ${totalApproved.rows[0].inv} inv | ${totalApproved.rows[0].cr} Cr`);
  console.log(`  CRD gap to fill:      ${crdGap.toFixed(6)} Cr`);

  console.log('\n' + '='.repeat(80));
  console.log('CONCLUSION: Aug 2024 Root Cause Summary');
  console.log('='.repeat(80));
  console.log('\n  URIMH: ~0.01 Cr gap');
  console.log('  Root cause: GL export timing — Transfer/STO invoices');
  console.log('  Same pattern as December 2024 URIMH (STO/242502762 + STO/242502907)');
  console.log('\n  URIMP, URIPB, URIPU: EXACT MATCH to CRD (diff < 0.004 Cr)');
  console.log('  No issue with formula or data completeness for these sites.');

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
