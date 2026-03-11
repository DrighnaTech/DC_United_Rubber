/**
 * Final validation — hybrid approach:
 * For each (Invoice_No_, Item_Code_):
 *   Pick the LATEST non-zero Item_Amount (highest row_id where amount != 0)
 *   This matches the CRD's "current snapshot" behavior
 */
'use strict';
const db = require('./db/connection');

(async () => {
  try {
    const crd = {
      '2025-04': { URIMH: { amt: 79073333.36, net: 94235578.31, tax: 15162244.95 },
                    URIMP: { amt: 45030281.73, net: 54338631.95, tax: 9308350.22 },
                    URIPB: { amt: 7663651.39, net: 9043106.53, tax: 1379455.14 },
                    URIPU: { amt: 15903648.97, net: 18772341.51, tax: 2868692.54 } },
      '2025-05': { URIMH: { amt: 85025253.28, net: 101128355.25, tax: 16103101.97 },
                    URIMP: { amt: 33501346.19, net: 40493426.99, tax: 6992080.80 },
                    URIPB: { amt: 6956986.94, net: 8209242.62, tax: 1252255.68 },
                    URIPU: { amt: 16350975.73, net: 19303709.25, tax: 2952733.52 } },
      '2025-06': { URIMH: { amt: 81781432.23, net: 97477605.01, tax: 15696172.78 },
                    URIMP: { amt: 33924059.39, net: 41021601.79, tax: 7097542.40 },
                    URIPB: { amt: 6954093.21, net: 8205828.15, tax: 1251734.94 },
                    URIPU: { amt: 9846982.97, net: 11619437.47, tax: 1772454.50 } },
      '2025-07': { URIMH: { amt: 101111886.95, net: 120156637.94, tax: 19044751.00 },
                    URIMP: { amt: 23230513.26, net: 27954063.83, tax: 4723550.57 },
                    URIPB: { amt: 10212076.84, net: 12050248.86, tax: 1838172.02 },
                    URIPU: { amt: 15814432.51, net: 18661027.05, tax: 2846594.54 } },
    };

    // Approach: DISTINCT ON (Invoice_No_, Item_Code_) preferring latest non-zero amount
    const query = `
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
      deduped_items AS (
        SELECT DISTINCT ON (i."Invoice_No_", i."Item_Code_")
          i."Invoice_No_", i."Item_Code_",
          COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) AS item_amount,
          COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0) AS item_net_amount,
          COALESCE(NULLIF(i."Item_Total_Tax",'')::NUMERIC, 0) AS item_total_tax
        FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
        INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        ORDER BY i."Invoice_No_", i."Item_Code_",
          CASE WHEN COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0 THEN 0 ELSE 1 END,
          i.row_id DESC
      )
      SELECT
        h.site,
        TO_CHAR(h.inv_date::DATE, 'YYYY-MM') AS month,
        COUNT(*) AS item_rows,
        COUNT(DISTINCT di."Invoice_No_") AS invoices,
        ROUND(SUM(di.item_amount), 2) AS item_amt,
        ROUND(SUM(di.item_net_amount), 2) AS item_net,
        ROUND(SUM(di.item_total_tax), 2) AS item_tax
      FROM deduped_items di
      INNER JOIN filtered_hdr h ON di."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM')
      ORDER BY month, site
    `;

    const result = await db.query(query);

    console.log('\n╔══════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  ITEM-LEVEL VALIDATION: DISTINCT ON (latest non-zero) vs CRD                   ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Month   | Site  | Items | Invoices | Item Amount (Sys) | Item Amount (CRD) | Diff       ║');

    let totalMatch = 0, totalClose = 0, totalCells = 0;
    const monthTotals = {};
    for (const row of result.rows) {
      const c = crd[row.month]?.[row.site];
      if (!c) continue;
      totalCells++;
      const diff = parseFloat(row.item_amt) - c.amt;
      const pct = ((diff / c.amt) * 100);
      let status;
      if (Math.abs(diff) < 1) { status = 'EXACT'; totalMatch++; }
      else if (Math.abs(pct) < 0.1) { status = 'CLOSE'; totalClose++; }
      else status = 'DIFF';

      if (!monthTotals[row.month]) monthTotals[row.month] = { sys: 0, crd: 0 };
      monthTotals[row.month].sys += parseFloat(row.item_amt);
      monthTotals[row.month].crd += c.amt;

      console.log('║', row.month, '|', row.site.padEnd(6), '|',
        String(row.item_rows).padEnd(6), '|', String(row.invoices).padEnd(9), '|',
        String(row.item_amt).padStart(18), '|', c.amt.toFixed(2).padStart(18), '|',
        diff.toFixed(2).padStart(11), '|', status);
    }

    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  Monthly Totals                                                                 ║');
    for (const [m, v] of Object.entries(monthTotals).sort()) {
      const diff = v.sys - v.crd;
      console.log('║', m, '| ALL   |       |          |',
        v.sys.toFixed(2).padStart(18), '|', v.crd.toFixed(2).padStart(18), '|',
        diff.toFixed(2).padStart(11), '|');
    }

    console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  EXACT:', totalMatch, '| CLOSE (<0.1%):', totalClose, '| Total:', totalCells, '                              ║');
    if (!result.rows.find(r => r.month === '2025-07')) {
      console.log('║  ⚠ Jul 2025: Item data NOT YET LOADED (all NULL in item table)                  ║');
    }
    console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');

    // Now try the SUM(DISTINCT) approach for comparison
    const query2 = `
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
        WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        GROUP BY i."Invoice_No_", i."Item_Code_"
      )
      SELECT h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM') AS month,
        COUNT(*) AS item_rows,
        ROUND(SUM(ia.item_amount), 2) AS item_amt
      FROM item_agg ia
      INNER JOIN filtered_hdr h ON ia."Invoice_No_" = h."Invoice_No_"
      GROUP BY h.site, TO_CHAR(h.inv_date::DATE, 'YYYY-MM')
      ORDER BY month, site
    `;
    const r2 = await db.query(query2);

    console.log('\n=== Comparison: SUM(DISTINCT) per item ===');
    for (const row of r2.rows) {
      const c = crd[row.month]?.[row.site];
      if (c) {
        const diff = parseFloat(row.item_amt) - c.amt;
        console.log(row.month, '|', row.site.padEnd(6), '|', String(row.item_amt).padEnd(17), '| CRD:', c.amt.toFixed(2).padEnd(17), '| Diff:', diff.toFixed(2));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
