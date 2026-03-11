'use strict';
const db = require('./db/connection');

// CRD Sales Invoice Register values for Apr-Jul 2025
const CRD2025 = {
  '2025-04': { URIMH: { net: 7.91, gross: 9.42 }, URIMP: { net: 4.50, gross: 5.43 }, URIPB: { net: 0.77, gross: 0.90 }, URIPU: { net: 1.59, gross: 1.88 }, total: { net: 14.77, gross: 17.64 } },
  '2025-05': { URIMH: { net: 8.50, gross: 10.11 }, URIMP: { net: 3.35, gross: 4.05 }, URIPB: { net: 0.70, gross: 0.82 }, URIPU: { net: 1.64, gross: 1.93 }, total: { net: 14.18, gross: 16.91 } },
  '2025-06': { URIMH: { net: 8.18, gross: 9.75 }, URIMP: { net: 3.39, gross: 4.10 }, URIPB: { net: 0.70, gross: 0.82 }, URIPU: { net: 0.98, gross: 1.16 }, total: { net: 13.25, gross: 15.83 } },
  '2025-07': { URIMH: { net: 10.11, gross: 12.02 }, URIMP: { net: 2.32, gross: 2.80 }, URIPB: { net: 1.02, gross: 1.21 }, URIPU: { net: 1.58, gross: 1.87 }, total: { net: 15.04, gross: 17.88 } },
};

(async () => {
  try {
    // Check status distribution for 2025 months
    console.log('=== Status Distribution Apr-Jul 2025 ===\n');
    const r0 = await db.query(`
      SELECT "Status_", COUNT(DISTINCT "Invoice_No_") AS inv_cnt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2025-04' AND '2025-07'
      GROUP BY "Status_"
      ORDER BY inv_cnt DESC
    `);
    for (const row of r0.rows) {
      console.log(`  ${row.Status_}: ${row.inv_cnt} invoices`);
    }

    // Method 2 for 2025: SUM(DISTINCT) + Exported To GL
    console.log('\n=== Method 2 (Exported To GL) for Apr-Jul 2025 ===\n');
    const r1 = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        SUM(invoice_net) / 10000000 AS net_cr,
        SUM(invoice_gross) / 10000000 AS gross_cr
      FROM (
        SELECT "Invoice_No_", "Site_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net,
          SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2025-04' AND '2025-07'
        GROUP BY "Invoice_No_", "Site_"
      ) sub
      GROUP BY month_key, site
      ORDER BY month_key, site
    `);

    for (const row of r1.rows) {
      const crd = CRD2025[row.month_key]?.[row.site];
      const net = parseFloat(row.net_cr).toFixed(2);
      const gross = parseFloat(row.gross_cr).toFixed(2);
      const netDiff = crd ? (net - crd.net).toFixed(2) : '?';
      const grossDiff = crd ? (gross - crd.gross).toFixed(2) : '?';
      const netOk = crd ? Math.abs(net - crd.net) <= 0.02 : false;
      const grossOk = crd ? Math.abs(gross - crd.gross) <= 0.02 : false;
      console.log(`  ${row.month_key} ${row.site}: net=${net} (CRD=${crd?.net}, diff=${netDiff} ${netOk?'✓':'✗'}) gross=${gross} (CRD=${crd?.gross}, diff=${grossDiff} ${grossOk?'✓':'✗'})`);
    }

    // Method: All statuses for 2025
    console.log('\n=== All Statuses for Apr-Jul 2025 ===\n');
    const r2 = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        SUM(invoice_net) / 10000000 AS net_cr,
        SUM(invoice_gross) / 10000000 AS gross_cr
      FROM (
        SELECT "Invoice_No_", "Site_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net,
          SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2025-04' AND '2025-07'
        GROUP BY "Invoice_No_", "Site_"
      ) sub
      GROUP BY month_key, site
      ORDER BY month_key, site
    `);

    for (const row of r2.rows) {
      const crd = CRD2025[row.month_key]?.[row.site];
      const net = parseFloat(row.net_cr).toFixed(2);
      const gross = parseFloat(row.gross_cr).toFixed(2);
      const netDiff = crd ? (net - crd.net).toFixed(2) : '?';
      const grossDiff = crd ? (gross - crd.gross).toFixed(2) : '?';
      const netOk = crd ? Math.abs(net - crd.net) <= 0.02 : false;
      const grossOk = crd ? Math.abs(gross - crd.gross) <= 0.02 : false;
      console.log(`  ${row.month_key} ${row.site}: net=${net} (CRD=${crd?.net}, diff=${netDiff} ${netOk?'✓':'✗'}) gross=${gross} (CRD=${crd?.gross}, diff=${grossDiff} ${grossOk?'✓':'✗'})`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
