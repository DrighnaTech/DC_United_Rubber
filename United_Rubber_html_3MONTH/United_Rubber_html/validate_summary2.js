'use strict';
const db = require('./db/connection');

// CRD domestic reference values (Cr) - Sales Summary Dashboard
const CRD = {
  '2024-04': { URIMH: 7.30, URIMP: 3.76, URIPB: 0.46, URIPU: 1.36, total: 12.88 },
  '2024-05': { URIMH: 7.04, URIMP: 3.06, URIPB: 0.59, URIPU: 1.28, total: 11.97 },
  '2024-06': { URIMH: 7.35, URIMP: 3.10, URIPB: 0.75, URIPU: 1.91, total: 13.11 },
  '2024-07': { URIMH: 9.24, URIMP: 3.12, URIPB: 0.83, URIPU: 1.32, total: 14.50 },
  '2024-08': { URIMH: 9.14, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66, total: 14.79 },
  '2024-09': { URIMH: 8.66, URIMP: 3.08, URIPB: 0.78, URIPU: 1.21, total: 13.74 },
  '2024-10': { URIMH: 10.87, URIMP: 3.42, URIPB: 0.57, URIPU: 1.55, total: 16.41 },
  '2024-11': { URIMH: 8.23, URIMP: 2.98, URIPB: 0.56, URIPU: 1.50, total: 13.27 },
  '2024-12': { URIMH: 8.89, URIMP: 3.40, URIPB: 0.35, URIPU: 1.58, total: 14.22 },
  '2025-01': { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41, total: 16.12 },
};

(async () => {
  try {
    // Test with "Exported To GL" only - hypothesis: CRD used this status filter
    console.log('=== Test: Status = Exported To GL ONLY ===\n');

    const r1 = await db.query(`
      WITH deduped AS (
        SELECT DISTINCT ON ("Invoice_No_") *
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
        ORDER BY "Invoice_No_", row_id DESC
      )
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        COUNT(*) AS cnt,
        ROUND(SUM(COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)), 2) AS net
      FROM deduped
      WHERE TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-01'
      GROUP BY month_key, site
      ORDER BY month_key, site
    `);

    const byMonth = {};
    for (const row of r1.rows) {
      if (!byMonth[row.month_key]) byMonth[row.month_key] = {};
      byMonth[row.month_key][row.site] = { net: parseFloat(row.net), cnt: parseInt(row.cnt) };
    }

    let matchCount = 0, totalChecks = 0;
    for (const month of Object.keys(byMonth).sort()) {
      const sites = byMonth[month];
      const crd = CRD[month];
      if (!crd) continue;
      console.log(`--- ${month} ---`);
      let total = 0;
      for (const site of Object.keys(sites).sort()) {
        const sys = sites[site];
        total += sys.net;
        const sysCr = (sys.net / 1e7).toFixed(2);
        const crdVal = crd[site];
        if (crdVal !== undefined) {
          const diff = (sysCr - crdVal).toFixed(2);
          const ok = Math.abs(diff) <= 0.02;
          if (ok) matchCount++;
          totalChecks++;
          console.log(`  ${site}: sys=${sysCr} Cr, CRD=${crdVal} Cr, diff=${diff} ${ok ? '✓' : '✗'}`);
        }
      }
      const totCr = (total / 1e7).toFixed(2);
      const totDiff = (totCr - crd.total).toFixed(2);
      const totOk = Math.abs(totDiff) <= 0.02;
      if (totOk) matchCount++;
      totalChecks++;
      console.log(`  TOTAL: sys=${totCr}, CRD=${crd.total}, diff=${totDiff} ${totOk ? '✓' : '✗'}\n`);
    }
    console.log(`\nMATCH RATE: ${matchCount}/${totalChecks} (${(matchCount/totalChecks*100).toFixed(0)}%)`);

    // Also check: what Invoice Types exist per site for URIMH
    console.log('\n=== Invoice Types for URIMH (all statuses, Apr 2024) ===');
    const r2 = await db.query(`
      SELECT "Invoice_Type_", "Status_", COUNT(DISTINCT "Invoice_No_") AS inv_cnt,
        ROUND(SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)), 2) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R' AND "Site_" = 'URIMH'
        AND "Invoice_Date_(Date)" >= '2024-04-01' AND "Invoice_Date_(Date)" <= '2024-04-30'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_Type_", "Status_"
      ORDER BY "Invoice_Type_", "Status_"
    `);
    for (const row of r2.rows) {
      console.log(`  Type="${row.invoice_type_}", Status="${row.status_}", inv=${row.inv_cnt}, net=${(row.net/1e7).toFixed(2)} Cr`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
