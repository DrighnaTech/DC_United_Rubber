/**
 * Validate item-level data against CRD Sales Invoice Register (New)
 * CRD: Apr 2025 - Jul 2025
 * Filters: Status IN (Open, Approved, Released, Exported To GL)
 *          Type IN (Sales (Commercial), Service, Scrap)
 *          Exclude: %-R reversals
 * Data: Item_Amount, Item_NetAmount, Item_Total_Tax per site per month
 */
'use strict';
const db = require('./db/connection');

(async () => {
  try {
    // CRD reference values from Sheet1 (exact values)
    const crd = {
      '2025-04': {
        URIMH: { amt: 79073333.36, net: 94235578.31, tax: 15162244.95 },
        URIMP: { amt: 45030281.73, net: 54338631.95, tax: 9308350.22 },
        URIPB: { amt: 7663651.39, net: 9043106.53, tax: 1379455.14 },
        URIPU: { amt: 15903648.97, net: 18772341.51, tax: 2868692.54 },
      },
      '2025-05': {
        URIMH: { amt: 85025253.28, net: 101128355.25, tax: 16103101.97 },
        URIMP: { amt: 33501346.19, net: 40493426.99, tax: 6992080.80 },
        URIPB: { amt: 6956986.94, net: 8209242.62, tax: 1252255.68 },
        URIPU: { amt: 16350975.73, net: 19303709.25, tax: 2952733.52 },
      },
      '2025-06': {
        URIMH: { amt: 81781432.23, net: 97477605.01, tax: 15696172.78 },
        URIMP: { amt: 33924059.39, net: 41021601.79, tax: 7097542.40 },
        URIPB: { amt: 6954093.21, net: 8205828.15, tax: 1251734.94 },
        URIPU: { amt: 9846982.97, net: 11619437.47, tax: 1772454.50 },
      },
      '2025-07': {
        URIMH: { amt: 101111886.95, net: 120156637.94, tax: 19044751.00 },
        URIMP: { amt: 23230513.26, net: 27954063.83, tax: 4723550.57 },
        URIPB: { amt: 10212076.84, net: 12050248.86, tax: 1838172.02 },
        URIPU: { amt: 15814432.51, net: 18661027.05, tax: 2846594.54 },
      },
    };

    // Step 1: Get filtered header invoices
    // Using GROUP BY Invoice_No_ with all filters inside WHERE
    const headerSQL = `
      SELECT "Invoice_No_", MAX("Site_") AS site,
             MAX("Invoice_Date_(Date)") AS inv_date
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
        AND "Invoice_Date_(Date)" >= '2025-04-01'
        AND "Invoice_Date_(Date)" <= '2025-07-31'
        AND "Status_" != '0'
        AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_No_"
    `;

    // Step 2: For each filtered invoice, get deduplicated items
    // DISTINCT ON (Invoice_No_, Item_Code_) ORDER BY row_id DESC
    // Include items with Sales_Qty_ = 0 (service items may have 0 qty)
    const query = `
      WITH filtered_hdr AS (${headerSQL}),
      deduped_items AS (
        SELECT DISTINCT ON (i."Invoice_No_", i."Item_Code_")
          i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) AS item_amount,
          COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0) AS item_net_amount,
          COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0) AS item_total_tax,
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0) AS sales_qty
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Invoice_No_" NOT LIKE '%-R'
          AND i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        ORDER BY i."Invoice_No_", i."Item_Code_", i.row_id DESC
      )
      SELECT
        h.site,
        TO_CHAR(h.inv_date::DATE, 'YYYY-MM') AS month,
        COUNT(*) AS item_rows,
        COUNT(DISTINCT di."Invoice_No_") AS invoices,
        ROUND(SUM(di.item_amount), 2) AS sum_item_amount,
        ROUND(SUM(di.item_net_amount), 2) AS sum_item_net_amount,
        ROUND(SUM(di.item_total_tax), 2) AS sum_item_total_tax
      FROM deduped_items di
      INNER JOIN filtered_hdr h ON di."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM')
      ORDER BY month, site
    `;

    const result = await db.query(query);

    console.log('\n=== ITEM-LEVEL VALIDATION: System vs CRD ===');
    console.log('Month   | Site  | Items | Inv  | Sys Item Amt    | CRD Item Amt    | Diff         | %');
    console.log('--------|-------|-------|------|-----------------|-----------------|--------------|-----');

    let totalMatch = 0, totalCells = 0;
    for (const row of result.rows) {
      const c = crd[row.month]?.[row.site];
      if (c) {
        totalCells++;
        const diff = parseFloat(row.sum_item_amount) - c.amt;
        const pct = ((diff / c.amt) * 100).toFixed(3);
        const match = Math.abs(diff) < 1;
        if (match) totalMatch++;
        console.log(
          row.month, '|', row.site.padEnd(6), '|',
          String(row.item_rows).padEnd(6), '|',
          String(row.invoices).padEnd(5), '|',
          String(row.sum_item_amount).padEnd(16), '|',
          c.amt.toFixed(2).padEnd(16), '|',
          diff.toFixed(2).padStart(13), '|', pct + '%'
        );
      }
    }

    console.log('\nMatched:', totalMatch, '/', totalCells);
    console.log('Total item rows:', result.rows.reduce((s, r) => s + parseInt(r.item_rows), 0), '(CRD: ~23,406)');

    // Also show net amount and tax comparison
    console.log('\n=== NET AMOUNT (Item_NetAmount) COMPARISON ===');
    for (const row of result.rows) {
      const c = crd[row.month]?.[row.site];
      if (c) {
        const diff = parseFloat(row.sum_item_net_amount) - c.net;
        console.log(
          row.month, '|', row.site.padEnd(6), '|',
          'Sys:', String(row.sum_item_net_amount).padEnd(16), '|',
          'CRD:', c.net.toFixed(2).padEnd(16), '|',
          'Diff:', diff.toFixed(2)
        );
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
