/**
 * Exact item-by-item comparison: DB vs CRD Excel
 * Find every item where our amount differs from CRD
 */
'use strict';
const db = require('./db/connection');
const XLSX = require('xlsx');

(async () => {
  try {
    const wb = XLSX.readFile('CRD/Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx');
    const ws = wb.Sheets['Sales Invoice Register Report'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Build CRD per-item map: key = site|month|invoice|itemcode → { amt, net, tax }
    const crdItems = {};
    const crdInvoicesBySiteMonth = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] || !row[1]) continue;
      const site = row[0];
      const dateVal = row[2];
      let month = '';
      if (typeof dateVal === 'number') {
        const d = new Date((dateVal - 25569) * 86400000);
        month = d.toISOString().slice(0, 7);
      }
      const inv = row[1];
      const itemCode = row[4];
      const key = `${inv}|${itemCode}`;
      const smKey = `${month}|${site}`;

      if (!crdItems[smKey]) crdItems[smKey] = {};
      // If same invoice+item appears multiple times in CRD, sum them
      if (!crdItems[smKey][key]) crdItems[smKey][key] = { amt: 0, net: 0, tax: 0 };
      crdItems[smKey][key].amt += (parseFloat(row[12]) || 0);
      crdItems[smKey][key].net += (parseFloat(row[13]) || 0);
      crdItems[smKey][key].tax += (parseFloat(row[14]) || 0);

      if (!crdInvoicesBySiteMonth[smKey]) crdInvoicesBySiteMonth[smKey] = new Set();
      crdInvoicesBySiteMonth[smKey].add(inv);
    }

    // Check each site+month with gaps
    const checks = [
      { month: '2025-04', site: 'URIMH', dateFrom: '2025-04-01', dateTo: '2025-04-30' },
      { month: '2025-06', site: 'URIMH', dateFrom: '2025-06-01', dateTo: '2025-06-30' },
      { month: '2025-06', site: 'URIMP', dateFrom: '2025-06-01', dateTo: '2025-06-30' },
    ];

    for (const chk of checks) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`=== ${chk.site} ${chk.month} ===`);

      const smKey = `${chk.month}|${chk.site}`;
      const crdMap = crdItems[smKey] || {};

      // Get DB items using SUM(DISTINCT) per (Invoice_No_, Item_Code_)
      const r = await db.query(`
        WITH filtered_hdr AS (
          SELECT "Invoice_No_"
          FROM "LandingStage2"."mf_sales_si_siheader_all"
          WHERE "Invoice_No_" NOT LIKE '%-R'
            AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
            AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
            AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
            AND "Site_" = $3
          GROUP BY "Invoice_No_"
        )
        SELECT i."Invoice_No_", i."Item_Code_",
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS item_amount,
          COUNT(*) AS row_count,
          COUNT(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS distinct_amts,
          array_agg(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)
                     ORDER BY COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS amounts
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_"
      `, [chk.dateFrom, chk.dateTo, chk.site]);

      // Build DB map
      const dbMap = {};
      for (const row of r.rows) {
        const key = `${row.Invoice_No_}|${row.Item_Code_}`;
        dbMap[key] = {
          amt: parseFloat(row.item_amount),
          rowCount: parseInt(row.row_count),
          distinctAmts: parseInt(row.distinct_amts),
          amounts: row.amounts
        };
      }

      // Compare
      let totalDiff = 0;
      const diffs = [];

      // Items in CRD
      for (const [key, crd] of Object.entries(crdMap)) {
        const dbItem = dbMap[key];
        if (!dbItem) {
          diffs.push({ key, type: 'MISSING_IN_DB', crdAmt: crd.amt, dbAmt: 0, diff: -crd.amt });
          totalDiff -= crd.amt;
        } else {
          const diff = dbItem.amt - crd.amt;
          if (Math.abs(diff) > 0.01) {
            diffs.push({ key, type: 'AMOUNT_DIFF', crdAmt: crd.amt, dbAmt: dbItem.amt, diff,
                          distinctAmts: dbItem.distinctAmts, amounts: dbItem.amounts });
            totalDiff += diff;
          }
        }
      }

      // Items in DB but not in CRD
      for (const [key, dbItem] of Object.entries(dbMap)) {
        if (!crdMap[key]) {
          diffs.push({ key, type: 'EXTRA_IN_DB', crdAmt: 0, dbAmt: dbItem.amt, diff: dbItem.amt });
          totalDiff += dbItem.amt;
        }
      }

      diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

      console.log(`CRD items: ${Object.keys(crdMap).length} | DB items: ${Object.keys(dbMap).length}`);
      console.log(`Items with differences: ${diffs.length} | Total diff: ${totalDiff.toFixed(2)}`);

      // Breakdown by type
      const missing = diffs.filter(d => d.type === 'MISSING_IN_DB');
      const extra = diffs.filter(d => d.type === 'EXTRA_IN_DB');
      const amtDiff = diffs.filter(d => d.type === 'AMOUNT_DIFF');

      console.log(`  MISSING_IN_DB: ${missing.length} (total: ${missing.reduce((s, d) => s + d.diff, 0).toFixed(2)})`);
      console.log(`  EXTRA_IN_DB: ${extra.length} (total: ${extra.reduce((s, d) => s + d.diff, 0).toFixed(2)})`);
      console.log(`  AMOUNT_DIFF: ${amtDiff.length} (total: ${amtDiff.reduce((s, d) => s + d.diff, 0).toFixed(2)})`);

      if (amtDiff.length > 0) {
        console.log('\n  Top AMOUNT_DIFF items:');
        amtDiff.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        amtDiff.slice(0, 20).forEach(d => {
          console.log(`    ${d.key} | DB: ${d.dbAmt.toFixed(2)} | CRD: ${d.crdAmt.toFixed(2)} | Diff: ${d.diff.toFixed(2)} | distinct_amts: ${d.distinctAmts} | amounts: [${d.amounts}]`);
        });
      }
      if (missing.length > 0) {
        console.log('\n  MISSING_IN_DB items:');
        missing.slice(0, 10).forEach(d => {
          console.log(`    ${d.key} | CRD amt: ${d.crdAmt.toFixed(2)}`);
        });
      }
      if (extra.length > 0) {
        console.log('\n  EXTRA_IN_DB items:');
        extra.slice(0, 10).forEach(d => {
          console.log(`    ${d.key} | DB amt: ${d.dbAmt.toFixed(2)}`);
        });
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
