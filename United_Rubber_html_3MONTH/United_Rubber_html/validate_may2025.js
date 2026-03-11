'use strict';
const XLSX = require('xlsx');
const db   = require('./db/connection');
const { buildTrendCTE, AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, C } = require('./services/queryBuilder');

async function analyseMonth(fileName, month, dateFrom, dateTo) {
  const wb   = XLSX.readFile(`./validation_month_csv/${fileName}`);
  const data = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '', raw: false });
  const num  = v => parseFloat((v || '0').replace(/,/g, '')) || 0;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`CRD FILE: ${fileName}  |  Month: ${month}`);
  console.log('='.repeat(70));
  console.log(`Total rows: ${data.length}`);

  // Invoice types in CRD
  const types = [...new Set(data.map(r => r['Invoice Type']).filter(Boolean))];
  console.log('Invoice Types in CRD file:', types.join(', '));

  // Unique invoices per site
  const crdBySite = {};
  const crdAllInvs = new Set();
  for (const r of data) {
    const site = r['Site'];
    const inv  = r['Invoice No'];
    const amt  = num(r['Item Amount']);
    if (!site || !inv) continue;
    if (!crdBySite[site]) crdBySite[site] = { amt: 0, net: 0, invSet: new Set() };
    crdBySite[site].amt += amt;
    crdBySite[site].net += num(r['Item Net Amount']);
    crdBySite[site].invSet.add(inv);
    crdAllInvs.add(inv);
  }

  const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];
  console.log(`\nCRD totals (all rows, Sales Commercial):`);
  let crdTotal = 0;
  for (const s of sites) {
    const v = crdBySite[s];
    if (!v) { console.log(`  ${s}: not in file`); continue; }
    console.log(`  ${s}: ${v.invSet.size} invoices | Item_Amount = ${(v.amt/1e7).toFixed(4)} Cr`);
    crdTotal += v.amt;
  }
  console.log(`  TOTAL: ${crdAllInvs.size} invoices | ${(crdTotal/1e7).toFixed(4)} Cr`);

  // ── DB: Status=Exported To GL, ALL types (universal formula) ─────────
  const fAll = { status: 'Exported To GL', dateFrom, dateTo };
  const { cte: cteAll, values: vAll } = buildTrendCTE(fAll);
  const dbAll = await db.query(
    `${cteAll}
     SELECT COALESCE("${C.site}",'?') AS site,
       ROUND(SUM(${AMOUNT_NET_EXPR})/1e7,4) AS net_cr,
       COUNT(*) AS invoices
     FROM deduped
     WHERE "${C.invoiceDate}" >= '${dateFrom}' AND "${C.invoiceDate}" <= '${dateTo}'
       AND "${C.site}" IN ('URIMH','URIMP','URIPB','URIPU')
     GROUP BY site ORDER BY site`, vAll
  );

  console.log(`\n--- Dashboard (Exported To GL, ALL types) vs CRD ---`);
  let dbAllTotal = 0;
  for (const r of dbAll.rows) {
    const crdAmt = crdBySite[r.site] ? crdBySite[r.site].amt / 1e7 : 0;
    const diff   = (parseFloat(r.net_cr) - crdAmt).toFixed(4);
    console.log(`  ${r.site}: DB=${r.net_cr} Cr | CRD=${crdAmt.toFixed(4)} Cr | diff=${diff} | inv=${r.invoices}`);
    dbAllTotal += parseFloat(r.net_cr);
  }
  console.log(`  TOTAL: DB=${dbAllTotal.toFixed(4)} Cr | CRD=${(crdTotal/1e7).toFixed(4)} Cr | diff=${(dbAllTotal - crdTotal/1e7).toFixed(4)}`);

  // ── Invoice type breakdown in DB for this month ───────────────────────
  const typeRes = await db.query(`
    SELECT "Invoice_Type_" AS type,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Invoice_Type_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
      GROUP BY "Invoice_No_", "Invoice_Type_"
    ) sub
    GROUP BY "Invoice_Type_" ORDER BY net_cr DESC
  `, [dateFrom, dateTo]);

  console.log(`\n--- DB Invoice Type Breakdown (Exported To GL, domestic) ---`);
  for (const r of typeRes.rows) {
    console.log(`  "${r.type}": ${r.invoices} invoices | ${r.net_cr} Cr`);
  }

  // ── Check CRD invoices status in DB ──────────────────────────────────
  const crdInvList = [...crdAllInvs];
  const dbStatus = await db.query(`
    SELECT "Invoice_No_",
      ARRAY_AGG(DISTINCT "Status_") AS statuses,
      MAX("Site_") AS site
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" = ANY($1) AND "Invoice_No_" NOT LIKE '%-R'
    GROUP BY "Invoice_No_"
  `, [crdInvList]);

  const statusMap = {};
  for (const r of dbStatus.rows) statusMap[r['Invoice_No_']] = r.statuses;

  const notExported = crdInvList.filter(inv => statusMap[inv] && !statusMap[inv].includes('Exported To GL'));
  const missing     = crdInvList.filter(inv => !statusMap[inv]);

  console.log(`\n--- CRD Invoice Status Check ---`);
  console.log(`  Total CRD invoices: ${crdInvList.length}`);
  console.log(`  Exported To GL in DB: ${crdInvList.length - notExported.length - missing.length}`);
  console.log(`  Other status (not exported): ${notExported.length}`);
  console.log(`  Not found in DB: ${missing.length}`);

  if (notExported.length > 0) {
    const bySt = {};
    for (const inv of notExported) {
      const st = (statusMap[inv] || []).join(',');
      if (!bySt[st]) bySt[st] = { count: 0 };
      bySt[st].count++;
    }
    console.log(`  Status breakdown of non-exported:`);
    for (const [st, v] of Object.entries(bySt)) console.log(`    "${st}": ${v.count} invoices`);
    console.log(`  Sample: ${notExported.slice(0,5).join(', ')}`);
  }
  if (missing.length > 0) {
    console.log(`  Missing from DB: ${missing.slice(0,5).join(', ')}`);
  }

  // ── Sales Return contribution for this month ──────────────────────────
  const retRes = await db.query(`
    SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7,4) AS net_cr
    FROM (
      SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" = 'Sales Return'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
      GROUP BY "Invoice_No_"
    ) sub
  `, [dateFrom, dateTo]);
  const ret = retRes.rows[0];
  console.log(`\n--- Sales Return invoices (reducing the total) ---`);
  console.log(`  ${ret.inv} return invoices | net = ${ret.net_cr} Cr`);
  console.log(`  Dashboard total + returns = ${(dbAllTotal + Math.abs(parseFloat(ret.net_cr))).toFixed(4)} Cr (= Sales Comm if all returns excluded)`);
}

(async () => {
  try {
    await analyseMonth('Apr_2025.xlsx', 'April 2025', '2025-04-01', '2025-04-30');
    await analyseMonth('May_2025.xlsx', 'May 2025',   '2025-05-01', '2025-05-31');

    // ── Side-by-side root cause comparison ───────────────────────────────
    console.log(`\n${'='.repeat(70)}`);
    console.log('ROOT CAUSE COMPARISON — APR 2025 vs MAY 2025');
    console.log('='.repeat(70));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
