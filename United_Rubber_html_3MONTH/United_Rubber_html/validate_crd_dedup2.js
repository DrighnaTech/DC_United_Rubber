/**
 * Cross-join factor dedup approach:
 * 1. Filter out zero-amount rows
 * 2. GROUP BY (Invoice_No_, Item_Code_, Item_Amount, Sales_Qty_) → count each combo
 * 3. For each (Invoice_No_, Item_Code_), find MIN(count) = cross-join factor
 * 4. genuine_lines = count / factor
 * 5. SUM(genuine_lines * Item_Amount) = correct total
 */
'use strict';
const db = require('./db/connection');

(async () => {
  try {
    const crd = {
      '2025-04': { URIMH: 79073333.36, URIMP: 45030281.73, URIPB: 7663651.39, URIPU: 15903648.97 },
      '2025-05': { URIMH: 85025253.28, URIMP: 33501346.19, URIPB: 6956986.94, URIPU: 16350975.73 },
      '2025-06': { URIMH: 81781432.23, URIMP: 33924059.39, URIPB: 6954093.21, URIPU: 9846982.97 },
    };

    const query = `
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
      -- Step 1: Count occurrences of each (inv, item, amt, qty) combo (non-zero only)
      item_combos AS (
        SELECT i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) AS amt,
          COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0) AS net,
          COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0) AS tax,
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0) AS qty,
          COUNT(*) AS combo_count
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
          AND COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0
        GROUP BY i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0),
          COALESCE(NULLIF(i."Sales_Qty_",'')::NUMERIC, 0)
      ),
      -- Step 2: Find cross-join factor per (inv, item) = MIN(combo_count)
      factors AS (
        SELECT "Invoice_No_", "Item_Code_",
          MIN(combo_count) AS factor
        FROM item_combos
        GROUP BY "Invoice_No_", "Item_Code_"
      ),
      -- Step 3: Calculate genuine lines and amounts
      deduped AS (
        SELECT ic."Invoice_No_", ic."Item_Code_",
          ic.amt, ic.net, ic.tax,
          ic.combo_count / f.factor AS genuine_lines
        FROM item_combos ic
        INNER JOIN factors f ON ic."Invoice_No_" = f."Invoice_No_" AND ic."Item_Code_" = f."Item_Code_"
      )
      SELECT h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM') AS month,
        COUNT(*) AS combos,
        ROUND(SUM(d.amt * d.genuine_lines), 2) AS total_amt,
        ROUND(SUM(d.net * d.genuine_lines), 2) AS total_net,
        ROUND(SUM(d.tax * d.genuine_lines), 2) AS total_tax
      FROM deduped d
      INNER JOIN filtered_hdr h ON d."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM')
      ORDER BY month, site
    `;

    const result = await db.query(query);

    console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  CROSS-JOIN FACTOR DEDUP: Item Amount validation vs CRD                        ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Month   | Site  | Combos | Sys ItemAmt      | CRD ItemAmt      | Diff        | Status ║');

    let exactCount = 0, totalCells = 0;
    for (const row of result.rows) {
      const c = crd[row.month]?.[row.site];
      if (!c) continue;
      totalCells++;
      const diff = parseFloat(row.total_amt) - c;
      const status = Math.abs(diff) < 1 ? 'EXACT' : 'DIFF';
      if (Math.abs(diff) < 1) exactCount++;

      console.log('║', row.month, '|', row.site.padEnd(6), '|', String(row.combos).padEnd(7), '|',
        String(row.total_amt).padStart(17), '|', c.toFixed(2).padStart(17), '|',
        diff.toFixed(2).padStart(12), '|', status);
    }

    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
    console.log(`║  EXACT: ${exactCount} / ${totalCells}                                                                   ║`);
    console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');

    // Also validate Net Amount and Tax
    console.log('\n=== Net Amount & Tax validation ===');
    const crdNet = {
      '2025-04': { URIMH: 94235578.31, URIMP: 54338631.95, URIPB: 9043106.53, URIPU: 18772341.51 },
      '2025-05': { URIMH: 101128355.25, URIMP: 40493426.99, URIPB: 8209242.62, URIPU: 19303709.25 },
      '2025-06': { URIMH: 97477605.01, URIMP: 41021601.79, URIPB: 8205828.15, URIPU: 11619437.47 },
    };
    const crdTax = {
      '2025-04': { URIMH: 15162244.95, URIMP: 9308350.22, URIPB: 1379455.14, URIPU: 2868692.54 },
      '2025-05': { URIMH: 16103101.97, URIMP: 6992080.80, URIPB: 1252255.68, URIPU: 2952733.52 },
      '2025-06': { URIMH: 15696172.78, URIMP: 7097542.40, URIPB: 1251734.94, URIPU: 1772454.50 },
    };

    for (const row of result.rows) {
      const cn = crdNet[row.month]?.[row.site];
      const ct = crdTax[row.month]?.[row.site];
      if (!cn || !ct) continue;
      const netDiff = parseFloat(row.total_net) - cn;
      const taxDiff = parseFloat(row.total_tax) - ct;
      const netStatus = Math.abs(netDiff) < 1 ? 'OK' : 'DIFF';
      const taxStatus = Math.abs(taxDiff) < 1 ? 'OK' : 'DIFF';
      if (netStatus !== 'OK' || taxStatus !== 'OK') {
        console.log(row.month, '|', row.site, '| Net diff:', netDiff.toFixed(2), netStatus,
          '| Tax diff:', taxDiff.toFixed(2), taxStatus);
      }
    }
    console.log('(Only showing non-OK entries)');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
