'use strict';
const db = require('./db/connection');

// CRD reference values (net Cr) - per site per month
const CRD = {
  '2024-04': { URIMH: 7.30, URIMP: 3.76, URIPB: 0.46, URIPU: 1.36, total: 12.88 },
  '2024-05': { URIMH: 7.04, URIMP: 3.06, URIPB: 0.59, URIPU: 1.28, total: 11.97 },
  '2024-06': { URIMH: 7.35, URIMP: 3.10, URIPB: 0.75, URIPU: 1.91, total: 13.11 },
  '2024-07': { URIMH: 9.24, URIMP: 3.12, URIPB: 0.83, URIPU: 1.32, total: 14.50 },
  '2024-08': { URIMH: 9.14, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66, total: 14.79 },
  '2024-09': { URIMH: 8.66, URIMP: 3.08, URIPB: 0.78, URIPU: 1.21, total: 13.74 },
  '2024-10': { URIMH: 10.87, URIMP: 3.42, URIPB: 0.57, URIPU: 1.55, total: 16.41 },
  '2024-11': { URIMH: 8.23, URIMP: 2.98, URIPB: 0.56, URIPU: 1.50, total: 13.27 },
  '2024-12': { URIMH: 8.89, URIMP: 3.40, URIPB: 0.35, URIPU: 1.58, total: 14.22 },
  '2025-01': { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41, total: 16.12 },
};
// CRD gross reference values
const CRD_GROSS = {
  '2024-04': { URIMH: 8.66, URIMP: 4.53, URIPB: 0.54, URIPU: 1.61, total: 15.34 },
  '2024-05': { URIMH: 8.40, URIMP: 3.70, URIPB: 0.69, URIPU: 1.51, total: 14.31 },
  '2024-06': { URIMH: 8.72, URIMP: 3.72, URIPB: 0.89, URIPU: 2.25, total: 15.58 },
  '2024-07': { URIMH: 11.04, URIMP: 3.78, URIPB: 0.97, URIPU: 1.56, total: 17.35 },
  '2024-08': { URIMH: 10.87, URIMP: 3.78, URIPB: 1.01, URIPU: 1.96, total: 17.62 },
  '2024-09': { URIMH: 10.32, URIMP: 3.70, URIPB: 0.92, URIPU: 1.43, total: 16.37 },
  '2024-10': { URIMH: 12.92, URIMP: 4.12, URIPB: 0.67, URIPU: 1.82, total: 19.53 },
  '2024-11': { URIMH: 9.80, URIMP: 3.59, URIPB: 0.66, URIPU: 1.77, total: 15.82 },
  '2024-12': { URIMH: 10.53, URIMP: 4.09, URIPB: 0.41, URIPU: 1.86, total: 16.89 },
  '2025-01': { URIMH: 10.52, URIMP: 6.45, URIPB: 0.65, URIPU: 1.67, total: 19.29 },
};

