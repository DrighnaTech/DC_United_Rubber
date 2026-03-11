'use strict';
const db = require('./db/connection');

(async () => {
  const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];
  const CRD_TOTAL = 14.79;

  // Scenario 1: Exported To GL, all types
  const exp = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN '2024-08-01' AND '2024-08-31'
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `);

  // Scenario 2: Sales Commercial only
  const comm = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" = 'Sales ( Commercial )'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN '2024-08-01' AND '2024-08-31'
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `);

  // Scenario 3: Exported + Reverted
  const expRev = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" IN ('Exported To GL', 'Reverted')
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN '2024-08-01' AND '2024-08-31'
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `);

  // Reverted only by site
  const rev = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Reverted'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN '2024-08-01' AND '2024-08-31'
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `);

  // Map results
  const toMap = rows => {
    const m = {};
    for (const r of rows) m[r.site] = { cr: parseFloat(r.net_cr), inv: parseInt(r.invoices) };
    return m;
  };
  const E  = toMap(exp.rows);
  const C  = toMap(comm.rows);
  const ER = toMap(expRev.rows);
  const R  = toMap(rev.rows);

  // Print
  console.log('='.repeat(100));
  console.log('AUG 2024 — BY SITE COMPARISON');
  console.log('Note: No per-site CRD values available from client — only total CRD = 14.79 Cr');
  console.log('='.repeat(100));
  console.log(`${'Site'.padEnd(7)} | ${'Exported(all)'.padEnd(16)} | ${'Comm Only'.padEnd(16)} | ${'Reverted'.padEnd(16)} | ${'Exp+Reverted'.padEnd(16)}`);
  console.log('-'.repeat(100));

  let totE=0, totC=0, totER=0, totR=0;
  for (const s of sites) {
    const e  = E[s]  || {cr:0,inv:0};
    const c  = C[s]  || {cr:0,inv:0};
    const er = ER[s] || {cr:0,inv:0};
    const r  = R[s]  || {cr:0,inv:0};
    totE+=e.cr; totC+=c.cr; totER+=er.cr; totR+=r.cr;
    console.log(
      s.padEnd(7)+' | '+
      (e.cr.toFixed(4)+' ('+e.inv+'inv)').padEnd(16)+' | '+
      (c.cr.toFixed(4)+' ('+c.inv+'inv)').padEnd(16)+' | '+
      (r.cr.toFixed(4)+' ('+r.inv+'inv)').padEnd(16)+' | '+
      (er.cr.toFixed(4)+' ('+er.inv+'inv)').padEnd(16)
    );
  }
  console.log('-'.repeat(100));
  console.log(
    'TOTAL  | '+
    (totE.toFixed(4)+' Cr').padEnd(16)+' | '+
    (totC.toFixed(4)+' Cr').padEnd(16)+' | '+
    (totR.toFixed(4)+' Cr').padEnd(16)+' | '+
    (totER.toFixed(4)+' Cr').padEnd(16)
  );
  console.log('-'.repeat(100));
  console.log(
    'vs CRD | '+
    ((totE-CRD_TOTAL).toFixed(4)+' Cr').padEnd(16)+' | '+
    ((totC-CRD_TOTAL).toFixed(4)+' Cr').padEnd(16)+' | '+
    ''.padEnd(16)+' | '+
    ((totER-CRD_TOTAL).toFixed(4)+' Cr').padEnd(16)
  );

  // Invoice type breakdown per site for Exported To GL
  console.log('\n' + '='.repeat(80));
  console.log('INVOICE TYPE BREAKDOWN BY SITE — Exported To GL');
  console.log('='.repeat(80));
  const typeRes = await db.query(`
    SELECT "Site_" AS site, "Invoice_Type_" AS type,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_", "Invoice_Type_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN '2024-08-01' AND '2024-08-31'
      GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    ) sub
    GROUP BY site, type ORDER BY site, net_cr DESC
  `);

  let lastSite = '';
  let siteTot = 0;
  for (const r of typeRes.rows) {
    if (r.site !== lastSite) {
      if (lastSite) console.log(`  ${lastSite} subtotal: ${siteTot.toFixed(4)} Cr`);
      console.log(`\n  ${r.site}:`);
      lastSite = r.site; siteTot = 0;
    }
    siteTot += parseFloat(r.net_cr);
    console.log(`    "${r.type}": ${r.invoices} inv | ${r.net_cr} Cr`);
  }
  if (lastSite) console.log(`  ${lastSite} subtotal: ${siteTot.toFixed(4)} Cr`);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
