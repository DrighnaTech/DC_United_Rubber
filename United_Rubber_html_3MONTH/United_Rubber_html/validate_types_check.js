'use strict';
const db = require('./db/connection');
(async () => {
  try {
    const r = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        ARRAY_TO_STRING(ARRAY_AGG(DISTINCT "Invoice_Type_"), ' | ') AS types,
        COUNT(DISTINCT "Invoice_No_") AS total_invoices
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') BETWEEN '2024-04' AND '2025-07'
      GROUP BY month
      ORDER BY month
    `);
    console.log('Month   | Invoices | Invoice Types present');
    console.log('--------|----------|---------------------');
    for (const row of r.rows) {
      console.log(`${row.month} | ${String(row.total_invoices).padEnd(8)} | ${row.types}`);
    }
    process.exit(0);
  } catch(e) { console.error(e.message); process.exit(1); }
})();
