'use strict';
const fs = require('fs');
const http = require('http');

function parseCSVLine(line) {
  const fields = []; let field = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { fields.push(field.trim()); field = ''; continue; }
    field += ch;
  }
  fields.push(field.trim());
  return fields;
}

function apiFetch(path) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:3000' + path, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const num = v => parseFloat((v || '0').replace(/,/g, '')) || 0;
  const raw = fs.readFileSync('./Validation_Month_csv/Apr_2024.csv', 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());

  // CRD has city not state — but dashboard has state. Let's compare totals and city qty chart.
  const byCity = {};
  let totalNet = 0, totalGross = 0;
  for (let i = 1; i < lines.length; i++) {
    const v = parseCSVLine(lines[i]);
    if (!v[1]) continue;
    const city = v[10] || 'Unknown';
    const net = num(v[5]), gross = num(v[7]);
    totalNet += net; totalGross += gross;
    if (!byCity[city]) byCity[city] = { net: 0, gross: 0, count: 0 };
    byCity[city].net += net; byCity[city].gross += gross; byCity[city].count++;
  }

  // Dashboard map API
  const map = await apiFetch('/api/sales-map?status=Exported+To+GL&date_from=2024-04-01&date_to=2024-04-30');

  console.log('═'.repeat(90));
  console.log('  MAP TAB VALIDATION — APR 2024');
  console.log('═'.repeat(90));

  // KPI: Total Revenue
  console.log('\n  MAP KPIs:');
  console.log(`    States Covered:  ${map.summary.states_covered}`);
  console.log(`    Total Revenue:   DB=${(map.summary.total_revenue / 1e7).toFixed(4)} Cr | CRD=${(totalGross / 1e7).toFixed(4)} Cr | ${Math.abs(map.summary.total_revenue - totalGross) < 100 ? 'MATCH' : 'DIFF'}`);

  // State-wise from dashboard
  console.log('\n  STATE-WISE REVENUE:');
  let dbStateTotal = 0;
  for (const s of map.states) {
    const gross = parseFloat(s.total_amount);
    const net = parseFloat(s.net_amount);
    dbStateTotal += gross;
    console.log(`    ${s.state.padEnd(40)} | Gross=${(gross / 1e7).toFixed(4)} Cr | Net=${(net / 1e7).toFixed(4)} Cr | Inv=${s.invoice_count}`);
  }
  console.log(`    TOTAL: ${(dbStateTotal / 1e7).toFixed(4)} Cr`);

  // City qty chart from dashboard
  console.log('\n  CITY QTY CHART (Dashboard vs CRD invoice count):');
  console.log('  ┌──────────────────────────────┬───────────────┬───────────────┬──────────┐');
  console.log('  │ City                         │ DB Inv Count  │ CRD Inv Count │ Match?   │');
  console.log('  ├──────────────────────────────┼───────────────┼───────────────┼──────────┤');

  for (const c of map.cities) {
    const crdC = byCity[c.city];
    const crdCount = crdC ? crdC.count : 0;
    const dbCount = parseInt(c.invoice_count);
    const match = dbCount === crdCount;
    console.log(`  │ ${(c.city || '').padEnd(28)} │ ${String(dbCount).padStart(13)} │ ${String(crdCount).padStart(13)} │ ${(match ? 'MATCH' : 'DIFF').padStart(8)} │`);
  }
  console.log('  └──────────────────────────────┴───────────────┴───────────────┴──────────┘');

  // Also check: CRD top cities by gross (not in dashboard chart, but for verification)
  console.log('\n  CRD TOP CITIES BY GROSS:');
  const sortedCities = Object.entries(byCity).sort((a, b) => b[1].gross - a[1].gross);
  for (const [city, v] of sortedCities.slice(0, 15)) {
    console.log(`    ${city.padEnd(30)} | Gross=${(v.gross / 1e7).toFixed(4)} Cr | Inv=${v.count}`);
  }

  process.exit(0);
})();
