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
  return rows;
}

function parseCSVLine(line) {
  const result = []; let cur = '', inQ = false;
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
const DOMESTIC = new Set(['URIMH','URIMP','URIPB','URIPU']);
const ALL_SITES = new Set(['URIMH','URIMP','URIPB','URIPU','URIFB']);
const CRD_REF   = 14.79;

const rows = parseCSV('C:/Users/hr/Downloads/mf_sales_si_siheader_2024_aug_all.csv');
console.log(`Total CSV rows: ${rows.length}`);

// Print all unique statuses and types
const statuses = [...new Set(rows.map(r => r.status))].filter(s => !s.includes('\n') && s.length < 30);
const types    = [...new Set(rows.map(r => r.invoice_type))].filter(t => t.length < 40);
console.log('\nAll statuses:', statuses.join(' | '));
console.log('All types:   ', types.join(' | '));

// Dedup function: group by invoice_no, apply dedup strategy
function calcTotal(filteredRows, col, dedupFn) {
  const groups = {};
  for (const r of filteredRows) {
    const inv = r.invoice_no;
    if (!groups[inv]) groups[inv] = [];
    groups[inv].push(num(r[col]));
  }
  let total = 0;
  for (const amts of Object.values(groups)) total += dedupFn(amts);
  return total / 1e7;
}

const dedupStrategies = {
  'SUM_DISTINCT': amts => [...new Set(amts)].reduce((a,b)=>a+b,0),
  'MAX':          amts => Math.max(...amts),
  'LAST':         amts => amts[amts.length-1],
  'FIRST_NONZERO':amts => amts.find(a=>a!==0) || 0,
  'MAX_NONZERO':  amts => Math.max(...amts.filter(a=>a!==0), 0),
  'SUM_ALL':      amts => amts.reduce((a,b)=>a+b,0),
};

// Filter combinations
const filterSets = {
  'Exported_domestic_notR_type!=0':       r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && r.status==='Exported To GL' && r.invoice_type!=='0' && r.invoice_type!=='',
  'Exported_domestic_notR_CommOnly':       r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && r.status==='Exported To GL' && r.invoice_type==='Sales ( Commercial )',
  'Exported_domestic_notR_CommReturn':     r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && r.status==='Exported To GL' && ['Sales ( Commercial )','Sales Return'].includes(r.invoice_type),
  'Exported_allSites_notR_type!=0':        r => ALL_SITES.has(r.site) && !r.invoice_no.endsWith('-R') && r.status==='Exported To GL' && r.invoice_type!=='0' && r.invoice_type!=='',
  'Exported+Approved_domestic_notR':       r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && ['Exported To GL','Approved'].includes(r.status) && r.invoice_type!=='0' && r.invoice_type!=='',
  'Exported+Approved_domestic_CommOnly':   r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && ['Exported To GL','Approved'].includes(r.status) && r.invoice_type==='Sales ( Commercial )',
  'Exported_domestic_withR_type!=0':       r => DOMESTIC.has(r.site) && r.status==='Exported To GL' && r.invoice_type!=='0' && r.invoice_type!=='',
  'Exported+Reverted_domestic_notR':       r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && ['Exported To GL','Reverted'].includes(r.status) && r.invoice_type!=='0' && r.invoice_type!=='',
  'AllStatus_domestic_notR_type!=0':       r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && r.status!=='0' && r.invoice_type!=='0' && r.invoice_type!=='',
};

console.log('\n' + '='.repeat(120));
console.log('ALL SCENARIOS — target CRD = 14.79 Cr   (diff < 0.01 marked ✓)');
console.log('='.repeat(120));
console.log(`${'Filter'.padEnd(45)} | ${'Dedup'.padEnd(15)} | ${'Col'.padEnd(15)} | ${'Total Cr'.padEnd(10)} | Diff from CRD`);
console.log('-'.repeat(120));

const matches = [];

for (const [filterName, filterFn] of Object.entries(filterSets)) {
  const filtered = rows.filter(filterFn);
  const invCount = new Set(filtered.map(r=>r.invoice_no)).size;

  for (const [dedupName, dedupFn] of Object.entries(dedupStrategies)) {
    for (const col of ['amount','net_amount','final_net_amount']) {
      const total = calcTotal(filtered, col, dedupFn);
      const diff  = (total - CRD_REF).toFixed(4);
      const mark  = Math.abs(total - CRD_REF) < 0.01 ? ' ✓ MATCH' : (Math.abs(total - CRD_REF) < 0.02 ? ' ~ close' : '');
      if (mark) {
        matches.push({ filterName, dedupName, col, total, diff, invCount });
        console.log(`${filterName.padEnd(45)} | ${dedupName.padEnd(15)} | ${col.padEnd(15)} | ${total.toFixed(4).padEnd(10)} | ${diff}${mark}   [${invCount} inv]`);
      }
    }
  }
}

if (matches.length === 0) {
  console.log('No scenario matched within 0.02 Cr of CRD (14.79). Showing closest 10:');
  console.log('-'.repeat(120));

  const allResults = [];
  for (const [filterName, filterFn] of Object.entries(filterSets)) {
    const filtered = rows.filter(filterFn);
    const invCount = new Set(filtered.map(r=>r.invoice_no)).size;
    for (const [dedupName, dedupFn] of Object.entries(dedupStrategies)) {
      for (const col of ['amount','net_amount','final_net_amount']) {
        const total = calcTotal(filtered, col, dedupFn);
        allResults.push({ filterName, dedupName, col, total, invCount, diff: Math.abs(total - CRD_REF) });
      }
    }
  }
  allResults.sort((a,b) => a.diff - b.diff);
  for (const r of allResults.slice(0, 15)) {
    console.log(`${r.filterName.padEnd(45)} | ${r.dedupName.padEnd(15)} | ${r.col.padEnd(15)} | ${r.total.toFixed(4).padEnd(10)} | diff=${( r.total - CRD_REF).toFixed(4)}   [${r.invCount} inv]`);
  }
}

// ── Deep dive: show site-level breakdown for the current formula vs CRD ───
console.log('\n' + '='.repeat(90));
console.log('SITE-LEVEL BREAKDOWN — current formula (Exported, domestic, notR, type!=0, SUM_DISTINCT, amount)');
console.log('='.repeat(90));
const baseFilter = rows.filter(r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && r.status==='Exported To GL' && r.invoice_type!=='0' && r.invoice_type!=='');
for (const site of ['URIMH','URIMP','URIPB','URIPU']) {
  const siteRows = baseFilter.filter(r => r.site === site);
  const groups = {};
  for (const r of siteRows) {
    if (!groups[r.invoice_no]) groups[r.invoice_no] = new Set();
    groups[r.invoice_no].add(num(r.amount));
  }
  const total = Object.values(groups).reduce((acc,s) => acc + [...s].reduce((a,b)=>a+b,0), 0);
  console.log(`  ${site}: ${Object.keys(groups).length} invoices | ${(total/1e7).toFixed(4)} Cr`);
}

// ── Show all distinct statuses with their amounts ──────────────────────────
console.log('\n' + '='.repeat(90));
console.log('STATUS × AMOUNT BREAKDOWN — domestic, notR, type!=0, SUM_DISTINCT, amount col');
console.log('='.repeat(90));
const allDomestic = rows.filter(r => DOMESTIC.has(r.site) && !r.invoice_no.endsWith('-R') && r.invoice_type!=='0' && r.invoice_type!=='');
const byStatus = {};
for (const r of allDomestic) {
  const st = r.status.length < 25 ? r.status : r.status.substring(0,24)+'...';
  if (!byStatus[st]) byStatus[st] = {};
  if (!byStatus[st][r.invoice_no]) byStatus[st][r.invoice_no] = new Set();
  byStatus[st][r.invoice_no].add(num(r.amount));
}
let cumTotal = 0;
for (const [st, invMap] of Object.entries(byStatus)) {
  const total = Object.values(invMap).reduce((acc,s) => acc+[...s].reduce((a,b)=>a+b,0), 0);
  cumTotal += total;
  const invCount = Object.keys(invMap).length;
  console.log(`  "${st}": ${invCount} invoices | ${(total/1e7).toFixed(4)} Cr`);
}
// Show cumulative when Exported + each other status is added
console.log('\n  --- Cumulative if we add statuses to Exported To GL ---');
const exportedAmt = Object.values(byStatus['Exported To GL']||{}).reduce((acc,s)=>acc+[...s].reduce((a,b)=>a+b,0),0)/1e7;
console.log(`  Exported To GL only            : ${exportedAmt.toFixed(4)} Cr  | diff from CRD = ${(exportedAmt - CRD_REF).toFixed(4)}`);
for (const [st, invMap] of Object.entries(byStatus)) {
  if (st === 'Exported To GL') continue;
  const addAmt = Object.values(invMap).reduce((acc,s)=>acc+[...s].reduce((a,b)=>a+b,0),0)/1e7;
  const combined = exportedAmt + addAmt;
  console.log(`  + "${st}" (${(addAmt).toFixed(4)} Cr) → ${combined.toFixed(4)} Cr | diff = ${(combined - CRD_REF).toFixed(4)}`);
}
