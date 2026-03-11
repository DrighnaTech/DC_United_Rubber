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
  // ── The dashboard uses TrendCTE: GROUP BY (Invoice_No_, Invoice_Date_, Site_)
  //    then SUM(DISTINCT Amount_) per group. Let's compare this with a proper
  //    per-invoice dedup (no SUM DISTINCT — just take one Amount_ per invoice) ──

  console.log('=== Jul 2025 Exported To GL — Method Comparison ===\n');

  // Method A: Current dashboard (TrendCTE) — SUM(DISTINCT Amount_) per (Invoice, Date, Site)
  const sqlA = `
    WITH deduped AS (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)", "Site_"
    )
    SELECT "Site_" AS site, SUM(net) AS net, SUM(gross) AS gross, COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `;

  // Method B: Proper dedup — one Amount_ per invoice (no SUM DISTINCT collision risk)
  const sqlB = `
    WITH deduped AS (
      SELECT DISTINCT ON ("Invoice_No_")
        "Invoice_No_", "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS net,
        COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0) AS gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      ORDER BY "Invoice_No_", "row_id" DESC
    )
    SELECT "Site_" AS site, SUM(net) AS net, SUM(gross) AS gross, COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `;

  // Method C: No status filter (like CRD) — DISTINCT ON per invoice
  const sqlC = `
    WITH deduped AS (
      SELECT DISTINCT ON ("Invoice_No_")
        "Invoice_No_", "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS net,
        COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0) AS gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      ORDER BY "Invoice_No_", "row_id" DESC
    )
    SELECT "Site_" AS site, SUM(net) AS net, SUM(gross) AS gross, COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `;

  const [rA, rB, rC] = await Promise.all([pool.query(sqlA), pool.query(sqlB), pool.query(sqlC)]);

  console.log('Method A: Dashboard TrendCTE (SUM DISTINCT, Exported To GL)');
  for (const row of rA.rows) {
    console.log(`  ${row.site}: Net=${(parseFloat(row.net)/1e7).toFixed(4)} Cr | Gross=${(parseFloat(row.gross)/1e7).toFixed(4)} Cr | Inv=${row.inv}`);
  }

  console.log('\nMethod B: DISTINCT ON per invoice (Exported To GL, no SUM DISTINCT)');
  for (const row of rB.rows) {
    console.log(`  ${row.site}: Net=${(parseFloat(row.net)/1e7).toFixed(4)} Cr | Gross=${(parseFloat(row.gross)/1e7).toFixed(4)} Cr | Inv=${row.inv}`);
  }

  console.log('\nMethod C: DISTINCT ON per invoice (ALL statuses, no SUM DISTINCT)');
  for (const row of rC.rows) {
    console.log(`  ${row.site}: Net=${(parseFloat(row.net)/1e7).toFixed(4)} Cr | Gross=${(parseFloat(row.gross)/1e7).toFixed(4)} Cr | Inv=${row.inv}`);
  }

  // ── Show the SUM(DISTINCT) collision invoices ──────────────────────────
  console.log('\n\n=== SUM(DISTINCT) COLLISION CHECK ===');
  console.log('Invoices where SUM(DISTINCT Amount_) != actual Amount_ (within same Invoice+Date+Site group)');

  const sqlCollision = `
    WITH raw_amounts AS (
      SELECT
        "Invoice_No_", "Invoice_Date_(Date)" AS dt, "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS amt,
        COUNT(*) AS row_count
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)", "Site_", "Amount_"
    ),
    per_inv AS (
      SELECT
        "Invoice_No_", dt, "Site_",
        SUM(amt) AS sum_distinct_amt,    -- = SUM(DISTINCT Amount_) since we grouped by Amount_
        COUNT(*) AS distinct_amounts,
        SUM(row_count) AS total_rows
      FROM raw_amounts
      GROUP BY "Invoice_No_", dt, "Site_"
      HAVING COUNT(*) > 1  -- multiple distinct amounts for same invoice
    )
    SELECT * FROM per_inv ORDER BY sum_distinct_amt DESC LIMIT 20
  `;
  const rColl = await pool.query(sqlCollision);
  console.log(`Invoices with multiple distinct Amount_ values: ${rColl.rowCount}`);
  for (const row of rColl.rows) {
    console.log(`  ${row.Invoice_No_} | ${row.Site_} | Date=${row.dt} | SUM(DISTINCT)=${row.sum_distinct_amt} | Distinct amts=${row.distinct_amounts} | Rows=${row.total_rows}`);
  }

  // ── Direct comparison table ────────────────────────────────────────────
  console.log('\n\n=== FINAL COMPARISON: Method A vs Method B ===');
  console.log('(Shows if SUM(DISTINCT) at header level causes over/under counting)\n');
  console.log(`  ${'Site'.padEnd(8)} | ${'A: SUM(DIST)'.padStart(14)} | ${'B: DIST ON'.padStart(14)} | ${'Diff'.padStart(12)} | ${'Impact'}`);
  console.log(`  ${'-'.repeat(70)}`);

  const mapA = {};
  for (const r of rA.rows) mapA[r.site] = parseFloat(r.net);
  const mapB = {};
  for (const r of rB.rows) mapB[r.site] = parseFloat(r.net);

  for (const site of ['URIMH', 'URIMP', 'URIPB', 'URIPU']) {
    const a = mapA[site] || 0;
    const b = mapB[site] || 0;
    const diff = a - b;
    console.log(`  ${site.padEnd(8)} | ${(a/1e7).toFixed(4).padStart(14)} | ${(b/1e7).toFixed(4).padStart(14)} | ${(diff/1e7).toFixed(4).padStart(12)} | ${Math.abs(diff) < 100 ? 'OK' : 'COLLISION'}`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
