'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';
  const STATUS    = 'Exported To GL';

  // CRD Dec 2024 (from email — exact 4-digit values from previous deep-dive)
  const CRD = { URIMH: 8.8943, URIMP: 3.4010, URIPB: 0.3492, URIPU: 1.5751 };
  const CRD_TOTAL = 14.22;

  console.log('='.repeat(80));
  console.log('DEC 2024 — EXACT TrendCTE REPLICATION (dashboard method)');
  console.log('CRD: URIMH=8.8943, URIMP=3.4010, URIPB=0.3492, URIPU=1.5751');
  console.log('='.repeat(80));

  // ── STEP 1: TrendCTE per site — exact dashboard formula ───────────────────
  const trend = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_")  AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        MAX("Site_") AS "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_"      != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_"  = $1
        AND "Invoice_Date_(Date)" >= $2
        AND "Invoice_Date_(Date)" <= $3
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      "Site_" AS site,
      COUNT(*) AS rows,
      COUNT(DISTINCT "Invoice_No_") AS unique_inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS net_cr
    FROM deduped
    WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
    GROUP BY "Site_"
    ORDER BY "Site_"
  `, [STATUS, DATE_FROM, DATE_TO]);

  let total = 0;
  console.log('\n  Site   | TrendCTE Cr | CRD Cr   | Diff      | Status');
  console.log('  ' + '-'.repeat(65));
  const dbVals = {};
  for (const r of trend.rows) {
    total += parseFloat(r.net_cr);
    dbVals[r.site] = parseFloat(r.net_cr);
    const diff = (parseFloat(r.net_cr) - CRD[r.site]).toFixed(4);
    const absDiff = Math.abs(parseFloat(diff));
    const mark = absDiff < 0.001 ? 'EXACT MATCH' :
                 absDiff < 0.005 ? 'CLOSE (~rounding)' :
                 absDiff < 0.02  ? 'NEAR (~0.01)' : `GAP: ${diff} Cr`;
    console.log(`  ${r.site.padEnd(7)}| ${String(r.net_cr).padEnd(12)}| ${CRD[r.site].toFixed(4).padEnd(9)}| ${diff.padEnd(10)}| ${mark}`);
  }
  console.log(`\n  TOTAL: ${total.toFixed(4)} Cr | CRD: ${CRD_TOTAL} | diff: ${(total-CRD_TOTAL).toFixed(4)}`);

  // ── STEP 2: Deeper look — sites with gap ──────────────────────────────────
  const gaps = Object.entries(dbVals).filter(([s,v]) => Math.abs(v - CRD[s]) >= 0.005);

  for (const [site, val] of gaps) {
    const gap = (val - CRD[site]).toFixed(4);
    console.log('\n' + '='.repeat(80));
    console.log(`DEEP DIVE: ${site} — Gap: ${gap} Cr`);
    console.log('='.repeat(80));

    // Check Approved invoices — GL timing candidates
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
          AND "Site_"   = $1
          AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Invoice_No_", "Invoice_Type_",
        ROUND("Amount_"::NUMERIC/1e7,6) AS cr
      FROM deduped
      ORDER BY "Amount_"::NUMERIC DESC
      LIMIT 15
    `, [site, DATE_FROM, DATE_TO]);

    if (approved.rows.length === 0) {
      console.log(`  No Approved invoices for ${site} in Dec 2024.`);
      console.log(`  Gap NOT from GL timing. Checking other possibilities...`);

      // Check Reverted invoices
      const reverted = await db.query(`
        WITH deduped AS (
          SELECT
            "Invoice_No_",
            "Invoice_Date_(Date)",
            MAX("Status_") AS "Status_",
            SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
          FROM "LandingStage2"."mf_sales_si_siheader_all"
          WHERE "Invoice_No_" NOT LIKE '%-R'
            AND "Status_" = 'Reverted'
            AND "Site_"   = $1
            AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
          GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
        )
        SELECT "Invoice_No_",
          ROUND("Amount_"::NUMERIC/1e7,6) AS cr
        FROM deduped
        ORDER BY "Amount_"::NUMERIC DESC
        LIMIT 10
      `, [site, DATE_FROM, DATE_TO]);

      if (reverted.rows.length > 0) {
        console.log(`\n  Reverted invoices for ${site} Dec 2024:`);
        let sum = 0;
        for (const r of reverted.rows) {
          sum += parseFloat(r.cr);
          console.log(`    ${r['Invoice_No_'].padEnd(30)} | ${r.cr} Cr`);
        }
        console.log(`    Total Reverted: ${sum.toFixed(6)} Cr`);
        console.log(`    Gap: ${gap} Cr`);
        console.log(`    If CRD captured these BEFORE reversal (as Exported To GL): diff = ${(sum + parseFloat(gap)).toFixed(6)} Cr`);
      }

      // Check ALL statuses total
      const allSt = await db.query(`
        WITH deduped AS (
          SELECT
            "Invoice_No_",
            "Invoice_Date_(Date)",
            MAX("Status_") AS "Status_",
            SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
          FROM "LandingStage2"."mf_sales_si_siheader_all"
          WHERE "Invoice_No_" NOT LIKE '%-R'
            AND "Status_" NOT IN ('0','')
            AND "Site_"   = $1
            AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
          GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
        )
        SELECT "Status_",
          COUNT(*) AS inv,
          ROUND(SUM("Amount_"::NUMERIC)/1e7,4) AS cr
        FROM deduped GROUP BY "Status_" ORDER BY cr DESC
      `, [site, DATE_FROM, DATE_TO]);

      let allTotal = 0;
      console.log(`\n  ${site} ALL statuses (TrendCTE method):`);
      for (const r of allSt.rows) {
        allTotal += parseFloat(r.cr);
        const mark = r['Status_'] === 'Exported To GL' ? ' ←' : '';
        console.log(`    ${(r['Status_']||'?').padEnd(22)} | ${r.inv} inv | ${r.cr} Cr${mark}`);
      }
      console.log(`    Total (all statuses): ${allTotal.toFixed(4)} Cr vs CRD ${CRD[site].toFixed(4)} Cr`);
      if (allTotal > CRD[site]) {
        console.log(`    ↑ DB total > CRD → data EXISTS, gap is STATUS timing`);
      } else {
        console.log(`    ↓ DB total < CRD → SOME INVOICES MISSING from DB`);
      }
    } else {
      console.log(`\n  Approved invoices (GL timing candidates):`);
      let cumSum = 0;
      const targetGap = Math.abs(parseFloat(gap));
      for (const r of approved.rows) {
        cumSum += parseFloat(r.cr);
        const mark = Math.abs(cumSum - targetGap) < 0.001 ? ` ← CUMSUM = ${cumSum.toFixed(6)} = GAP ✓` : '';
        console.log(`    ${r['Invoice_No_'].padEnd(30)} | ${(r['Invoice_Type_']||'').padEnd(16)} | ${r.cr} Cr${mark}`);
      }
    }
  }

  // ── STEP 3: Jan 2025 with TrendCTE for completeness ──────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('BONUS: Jan 2025 (1-28) with TrendCTE (correct dashboard method)');
  console.log('='.repeat(80));

  const CRD_JAN = { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41 };

  const trendJan = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_")  AS "Status_",
        MAX("Site_") AS "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_"      != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_"  = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-01-01'
        AND "Invoice_Date_(Date)" <= '2025-01-28'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS net_cr
    FROM deduped
    WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
    GROUP BY "Site_"
    ORDER BY "Site_"
  `, []);

  let totalJan = 0;
  console.log('\n  Site   | TrendCTE Cr | CRD Cr  | Diff      | Status');
  console.log('  ' + '-'.repeat(65));
  for (const r of trendJan.rows) {
    totalJan += parseFloat(r.net_cr);
    const diff = (parseFloat(r.net_cr) - CRD_JAN[r.site]).toFixed(4);
    const absDiff = Math.abs(parseFloat(diff));
    const mark = absDiff < 0.001 ? 'EXACT MATCH' :
                 absDiff < 0.005 ? 'CLOSE' :
                 absDiff < 0.02  ? 'NEAR (~0.01)' : `GAP: ${diff} Cr`;
    console.log(`  ${r.site.padEnd(7)}| ${String(r.net_cr).padEnd(12)}| ${CRD_JAN[r.site].toFixed(2).padEnd(8)}| ${diff.padEnd(10)}| ${mark}`);
  }
  console.log(`\n  TOTAL: ${totalJan.toFixed(4)} Cr | CRD: 16.12`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
