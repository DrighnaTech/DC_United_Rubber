'use strict';
const db = require('./db/connection');

(async () => {
  try {
    // ── URIMP Dec 2024: DB=3.34 vs CRD=3.40 (-0.06 Cr) ──────────────
    console.log('=== URIMP Dec 2024: invoices with multiple statuses ===');
    const r1 = await db.query(`
      SELECT "Invoice_No_",
        ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS statuses,
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt,
        COUNT(*) AS row_cnt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
      GROUP BY "Invoice_No_"
      HAVING COUNT(DISTINCT "Status_") > 1
      ORDER BY amt DESC
    `);
    let multiTotal = 0;
    r1.rows.forEach(r => {
      multiTotal += parseFloat(r.amt);
      console.log(' ', r.Invoice_No_, '| statuses:', r.statuses.join(','), '| amt:', (r.amt/1e7).toFixed(4), 'Cr');
    });
    console.log('Multi-status invoices total:', (multiTotal/1e7).toFixed(4), 'Cr');

    // Find specifically: in Approved but NOT in Exported To GL (these are in CRD but missed by our filter)
    console.log('\n=== URIMP Dec 2024: invoices ONLY in Approved (missing from our Exported To GL query) ===');
    const r2 = await db.query(`
      WITH statuses AS (
        SELECT "Invoice_No_",
          ARRAY_AGG(DISTINCT "Status_") AS all_statuses,
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Invoice_Type_" != '0'
          AND "Site_" = 'URIMP'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
        GROUP BY "Invoice_No_"
      )
      SELECT "Invoice_No_", all_statuses, amt
      FROM statuses
      WHERE NOT ('Exported To GL' = ANY(all_statuses))
        AND ('Approved' = ANY(all_statuses) OR 'Released' = ANY(all_statuses))
      ORDER BY amt DESC
    `);
    let approvedTotal = 0;
    r2.rows.forEach(r => {
      approvedTotal += parseFloat(r.amt);
      console.log(' ', r.Invoice_No_, '| statuses:', r.all_statuses.join(','), '| amt:', (r.amt/1e7).toFixed(4), 'Cr');
    });
    console.log('Total Approved-only invoices:', r2.rows.length, '| amt:', (approvedTotal/1e7).toFixed(4), 'Cr');
    console.log('Expected diff from CRD: 0.06 Cr');

    // ── SUM(DISTINCT) collision check ─────────────────────────────────
    console.log('\n=== SUM(DISTINCT) collision: invoices sharing same Amount_ value ===');
    console.log('(If two invoices have identical Amount_, SUM(DISTINCT) undercounts by one)');
    const r3 = await db.query(`
      SELECT CAST("Amount_" AS NUMERIC) AS amt_val,
        COUNT(DISTINCT "Invoice_No_") AS inv_sharing_same_amt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
      GROUP BY CAST("Amount_" AS NUMERIC)
      HAVING COUNT(DISTINCT "Invoice_No_") > 1
      ORDER BY amt_val DESC
      LIMIT 10
    `);
    if (r3.rows.length === 0) {
      console.log('  No collisions found — not the cause');
    } else {
      r3.rows.forEach(r => {
        console.log(`  Amount=${r.amt_val}, shared by ${r.inv_sharing_same_amt} invoices → SUM(DISTINCT) undercounts by ${r.inv_sharing_same_amt - 1} × ${r.amt_val}`);
      });
    }

    // ── Apr 2025 URIMH: DB=7.86 vs CRD=7.91 (-0.05 Cr) ──────────────
    console.log('\n=== Apr 2025 URIMH: Approved-only invoices (in CRD, missed by Exported To GL filter) ===');
    const r4 = await db.query(`
      WITH statuses AS (
        SELECT "Invoice_No_",
          ARRAY_AGG(DISTINCT "Status_") AS all_statuses,
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Invoice_Type_" != '0'
          AND "Site_" = 'URIMH'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2025-04'
        GROUP BY "Invoice_No_"
      )
      SELECT "Invoice_No_", all_statuses, amt
      FROM statuses
      WHERE NOT ('Exported To GL' = ANY(all_statuses))
        AND ('Approved' = ANY(all_statuses) OR 'Released' = ANY(all_statuses) OR 'Open' = ANY(all_statuses))
      ORDER BY amt DESC
      LIMIT 20
    `);
    let aprilTotal = 0;
    r4.rows.forEach(r => {
      aprilTotal += parseFloat(r.amt);
      console.log(' ', r.Invoice_No_, '| statuses:', r.all_statuses.join(','), '| amt:', (r.amt/1e7).toFixed(4), 'Cr');
    });
    console.log('Approved-only total:', r4.rows.length, 'invoices | amt:', (aprilTotal/1e7).toFixed(4), 'Cr (expected diff ~0.05 Cr)');

    // ── SUM(DISTINCT) collision for Apr 2025 URIMH ────────────────────
    console.log('\n=== SUM(DISTINCT) collision for URIMH Apr 2025 ===');
    const r5 = await db.query(`
      SELECT CAST("Amount_" AS NUMERIC) AS amt_val,
        COUNT(DISTINCT "Invoice_No_") AS inv_cnt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMH'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2025-04'
      GROUP BY CAST("Amount_" AS NUMERIC)
      HAVING COUNT(DISTINCT "Invoice_No_") > 1
      ORDER BY amt_val DESC
      LIMIT 10
    `);
    if (r5.rows.length === 0) {
      console.log('  No collisions');
    } else {
      let collisionImpact = 0;
      r5.rows.forEach(r => {
        const impact = parseFloat(r.amt_val) * (r.inv_cnt - 1);
        collisionImpact += impact;
        console.log(`  Amount=${r.amt_val}, ${r.inv_cnt} invoices → undercount: ${(impact/1e7).toFixed(4)} Cr`);
      });
      console.log('  Total collision undercount:', (collisionImpact/1e7).toFixed(4), 'Cr');
    }

    // ── Amount changes across partitions (multi-amount invoices) ─────
    console.log('\n=== URIMP Dec 2024: invoices with Amount_ changing across partitions ===');
    const r6 = await db.query(`
      SELECT "Invoice_No_",
        ARRAY_AGG(DISTINCT CAST("Amount_" AS NUMERIC) ORDER BY CAST("Amount_" AS NUMERIC)) AS amounts,
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS sum_distinct,
        MAX(CAST("Amount_" AS NUMERIC)) AS max_amt,
        COUNT(*) AS row_cnt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
      GROUP BY "Invoice_No_"
      HAVING COUNT(DISTINCT CAST("Amount_" AS NUMERIC)) > 1
      ORDER BY SUM(DISTINCT CAST("Amount_" AS NUMERIC)) DESC
      LIMIT 10
    `);
    if (r6.rows.length === 0) {
      console.log('  No multi-amount invoices in Exported To GL');
    } else {
      let excess = 0;
      r6.rows.forEach(r => {
        const over = parseFloat(r.sum_distinct) - parseFloat(r.max_amt);
        excess += over;
        console.log(' ', r.Invoice_No_, '| amounts:', r.amounts.join(','), '| SUM(D):', (r.sum_distinct/1e7).toFixed(4), 'MAX:', (r.max_amt/1e7).toFixed(4), '| excess:', (over/1e7).toFixed(4), 'Cr');
      });
      console.log('Total excess from multi-amount:', (excess/1e7).toFixed(4), 'Cr');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
