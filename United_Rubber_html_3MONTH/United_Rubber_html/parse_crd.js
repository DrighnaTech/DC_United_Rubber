const XLSX = require('xlsx');
const path = require('path');

// ============================================================
// FILE 1: sales_summary_dashboard_format.xlsx
// ============================================================
console.log('='.repeat(80));
console.log('FILE 1: sales_summary_dashboard_format.xlsx');
console.log('='.repeat(80));

const wb1 = XLSX.readFile(path.join(__dirname, 'CRD', 'sales_summary_dashboard_format.xlsx'));
console.log('\nSheet names:', wb1.SheetNames);

for (const sheetName of wb1.SheetNames) {
  console.log('\n' + '-'.repeat(80));
  console.log(`SHEET: "${sheetName}"`);
  console.log('-'.repeat(80));
  const ws = wb1.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    // Skip completely empty rows
    if (row.every(c => c === '' || c === null || c === undefined)) continue;
    console.log(`Row ${i}: ${JSON.stringify(row)}`);
  }
}

// ============================================================
// FILE 2: Sales Invoice Register
// ============================================================
console.log('\n\n' + '='.repeat(80));
console.log('FILE 2: Sales Invoice Register (New)');
console.log('='.repeat(80));

const regFile = 'Sales_Invoice_Register_(New)_Wed Aug 13 2025 15_41_56 GMT+0530 (India Standard Time) (1).xlsx';
const wb2 = XLSX.readFile(path.join(__dirname, 'CRD', regFile));
console.log('\nSheet names:', wb2.SheetNames);

