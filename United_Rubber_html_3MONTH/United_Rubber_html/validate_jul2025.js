'use strict';

const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const path = require('path');

require('dotenv').config();

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '25060', 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA = process.env.DB_SCHEMA || 'LandingStage2';
const TABLE = `"${SCHEMA}"."mf_sales_si_siheader_all"`;

async function main() {
  // ── Step 1: Read Jul_2025.xlsx ─────────────────────────────────────────
  const xlPath = path.join(__dirname, 'Validation_Month_csv', 'Jul_2025.xlsx');
  console.log('Reading:', xlPath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlPath);
  const ws = wb.worksheets[0];
  console.log(`Sheet: "${ws.name}" — ${ws.rowCount} rows\n`);

  // Columns:
  // Col 1: Site | Col 2: Invoice No | Col 3: Invoice Date
  // Col 13: Item Amount (net per item) | Col 14: Item Net Amount (gross per item)
  // Col 15: Item Total Tax | No Status column — direct TCS ION report

  // ── Step 2: Aggregate CRD by Invoice then by Site ──────────────────────
  // Since this is item-level, multiple rows per invoice. Sum items per invoice.
  const invoiceMap = {}; // { invoiceNo: { site, netTotal, grossTotal } }

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const invoiceNo = String(row.getCell(2).value || '').trim();
    if (!invoiceNo) continue;

    const site = String(row.getCell(1).value || '').trim();
    const itemAmount = parseFloat(row.getCell(13).value) || 0;    // net per item
    const itemNetAmt = parseFloat(row.getCell(14).value) || 0;    // gross per item (amount + tax)

    if (!invoiceMap[invoiceNo]) {
      invoiceMap[invoiceNo] = { site, net: 0, gross: 0, items: 0 };
    }
    invoiceMap[invoiceNo].net += itemAmount;
    invoiceMap[invoiceNo].gross += itemNetAmt;
    invoiceMap[invoiceNo].items++;
  }

  const totalInvoices = Object.keys(invoiceMap).length;
  console.log(`CRD: ${totalInvoices} unique invoices from ${ws.rowCount - 1} item rows`);

  // Aggregate by site
  const crdBySite = {};
  let crdTotalNet = 0, crdTotalGross = 0;
  for (const [inv, d] of Object.entries(invoiceMap)) {
    if (!crdBySite[d.site]) crdBySite[d.site] = { net: 0, gross: 0, count: 0 };
    crdBySite[d.site].net += d.net;
    crdBySite[d.site].gross += d.gross;
    crdBySite[d.site].count++;
    crdTotalNet += d.net;
    crdTotalGross += d.gross;
  }

  console.log('\n=== CRD VALUES BY SITE (Jul 2025) ===');
  for (const [site, d] of Object.entries(crdBySite).sort()) {
    console.log(`  ${site}: Net=${(d.net / 1e7).toFixed(2)} Cr | Gross=${(d.gross / 1e7).toFixed(2)} Cr | Invoices=${d.count}`);
  }
  console.log(`  TOTAL: Net=${(crdTotalNet / 1e7).toFixed(2)} Cr | Gross=${(crdTotalGross / 1e7).toFixed(2)} Cr | Invoices=${totalInvoices}`);

  // ── Step 3: Dashboard query — Jul 2025, Exported To GL ─────────────────
  console.log('\n=== DASHBOARD (Jul 2025 — Exported To GL, TrendCTE) ===');

  const sql = `
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS gross
      FROM ${TABLE}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)", "Site_"
    )
    SELECT
      "Site_" AS site,
      SUM(net) AS total_net,
      SUM(gross) AS total_gross,
      COUNT(*) AS invoice_count
    FROM deduped
    GROUP BY "Site_"
    ORDER BY "Site_"
  `;
  const res = await pool.query(sql);

  let dbTotalNet = 0, dbTotalGross = 0;
  const dbBySite = {};
  for (const row of res.rows) {
    const net = parseFloat(row.total_net);
    const gross = parseFloat(row.total_gross);
    dbBySite[row.site] = { net, gross, count: parseInt(row.invoice_count) };
    console.log(`  ${row.site}: Net=${(net / 1e7).toFixed(2)} Cr | Gross=${(gross / 1e7).toFixed(2)} Cr | Invoices=${row.invoice_count}`);
    dbTotalNet += net;
    dbTotalGross += gross;
  }
  console.log(`  TOTAL: Net=${(dbTotalNet / 1e7).toFixed(2)} Cr | Gross=${(dbTotalGross / 1e7).toFixed(2)} Cr`);

  // ── Also query ALL statuses to see full DB picture ─────────────────────
  console.log('\n=== DASHBOARD (Jul 2025 — ALL statuses) ===');
  const sqlAll = `
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        "Site_",
        MAX("Status_") AS status,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS gross
      FROM ${TABLE}
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0'
        AND "Invoice_Type_" != '0'
        AND "Invoice_Date_(Date)" >= '2025-07-01'
        AND "Invoice_Date_(Date)" < '2025-08-01'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)", "Site_"
    )
    SELECT
      "Site_" AS site,
      status,
      SUM(net) AS total_net,
      SUM(gross) AS total_gross,
      COUNT(*) AS invoice_count
    FROM deduped
    GROUP BY "Site_", status
    ORDER BY "Site_", status
  `;
  const resAll = await pool.query(sqlAll);
  for (const row of resAll.rows) {
    console.log(`  ${row.site} [${row.status}]: Net=${(parseFloat(row.total_net) / 1e7).toFixed(2)} Cr | Gross=${(parseFloat(row.total_gross) / 1e7).toFixed(2)} Cr | Inv=${row.invoice_count}`);
  }

  // ── Step 4: Check if CRD has -R invoices ──────────────────────────────
  const rInvoices = Object.keys(invoiceMap).filter(inv => inv.endsWith('-R'));
  console.log(`\nCRD -R invoices: ${rInvoices.length}`);
  if (rInvoices.length > 0) {
    for (const inv of rInvoices.slice(0, 10)) {
      const d = invoiceMap[inv];
      console.log(`  ${inv}: Net=${d.net} | Gross=${d.gross}`);
    }
  }

  // ── Step 5: COMPARISON TABLE ──────────────────────────────────────────
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  VALIDATION COMPARISON — JUL 2025`);
  console.log(`${'='.repeat(80)}`);
  console.log(`  ${'Site'.padEnd(8)} | ${'DB Net'.padStart(10)} | ${'CRD Net'.padStart(10)} | ${'Diff Net'.padStart(10)} | ${'DB Gross'.padStart(10)} | ${'CRD Gross'.padStart(10)} | ${'Diff Grs'.padStart(10)} | Status`);
  console.log(`  ${'-'.repeat(8)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ------`);

  const allSites = new Set([...Object.keys(dbBySite), ...Object.keys(crdBySite)]);
  let sumDbNet = 0, sumCrdNet = 0, sumDbGross = 0, sumCrdGross = 0;

  for (const site of [...allSites].sort()) {
    const db = dbBySite[site] || { net: 0, gross: 0, count: 0 };
    const crd = crdBySite[site] || { net: 0, gross: 0, count: 0 };

    const dbNetCr = (db.net / 1e7).toFixed(2);
    const crdNetCr = (crd.net / 1e7).toFixed(2);
    const diffNet = (db.net / 1e7 - crd.net / 1e7).toFixed(2);

    const dbGrossCr = (db.gross / 1e7).toFixed(2);
    const crdGrossCr = (crd.gross / 1e7).toFixed(2);
    const diffGross = (db.gross / 1e7 - crd.gross / 1e7).toFixed(2);

    const status = dbNetCr === crdNetCr ? 'MATCH' : Math.abs(parseFloat(diffNet)) <= 0.01 ? 'ROUND' : 'GAP';

    console.log(`  ${site.padEnd(8)} | ${dbNetCr.padStart(10)} | ${crdNetCr.padStart(10)} | ${diffNet.padStart(10)} | ${dbGrossCr.padStart(10)} | ${crdGrossCr.padStart(10)} | ${diffGross.padStart(10)} | ${status}`);

    sumDbNet += db.net; sumCrdNet += crd.net;
    sumDbGross += db.gross; sumCrdGross += crd.gross;
  }

  console.log(`  ${'-'.repeat(8)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ${'-'.repeat(10)} | ------`);
  console.log(`  ${'TOTAL'.padEnd(8)} | ${(sumDbNet / 1e7).toFixed(2).padStart(10)} | ${(sumCrdNet / 1e7).toFixed(2).padStart(10)} | ${((sumDbNet - sumCrdNet) / 1e7).toFixed(2).padStart(10)} | ${(sumDbGross / 1e7).toFixed(2).padStart(10)} | ${(sumCrdGross / 1e7).toFixed(2).padStart(10)} | ${((sumDbGross - sumCrdGross) / 1e7).toFixed(2).padStart(10)} |`);

  // ── Step 6: Find missing invoices (in CRD but not in DB) ──────────────
  console.log('\n=== INVOICE CROSS-CHECK ===');
  const crdInvoices = Object.keys(invoiceMap).filter(inv => !inv.endsWith('-R'));
  const crdInvList = crdInvoices.map(i => `'${i}'`).join(',');

  const dbInvSql = `
    SELECT DISTINCT "Invoice_No_"
    FROM ${TABLE}
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Invoice_Date_(Date)" >= '2025-07-01'
      AND "Invoice_Date_(Date)" < '2025-08-01'
  `;
  const dbInvRes = await pool.query(dbInvSql);
  const dbInvSet = new Set(dbInvRes.rows.map(r => r.Invoice_No_));

  const inCrdNotDb = crdInvoices.filter(inv => !dbInvSet.has(inv));
  const inDbNotCrd = [...dbInvSet].filter(inv => !invoiceMap[inv]);

  console.log(`CRD invoices (excl -R): ${crdInvoices.length}`);
  console.log(`DB invoices (Jul 2025): ${dbInvSet.size}`);
  console.log(`In CRD but NOT in DB: ${inCrdNotDb.length}`);
  console.log(`In DB but NOT in CRD: ${inDbNotCrd.length}`);

  if (inCrdNotDb.length > 0 && inCrdNotDb.length <= 30) {
    console.log('\nInvoices in CRD but missing from DB:');
    for (const inv of inCrdNotDb) {
      const d = invoiceMap[inv];
      console.log(`  ${inv} | Site=${d.site} | Net=${d.net} | Gross=${d.gross}`);
    }
  }

  if (inDbNotCrd.length > 0 && inDbNotCrd.length <= 30) {
    console.log('\nInvoices in DB but missing from CRD:');
    for (const inv of inDbNotCrd) {
      console.log(`  ${inv}`);
    }
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
