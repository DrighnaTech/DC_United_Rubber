'use strict';
const db = require('./db/connection');
(async () => {
  const r = await db.query(`
    SELECT "Invoice_No_", "Status_", "Invoice_Type_", "Invoice_Date_(Date)", "Site_"
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" IN ('PINV/252604459', 'PINV/252604461')
    ORDER BY row_id DESC
    LIMIT 10
  `);
  console.log('Extra URIMP Jun invoices:');
  r.rows.forEach(r => console.log(' ', r.Invoice_No_, '| Status:', r.Status_, '| Type:', r.Invoice_Type_, '| Date:', r['Invoice_Date_(Date)'], '| Site:', r.Site_));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
