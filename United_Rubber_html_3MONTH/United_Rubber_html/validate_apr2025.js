'use strict';
const XLSX = require('xlsx');
const db   = require('./db/connection');
const { buildTrendCTE, AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, C } = require('./services/queryBuilder');

(async () => {
  try {
    // ══════════════════════════════════════════════════════════════
    // STEP 1 — Parse CRD file (Apr_2025.xlsx)
    // ══════════════════════════════════════════════════════════════
    const wb   = XLSX.readFile('./validation_month_csv/Apr_2025.xlsx');
    const data = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '', raw: false });
    console.log('CRD rows:', data.length);

    // Unique invoice types & statuses in the file
    const types   = new Set(data.map(r => r['Invoice Type']));
    console.log('Invoice Types in CRD:', [...types].join(', '));

    // Helper: strip commas and parse
    const num = v => parseFloat((v || '0').replace(/,/g, '')) || 0;

    // Aggregate by site (all rows)
    const crdBySite    = {};
    const crdInvoices  = {};   // unique invoices
    const crdByType    = {};

    for (const r of data) {
      const site = r['Site'];
      const inv  = r['Invoice No'];
      const type = r['Invoice Type'];
      const amt  = num(r['Item Amount']);
      const net  = num(r['Item Net Amount']);
      const tax  = num(r['Item Total Tax']);

      if (!crdBySite[site]) crdBySite[site] = { amt: 0, net: 0, tax: 0, items: 0, invSet: new Set() };
      crdBySite[site].amt += amt;
      crdBySite[site].net += net;
      crdBySite[site].tax += tax;
      crdBySite[site].items++;
      crdBySite[site].invSet.add(inv);

      if (!crdInvoices[inv]) crdInvoices[inv] = { site, type, amt: 0, net: 0 };
      crdInvoices[inv].amt += amt;
      crdInvoices[inv].net += net;

      if (!crdByType[type]) crdByType[type] = { amt: 0, items: 0, invSet: new Set() };
      crdByType[type].amt += amt;
      crdByType[type].items++;
      crdByType[type].invSet.add(inv);
    }

    console.log('\n=== CRD Apr 2025 — Per Site (all invoice types) ===');
    let crdTotalAmt = 0, crdTotalNet = 0;
    const sites = ['URIMH','URIMP','URIPB','URIPU'];
    for (const s of sites) {
      const v = crdBySite[s] || { amt: 0, net: 0, tax: 0, items: 0, invSet: new Set() };
      console.log(`  ${s}: ${v.invSet.size} invoices, ${v.items} item-rows, Item_Amount=${(v.amt/1e7).toFixed(4)} Cr, Item_NetAmount=${(v.net/1e7).toFixed(4)} Cr`);
      crdTotalAmt += v.amt; crdTotalNet += v.net;
    }
    console.log(`  TOTAL: ${Object.keys(crdInvoices).length} invoices, Item_Amount=${(crdTotalAmt/1e7).toFixed(4)} Cr, Item_NetAmount=${(crdTotalNet/1e7).toFixed(4)} Cr`);

    console.log('\n=== CRD Apr 2025 — By Invoice Type ===');
    for (const [t, v] of Object.entries(crdByType).sort((a,b) => b[1].amt - a[1].amt)) {
      console.log(`  "${t}": ${v.invSet.size} invoices, ${v.items} items, ${(v.amt/1e7).toFixed(4)} Cr`);
    }

    // Per-site per-type from CRD
    const crdSiteType = {};
    for (const r of data) {
      const key = r['Site'] + '|' + r['Invoice Type'];
      if (!crdSiteType[key]) crdSiteType[key] = { amt: 0, invSet: new Set() };
      crdSiteType[key].amt += num(r['Item Amount']);
      crdSiteType[key].invSet.add(r['Invoice No']);
    }
    console.log('\n=== CRD Apr 2025 — Site × Invoice Type ===');
    for (const [k, v] of Object.entries(crdSiteType).sort()) {
      console.log(`  ${k}: ${v.invSet.size} invoices, ${(v.amt/1e7).toFixed(4)} Cr`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 2 — Query DB using buildTrendCTE (dashboard logic)
    //          Status = Exported To GL (current default)
    // ══════════════════════════════════════════════════════════════
    console.log('\n\n=== DB Apr 2025 — buildTrendCTE, Status=Exported To GL ===');
    const fExported = { status: 'Exported To GL', dateFrom: '2025-04-01', dateTo: '2025-04-30' };
    const { cte: cteExp, values: vExp } = buildTrendCTE(fExported);

    const dbSiteExp = await db.query(
      `${cteExp}
       SELECT COALESCE("${C.site}",'Unknown') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr,
         ROUND(SUM(${AMOUNT_GROSS_EXPR})/1e7, 4) AS gross_cr,
         COUNT(*) AS invoices
       FROM deduped
       WHERE "${C.invoiceDate}" >= '2025-04-01' AND "${C.invoiceDate}" <= '2025-04-30'
       GROUP BY site ORDER BY site`, vExp
    );
    for (const r of dbSiteExp.rows) {
      const crdV = crdBySite[r.site];
      const crdAmt = crdV ? (crdV.amt/1e7).toFixed(4) : 'N/A';
      const diff   = crdV ? (parseFloat(r.net_cr) - crdV.amt/1e7).toFixed(4) : 'N/A';
      console.log(`  ${r.site}: DB_net=${r.net_cr} Cr, CRD_itemAmt=${crdAmt} Cr, diff=${diff}, invoices=${r.invoices}`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 3 — Query DB with ALL statuses (Open+Approved+Released+ExportedToGL)
    //          matching the CRD filter
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== DB Apr 2025 — buildTrendCTE, Status=ALL (Open+Approved+Released+ExportedToGL) ===');
    const fAll = {
      status: 'Open,Approved,Released,Exported To GL',
      dateFrom: '2025-04-01', dateTo: '2025-04-30'
    };
    const { cte: cteAll, values: vAll } = buildTrendCTE(fAll);

    const dbSiteAll = await db.query(
      `${cteAll}
       SELECT COALESCE("${C.site}",'Unknown') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr,
         ROUND(SUM(${AMOUNT_GROSS_EXPR})/1e7, 4) AS gross_cr,
         COUNT(*) AS invoices
       FROM deduped
       WHERE "${C.invoiceDate}" >= '2025-04-01' AND "${C.invoiceDate}" <= '2025-04-30'
       GROUP BY site ORDER BY site`, vAll
    );
    let dbAllTotal = 0;
    for (const r of dbSiteAll.rows) {
      const crdV = crdBySite[r.site];
      const crdAmt = crdV ? (crdV.amt/1e7).toFixed(4) : 'N/A';
      const diff   = crdV ? (parseFloat(r.net_cr) - crdV.amt/1e7).toFixed(4) : 'N/A';
      console.log(`  ${r.site}: DB_net=${r.net_cr} Cr, CRD_itemAmt=${crdAmt} Cr, diff=${diff}, invoices=${r.invoices}`);
      if (sites.includes(r.site)) dbAllTotal += parseFloat(r.net_cr);
    }
    console.log(`  TOTAL domestic: ${dbAllTotal.toFixed(4)} Cr vs CRD: ${(crdTotalAmt/1e7).toFixed(4)} Cr`);

    // ══════════════════════════════════════════════════════════════
    // STEP 4 — Query DB with Sales Commercial only + all statuses
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== DB Apr 2025 — Status=ALL, InvoiceType=Sales Commercial only ===');
    const fComm = {
      status: 'Open,Approved,Released,Exported To GL',
      invoiceType: 'Sales ( Commercial )',
      dateFrom: '2025-04-01', dateTo: '2025-04-30'
    };
    const { cte: cteComm, values: vComm } = buildTrendCTE(fComm);

    const dbSiteComm = await db.query(
      `${cteComm}
       SELECT COALESCE("${C.site}",'Unknown') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr,
         COUNT(*) AS invoices
       FROM deduped
       WHERE "${C.invoiceDate}" >= '2025-04-01' AND "${C.invoiceDate}" <= '2025-04-30'
       GROUP BY site ORDER BY site`, vComm
    );

    // CRD Sales Commercial totals
    const crdCommBySite = {};
    for (const r of data) {
      if (r['Invoice Type'] !== 'Sales ( Commercial )') continue;
      const s = r['Site'];
      if (!crdCommBySite[s]) crdCommBySite[s] = { amt: 0, invSet: new Set() };
      crdCommBySite[s].amt += num(r['Item Amount']);
      crdCommBySite[s].invSet.add(r['Invoice No']);
    }

    for (const r of dbSiteComm.rows) {
      const crdV = crdCommBySite[r.site];
      const crdAmt = crdV ? (crdV.amt/1e7).toFixed(4) : 'N/A';
      const diff   = crdV ? (parseFloat(r.net_cr) - crdV.amt/1e7).toFixed(4) : 'N/A';
      console.log(`  ${r.site}: DB=${r.net_cr} Cr, CRD_comm=${crdAmt} Cr, diff=${diff}, invoices=${r.invoices}`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 5 — Invoice-level comparison: invoices in CRD but NOT in DB (Exported To GL)
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== Apr 2025 — CRD invoice list vs DB status ===');
    const crdInvList = Object.keys(crdInvoices);
    console.log('Total unique invoices in CRD:', crdInvList.length);

    // Query DB status for all CRD invoices
    const dbStatusRes = await db.query(`
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
    for (const r of dbStatusRes.rows) dbStatusMap[r['Invoice_No_']] = r;

    // Invoices in CRD but not exported to GL in DB
    const notExported = [];
    const notInDB     = [];
    let   expCount    = 0;

    for (const inv of crdInvList) {
      const dbRow = dbStatusMap[inv];
      if (!dbRow) { notInDB.push(inv); continue; }
      const statuses = dbRow.statuses;
      if (statuses.includes('Exported To GL')) { expCount++; }
      else { notExported.push({ inv, statuses, site: dbRow.site, amt: parseFloat(dbRow.amt)/1e7 }); }
    }

    console.log(`  Exported To GL in DB: ${expCount}`);
    console.log(`  NOT Exported (in CRD but other status in DB): ${notExported.length}`);
    console.log(`  Not found in DB at all: ${notInDB.length}`);

    if (notExported.length > 0) {
      console.log('\n  Sample NOT-Exported invoices (first 20):');
      // Group by status
      const bySt = {};
      for (const r of notExported) {
        const st = r.statuses.join(',');
        if (!bySt[st]) bySt[st] = { count: 0, amt: 0, sites: {} };
        bySt[st].count++;
        bySt[st].amt += r.amt;
        bySt[st].sites[r.site] = (bySt[st].sites[r.site] || 0) + 1;
      }
      for (const [st, v] of Object.entries(bySt)) {
        console.log(`    Status "${st}": ${v.count} invoices, ${v.amt.toFixed(4)} Cr, sites=${JSON.stringify(v.sites)}`);
      }
      notExported.slice(0,10).forEach(r =>
        console.log(`    ${r.inv} (${r.site}): statuses=${r.statuses.join(',')}, amt=${r.amt.toFixed(4)} Cr`)
      );
    }

    if (notInDB.length > 0) {
      console.log('\n  Sample NOT-in-DB invoices:', notInDB.slice(0, 10).join(', '));
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 6 — Item_Amount vs Header Amount_ comparison
    //          for invoices that ARE Exported To GL
    // ══════════════════════════════════════════════════════════════
    console.log('\n=== Item_Amount (CRD) vs Header Amount_ (DB) for Exported To GL invoices ===');
    // CRD item_amount total for exported invoices only
    const exportedInvs = dbStatusRes.rows
      .filter(r => r.statuses.includes('Exported To GL'))
      .map(r => r['Invoice_No_']);

    let crdAmtExported = 0;
    for (const r of data) {
      if (exportedInvs.includes(r['Invoice No'])) crdAmtExported += num(r['Item Amount']);
    }

    // DB header Amount_ for same invoices
    const dbAmtRes = await db.query(`
      SELECT SUM(DISTINCT CAST("Amount_" AS NUMERIC)) / 1e7 AS total_net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" = ANY($1)
        AND "Status_" = 'Exported To GL'
        AND "Invoice_No_" NOT LIKE '%-R'
    `, [exportedInvs]);

    console.log(`  Same invoice set (Exported To GL, ${exportedInvs.length} invoices):`);
    console.log(`    CRD Item_Amount total:  ${(crdAmtExported/1e7).toFixed(4)} Cr`);
    console.log(`    DB  Header Amount_ total: ${parseFloat(dbAmtRes.rows[0].total_net_cr).toFixed(4)} Cr`);
    console.log(`    Diff (DB - CRD):         ${(parseFloat(dbAmtRes.rows[0].total_net_cr) - crdAmtExported/1e7).toFixed(4)} Cr`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
