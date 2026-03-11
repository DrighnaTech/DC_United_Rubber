'use strict';

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA = process.env.DB_SCHEMA || 'LandingStage2';
const HDR = `"${SCHEMA}"."mf_sales_si_siheader_all"`;

async function main() {
  // ── Compare header Amount_ vs Item table amounts for Jul 2025 ──────────
  console.log('=== HEADER TABLE: Jul 2025, Exported To GL ===');

  // Method 1: TrendCTE (current dashboard method) — SUM(DISTINCT Amount_)
  const sql1 = `
    WITH deduped AS (
      SELECT
        "Invoice_No_", "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Site_"
    )
    SELECT "Site_" AS site,
      ROUND(SUM(net)/10000000, 4) AS net_cr,
      ROUND(SUM(gross)/10000000, 4) AS gross_cr,
      COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `;
  const r1 = await pool.query(sql1);
  console.log('\nMethod 1: Header SUM(DISTINCT Amount_) — dashboard method');
  for (const row of r1.rows) {
    console.log(`  ${row.site}: Net=${row.net_cr} Cr | Gross=${row.gross_cr} Cr | Inv=${row.inv}`);
  }

  // Method 2: Check what the CRD "Item Amount" maps to in our item table
  const ITEM_TABLE = `"${SCHEMA}"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"`;

  // First check if item table has Jul 2025 data at all
  const sqlItemCheck = `
    SELECT COUNT(*) AS cnt,
      COUNT(DISTINCT "Invoice_No_") AS inv_count
    FROM ${ITEM_TABLE}
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND EXISTS (
        SELECT 1 FROM ${HDR} h
        WHERE h."Invoice_No_" = ${ITEM_TABLE}."Invoice_No_"
          AND h."Invoice_Date_(Date)" >= '2025-07-01'
          AND h."Invoice_Date_(Date)" < '2025-08-01'
          AND h."Status_" = 'Exported To GL'
      )
  `;
  const rItem = await pool.query(sqlItemCheck);
  console.log(`\nItem table rows for Jul 2025 Exported invoices: ${rItem.rows[0].cnt} rows, ${rItem.rows[0].inv_count} invoices`);

  // If item table has data, compute item-level sum
  if (parseInt(rItem.rows[0].cnt) > 0) {
    const sqlItemSum = `
      WITH hdr AS (
        SELECT DISTINCT "Invoice_No_", "Site_"
        FROM ${HDR}
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Date_(Date)" >= '2025-07-01'
          AND "Invoice_Date_(Date)" < '2025-08-01'
      )
      SELECT h."Site_" AS site,
        ROUND(SUM(COALESCE(NULLIF(i."Item_Amount",'')::NUMERIC, 0))/10000000, 4) AS item_amt_cr,
        ROUND(SUM(COALESCE(NULLIF(i."Item_NetAmount",'')::NUMERIC, 0))/10000000, 4) AS item_net_cr,
        COUNT(*) AS item_rows
      FROM ${ITEM_TABLE} i
      JOIN hdr h ON h."Invoice_No_" = i."Invoice_No_"
      GROUP BY h."Site_"
      ORDER BY h."Site_"
    `;
    const rItemSum = await pool.query(sqlItemSum);
    console.log('\nMethod 2: Item table SUM(Item_Amount) — raw, before cross-join dedup');
    for (const row of rItemSum.rows) {
      console.log(`  ${row.site}: Item_Amount=${row.item_amt_cr} Cr | Item_NetAmount=${row.item_net_cr} Cr | Rows=${row.item_rows}`);
    }
  }

  // ── Also compare: CRD file is item-level. What if CRD "Net Amount"
  //    maps to our header "Amount_" but CRD aggregates differently? ──────
  // Let's check a few specific invoices to see if CRD item sum = DB header Amount_
  console.log('\n=== SAMPLE INVOICE CHECK: CRD item sum vs DB header Amount_ ===');
  const sampleSql = `
    WITH deduped AS (
      SELECT
        "Invoice_No_", "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS hdr_net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS hdr_gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Site_"
    )
    SELECT * FROM deduped ORDER BY hdr_net DESC LIMIT 10
  `;
  const rSample = await pool.query(sampleSql);
  console.log('Top 10 invoices by header net (Amount_):');
  for (const row of rSample.rows) {
    console.log(`  ${row.Invoice_No_} | ${row.Site_} | Hdr Net=${row.hdr_net} | Hdr Gross=${row.hdr_gross}`);
  }

  // Now check the DEEP comparison: for all CRD invoices that are Exported,
  // our deep dive showed CRD item sum == DB header Amount_ exactly (diff=0).
  // But the site totals differ. This means the 2-decimal rounding is the issue.
  // Let me show the FULL precision comparison
  console.log('\n=== FULL PRECISION SITE TOTALS (4 decimals) ===');
  const sql4 = `
    WITH deduped AS (
      SELECT
        "Invoice_No_", "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Site_"
    )
    SELECT "Site_" AS site,
      SUM(net) AS net_raw,
      SUM(gross) AS gross_raw,
      COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `;
  const r4 = await pool.query(sql4);
  console.log('  Site     | DB Net (raw)       | DB Gross (raw)     | Invoices');
  for (const row of r4.rows) {
    console.log(`  ${row.site.padEnd(8)} | ${parseFloat(row.net_raw).toFixed(2).padStart(18)} | ${parseFloat(row.gross_raw).toFixed(2).padStart(18)} | ${row.inv}`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
