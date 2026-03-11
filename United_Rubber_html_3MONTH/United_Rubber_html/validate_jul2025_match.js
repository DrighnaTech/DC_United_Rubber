'use strict';
const XLSX = require('xlsx');
const db   = require('./db/connection');
const { C } = require('./services/queryBuilder');

(async () => {
  try {
    const num = v => parseFloat((v || '0').replace(/,/g, '')) || 0;
    const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];

    // ── Parse CRD ────────────────────────────────────────────────────────
    const wb   = XLSX.readFile('./Validation_Month_csv/Jul_2025.xlsx');
    const data = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { defval: '', raw: false });

    // Aggregate CRD by invoice (item-level → invoice-level)
    const crdInvoices = {};
    for (const r of data) {
      const inv = r['Invoice No'];
      const site = r['Site'];
      if (!inv || !site) continue;
      if (!crdInvoices[inv]) crdInvoices[inv] = { site, amt: 0, net: 0 };
      crdInvoices[inv].amt += num(r['Item Amount']);
      crdInvoices[inv].net += num(r['Item Net Amount']);
    }

    const crdInvList = Object.keys(crdInvoices);
    console.log(`CRD: ${crdInvList.length} invoices\n`);

    // ── Query DB: per-invoice using TrendCTE logic (GROUP BY Invoice, Date) ──
    // For the EXACT CRD invoice set only
    const dbInvRes = await db.query(`
      SELECT
        "${C.invoiceNo}" AS inv,
        "${C.invoiceDate}" AS dt,
        MAX("${C.site}") AS site,
        MAX("${C.status}") AS status,
        MAX("${C.invoiceType}") AS inv_type,
        SUM(DISTINCT COALESCE(NULLIF("${C.amount}",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("${C.amountGross}",'')::NUMERIC, 0)) AS gross
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "${C.invoiceNo}" = ANY($1)
        AND "${C.invoiceNo}" NOT LIKE '%-R'
        AND "${C.status}" != '0'
        AND "${C.invoiceType}" != '0'
      GROUP BY "${C.invoiceNo}", "${C.invoiceDate}"
    `, [crdInvList]);

    // Build per-invoice map from DB
    const dbInvMap = {};
    for (const r of dbInvRes.rows) {
      // If same invoice appears on multiple dates, use the one with data
      if (!dbInvMap[r.inv] || parseFloat(r.net) > parseFloat(dbInvMap[r.inv].net)) {
        dbInvMap[r.inv] = { site: r.site, status: r.status, type: r.inv_type, net: parseFloat(r.net), gross: parseFloat(r.gross) };
      }
    }

    // ── Per-invoice comparison ───────────────────────────────────────────
    let matchCount = 0, diffCount = 0;
    const perSite = {};
    const bigDiffs = [];

    for (const [inv, crd] of Object.entries(crdInvoices)) {
      const dbRow = dbInvMap[inv];
      const site = crd.site;

      if (!perSite[site]) perSite[site] = { crdAmt: 0, dbAmt: 0, crdGross: 0, dbGross: 0, match: 0, diff: 0, missing: 0, crdInv: 0, dbInv: 0 };
      perSite[site].crdAmt += crd.amt;
      perSite[site].crdGross += crd.net;
      perSite[site].crdInv++;

      if (!dbRow) {
        perSite[site].missing++;
        continue;
      }

      perSite[site].dbAmt += dbRow.net;
      perSite[site].dbGross += dbRow.gross;
      perSite[site].dbInv++;

      const d = Math.abs(crd.amt - dbRow.net);
      if (d < 1) {
        matchCount++;
        perSite[site].match++;
      } else {
        diffCount++;
        perSite[site].diff++;
        bigDiffs.push({ inv, site, crdAmt: crd.amt, dbNet: dbRow.net, diff: d, status: dbRow.status });
      }
    }

    console.log('=== PER-INVOICE COMPARISON (CRD Item_Amount vs DB Header Amount_) ===');
    console.log(`Match (within ₹1): ${matchCount}`);
    console.log(`Differ (>₹1): ${diffCount}`);
    console.log(`Total: ${matchCount + diffCount}\n`);

    if (bigDiffs.length > 0) {
      bigDiffs.sort((a, b) => b.diff - a.diff);
      console.log(`Top ${Math.min(30, bigDiffs.length)} differences:`);
      for (const d of bigDiffs.slice(0, 30)) {
        console.log(`  ${d.inv.padEnd(22)} | ${d.site} | ${d.status.padEnd(15)} | CRD=${d.crdAmt.toFixed(2).padStart(12)} | DB=${d.dbNet.toFixed(2).padStart(12)} | Diff=${d.diff.toFixed(2)}`);
      }
    }

    // ── Site-level totals (shared invoices only) ─────────────────────────
    console.log('\n' + '='.repeat(90));
    console.log('  SITE-LEVEL TOTALS — SHARED INVOICES (CRD ∩ DB)');
    console.log('='.repeat(90));
    console.log(`  ${'Site'.padEnd(8)} | ${'CRD Amt(Cr)'.padStart(12)} | ${'DB Amt(Cr)'.padStart(12)} | ${'Diff(Cr)'.padStart(10)} | ${'CRD Inv'.padStart(8)} | ${'DB Inv'.padStart(8)} | ${'Match'.padStart(6)} | ${'Diff'.padStart(5)} | Status`);
    console.log(`  ${'-'.repeat(88)}`);

    for (const s of sites) {
      const p = perSite[s] || { crdAmt: 0, dbAmt: 0, crdInv: 0, dbInv: 0, match: 0, diff: 0, missing: 0 };
      const crdCr = (p.crdAmt / 1e7).toFixed(4);
      const dbCr = (p.dbAmt / 1e7).toFixed(4);
      const diffCr = ((p.dbAmt - p.crdAmt) / 1e7).toFixed(4);
      const status = crdCr === dbCr ? 'EXACT MATCH' :
        Math.abs(parseFloat(diffCr)) <= 0.0001 ? 'MATCH' :
        Math.abs(parseFloat(diffCr)) <= 0.01 ? 'ROUNDING' : 'GAP';
      console.log(`  ${s.padEnd(8)} | ${crdCr.padStart(12)} | ${dbCr.padStart(12)} | ${diffCr.padStart(10)} | ${String(p.crdInv).padStart(8)} | ${String(p.dbInv).padStart(8)} | ${String(p.match).padStart(6)} | ${String(p.diff).padStart(5)} | ${status}`);
    }

    // ── Now also show: DB totals for ALL Commercial invoices (incl. those not in CRD) ──
    console.log('\n\n=== EXTRA DB INVOICES (in DB but NOT in CRD) ===');
    const extraRes = await db.query(`
      WITH deduped AS (
        SELECT "${C.invoiceNo}" AS inv, MAX("${C.site}") AS site,
          SUM(DISTINCT COALESCE(NULLIF("${C.amount}",'')::NUMERIC, 0)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.status}" != '0' AND "${C.invoiceType}" != '0'
          AND "${C.invoiceType}" = 'Sales ( Commercial )'
          AND "${C.invoiceDate}" >= '2025-07-01' AND "${C.invoiceDate}" <= '2025-07-31'
          AND "${C.site}" IN ('URIMH','URIMP','URIPB','URIPU')
        GROUP BY "${C.invoiceNo}", "${C.invoiceDate}"
      )
      SELECT site, inv, net FROM deduped
      WHERE inv != ALL($1)
      ORDER BY site, net DESC
    `, [crdInvList]);

    const extraBySite = {};
    for (const r of extraRes.rows) {
      if (!extraBySite[r.site]) extraBySite[r.site] = { count: 0, net: 0, invoices: [] };
      extraBySite[r.site].count++;
      extraBySite[r.site].net += parseFloat(r.net);
      extraBySite[r.site].invoices.push({ inv: r.inv, net: parseFloat(r.net) });
    }

    for (const s of sites) {
      const e = extraBySite[s];
      if (!e) { console.log(`  ${s}: 0 extra invoices`); continue; }
      console.log(`  ${s}: ${e.count} extra invoices | Total=${(e.net/1e7).toFixed(4)} Cr`);
      for (const inv of e.invoices.slice(0, 10)) {
        console.log(`    ${inv.inv}: ${inv.net.toFixed(2)}`);
      }
    }

    // ── Sales Returns in DB (not in CRD since CRD is 100% Commercial) ───
    console.log('\n=== SALES RETURNS (in DB, negative amounts, not in CRD) ===');
    const retRes = await db.query(`
      WITH deduped AS (
        SELECT "${C.invoiceNo}" AS inv, MAX("${C.site}") AS site,
          SUM(DISTINCT COALESCE(NULLIF("${C.amount}",'')::NUMERIC, 0)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.status}" != '0' AND "${C.invoiceType}" != '0'
          AND "${C.invoiceType}" = 'Sales Return'
          AND "${C.invoiceDate}" >= '2025-07-01' AND "${C.invoiceDate}" <= '2025-07-31'
          AND "${C.site}" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "${C.status}" = 'Exported To GL'
        GROUP BY "${C.invoiceNo}", "${C.invoiceDate}"
      )
      SELECT site, SUM(net) AS total_net, COUNT(*) AS cnt FROM deduped GROUP BY site ORDER BY site
    `);
    for (const r of retRes.rows) {
      console.log(`  ${r.site}: ${r.cnt} returns | Net=${(parseFloat(r.total_net)/1e7).toFixed(4)} Cr`);
    }

    // ── FINAL RECONCILIATION ────────────────────────────────────────────
    console.log('\n' + '='.repeat(90));
    console.log('  RECONCILIATION: Why Dashboard differs from CRD');
    console.log('='.repeat(90));

    for (const s of sites) {
      const p = perSite[s] || { crdAmt: 0, dbAmt: 0 };
      const extra = extraBySite[s] || { net: 0, count: 0 };
      const ret = retRes.rows.find(r => r.site === s);
      const retAmt = ret ? parseFloat(ret.total_net) : 0;

      const dbDashboard = p.dbAmt + extra.net + retAmt; // Total dashboard would show
      const crdTotal = p.crdAmt;

      console.log(`\n  ${s}:`);
      console.log(`    CRD total:              ${(crdTotal/1e7).toFixed(4)} Cr (${p.crdInv} invoices)`);
      console.log(`    DB shared invoices:     ${(p.dbAmt/1e7).toFixed(4)} Cr (${p.dbInv} invoices) — should match CRD`);
      console.log(`    + Extra DB invoices:    ${(extra.net/1e7).toFixed(4)} Cr (${extra.count} invoices not in CRD)`);
      console.log(`    + Sales Returns:        ${(retAmt/1e7).toFixed(4)} Cr (negative)`);
      console.log(`    = Dashboard total:      ${(dbDashboard/1e7).toFixed(4)} Cr`);
      console.log(`    Dashboard - CRD:        ${((dbDashboard - crdTotal)/1e7).toFixed(4)} Cr`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
