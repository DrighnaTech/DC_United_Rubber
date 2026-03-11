'use strict';
const db = require('./db/connection');

// CRD domestic reference values (Cr) from sales_summary_dashboard_format.xlsx
const CRD = {
  '2024-04': { URIMH: { net: 7.30, gross: 8.66 }, URIMP: { net: 3.76, gross: 4.53 }, URIPB: { net: 0.46, gross: 0.54 }, URIPU: { net: 1.36, gross: 1.61 }, total: { net: 12.88, gross: 15.34 } },
  '2024-05': { URIMH: { net: 7.04, gross: 8.40 }, URIMP: { net: 3.06, gross: 3.70 }, URIPB: { net: 0.59, gross: 0.69 }, URIPU: { net: 1.28, gross: 1.51 }, total: { net: 11.97, gross: 14.31 } },
  '2024-06': { URIMH: { net: 7.35, gross: 8.72 }, URIMP: { net: 3.10, gross: 3.72 }, URIPB: { net: 0.75, gross: 0.89 }, URIPU: { net: 1.91, gross: 2.25 }, total: { net: 13.11, gross: 15.58 } },
  '2024-07': { URIMH: { net: 9.24, gross: 11.04 }, URIMP: { net: 3.12, gross: 3.78 }, URIPB: { net: 0.83, gross: 0.97 }, URIPU: { net: 1.32, gross: 1.56 }, total: { net: 14.50, gross: 17.35 } },
  '2024-08': { URIMH: { net: 9.14, gross: 10.87 }, URIMP: { net: 3.13, gross: 3.78 }, URIPB: { net: 0.86, gross: 1.01 }, URIPU: { net: 1.66, gross: 1.96 }, total: { net: 14.79, gross: 17.62 } },
  '2024-09': { URIMH: { net: 8.66, gross: 10.32 }, URIMP: { net: 3.08, gross: 3.70 }, URIPB: { net: 0.78, gross: 0.92 }, URIPU: { net: 1.21, gross: 1.43 }, total: { net: 13.74, gross: 16.37 } },
  '2024-10': { URIMH: { net: 10.87, gross: 12.92 }, URIMP: { net: 3.42, gross: 4.12 }, URIPB: { net: 0.57, gross: 0.67 }, URIPU: { net: 1.55, gross: 1.82 }, total: { net: 16.41, gross: 19.53 } },
  '2024-11': { URIMH: { net: 8.23, gross: 9.80 }, URIMP: { net: 2.98, gross: 3.59 }, URIPB: { net: 0.56, gross: 0.66 }, URIPU: { net: 1.50, gross: 1.77 }, total: { net: 13.27, gross: 15.82 } },
  '2024-12': { URIMH: { net: 8.89, gross: 10.53 }, URIMP: { net: 3.40, gross: 4.09 }, URIPB: { net: 0.35, gross: 0.41 }, URIPU: { net: 1.58, gross: 1.86 }, total: { net: 14.22, gross: 16.89 } },
  '2025-01': { URIMH: { net: 8.82, gross: 10.52 }, URIMP: { net: 5.34, gross: 6.45 }, URIPB: { net: 0.55, gross: 0.65 }, URIPU: { net: 1.41, gross: 1.67 }, total: { net: 16.12, gross: 19.29 } },
};

// CRD Sales Invoice Register values for Apr-Jul 2025 (Item Amount = Net, Item Net Amount = Gross)
const CRD2025 = {
  '2025-04': { URIMH: { net: 7.91, gross: 9.42 }, URIMP: { net: 4.50, gross: 5.43 }, URIPB: { net: 0.77, gross: 0.90 }, URIPU: { net: 1.59, gross: 1.88 }, total: { net: 14.77, gross: 17.64 } },
  '2025-05': { URIMH: { net: 8.50, gross: 10.11 }, URIMP: { net: 3.35, gross: 4.05 }, URIPB: { net: 0.70, gross: 0.82 }, URIPU: { net: 1.64, gross: 1.93 }, total: { net: 14.18, gross: 16.91 } },
  '2025-06': { URIMH: { net: 8.18, gross: 9.75 }, URIMP: { net: 3.39, gross: 4.10 }, URIPB: { net: 0.70, gross: 0.82 }, URIPU: { net: 0.98, gross: 1.16 }, total: { net: 13.25, gross: 15.83 } },
  '2025-07': { URIMH: { net: 10.11, gross: 12.02 }, URIMP: { net: 2.32, gross: 2.80 }, URIPB: { net: 1.02, gross: 1.21 }, URIPU: { net: 1.58, gross: 1.87 }, total: { net: 15.04, gross: 17.88 } },
};

(async () => {
  try {
    // Query system data - using the SAME dedup logic as the dashboard
    const result = await db.query(`
      WITH deduped AS (
        SELECT DISTINCT ON ("Invoice_No_") *
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0'
          AND "Invoice_Type_" != '0'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
        ORDER BY "Invoice_No_", row_id DESC
      )
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        COUNT(*) AS invoice_count,
        ROUND(SUM(COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)), 2) AS net_amount,
        ROUND(SUM(COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)), 2) AS gross_amount
      FROM deduped
      GROUP BY month_key, "Site_"
      ORDER BY month_key, site
    `);

    console.log('=== SYSTEM vs CRD COMPARISON (Domestic) ===\n');

    // Group by month
    const byMonth = {};
    for (const row of result.rows) {
      if (!byMonth[row.month_key]) byMonth[row.month_key] = {};
      byMonth[row.month_key][row.site] = {
        net: parseFloat(row.net_amount),
        gross: parseFloat(row.gross_amount),
        count: parseInt(row.invoice_count),
      };
    }

    const allCRD = { ...CRD, ...CRD2025 };

    for (const month of Object.keys(byMonth).sort()) {
      const sites = byMonth[month];
      const crd = allCRD[month];

      let totalNet = 0, totalGross = 0;
      console.log(`--- ${month} ---`);

      for (const site of Object.keys(sites).sort()) {
        const sys = sites[site];
        totalNet += sys.net;
        totalGross += sys.gross;

        const sysNetCr = (sys.net / 1e7).toFixed(2);
        const sysGrossCr = (sys.gross / 1e7).toFixed(2);

        const crdSite = crd?.[site];
        const diff = crdSite ? `  CRD: net=${crdSite.net} gross=${crdSite.gross}  DIFF: net=${(sysNetCr - crdSite.net).toFixed(2)} gross=${(sysGrossCr - crdSite.gross).toFixed(2)}` : '  (no CRD ref)';

        console.log(`  ${site}: net=${sysNetCr} Cr, gross=${sysGrossCr} Cr, inv=${sys.count}${diff}`);
      }

      const totNetCr = (totalNet / 1e7).toFixed(2);
      const totGrossCr = (totalGross / 1e7).toFixed(2);
      const crdTot = crd?.total;
      const totDiff = crdTot ? `  CRD: net=${crdTot.net} gross=${crdTot.gross}  DIFF: net=${(totNetCr - crdTot.net).toFixed(2)} gross=${(totGrossCr - crdTot.gross).toFixed(2)}` : '';
      console.log(`  TOTAL: net=${totNetCr} Cr, gross=${totGrossCr} Cr${totDiff}\n`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
