'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';
  const CRD_URIMP = 3.4010;
  const CRD_URIMH = 8.8943;
  const CRD_TOTAL = 14.22;

  // ── STEP 1: See all columns available in the table ─────────────────────────
  console.log('='.repeat(80));
  console.log('STEP 1 — All columns in mf_sales_si_siheader_all');
  console.log('='.repeat(80));

  const colRes = await db.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'LandingStage2'
      AND table_name = 'mf_sales_si_siheader_all'
    ORDER BY ordinal_position
  `);
  for (const r of colRes.rows) console.log(`  ${r.column_name.padEnd(40)} ${r.data_type}`);

  // ── STEP 2: URIMP — try every numeric column as the amount field ───────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — URIMP Dec: try each numeric column as amount — which gives 3.4010?');
  console.log('='.repeat(80));

  // Get numeric column names
  const numCols = colRes.rows
    .filter(r => ['numeric','double precision','integer','bigint','real'].includes(r.data_type)
             || r.column_name.includes('Amount') || r.column_name.includes('Qty')
             || r.column_name.includes('Rate') || r.column_name.includes('Price'))
    .map(r => r.column_name);

  console.log('\n  Testing columns: ' + numCols.join(', '));

  for (const col of numCols.slice(0, 20)) {
    try {
      const r = await db.query(`
        SELECT ROUND(SUM(sub.net)/1e7, 4) AS net_cr
        FROM (
          SELECT "Invoice_No_", SUM(DISTINCT CAST("${col}" AS NUMERIC)) AS net
          FROM "LandingStage2"."mf_sales_si_siheader_all"
          WHERE "Invoice_No_" NOT LIKE '%-R'
            AND "Status_" = 'Exported To GL'
            AND "Site_" = 'URIMP'
            AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
          GROUP BY "Invoice_No_"
        ) sub
      `, [DATE_FROM, DATE_TO]);
      const val = parseFloat(r.rows[0].net_cr);
      const diff = (val - CRD_URIMP).toFixed(4);
      const mark = Math.abs(val - CRD_URIMP) < 0.002 ? ' ✓ MATCHES CRD!' : Math.abs(val - CRD_URIMP) < 0.01 ? ' ~ CLOSE' : '';
      console.log(`  ${col.padEnd(40)} ${String(val).padEnd(12)} diff=${diff}${mark}`);
    } catch(e) {
      console.log(`  ${col.padEnd(40)} ERROR: ${e.message.substring(0,50)}`);
    }
  }

  // ── STEP 3: URIMP — try without NOT LIKE '%-R' to see -R impact ───────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — URIMP Dec: include -R documents (no exclusion filter)');
  console.log('='.repeat(80));

  const withR = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7, 4) AS net_cr,
      COUNT(DISTINCT "Invoice_No_") AS inv
    FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    ) sub
  `, [DATE_FROM, DATE_TO]);
  console.log(`\n  Including -R: ${withR.rows[0].inv} inv | ${withR.rows[0].net_cr} Cr | diff from CRD: ${(parseFloat(withR.rows[0].net_cr)-CRD_URIMP).toFixed(4)}`);

  // ── STEP 4: URIMP — check if -R docs have POSITIVE amounts ────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — URIMP Dec: -R document amounts — are they positive or negative?');
  console.log('='.repeat(80));

  const rDocsRes = await db.query(`
    SELECT "Invoice_No_",
      SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amount,
      SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC)) AS inv_amount,
      ARRAY_AGG(DISTINCT "Status_") AS statuses
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" LIKE '%-R'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_"
    ORDER BY amount DESC
  `, [DATE_FROM, DATE_TO]);

  let rTotal = 0; let rAbsTotal = 0;
  for (const r of rDocsRes.rows) {
    rTotal += r.amount / 1e7;
    rAbsTotal += Math.abs(r.amount) / 1e7;
    console.log(`  ${r['Invoice_No_'].padEnd(28)} | Amount=${(r.amount/1e7).toFixed(6)} Cr | status=${r.statuses.join(',')}`);
  }
  console.log(`\n  SUM of -R amounts: ${rTotal.toFixed(6)} Cr`);
  console.log(`  ABS SUM of -R amounts: ${rAbsTotal.toFixed(6)} Cr`);
  console.log(`  Current formula (no -R): 3.3409 Cr`);
  console.log(`  If CRD adds -R as positive: ${(3.3409 + rAbsTotal).toFixed(4)} Cr | diff from 3.4010: ${(3.3409 + rAbsTotal - 3.4010).toFixed(4)}`);

  // ── STEP 5: URIMH same — does CRD include -R as positive? ─────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 5 — URIMH Dec: -R document amounts');
  console.log('='.repeat(80));

  const urimhRRes = await db.query(`
    SELECT SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS total_neg,
      ABS(SUM(DISTINCT CAST("Amount_" AS NUMERIC))) AS total_abs,
      COUNT(DISTINCT "Invoice_No_") AS cnt
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" LIKE '%-R'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
  `, [DATE_FROM, DATE_TO]);
  const ur = urimhRRes.rows[0];
  console.log(`\n  URIMH -R docs: ${ur.cnt} | total_neg=${(ur.total_neg/1e7).toFixed(4)} Cr | abs=${(ur.total_abs/1e7).toFixed(4)} Cr`);
  console.log(`  Current formula URIMH: 8.8843 Cr`);
  console.log(`  If CRD adds -R as positive: ${(8.8843 + ur.total_abs/1e7).toFixed(4)} Cr | diff from 8.8943: ${(8.8843 + ur.total_abs/1e7 - 8.8943).toFixed(4)}`);

  // ── STEP 6: URIMP — SUM without DISTINCT (no dedup) ───────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 6 — URIMP Dec: SUM(Amount_) WITHOUT DISTINCT (raw sum, all rows)');
  console.log('='.repeat(80));

  const noDistinct = await db.query(`
    SELECT ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7, 4) AS raw_sum,
      COUNT(*) AS total_rows,
      COUNT(DISTINCT "Invoice_No_") AS inv
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
  `, [DATE_FROM, DATE_TO]);
  console.log(`  Raw SUM(Amount_): ${noDistinct.rows[0].raw_sum} Cr | rows=${noDistinct.rows[0].total_rows} | inv=${noDistinct.rows[0].inv} | diff from CRD: ${(parseFloat(noDistinct.rows[0].raw_sum)-CRD_URIMP).toFixed(4)}`);

  // ── STEP 7: URIMP — Count per-partition then average ──────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 7 — URIMP Dec: MAX(Amount_) per invoice (not SUM)');
  console.log('='.repeat(80));

  const maxAmt = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7, 4) AS net_cr, COUNT(*) AS inv
    FROM (
      SELECT "Invoice_No_", MAX(CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    ) sub
  `, [DATE_FROM, DATE_TO]);
  console.log(`  MAX(Amount_) per invoice: ${maxAmt.rows[0].net_cr} Cr | inv=${maxAmt.rows[0].inv} | diff from CRD: ${(parseFloat(maxAmt.rows[0].net_cr)-CRD_URIMP).toFixed(4)}`);

  // ── STEP 8: URIMP — check if there are Exported invoices with Amount_=0 that have Invoice_Amount_ > 0
  console.log('\n' + '='.repeat(80));
  console.log('STEP 8 — URIMP Dec: Exported To GL invoices where Amount_=0 but Invoice_Amount_>0');
  console.log('='.repeat(80));

  const zeroAmtRes = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC))/1e7, 6) AS inv_amt_cr,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS amt_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Invoice_Type_"
    HAVING SUM(DISTINCT CAST("Amount_" AS NUMERIC)) = 0
      AND SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC)) > 0
  `, [DATE_FROM, DATE_TO]);

  if (zeroAmtRes.rows.length === 0) {
    console.log('\n  None — no Exported invoices with Amount_=0 but Invoice_Amount_>0');
  } else {
    let zeroTotal = 0;
    for (const r of zeroAmtRes.rows) {
      zeroTotal += parseFloat(r.inv_amt_cr);
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | Amount_=${r.amt_cr} | Invoice_Amount_=${r.inv_amt_cr}`);
    }
    console.log(`  Total Invoice_Amount_ for zero-Amount_ invoices: ${zeroTotal.toFixed(4)} Cr`);
    console.log(`  If we use Invoice_Amount_ for these: ${(3.3409 + zeroTotal).toFixed(4)} Cr | diff from CRD: ${(3.3409 + zeroTotal - 3.4010).toFixed(4)}`);
  }

  // ── STEP 9: ALL 4 sites using every tested formula — find which matches CRD TOTAL ──
  console.log('\n' + '='.repeat(80));
  console.log('STEP 9 — All 4 sites total: testing formulas that could give 14.22 Cr');
  console.log('='.repeat(80));

  // Formula A: standard (current)
  const fA = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7,4) AS net_cr FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    ) sub`, [DATE_FROM, DATE_TO]);

  // Formula B: include -R (no exclusion, take absolute value by not adding them)
  const fB = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7,4) AS net_cr FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    ) sub`, [DATE_FROM, DATE_TO]);

  // Formula C: include -R as ABS (CRD might treat all amounts as positive)
  const fC = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7,4) AS net_cr FROM (
      SELECT "Invoice_No_", ABS(SUM(DISTINCT CAST("Amount_" AS NUMERIC))) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    ) sub`, [DATE_FROM, DATE_TO]);

  // Formula D: NOT LIKE '%-R', Amount_ > 0 only (exclude negatives = Sales Returns)
  const fD = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7,4) AS net_cr FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND CAST("Amount_" AS NUMERIC) > 0
      GROUP BY "Invoice_No_"
    ) sub`, [DATE_FROM, DATE_TO]);

  // Formula E: NOT LIKE '%-R', SUM(Amount_) without DISTINCT
  const fE = await db.query(`
    SELECT ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2`, [DATE_FROM, DATE_TO]);

  // Formula F: ABS(Amount_) per invoice then sum (treat all as positive)
  const fF = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7,4) AS net_cr FROM (
      SELECT "Invoice_No_", ABS(SUM(DISTINCT CAST("Amount_" AS NUMERIC))) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    ) sub`, [DATE_FROM, DATE_TO]);

  const formulas = [
    { name: 'A: Standard (SUM DISTINCT, NOT LIKE -R)', val: fA.rows[0].net_cr },
    { name: 'B: Include -R docs (no exclusion)', val: fB.rows[0].net_cr },
    { name: 'C: Include -R as ABS per invoice', val: fC.rows[0].net_cr },
    { name: 'D: NOT LIKE -R, Amount_ > 0 only', val: fD.rows[0].net_cr },
    { name: 'E: NOT LIKE -R, SUM without DISTINCT', val: fE.rows[0].net_cr },
    { name: 'F: NOT LIKE -R, ABS per invoice', val: fF.rows[0].net_cr },
  ];

  console.log(`\n  ${'Formula'.padEnd(45)} Total Cr   Diff from 14.22`);
  console.log('  ' + '-'.repeat(75));
  for (const f of formulas) {
    const diff = (parseFloat(f.val) - CRD_TOTAL).toFixed(4);
    const mark = Math.abs(parseFloat(f.val) - CRD_TOTAL) < 0.002 ? ' ✓ MATCHES!' : Math.abs(parseFloat(f.val) - CRD_TOTAL) < 0.02 ? ' ~ CLOSE' : '';
    console.log(`  ${f.name.padEnd(45)} ${String(f.val).padEnd(11)} ${diff}${mark}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
