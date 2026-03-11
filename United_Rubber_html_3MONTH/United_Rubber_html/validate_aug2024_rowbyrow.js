'use strict';
const fs = require('fs');

function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 5) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim());
    rows.push(obj);
  }
  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inQ) { inQ = true; }
    else if (c === '"' && inQ && line[i+1] === '"') { cur += '"'; i++; }
    else if (c === '"' && inQ) { inQ = false; }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

const num = v => { const n = parseFloat((v||'').replace(/,/g,'')); return isNaN(n) ? 0 : n; };

const SITES = new Set(['URIMH','URIMP','URIPB','URIPU']);

const { headers, rows } = parseCSV('C:/Users/hr/Downloads/mf_sales_si_siheader_2024_aug_all.csv');

// Available amount columns from CSV
const amtCols = ['amount','net_amount','final_net_amount','invoice_amount','base_amount','rounded_amount'];

// Filter: domestic, Exported To GL, not -R, type != 0
const filtered = rows.filter(r =>
  SITES.has(r.site) &&
  !r.invoice_no.endsWith('-R') &&
  r.status === 'Exported To GL' &&
  r.invoice_type !== '0' &&
  r.invoice_type !== ''
);
console.log(`Filtered rows: ${filtered.length}`);

// ── Method 1: Group by invoice_no, collect all rows ────────────────────────
// For each invoice, collect all distinct values of each amount column
const invGroups = {};
for (const r of filtered) {
  const inv = r.invoice_no;
  if (!invGroups[inv]) invGroups[inv] = { rows: [], type: r.invoice_type, site: r.site };
  invGroups[inv].rows.push(r);
}
const invList = Object.keys(invGroups);
console.log(`Unique invoices: ${invList.length}\n`);

// ── Method 2: For each column, try 3 dedup strategies ─────────────────────
console.log('='.repeat(75));
console.log('TOTAL BY COLUMN AND DEDUP METHOD (Cr)');
console.log('='.repeat(75));
console.log(`${'Column'.padEnd(22)} | ${'SUM(DISTINCT)'.padEnd(14)} | ${'LAST ROW'.padEnd(14)} | ${'FIRST ROW'.padEnd(14)} | SIMPLE SUM`);
console.log('-'.repeat(75));

for (const col of amtCols) {
  let sumDistinct = 0, lastRow = 0, firstRow = 0, simpleSum = 0;

  for (const inv of invList) {
    const grp = invGroups[inv];
    const allAmts = grp.rows.map(r => num(r[col]));
    const distinctAmts = [...new Set(allAmts)];

    // SUM(DISTINCT)
    sumDistinct += distinctAmts.reduce((a,b) => a+b, 0);
    // Last row
    lastRow += num(grp.rows[grp.rows.length-1][col]);
    // First row
    firstRow += num(grp.rows[0][col]);
    // Simple sum (no dedup)
    simpleSum += allAmts.reduce((a,b) => a+b, 0);
  }

  const fmt = v => (v/1e7).toFixed(4).padEnd(14);
  const mark = v => {
    const cr = v/1e7;
    if (Math.abs(cr - 14.79) < 0.005) return ' ← MATCHES CRD!';
    if (Math.abs(cr - 14.7759) < 0.005) return ' ← matches DB';
    return '';
  };
  console.log(`${col.padEnd(22)} | ${fmt(sumDistinct)}| ${fmt(lastRow)}| ${fmt(firstRow)}| ${(simpleSum/1e7).toFixed(4)}${mark(sumDistinct)}`);
}

// ── Method 3: Identify invoices with DIFFERENT amounts across rows ─────────
console.log('\n' + '='.repeat(75));
console.log('INVOICES WHERE ROWS HAVE DIFFERENT "amount" VALUES');
console.log('='.repeat(75));

let multiAmtCount = 0;
let multiAmtDiff  = 0;
const multiAmtList = [];

for (const inv of invList) {
  const grp = invGroups[inv];
  const allAmts = grp.rows.map(r => num(r.amount));
  const nonZero = allAmts.filter(a => a !== 0);
  const distinctNonZero = [...new Set(nonZero)];

  if (distinctNonZero.length > 1) {
    const sumD = [...new Set(allAmts)].reduce((a,b) => a+b, 0);
    const last  = num(grp.rows[grp.rows.length-1].amount);
    const first = num(grp.rows[0].amount);
    multiAmtList.push({ inv, type: grp.type, site: grp.site, distinctNonZero, sumD, last, first, rowCount: grp.rows.length });
    multiAmtCount++;
    multiAmtDiff += (sumD - last); // diff between SUM(DISTINCT) and LAST
  }
}

console.log(`Invoices with multiple distinct non-zero amounts: ${multiAmtCount}`);
console.log(`Total extra amount from SUM(DISTINCT) vs LAST: ${(multiAmtDiff/1e7).toFixed(4)} Cr\n`);

for (const v of multiAmtList.slice(0, 30)) {
  console.log(`  ${v.inv} | ${v.site} | ${v.type}`);
  console.log(`    amounts: [${v.distinctNonZero.join(', ')}]  |  SUM(DISTINCT)=${(v.sumD/1e7).toFixed(6)} Cr  |  LAST=${(v.last/1e7).toFixed(6)} Cr  |  rows=${v.rowCount}`);
}

// ── Method 4: Check rows per invoice distribution ─────────────────────────
console.log('\n' + '='.repeat(75));
console.log('ROWS PER INVOICE DISTRIBUTION');
console.log('='.repeat(75));
const rowCountDist = {};
for (const inv of invList) {
  const n = invGroups[inv].rows.length;
  rowCountDist[n] = (rowCountDist[n]||0) + 1;
}
for (const [n, count] of Object.entries(rowCountDist).sort((a,b)=>a[0]-b[0])) {
  console.log(`  ${n} rows: ${count} invoices`);
}

// ── Method 5: SUM(DISTINCT) vs LAST-ROW difference per site ───────────────
console.log('\n' + '='.repeat(75));
console.log('SUM(DISTINCT) vs LAST-ROW  — by site (using "amount" column)');
console.log('='.repeat(75));
const bySite = {};
for (const inv of invList) {
  const grp  = invGroups[inv];
  const site = grp.site;
  if (!bySite[site]) bySite[site] = { sumD: 0, last: 0, inv: 0 };
  const allAmts = grp.rows.map(r => num(r.amount));
  bySite[site].sumD += [...new Set(allAmts)].reduce((a,b)=>a+b,0);
  bySite[site].last += num(grp.rows[grp.rows.length-1].amount);
  bySite[site].inv++;
}
let totalSumD = 0, totalLast = 0;
for (const [site, v] of Object.entries(bySite)) {
  const diff = ((v.sumD - v.last)/1e7).toFixed(6);
  console.log(`  ${site}: SUM(DISTINCT)=${(v.sumD/1e7).toFixed(4)} | LAST=${(v.last/1e7).toFixed(4)} | diff=${diff} Cr | inv=${v.inv}`);
  totalSumD += v.sumD; totalLast += v.last;
}
console.log(`  TOTAL: SUM(DISTINCT)=${(totalSumD/1e7).toFixed(4)} | LAST=${(totalLast/1e7).toFixed(4)} | diff=${((totalSumD-totalLast)/1e7).toFixed(6)} Cr`);

console.log(`\nCRD Reference: 14.79 Cr`);
console.log(`Difference from CRD: SUM(DISTINCT)=${((totalSumD/1e7)-14.79).toFixed(4)} | LAST=${((totalLast/1e7)-14.79).toFixed(4)}`);
