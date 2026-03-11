'use strict';
const XLSX = require('xlsx');
const db   = require('./db/connection');
const { buildTrendCTE, AMOUNT_NET_EXPR, C } = require('./services/queryBuilder');

(async () => {
  try {
    const wb   = XLSX.readFile('./validation_month_csv/Apr_2025.xlsx');
    const data = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '', raw: false });
    const num  = v => parseFloat((v || '0').replace(/,/g, '')) || 0;

    // All CRD invoice numbers
    const crdInvs = [...new Set(data.map(r => r['Invoice No']).filter(Boolean))];
    const crdCommInvs = [...new Set(data.filter(r => r['Invoice Type'] === 'Sales ( Commercial )').map(r => r['Invoice No']))];
    console.log('CRD invoices total:', crdInvs.length, '| Sales Commercial:', crdCommInvs.length);

    // ── Check which CRD invoices are NOT Exported To GL in DB ─────────────
    const dbStatus = await db.query(`
      SELECT "Invoice_No_",
        ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS statuses,
        MAX("Site_") AS site
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" = ANY($1)
        AND "Invoice_No_" NOT LIKE '%-R'
      GROUP BY "Invoice_No_"
    `, [crdCommInvs]);

    const statusMap = {};
    for (const r of dbStatus.rows) statusMap[r['Invoice_No_']] = { statuses: r.statuses, site: r.site };

    const notExported = crdCommInvs.filter(inv => {
      const info = statusMap[inv];
      return info && !info.statuses.includes('Exported To GL');
    });
    const missing = crdCommInvs.filter(inv => !statusMap[inv]);

    console.log('\nSales Commercial invoices in CRD but NOT "Exported To GL" in DB:', notExported.length);
    console.log('Not found in DB at all:', missing.length);

    if (notExported.length > 0) {
      // Show status breakdown and amounts
      const bySt = {};
      for (const inv of notExported) {
        const st = (statusMap[inv]?.statuses || []).join(',');
        if (!bySt[st]) bySt[st] = { count: 0, amt: 0, sites: {} };
        bySt[st].count++;
        // Get amount from CRD
        const invRows = data.filter(r => r['Invoice No'] === inv);
        const amt = invRows.reduce((s, r) => s + num(r['Item Amount']), 0);
        bySt[st].amt += amt;
        const site = statusMap[inv]?.site || 'Unknown';
        bySt[st].sites[site] = (bySt[st].sites[site] || 0) + 1;
      }
      console.log('\nBreakdown of non-exported invoices:');
      for (const [st, v] of Object.entries(bySt)) {
        console.log(`  Status="${st}": ${v.count} invoices, ${(v.amt/1e7).toFixed(4)} Cr, sites=${JSON.stringify(v.sites)}`);
      }
      console.log('\nSample non-exported invoices (up to 15):');
      notExported.slice(0, 15).forEach(inv => {
        const invRows = data.filter(r => r['Invoice No'] === inv);
        const amt = invRows.reduce((s, r) => s + num(r['Item Amount']), 0);
        const info = statusMap[inv];
        console.log(`  ${inv} | site=${info?.site} | status=${info?.statuses.join(',')} | CRD_amt=${(amt/1e7).toFixed(4)} Cr`);
      });
    }

    // ── DB comparison: Exported To GL + Sales Commercial ─────────────────
    console.log('\n=== Scenario A: Status=Exported To GL + Type=Sales Commercial (what user tried) ===');
    const fA = { status: 'Exported To GL', invoiceType: 'Sales ( Commercial )', dateFrom: '2025-04-01', dateTo: '2025-04-30' };
    const { cte: cteA, values: vA } = buildTrendCTE(fA);
    const rA = await db.query(`${cteA}
      SELECT COALESCE("${C.site}",'?') AS site,
        ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr, COUNT(*) AS invoices
      FROM deduped WHERE "${C.invoiceDate}" >= '2025-04-01' AND "${C.invoiceDate}" <= '2025-04-30'
      GROUP BY site ORDER BY site`, vA);

    // CRD per-site Sales Commercial totals
    const crdCS = {};
    for (const r of data.filter(r => r['Invoice Type'] === 'Sales ( Commercial )')) {
      if (!crdCS[r['Site']]) crdCS[r['Site']] = 0;
      crdCS[r['Site']] += num(r['Item Amount']);
    }

    let totalA = 0, totalCRD = 0;
    for (const r of rA.rows) {
      const crdAmt = crdCS[r.site] || 0;
      const diff   = parseFloat(r.net_cr) - crdAmt/1e7;
      console.log(`  ${r.site}: DB=${r.net_cr} Cr | CRD=${(crdAmt/1e7).toFixed(4)} Cr | diff=${diff.toFixed(4)} | invoices=${r.invoices}`);
      totalA += parseFloat(r.net_cr); totalCRD += crdAmt/1e7;
    }
    console.log(`  TOTAL: DB=${totalA.toFixed(4)} Cr | CRD=${totalCRD.toFixed(4)} Cr | diff=${(totalA-totalCRD).toFixed(4)}`);

    // ── DB comparison: ALL statuses + Sales Commercial ────────────────────
    console.log('\n=== Scenario B: Status=ALL + Type=Sales Commercial (CORRECT match for CRD) ===');
    const fB = { status: 'Open,Approved,Released,Exported To GL', invoiceType: 'Sales ( Commercial )', dateFrom: '2025-04-01', dateTo: '2025-04-30' };
    const { cte: cteB, values: vB } = buildTrendCTE(fB);
    const rB = await db.query(`${cteB}
      SELECT COALESCE("${C.site}",'?') AS site,
        ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 4) AS net_cr, COUNT(*) AS invoices
      FROM deduped WHERE "${C.invoiceDate}" >= '2025-04-01' AND "${C.invoiceDate}" <= '2025-04-30'
      GROUP BY site ORDER BY site`, vB);

    let totalB = 0;
    for (const r of rB.rows) {
      const crdAmt = crdCS[r.site] || 0;
      const diff   = parseFloat(r.net_cr) - crdAmt/1e7;
      console.log(`  ${r.site}: DB=${r.net_cr} Cr | CRD=${(crdAmt/1e7).toFixed(4)} Cr | diff=${diff.toFixed(4)} | invoices=${r.invoices}`);
      totalB += parseFloat(r.net_cr);
    }
    console.log(`  TOTAL: DB=${totalB.toFixed(4)} Cr | CRD=${totalCRD.toFixed(4)} Cr | diff=${(totalB-totalCRD).toFixed(4)}`);

    // ── Check Apr-Nov 2024 with Scenario B filter (to see if it breaks old months) ─
    console.log('\n=== Apr-Nov 2024 TOTALS — with Scenario B filter (ALL statuses + Sales Commercial) ===');
    console.log('(Comparing to old CRD which used Exported To GL, ALL types)');
    const crdOld = {
      '2024-04':12.88,'2024-05':11.97,'2024-06':13.11,'2024-07':14.50,
      '2024-08':14.79,'2024-09':13.74,'2024-10':16.41,'2024-11':13.27,
    };
    const fOld = { status: 'Open,Approved,Released,Exported To GL', invoiceType: 'Sales ( Commercial )', dateFrom: '2024-04-01', dateTo: '2024-11-30' };
    const { cte: cteOld, values: vOld } = buildTrendCTE(fOld);
    const rOld = await db.query(`${cteOld}
      SELECT TO_CHAR("${C.invoiceDate}"::DATE,'YYYY-MM') AS month_key,
        ROUND(SUM(${AMOUNT_NET_EXPR})/1e7, 2) AS net_cr, COUNT(*) AS invoices
      FROM deduped WHERE "${C.invoiceDate}" >= '2024-04-01' AND "${C.invoiceDate}" <= '2024-11-30'
      GROUP BY month_key ORDER BY month_key`, vOld);

    for (const r of rOld.rows) {
      const crdV = crdOld[r.month_key] || 0;
      const diff = (parseFloat(r.net_cr) - crdV).toFixed(2);
      console.log(`  ${r.month_key}: DB(SalesComm+ALL)=${r.net_cr} Cr | CRD(Exported+All types)=${crdV} | diff=${diff}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
