'use strict';
const db = require('./db/connection');

// Old CRD values from client email (Jan 29 2025) - ALL types formula, Exported To GL
// These are the CORRECT values for Apr-Nov 2024 that must NOT change
const OLD_CRD = {
  '2024-04': 14.13, '2024-05': 15.55, '2024-06': 17.02, '2024-07': 19.09,
  '2024-08': 18.11, '2024-09': 17.22, '2024-10': 19.57, '2024-11': 18.96,
};

(async () => {
  try {
    // Query 1: ALL types (current formula) — Apr 2024 to May 2025
    const r1 = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-04-01'
          AND "Invoice_Date_(Date)" <= '2025-05-31'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month ORDER BY month
    `);

    // Query 2: Sales Commercial ONLY (exclude Returns & Service)
    const r2 = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" = 'Sales ( Commercial )'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-04-01'
          AND "Invoice_Date_(Date)" <= '2025-05-31'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month ORDER BY month
    `);

    // Query 3: Returns contribution per month
    const r3 = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        COUNT(DISTINCT "Invoice_No_") AS ret_inv,
        ROUND(SUM(sub.net)/1e7, 4) AS ret_cr
      FROM (
        SELECT "Invoice_No_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" = 'Sales Return'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-04-01'
          AND "Invoice_Date_(Date)" <= '2025-05-31'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month ORDER BY month
    `);

    // Query 4: Service contribution per month
    const r4 = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        COUNT(DISTINCT "Invoice_No_") AS svc_inv,
        ROUND(SUM(sub.net)/1e7, 4) AS svc_cr
      FROM (
        SELECT "Invoice_No_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" = 'Service'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-04-01'
          AND "Invoice_Date_(Date)" <= '2025-05-31'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month ORDER BY month
    `);

    const allTypes = {};
    for (const r of r1.rows) allTypes[r.month] = parseFloat(r.net_cr);
    const commOnly = {};
    for (const r of r2.rows) commOnly[r.month] = parseFloat(r.net_cr);
    const returns = {};
    for (const r of r3.rows) returns[r.month] = { cr: parseFloat(r.ret_cr), inv: r.ret_inv };
    const service = {};
    for (const r of r4.rows) service[r.month] = { cr: parseFloat(r.svc_cr), inv: r.svc_inv };

    const months = Object.keys(allTypes).sort();

    // New CRD values for 2025 months (from client xlsx files)
    const NEW_CRD = { '2025-04': 14.7671, '2025-05': 14.1835 };

    console.log('='.repeat(110));
    console.log('FORMULA IMPACT ANALYSIS — Can we switch to Sales Commercial only WITHOUT breaking Apr-Nov 2024?');
    console.log('='.repeat(110));
    console.log(`${'Month'.padEnd(8)} | ${'CRD Ref'.padEnd(9)} | ${'ALL Types'.padEnd(9)} | ${'Comm Only'.padEnd(9)} | ${'Δ ALL→Comm'.padEnd(10)} | ${'Returns Cr'.padEnd(10)} | ${'Service Cr'.padEnd(10)} | Impact`);
    console.log('-'.repeat(110));

    for (const m of months) {
      const allV  = allTypes[m] || 0;
      const commV = commOnly[m] || 0;
      const retV  = returns[m]  ? returns[m].cr  : 0;
      const svcV  = service[m]  ? service[m].cr  : 0;
      const delta = (commV - allV).toFixed(4);
      const isOld = OLD_CRD[m] !== undefined;
      const isNew = NEW_CRD[m] !== undefined;
      const crdRef = isOld ? OLD_CRD[m].toFixed(2) : (isNew ? NEW_CRD[m].toFixed(4) : 'N/A');

      let impact = '';
      if (isOld) {
        const diffAllVsCrd  = (allV  - OLD_CRD[m]).toFixed(4);
        const diffCommVsCrd = (commV - OLD_CRD[m]).toFixed(4);
        impact = `ALL diff=${diffAllVsCrd} | Comm diff=${diffCommVsCrd}`;
      } else if (isNew) {
        const diffAllVsCrd  = (allV  - NEW_CRD[m]).toFixed(4);
        const diffCommVsCrd = (commV - NEW_CRD[m]).toFixed(4);
        impact = `ALL diff=${diffAllVsCrd} | Comm diff=${diffCommVsCrd}`;
      }

      const marker = isOld ? '← old CRD' : (isNew ? '← new CRD' : '');
      console.log(`${m.padEnd(8)} | ${crdRef.padEnd(9)} | ${allV.toFixed(4).padEnd(9)} | ${commV.toFixed(4).padEnd(9)} | ${delta.padEnd(10)} | ${retV.toFixed(4).padEnd(10)} | ${svcV.toFixed(4).padEnd(10)} | ${impact}  ${marker}`);
    }

    console.log('\n' + '='.repeat(110));
    console.log('CONCLUSION:');
    console.log('  If we switch to Comm Only formula:');
    let brokenMonths = 0;
    for (const m of Object.keys(OLD_CRD)) {
      const allV  = allTypes[m]  || 0;
      const commV = commOnly[m] || 0;
      const oldCrd = OLD_CRD[m];
      const diffAll  = Math.abs(allV  - oldCrd);
      const diffComm = Math.abs(commV - oldCrd);
      if (diffComm > 0.02) { // tolerance 0.02 Cr
        console.log(`  ✗ ${m}: Old CRD=${oldCrd} | ALL=${allV.toFixed(4)} (diff=${(allV-oldCrd).toFixed(4)}) | CommOnly=${commV.toFixed(4)} (diff=${(commV-oldCrd).toFixed(4)}) — BREAKS this month`);
        brokenMonths++;
      }
    }
    if (brokenMonths === 0) {
      console.log('  ✓ All Apr-Nov 2024 months would STILL match old CRD even with CommOnly formula!');
      console.log('  → Safe to switch to Sales Commercial only formula.');
    } else {
      console.log(`  → ${brokenMonths} old months would break. Cannot switch formula universally.`);
      console.log('  → Need a different approach (e.g., date-based cutoff or exclude Returns only).');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
