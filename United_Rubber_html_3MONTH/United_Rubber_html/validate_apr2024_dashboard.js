'use strict';
require('dotenv').config();
const fs = require('fs');
const http = require('http');

// ── Parse CRD CSV ──
function parseCRD(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',');

  // CSV with quoted commas — proper parse
  function parseCSVLine(line) {
    const fields = [];
    let field = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { fields.push(field.trim()); field = ''; continue; }
      field += ch;
    }
    fields.push(field.trim());
    return fields;
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 6 || !vals[1]) continue;
    const num = v => parseFloat((v || '0').replace(/,/g, '')) || 0;
    rows.push({
      site:         vals[0],
      invoiceNo:    vals[1],
      invoiceDate:  vals[2],
      status:       vals[3],
      customerName: vals[4],
      amount:       num(vals[5]),    // Net Amount
      tax:          num(vals[6]),    // Tax
      invoiceAmt:   num(vals[7]),    // Gross Amount
      charge:       num(vals[8]),
      discount:     num(vals[9]),
      shipCity:     vals[10],
      partyGroup:   vals[11],
      invoiceType:  vals[12],
      employeeName: vals[13] || '',
    });
  }
  return rows;
}

// ── Fetch dashboard API ──
function apiFetch(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000' + path, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.substring(0, 200))); }
      });
    }).on('error', reject);
  });
}

const fmtCr = v => (v / 1e7).toFixed(4);
const fmtL  = v => (v / 1e5).toFixed(2);

