'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // ── CHECK A: What ALL partition names exist in the DB?
  console.log('='.repeat(80));
  console.log('A — All distinct src_table partitions in mf_sales_si_siheader_all');
  console.log('='.repeat(80));

  const partRes = await db.query(`
    SELECT DISTINCT src_table
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    ORDER BY src_table
  `);
  for (const r of partRes.rows) console.log(`  ${r.src_table}`);

  // ── CHECK B: Dec 2024 URIMP Exported To GL in ALL partitions (including non-dec ones)
  console.log('\n' + '='.repeat(80));
  console.log('B — Dec 2024 URIMP Exported To GL invoices across EVERY partition');
  console.log('='.repeat(80));

  const allPartRes = await db.query(`
    SELECT src_table,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", src_table,
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_", src_table
    ) sub
    GROUP BY src_table ORDER BY src_table
  `, [DATE_FROM, DATE_TO]);

  for (const r of allPartRes.rows) {
    const diff = (parseFloat(r.net_cr) - 3.4010).toFixed(4);
    console.log(`  ${r.src_table}: ${r.inv} inv | ${r.net_cr} Cr | diff from 3.4010: ${diff}`);
  }

  // ── CHECK C: Dec 2024 URIMP invoices in non-dec partitions (feb/jan 2025 captures)?
  console.log('\n' + '='.repeat(80));
  console.log('C — Dec 2024 URIMP invoices (ANY status) in non-2024_dec partitions');
  console.log('='.repeat(80));

  const nonDecRes = await db.query(`
    SELECT src_table, "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_No_" NOT LIKE '%-R'
      AND "Invoice_Type_" != '0'
      AND src_table NOT LIKE '%2024_dec%'
    GROUP BY src_table, "Status_"
    ORDER BY src_table, "Status_"
  `, [DATE_FROM, DATE_TO]);

  if (nonDecRes.rows.length === 0) {
    console.log('  None found — URIMP Dec data ONLY in 2024_dec partitions.');
  } else {
    for (const r of nonDecRes.rows) {
      console.log(`  ${r.src_table} | ${r['Status_']} | ${r.inv} inv | ${r.net_cr} Cr`);
    }
  }

  // ── CHECK D: All URIMP Exported To GL invoices — DEDUPED across ALL partitions ──
  // Current formula: SUM(DISTINCT Amount_) per Invoice_No_ → total
  // Are there invoices that appear with different amounts in different partitions?
  console.log('\n' + '='.repeat(80));
  console.log('D — URIMP Dec: invoices with MULTIPLE distinct Amount_ values (dedup anomaly?)');
  console.log('='.repeat(80));

  const multiAmtRes = await db.query(`
    SELECT "Invoice_No_",
      COUNT(DISTINCT CAST("Amount_" AS NUMERIC)) AS distinct_amounts,
      ARRAY_AGG(DISTINCT CAST("Amount_" AS NUMERIC) ORDER BY CAST("Amount_" AS NUMERIC)) AS amounts,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS sum_distinct_cr,
      ROUND(MAX(CAST("Amount_" AS NUMERIC))/1e7, 6) AS max_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_"
    HAVING COUNT(DISTINCT CAST("Amount_" AS NUMERIC)) > 1
    ORDER BY sum_distinct_cr DESC
    LIMIT 20
  `, [DATE_FROM, DATE_TO]);

  if (multiAmtRes.rows.length === 0) {
    console.log('  No multi-amount anomaly found — all URIMP Exported invoices have consistent amounts.');
  } else {
    console.log(`  Found ${multiAmtRes.rows.length} invoices with multiple distinct Amount_ values:`);
    for (const r of multiAmtRes.rows) {
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r.distinct_amounts} distinct | SUM_DISTINCT=${r.sum_distinct_cr} Cr | amounts=${r.amounts.join(',')}`);
    }
  }

  // ── CHECK E: Dec 2024 URIMP — invoice list in LATEST partition vs w4 ─────────
  // Maybe the latest partition has MORE invoices than w4
  console.log('\n' + '='.repeat(80));
  console.log('E — URIMP Dec: invoices ONLY in latest (last) partition, not in w1-w4');
  console.log('Identifies invoices captured later that w1-w4 missed');
  console.log('='.repeat(80));

  // Find the latest non-dec partition that has Dec-dated invoices
  const latestPartCheck = await db.query(`
    SELECT DISTINCT src_table
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    ORDER BY src_table DESC
    LIMIT 5
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Latest partitions containing Dec 2024 URIMP data:');
  for (const r of latestPartCheck.rows) console.log(`    ${r.src_table}`);

  // ── CHECK F: URIMP — Exported To GL invoices per Invoice_Date (complete list) ──
  // Are there any invoices at URIMP with Created_Date in Jan 2025 but Invoice_Date in Dec?
  console.log('\n' + '='.repeat(80));
  console.log('F — URIMP Dec 2024: Exported To GL with Created_Date in Jan 2025');
  console.log('(invoices created AFTER Dec but dated Dec — would be in CRD Jan 29 but late in our ETL)');
  console.log('='.repeat(80));

  const latecreated = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      TO_CHAR(MAX("Created_Date"::TIMESTAMP),'YYYY-MM-DD HH24:MI') AS max_created,
      TO_CHAR(MIN("Created_Date"::TIMESTAMP),'YYYY-MM-DD HH24:MI') AS min_created,
      ARRAY_AGG(DISTINCT src_table) AS partitions
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Created_Date" >= '2025-01-01'
    GROUP BY "Invoice_No_", "Invoice_Type_"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  if (latecreated.rows.length === 0) {
    console.log('\n  None found — no Dec-dated URIMP invoices were created in Jan 2025.');
  } else {
    let lateTotal = 0;
    for (const r of latecreated.rows) {
      lateTotal += parseFloat(r.net_cr);
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r.net_cr} Cr | created ${r.min_created} → ${r.max_created} | parts=${r.partitions.join(',')}`);
    }
    console.log(`\n  Total: ${lateTotal.toFixed(4)} Cr`);
  }

  // ── CHECK G: URIMP Exported total using different dedup — DISTINCT ON latest row ──
  console.log('\n' + '='.repeat(80));
  console.log('G — URIMP Dec: DISTINCT ON latest row_id (alternative dedup method)');
  console.log('='.repeat(80));

  const latestRowRes = await db.query(`
    SELECT ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr,
      COUNT(*) AS inv
    FROM (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      ORDER BY "Invoice_No_", row_id DESC
    ) deduped
  `, [DATE_FROM, DATE_TO]);

  console.log(`\n  DISTINCT ON latest row_id: ${latestRowRes.rows[0].inv} inv | ${latestRowRes.rows[0].net_cr} Cr | diff from 3.4010: ${(parseFloat(latestRowRes.rows[0].net_cr)-3.4010).toFixed(4)}`);

  // ── CHECK H: Full status breakdown for URIMP Dec (Status IN all values) ─────
  console.log('\n' + '='.repeat(80));
  console.log('H — URIMP Dec 2024: COMPLETE status breakdown per Invoice_Type');
  console.log('='.repeat(80));

  const fullStatus = await db.query(`
    SELECT "Status_", "Invoice_Type_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Status_", "Invoice_Type_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_No_", "Status_", "Invoice_Type_"
    ) sub
    GROUP BY "Status_", "Invoice_Type_"
    ORDER BY "Status_", net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Status           | Type                    | Inv | Net Cr');
  console.log('  ' + '-'.repeat(65));
  let expTotal = 0;
  let expRevTotal = 0;
  for (const r of fullStatus.rows) {
    if (r['Status_'] === 'Exported To GL') expTotal += parseFloat(r.net_cr);
    if (['Exported To GL','Reverted'].includes(r['Status_'])) expRevTotal += parseFloat(r.net_cr);
    console.log(`  ${r['Status_'].padEnd(17)}| ${(r['Invoice_Type_']||'').padEnd(23)} | ${String(r.inv).padEnd(4)}| ${r.net_cr}`);
  }
  console.log(`\n  Sum Exported To GL only: ${expTotal.toFixed(4)} Cr`);
  console.log(`  Sum Exported + Reverted: ${expRevTotal.toFixed(4)} Cr`);
  console.log(`  CRD: 3.4010 | Gap: ${(expTotal-3.4010).toFixed(4)}`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