(async () => {
  try {
    // ═══════════════════════════════════════════════════════════════
    // ANALYSIS 1: Aug/Sep 2024 — 0.01 Cr difference root cause
    // ═══════════════════════════════════════════════════════════════
    console.log('=== ANALYSIS 1: Aug/Sep 2024 — Why 0.01 Cr diff? ===\n');

    // The dashboard uses buildTrendCTE which groups by (Invoice_No_, Invoice_Date_)
    // while CRD groups by Invoice_No_ only. Check if any invoices have
    // different dates across partitions in Aug/Sep.

    for (const month of ['2024-08', '2024-09']) {
      // Method A: CRD method (GROUP BY Invoice_No_ only)
      const rA = await db.query(`
        SELECT "Site_" AS site,
          ROUND(SUM(invoice_net)::NUMERIC, 2) AS total_net
        FROM (
          SELECT "Invoice_No_", MAX("Site_") AS "Site_",
            SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net
          FROM "LandingStage2".mf_sales_si_siheader_all
          WHERE "Invoice_No_" NOT ILIKE '%-R%'
            AND "Status_" = 'Exported To GL'
            AND "Invoice_Type_" != '0'
            AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '${month}'
          GROUP BY "Invoice_No_"
        ) sub
        GROUP BY "Site_"
        ORDER BY "Site_"
      `);

      // Method B: Dashboard trend method (GROUP BY Invoice_No_, Invoice_Date_)
      const rB = await db.query(`
        SELECT MAX("Site_") AS site,
          ROUND(SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0))::NUMERIC, 2) AS total_net
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '${month}'
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      `);
      // Aggregate method B by site
      const bySite = {};
      for (const r of rB.rows) {
        bySite[r.site] = (bySite[r.site] || 0) + parseFloat(r.total_net);
      }

      console.log(`--- ${month} ---`);
      const crd = CRD[month];
      for (const r of rA.rows) {
        const netA = (parseFloat(r.total_net) / 1e7).toFixed(4);
        const netB = ((bySite[r.site] || 0) / 1e7).toFixed(4);
        const crdVal = crd[r.site];
        console.log(`  ${r.site}: CRD_method=${netA} Cr, Trend_method=${netB} Cr, CRD_ref=${crdVal} Cr`);
      }

      // Find invoices with multiple dates in this month
      const rDup = await db.query(`
        SELECT "Invoice_No_", COUNT(DISTINCT "Invoice_Date_(Date)") AS date_cnt,
          ARRAY_AGG(DISTINCT "Invoice_Date_(Date)" ORDER BY "Invoice_Date_(Date)") AS dates,
          MAX("Site_") AS site,
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS total_amt
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '${month}'
        GROUP BY "Invoice_No_"
        HAVING COUNT(DISTINCT "Invoice_Date_(Date)") > 1
        ORDER BY total_amt DESC
        LIMIT 10
      `);
      if (rDup.rows.length > 0) {
        console.log(`  Multi-date invoices: ${rDup.rows.length}`);
        for (const r of rDup.rows.slice(0,5)) {
          console.log(`    ${r.invoice_no_}: dates=${r.dates.join(',')}, site=${r.site}, amt=${(r.total_amt/1e7).toFixed(4)} Cr`);
        }
      } else {
        console.log(`  No multi-date invoices found.`);
      }

      // SUM(DISTINCT) collision check: invoices with same Amount_ value
      const rCollision = await db.query(`
        SELECT CAST("Amount_" AS NUMERIC) AS amt, COUNT(DISTINCT "Invoice_No_") AS inv_cnt
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '${month}'
        GROUP BY CAST("Amount_" AS NUMERIC)
        HAVING COUNT(DISTINCT "Invoice_No_") > 1
        ORDER BY amt DESC
        LIMIT 5
      `);
      if (rCollision.rows.length > 0) {
        console.log(`  Amount collisions (same Amount_ across invoices): ${rCollision.rows.length} distinct amounts shared`);
      }
      console.log('');
    }

    // ═══════════════════════════════════════════════════════════════
    // ANALYSIS 2: Dec 2024 — 0.07 Cr total diff (URIMP -0.06)
    // ═══════════════════════════════════════════════════════════════
    console.log('=== ANALYSIS 2: Dec 2024 — URIMP 0.06 Cr diff ===\n');

    // Check if some Dec 2024 URIMP invoices are not yet "Exported To GL"
    const rDec = await db.query(`
      SELECT "Status_", COUNT(DISTINCT "Invoice_No_") AS inv_cnt,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC)) / 10000000, 4) AS net_cr
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '2024-12'
        AND "Status_" IN ('Exported To GL', 'Approved', 'Released', 'Open')
      GROUP BY "Status_"
      ORDER BY net_cr DESC
    `);
    console.log('URIMP Dec 2024 by status:');
    let decTotal = 0;
    for (const r of rDec.rows) {
      decTotal += parseFloat(r.net_cr);
      console.log(`  ${r.Status_}: ${r.inv_cnt} invoices, ${r.net_cr} Cr`);
    }
    console.log(`  Combined: ${decTotal.toFixed(4)} Cr (CRD: 3.40 Cr, diff: ${(decTotal - 3.40).toFixed(4)})`);

    // Check if URIMP Dec has invoices that were in Exported To GL at one partition
    // but different status in another
    const rDecStatus = await db.query(`
      SELECT "Invoice_No_",
        ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS statuses,
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '2024-12'
      GROUP BY "Invoice_No_"
      HAVING COUNT(DISTINCT "Status_") > 1
      ORDER BY amt DESC
      LIMIT 10
    `);
    console.log(`\nURIMP Dec 2024: ${rDecStatus.rows.length} invoices with multiple statuses`);
    for (const r of rDecStatus.rows.slice(0,5)) {
      console.log(`  ${r.invoice_no_}: statuses=${r.statuses.join(',')}, amt=${(r.amt/1e7).toFixed(4)} Cr`);
    }

    // ═══════════════════════════════════════════════════════════════
    // ANALYSIS 3: Jan 2025 — 0.89 Cr total diff (all sites off)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n=== ANALYSIS 3: Jan 2025 — Major diff ===\n');

    const rJan = await db.query(`
      SELECT "Status_", "Site_",
        COUNT(DISTINCT "Invoice_No_") AS inv_cnt,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC)) / 10000000, 4) AS net_cr
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '2025-01'
        AND "Status_" IN ('Exported To GL', 'Approved', 'Released', 'Open')
      GROUP BY "Status_", "Site_"
      ORDER BY "Site_", "Status_"
    `);
    console.log('Jan 2025 by status + site:');
    for (const r of rJan.rows) {
      console.log(`  ${r.Site_} ${r.Status_}: ${r.inv_cnt} inv, ${r.net_cr} Cr`);
    }

    // Check invoices that changed from Exported to other status
    const rJanFlip = await db.query(`
      SELECT "Invoice_No_", "Site_",
        ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS statuses,
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '2025-01'
      GROUP BY "Invoice_No_", "Site_"
      HAVING ARRAY_LENGTH(ARRAY_AGG(DISTINCT "Status_"), 1) > 1
        AND 'Exported To GL' = ANY(ARRAY_AGG(DISTINCT "Status_"))
      ORDER BY amt DESC
    `);
    console.log(`\nJan 2025 invoices with Exported + other status: ${rJanFlip.rows.length}`);
    let flipTotal = 0;
    for (const r of rJanFlip.rows.slice(0,10)) {
      flipTotal += parseFloat(r.amt);
      console.log(`  ${r.invoice_no_} (${r.Site_}): statuses=${r.statuses.join(',')}, amt=${(r.amt/1e7).toFixed(4)} Cr`);
    }

    // ═══════════════════════════════════════════════════════════════
    // ANALYSIS 4: Apr-Jul 2025 — Large diffs
    // ═══════════════════════════════════════════════════════════════
    console.log('\n=== ANALYSIS 4: Apr-Jul 2025 ===\n');

    for (const month of ['2025-04', '2025-05', '2025-06', '2025-07']) {
      const rStatus = await db.query(`
        SELECT "Status_", COUNT(DISTINCT "Invoice_No_") AS inv_cnt,
          ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC)) / 10000000, 2) AS net_cr
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') = '${month}'
          AND "Status_" != '0'
        GROUP BY "Status_"
        ORDER BY net_cr DESC
      `);
      console.log(`--- ${month} ---`);
      for (const r of rStatus.rows) {
        console.log(`  ${r.Status_}: ${r.inv_cnt} inv, ${r.net_cr} Cr`);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // ANALYSIS 5: Exact raw numbers for all months (to 4 decimal)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n=== ANALYSIS 5: Exact raw numbers (4 decimal Cr) ===\n');

    const rAll = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        ROUND(SUM(invoice_net)::NUMERIC, 2) AS total_net,
        ROUND(SUM(invoice_gross)::NUMERIC, 2) AS total_gross
      FROM (
        SELECT "Invoice_No_", MAX("Site_") AS "Site_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net,
          SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-07'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month_key, site
      ORDER BY month_key, site
    `);

    for (const r of rAll.rows) {
      const netCr = (parseFloat(r.total_net) / 1e7).toFixed(4);
      const grossCr = (parseFloat(r.total_gross) / 1e7).toFixed(4);
      const crdNet = CRD[r.month_key]?.[r.site];
      const crdGross = CRD_GROSS[r.month_key]?.[r.site];
      const netDiff = crdNet !== undefined ? (netCr - crdNet).toFixed(4) : '?';
      const grossDiff = crdGross !== undefined ? (grossCr - crdGross).toFixed(4) : '?';
      console.log(`${r.month_key} ${r.site}: net=${netCr} (CRD=${crdNet||'?'} diff=${netDiff}) gross=${grossCr} (CRD=${crdGross||'?'} diff=${grossDiff})`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
