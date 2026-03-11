'use strict';
const db = require('./db/connection');

// THEORY: CRD uses Created_Date (GL posting date) for Dec filter, not Invoice_Date.
// Invoices POSTED in Dec 2024 but DATED in Nov/other months would be counted by CRD
// but missed by our Invoice_Date BETWEEN filter.

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // ── A: URIMP Exported To GL — compare Invoice_Date vs Created_Date totals ──
  console.log('='.repeat(80));
  console.log('A — URIMP Exported To GL: Invoice_Date filter vs Created_Date filter');
  console.log('='.repeat(80));

  // Current formula — filter by Invoice_Date
  const invDateRes = await db.query(`
    SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_"
    ) sub
  `, [DATE_FROM, DATE_TO]);

  // CRD theory — filter by Created_Date
  const createdDateRes = await db.query(`
    SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND TO_CHAR("Created_Date"::TIMESTAMP, 'YYYY-MM') = '2024-12'
      GROUP BY "Invoice_No_"
    ) sub
  `);

  console.log(`\n  Invoice_Date filter   : ${invDateRes.rows[0].inv} inv | ${invDateRes.rows[0].net_cr} Cr | diff from CRD: ${(parseFloat(invDateRes.rows[0].net_cr)-3.4010).toFixed(4)}`);
  console.log(`  Created_Date filter   : ${createdDateRes.rows[0].inv} inv | ${createdDateRes.rows[0].net_cr} Cr | diff from CRD: ${(parseFloat(createdDateRes.rows[0].net_cr)-3.4010).toFixed(4)}`);

  // ── B: Invoices POSTED in Dec (Created_Date Dec) but Invoice_Date NOT in Dec ──
  console.log('\n' + '='.repeat(80));
  console.log('B — URIMP Exported To GL: Created_Date in Dec but Invoice_Date OUTSIDE Dec');
  console.log('These exist in CRD (Created_Date Dec filter) but NOT in our formula (Invoice_Date filter)');
  console.log('='.repeat(80));

  const extraInCRD = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM-DD') AS inv_date,
      TO_CHAR("Created_Date"::TIMESTAMP,'YYYY-MM-DD') AS created,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND TO_CHAR("Created_Date"::TIMESTAMP, 'YYYY-MM') = '2024-12'
      AND ("Invoice_Date_(Date)" < $1 OR "Invoice_Date_(Date)" > $2)
    GROUP BY "Invoice_No_", "Invoice_Type_", "Invoice_Date_(Date)", "Created_Date"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  if (extraInCRD.rows.length === 0) {
    console.log('\n  None found. CRD Created_Date theory does NOT explain the gap for URIMP.');
  } else {
    let total = 0;
    for (const r of extraInCRD.rows) {
      total += parseFloat(r.net_cr);
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | inv_date=${r.inv_date} | created=${r.created} | ${r.net_cr} Cr`);
    }
    console.log(`\n  Total extra invoices (in CRD but not our formula): ${total.toFixed(4)} Cr`);
    console.log(`  With these added: ${(3.3409 + total).toFixed(4)} Cr | diff from 3.4010: ${(3.3409 + total - 3.4010).toFixed(4)}`);
  }

  // ── C: Invoices in our formula (Invoice_Date Dec) but Created_Date NOT in Dec ──
  console.log('\n' + '='.repeat(80));
  console.log('C — URIMP Exported To GL: Invoice_Date in Dec but Created_Date OUTSIDE Dec');
  console.log('These exist in our formula but NOT in CRD if CRD uses Created_Date');
  console.log('='.repeat(80));

  const extraInOurs = await db.query(`
    SELECT TO_CHAR("Created_Date"::TIMESTAMP,'YYYY-MM') AS created_month,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Created_Date",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND TO_CHAR("Created_Date"::TIMESTAMP, 'YYYY-MM') != '2024-12'
      GROUP BY "Invoice_No_", "Created_Date"
    ) sub
    GROUP BY created_month ORDER BY created_month
  `, [DATE_FROM, DATE_TO]);

  if (extraInOurs.rows.length === 0) {
    console.log('\n  None — all our Dec Invoice_Date invoices were also Created in Dec.');
  } else {
    for (const r of extraInOurs.rows) {
      console.log(`  Created_Month=${r.created_month}: ${r.inv} inv | ${r.net_cr} Cr`);
    }
  }

  // ── D: URIMH same check — confirm Created_Date theory works for URIMH too ──
  console.log('\n' + '='.repeat(80));
  console.log('D — URIMH Exported To GL: Created_Date filter total');
  console.log('='.repeat(80));

  const urimhCreated = await db.query(`
    SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMH'
        AND TO_CHAR("Created_Date"::TIMESTAMP, 'YYYY-MM') = '2024-12'
      GROUP BY "Invoice_No_"
    ) sub
  `);

  console.log(`\n  URIMH Created_Date Dec filter: ${urimhCreated.rows[0].inv} inv | ${urimhCreated.rows[0].net_cr} Cr | diff from CRD 8.8943: ${(parseFloat(urimhCreated.rows[0].net_cr)-8.8943).toFixed(4)}`);

  // ── E: All 4 sites — Created_Date filter total vs CRD ─────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('E — ALL SITES: Created_Date Dec filter vs Invoice_Date Dec filter vs CRD');
  console.log('='.repeat(80));

  const allSitesCreated = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND TO_CHAR("Created_Date"::TIMESTAMP, 'YYYY-MM') = '2024-12'
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `);

  const CRD = { URIMH: 8.8943, URIMP: 3.4010, URIPB: 0.3492, URIPU: 1.5751 };
  const DB  = { URIMH: 8.8843, URIMP: 3.3410, URIPB: 0.3492, URIPU: 1.5751 };

  console.log('\n  Site   | Created_Date Cr | diff from CRD | Invoice_Date Cr | diff from CRD');
  console.log('  ' + '-'.repeat(80));
  let totalCreated = 0;
  for (const r of allSitesCreated.rows) {
    totalCreated += parseFloat(r.net_cr);
    const crdDiff  = (parseFloat(r.net_cr) - (CRD[r.site]||0)).toFixed(4);
    const invDiff  = (DB[r.site] - (CRD[r.site]||0)).toFixed(4);
    const mark = Math.abs(parseFloat(r.net_cr) - (CRD[r.site]||0)) < 0.002 ? ' ✓ MATCHES' : '';
    console.log(`  ${r.site.padEnd(7)}| ${String(r.net_cr).padEnd(16)} | ${crdDiff.padEnd(14)} | ${String(DB[r.site]).padEnd(16)} | ${invDiff}${mark}`);
  }
  console.log(`\n  TOTAL Created_Date filter: ${totalCreated.toFixed(4)} Cr | CRD: 14.22 | diff: ${(totalCreated-14.22).toFixed(4)}`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
