'use strict';
const db = require('./db/connection');

// CRD Sales Invoice Register values for Apr-Jul 2025
const CRD2025 = {
  '2025-04': { URIMH: { net: 7.91, gross: 9.42 }, URIMP: { net: 4.50, gross: 5.43 }, URIPB: { net: 0.77, gross: 0.90 }, URIPU: { net: 1.59, gross: 1.88 }, total: { net: 14.77, gross: 17.64 } },
  '2025-05': { URIMH: { net: 8.50, gross: 10.11 }, URIMP: { net: 3.35, gross: 4.05 }, URIPB: { net: 0.70, gross: 0.82 }, URIPU: { net: 1.64, gross: 1.93 }, total: { net: 14.18, gross: 16.91 } },
  '2025-06': { URIMH: { net: 8.18, gross: 9.75 }, URIMP: { net: 3.39, gross: 4.10 }, URIPB: { net: 0.70, gross: 0.82 }, URIPU: { net: 0.98, gross: 1.16 }, total: { net: 13.25, gross: 15.83 } },
  '2025-07': { URIMH: { net: 10.11, gross: 12.02 }, URIMP: { net: 2.32, gross: 2.80 }, URIPB: { net: 1.02, gross: 1.21 }, URIPU: { net: 1.58, gross: 1.87 }, total: { net: 15.04, gross: 17.88 } },
};

// CRD summary dashboard values for Apr 2024 - Jan 2025
const CRD = {
  '2024-04': { net: 12.88, gross: 15.34 },
  '2024-05': { net: 11.97, gross: 14.31 },
  '2024-06': { net: 13.11, gross: 15.58 },
  '2024-07': { net: 14.50, gross: 17.35 },
  '2024-08': { net: 14.79, gross: 17.62 },
  '2024-09': { net: 13.74, gross: 16.37 },
  '2024-10': { net: 16.41, gross: 19.53 },
  '2024-11': { net: 13.27, gross: 15.82 },
  '2024-12': { net: 14.22, gross: 16.89 },
  '2025-01': { net: 16.12, gross: 19.29 },
};

(async () => {
  try {
    // Test: Item table values for 2025 using buildItemCTE-like approach
    console.log('=== Item Table Values (Apr-Jul 2025) - All Statuses ===\n');

    const r1 = await db.query(`
      WITH item_combos AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          MAX(h."Site_") AS site,
          MAX(h."Invoice_Date_(Date)") AS inv_date,
          COALESCE(NULLIF(i."Item_Amount_",'')::NUMERIC, 0) AS amt,
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0) AS qty,
          COALESCE(NULLIF(i."Item_Net_Amount_",'')::NUMERIC, 0) AS net_amt,
          COALESCE(NULLIF(i."Rate_",'')::NUMERIC, 0) AS rate,
          COUNT(*) AS combo_count
        FROM "LandingStage2"."sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN "LandingStage2"."mf_sales_si_siheader_all" h
          ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Invoice_No_" NOT LIKE '%-R'
          AND i."Item_Code_" IS NOT NULL AND i."Item_Code_" != '' AND i."Item_Code_" != '0'
          AND COALESCE(NULLIF(i."Item_Amount_",'')::NUMERIC, 0) != 0
          AND h."Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND h."Invoice_Type_" != '0'
          AND TO_CHAR(h."Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2025-04' AND '2025-07'
        GROUP BY i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Item_Amount_",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Item_Net_Amount_",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Rate_",'')::NUMERIC, 0)
      ),
      item_factors AS (
        SELECT "Invoice_No_", "Item_Code_",
          MIN(combo_count) AS factor
        FROM item_combos
        GROUP BY "Invoice_No_", "Item_Code_"
      ),
      deduped_items AS (
        SELECT ic."Invoice_No_", ic."Item_Code_", ic.site, ic.inv_date,
          ic.amt * (ic.combo_count / f.factor) AS item_amount,
          ic.net_amt * (ic.combo_count / f.factor) AS item_net_amount
        FROM item_combos ic
        INNER JOIN item_factors f
          ON ic."Invoice_No_" = f."Invoice_No_"
          AND ic."Item_Code_" = f."Item_Code_"
      )
      SELECT
        TO_CHAR(inv_date::DATE, 'YYYY-MM') AS month_key,
        site,
        SUM(item_amount) / 10000000 AS net_cr,
        SUM(item_net_amount) / 10000000 AS gross_cr
      FROM deduped_items
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

    // Also test: header table with Exported To GL for gross amount for Apr 2024-Jan 2025
    console.log('\n=== Header Table Gross (Exported To GL) for Apr 2024 - Jan 2025 ===\n');
    const r2 = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        SUM(invoice_net) / 10000000 AS net_cr,
        SUM(invoice_gross) / 10000000 AS gross_cr
      FROM (
        SELECT "Invoice_No_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net,
          SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-01'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month_key
      ORDER BY month_key
    `);

    for (const row of r2.rows) {
      const crd = CRD[row.month_key];
      const net = parseFloat(row.net_cr).toFixed(2);
      const gross = parseFloat(row.gross_cr).toFixed(2);
      const netDiff = crd ? (net - crd.net).toFixed(2) : '?';
      const grossDiff = crd ? (gross - crd.gross).toFixed(2) : '?';
      const netOk = crd ? Math.abs(net - crd.net) <= 0.02 : false;
      const grossOk = crd ? Math.abs(gross - crd.gross) <= 0.02 : false;
      console.log(`  ${row.month_key}: net=${net} (CRD=${crd?.net}, diff=${netDiff} ${netOk?'✓':'✗'}) gross=${gross} (CRD=${crd?.gross}, diff=${grossDiff} ${grossOk?'✓':'✗'})`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
