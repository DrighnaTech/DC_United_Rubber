'use strict';
const XLSX = require('xlsx');
const wb = XLSX.readFile('CRD/sales_summary_dashboard_format.xlsx');
console.log('Sheets:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, {header:1});
  console.log('\n=== Sheet:', name, '(rows:', data.length, ') ===');
  data.slice(0, 40).forEach((row, i) => {
    const hasContent = row.some(v => v !== undefined && v !== null && v !== '');
    if (hasContent) console.log(i, JSON.stringify(row));
  });
}
