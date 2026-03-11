'use strict';
const http = require('http');

const url = 'http://localhost:3000/api/sales-dashboard?date_from=2025-04-01&date_to=2025-04-30&invoice_type=Sales+%28+Commercial+%29&status=Open,Approved,Released,Exported+To+GL';

http.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log('=== KPIs ===');
      console.log('  Total Invoices:', j.kpi.total_invoices);
      console.log('  Net Amount:', j.kpi.total_net_amount);
      console.log('  Gross Amount:', j.kpi.total_gross_amount);
      console.log('  Tax:', j.kpi.total_tax);
      console.log('  Sales Qty:', j.kpi.total_sales_qty);
      console.log('  Rate Cr:', j.kpi.total_rate_cr);

      console.log('\n=== Item Categories (top 5) ===');
      (j.itemCategory || []).slice(0, 5).forEach(c =>
        console.log(`  ${c.category}: amt=${c.total_amount}, qty=${c.total_qty}, inv=${c.invoice_count}`)
      );

      // Total item amount across all categories
      const totalItemAmt = (j.itemCategory || []).reduce((s, c) => s + parseFloat(c.total_amount || 0), 0);
      console.log('\n  Total item amt (all categories):', totalItemAmt.toFixed(2));
      console.log('  CRD Item Amount (all sites Apr):  147670915.45');
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Raw:', data.slice(0, 500));
    }
  });
}).on('error', e => console.error('Request error:', e.message));
