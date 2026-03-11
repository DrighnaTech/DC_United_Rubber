/**
 * Validate item-level data v3 — investigate remaining gaps
 * 1. URIMP Jun: +27,284 (2 extra invoices vs CRD)
 * 2. URIMH Apr: -20,562
 * 3. Jul 2025: missing item data
 */
'use strict';
const db = require('./db/connection');
const XLSX = require('xlsx');

(async () => {
  try {
    // Parse CRD detail to get exact invoices per site per month
    const wb = XLSX.readFile('CRD/Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx');
    const ws = wb.Sheets['Sales Invoice Register Report'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Build CRD invoice sets by site+month
    const crdInvoices = {};
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
      const key = month + '|' + site;
      if (!crdInvoices[key]) crdInvoices[key] = new Set();
      crdInvoices[key].add(row[1]);
    }

    // Get our invoice set for URIMP Jun
    const r1 = await db.query(`
      SELECT DISTINCT "Invoice_No_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
        AND "Invoice_Date_(Date)" >= '2025-06-01' AND "Invoice_Date_(Date)" <= '2025-06-30'
        AND "Site_" = 'URIMP'
    `);
    const ourUrimp = new Set(r1.rows.map(r => r.Invoice_No_));
    const crdUrimp = crdInvoices['2025-06|URIMP'] || new Set();

    const inOurNotCrd = [...ourUrimp].filter(inv => !crdUrimp.has(inv));
    const inCrdNotOur = [...crdUrimp].filter(inv => !ourUrimp.has(inv));
    console.log('URIMP Jun: Our invoices:', ourUrimp.size, '| CRD invoices:', crdUrimp.size);
    console.log('In our system but NOT in CRD:', inOurNotCrd.length, inOurNotCrd.slice(0, 10));
    console.log('In CRD but NOT in our system:', inCrdNotOur.length, inCrdNotOur.slice(0, 10));

    // Check the extra invoices amounts
    if (inOurNotCrd.length > 0) {
      const placeholders = inOurNotCrd.map((_, i) => `$${i+1}`).join(',');
      const r2 = await db.query(`
        SELECT i."Invoice_No_",
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS total_amt
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        WHERE i."Invoice_No_" = ANY($1)
          AND i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_"
      `, [inOurNotCrd]);
      console.log('\nExtra invoices amounts:');
      r2.rows.forEach(r => console.log('  ', r.Invoice_No_, ':', r.total_amt));
    }

    // URIMH Apr: check which invoices differ
    const r3 = await db.query(`
      SELECT DISTINCT "Invoice_No_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
        AND "Invoice_Date_(Date)" >= '2025-04-01' AND "Invoice_Date_(Date)" <= '2025-04-30'
        AND "Site_" = 'URIMH'
    `);
    const ourUrimhApr = new Set(r3.rows.map(r => r.Invoice_No_));
    const crdUrimhApr = crdInvoices['2025-04|URIMH'] || new Set();

    const urimhExtra = [...ourUrimhApr].filter(inv => !crdUrimhApr.has(inv));
    const urimhMissing = [...crdUrimhApr].filter(inv => !ourUrimhApr.has(inv));
    console.log('\nURIMH Apr: Our invoices:', ourUrimhApr.size, '| CRD invoices:', crdUrimhApr.size);
    console.log('In our system but NOT in CRD:', urimhExtra.length, urimhExtra.slice(0, 10));
    console.log('In CRD but NOT in our system:', urimhMissing.length, urimhMissing.slice(0, 10));

    // Check missing CRD invoices if any
    if (urimhMissing.length > 0) {
      // Check if they exist in header with different filters
      const r4 = await db.query(`
        SELECT "Invoice_No_", "Status_", "Invoice_Type_", "Invoice_Date_(Date)", "Site_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" = ANY($1)
        ORDER BY "Invoice_No_", row_id DESC
        LIMIT 20
      `, [urimhMissing.slice(0, 10)]);
      console.log('\nMissing URIMH invoices in header:');
      r4.rows.forEach(r => console.log('  ', r.Invoice_No_, '| Status:', r.Status_, '| Type:', r.Invoice_Type_, '| Date:', r['Invoice_Date_(Date)'], '| Site:', r.Site_));
    }

    // Jul 2025: check what data exists
    const r5 = await db.query(`
      SELECT COUNT(*) AS total_rows,
        COUNT(*) FILTER(WHERE "Item_Code_" IS NOT NULL AND "Item_Code_" != '') AS with_code,
        COUNT(*) FILTER(WHERE "Item_Amount" IS NOT NULL AND "Item_Amount" != '' AND "Item_Amount" != '0' AND "Item_Amount" != '0.0') AS with_amount
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
      WHERE "Invoice_No_" IN (
        SELECT DISTINCT "Invoice_No_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Date_(Date)" >= '2025-07-01' AND "Invoice_Date_(Date)" <= '2025-07-16'
      )
    `);
    console.log('\nJul 2025 item table status:', r5.rows[0]);

    // Check all src_months for Jul invoices in item table
    const r6 = await db.query(`
      SELECT i.src_year, i.src_month, i.src_part,
        COUNT(*) AS rows,
        COUNT(*) FILTER(WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != '') AS with_code,
        COUNT(*) FILTER(WHERE COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC,0) != 0) AS with_amount
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
      WHERE i."Invoice_No_" IN (
        SELECT DISTINCT "Invoice_No_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Date_(Date)" >= '2025-07-01' AND "Invoice_Date_(Date)" <= '2025-07-16'
      )
      GROUP BY i.src_year, i.src_month, i.src_part
      ORDER BY MIN(i.row_id)
    `);
    console.log('\nJul invoices in item table by partition:');
    r6.rows.forEach(r => console.log('  ', r.src_year, r.src_month, 'part', r.src_part,
      '| rows:', r.rows, '| with_code:', r.with_code, '| with_amount:', r.with_amount));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
