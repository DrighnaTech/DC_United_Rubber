'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';
  const CRD_URIMH = 8.8943;
  const CRD_URIMP = 3.4010;
  const CRD_TOTAL = 14.22;
  const SITES     = ['URIMH','URIMP','URIPB','URIPU'];

  // ── STATUS FLOW explanation from actual DB data ───────────────────────
  console.log('='.repeat(75));
  console.log('STATUS FLOW — from actual DB data for Dec 2024');
  console.log('='.repeat(75));
  const flowRes = await db.query(`
    SELECT "Status_",
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_No_" NOT LIKE '%-R'
    GROUP BY "Status_" ORDER BY
      CASE "Status_"
        WHEN 'Open'           THEN 1
        WHEN 'Approved'       THEN 2
        WHEN 'Released'       THEN 3
        WHEN 'Exported To GL' THEN 4
        WHEN 'Reverted'       THEN 5
        WHEN 'Rejected'       THEN 6
        WHEN 'Cancelled'      THEN 7
        ELSE 8 END
  `, [DATE_FROM, DATE_TO]);

  console.log('\nStatus           | Invoices | Net Cr   | Meaning');
  console.log('-'.repeat(75));
  for (const r of flowRes.rows) {
    const meaning = {
      'Open':           'Created, not yet approved',
      'Approved':       'Manager approved, waiting GL export',
      'Released':       'Released for GL posting',
      'Exported To GL': 'Posted to General Ledger ← CRD counts this',
      'Reverted':       'GL entry reversed after export (original becomes Reverted)',
      'Rejected':       'Invoice rejected, not posted',
      'Cancelled':      'Invoice cancelled before GL',
      '0':              'Metadata/header row',
    }[r['Status_']] || '-';
    console.log(`${r['Status_'].padEnd(17)}| ${String(r.invoices).padEnd(9)}| ${String(r.net_cr).padEnd(9)}| ${meaning}`);
  }
  console.log('\nFlow: Open → Approved → Released → Exported To GL');
  console.log('      If reversed after GL: Exported To GL → Reverted (+creates a -R document, excluded by filter)');

  // ── APPROACH 1: Check PINV/242512558 partition history ────────────────
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 1 — PINV/242512558 full partition history (URIMP key invoice)');
  console.log('='.repeat(75));
  const invHist = await db.query(`
    SELECT "src_table", "Status_", "Invoice_Type_",
      CAST("Amount_" AS NUMERIC) AS amount,
      CAST("Invoice_Amount_" AS NUMERIC) AS gross,
      "Invoice_Date_(Date)"
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" = 'PINV/242512558'
    ORDER BY "src_table"
  `);
  for (const r of invHist.rows) {
    console.log(`  ${r.src_table} | Status=${r['Status_']} | Amount=${r.amount} | Gross=${r.gross} | Date=${r['Invoice_Date_(Date)']}`);
  }

  // ── APPROACH 2: Different amount columns for Dec 2024 ─────────────────
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 2 — Different amount columns vs CRD');
  console.log('='.repeat(75));
  const colRes = await db.query(`
    SELECT
      ROUND(SUM(DISTINCT CAST("Amount_"            AS NUMERIC))/1e7,4) AS net_amount_cr,
      ROUND(SUM(DISTINCT CAST("Invoice_Amount_"    AS NUMERIC))/1e7,4) AS invoice_amount_cr,
      ROUND(SUM(DISTINCT CAST("Final_Net_Amount_"  AS NUMERIC))/1e7,4) AS final_net_cr,
      ROUND(SUM(DISTINCT CAST("Net_Amount_"        AS NUMERIC))/1e7,4) AS net_amount2_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
  `, [DATE_FROM, DATE_TO]);
  const cr = colRes.rows[0];
  console.log(`  Amount_ (net)         : ${cr.net_amount_cr} Cr | diff=${(parseFloat(cr.net_amount_cr)-CRD_TOTAL).toFixed(4)}`);
  console.log(`  Invoice_Amount_ (gross): ${cr.invoice_amount_cr} Cr | diff=${(parseFloat(cr.invoice_amount_cr)-CRD_TOTAL).toFixed(4)}`);
  console.log(`  Final_Net_Amount_      : ${cr.final_net_cr} Cr | diff=${(parseFloat(cr.final_net_cr)-CRD_TOTAL).toFixed(4)}`);
  console.log(`  Net_Amount_            : ${cr.net_amount2_cr} Cr | diff=${(parseFloat(cr.net_amount2_cr)-CRD_TOTAL).toFixed(4)}`);

  // ── APPROACH 3: Date range variation — what if some Dec invoices dated Nov/Jan? ──
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 3 — Date range check: invoices near boundary');
  console.log('='.repeat(75));
  const dateCheck = await db.query(`
    SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN '2024-11-25' AND '2025-01-10'
    GROUP BY month ORDER BY month
  `);
  for (const r of dateCheck.rows) {
    const mark = r.month === '2024-12' ? ' ← current Dec filter' : '';
    console.log(`  ${r.month}: ${r.invoices} inv | ${r.net_cr} Cr${mark}`);
  }

  // ── APPROACH 4: Per-partition dedup — which snapshot matches CRD? ─────
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 4 — Per-partition total: which snapshot is closest to CRD?');
  console.log('='.repeat(75));
  const partSnapRes = await db.query(`
    SELECT p.src_table,
      COUNT(DISTINCT p."Invoice_No_") AS invoices,
      ROUND(SUM(DISTINCT CAST(p."Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all" p
    WHERE p."Invoice_No_" NOT LIKE '%-R'
      AND p."Status_" = 'Exported To GL'
      AND p."Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND p."Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY p.src_table ORDER BY p.src_table
  `, [DATE_FROM, DATE_TO]);

  console.log('  src_table (partition)        | Invoices | Net Cr  | Diff from CRD');
  console.log('  ' + '-'.repeat(65));
  for (const r of partSnapRes.rows) {
    const diff = (parseFloat(r.net_cr)-CRD_TOTAL).toFixed(4);
    const mark = Math.abs(parseFloat(r.net_cr)-CRD_TOTAL)<0.1?'← close':'';
    console.log(`  ${r.src_table.padEnd(30)}| ${String(r.invoices).padEnd(9)}| ${String(r.net_cr).padEnd(8)}| ${diff}  ${mark}`);
  }

  // ── APPROACH 5: Cumulative partitions (w1, w1+w2, w1+w2+w3, all) ─────
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 5 — Cumulative partitions deduped');
  console.log('='.repeat(75));
  const cumParts = ['2024_dec_w1','2024_dec_w2','2024_dec_w3','2024_dec_w4'];
  for (let i=1; i<=cumParts.length; i++) {
    const partList = cumParts.slice(0,i).map(p=>`'mf_sales_si_siheader_${p}'`).join(',');
    const cumRes = await db.query(`
      SELECT COUNT(DISTINCT "Invoice_No_") AS invoices,
        ROUND(SUM(sub.net)/1e7,4) AS net_cr
      FROM (
        SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
          AND "src_table" IN (${partList})
        GROUP BY "Invoice_No_"
      ) sub
    `, [DATE_FROM, DATE_TO]);
    const cr2 = cumRes.rows[0];
    const diff = (parseFloat(cr2.net_cr)-CRD_TOTAL).toFixed(4);
    const mark = Math.abs(parseFloat(cr2.net_cr)-CRD_TOTAL)<0.02 ? '✓ MATCHES CRD' : '';
    console.log(`  Using ${cumParts.slice(0,i).join('+')}:`);
    console.log(`    ${cr2.invoices} inv | ${cr2.net_cr} Cr | diff=${diff} ${mark}`);
  }

  // ── APPROACH 6: Per-site per-partition for URIMH and URIMP ───────────
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 6 — Per-site per-partition breakdown');
  console.log('='.repeat(75));
  for (const site of ['URIMH','URIMP']) {
    console.log(`\n  ${site} (CRD = ${site==='URIMH'?CRD_URIMH:CRD_URIMP} Cr):`);
    const sitePartRes = await db.query(`
      SELECT p.src_table,
        COUNT(DISTINCT p."Invoice_No_") AS invoices,
        ROUND(SUM(sub.net)/1e7,4) AS net_cr
      FROM (
        SELECT "Invoice_No_","src_table",SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
        GROUP BY "Invoice_No_","src_table"
      ) sub
      JOIN "LandingStage2"."mf_sales_si_siheader_all" p
        ON p."Invoice_No_" = sub."Invoice_No_"
        AND p."src_table" = sub.src_table
      GROUP BY p.src_table ORDER BY p.src_table
    `, [site, DATE_FROM, DATE_TO]);
    const crdSite = site==='URIMH'?CRD_URIMH:CRD_URIMP;
    for (const r of sitePartRes.rows) {
      const diff = (parseFloat(r.net_cr)-crdSite).toFixed(4);
      const mark = Math.abs(parseFloat(r.net_cr)-crdSite)<0.02?'← close CRD':'';
      console.log(`    ${r.src_table}: ${r.invoices} inv | ${r.net_cr} Cr | diff=${diff} ${mark}`);
    }
  }

  // ── APPROACH 7: Check if -R invoices contribute anything ─────────────
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 7 — Impact of -R invoices (if included)');
  console.log('='.repeat(75));
  const rRes = await db.query(`
    SELECT "Site_" AS site, COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);
  let rTotal = 0;
  for (const r of rRes.rows) {
    rTotal += parseFloat(r.net_cr);
    console.log(`  ${r.site}: ${r.inv} -R invoices | ${r.net_cr} Cr`);
  }
  console.log(`  Total -R: ${rTotal.toFixed(4)} Cr | If included with current: ${(14.1496+rTotal).toFixed(4)} Cr`);

  // ── APPROACH 8: Exact SUM(DISTINCT) vs DISTINCT ON latest row ────────
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 8 — SUM(DISTINCT) vs DISTINCT ON latest row_id (dedup method)');
  console.log('='.repeat(75));
  const latestRowRes = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Site_", "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      ORDER BY "Invoice_No_", "row_id" DESC
    ) deduped
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);
  let latestTotal = 0;
  console.log('  DISTINCT ON latest row_id:');
  for (const r of latestRowRes.rows) {
    latestTotal += parseFloat(r.net_cr);
    const crdSite = r.site==='URIMH'?CRD_URIMH:r.site==='URIMP'?CRD_URIMP:null;
    const siteDiff = crdSite ? ` | site diff=${(parseFloat(r.net_cr)-crdSite).toFixed(4)}` : '';
    console.log(`  ${r.site}: ${r.invoices} inv | ${r.net_cr} Cr${siteDiff}`);
  }
  console.log(`  TOTAL: ${latestTotal.toFixed(4)} Cr | diff from CRD=${(latestTotal-CRD_TOTAL).toFixed(4)}`);

  // ── APPROACH 9: Check PINV/242512558 — was it ever Exported in any partition? ──
  console.log('\n' + '='.repeat(75));
  console.log('APPROACH 9 — Was PINV/242512558 EVER Exported To GL in any partition?');
  console.log('='.repeat(75));
  const keyInv = await db.query(`
    SELECT "src_table", "Status_", "Invoice_No_",
      CAST("Amount_" AS NUMERIC) AS amount,
      "Invoice_Date_(Date)", "Invoice_Type_"
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" IN ('PINV/242512558','PINV/242511985')
    ORDER BY "Invoice_No_", "src_table"
  `);
  let lastInv = '';
  for (const r of keyInv.rows) {
    if (r['Invoice_No_'] !== lastInv) { console.log(`\n  Invoice: ${r['Invoice_No_']}`); lastInv = r['Invoice_No_']; }
    console.log(`    ${r.src_table} | Status=${r['Status_']} | Amount=${r.amount} | Date=${r['Invoice_Date_(Date)']}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
