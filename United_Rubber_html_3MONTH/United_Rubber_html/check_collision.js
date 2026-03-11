'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});
const T = '"LandingStage2"."mf_sales_si_siheader_all"';

(async () => {
  // Check raw rows for a collision invoice
  const r = await pool.query(`
    SELECT "Invoice_No_", "Amount_", "Invoice_Amount_", "Status_",
      "Invoice_Date_(Date)" AS dt, "row_id"
    FROM ${T}
    WHERE "Invoice_No_" = 'LINV252605045'
    ORDER BY "row_id"
  `);
  console.log('LINV252605045 (collision invoice):');
  for (const row of r.rows) {
    console.log(`  Amt=${row.Amount_} | Gross=${row.Invoice_Amount_} | Status=${row.Status_} | Date=${row.dt} | row_id=${row.row_id}`);
  }

  // Count total collision invoices and their impact
  const r2 = await pool.query(`
    WITH raw_amts AS (
      SELECT "Invoice_No_", "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS amt
      FROM ${T}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
    ),
    per_inv AS (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT amt) AS sum_distinct,
        MIN(amt) AS actual_amt,
        COUNT(DISTINCT amt) AS dist_count
      FROM raw_amts
      GROUP BY "Invoice_No_", "Site_"
    )
    SELECT "Site_",
      COUNT(*) FILTER (WHERE dist_count > 1) AS collision_invoices,
      SUM(sum_distinct - actual_amt) FILTER (WHERE dist_count > 1) AS overcount,
      COUNT(*) AS total_invoices
    FROM per_inv
    GROUP BY "Site_"
    ORDER BY "Site_"
  `);
  console.log('\nSUM(DISTINCT) collision impact by site:');
  for (const row of r2.rows) {
    console.log(`  ${row.Site_}: Collisions=${row.collision_invoices}/${row.total_invoices} | Overcount=${(parseFloat(row.overcount || 0)/1e7).toFixed(4)} Cr`);
  }

  // What does correct (DISTINCT ON) give us vs CRD?
  // CRD values: URIMH=5.49, URIMP=1.28, URIPB=0.44, URIPU=0.64
  const r3 = await pool.query(`
    WITH deduped AS (
      SELECT DISTINCT ON ("Invoice_No_")
        "Invoice_No_", "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS net,
        COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0) AS gross
      FROM ${T}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      ORDER BY "Invoice_No_", "row_id" DESC
    )
    SELECT "Site_" AS site, SUM(net) AS net, SUM(gross) AS gross, COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `);

  const crd = { URIMH: 5.49, URIMP: 1.28, URIPB: 0.44, URIPU: 0.64 };
  console.log('\nCorrected DB (DISTINCT ON) vs CRD:');
  console.log(`  Site     | DB Correct | CRD Total | Diff    | Status`);
  console.log(`  -------- | ---------- | --------- | ------- | ------`);
  for (const row of r3.rows) {
    const dbCr = (parseFloat(row.net) / 1e7).toFixed(2);
    const crdCr = crd[row.site] ? crd[row.site].toFixed(2) : '?';
    const diff = (parseFloat(dbCr) - parseFloat(crdCr)).toFixed(2);
    const status = dbCr === crdCr ? 'MATCH' : Math.abs(parseFloat(diff)) <= 0.01 ? 'ROUND' : 'GAP';
    console.log(`  ${row.site.padEnd(8)} | ${dbCr.padStart(10)} | ${crdCr.padStart(9)} | ${diff.padStart(7)} | ${status}`);
  }

  await pool.end();
})();
