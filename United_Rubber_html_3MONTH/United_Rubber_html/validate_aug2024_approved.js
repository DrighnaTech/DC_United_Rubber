'use strict';
const db = require('./db/connection');

(async () => {
  try {
    // What statuses exist for Aug 2024 domestic invoices?
    const statusRes = await db.query(`
      SELECT "Status_", COUNT(DISTINCT "Invoice_No_") AS invoices,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= '2024-08-01'
        AND "Invoice_Date_(Date)" <= '2024-08-31'
      GROUP BY "Status_"
      ORDER BY "Status_"
    `);

    console.log('--- All statuses for Aug 2024 domestic invoices (DB) ---');
    let exportedTotal = 0;
    for (const r of statusRes.rows) {
      if (r['Status_'] === 'Exported To GL') exportedTotal = parseFloat(r.net_cr);
      console.log(`  "${r['Status_']}": ${r.invoices} invoices | ${r.net_cr} Cr`);
    }

    // Check: Approved invoices that were later exported (exist in Exported status in a later snapshot)
    // i.e., same Invoice_No_ appears as both Approved AND Exported To GL in different partitions
    const dualStatus = await db.query(`
      SELECT "Invoice_No_", "Site_", "Invoice_Type_",
        ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS statuses,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= '2024-08-01'
        AND "Invoice_Date_(Date)" <= '2024-08-31'
      GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
      HAVING COUNT(DISTINCT "Status_") > 1
      ORDER BY "Invoice_No_"
    `);

    console.log(`\n--- Invoices with MULTIPLE statuses in Aug 2024 (timing candidates): ${dualStatus.rows.length} ---`);
    let dualTotal = 0;
    for (const r of dualStatus.rows) {
      const statuses = r.statuses.join(' + ');
      // Only care about ones that are Approved in one snapshot but Exported in another
      const hasApproved = r.statuses.includes('Approved');
      const hasExported = r.statuses.includes('Exported To GL');
      if (hasApproved && !hasExported) {
        // These are Approved only in DB — but CRD might have had them as Exported
        dualTotal += parseFloat(r.net_cr);
        console.log(`  ${r['Invoice_No_']} | ${r['Site_']} | ${r['Invoice_Type_']} | ${statuses} | ${r.net_cr} Cr`);
      }
    }

    // How much are pure Approved-only invoices worth?
    const approvedOnlyRes = await db.query(`
      SELECT COUNT(DISTINCT inv) AS count,
        ROUND(SUM(net)/1e7, 4) AS total_cr
      FROM (
        SELECT "Invoice_No_" AS inv,
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net,
          ARRAY_AGG(DISTINCT "Status_") AS statuses
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" != '0'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-08-01'
          AND "Invoice_Date_(Date)" <= '2024-08-31'
        GROUP BY "Invoice_No_"
        HAVING ARRAY_AGG(DISTINCT "Status_") @> ARRAY['Approved']
           AND NOT (ARRAY_AGG(DISTINCT "Status_") @> ARRAY['Exported To GL'])
      ) sub
    `);

    console.log(`\n--- Approved-only invoices (never reached Exported To GL) ---`);
    const aRow = approvedOnlyRes.rows[0];
    console.log(`  Count: ${aRow.count} invoices | Total: ${aRow.total_cr} Cr`);

    // The gap we need to explain
    const crdRef = 14.79;
    const sysVal = 14.7759;
    const gap    = (crdRef - sysVal).toFixed(4);
    console.log(`\n--- Gap analysis ---`);
    console.log(`  CRD Reference : ${crdRef} Cr`);
    console.log(`  Our system    : ${sysVal} Cr`);
    console.log(`  Gap           : ${gap} Cr`);
    console.log(`  Approved-only : ${aRow.total_cr} Cr`);
    console.log(`\n  Conclusion: ${parseFloat(aRow.total_cr) > 0 ?
      'Approved invoices ('+aRow.total_cr+' Cr) were likely Exported To GL when CRD was generated, explaining the '+gap+' Cr gap.' :
      'No Approved-only invoices found — gap is pure rounding/truncation from the old CRD.'}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
