'use strict';
const db = require('./db/connection');
(async () => {
  // Jul 2025 CRD reference (Item Amount from Sheet1)
  const crd = {
    URIMH: { amt: 101111886.95, net: 120156637.94, tax: 19044751.00 },
    URIMP: { amt: 23230513.26, net: 27954063.83, tax: 4723550.57 },
    URIPB: { amt: 10212076.84, net: 12050248.86, tax: 1838172.02 },
    URIPU: { amt: 15814432.51, net: 18661027.05, tax: 2846594.54 },
  };

  // Check header-level gross amounts for Jul (up to Jul 16 per user)
  const r1 = await db.query(`
    WITH deduped AS (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS gross
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
        AND "Invoice_Date_(Date)" >= '2025-07-01' AND "Invoice_Date_(Date)" <= '2025-07-16'
      ORDER BY "Invoice_No_", row_id DESC
    )
    SELECT "Site_" AS site, COUNT(*) AS invoices,
      ROUND(SUM(gross), 2) AS total_gross
    FROM deduped
    GROUP BY "Site_"
    ORDER BY site
  `);

  console.log('=== Jul 2025 HEADER-level data (up to Jul 16) ===');
  console.log('Site  | Invoices | Header Gross | CRD Net Amount');
  let totalGross = 0;
  for (const row of r1.rows) {
    const c = crd[row.site];
    totalGross += parseFloat(row.total_gross);
    console.log(row.site.padEnd(6), '|', String(row.invoices).padEnd(9), '|',
      String(row.total_gross).padStart(15), '|', c ? c.net.toFixed(2).padStart(15) : 'N/A');
  }

  // Check item table status for Jul
  const r2 = await db.query(`
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER(WHERE "Item_Code_" IS NOT NULL AND "Item_Code_" != '') AS with_code,
      COUNT(*) FILTER(WHERE COALESCE(NULLIF("Item_Amount",'')::NUMERIC, 0) != 0) AS with_amount
    FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"
    WHERE "Invoice_No_" IN (
      SELECT DISTINCT "Invoice_No_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Date_(Date)" >= '2025-07-01' AND "Invoice_Date_(Date)" <= '2025-07-16'
    )
  `);
  console.log('\nJul item table:', r2.rows[0]);

  // Check cross-join factor dedup for Jul (will likely have 0 results)
  const r3 = await db.query(`
    WITH filtered_hdr AS (
      SELECT "Invoice_No_", MAX("Site_") AS site
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
        AND "Invoice_Date_(Date)" >= '2025-07-01' AND "Invoice_Date_(Date)" <= '2025-07-16'
      GROUP BY "Invoice_No_"
    ),
    item_combos AS (
      SELECT i."Invoice_No_", i."Item_Code_",
        COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) AS amt,
        COUNT(*) AS combo_count
      FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all" i
      INNER JOIN filtered_hdr h ON i."Invoice_No_" = h."Invoice_No_"
      WHERE i."Item_Code_" IS NOT NULL AND i."Item_Code_" != ''
        AND COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0) != 0
      GROUP BY i."Invoice_No_", i."Item_Code_",
        COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0)
    )
    SELECT COUNT(*) AS item_combos FROM item_combos
  `);
  console.log('Jul item combos with non-zero amounts:', r3.rows[0]?.item_combos);

  // Compare header gross with CRD Net Amount
  // CRD provides Item_Amount, Item_NetAmount, Item_Total_Tax
  // Header provides Amount_ (which is typically Net Amount / Gross)
  // Let's check what Amount_ represents by comparing with Apr data
  console.log('\n=== Apr 2025: Compare header Amount_ with item-level sums ===');
  const r4 = await db.query(`
    WITH deduped_hdr AS (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS hdr_amount,
        COALESCE(NULLIF("NetAmount_",'')::NUMERIC, 0) AS hdr_net,
        COALESCE(NULLIF("Total_Tax_",'')::NUMERIC, 0) AS hdr_tax
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        AND "Invoice_Type_" IN ('Sales ( Commercial )', 'Service', 'Scrap')
        AND "Invoice_Date_(Date)" >= '2025-04-01' AND "Invoice_Date_(Date)" <= '2025-04-30'
      ORDER BY "Invoice_No_", row_id DESC
    )
    SELECT "Site_" AS site,
      ROUND(SUM(hdr_amount), 2) AS sum_hdr_amount,
      ROUND(SUM(hdr_net), 2) AS sum_hdr_net,
      ROUND(SUM(hdr_tax), 2) AS sum_hdr_tax
    FROM deduped_hdr
    GROUP BY "Site_"
    ORDER BY site
  `);
  const aprCrd = { URIMH: { amt: 79073333.36, net: 94235578.31, tax: 15162244.95 },
                    URIMP: { amt: 45030281.73, net: 54338631.95, tax: 9308350.22 },
                    URIPB: { amt: 7663651.39, net: 9043106.53, tax: 1379455.14 },
                    URIPU: { amt: 15903648.97, net: 18772341.51, tax: 2868692.54 } };
  for (const row of r4.rows) {
    const c = aprCrd[row.site];
    if (!c) continue;
    console.log(row.site, '| Hdr Amount:', row.sum_hdr_amount,
      '| Hdr Net:', row.sum_hdr_net,
      '| CRD ItemAmt:', c.amt.toFixed(2),
      '| CRD ItemNet:', c.net.toFixed(2));
  }

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
