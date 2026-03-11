'use strict';
const XLSX = require('xlsx');
const db   = require('./db/connection');
const { buildTrendCTE, AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, C } = require('./services/queryBuilder');

(async () => {
  try {
    const num = v => parseFloat((v || '0').replace(/,/g, '')) || 0;
    const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];

    // ══════════════════════════════════════════════════════════════
    // STEP 1 — Parse CRD file (Jul_2025.xlsx)
    // ══════════════════════════════════════════════════════════════
    const wb   = XLSX.readFile('./Validation_Month_csv/Jul_2025.xlsx');
    const data = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '', raw: false });
    console.log('CRD rows:', data.length);

    // Headers
    const headers = Object.keys(data[0]);
    console.log('Columns:', headers.join(' | '));

    // Invoice types
    const types = [...new Set(data.map(r => r['Invoice Type']).filter(Boolean))];
    console.log('Invoice Types in CRD:', types.join(', '));

    // Aggregate by site (all rows)
    const crdBySite = {};
    const crdInvoices = {};
    for (const r of data) {
      const site = r['Site'];
      const inv  = r['Invoice No'];
      const amt  = num(r['Item Amount']);
      const net  = num(r['Item Net Amount']);
      if (!site || !inv) continue;

      if (!crdBySite[site]) crdBySite[site] = { amt: 0, net: 0, invSet: new Set() };
      crdBySite[site].amt += amt;
      crdBySite[site].net += net;
      crdBySite[site].invSet.add(inv);

      if (!crdInvoices[inv]) crdInvoices[inv] = { site, type: r['Invoice Type'], amt: 0, net: 0 };
      crdInvoices[inv].amt += amt;
      crdInvoices[inv].net += net;
    }

    console.log('\n=== CRD Jul 2025 — Per Site ===');
    let crdTotalAmt = 0, crdTotalNet = 0;
    for (const s of sites) {
      const v = crdBySite[s] || { amt: 0, net: 0, invSet: new Set() };
      console.log(`  ${s}: ${v.invSet.size} inv | Item_Amount=${(v.amt/1e7).toFixed(4)} Cr | Item_NetAmount=${(v.net/1e7).toFixed(4)} Cr`);
      crdTotalAmt += v.amt;
      crdTotalNet += v.net;
    }
    console.log(`  TOTAL: ${Object.keys(crdInvoices).length} inv | Item_Amount=${(crdTotalAmt/1e7).toFixed(4)} Cr`);

    // ══════════════════════════════════════════════════════════════
    // STEP 2 — DB: buildTrendCTE, Status=Exported To GL (dashboard default)
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== DB Jul 2025 — buildTrendCTE, Exported To GL ===');
    const fExp = { status: 'Exported To GL', dateFrom: '2025-07-01', dateTo: '2025-07-31' };
    const { cte: cteExp, values: vExp } = buildTrendCTE(fExp);

    const dbExp = await db.query(
      `${cteExp}
       SELECT COALESCE("${C.site}",'?') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr,
         ROUND(SUM(${AMOUNT_GROSS_EXPR})/1e7, 4) AS gross_cr,
         COUNT(*) AS invoices
       FROM deduped
       WHERE "${C.invoiceDate}" >= '2025-07-01' AND "${C.invoiceDate}" <= '2025-07-31'
         AND "${C.site}" IN ('URIMH','URIMP','URIPB','URIPU')
       GROUP BY site ORDER BY site`, vExp
    );

    let dbExpTotal = 0;
    for (const r of dbExp.rows) {
      const crdAmt = crdBySite[r.site] ? crdBySite[r.site].amt / 1e7 : 0;
      const diff = (parseFloat(r.net_cr) - crdAmt).toFixed(4);
      console.log(`  ${r.site}: DB=${r.net_cr} Cr | CRD=${crdAmt.toFixed(4)} Cr | diff=${diff} | inv=${r.invoices}`);
      dbExpTotal += parseFloat(r.net_cr);
    }
    console.log(`  TOTAL: DB=${dbExpTotal.toFixed(4)} Cr | CRD=${(crdTotalAmt/1e7).toFixed(4)} Cr | diff=${(dbExpTotal - crdTotalAmt/1e7).toFixed(4)}`);

    // ══════════════════════════════════════════════════════════════
    // STEP 3 — DB: ALL statuses (matching what CRD might include)
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== DB Jul 2025 — ALL statuses (Open+Approved+Released+Exported To GL) ===');
    const fAll = {
      status: 'Open,Approved,Released,Exported To GL',
      dateFrom: '2025-07-01', dateTo: '2025-07-31'
    };
    const { cte: cteAll, values: vAll } = buildTrendCTE(fAll);

    const dbAll = await db.query(
      `${cteAll}
       SELECT COALESCE("${C.site}",'?') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr,
         COUNT(*) AS invoices
       FROM deduped
       WHERE "${C.invoiceDate}" >= '2025-07-01' AND "${C.invoiceDate}" <= '2025-07-31'
         AND "${C.site}" IN ('URIMH','URIMP','URIPB','URIPU')
       GROUP BY site ORDER BY site`, vAll
    );

    let dbAllTotal = 0;
    for (const r of dbAll.rows) {
      const crdAmt = crdBySite[r.site] ? crdBySite[r.site].amt / 1e7 : 0;
      const diff = (parseFloat(r.net_cr) - crdAmt).toFixed(4);
      console.log(`  ${r.site}: DB=${r.net_cr} Cr | CRD=${crdAmt.toFixed(4)} Cr | diff=${diff} | inv=${r.invoices}`);
      dbAllTotal += parseFloat(r.net_cr);
    }
    console.log(`  TOTAL: DB=${dbAllTotal.toFixed(4)} Cr | CRD=${(crdTotalAmt/1e7).toFixed(4)} Cr | diff=${(dbAllTotal - crdTotalAmt/1e7).toFixed(4)}`);

    // ══════════════════════════════════════════════════════════════
    // STEP 4 — DB: Sales (Commercial) only + ALL statuses
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== DB Jul 2025 — Sales (Commercial) + ALL statuses ===');
    const fComm = {
      status: 'Open,Approved,Released,Exported To GL',
      invoiceType: 'Sales ( Commercial )',
      dateFrom: '2025-07-01', dateTo: '2025-07-31'
    };
    const { cte: cteComm, values: vComm } = buildTrendCTE(fComm);

    const dbComm = await db.query(
      `${cteComm}
       SELECT COALESCE("${C.site}",'?') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr,
         COUNT(*) AS invoices
       FROM deduped
       WHERE "${C.invoiceDate}" >= '2025-07-01' AND "${C.invoiceDate}" <= '2025-07-31'
         AND "${C.site}" IN ('URIMH','URIMP','URIPB','URIPU')
       GROUP BY site ORDER BY site`, vComm
    );

    let dbCommTotal = 0;
    for (const r of dbComm.rows) {
      const crdAmt = crdBySite[r.site] ? crdBySite[r.site].amt / 1e7 : 0;
      const diff = (parseFloat(r.net_cr) - crdAmt).toFixed(4);
      console.log(`  ${r.site}: DB=${r.net_cr} Cr | CRD=${crdAmt.toFixed(4)} Cr | diff=${diff} | inv=${r.invoices}`);
      dbCommTotal += parseFloat(r.net_cr);
    }
    console.log(`  TOTAL: DB=${dbCommTotal.toFixed(4)} Cr | CRD=${(crdTotalAmt/1e7).toFixed(4)} Cr | diff=${(dbCommTotal - crdTotalAmt/1e7).toFixed(4)}`);

    // ══════════════════════════════════════════════════════════════
    // STEP 5 — DB: Sales (Commercial) + Exported To GL only
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== DB Jul 2025 — Sales (Commercial) + Exported To GL ===');
    const fCommExp = {
      status: 'Exported To GL',
      invoiceType: 'Sales ( Commercial )',
      dateFrom: '2025-07-01', dateTo: '2025-07-31'
    };
    const { cte: cteCommExp, values: vCommExp } = buildTrendCTE(fCommExp);

    const dbCommExp = await db.query(
      `${cteCommExp}
       SELECT COALESCE("${C.site}",'?') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr,
         COUNT(*) AS invoices
       FROM deduped
       WHERE "${C.invoiceDate}" >= '2025-07-01' AND "${C.invoiceDate}" <= '2025-07-31'
         AND "${C.site}" IN ('URIMH','URIMP','URIPB','URIPU')
       GROUP BY site ORDER BY site`, vCommExp
    );

    let dbCommExpTotal = 0;
    for (const r of dbCommExp.rows) {
      const crdAmt = crdBySite[r.site] ? crdBySite[r.site].amt / 1e7 : 0;
      const diff = (parseFloat(r.net_cr) - crdAmt).toFixed(4);
      console.log(`  ${r.site}: DB=${r.net_cr} Cr | CRD=${crdAmt.toFixed(4)} Cr | diff=${diff} | inv=${r.invoices}`);
      dbCommExpTotal += parseFloat(r.net_cr);
    }
    console.log(`  TOTAL: DB=${dbCommExpTotal.toFixed(4)} Cr | CRD=${(crdTotalAmt/1e7).toFixed(4)} Cr | diff=${(dbCommExpTotal - crdTotalAmt/1e7).toFixed(4)}`);

    // ══════════════════════════════════════════════════════════════
    // STEP 6 — Invoice type breakdown in DB
    // ══════════════════════════════════════════════════════════════
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
          AND "Invoice_Date_(Date)" >= '2025-07-01' AND "Invoice_Date_(Date)" <= '2025-07-31'
        GROUP BY "Invoice_No_", "Invoice_Type_"
      ) sub
      GROUP BY "Invoice_Type_" ORDER BY net_cr DESC
    `);

    console.log('\n=== DB Invoice Type Breakdown (Exported To GL, domestic) ===');
    for (const r of typeRes.rows) {
      console.log(`  "${r.type}": ${r.invoices} inv | ${r.net_cr} Cr`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 7 — CRD invoice status check in DB
    // ══════════════════════════════════════════════════════════════
    const crdInvList = Object.keys(crdInvoices);
    console.log(`\n=== CRD Invoice Status Check (${crdInvList.length} invoices) ===`);

    const dbStatus = await db.query(`
      SELECT "Invoice_No_",
        ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS statuses,
        MAX("Site_") AS site,
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" = ANY($1)
        AND "Invoice_No_" NOT LIKE '%-R'
      GROUP BY "Invoice_No_"
      ORDER BY "Invoice_No_"
    `, [crdInvList]);

    const dbStatusMap = {};
    for (const r of dbStatus.rows) dbStatusMap[r['Invoice_No_']] = r;

    const notExported = [];
    const notInDB = [];
    let expCount = 0;

    for (const inv of crdInvList) {
      const dbRow = dbStatusMap[inv];
      if (!dbRow) { notInDB.push(inv); continue; }
      if (dbRow.statuses.includes('Exported To GL')) { expCount++; }
      else { notExported.push({ inv, statuses: dbRow.statuses, site: dbRow.site, amt: parseFloat(dbRow.amt) / 1e7 }); }
    }

    console.log(`  Exported To GL in DB: ${expCount}`);
    console.log(`  NOT Exported (other status): ${notExported.length}`);
    console.log(`  Not found in DB at all: ${notInDB.length}`);

    if (notExported.length > 0) {
      const bySt = {};
      for (const r of notExported) {
        const st = r.statuses.join(',');
        if (!bySt[st]) bySt[st] = { count: 0, amt: 0, sites: {} };
        bySt[st].count++;
        bySt[st].amt += r.amt;
        bySt[st].sites[r.site] = (bySt[st].sites[r.site] || 0) + 1;
      }
      console.log('  Status breakdown of non-exported:');
      for (const [st, v] of Object.entries(bySt)) {
        console.log(`    "${st}": ${v.count} inv, ${v.amt.toFixed(4)} Cr, sites=${JSON.stringify(v.sites)}`);
      }
      notExported.forEach(r =>
        console.log(`    ${r.inv} (${r.site}): statuses=${r.statuses.join(',')}, amt=${r.amt.toFixed(4)} Cr`)
      );
    }

    if (notInDB.length > 0) {
      console.log(`  Missing from DB: ${notInDB.slice(0, 10).join(', ')}`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 8 — Sales Return contribution
    // ══════════════════════════════════════════════════════════════
    const retRes = await db.query(`
      SELECT "Site_" AS site,
        COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_", "Site_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" = 'Sales Return'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2025-07-01' AND "Invoice_Date_(Date)" <= '2025-07-31'
        GROUP BY "Invoice_No_", "Site_"
      ) sub
      GROUP BY "Site_" ORDER BY "Site_"
    `);

    console.log('\n=== Sales Return invoices (negative, reducing totals) ===');
    for (const r of retRes.rows) {
      console.log(`  ${r.site}: ${r.inv} return inv | net = ${r.net_cr} Cr`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 9 — Item_Amount (CRD) vs Header Amount_ (DB) for Exported invoices
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== Item_Amount (CRD) vs Header Amount_ (DB) — Exported invoices only ===');
    const exportedInvs = dbStatus.rows
      .filter(r => r.statuses.includes('Exported To GL'))
      .map(r => r['Invoice_No_']);

    // CRD item_amount for exported invoices, by site
    const crdExpBySite = {};
    for (const r of data) {
      if (!exportedInvs.includes(r['Invoice No'])) continue;
      const s = r['Site'];
      if (!crdExpBySite[s]) crdExpBySite[s] = { amt: 0, net: 0, invSet: new Set() };
      crdExpBySite[s].amt += num(r['Item Amount']);
      crdExpBySite[s].net += num(r['Item Net Amount']);
      crdExpBySite[s].invSet.add(r['Invoice No']);
    }

    // DB header Amount_ for same invoices
    const dbExpInvRes = await db.query(`
      SELECT "Site_" AS site,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr,
        COUNT(DISTINCT "Invoice_No_") AS invoices
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" = ANY($1)
        AND "Status_" = 'Exported To GL'
        AND "Invoice_No_" NOT LIKE '%-R'
      GROUP BY "Site_" ORDER BY "Site_"
    `, [exportedInvs]);

    for (const r of dbExpInvRes.rows) {
      const crdV = crdExpBySite[r.site];
      const crdAmt = crdV ? (crdV.amt / 1e7).toFixed(4) : '0.0000';
      const diff = crdV ? (parseFloat(r.net_cr) - crdV.amt / 1e7).toFixed(4) : r.net_cr;
      console.log(`  ${r.site}: DB_hdr=${r.net_cr} Cr | CRD_item=${crdAmt} Cr | diff=${diff} | inv=${r.invoices}/${crdV ? crdV.invSet.size : 0}`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 10 — FINAL COMPARISON SUMMARY
    // ══════════════════════════════════════════════════════════════
    console.log('\n' + '='.repeat(80));
    console.log('  FINAL COMPARISON TABLE — Jul 2025');
    console.log('='.repeat(80));
    console.log(`\n  ${'Filter'.padEnd(45)} | ${'DB Total'.padStart(10)} | ${'CRD Total'.padStart(10)} | ${'Diff'.padStart(10)}`);
    console.log(`  ${'-'.repeat(80)}`);
    console.log(`  ${'Exported To GL (all types)'.padEnd(45)} | ${dbExpTotal.toFixed(4).padStart(10)} | ${(crdTotalAmt/1e7).toFixed(4).padStart(10)} | ${(dbExpTotal - crdTotalAmt/1e7).toFixed(4).padStart(10)}`);
    console.log(`  ${'ALL statuses (Open+Appr+Rel+Exp)'.padEnd(45)} | ${dbAllTotal.toFixed(4).padStart(10)} | ${(crdTotalAmt/1e7).toFixed(4).padStart(10)} | ${(dbAllTotal - crdTotalAmt/1e7).toFixed(4).padStart(10)}`);
    console.log(`  ${'Sales Commercial + ALL statuses'.padEnd(45)} | ${dbCommTotal.toFixed(4).padStart(10)} | ${(crdTotalAmt/1e7).toFixed(4).padStart(10)} | ${(dbCommTotal - crdTotalAmt/1e7).toFixed(4).padStart(10)}`);
    console.log(`  ${'Sales Commercial + Exported To GL'.padEnd(45)} | ${dbCommExpTotal.toFixed(4).padStart(10)} | ${(crdTotalAmt/1e7).toFixed(4).padStart(10)} | ${(dbCommExpTotal - crdTotalAmt/1e7).toFixed(4).padStart(10)}`);
    console.log(`  ${'Same invoices only (Exported, CRD∩DB)'.padEnd(45)} | see above per-site`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
