/**
 * Find the correct dedup strategy by analyzing:
 * 1. CRD detail for problematic items
 * 2. DB row structure and duplication patterns
 * 3. Relationship between item sub-tables (sipl, siid, sisd, etc.)
 */
'use strict';
const db = require('./db/connection');
const XLSX = require('xlsx');

(async () => {
  try {
    // 1. Check CRD detail for LINV252600570
    const wb = XLSX.readFile('CRD/Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx');
    const ws = wb.Sheets['Sales Invoice Register Report'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    console.log('=== CRD detail rows for LINV252600570 ===');
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === 'LINV252600570') {
        console.log(`  Item: ${data[i][4]} | Amt: ${data[i][12]} | Net: ${data[i][13]} | Tax: ${data[i][14]} | Qty: ${data[i][9]} | Rate: ${data[i][11]}`);
      }
    }

    console.log('\n=== CRD detail rows for LINV252604442 ===');
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === 'LINV252604442') {
        console.log(`  Item: ${data[i][4]} | Amt: ${data[i][12]} | Net: ${data[i][13]} | Tax: ${data[i][14]} | Qty: ${data[i][9]} | Rate: ${data[i][11]}`);
      }
    }

    // 2. Check if there's a unique line identifier in the DB
    console.log('\n=== DB columns for item table ===');
    const cols = await db.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'LandingStage2'
        AND table_name = 'mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all'
      ORDER BY ordinal_position
    `);
    console.log('Columns:', cols.rows.map(r => r.column_name).join(', '));

    // 3. Check if "Line_No_" or similar field exists to distinguish line items
    const r1 = await db.query(`
      SELECT "Item_Code_", "Item_Amount", "Sales_Qty_", "Rate_",
        "Line_No_", "Serial_No_"
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" = 'LINV252600570' AND "Item_Code_" = 'PM-0327'
        AND COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0) != 0
      ORDER BY "Line_No_", row_id
      LIMIT 20
    `);
    console.log('\n=== PM-0327 non-zero rows with Line_No_ ===');
    r1.rows.forEach(r => console.log(
      `  Line: ${r.Line_No_} | Serial: ${r.Serial_No_} | Amt: ${r.Item_Amount} | Qty: ${r.Sales_Qty_} | Rate: ${r.Rate_}`
    ));

    // 4. Check PM-0325 similarly
    const r2 = await db.query(`
      SELECT "Item_Code_", "Item_Amount", "Sales_Qty_", "Rate_",
        "Line_No_", "Serial_No_"
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" = 'LINV252600570' AND "Item_Code_" = 'PM-0325'
        AND COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0) != 0
      ORDER BY "Line_No_", row_id
      LIMIT 20
    `);
    console.log('\n=== PM-0325 non-zero rows with Line_No_ ===');
    r2.rows.forEach(r => console.log(
      `  Line: ${r.Line_No_} | Serial: ${r.Serial_No_} | Amt: ${r.Item_Amount} | Qty: ${r.Sales_Qty_} | Rate: ${r.Rate_}`
    ));

    // 5. Check a normal item (no multi-amount issue) for LINV252600570
    const r3 = await db.query(`
      SELECT "Item_Code_",
        COUNT(*) AS total_rows,
        COUNT(*) FILTER(WHERE COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0) != 0) AS nonzero_rows,
        array_agg(DISTINCT COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0)
          ORDER BY COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0)) AS amounts
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" = 'LINV252600570'
        AND "Item_Code_" IS NOT NULL AND "Item_Code_" != ''
      GROUP BY "Item_Code_"
      ORDER BY "Item_Code_"
    `);
    console.log('\n=== All items for LINV252600570 ===');
    r3.rows.forEach(r => console.log(
      `  ${r.Item_Code_} | total: ${r.total_rows} | nonzero: ${r.nonzero_rows} | amounts: [${r.amounts}]`
    ));

    // 6. Try dedup using DISTINCT ON (Invoice_No_, Item_Code_, Line_No_)
    console.log('\n=== Test: GROUP BY (Invoice_No_, Item_Code_, Line_No_) for URIMH Apr ===');
    const r4 = await db.query(`
      WITH filtered_hdr AS (
        SELECT "Invoice_No_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
          AND "Invoice_Date_(Date)" >= '2025-04-01' AND "Invoice_Date_(Date)" <= '2025-04-30'
          AND "Site_" = 'URIMH'
        GROUP BY "Invoice_No_"
      )
      SELECT ROUND(SUM(amt), 2) AS total_amt, COUNT(*) AS item_count
      FROM (
        SELECT i."Invoice_No_", i."Item_Code_", i."Line_No_",
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS amt
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_", i."Line_No_"
      ) sub
    `);
    console.log('GROUP BY (inv, item, line) SUM(DISTINCT):', r4.rows[0]?.total_amt, '| items:', r4.rows[0]?.item_count, '| CRD: 79073333.36');

    // 7. Try with Sales_Qty_ as additional grouping dimension
    const r5 = await db.query(`
      WITH filtered_hdr AS (
        SELECT "Invoice_No_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
          AND "Invoice_Date_(Date)" >= '2025-04-01' AND "Invoice_Date_(Date)" <= '2025-04-30'
          AND "Site_" = 'URIMH'
        GROUP BY "Invoice_No_"
      )
      SELECT ROUND(SUM(amt), 2) AS total_amt, COUNT(*) AS item_count
      FROM (
        SELECT i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0) AS qty,
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS amt
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_", COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0)
      ) sub
    `);
    console.log('GROUP BY (inv, item, qty) SUM(DISTINCT):', r5.rows[0]?.total_amt, '| items:', r5.rows[0]?.item_count, '| CRD: 79073333.36');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
