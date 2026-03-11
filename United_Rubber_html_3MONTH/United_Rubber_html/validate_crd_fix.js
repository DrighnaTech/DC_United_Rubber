/**
 * Investigate the correct dedup approach:
 * For items with SUM(DISTINCT) gaps, check actual row structure
 * and find a dedup that gives 100% match
 */
'use strict';
const db = require('./db/connection');

(async () => {
  try {
    // Check PM-0327 in LINV252600570 — all rows across partitions
    console.log('=== LINV252600570 | PM-0327 — All rows ===');
    const r1 = await db.query(`
      SELECT row_id, src_year, src_month, src_part,
        "Item_Code_", "Item_Amount", "Item_NetAmount", "Sales_Qty_",
        "Item_Total_Tax"
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" = 'LINV252600570' AND "Item_Code_" = 'PM-0327'
      ORDER BY row_id
    `);
    r1.rows.forEach(r => console.log(
      `  row_id: ${r.row_id} | src: ${r.src_year}-${r.src_month} p${r.src_part} | ` +
      `amt: ${r.Item_Amount} | net: ${r.Item_NetAmount} | qty: ${r.Sales_Qty_} | tax: ${r.Item_Total_Tax}`
    ));

    console.log('\n=== LINV252600570 | PM-0325 — All rows ===');
    const r2 = await db.query(`
      SELECT row_id, src_year, src_month, src_part,
        "Item_Code_", "Item_Amount", "Item_NetAmount", "Sales_Qty_",
        "Item_Total_Tax"
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" = 'LINV252600570' AND "Item_Code_" = 'PM-0325'
      ORDER BY row_id
    `);
    r2.rows.forEach(r => console.log(
      `  row_id: ${r.row_id} | src: ${r.src_year}-${r.src_month} p${r.src_part} | ` +
      `amt: ${r.Item_Amount} | net: ${r.Item_NetAmount} | qty: ${r.Sales_Qty_} | tax: ${r.Item_Total_Tax}`
    ));

    // Jun item: LINV252604442 | ID340432-H01017
    console.log('\n=== LINV252604442 | ID340432-H01017 — All rows ===');
    const r3 = await db.query(`
      SELECT row_id, src_year, src_month, src_part,
        "Item_Code_", "Item_Amount", "Item_NetAmount", "Sales_Qty_",
        "Item_Total_Tax"
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" = 'LINV252604442' AND "Item_Code_" = 'ID340432-H01017'
      ORDER BY row_id
    `);
    r3.rows.forEach(r => console.log(
      `  row_id: ${r.row_id} | src: ${r.src_year}-${r.src_month} p${r.src_part} | ` +
      `amt: ${r.Item_Amount} | net: ${r.Item_NetAmount} | qty: ${r.Sales_Qty_} | tax: ${r.Item_Total_Tax}`
    ));

    // Now test: partition-aware dedup approach
    // For each (Invoice_No_, Item_Code_), pick rows from the LATEST partition that has non-zero amounts
    // Then SUM (not DISTINCT) those rows
    console.log('\n=== Testing partition-aware approach for URIMH Apr ===');
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
      ),
      -- Find the latest partition (src_year, src_month, src_part) per invoice+item with non-zero amounts
      latest_partition AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          MAX(ARRAY[i.src_year::TEXT, LPAD(i.src_month::TEXT,2,'0'), LPAD(i.src_part::TEXT,3,'0')]) AS latest_src
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
          AND COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0
        GROUP BY i."Invoice_No_", i."Item_Code_"
      )
      SELECT
        ROUND(SUM(COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)), 2) AS total_amt
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
      INNER JOIN latest_partition lp ON i."Invoice_No_" = lp."Invoice_No_" AND i."Item_Code_" = lp."Item_Code_"
      WHERE i.src_year::TEXT = lp.latest_src[1]
        AND LPAD(i.src_month::TEXT,2,'0') = lp.latest_src[2]
        AND LPAD(i.src_part::TEXT,3,'0') = lp.latest_src[3]
        AND COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0
    `);
    console.log('Partition-aware SUM for URIMH Apr:', r4.rows[0]?.total_amt, '| CRD: 79073333.36');

    // Simpler approach: pick rows from the latest src combo that has non-zero data
    // Use row_id range as proxy for partition ordering
    console.log('\n=== Testing MAX(row_id)-based approach ===');

    // For each invoice+item, find which "group" of rows is the latest non-zero
    // Group = same (src_year, src_month, src_part)
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
      ),
      item_partitions AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          i.src_year, i.src_month, i.src_part,
          SUM(COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS part_total,
          MAX(i.row_id) AS max_row_id,
          bool_or(COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0) AS has_nonzero
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_", i.src_year, i.src_month, i.src_part
      ),
      best_partition AS (
        SELECT DISTINCT ON ("Invoice_No_", "Item_Code_")
          "Invoice_No_", "Item_Code_", part_total, src_year, src_month, src_part
        FROM item_partitions
        WHERE has_nonzero = true
        ORDER BY "Invoice_No_", "Item_Code_", max_row_id DESC
      )
      SELECT ROUND(SUM(part_total), 2) AS total_amt,
        COUNT(*) AS item_count
      FROM best_partition
    `);
    console.log('Best-partition SUM for URIMH Apr:', r5.rows[0]?.total_amt, '| items:', r5.rows[0]?.item_count, '| CRD: 79073333.36');

    // Also test for all sites+months
    console.log('\n=== Best-partition approach: All sites Apr-Jun ===');
    const crd = {
      '2025-04': { URIMH: 79073333.36, URIMP: 45030281.73, URIPB: 7663651.39, URIPU: 15903648.97 },
      '2025-05': { URIMH: 85025253.28, URIMP: 33501346.19, URIPB: 6956986.94, URIPU: 16350975.73 },
      '2025-06': { URIMH: 81781432.23, URIMP: 33924059.39, URIPB: 6954093.21, URIPU: 9846982.97 },
    };

    const r6 = await db.query(`
      WITH filtered_hdr AS (
        SELECT "Invoice_No_", MAX("Site_") AS site,
               MAX("Invoice_Date_(Date)") AS inv_date
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
          AND "Invoice_Date_(Date)" >= '2025-04-01'
          AND "Invoice_Date_(Date)" <= '2025-06-30'
        GROUP BY "Invoice_No_"
      ),
      item_partitions AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          i.src_year, i.src_month, i.src_part,
          SUM(COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS part_amt,
          SUM(COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0)) AS part_net,
          SUM(COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0)) AS part_tax,
          MAX(i.row_id) AS max_row_id,
          bool_or(COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0) AS has_nonzero
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_", i.src_year, i.src_month, i.src_part
      ),
      best_partition AS (
        SELECT DISTINCT ON ("Invoice_No_", "Item_Code_")
          "Invoice_No_", "Item_Code_", part_amt, part_net, part_tax
        FROM item_partitions
        WHERE has_nonzero = true
        ORDER BY "Invoice_No_", "Item_Code_", max_row_id DESC
      )
      SELECT h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM') AS month,
        COUNT(*) AS items,
        ROUND(SUM(bp.part_amt), 2) AS total_amt,
        ROUND(SUM(bp.part_net), 2) AS total_net,
        ROUND(SUM(bp.part_tax), 2) AS total_tax
      FROM best_partition bp
      INNER JOIN filtered_hdr h ON bp."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM')
      ORDER BY month, site
    `);

    console.log('Month   | Site  | Items | Sys ItemAmt      | CRD ItemAmt      | Diff');
    for (const row of r6.rows) {
      const c = crd[row.month]?.[row.site];
      if (c) {
        const diff = parseFloat(row.total_amt) - c;
        const status = Math.abs(diff) < 1 ? 'EXACT' : Math.abs(diff/c*100) < 0.1 ? 'CLOSE' : 'DIFF';
        console.log(row.month, '|', row.site.padEnd(6), '|', String(row.items).padEnd(6), '|',
          String(row.total_amt).padStart(17), '|', c.toFixed(2).padStart(17), '|',
          diff.toFixed(2).padStart(11), '|', status);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
