'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // ── CHECK A: PINV/242512558 per-partition status — was it ever Exported in w1?
  console.log('='.repeat(80));
  console.log('A — PINV/242512558 per-partition: was it Exported in any partition?');
  console.log('='.repeat(80));

  const pRes = await db.query(`
    SELECT "Invoice_No_", src_table, "Status_",
      CAST("Amount_" AS NUMERIC) AS amt,
      TO_CHAR("Created_Date"::TIMESTAMP,'YYYY-MM-DD HH24:MI') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" IN ('PINV/242512558','PINV/242512558-R')
    ORDER BY "Invoice_No_", src_table
  `);
  for (const r of pRes.rows) {
    const flag = r['Status_'] === 'Exported To GL' && !r['Invoice_No_'].endsWith('-R') ? ' ← EXPORTED (positive)' : '';
    console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r.src_table.padEnd(38)} | ${r['Status_'].padEnd(18)} | amt=${r.amt} | created=${r.created}${flag}`);
  }

  // ── CHECK B: URIMH Reverted Transfer invoices (STO) — per-partition status ──
  console.log('\n' + '='.repeat(80));
  console.log('B — URIMH Reverted Transfer (STO) invoices per-partition');
  console.log('='.repeat(80));

  const stoRes = await db.query(`
    SELECT "Invoice_No_", src_table, "Status_",
      CAST("Amount_" AS NUMERIC) AS amt,
      TO_CHAR("Created_Date"::TIMESTAMP,'YYYY-MM-DD HH24:MI') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_Type_" = 'Transfer'
      AND "Status_" = 'Reverted'
    ORDER BY "Invoice_No_", src_table
  `, [DATE_FROM, DATE_TO]);

  let lastInv = '';
  for (const r of stoRes.rows) {
    if (r['Invoice_No_'] !== lastInv) {
      console.log(`\n  ${r['Invoice_No_']} | amt=${(r.amt/1e7).toFixed(6)} Cr`);
      lastInv = r['Invoice_No_'];
    }
    console.log(`    ${r.src_table} | ${r['Status_']} | created=${r.created}`);
  }

  // ── CHECK C: URIMH Approved STO/242502907 and STO/242502762 per-partition ──
  console.log('\n' + '='.repeat(80));
  console.log('C — Approved STO invoices (exact match pair): per-partition history');
  console.log('='.repeat(80));

  const stoAppRes = await db.query(`
    SELECT "Invoice_No_", src_table, "Status_",
      CAST("Amount_" AS NUMERIC) AS amt,
      TO_CHAR("Created_Date"::TIMESTAMP,'YYYY-MM-DD HH24:MI') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" IN ('STO/242502907','STO/242502762')
    ORDER BY "Invoice_No_", src_table
  `);

  lastInv = '';
  for (const r of stoAppRes.rows) {
    if (r['Invoice_No_'] !== lastInv) {
      console.log(`\n  ${r['Invoice_No_']} | amt=${(r.amt/1e7).toFixed(6)} Cr`);
      lastInv = r['Invoice_No_'];
    }
    const flag = r['Status_'] === 'Exported To GL' ? ' ← EXPORTED' : '';
    console.log(`    ${r.src_table} | ${r['Status_']} | created=${r.created}${flag}`);
  }

  // ── CHECK D: URIMP — all Exported invoices per-partition (which partitions see PINV/242512558 as Exported?) ──
  console.log('\n' + '='.repeat(80));
  console.log('D — URIMP Exported To GL per-partition total (does any partition include PINV/242512558?)');
  console.log('='.repeat(80));

  const urimpPartRes = await db.query(`
    SELECT src_table,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr,
      MAX(CASE WHEN "Invoice_No_" = 'PINV/242512558' THEN 1 ELSE 0 END) AS has_target
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

  for (const r of urimpPartRes.rows) {
    const diff = (parseFloat(r.net_cr) - 3.4010).toFixed(4);
    const target = r.has_target == 1 ? ' ← INCLUDES PINV/242512558' : '';
    console.log(`  ${r.src_table}: ${r.inv} inv | ${r.net_cr} Cr | diff from CRD 3.4010: ${diff}${target}`);
  }

  // ── CHECK E: URIMP boundary dates — invoices dated Nov/Jan near boundary ──
  console.log('\n' + '='.repeat(80));
  console.log('E — URIMP Exported invoices by Invoice_Date month (Nov 2024 - Jan 2025)');
  console.log('='.repeat(80));

  const dateRangeRes = await db.query(`
    SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Invoice_Date_(Date)",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN '2024-11-25' AND '2025-01-10'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    ) sub
    GROUP BY month ORDER BY month
  `);

  for (const r of dateRangeRes.rows) {
    const mark = r.month === '2024-12' ? ' ← current filter' : '';
    console.log(`  ${r.month}: ${r.inv} inv | ${r.net_cr} Cr${mark}`);
  }

  // ── CHECK F: What if we use Invoice_Date_(Date) BETWEEN Nov 25 - Jan 10 for URIMP?
  const extendedRes = await db.query(`
    SELECT ROUND(SUM(sub.net)/1e7, 4) AS net_cr,
      COUNT(DISTINCT "Invoice_No_") AS inv
    FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN '2024-11-25' AND '2025-01-10'
      GROUP BY "Invoice_No_"
    ) sub
  `);
  console.log(`\n  URIMP total with extended Nov25-Jan10 date range: ${extendedRes.rows[0].net_cr} Cr | diff from 3.4010: ${(parseFloat(extendedRes.rows[0].net_cr)-3.4010).toFixed(4)}`);

  // ── CHECK G: URIMP Reverted full detail with -R document status ─────────────
  console.log('\n' + '='.repeat(80));
  console.log('G — ALL URIMP Reverted invoices: do all have a -R doc? What status are -R docs?');
  console.log('='.repeat(80));

  const urimpRevDetail = await db.query(`
    SELECT orig."Invoice_No_", orig."Invoice_Type_",
      ROUND(CAST(orig."Amount_" AS NUMERIC)/1e7, 6) AS net_cr,
      orig."Invoice_Date_(Date)",
      TO_CHAR(orig."Created_Date"::TIMESTAMP,'YYYY-MM-DD HH24:MI') AS orig_created,
      rev."Invoice_No_" AS rev_no,
      rev."Status_" AS rev_status,
      ROUND(CAST(rev."Amount_" AS NUMERIC)/1e7, 6) AS rev_cr,
      TO_CHAR(rev."Created_Date"::TIMESTAMP,'YYYY-MM-DD HH24:MI') AS rev_created
    FROM (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Invoice_Type_",
        "Amount_", "Invoice_Date_(Date)", "Created_Date"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Reverted'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Invoice_Type_" != '0'
      ORDER BY "Invoice_No_", row_id DESC
    ) orig
    LEFT JOIN (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Status_", "Amount_", "Created_Date"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" LIKE '%-R'
      ORDER BY "Invoice_No_", row_id DESC
    ) rev ON rev."Invoice_No_" = orig."Invoice_No_" || '-R'
    ORDER BY orig.net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  let revTotal = 0;
  console.log('\n  Invoice_No_              | Net Cr    | -R Status        | -R Cr');
  console.log('  ' + '-'.repeat(75));
  for (const r of urimpRevDetail.rows) {
    revTotal += parseFloat(r.net_cr);
    const revInfo = r.rev_no
      ? `${r.rev_status.padEnd(17)}| ${r.rev_cr} | created ${r.rev_created}`
      : 'NO -R DOC FOUND';
    console.log(`  ${r['Invoice_No_'].padEnd(25)}| ${String(r.net_cr).padEnd(10)}| ${revInfo}`);
  }
  console.log(`\n  URIMP Reverted total: ${revTotal.toFixed(6)} Cr`);
  console.log(`  If CRD includes ALL Reverted: 3.3410 + ${revTotal.toFixed(4)} = ${(3.3410 + revTotal).toFixed(4)} vs CRD 3.4010`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
