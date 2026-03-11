'use strict';
const fs   = require('fs');
const path = require('path');
const db   = require('./db/connection');

// Parse CSV manually (handles quoted fields)
function parseCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 2) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[h] = vals[idx] || '');
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && !inQ) { inQ = true; }
    else if (c === '"' && inQ && line[i+1] === '"') { cur += '"'; i++; }
    else if (c === '"' && inQ) { inQ = false; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

const num = v => { const n = parseFloat((v||'0').replace(/,/g,'')); return isNaN(n)?0:n; };

(async () => {
  try {
    const csvPath = 'C:/Users/hr/Downloads/mf_sales_si_siheader_2024_aug_all.csv';
    console.log('Reading CSV...');
    const rows = parseCSV(csvPath);
    console.log(`Total CSV rows: ${rows.length}`);

    // Focus on domestic sites, Aug 2024, Exported To GL
    const sites = ['URIMH','URIMP','URIPB','URIPU'];

    // ── 1. Status breakdown in CSV ─────────────────────────────────────────
    const statusMap = {};
    for (const r of rows) {
      const st = r['status'] || '?';
      statusMap[st] = (statusMap[st]||0)+1;
    }
    console.log('\n--- Status breakdown in CSV ---');
    for (const [st,cnt] of Object.entries(statusMap)) console.log(`  "${st}": ${cnt} rows`);

    // ── 2. Filter: domestic sites, not -R, Exported To GL ─────────────────
    const filtered = rows.filter(r =>
      sites.includes(r['site']) &&
      !r['invoice_no'].endsWith('-R') &&
      r['status'] === 'Exported To GL' &&
      r['invoice_type'] !== '0'
    );
    console.log(`\nFiltered rows (domestic, Exported To GL, not -R, type!=0): ${filtered.length}`);

    // ── 3. Invoice type breakdown in CSV ───────────────────────────────────
    const typeMap = {};
    for (const r of filtered) {
      const t = r['invoice_type']||'?';
      typeMap[t] = (typeMap[t]||0)+1;
    }
    console.log('\n--- Invoice Types in filtered CSV ---');
    for (const [t,cnt] of Object.entries(typeMap)) console.log(`  "${t}": ${cnt} rows`);

    // ── 4. Deduplicate: SUM(DISTINCT amount) per Invoice_No ───────────────
    // We need to mimic the DB's dedup logic: SUM(DISTINCT amount) per invoice
    // CSV has one row per invoice (header table), so we dedup by invoice_no
    const invMap = {};
    for (const r of filtered) {
      const inv  = r['invoice_no'];
      const amt  = num(r['amount']);
      const date = r['invoice_date_date'];
      const site = r['site'];
      const type = r['invoice_type'];
      if (!invMap[inv]) invMap[inv] = { amts: new Set(), date, site, type };
      invMap[inv].amts.add(amt);
    }

    // Sum of distinct amounts per invoice
    let csvTotal = 0;
    let csvByType = {};
    let csvBySite = {};
    const invList = Object.keys(invMap);
    for (const inv of invList) {
      const v   = invMap[inv];
      const net = [...v.amts].reduce((a,b)=>a+b, 0);
      csvTotal += net;
      csvByType[v.type] = (csvByType[v.type]||0) + net;
      if (!csvBySite[v.site]) csvBySite[v.site] = { amt:0, inv:0 };
      csvBySite[v.site].amt += net;
      csvBySite[v.site].inv++;
    }

    console.log(`\n--- CSV Totals (SUM DISTINCT amount per invoice) ---`);
    console.log(`  Total invoices: ${invList.length}`);
    console.log(`  Total amount: ${(csvTotal/1e7).toFixed(4)} Cr`);
    console.log('\n  By type:');
    for (const [t,v] of Object.entries(csvByType)) console.log(`    "${t}": ${(v/1e7).toFixed(4)} Cr`);
    console.log('\n  By site:');
    for (const s of sites) {
      const v = csvBySite[s];
      if (v) console.log(`    ${s}: ${v.inv} invoices | ${(v.amt/1e7).toFixed(4)} Cr`);
      else   console.log(`    ${s}: not in file`);
    }

    // ── 5. Compare with DB for Aug 2024 ───────────────────────────────────
    const dbRes = await db.query(`
      SELECT COALESCE("Site_",'?') AS site,
        COUNT(DISTINCT "Invoice_No_") AS invoices,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_", "Site_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-08-01'
          AND "Invoice_Date_(Date)" <= '2024-08-31'
        GROUP BY "Invoice_No_", "Site_"
      ) sub
      GROUP BY site ORDER BY site
    `);

    console.log(`\n--- DB vs CSV comparison (Aug 2024, ALL types, Exported To GL) ---`);
    let dbTotal = 0;
    for (const r of dbRes.rows) {
      const csvSite = csvBySite[r.site];
      const csvAmt  = csvSite ? csvSite.amt/1e7 : 0;
      const diff    = (parseFloat(r.net_cr) - csvAmt).toFixed(4);
      console.log(`  ${r.site}: DB=${r.net_cr} Cr | CSV=${csvAmt.toFixed(4)} Cr | diff=${diff} | inv=${r.invoices}`);
      dbTotal += parseFloat(r.net_cr);
    }
    const csvTotalCr = csvTotal/1e7;
    console.log(`  TOTAL: DB=${dbTotal.toFixed(4)} Cr | CSV=${csvTotalCr.toFixed(4)} Cr | diff=${(dbTotal-csvTotalCr).toFixed(4)} Cr`);

    // ── 6. Check if any CSV invoices have multiple distinct amounts ────────
    const multiAmt = invList.filter(inv => invMap[inv].amts.size > 1);
    console.log(`\n--- Invoices with multiple distinct amounts in CSV: ${multiAmt.length} ---`);
    for (const inv of multiAmt.slice(0, 10)) {
      const v = invMap[inv];
      console.log(`  ${inv}: amounts=${[...v.amts].join(', ')} | type=${v.type} | site=${v.site}`);
    }

    // ── 7. Invoices in DB but not in CSV (timing difference candidates) ────
    const dbInvRes = await db.query(`
      SELECT DISTINCT "Invoice_No_", "Site_", "Invoice_Type_",
        ARRAY_AGG(DISTINCT "Status_") AS statuses
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= '2024-08-01'
        AND "Invoice_Date_(Date)" <= '2024-08-31'
      GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    `);

    const dbInvSet = new Set(dbInvRes.rows.map(r => r['Invoice_No_']));
    const csvInvSet = new Set(invList);

    const inDbNotCsv = [...dbInvSet].filter(i => !csvInvSet.has(i));
    const inCsvNotDb = [...csvInvSet].filter(i => !dbInvSet.has(i));

    console.log(`\n--- Invoice coverage gap ---`);
    console.log(`  DB invoices: ${dbInvSet.size} | CSV invoices: ${csvInvSet.size}`);
    console.log(`  In DB but NOT in CSV: ${inDbNotCsv.length}`);
    console.log(`  In CSV but NOT in DB: ${inCsvNotDb.length}`);

    if (inDbNotCsv.length > 0) {
      // Get amounts for these invoices from DB
      const amtRes = await db.query(`
        SELECT "Invoice_No_", "Site_", "Invoice_Type_",
          ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" = ANY($1)
        GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
        ORDER BY "Invoice_Type_", "Invoice_No_"
      `, [inDbNotCsv]);
      console.log(`\n  Invoices in DB but missing from CSV (potential timing diff):`);
      let missingTotal = 0;
      const missingByType = {};
      for (const r of amtRes.rows) {
        const v = parseFloat(r.net_cr);
        missingByType[r['Invoice_Type_']] = (missingByType[r['Invoice_Type_']]||0) + v;
        missingTotal += v;
        console.log(`    ${r['Invoice_No_']} | ${r['Site_']} | ${r['Invoice_Type_']} | ${r.net_cr} Cr`);
      }
      console.log(`\n  Missing total: ${missingTotal.toFixed(4)} Cr`);
      console.log(`  By type: ${JSON.stringify(Object.fromEntries(Object.entries(missingByType).map(([k,v])=>[k,v.toFixed(4)])))}`);
    }

    if (inCsvNotDb.length > 0) {
      console.log(`\n  Invoices in CSV but missing from DB:`);
      for (const inv of inCsvNotDb.slice(0,10)) {
        const v = invMap[inv];
        console.log(`    ${inv} | ${v.site} | ${v.type} | amt=${[...v.amts].join(',')} | date=${v.date}`);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
