'use strict';
const db = require('./db/connection');

(async () => {
  console.log('='.repeat(80));
  console.log('URIMP DEC 2024: FINAL ROOT CAUSE ANALYSIS');
  console.log('='.repeat(80));

  // 1. Precise ALL-statuses breakdown with TrendCTE method
  console.log('\n--- ALL statuses breakdown (TrendCTE method) ---');
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
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Status_", COUNT(*) AS cnt,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
    FROM deduped GROUP BY "Status_" ORDER BY cr DESC
  `);

  let grandTotal = 0;
  for (const r of allSt.rows) {
    grandTotal += parseFloat(r.cr);
    console.log(`  ${(r['Status_']||'?').padEnd(22)} | ${String(r.cnt).padEnd(5)} inv | ${r.cr} Cr`);
  }
  console.log(`  TOTAL ALL STATUSES:    ${grandTotal.toFixed(6)} Cr`);
  console.log(`  CRD:                   3.401000 Cr`);
  console.log(`  Exported only:         3.340989 Cr`);
  console.log(`  Gap (CRD-Exported):    ${(3.401 - 3.340989).toFixed(6)} Cr`);
  console.log(`  Gap (All-CRD):         ${(grandTotal - 3.401).toFixed(6)} Cr`);

  // 2. Check: what if CRD includes Approved + Exported?
  const approvedTotal = allSt.rows.find(r => r['Status_'] === 'Approved');
  if (approvedTotal) {
    console.log(`\n  If CRD = Exported + Approved: ${(3.340989 + parseFloat(approvedTotal.cr)).toFixed(6)} Cr`);
    console.log(`  vs CRD 3.4010: diff = ${(3.340989 + parseFloat(approvedTotal.cr) - 3.401).toFixed(6)} Cr`);
  }

  // 3. List individual Reverted/Approved/other non-Exported invoices
  console.log('\n--- Non-Exported invoices detail ---');
  const nonExp = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" NOT IN ('0','','Exported To GL')
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Status_", "Invoice_Type_",
      "Invoice_Date_(Date)" AS inv_date,
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
  `);

  let nonExpTotal = 0;
  let runningSum = 0;
  console.log('  Invoice_No_'.padEnd(32) + '| Status'.padEnd(22) + '| Type'.padEnd(18) + '| Amount Cr    | Running Sum | vs Gap');
  console.log('  ' + '-'.repeat(120));

  for (const r of nonExp.rows) {
    nonExpTotal += parseFloat(r.cr);
    runningSum += parseFloat(r.cr);
    const gapMatch = Math.abs(runningSum - 0.060011) < 0.001 ? ' ← MATCHES GAP!' :
                     Math.abs(runningSum - 0.060011) < 0.005 ? ' ~ CLOSE' : '';
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r['Status_']||'?').padEnd(20)} | ${(r['Invoice_Type_']||'?').padEnd(16)} | ${String(r.cr).padEnd(12)} | ${runningSum.toFixed(6)}    |${gapMatch}`);
  }
  console.log(`\n  Total non-Exported: ${nonExpTotal.toFixed(6)} Cr`);

  // 4. Check: does the Reverted invoice PINV/242512558 have a -R counterpart?
  console.log('\n--- Checking -R counterparts for Reverted invoices ---');
  for (const r of nonExp.rows) {
    if (r['Status_'] === 'Reverted') {
      const rDoc = await db.query(`
        SELECT "Invoice_No_", "Status_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" = $1
          AND "Site_" = 'URIMP'
        GROUP BY "Invoice_No_", "Status_"
      `, [r['Invoice_No_'] + '-R']);

      if (rDoc.rows.length > 0) {
        for (const rd of rDoc.rows) {
          console.log(`  ${r['Invoice_No_']}-R: Status=${rd['Status_']}, Amount=${rd.amt} (${parseFloat(rd.amt) < 0 ? 'NEGATIVE' : 'POSITIVE'})`);
        }
      } else {
        console.log(`  ${r['Invoice_No_']}-R: NOT FOUND — reversal doc does not exist!`);
      }
    }
  }

  // 5. CRITICAL: Check if any Reverted invoice also has raw rows with "Exported To GL" status
  // (not via MAX() but checking individual raw rows)
  console.log('\n--- Raw rows for Reverted invoices: do they have Exported rows too? ---');
  for (const r of nonExp.rows) {
    if (r['Status_'] === 'Reverted') {
      const rawRows = await db.query(`
        SELECT "Status_", COUNT(*) AS cnt,
          ARRAY_AGG(DISTINCT "Amount_") AS amounts,
          ARRAY_AGG(DISTINCT "src_part") AS parts
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" = $1 AND "Site_" = 'URIMP'
        GROUP BY "Status_"
      `, [r['Invoice_No_']]);

      console.log(`  ${r['Invoice_No_']}:`);
      for (const rr of rawRows.rows) {
        console.log(`    Status: ${rr['Status_'].padEnd(20)} | ${rr.cnt} rows | Amounts: ${rr.amounts.join(', ')} | Parts: ${rr.parts.join(', ')}`);
      }
    }
  }

  // 6. ALL SITES: final comparison table
  console.log('\n' + '='.repeat(80));
  console.log('FINAL: ALL SITES Dec 2024 — TrendCTE vs CRD');
  console.log('='.repeat(80));

  const CRD = { URIMH: 8.8943, URIMP: 3.4010, URIPB: 0.3492, URIPU: 1.5751 };

  const sites = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Site_") AS "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
    FROM deduped
    WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
    GROUP BY "Site_" ORDER BY "Site_"
  `);

  let total = 0;
  console.log('\n  Site   | DB Cr       | CRD Cr     | Gap Cr     | Gap %  | Verdict');
  console.log('  ' + '-'.repeat(75));
  for (const r of sites.rows) {
    const db_cr = parseFloat(r.cr);
    const crd_cr = CRD[r.site];
    total += db_cr;
    const gap = (db_cr - crd_cr).toFixed(6);
    const pct = ((db_cr - crd_cr) / crd_cr * 100).toFixed(2);
    const verdict = Math.abs(parseFloat(gap)) < 0.001 ? 'EXACT MATCH' :
                    Math.abs(parseFloat(gap)) < 0.015 ? 'ROUNDING (~0.01)' :
                    'TIMING GAP';
    console.log(`  ${r.site.padEnd(7)}| ${String(r.cr).padEnd(12)}| ${crd_cr.toFixed(4).padEnd(11)}| ${gap.padEnd(11)}| ${pct.padEnd(7)}| ${verdict}`);
  }
  const crdTotal = 8.8943 + 3.4010 + 0.3492 + 1.5751;
  console.log(`\n  TOTAL  | ${total.toFixed(6).padEnd(12)}| ${crdTotal.toFixed(4).padEnd(11)}| ${(total-crdTotal).toFixed(6).padEnd(11)}|`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
