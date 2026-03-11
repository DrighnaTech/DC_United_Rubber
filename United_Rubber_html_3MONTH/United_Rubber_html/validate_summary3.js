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
    // Method 1: CRD's exact method - SUM(DISTINCT Amount_) grouped by Invoice_No_
    console.log('=== Method 1: CRD Reference Method (SUM DISTINCT Amount per Invoice) ===\n');
    console.log('Status filter: all valid statuses (Open, Approved, Released, Exported To GL)\n');

    const r1 = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        SUM(invoice_gross) / 10000000 AS net_cr
      FROM (
        SELECT "Invoice_No_", "Site_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-01'
        GROUP BY "Invoice_No_", "Site_"
      ) sub
      GROUP BY month_key, site
      ORDER BY month_key, site
    `);

    console.log('Method 1 Results (all statuses):');
    const byMonth1 = {};
    for (const row of r1.rows) {
      if (!byMonth1[row.month_key]) byMonth1[row.month_key] = {};
      byMonth1[row.month_key][row.site] = parseFloat(row.net_cr).toFixed(2);
    }
    let m1Match = 0, m1Total = 0;
    for (const month of Object.keys(byMonth1).sort()) {
      const crd = CRD[month];
      if (!crd) continue;
      console.log(`--- ${month} ---`);
      let total = 0;
      for (const site of Object.keys(byMonth1[month]).sort()) {
        const sys = parseFloat(byMonth1[month][site]);
        total += sys;
        const crdVal = crd[site];
        if (crdVal !== undefined) {
          const diff = (sys - crdVal).toFixed(2);
          const ok = Math.abs(diff) <= 0.02;
          if (ok) m1Match++;
          m1Total++;
          console.log(`  ${site}: sys=${sys.toFixed(2)}, CRD=${crdVal}, diff=${diff} ${ok ? '✓' : '✗'}`);
        }
      }
      const totDiff = (total - crd.total).toFixed(2);
      const totOk = Math.abs(totDiff) <= 0.02;
      if (totOk) m1Match++;
      m1Total++;
      console.log(`  TOTAL: sys=${total.toFixed(2)}, CRD=${crd.total}, diff=${totDiff} ${totOk ? '✓' : '✗'}\n`);
    }
    console.log(`Method 1 MATCH: ${m1Match}/${m1Total} (${(m1Match/m1Total*100).toFixed(0)}%)\n`);

    // Method 2: Same but with Exported To GL only
    console.log('=== Method 2: CRD Method + Exported To GL Only ===\n');

    const r2 = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        SUM(invoice_gross) / 10000000 AS net_cr
      FROM (
        SELECT "Invoice_No_", "Site_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-01'
        GROUP BY "Invoice_No_", "Site_"
      ) sub
      GROUP BY month_key, site
      ORDER BY month_key, site
    `);

    const byMonth2 = {};
    for (const row of r2.rows) {
      if (!byMonth2[row.month_key]) byMonth2[row.month_key] = {};
      byMonth2[row.month_key][row.site] = parseFloat(row.net_cr).toFixed(2);
    }
    let m2Match = 0, m2Total = 0;
    for (const month of Object.keys(byMonth2).sort()) {
      const crd = CRD[month];
      if (!crd) continue;
      console.log(`--- ${month} ---`);
      let total = 0;
      for (const site of Object.keys(byMonth2[month]).sort()) {
        const sys = parseFloat(byMonth2[month][site]);
        total += sys;
        const crdVal = crd[site];
        if (crdVal !== undefined) {
          const diff = (sys - crdVal).toFixed(2);
          const ok = Math.abs(diff) <= 0.02;
          if (ok) m2Match++;
          m2Total++;
          console.log(`  ${site}: sys=${sys.toFixed(2)}, CRD=${crdVal}, diff=${diff} ${ok ? '✓' : '✗'}`);
        }
      }
      const totDiff = (total - crd.total).toFixed(2);
      const totOk = Math.abs(totDiff) <= 0.02;
      if (totOk) m2Match++;
      m2Total++;
      console.log(`  TOTAL: sys=${total.toFixed(2)}, CRD=${crd.total}, diff=${totDiff} ${totOk ? '✓' : '✗'}\n`);
    }
    console.log(`Method 2 MATCH: ${m2Match}/${m2Total} (${(m2Match/m2Total*100).toFixed(0)}%)\n`);

    // Method 3: All statuses but no Invoice_Type_ filter
    console.log('=== Method 3: No Invoice_Type filter ===\n');

    const r3 = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month_key,
        "Site_" AS site,
        SUM(invoice_gross) / 10000000 AS net_cr
      FROM (
        SELECT "Invoice_No_", "Site_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" IN ('Open', 'Approved', 'Released', 'Exported To GL')
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-01'
        GROUP BY "Invoice_No_", "Site_"
      ) sub
      GROUP BY month_key, site
      ORDER BY month_key, site
    `);

    const byMonth3 = {};
    for (const row of r3.rows) {
      if (!byMonth3[row.month_key]) byMonth3[row.month_key] = {};
      byMonth3[row.month_key][row.site] = parseFloat(row.net_cr).toFixed(2);
    }
    let m3Match = 0, m3Total = 0;
    for (const month of Object.keys(byMonth3).sort()) {
      const crd = CRD[month];
      if (!crd) continue;
      console.log(`--- ${month} ---`);
      let total = 0;
      for (const site of Object.keys(byMonth3[month]).sort()) {
        const sys = parseFloat(byMonth3[month][site]);
        total += sys;
        const crdVal = crd[site];
        if (crdVal !== undefined) {
          const diff = (sys - crdVal).toFixed(2);
          const ok = Math.abs(diff) <= 0.02;
          if (ok) m3Match++;
          m3Total++;
          console.log(`  ${site}: sys=${sys.toFixed(2)}, CRD=${crdVal}, diff=${diff} ${ok ? '✓' : '✗'}`);
        }
      }
      const totDiff = (total - crd.total).toFixed(2);
      const totOk = Math.abs(totDiff) <= 0.02;
      if (totOk) m3Match++;
      m3Total++;
      console.log(`  TOTAL: sys=${total.toFixed(2)}, CRD=${crd.total}, diff=${totDiff} ${totOk ? '✓' : '✗'}\n`);
    }
    console.log(`Method 3 MATCH: ${m3Match}/${m3Total} (${(m3Match/m3Total*100).toFixed(0)}%)\n`);

    // Targeted check: Apr 2024 URIMH - what statuses give exactly 7.30?
    console.log('=== Apr 2024 URIMH by Status ===');
    const r4 = await db.query(`
      SELECT "Status_",
        SUM(invoice_gross) / 10000000 AS net_cr,
        COUNT(*) AS inv_cnt
      FROM (
        SELECT "Invoice_No_", "Status_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Site_" = 'URIMH'
          AND "Invoice_Type_" != '0'
          AND "Invoice_Date_(Date)" >= '2024-04-01' AND "Invoice_Date_(Date)" <= '2024-04-30'
        GROUP BY "Invoice_No_", "Status_"
      ) sub
      GROUP BY "Status_"
      ORDER BY net_cr DESC
    `);
    for (const row of r4.rows) {
      console.log(`  Status="${row.Status_}", net=${parseFloat(row.net_cr).toFixed(2)} Cr, inv=${row.inv_cnt}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
