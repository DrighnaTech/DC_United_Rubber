/**
 * Validate item-level data v2 — using SUM(DISTINCT) for item dedup
 * and checking Item_Type = 'Finished Goods' filter
 */
'use strict';
const db = require('./db/connection');
const XLSX = require('xlsx');

(async () => {
  try {
    // Parse CRD detail to get Item_Type values
    const wb = XLSX.readFile('CRD/Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx');
    const ws = wb.Sheets['Sales Invoice Register Report'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Col 6 = Item Type
    const itemTypes = new Set();
    for (let i = 1; i < data.length; i++) {
      if (data[i][6]) itemTypes.add(data[i][6]);
    }
    console.log('CRD Item Types:', [...itemTypes]);

    // Check CRD for specific URIMH invoice
    const sampleInv = 'LINV252600005';
    console.log('\nCRD items for', sampleInv + ':');
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === sampleInv) {
        console.log('  Item:', data[i][4], '| Amt:', data[i][12], '| Net:', data[i][13], '| Tax:', data[i][14], '| Qty:', data[i][9], '| Type:', data[i][6]);
      }
    }

    // Check same invoice in DB
    const r0 = await db.query(`
      SELECT "Item_Code_", "Item_Amount", "Item_NetAmount", "Item_Total_Tax",
             "Sales_Qty_", "Item_Type", row_id
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" = '${sampleInv}'
        AND "Item_Code_" IS NOT NULL AND "Item_Code_" != ''
      ORDER BY "Item_Code_", row_id
    `);
    console.log('\nDB items for', sampleInv + ':', r0.rows.length, 'rows');
    r0.rows.forEach(r => console.log('  Item:', r.Item_Code_, '| Amt:', r.Item_Amount,
      '| Net:', r.Item_NetAmount, '| Qty:', r.Sales_Qty_, '| Type:', r.Item_Type, '| rowid:', r.row_id));

    // CRD reference
    const crd = {
      '2025-04': { URIMH: 79073333.36, URIMP: 45030281.73, URIPB: 7663651.39, URIPU: 15903648.97 },
      '2025-05': { URIMH: 85025253.28, URIMP: 33501346.19, URIPB: 6956986.94, URIPU: 16350975.73 },
      '2025-06': { URIMH: 81781432.23, URIMP: 33924059.39, URIPB: 6954093.21, URIPU: 9846982.97 },
      '2025-07': { URIMH: 101111886.95, URIMP: 23230513.26, URIPB: 10212076.84, URIPU: 15814432.51 },
    };

    // Strategy: GROUP BY (Invoice_No_, Item_Code_) + SUM(DISTINCT Item_Amount)
    // Filter: Item_Type = 'Finished Goods' only (matching CRD)
    const r1 = await db.query(`
      WITH filtered_hdr AS (
        SELECT "Invoice_No_", MAX("Site_") AS site,
               MAX("Invoice_Date_(Date)") AS inv_date
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
          AND "Invoice_Date_(Date)" >= '2025-04-01'
          AND "Invoice_Date_(Date)" <= '2025-07-31'
        GROUP BY "Invoice_No_"
      ),
      item_agg AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS item_amount,
          SUM(DISTINCT COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0)) AS item_net_amount,
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0)) AS item_total_tax
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Invoice_No_" NOT LIKE '%-R'
          AND i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
          AND i."Item_Type" = 'Finished Goods'
        GROUP BY i."Invoice_No_", i."Item_Code_"
      )
      SELECT
        h.site,
        TO_CHAR(h.inv_date::DATE, 'YYYY-MM') AS month,
        COUNT(*) AS item_rows,
        COUNT(DISTINCT ia."Invoice_No_") AS invoices,
        ROUND(SUM(ia.item_amount), 2) AS sum_item_amount,
        ROUND(SUM(ia.item_net_amount), 2) AS sum_item_net_amount,
        ROUND(SUM(ia.item_total_tax), 2) AS sum_item_total_tax
      FROM item_agg ia
      INNER JOIN filtered_hdr h ON ia."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM')
      ORDER BY month, site
    `);

    console.log('\n=== SUM(DISTINCT) + Finished Goods ONLY ===');
    console.log('Month   | Site  | Items | Inv  | Sys ItemAmt      | CRD ItemAmt      | Diff');
    for (const row of r1.rows) {
      const c = crd[row.month]?.[row.site];
      if (c) {
        const diff = parseFloat(row.sum_item_amount) - c;
        console.log(row.month, '|', row.site.padEnd(6), '|', String(row.item_rows).padEnd(6), '|',
          String(row.invoices).padEnd(5), '|', String(row.sum_item_amount).padEnd(17), '|',
          c.toFixed(2).padEnd(17), '|', diff.toFixed(2));
      }
    }

    // Now try WITHOUT Item_Type filter (ALL types)
    const r2 = await db.query(`
      WITH filtered_hdr AS (
        SELECT "Invoice_No_", MAX("Site_") AS site,
               MAX("Invoice_Date_(Date)") AS inv_date
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
          AND "Invoice_Date_(Date)" >= '2025-04-01'
          AND "Invoice_Date_(Date)" <= '2025-07-31'
        GROUP BY "Invoice_No_"
      ),
      item_agg AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS item_amount,
          SUM(DISTINCT COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0)) AS item_net_amount,
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0)) AS item_total_tax
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Invoice_No_" NOT LIKE '%-R'
          AND i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_"
      )
      SELECT
        h.site,
        TO_CHAR(h.inv_date::DATE, 'YYYY-MM') AS month,
        COUNT(*) AS item_rows,
        COUNT(DISTINCT ia."Invoice_No_") AS invoices,
        ROUND(SUM(ia.item_amount), 2) AS sum_item_amount
      FROM item_agg ia
      INNER JOIN filtered_hdr h ON ia."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM')
      ORDER BY month, site
    `);

    console.log('\n=== SUM(DISTINCT) + ALL Item Types ===');
    console.log('Month   | Site  | Items | Inv  | Sys ItemAmt      | CRD ItemAmt      | Diff');
    for (const row of r2.rows) {
      const c = crd[row.month]?.[row.site];
      if (c) {
        const diff = parseFloat(row.sum_item_amount) - c;
        console.log(row.month, '|', row.site.padEnd(6), '|', String(row.item_rows).padEnd(6), '|',
          String(row.invoices).padEnd(5), '|', String(row.sum_item_amount).padEnd(17), '|',
          c.toFixed(2).padEnd(17), '|', diff.toFixed(2));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
