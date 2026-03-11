/**
 * Validate v5 — find items with multiple distinct non-zero amounts
 * causing SUM(DISTINCT) to differ from CRD
 */
'use strict';
const db = require('./db/connection');
const XLSX = require('xlsx');

(async () => {
  try {
    // Parse CRD: per-invoice per-item amounts for URIMH Apr
    const wb = XLSX.readFile('CRD/Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx');
    const ws = wb.Sheets['Sales Invoice Register Report'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const crdItems = {}; // key: inv|itemcode → amount
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] !== 'URIMH') continue;
      const dateVal = row[2];
      if (typeof dateVal !== 'number') continue;
      const d = new Date((dateVal - 25569) * 86400000);
      if (d.getMonth() !== 3 || d.getFullYear() !== 2025) continue;
      const key = row[1] + '|' + row[4];
      crdItems[key] = parseFloat(row[12]) || 0;
    }

    // Get our per-item amounts using the correct GROUP BY approach
    const r1 = await db.query(`
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
      SELECT i."Invoice_No_", i."Item_Code_",
        array_agg(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)
                   ORDER BY COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS amounts,
        SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS sum_distinct
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
      INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
      WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
      GROUP BY i."Invoice_No_", i."Item_Code_"
      HAVING COUNT(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) > 2
    `);

    console.log('=== Items with 3+ distinct amounts (SUM(DISTINCT) artifact) ===');
    console.log('Count:', r1.rows.length);
    let artifactDiff = 0;
    for (const row of r1.rows) {
      const key = row.Invoice_No_ + '|' + row.Item_Code_;
      const crdAmt = crdItems[key];
      if (crdAmt !== undefined) {
        const diff = parseFloat(row.sum_distinct) - crdAmt;
        if (Math.abs(diff) > 0.01) {
          artifactDiff += diff;
          console.log(`  ${row.Invoice_No_} | ${row.Item_Code_} | amounts: ${row.amounts.join(', ')} | SUM(D): ${row.sum_distinct} | CRD: ${crdAmt} | Diff: ${diff.toFixed(2)}`);
        }
      }
    }
    console.log('Total artifact diff:', artifactDiff.toFixed(2));

    // Also check: items where SUM(DISTINCT) != CRD, with exactly 2 distinct amounts
    const r2 = await db.query(`
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
      SELECT i."Invoice_No_", i."Item_Code_",
        array_agg(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)
                   ORDER BY COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS amounts,
        SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS sum_distinct,
        COUNT(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS cnt
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
      INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
      WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
      GROUP BY i."Invoice_No_", i."Item_Code_"
      HAVING COUNT(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) >= 3
    `);

    console.log('\n=== Items with 3+ distinct amounts (all) ===');
    let diffSum = 0;
    for (const row of r2.rows) {
      const key = row.Invoice_No_ + '|' + row.Item_Code_;
      const crdAmt = crdItems[key];
      if (crdAmt !== undefined) {
        // SUM(DISTINCT) sums ALL distinct values including old amounts
        // Correct value should be MAX of non-zero amounts (most recent)
        const nonZero = row.amounts.filter(a => parseFloat(a) !== 0);
        const maxAmt = nonZero.length > 0 ? Math.max(...nonZero.map(Number)) : 0;
        const diff = maxAmt - crdAmt;
        if (Math.abs(parseFloat(row.sum_distinct) - crdAmt) > 0.01) {
          diffSum += (parseFloat(row.sum_distinct) - crdAmt);
          console.log(`  ${row.Invoice_No_} | ${row.Item_Code_} | amounts: [${row.amounts}] | SUM(D): ${row.sum_distinct} | MAX: ${maxAmt} | CRD: ${crdAmt}`);
        }
      }
    }
    console.log('SUM(DISTINCT) total excess:', diffSum.toFixed(2));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
