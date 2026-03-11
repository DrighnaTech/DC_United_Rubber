/**
 * Check system values vs CRD for specific filter combinations:
 * 1. Apr 2025, Invoice Type = "Sales (Commercial)" only
 * 2. Apr 2025, ALL types (Sales Commercial + Service + Scrap)
 * Also verify Apr-Nov 2024 data is not affected
 */
'use strict';
const db = require('./db/connection');
const XLSX = require('xlsx');

(async () => {
  try {
    // Parse CRD detail to compute per-type totals
    const wb = XLSX.readFile('CRD/Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx');
    const ws = wb.Sheets['Sales Invoice Register Report'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Col 18 = Invoice Type, Col 12 = Item Amount, Col 0 = Site, Col 2 = Date
    const crdByTypeMonth = {};
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
      const invType = row[18] || 'Unknown';
      const key = `${month}|${site}|${invType}`;
      if (!crdByTypeMonth[key]) crdByTypeMonth[key] = { amt: 0, net: 0, tax: 0, count: 0 };
      crdByTypeMonth[key].amt += (parseFloat(row[12]) || 0);
      crdByTypeMonth[key].net += (parseFloat(row[13]) || 0);
      crdByTypeMonth[key].tax += (parseFloat(row[14]) || 0);
      crdByTypeMonth[key].count++;
    }

    // Show CRD breakdown by type for Apr 2025
    console.log('=== CRD Apr 2025 by Invoice Type ===');
    for (const [key, val] of Object.entries(crdByTypeMonth).sort()) {
      if (key.startsWith('2025-04')) {
        console.log(`  ${key}: items=${val.count}, amt=${val.amt.toFixed(2)}, net=${val.net.toFixed(2)}, tax=${val.tax.toFixed(2)}`);
      }
    }

    // Check system header-level values for Apr 2025, Sales Commercial only
    console.log('\n=== System HEADER-level: Apr 2025, Sales (Commercial) only ===');
    const r1 = await db.query(`
      SELECT "Site_" AS site,
        COUNT(DISTINCT "Invoice_No_") AS invoices,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0))::NUMERIC AS sum_net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0))::NUMERIC AS sum_gross
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        AND "Invoice_Type_" = 'Sales ( Commercial )'
        AND "Invoice_Date_(Date)" >= '2025-04-01' AND "Invoice_Date_(Date)" <= '2025-04-30'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
      GROUP BY "Site_"
      ORDER BY site
    `);
    for (const row of r1.rows) {
      const crdKey = `2025-04|${row.site}|Sales ( Commercial )`;
      const crd = crdByTypeMonth[crdKey];
      console.log(`  ${row.site}: invoices=${row.invoices}, net=${row.sum_net}` +
        (crd ? ` | CRD items=${crd.count}, amt=${crd.amt.toFixed(2)}` : ''));
    }

    // Check system item-level for Apr 2025, Sales Commercial - using current SUM(DISTINCT) approach
    console.log('\n=== System ITEM-level SUM(DISTINCT): Apr 2025, Sales (Commercial) only ===');
    const r2 = await db.query(`
      WITH filtered_hdr AS (
        SELECT "Invoice_No_", MAX("Site_") AS site
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" = 'Sales ( Commercial )'
          AND "Invoice_Date_(Date)" >= '2025-04-01' AND "Invoice_Date_(Date)" <= '2025-04-30'
        GROUP BY "Invoice_No_"
      ),
      item_agg AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          SUM(DISTINCT COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)) AS item_amount
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_"
      )
      SELECT h.site,
        COUNT(*) AS items,
        ROUND(SUM(ia.item_amount), 2) AS total_item_amt
      FROM item_agg ia
      INNER JOIN filtered_hdr h ON ia."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site
      ORDER BY site
    `);
    for (const row of r2.rows) {
      const crdKey = `2025-04|${row.site}|Sales ( Commercial )`;
      const crd = crdByTypeMonth[crdKey];
      const diff = crd ? (parseFloat(row.total_item_amt) - crd.amt) : 0;
      console.log(`  ${row.site}: items=${row.items}, item_amt=${row.total_item_amt}` +
        (crd ? ` | CRD=${crd.amt.toFixed(2)} | diff=${diff.toFixed(2)}` : ''));
    }

    // Cross-join factor approach for Apr 2025, Sales Commercial
    console.log('\n=== System ITEM-level CROSS-JOIN FACTOR: Apr 2025, Sales (Commercial) only ===');
    const r3 = await db.query(`
      WITH filtered_hdr AS (
        SELECT "Invoice_No_", MAX("Site_") AS site
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" = 'Sales ( Commercial )'
          AND "Invoice_Date_(Date)" >= '2025-04-01' AND "Invoice_Date_(Date)" <= '2025-04-30'
        GROUP BY "Invoice_No_"
      ),
      item_combos AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) AS amt,
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0) AS qty,
          COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0) AS net,
          COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0) AS tax,
          COALESCE(NULLIF(i."Rate_",'')::NUMERIC, 0) AS rate,
          COUNT(*) AS combo_count
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
          AND COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0
        GROUP BY i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Rate_",'')::NUMERIC, 0)
      ),
      factors AS (
        SELECT "Invoice_No_", "Item_Code_", MIN(combo_count) AS factor
        FROM item_combos GROUP BY "Invoice_No_", "Item_Code_"
      )
      SELECT h.site,
        COUNT(*) AS combos,
        ROUND(SUM(ic.amt * (ic.combo_count / f.factor)), 2) AS total_item_amt,
        ROUND(SUM(ic.net * (ic.combo_count / f.factor)), 2) AS total_item_net,
        ROUND(SUM(ic.tax * (ic.combo_count / f.factor)), 2) AS total_item_tax
      FROM item_combos ic
      INNER JOIN factors f ON ic."Invoice_No_" = f."Invoice_No_" AND ic."Item_Code_" = f."Item_Code_"
      INNER JOIN filtered_hdr h ON ic."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site
      ORDER BY site
    `);
    for (const row of r3.rows) {
      const crdKey = `2025-04|${row.site}|Sales ( Commercial )`;
      const crd = crdByTypeMonth[crdKey];
      const diff = crd ? (parseFloat(row.total_item_amt) - crd.amt) : 0;
      console.log(`  ${row.site}: combos=${row.combos}, item_amt=${row.total_item_amt}` +
        (crd ? ` | CRD=${crd.amt.toFixed(2)} | diff=${diff.toFixed(2)}` : ''));
    }

    // Also show ALL types combined CRD for reference
    console.log('\n=== CRD Apr 2025 ALL types combined by site ===');
    const siteAmt = {};
    for (const [key, val] of Object.entries(crdByTypeMonth)) {
      if (key.startsWith('2025-04')) {
        const site = key.split('|')[1];
        if (!siteAmt[site]) siteAmt[site] = 0;
        siteAmt[site] += val.amt;
      }
    }
    for (const [site, amt] of Object.entries(siteAmt).sort()) {
      console.log(`  ${site}: ${amt.toFixed(2)}`);
    }

    // List all unique Invoice Types in CRD
    const invTypes = new Set();
    for (let i = 1; i < data.length; i++) {
      if (data[i][18]) invTypes.add(data[i][18]);
    }
    console.log('\nCRD Invoice Types:', [...invTypes]);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
