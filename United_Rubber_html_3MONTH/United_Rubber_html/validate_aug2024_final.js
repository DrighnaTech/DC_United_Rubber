'use strict';
const db = require('./db/connection');

(async () => {
  const CRD = 14.79;

  const res = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN '2024-08-01' AND '2024-08-31'
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `);

  console.log('Aug 2024 — Status: Exported To GL | Excluding %-R invoices');
  console.log('='.repeat(55));
  console.log('Site    | Invoices | Net Amt (Cr) | Match CRD?');
  console.log('-'.repeat(55));

  let total = 0;
  for (const r of res.rows) {
    total += parseFloat(r.net_cr);
    console.log(`${r.site.padEnd(8)}| ${String(r.invoices).padEnd(9)}| ${String(r.net_cr).padEnd(13)}| -`);
  }

  console.log('-'.repeat(55));
  console.log(`TOTAL   |          | ${total.toFixed(4).padEnd(13)}| diff = ${(total - CRD).toFixed(4)} Cr`);
  console.log(`CRD REF |          | ${CRD.toFixed(4).padEnd(13)}|`);
  console.log(`\nGap: ${(total - CRD).toFixed(4)} Cr = ₹${Math.abs((total - CRD) * 1e7).toLocaleString('en-IN')} Rs`);

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
