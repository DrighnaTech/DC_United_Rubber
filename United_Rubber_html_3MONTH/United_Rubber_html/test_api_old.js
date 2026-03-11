'use strict';
const http = require('http');

// Test 1: Apr 2024 (old data - should be unchanged)
const url1 = 'http://localhost:3000/api/sales-dashboard?date_from=2024-04-01&date_to=2024-04-30&status=Exported+To+GL';
// Test 2: Nov 2024 (old data)
const url2 = 'http://localhost:3000/api/sales-dashboard?date_from=2024-11-01&date_to=2024-11-30';
// Test 3: Apr 2025 ALL types
const url3 = 'http://localhost:3000/api/sales-dashboard?date_from=2025-04-01&date_to=2025-04-30&status=Open,Approved,Released,Exported+To+GL&invoice_type=Sales+%28+Commercial+%29,Service,Scrap';

function fetch(url, label) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          console.log(`\n=== ${label} ===`);
          console.log('  Invoices:', j.kpi.total_invoices);
          console.log('  Net Amount:', j.kpi.total_net_amount);
          console.log('  Gross Amount:', j.kpi.total_gross_amount);
          console.log('  Tax:', j.kpi.total_tax);
          console.log('  Sales Qty:', j.kpi.total_sales_qty);
          console.log('  Rate Cr:', j.kpi.total_rate_cr);
          const totalItemAmt = (j.itemCategory || []).reduce((s, c) => s + parseFloat(c.total_amount || 0), 0);
          console.log('  Item Category Total:', totalItemAmt.toFixed(2));
        } catch (e) {
          console.log(`${label}: Error -`, e.message);
        }
        resolve();
      });
    }).on('error', e => { console.error(`${label}: ${e.message}`); resolve(); });
  });
}

(async () => {
  await fetch(url1, 'Apr 2024 (Exported To GL) — OLD DATA');
  await fetch(url2, 'Nov 2024 (all statuses) — OLD DATA');
  await fetch(url3, 'Apr 2025 (Sales Commercial+Service+Scrap) — NEW CRD');
  console.log('\n--- Reference values ---');
  console.log('Apr 2024 Exported To GL: Net ~12.88 Cr (validated)');
  console.log('Apr 2025 CRD Item Amount: 147,670,915.45');
})();