for (const sheetName of wb2.SheetNames) {
  console.log('\n' + '-'.repeat(80));
  console.log(`SHEET: "${sheetName}"`);
  console.log('-'.repeat(80));
  const ws = wb2.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (data.length === 0) {
    console.log('(empty sheet)');
    continue;
  }

  // Show headers
  console.log(`\nTotal rows (including header): ${data.length}`);
  console.log(`Headers: ${JSON.stringify(data[0])}`);

  // Find relevant column indices
  const headers = data[0].map(h => String(h).trim());
  const invoiceNoIdx = headers.findIndex(h => /invoice.?no/i.test(h));
  const dateIdx = headers.findIndex(h => /invoice.?date/i.test(h));
  const netAmtIdx = headers.findIndex(h => /net.?amount/i.test(h) || h === 'Amount_');
  const grossAmtIdx = headers.findIndex(h => /gross/i.test(h));
  const taxIdx = headers.findIndex(h => /tax/i.test(h));
  const siteIdx = headers.findIndex(h => /site/i.test(h));
  const statusIdx = headers.findIndex(h => /status/i.test(h));
  const amountIdx = headers.findIndex(h => h === 'Amount_' || h === 'Amount');

  console.log(`\nColumn indices found:`);
  console.log(`  Invoice No: ${invoiceNoIdx} (${invoiceNoIdx >= 0 ? headers[invoiceNoIdx] : 'NOT FOUND'})`);
  console.log(`  Date: ${dateIdx} (${dateIdx >= 0 ? headers[dateIdx] : 'NOT FOUND'})`);
  console.log(`  Net Amount: ${netAmtIdx} (${netAmtIdx >= 0 ? headers[netAmtIdx] : 'NOT FOUND'})`);
  console.log(`  Gross Amount: ${grossAmtIdx} (${grossAmtIdx >= 0 ? headers[grossAmtIdx] : 'NOT FOUND'})`);
  console.log(`  Tax: ${taxIdx} (${taxIdx >= 0 ? headers[taxIdx] : 'NOT FOUND'})`);
  console.log(`  Site: ${siteIdx} (${siteIdx >= 0 ? headers[siteIdx] : 'NOT FOUND'})`);
  console.log(`  Status: ${statusIdx} (${statusIdx >= 0 ? headers[statusIdx] : 'NOT FOUND'})`);
  console.log(`  Amount: ${amountIdx} (${amountIdx >= 0 ? headers[amountIdx] : 'NOT FOUND'})`);

  // Show first 5 data rows as sample
  console.log('\nSample data rows (first 5):');
  for (let i = 1; i <= Math.min(5, data.length - 1); i++) {
    console.log(`  Row ${i}: ${JSON.stringify(data[i])}`);
  }

  // Now let's find ALL numeric-looking columns for aggregation
  console.log('\n--- Scanning all columns for numeric content ---');
  for (let col = 0; col < headers.length; col++) {
    const sample = data.slice(1, 6).map(r => r[col]);
    console.log(`  Col ${col} "${headers[col]}": samples = ${JSON.stringify(sample)}`);
  }

  // Compute per-month per-site totals
  // We need to figure out the right columns - let's be flexible
  console.log('\n--- Per-Month Per-Site Aggregation ---');

  // Try to find amount-like columns more broadly
  const numericCols = [];
  for (let col = 0; col < headers.length; col++) {
    let numCount = 0;
    for (let r = 1; r < Math.min(20, data.length); r++) {
      const v = data[r][col];
      if (v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) numCount++;
    }
    if (numCount > 5) {
      numericCols.push({ idx: col, name: headers[col] });
    }
  }
  console.log(`Numeric columns detected: ${JSON.stringify(numericCols)}`);

  // Aggregate by month and site
  const monthSite = {};
  const monthOnly = {};
  let skippedDates = 0;
  let processedRows = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Parse date
    let dateVal = dateIdx >= 0 ? row[dateIdx] : null;
    let monthKey = 'Unknown';

    if (dateVal !== null && dateVal !== '') {
      let d;
      if (typeof dateVal === 'number') {
        // Excel serial date
        d = XLSX.SSF.parse_date_code(dateVal);
        if (d) monthKey = `${d.y}-${String(d.m).padStart(2, '0')}`;
      } else {
        d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else {
          skippedDates++;
        }
      }
    } else {
      skippedDates++;
    }

    const site = siteIdx >= 0 ? String(row[siteIdx] || 'Unknown') : 'Unknown';
    const key = `${monthKey}|${site}`;

    if (!monthSite[key]) monthSite[key] = { invoices: new Set(), count: 0 };
    if (!monthOnly[monthKey]) monthOnly[monthKey] = { invoices: new Set(), count: 0 };

    // Add numeric columns
    for (const nc of numericCols) {
      const v = parseFloat(row[nc.idx]) || 0;
      if (!monthSite[key][nc.name]) monthSite[key][nc.name] = 0;
      if (!monthOnly[monthKey][nc.name]) monthOnly[monthKey][nc.name] = 0;
      monthSite[key][nc.name] += v;
      monthOnly[monthKey][nc.name] += v;
    }

    const invNo = invoiceNoIdx >= 0 ? String(row[invoiceNoIdx]) : `row_${i}`;
    monthSite[key].invoices.add(invNo);
    monthSite[key].count++;
    monthOnly[monthKey].invoices.add(invNo);
    monthOnly[monthKey].count++;
    processedRows++;
  }

  console.log(`\nProcessed ${processedRows} data rows, ${skippedDates} had unparseable dates`);

  // Print month-only summary
  console.log('\n=== MONTHLY SUMMARY (all sites) ===');
  const months = Object.keys(monthOnly).sort();
  for (const m of months) {
    const entry = monthOnly[m];
    const parts = [`Month: ${m}`, `Rows: ${entry.count}`, `Unique Invoices: ${entry.invoices.size}`];
    for (const nc of numericCols) {
      if (entry[nc.name]) parts.push(`${nc.name}: ${(entry[nc.name]).toFixed(2)}`);
    }
    console.log(parts.join(' | '));
  }

  // Print month+site summary
  console.log('\n=== MONTHLY + SITE SUMMARY ===');
  const keys = Object.keys(monthSite).sort();
  for (const k of keys) {
    const [month, site] = k.split('|');
    const entry = monthSite[k];
    const parts = [`${month} | Site: ${site}`, `Rows: ${entry.count}`, `Invoices: ${entry.invoices.size}`];
    for (const nc of numericCols) {
      if (entry[nc.name]) parts.push(`${nc.name}: ${(entry[nc.name]).toFixed(2)}`);
    }
    console.log(parts.join(' | '));
  }
}