(async () => {
  try {
    console.log('═'.repeat(90));
    console.log('  APR 2024 DASHBOARD VALIDATION vs CRD');
    console.log('═'.repeat(90));

    // ── STEP 1: Parse CRD ──
    const crd = parseCRD('./Validation_Month_csv/Apr_2024.csv');
    console.log(`\nCRD: ${crd.length} invoices loaded`);

    // CRD aggregates
    const crdTotalNet   = crd.reduce((s, r) => s + r.amount, 0);
    const crdTotalGross = crd.reduce((s, r) => s + r.invoiceAmt, 0);
    const crdTotalTax   = crd.reduce((s, r) => s + r.tax, 0);
    const crdTotalChg   = crd.reduce((s, r) => s + r.charge, 0);
    const crdTotalDisc  = crd.reduce((s, r) => s + r.discount, 0);
    const crdInvCount   = crd.length;
    const crdTypes      = {};
    const crdStatuses   = {};
    crd.forEach(r => {
      crdTypes[r.invoiceType] = (crdTypes[r.invoiceType] || 0) + 1;
      crdStatuses[r.status]   = (crdStatuses[r.status] || 0) + 1;
    });

    console.log(`CRD Totals: Net=${fmtCr(crdTotalNet)} Cr | Gross=${fmtCr(crdTotalGross)} Cr | Tax=${fmtCr(crdTotalTax)} Cr | Invoices=${crdInvCount}`);
    console.log(`CRD Types: ${JSON.stringify(crdTypes)}`);
    console.log(`CRD Statuses: ${JSON.stringify(crdStatuses)}`);

    // CRD per-site
    const crdBySite = {};
    crd.forEach(r => {
      if (!crdBySite[r.site]) crdBySite[r.site] = { net: 0, gross: 0, tax: 0, count: 0 };
      crdBySite[r.site].net   += r.amount;
      crdBySite[r.site].gross += r.invoiceAmt;
      crdBySite[r.site].tax   += r.tax;
      crdBySite[r.site].count++;
    });

    // CRD per-customer (top 10 by gross)
    const crdByCust = {};
    crd.forEach(r => {
      if (!crdByCust[r.customerName]) crdByCust[r.customerName] = { net: 0, gross: 0, count: 0 };
      crdByCust[r.customerName].net   += r.amount;
      crdByCust[r.customerName].gross += r.invoiceAmt;
      crdByCust[r.customerName].count++;
    });
    const crdTopCust = Object.entries(crdByCust).sort((a, b) => b[1].gross - a[1].gross).slice(0, 10);

    // CRD per-state
    const crdByState = {};
    crd.forEach(r => {
      // Ship To Address City — we'll compare by city
    });

    // CRD by ship city (for map tab)
    const crdByCity = {};
    crd.forEach(r => {
      const city = r.shipCity || 'Unknown';
      if (!crdByCity[city]) crdByCity[city] = { net: 0, gross: 0, count: 0 };
      crdByCity[city].net   += r.amount;
      crdByCity[city].gross += r.invoiceAmt;
      crdByCity[city].count++;
    });

    // ── STEP 2: Fetch Dashboard APIs for Apr 2024 ──
    const params = 'status=Exported+To+GL&date_from=2024-04-01&date_to=2024-04-30';

    console.log('\n' + '─'.repeat(90));
    console.log('Fetching dashboard APIs with filters: ' + params);
    console.log('─'.repeat(90));

    const [dashboard, mapData, analysis, invoiceSummary] = await Promise.all([
      apiFetch('/api/sales-dashboard?' + params),
      apiFetch('/api/sales-map?' + params),
      apiFetch('/api/sales-analysis?' + params),
      apiFetch('/api/invoice-summary?' + params),
    ]);

    // ══════════════════════════════════════════════════════════════════════
    // TAB 1: SALES DASHBOARD — KPIs
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(90));
    console.log('  TAB 1: SALES DASHBOARD');
    console.log('═'.repeat(90));

    const kpi = dashboard.kpi;
    console.log('\n  KPI VALIDATION:');
    console.log('  ┌─────────────────────┬─────────────────┬─────────────────┬────────────┐');
    console.log('  │ KPI                 │ Dashboard       │ CRD             │ Match?     │');
    console.log('  ├─────────────────────┼─────────────────┼─────────────────┼────────────┤');

    const kpiChecks = [
      ['Net Amount (Cr)',  parseFloat(kpi.total_net_amount),  crdTotalNet,   'net'],
      ['Gross Amount (Cr)', parseFloat(kpi.total_gross_amount), crdTotalGross, 'gross'],
      ['Tax (Cr)',         parseFloat(kpi.total_tax),         crdTotalTax,   'tax'],
      ['No of Invoices',   parseInt(kpi.total_invoices),      crdInvCount,   'count'],
    ];

    for (const [label, dbVal, crdVal, type] of kpiChecks) {
      const dbDisp  = type === 'count' ? dbVal.toString() : fmtCr(dbVal);
      const crdDisp = type === 'count' ? crdVal.toString() : fmtCr(crdVal);
      const diff    = type === 'count' ? Math.abs(dbVal - crdVal) : Math.abs(dbVal - crdVal);
      const match   = type === 'count' ? diff === 0 : diff < 100; // within ₹100
      console.log(`  │ ${label.padEnd(19)} │ ${dbDisp.padStart(15)} │ ${crdDisp.padStart(15)} │ ${(match ? 'MATCH' : 'DIFF=' + (type === 'count' ? diff : fmtL(diff) + 'L')).padStart(10)} │`);
    }
    console.log('  └─────────────────────┴─────────────────┴─────────────────┴────────────┘');

    // ── Monthly Trend (only Apr 2024) ──
    console.log('\n  MONTHLY TREND:');
    if (dashboard.monthly && dashboard.monthly.length > 0) {
      for (const m of dashboard.monthly) {
        console.log(`    ${m.month_label}: Net=${fmtCr(parseFloat(m.total_net))} Cr | Gross=${fmtCr(parseFloat(m.total_amount))} Cr | Inv=${m.invoice_count}`);
      }
      // Compare with CRD total (should be same since it's just Apr)
      const dbMonthNet = dashboard.monthly.reduce((s, m) => s + parseFloat(m.total_net || 0), 0);
      const diff = Math.abs(dbMonthNet - crdTotalNet);
      console.log(`    DB monthly total: ${fmtCr(dbMonthNet)} Cr vs CRD: ${fmtCr(crdTotalNet)} Cr | ${diff < 100 ? 'MATCH' : 'DIFF=' + fmtL(diff) + 'L'}`);
    }

    // ── Top 10 Customers (by gross) ──
    console.log('\n  TOP 10 CUSTOMERS (Gross Amount):');
    console.log('  ┌─────────────────────────────────────────────┬─────────────────┬─────────────────┬────────────┐');
    console.log('  │ Customer                                    │ Dashboard       │ CRD             │ Match?     │');
    console.log('  ├─────────────────────────────────────────────┼─────────────────┼─────────────────┼────────────┤');

    if (dashboard.customers) {
      for (const dc of dashboard.customers.slice(0, 10)) {
        const name = dc.customer_name || dc.name;
        const dbGross = parseFloat(dc.total_amount || dc.gross || 0);
        const crdC = crdByCust[name];
        const crdGross = crdC ? crdC.gross : 0;
        const diff = Math.abs(dbGross - crdGross);
        const match = diff < 100;
        console.log(`  │ ${(name || '').substring(0, 43).padEnd(43)} │ ${fmtCr(dbGross).padStart(15)} │ ${fmtCr(crdGross).padStart(15)} │ ${(match ? 'MATCH' : 'DIFF').padStart(10)} │`);
      }
    }
    console.log('  └─────────────────────────────────────────────┴─────────────────┴─────────────────┴────────────┘');

    // ── Customer pie chart (net amount) ──
    console.log('\n  CUSTOMER PIE CHART (Net Amount):');
    if (dashboard.customers_net) {
      for (const dc of dashboard.customers_net.slice(0, 10)) {
        const name = dc.customer_name || dc.name;
        const dbNet = parseFloat(dc.total_net || 0);
        const crdC = crdByCust[name];
        const crdNet = crdC ? crdC.net : 0;
        const diff = Math.abs(dbNet - crdNet);
        const match = diff < 100;
        console.log(`    ${(name || '').substring(0, 40).padEnd(40)} | DB=${fmtCr(dbNet)} | CRD=${fmtCr(crdNet)} | ${match ? 'MATCH' : 'DIFF=' + fmtL(diff) + 'L'}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // TAB 2: SALES DISTRIBUTION MAP
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(90));
    console.log('  TAB 2: SALES DISTRIBUTION MAP');
    console.log('═'.repeat(90));

    if (mapData.summary) {
      console.log(`\n  Map KPIs: States=${mapData.summary.states_covered} | Revenue=${fmtCr(parseFloat(mapData.summary.total_revenue || 0))} Cr | TopState=${mapData.summary.max_state_rev}`);
    }

    // CRD doesn't have state directly, but has Ship To Address City
    // Compare state-level from dashboard with CRD city aggregates
    if (mapData.states) {
      console.log('\n  STATE-WISE REVENUE (Dashboard):');
      for (const st of mapData.states.slice(0, 15)) {
        console.log(`    ${(st.state || st.ship_state || '').padEnd(25)} | Net=${fmtCr(parseFloat(st.total_net || st.revenue || 0))} Cr | Inv=${st.invoice_count || st.count || ''}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // TAB 3: INVOICE SUMMARY
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(90));
    console.log('  TAB 3: SALES INVOICE SUMMARY');
    console.log('═'.repeat(90));

    if (invoiceSummary.kpi) {
      const ik = invoiceSummary.kpi;
      console.log(`\n  Invoice Summary KPIs:`);
      console.log(`    Invoice Count:    DB=${ik.invoice_count} | CRD=${crdInvCount} | ${parseInt(ik.invoice_count) === crdInvCount ? 'MATCH' : 'DIFF'}`);
      console.log(`    Total Gross:      DB=${fmtCr(parseFloat(ik.total_gross || 0))} Cr | CRD=${fmtCr(crdTotalGross)} Cr`);
      console.log(`    Max Invoice:      DB=${fmtL(parseFloat(ik.max_invoice || 0))} L`);
      console.log(`    Unique Customers: DB=${ik.unique_customers}`);

      // CRD unique customers
      const crdUniqCust = new Set(crd.map(r => r.customerName)).size;
      console.log(`    Unique Customers: CRD=${crdUniqCust} | ${parseInt(ik.unique_customers) === crdUniqCust ? 'MATCH' : 'DIFF'}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // TAB 4: SALES SUMMARY ANALYSIS
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(90));
    console.log('  TAB 4: SALES SUMMARY ANALYSIS');
    console.log('═'.repeat(90));

    // Site trend for Apr 2024
    if (analysis.siteTrend) {
      console.log('\n  SITE-WISE (Domestic Pivot):');
      console.log('  ┌────────┬─────────────────┬─────────────────┬────────────┐');
      console.log('  │ Site   │ Dashboard (Cr)  │ CRD (Cr)        │ Match?     │');
      console.log('  ├────────┼─────────────────┼─────────────────┼────────────┤');

      const aprSites = analysis.siteTrend.filter(s => s.month_label && s.month_label.includes('Apr'));
      for (const st of aprSites) {
        const site = st.site || st.Site_;
        const dbNet = parseFloat(st.total_net || 0);
        const crdS = crdBySite[site];
        const crdNet = crdS ? crdS.net : 0;
        const diff = Math.abs(dbNet - crdNet);
        const match = diff < 100;
        console.log(`  │ ${(site || '').padEnd(6)} │ ${fmtCr(dbNet).padStart(15)} │ ${fmtCr(crdNet).padStart(15)} │ ${(match ? 'MATCH' : 'DIFF=' + fmtL(diff) + 'L').padStart(10)} │`);
      }
      console.log('  └────────┴─────────────────┴─────────────────┴────────────┘');
    }

    // ── Per-invoice spot check (random 20) ──
    console.log('\n' + '═'.repeat(90));
    console.log('  PER-INVOICE SPOT CHECK (all CRD invoices)');
    console.log('═'.repeat(90));

    // Fetch invoice list from dashboard
    const invListData = await apiFetch('/api/invoice-summary?' + params + '&page=1&limit=5000');
    const dbInvoices = invListData.invoices || invListData.data || [];

    // Build DB invoice map
    const dbInvMap = {};
    for (const inv of dbInvoices) {
      const key = inv.invoice_no || inv.Invoice_No_;
      if (key) dbInvMap[key] = inv;
    }

    let matchCount = 0, diffCount = 0, missingCount = 0;
    const diffs = [];

    for (const c of crd) {
      const dbI = dbInvMap[c.invoiceNo];
      if (!dbI) {
        missingCount++;
        if (missingCount <= 5) diffs.push({ inv: c.invoiceNo, reason: 'MISSING_FROM_DASHBOARD', crdNet: c.amount });
        continue;
      }
      const dbNet = parseFloat(dbI.net_amount || dbI.Amount_ || dbI.amount || 0);
      const d = Math.abs(dbNet - c.amount);
      if (d < 1) {
        matchCount++;
      } else {
        diffCount++;
        if (diffs.length < 20) diffs.push({ inv: c.invoiceNo, site: c.site, crdNet: c.amount, dbNet, diff: d });
      }
    }

    console.log(`\n  Results: MATCH=${matchCount} | DIFF=${diffCount} | MISSING=${missingCount} | TOTAL=${crd.length}`);
    if (diffs.length > 0) {
      console.log('  Differences:');
      for (const d of diffs) {
        console.log(`    ${(d.inv || '').padEnd(22)} | ${d.site || ''} | CRD=${(d.crdNet || 0).toFixed(2)} | DB=${(d.dbNet || 0).toFixed(2)} | ${d.reason || 'DIFF=' + d.diff.toFixed(2)}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // FINAL SUMMARY
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(90));
    console.log('  FINAL VALIDATION SUMMARY — APR 2024');
    console.log('═'.repeat(90));

    const netMatch   = Math.abs(parseFloat(kpi.total_net_amount) - crdTotalNet) < 100;
    const grossMatch = Math.abs(parseFloat(kpi.total_gross_amount) - crdTotalGross) < 100;
    const taxMatch   = Math.abs(parseFloat(kpi.total_tax) - crdTotalTax) < 100;
    const invMatch   = parseInt(kpi.total_invoices) === crdInvCount;

    console.log(`\n  Net Amount:    ${netMatch ? 'PASS' : 'FAIL'} | DB=${fmtCr(parseFloat(kpi.total_net_amount))} | CRD=${fmtCr(crdTotalNet)}`);
    console.log(`  Gross Amount:  ${grossMatch ? 'PASS' : 'FAIL'} | DB=${fmtCr(parseFloat(kpi.total_gross_amount))} | CRD=${fmtCr(crdTotalGross)}`);
    console.log(`  Tax:           ${taxMatch ? 'PASS' : 'FAIL'} | DB=${fmtCr(parseFloat(kpi.total_tax))} | CRD=${fmtCr(crdTotalTax)}`);
    console.log(`  Invoice Count: ${invMatch ? 'PASS' : 'FAIL'} | DB=${kpi.total_invoices} | CRD=${crdInvCount}`);
    console.log(`  Per-Invoice:   ${matchCount}/${crd.length} match (${diffCount} diff, ${missingCount} missing)`);

    const allPass = netMatch && grossMatch && taxMatch && invMatch && diffCount === 0 && missingCount === 0;
    console.log(`\n  OVERALL: ${allPass ? 'ALL PASS — Dashboard matches CRD exactly for Apr 2024' : 'DIFFERENCES FOUND — see details above'}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
