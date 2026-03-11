'use strict';
const db = require('./db/connection');

(async () => {
  console.log('='.repeat(80));
  console.log('URIMP DEC 2024 — ROW BY ROW — EXPORTED TO GL ONLY');
  console.log('='.repeat(80));

  // 1. Invoice Type breakdown — are returns (negative amounts) reducing the total?
  console.log('\n--- STEP 1: Invoice Type breakdown (Exported To GL only) ---');
  const byType = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_Type_",
      COUNT(*) AS cnt,
      SUM(CASE WHEN "Amount_"::NUMERIC < 0 THEN 1 ELSE 0 END) AS neg_count,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS total_cr,
      ROUND(SUM(CASE WHEN "Amount_"::NUMERIC < 0 THEN "Amount_"::NUMERIC ELSE 0 END)/1e7, 6) AS neg_cr,
      ROUND(SUM(CASE WHEN "Amount_"::NUMERIC > 0 THEN "Amount_"::NUMERIC ELSE 0 END)/1e7, 6) AS pos_cr
    FROM deduped
    GROUP BY "Invoice_Type_"
    ORDER BY total_cr DESC
  `);

  let grandTotal = 0;
  let grandNeg = 0;
  console.log('  Type'.padEnd(25) + '| Count | Neg# | Positive Cr  | Negative Cr  | Net Cr');
  console.log('  ' + '-'.repeat(90));
  for (const r of byType.rows) {
    grandTotal += parseFloat(r.total_cr);
    grandNeg += parseFloat(r.neg_cr);
    console.log(`  ${(r['Invoice_Type_']||'?').padEnd(23)}| ${String(r.cnt).padEnd(6)}| ${String(r.neg_count).padEnd(5)}| ${String(r.pos_cr).padEnd(13)}| ${String(r.neg_cr).padEnd(13)}| ${r.total_cr}`);
  }
  console.log(`\n  GRAND TOTAL: ${grandTotal.toFixed(6)} Cr`);
  console.log(`  Total NEGATIVE: ${grandNeg.toFixed(6)} Cr`);
  console.log(`  Total POSITIVE: ${(grandTotal - grandNeg).toFixed(6)} Cr`);
  console.log(`  CRD: 3.401000 Cr`);
  console.log(`  Gap: ${(grandTotal - 3.401).toFixed(6)} Cr`);
  console.log(`\n  If CRD excludes negatives: ${(grandTotal - grandNeg).toFixed(6)} vs CRD 3.401 → diff: ${(grandTotal - grandNeg - 3.401).toFixed(6)}`);

  // 2. List ALL negative-amount Exported invoices
  console.log('\n--- STEP 2: ALL negative-amount Exported To GL invoices ---');
  const negInv = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Invoice_Type_", "Invoice_Date_(Date)" AS dt,
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr,
      "Amount_"::NUMERIC AS raw_amt
    FROM deduped
    WHERE "Amount_"::NUMERIC < 0
    ORDER BY "Amount_"::NUMERIC ASC
  `);

  let totalNeg = 0;
  for (const r of negInv.rows) {
    totalNeg += parseFloat(r.cr);
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r['Invoice_Type_']||'?').padEnd(20)} | ${r.dt} | ${r.cr} Cr (${r.raw_amt})`);
  }
  console.log(`\n  Total negative invoices: ${negInv.rows.length}`);
  console.log(`  Total negative amount: ${totalNeg.toFixed(6)} Cr`);
  console.log(`  If CRD does NOT include these negatives: DB_pos + |neg| adjustment = ${(grandTotal - totalNeg).toFixed(6)} → vs CRD 3.401 → diff: ${(grandTotal - totalNeg - 3.401).toFixed(6)}`);

  // 3. Check: zero-amount invoices
  console.log('\n--- STEP 3: Zero-amount Exported To GL invoices ---');
  const zeroInv = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT COUNT(*) AS cnt FROM deduped WHERE "Amount_"::NUMERIC = 0
  `);
  console.log(`  Zero-amount Exported invoices: ${zeroInv.rows[0].cnt}`);

  // 4. Raw row analysis — how many raw rows per invoice?
  console.log('\n--- STEP 4: Raw rows per invoice distribution ---');
  const rawDist = await db.query(`
    SELECT rows_per_inv, COUNT(*) AS inv_count
    FROM (
      SELECT "Invoice_No_", COUNT(*) AS rows_per_inv
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_"
    ) t
    GROUP BY rows_per_inv
    ORDER BY rows_per_inv
  `);

  for (const r of rawDist.rows) {
    console.log(`  ${r.rows_per_inv} raw rows: ${r.inv_count} invoices`);
  }

  // 5. For invoices with multiple raw rows — check if Amount_ differs across rows
  console.log('\n--- STEP 5: Invoices with >1 raw row — Amount_ consistency ---');
  const multiRow = await db.query(`
    SELECT "Invoice_No_",
      COUNT(*) AS rows,
      COUNT(DISTINCT "Amount_") AS distinct_amts,
      ARRAY_AGG(DISTINCT "Amount_" ORDER BY "Amount_") AS amounts,
      ARRAY_AGG(DISTINCT "Status_") AS statuses,
      ARRAY_AGG(DISTINCT "src_part") AS parts
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
    GROUP BY "Invoice_No_"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(DISTINCT "Amount_") DESC, COUNT(*) DESC
    LIMIT 30
  `);

  console.log(`  Total invoices with >1 raw row: ${multiRow.rows.length}`);
  let problematic = 0;
  for (const r of multiRow.rows) {
    if (parseInt(r.distinct_amts) > 1) {
      problematic++;
      console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${r.rows} rows | ${r.distinct_amts} distinct amounts: ${r.amounts.join(', ')} | parts: ${r.parts.join(',')}`);
    }
  }
  if (problematic === 0) {
    console.log('  All multi-row invoices have SAME Amount_ across all rows — no inconsistency');
    // Show a few examples
    for (const r of multiRow.rows.slice(0, 5)) {
      console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${r.rows} rows | amt: ${r.amounts.join(', ')} | parts: ${r.parts.join(',')}`);
    }
  }

  // 6. CRITICAL: Check if SUM(DISTINCT Amount_) per (Invoice_No_, Invoice_Date_)
  //    gives DIFFERENT result than just taking the first Amount_ value per invoice
  console.log('\n--- STEP 6: SUM(DISTINCT) vs MAX vs MIN vs AVG per invoice ---');
  const sumCheck = await db.query(`
    WITH per_inv_sumdist AS (
      SELECT "Invoice_No_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS sum_dist_amt
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_"
    ),
    per_inv_max AS (
      SELECT "Invoice_No_",
        MAX(COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS max_amt
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_"
    )
    SELECT
      ROUND(SUM(s.sum_dist_amt)/1e7, 6) AS total_sumdist,
      ROUND(SUM(m.max_amt)/1e7, 6) AS total_max
    FROM per_inv_sumdist s
    JOIN per_inv_max m USING ("Invoice_No_")
  `);

  console.log(`  SUM(DISTINCT Amount_) per invoice then SUM: ${sumCheck.rows[0].total_sumdist} Cr`);
  console.log(`  MAX(Amount_) per invoice then SUM:          ${sumCheck.rows[0].total_max} Cr`);
  console.log(`  Difference: ${(parseFloat(sumCheck.rows[0].total_sumdist) - parseFloat(sumCheck.rows[0].total_max)).toFixed(6)} Cr`);

  // 7. Invoices where SUM(DISTINCT) != MAX — these have Amount_=0 shadow rows
  console.log('\n--- STEP 7: Invoices where SUM(DISTINCT) includes 0 (shadow rows) ---');
  const shadowInv = await db.query(`
    SELECT "Invoice_No_",
      SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS sum_dist,
      MAX(COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS max_val,
      ARRAY_AGG(DISTINCT "Amount_" ORDER BY "Amount_") AS amounts
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
    GROUP BY "Invoice_No_"
    HAVING SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) != MAX(COALESCE(NULLIF("Amount_",'')::NUMERIC,0))
    ORDER BY max_val DESC
    LIMIT 20
  `);

  if (shadowInv.rows.length > 0) {
    console.log(`  Found ${shadowInv.rows.length} invoices where SUM(DISTINCT) != MAX:`);
    let totalDiff = 0;
    for (const r of shadowInv.rows) {
      const diff = parseFloat(r.sum_dist) - parseFloat(r.max_val);
      totalDiff += diff;
      console.log(`  ${r['Invoice_No_'].padEnd(30)} | SUM(DIST)=${r.sum_dist} | MAX=${r.max_val} | amounts: ${r.amounts.join(', ')}`);
    }
    console.log(`  Total difference from shadow rows: ${(totalDiff/1e7).toFixed(6)} Cr`);
  } else {
    console.log('  No discrepancy — SUM(DISTINCT) = MAX for all invoices');
  }

  // 8. The MPSRTN/MHSRTN return invoices — are these sales returns with negative amounts?
  console.log('\n--- STEP 8: Return/Credit invoices (SRTN prefix) in Exported ---');
  const returns = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
        AND ("Invoice_No_" LIKE '%SRTN%' OR "Invoice_No_" LIKE '%CRN%' OR "Invoice_No_" LIKE '%CN%' OR "Invoice_No_" LIKE '%RET%')
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr,
      "Amount_"::NUMERIC AS raw
    FROM deduped
    ORDER BY "Amount_"::NUMERIC ASC
  `);

  let returnTotal = 0;
  for (const r of returns.rows) {
    returnTotal += parseFloat(r.cr);
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r['Invoice_Type_']||'?').padEnd(20)} | ${r.cr} Cr (raw: ${r.raw})`);
  }
  console.log(`\n  Total return/credit invoices: ${returns.rows.length}`);
  console.log(`  Total return amount: ${returnTotal.toFixed(6)} Cr`);
  console.log(`  If CRD excludes returns: ${(grandTotal - returnTotal).toFixed(6)} Cr → vs CRD 3.401 → diff: ${(grandTotal - returnTotal - 3.401).toFixed(6)}`);

  // 9. Check the EXACT same formula on other months to see if the pattern matches
  console.log('\n--- STEP 9: Same gap pattern across months (Exported only, TrendCTE) ---');
  const months = [
    { from: '2024-04-01', to: '2024-04-30', label: 'Apr-24', crd: 2.34 },
    { from: '2024-05-01', to: '2024-05-31', label: 'May-24', crd: 2.45 },
    { from: '2024-06-01', to: '2024-06-30', label: 'Jun-24', crd: 2.95 },
    { from: '2024-07-01', to: '2024-07-31', label: 'Jul-24', crd: 3.01 },
    { from: '2024-08-01', to: '2024-08-31', label: 'Aug-24', crd: 3.13 },
    { from: '2024-09-01', to: '2024-09-30', label: 'Sep-24', crd: 3.08 },
    { from: '2024-10-01', to: '2024-10-31', label: 'Oct-24', crd: 3.42 },
    { from: '2024-11-01', to: '2024-11-30', label: 'Nov-24', crd: 2.98 },
    { from: '2024-12-01', to: '2024-12-31', label: 'Dec-24', crd: 3.40 },
  ];

  console.log('  Month  | DB Exported | CRD   | Gap     | Gap%   | Returns Cr');
  console.log('  ' + '-'.repeat(70));

  for (const m of months) {
    const res = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = 'URIMP'
          AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS cr FROM deduped
    `, [m.from, m.to]);

    // Also get return invoice total
    const retRes = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = 'URIMP'
          AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
          AND "Amount_"::NUMERIC < 0
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT COALESCE(ROUND(SUM("Amount_"::NUMERIC)/1e7, 4), 0) AS cr FROM deduped
    `, [m.from, m.to]);

    const dbCr = parseFloat(res.rows[0].cr || 0);
    const retCr = parseFloat(retRes.rows[0].cr || 0);
    const gap = (dbCr - m.crd).toFixed(4);
    const pct = ((dbCr - m.crd) / m.crd * 100).toFixed(2);
    const mark = Math.abs(parseFloat(gap)) < 0.005 ? ' ✓' : '';
    console.log(`  ${m.label.padEnd(7)}| ${String(dbCr).padEnd(12)}| ${m.crd.toFixed(2).padEnd(6)}| ${gap.padEnd(8)}| ${pct.padEnd(7)}| ${retCr}${mark}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
