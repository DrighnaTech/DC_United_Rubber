/**
 * Validate item-level v4 — find URIMH Apr item differences
 * and check if SUM(DISTINCT) is the cause
 */
'use strict';
const db = require('./db/connection');
const XLSX = require('xlsx');

(async () => {
  try {
    // Parse CRD: build per-invoice Item_Amount totals for URIMH Apr
    const wb = XLSX.readFile('CRD/Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx');
    const ws = wb.Sheets['Sales Invoice Register Report'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    const crdInvAmts = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] !== 'URIMH') continue;
      const dateVal = row[2];
      if (typeof dateVal !== 'number') continue;
      const d = new Date((dateVal - 25569) * 86400000);
      if (d.getMonth() !== 3 || d.getFullYear() !== 2025) continue; // April = month 3
      const inv = row[1];
      if (!crdInvAmts[inv]) crdInvAmts[inv] = 0;
      crdInvAmts[inv] += (parseFloat(row[12]) || 0); // Item Amount
    }

    // Get our per-invoice totals
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
      SELECT i."Invoice_No_",
        SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS total_amt
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
      INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
      WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
      GROUP BY i."Invoice_No_"
    `);

    const ourInvAmts = {};
    r1.rows.forEach(r => { ourInvAmts[r.Invoice_No_] = parseFloat(r.total_amt); });

    // Find invoices with differences
    let totalDiff = 0;
    const diffs = [];
    for (const [inv, crdAmt] of Object.entries(crdInvAmts)) {
      const ourAmt = ourInvAmts[inv] || 0;
      const diff = ourAmt - crdAmt;
      if (Math.abs(diff) > 0.01) {
        diffs.push({ inv, ourAmt, crdAmt, diff });
        totalDiff += diff;
      }
    }

    diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    console.log('=== URIMH Apr: Invoice-level differences ===');
    console.log('Invoices with differences:', diffs.length, '/', Object.keys(crdInvAmts).length);
    console.log('Total diff:', totalDiff.toFixed(2));
    console.log('\nTop differences:');
    diffs.slice(0, 20).forEach(d => {
      console.log(`  ${d.inv}: Our=${d.ourAmt.toFixed(2)}, CRD=${d.crdAmt.toFixed(2)}, Diff=${d.diff.toFixed(2)}`);
    });

    // For the top differing invoice, compare item by item
    if (diffs.length > 0) {
      const topInv = diffs[0].inv;
      console.log('\n--- Detail for', topInv, '---');

      // CRD items
      console.log('CRD items:');
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === topInv) {
          console.log('  Item:', data[i][4], '| Amt:', data[i][12], '| Qty:', data[i][9]);
        }
      }

      // Our items
      const r2 = await db.query(`
        SELECT "Item_Code_",
          array_agg(DISTINCT COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0) ORDER BY COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0)) AS amounts,
          SUM(DISTINCT COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0)) AS sum_distinct
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
        WHERE "Invoice_No_" = '${topInv}'
          AND "Item_Code_" IS NOT NULL AND "Item_Code_" != ''
        GROUP BY "Item_Code_"
        ORDER BY "Item_Code_"
      `);
      console.log('Our items (SUM DISTINCT per item_code):');
      r2.rows.forEach(r => {
        console.log('  Item:', r.Item_Code_, '| amounts:', r.amounts.join(', '), '| SUM(DISTINCT):', r.sum_distinct);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
