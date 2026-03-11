'use strict';

const ExcelJS = require('exceljs');
const { Pool } = require('pg');
const path = require('path');

require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const SCHEMA = process.env.DB_SCHEMA || 'LandingStage2';
const TABLE = `"${SCHEMA}"."mf_sales_si_siheader_all"`;

async function main() {
  // Read CRD file
  const xlPath = path.join(__dirname, 'Validation_Month_csv', 'Jul_2025.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlPath);
  const ws = wb.worksheets[0];

  // Build CRD invoice list with per-invoice net/gross
  const invoiceMap = {};
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const invoiceNo = String(row.getCell(2).value || '').trim();
    if (!invoiceNo) continue;
    const site = String(row.getCell(1).value || '').trim();
    const itemAmount = parseFloat(row.getCell(13).value) || 0;
    const itemNetAmt = parseFloat(row.getCell(14).value) || 0;
    if (!invoiceMap[invoiceNo]) invoiceMap[invoiceNo] = { site, net: 0, gross: 0 };
    invoiceMap[invoiceNo].net += itemAmount;
    invoiceMap[invoiceNo].gross += itemNetAmt;
  }

  const crdInvoices = Object.keys(invoiceMap);
  console.log(`CRD invoices: ${crdInvoices.length}\n`);

  // ── Query: What status do CRD invoices have in our DB? ─────────────────
  // Batch query in chunks of 500
  const chunkSize = 500;
  const statusMap = {}; // invoiceNo -> { status, dbNet, dbGross, site }

  for (let i = 0; i < crdInvoices.length; i += chunkSize) {
    const chunk = crdInvoices.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(',');

    const sql = `
      SELECT
        "Invoice_No_",
        "Site_",
        MAX("Status_") AS status,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC, 0)) AS net,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC, 0)) AS gross
      FROM ${TABLE}
      WHERE "Invoice_No_" IN (${placeholders})
        AND "Invoice_No_" NOT LIKE '%-R'
      GROUP BY "Invoice_No_", "Site_"
    `;

    const res = await pool.query(sql, chunk);
    for (const row of res.rows) {
      statusMap[row.Invoice_No_] = {
        status: row.status,
        site: row.Site_,
        net: parseFloat(row.net),
        gross: parseFloat(row.gross),
      };
    }
  }

  // ── Analyze: CRD invoices by their DB status ──────────────────────────
  console.log('=== CRD INVOICES — STATUS IN OUR DB ===');
  const byStatusSite = {};

  for (const [inv, crd] of Object.entries(invoiceMap)) {
    const db = statusMap[inv];
    const status = db ? db.status : 'NOT_IN_DB';
    const site = crd.site;
    const key = `${site}|${status}`;

    if (!byStatusSite[key]) byStatusSite[key] = { count: 0, crdNet: 0, crdGross: 0, dbNet: 0, dbGross: 0 };
    byStatusSite[key].count++;
    byStatusSite[key].crdNet += crd.net;
    byStatusSite[key].crdGross += crd.gross;
    byStatusSite[key].dbNet += db ? db.net : 0;
    byStatusSite[key].dbGross += db ? db.gross : 0;
  }

  // Print by site
  const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];
  for (const site of sites) {
    console.log(`\n  ${site}:`);
    for (const [key, d] of Object.entries(byStatusSite).sort()) {
      if (!key.startsWith(site + '|')) continue;
      const status = key.split('|')[1];
      console.log(`    ${status.padEnd(20)} | Inv=${String(d.count).padStart(4)} | CRD Net=${(d.crdNet / 1e7).toFixed(4)} Cr | DB Net=${(d.dbNet / 1e7).toFixed(4)} Cr | CRD Gross=${(d.crdGross / 1e7).toFixed(4)} Cr`);
    }
  }

  // ── Summary: Non-Exported CRD invoices causing the gap ────────────────
  console.log('\n\n=== GAP ANALYSIS — CRD invoices NOT "Exported To GL" in DB ===');
  console.log(`  ${'Site'.padEnd(8)} | ${'Status'.padEnd(20)} | ${'Count'.padStart(5)} | ${'CRD Net (Cr)'.padStart(14)} | ${'These cause the gap'}`);
  console.log(`  ${'-'.repeat(80)}`);

  let gapTotal = 0;
  for (const site of sites) {
    for (const [key, d] of Object.entries(byStatusSite).sort()) {
      if (!key.startsWith(site + '|')) continue;
      const status = key.split('|')[1];
      if (status === 'Exported To GL') continue;

      console.log(`  ${site.padEnd(8)} | ${status.padEnd(20)} | ${String(d.count).padStart(5)} | ${(d.crdNet / 1e7).toFixed(4).padStart(14)} |`);
      gapTotal += d.crdNet;
    }
  }
  console.log(`  ${'-'.repeat(80)}`);
  console.log(`  ${'TOTAL'.padEnd(8)} | ${''.padEnd(20)} |       | ${(gapTotal / 1e7).toFixed(4).padStart(14)} | = total gap explained`);

  // ── Per-invoice detail for non-Exported (show top ones) ───────────────
  console.log('\n\n=== TOP NON-EXPORTED CRD INVOICES (by Net Amount) ===');
  const nonExported = [];
  for (const [inv, crd] of Object.entries(invoiceMap)) {
    const db = statusMap[inv];
    if (db && db.status !== 'Exported To GL') {
      nonExported.push({ inv, site: crd.site, status: db.status, crdNet: crd.net, dbNet: db.net });
    }
  }
  nonExported.sort((a, b) => b.crdNet - a.crdNet);
  console.log(`Total non-Exported CRD invoices: ${nonExported.length}`);
  console.log(`\nTop 20 by CRD Net Amount:`);
  for (const d of nonExported.slice(0, 20)) {
    console.log(`  ${d.inv.padEnd(22)} | ${d.site} | ${d.status.padEnd(15)} | CRD Net=${d.crdNet.toFixed(2)}`);
  }

  // ── Also check: amount difference for Exported invoices (CRD item sum vs DB header) ──
  console.log('\n\n=== EXPORTED INVOICES — AMOUNT COMPARISON (CRD item sum vs DB header) ===');
  let exportedMatchCount = 0, exportedDiffCount = 0;
  let totalCrdExportedNet = 0, totalDbExportedNet = 0;
  const bigDiffs = [];

  for (const [inv, crd] of Object.entries(invoiceMap)) {
    const db = statusMap[inv];
    if (!db || db.status !== 'Exported To GL') continue;

    totalCrdExportedNet += crd.net;
    totalDbExportedNet += db.net;

    const diff = Math.abs(crd.net - db.net);
    if (diff < 1) {
      exportedMatchCount++;
    } else {
      exportedDiffCount++;
      bigDiffs.push({ inv, site: crd.site, crdNet: crd.net, dbNet: db.net, diff });
    }
  }

  console.log(`Exported invoices: ${exportedMatchCount + exportedDiffCount}`);
  console.log(`Amount match (within ₹1): ${exportedMatchCount}`);
  console.log(`Amount differs (>₹1): ${exportedDiffCount}`);
  console.log(`Total CRD Net (Exported): ${(totalCrdExportedNet / 1e7).toFixed(4)} Cr`);
  console.log(`Total DB Net (Exported):  ${(totalDbExportedNet / 1e7).toFixed(4)} Cr`);
  console.log(`Difference: ${((totalCrdExportedNet - totalDbExportedNet) / 1e7).toFixed(4)} Cr`);

  if (bigDiffs.length > 0) {
    bigDiffs.sort((a, b) => b.diff - a.diff);
    console.log(`\nTop 10 amount differences (Exported invoices):`);
    for (const d of bigDiffs.slice(0, 10)) {
      console.log(`  ${d.inv.padEnd(22)} | ${d.site} | CRD=${d.crdNet.toFixed(2)} | DB=${d.dbNet.toFixed(2)} | Diff=${d.diff.toFixed(2)}`);
    }
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
