'use strict';

const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
});

const SCHEMA = process.env.DB_SCHEMA || 'LandingStage2';
const HDR = `"${SCHEMA}"."mf_sales_si_siheader_all"`;

async function main() {
  // ── Read CRD xlsx ──────────────────────────────────────────────────────
  const xlPath = path.join(__dirname, 'Validation_Month_csv', 'Jul_2025.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlPath);
  const ws = wb.worksheets[0];

  // Col 1: Site | Col 2: Invoice No | Col 13: Item Amount (net) | Col 14: Item Net Amount (gross)
  // Col 19: Invoice Type
  const invoiceMap = {};
  const typeCounts = {};

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const invoiceNo = String(row.getCell(2).value || '').trim();
    if (!invoiceNo) continue;

    const site = String(row.getCell(1).value || '').trim();
    const itemAmt = parseFloat(row.getCell(13).value) || 0;
    const itemNet = parseFloat(row.getCell(14).value) || 0;
    const invType = String(row.getCell(19).value || '').trim();

    if (!invoiceMap[invoiceNo]) {
      invoiceMap[invoiceNo] = { site, net: 0, gross: 0, type: invType };
    }
    invoiceMap[invoiceNo].net += itemAmt;
    invoiceMap[invoiceNo].gross += itemNet;

    typeCounts[invType] = (typeCounts[invType] || 0) + 1;
  }

  // ── CRD Invoice Type breakdown ────────────────────────────────────────
  console.log('=== CRD INVOICE TYPES (item rows) ===');
  for (const [t, c] of Object.entries(typeCounts).sort()) {
    console.log(`  "${t}": ${c} rows`);
  }

  // Invoice-level type breakdown
  const invTypeCounts = {};
  for (const [inv, d] of Object.entries(invoiceMap)) {
    invTypeCounts[d.type] = (invTypeCounts[d.type] || 0) + 1;
  }
  console.log('\n=== CRD INVOICE TYPES (unique invoices) ===');
  for (const [t, c] of Object.entries(invTypeCounts).sort()) {
    console.log(`  "${t}": ${c} invoices`);
  }

  // ── Filter CRD: Sales (Commercial) only ───────────────────────────────
  const crdBySite = {};
  let crdTotal = 0, crdGrossTotal = 0, crdInvCount = 0;

  for (const [inv, d] of Object.entries(invoiceMap)) {
    if (d.type !== 'Sales ( Commercial )') continue;
    if (!crdBySite[d.site]) crdBySite[d.site] = { net: 0, gross: 0, count: 0 };
    crdBySite[d.site].net += d.net;
    crdBySite[d.site].gross += d.gross;
    crdBySite[d.site].count++;
    crdTotal += d.net;
    crdGrossTotal += d.gross;
    crdInvCount++;
  }

  console.log('\n=== CRD — Sales (Commercial) Only ===');
  for (const [site, d] of Object.entries(crdBySite).sort()) {
    console.log(`  ${site}: Net=${(d.net / 1e7).toFixed(4)} Cr | Gross=${(d.gross / 1e7).toFixed(4)} Cr | Inv=${d.count}`);
  }
  console.log(`  TOTAL: Net=${(crdTotal / 1e7).toFixed(4)} Cr | Gross=${(crdGrossTotal / 1e7).toFixed(4)} Cr | Inv=${crdInvCount}`);

  // ── DB: Jul 2025, Exported To GL, Sales (Commercial) only ─────────────
  console.log('\n=== DB — Exported To GL + Sales (Commercial) Only ===');

  const sqlDB = `
    WITH deduped AS (
      SELECT DISTINCT ON ("Invoice_No_")
        "Invoice_No_", "Site_",
        COALESCE(NULLIF("Amount_",'')::NUMERIC, 0) AS net,
        COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0) AS gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Type_" = 'Sales ( Commercial )'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      ORDER BY "Invoice_No_", "row_id" DESC
    )
    SELECT "Site_" AS site, SUM(net) AS net, SUM(gross) AS gross, COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `;
  const rDB = await pool.query(sqlDB);
  const dbBySite = {};

  for (const row of rDB.rows) {
    dbBySite[row.site] = { net: parseFloat(row.net), gross: parseFloat(row.gross), count: parseInt(row.inv) };
    console.log(`  ${row.site}: Net=${(parseFloat(row.net) / 1e7).toFixed(4)} Cr | Gross=${(parseFloat(row.gross) / 1e7).toFixed(4)} Cr | Inv=${row.inv}`);
  }

  // ── Also try SUM(DISTINCT) method for same filter ─────────────────────
  console.log('\n=== DB — SUM(DISTINCT) method, Exported + Commercial ===');
  const sqlSD = `
    WITH deduped AS (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS gross
      FROM ${HDR}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Type_" = 'Sales ( Commercial )'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)", "Site_"
    )
    SELECT "Site_" AS site, SUM(net) AS net, SUM(gross) AS gross, COUNT(*) AS inv
    FROM deduped GROUP BY "Site_" ORDER BY "Site_"
  `;
  const rSD = await pool.query(sqlSD);
  const sdBySite = {};
  for (const row of rSD.rows) {
    sdBySite[row.site] = { net: parseFloat(row.net), gross: parseFloat(row.gross), count: parseInt(row.inv) };
    console.log(`  ${row.site}: Net=${(parseFloat(row.net) / 1e7).toFixed(4)} Cr | Gross=${(parseFloat(row.gross) / 1e7).toFixed(4)} Cr | Inv=${row.inv}`);
  }

  // ── COMPARISON TABLE ──────────────────────────────────────────────────
  console.log('\n' + '='.repeat(100));
  console.log('  VALIDATION: Jul 2025 — Sales (Commercial) + Exported To GL');
  console.log('='.repeat(100));
  console.log(`  ${'Site'.padEnd(8)} | ${'DB DIST_ON'.padStart(12)} | ${'DB SUM_DIST'.padStart(12)} | ${'CRD'.padStart(12)} | ${'Diff(DO)'.padStart(10)} | ${'Diff(SD)'.padStart(10)} | ${'DO Status'.padEnd(8)} | ${'SD Status'}`);
  console.log(`  ${'-'.repeat(95)}`);

  const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];
  let sumDO = 0, sumSD = 0, sumCRD = 0;

  for (const site of sites) {
    const db = dbBySite[site] || { net: 0, count: 0 };
    const sd = sdBySite[site] || { net: 0, count: 0 };
    const crd = crdBySite[site] || { net: 0, count: 0 };

    const doCr = (db.net / 1e7).toFixed(2);
    const sdCr = (sd.net / 1e7).toFixed(2);
    const crdCr = (crd.net / 1e7).toFixed(2);
    const diffDO = (db.net / 1e7 - crd.net / 1e7).toFixed(2);
    const diffSD = (sd.net / 1e7 - crd.net / 1e7).toFixed(2);
    const stDO = doCr === crdCr ? 'MATCH' : Math.abs(parseFloat(diffDO)) <= 0.01 ? 'ROUND' : 'GAP';
    const stSD = sdCr === crdCr ? 'MATCH' : Math.abs(parseFloat(diffSD)) <= 0.01 ? 'ROUND' : 'GAP';

    console.log(`  ${site.padEnd(8)} | ${doCr.padStart(12)} | ${sdCr.padStart(12)} | ${crdCr.padStart(12)} | ${diffDO.padStart(10)} | ${diffSD.padStart(10)} | ${stDO.padEnd(8)} | ${stSD}`);
    sumDO += db.net; sumSD += sd.net; sumCRD += crd.net;
  }
  console.log(`  ${'-'.repeat(95)}`);
  console.log(`  ${'TOTAL'.padEnd(8)} | ${(sumDO / 1e7).toFixed(2).padStart(12)} | ${(sumSD / 1e7).toFixed(2).padStart(12)} | ${(sumCRD / 1e7).toFixed(2).padStart(12)} | ${((sumDO - sumCRD) / 1e7).toFixed(2).padStart(10)} | ${((sumSD - sumCRD) / 1e7).toFixed(2).padStart(10)} |`);

  // ── Invoice count comparison ──────────────────────────────────────────
  console.log('\n=== INVOICE COUNT COMPARISON ===');
  for (const site of sites) {
    const db = dbBySite[site] || { count: 0 };
    const sd = sdBySite[site] || { count: 0 };
    const crd = crdBySite[site] || { count: 0 };
    console.log(`  ${site}: DB(DIST_ON)=${db.count} | DB(SUM_DIST)=${sd.count} | CRD=${crd.count}`);
  }

  // ── Find invoices in CRD (Commercial) but NOT Exported in DB ──────────
  console.log('\n=== CRD COMMERCIAL INVOICES — DB STATUS CHECK ===');
  const commercialInvs = Object.entries(invoiceMap).filter(([, d]) => d.type === 'Sales ( Commercial )');
  const invList = commercialInvs.map(([inv]) => inv);

  // Query DB status for all CRD commercial invoices
  const chunkSize = 500;
  const dbStatusMap = {};
  for (let i = 0; i < invList.length; i += chunkSize) {
    const chunk = invList.slice(i, i + chunkSize);
    const ph = chunk.map((_, idx) => `$${idx + 1}`).join(',');
    const r = await pool.query(`
      SELECT "Invoice_No_", MAX("Status_") AS status, "Site_",
        MAX(COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net
      FROM ${HDR}
      WHERE "Invoice_No_" IN (${ph}) AND "Invoice_No_" NOT LIKE '%-R'
      GROUP BY "Invoice_No_", "Site_"
    `, chunk);
    for (const row of r.rows) {
      dbStatusMap[row.Invoice_No_] = { status: row.status, site: row.Site_, net: parseFloat(row.net) };
    }
  }

  // Breakdown
  const statusBreak = {};
  for (const [inv, crd] of commercialInvs) {
    const db = dbStatusMap[inv];
    const status = db ? db.status : 'NOT_IN_DB';
    const site = crd.site;
    const key = `${site}|${status}`;
    if (!statusBreak[key]) statusBreak[key] = { count: 0, crdNet: 0 };
    statusBreak[key].count++;
    statusBreak[key].crdNet += crd.net;
  }

  for (const site of sites) {
    console.log(`\n  ${site}:`);
    for (const [key, d] of Object.entries(statusBreak).sort()) {
      if (!key.startsWith(site + '|')) continue;
      const status = key.split('|')[1];
      const marker = status === 'Exported To GL' ? '' : ' <<<';
      console.log(`    ${status.padEnd(20)} | Inv=${String(d.count).padStart(4)} | CRD Net=${(d.crdNet / 1e7).toFixed(4)} Cr${marker}`);
    }
  }

  // ── Per-invoice amount comparison for Exported Commercial ─────────────
  console.log('\n\n=== EXPORTED COMMERCIAL — PER-INVOICE AMOUNT CHECK ===');
  let matchCount = 0, diffCount = 0;
  const diffs = [];

  for (const [inv, crd] of commercialInvs) {
    const db = dbStatusMap[inv];
    if (!db || db.status !== 'Exported To GL') continue;

    const diff = Math.abs(crd.net - db.net);
    if (diff < 1) {
      matchCount++;
    } else {
      diffCount++;
      diffs.push({ inv, site: crd.site, crdNet: crd.net, dbNet: db.net, diff });
    }
  }

  console.log(`Amount match (within ₹1): ${matchCount}`);
  console.log(`Amount differs (>₹1): ${diffCount}`);

  if (diffCount > 0) {
    diffs.sort((a, b) => b.diff - a.diff);
    console.log('\nInvoices with amount difference:');
    for (const d of diffs.slice(0, 20)) {
      console.log(`  ${d.inv} | ${d.site} | CRD=${d.crdNet.toFixed(2)} | DB=${d.dbNet.toFixed(2)} | Diff=${d.diff.toFixed(2)}`);
    }
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
