'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // ── KEY CHECK 1: Does Jan 2025 ETL partition contain Dec-dated invoices? ─
  // If invoices with Dec dates only got "Exported To GL" in January,
  // our frozen Dec partitions (w1-w4) would show them as "Approved"
  // but Jan ETL would capture them as "Exported"
  console.log('='.repeat(75));
  console.log('KEY CHECK 1 — Dec-dated invoices found in JAN 2025 partitions');
  console.log('='.repeat(75));
  const janDecRes = await db.query(`
    SELECT "src_table", "Status_", "Site_",
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "src_table", "Status_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "src_table" LIKE '%2025_jan%'
      GROUP BY "Invoice_No_", "src_table", "Status_", "Site_"
    ) sub
    GROUP BY "src_table", "Status_", "Site_"
    ORDER BY "src_table", "Status_", "Site_"
  `, [DATE_FROM, DATE_TO]);

  if (janDecRes.rows.length === 0) {
    console.log('  No Dec-dated invoices found in Jan 2025 partitions.');
  } else {
    for (const r of janDecRes.rows) {
      console.log(`  ${r.src_table} | ${r['Status_']} | ${r['Site_']} | ${r.invoices} inv | ${r.net_cr} Cr`);
    }
  }

  // ── KEY CHECK 2: Dec invoices in Jan partitions that are Exported To GL ─
  console.log('\n' + '='.repeat(75));
  console.log('KEY CHECK 2 — Dec-dated invoices Exported To GL in JAN partitions but APPROVED in Dec partitions');
  console.log('='.repeat(75));
  const lateExportRes = await db.query(`
    SELECT jan."Invoice_No_", jan."Site_", jan."Invoice_Type_", jan."Status_" AS jan_status,
      dec_status.status AS dec_status,
      ROUND(SUM(DISTINCT CAST(jan."Amount_" AS NUMERIC))/1e7, 6) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all" jan
    LEFT JOIN (
      SELECT "Invoice_No_", MAX("Status_") AS status
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "src_table" LIKE '%2024_dec%'
      GROUP BY "Invoice_No_"
    ) dec_status ON dec_status."Invoice_No_" = jan."Invoice_No_"
    WHERE jan."Invoice_No_" NOT LIKE '%-R'
      AND jan."Invoice_Type_" != '0'
      AND jan."Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND jan."Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND jan."src_table" LIKE '%2025_jan%'
      AND jan."Status_" = 'Exported To GL'
      AND (dec_status.status IS NULL OR dec_status.status != 'Exported To GL')
    GROUP BY jan."Invoice_No_", jan."Site_", jan."Invoice_Type_", jan."Status_", dec_status.status
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  console.log(`  Found: ${lateExportRes.rows.length} invoices — Dec-dated, Exported in Jan partition but NOT Exported in Dec partitions`);
  let lateTotal = 0;
  const lateBySite = {};
  for (const r of lateExportRes.rows) {
    lateTotal += parseFloat(r.net_cr);
    if (!lateBySite[r['Site_']]) lateBySite[r['Site_']] = { count: 0, total: 0 };
    lateBySite[r['Site_']].count++;
    lateBySite[r['Site_']].total += parseFloat(r.net_cr);
    console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r['Site_']} | ${(r['Invoice_Type_']||'').padEnd(22)} | dec_status=${r.dec_status||'NOT IN DEC'} | ${r.net_cr} Cr`);
  }
  console.log(`\n  TOTAL late-exported: ${lateTotal.toFixed(4)} Cr`);
  console.log('  By site:');
  for (const [s,v] of Object.entries(lateBySite)) {
    console.log(`    ${s}: ${v.count} inv | ${v.total.toFixed(4)} Cr`);
  }

  // ── KEY CHECK 3: PINV/242512558-R reversal document ──────────────────
  console.log('\n' + '='.repeat(75));
  console.log('KEY CHECK 3 — PINV/242512558-R reversal document history');
  console.log('='.repeat(75));
  const revDocRes = await db.query(`
    SELECT "Invoice_No_", "src_table", "Status_", "Invoice_Type_",
      CAST("Amount_" AS NUMERIC) AS amount,
      "Invoice_Date_(Date)", "Created_Date"
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" LIKE 'PINV/242512558%'
    ORDER BY "Invoice_No_", "src_table"
  `);
  let lastI = '';
  for (const r of revDocRes.rows) {
    if (r['Invoice_No_'] !== lastI) { console.log(`\n  ${r['Invoice_No_']}`); lastI = r['Invoice_No_']; }
    console.log(`    ${r.src_table} | ${r['Status_']} | Amount=${r.amount} | Date=${r['Invoice_Date_(Date)']} | Created=${r['Created_Date']}`);
  }

  // ── KEY CHECK 4: If we include late-exported invoices, does it match? ─
  console.log('\n' + '='.repeat(75));
  console.log('KEY CHECK 4 — Add late-exported Dec invoices to our current total');
  console.log('='.repeat(75));
  const currentTotal = 14.1496;
  const CRD_TOTAL    = 14.22;
  console.log(`  Current formula total  : ${currentTotal} Cr`);
  console.log(`  Late-exported invoices : +${lateTotal.toFixed(4)} Cr`);
  console.log(`  Combined               : ${(currentTotal + lateTotal).toFixed(4)} Cr`);
  console.log(`  CRD Reference          : ${CRD_TOTAL} Cr`);
  console.log(`  Remaining gap          : ${(currentTotal + lateTotal - CRD_TOTAL).toFixed(4)} Cr`);

  // ── KEY CHECK 5: Invoice creation dates for Dec Approved invoices ────
  console.log('\n' + '='.repeat(75));
  console.log('KEY CHECK 5 — When were Dec Approved invoices created vs when did they get exported?');
  console.log('='.repeat(75));
  const approvedCreated = await db.query(`
    SELECT TO_CHAR("Created_Date"::DATE,'YYYY-MM-DD') AS created,
      "Invoice_Type_", "Site_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Approved'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_Type_" != '0'
    GROUP BY created, "Invoice_Type_", "Site_"
    ORDER BY created DESC
    LIMIT 20
  `, [DATE_FROM, DATE_TO]);

  console.log('  Created Date | Site  | Type                   | Inv | Net Cr');
  console.log('  ' + '-'.repeat(65));
  for (const r of approvedCreated.rows) {
    console.log(`  ${r.created} | ${r['Site_']} | ${(r['Invoice_Type_']||'').padEnd(22)} | ${String(r.inv).padEnd(4)}| ${r.net_cr}`);
  }

  // ── KEY CHECK 6: URIMP specific — what if it's a Sales Return issue? ─
  console.log('\n' + '='.repeat(75));
  console.log('KEY CHECK 6 — URIMP Dec 2024: ALL invoice types exported vs not exported');
  console.log('='.repeat(75));
  const urimpDetail = await db.query(`
    SELECT "Invoice_Type_", "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Invoice_Type_", "Status_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_No_", "Invoice_Type_", "Status_"
    ) sub
    GROUP BY "Invoice_Type_", "Status_"
    ORDER BY "Invoice_Type_", "Status_"
  `, [DATE_FROM, DATE_TO]);

  let urimpExported = 0;
  for (const r of urimpDetail.rows) {
    const mark = r['Status_'] === 'Exported To GL' ? '← counted' : '';
    if (r['Status_'] === 'Exported To GL') urimpExported += parseFloat(r.net_cr);
    console.log(`  "${r['Invoice_Type_'].padEnd(22)}" | ${r['Status_'].padEnd(16)} | ${String(r.inv).padEnd(5)}| ${r.net_cr} Cr  ${mark}`);
  }
  console.log(`\n  URIMP Exported total: ${urimpExported.toFixed(4)} Cr | CRD est: 3.4010 Cr | gap: ${(urimpExported - 3.4010).toFixed(4)} Cr`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
