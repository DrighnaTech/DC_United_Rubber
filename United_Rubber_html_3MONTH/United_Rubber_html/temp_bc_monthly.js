'use strict';
require('dotenv').config();
const { pool, query } = require('./db/connection');

async function runMonthlyQuery(schema, table, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}: "${schema}"."${table}"`);
  console.log('='.repeat(70));

  // First check row count and date range
  const info = await query(`
    SELECT COUNT(*) as total_rows,
           COUNT(DISTINCT "Invoice_No_") as unique_invoices,
           MIN("Invoice_Date_(Date)") as min_date,
           MAX("Invoice_Date_(Date)") as max_date
    FROM "${schema}"."${table}"
    WHERE "Invoice_No_" NOT ILIKE '%-R%'
      AND "Status_" = 'Exported To GL'
  `);
  console.log('Row count:', info.rows[0].total_rows,
              '| Unique invoices:', info.rows[0].unique_invoices,
              '| Date range:', info.rows[0].min_date, 'to', info.rows[0].max_date);

  // Check distinct statuses
  const statuses = await query(`
    SELECT DISTINCT "Status_", COUNT(*) as cnt
    FROM "${schema}"."${table}"
    GROUP BY "Status_"
    ORDER BY cnt DESC
  `);
  console.log('\nStatus breakdown:');
  statuses.rows.forEach(r => console.log(`  ${r.Status_}: ${r.cnt}`));

  // CRD-style monthly query: GROUP BY Invoice_No_, SUM(DISTINCT Amount_)
  const monthly = await query(`
    SELECT
      TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(invoice_gross) / 10000000, 2) AS net_cr
    FROM (
      SELECT "Invoice_No_",
             "Invoice_Date_(Date)",
             SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_gross
      FROM "${schema}"."${table}"
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)"::DATE BETWEEN '2024-04-01' AND '2025-01-28'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    ) sub
    GROUP BY TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM')
    ORDER BY month
  `);

  console.log('\nMonthly Net Amount (Cr) - CRD style:');
  console.log('Month       | Invoices | Net Cr');
  console.log('------------|----------|--------');
  let totalCr = 0;
  monthly.rows.forEach(r => {
    totalCr += parseFloat(r.net_cr);
    console.log(`${r.month}    | ${String(r.invoices).padStart(6)} | ${r.net_cr}`);
  });
  console.log(`TOTAL       |          | ${totalCr.toFixed(2)}`);
}

async function main() {
  try {
    // Run on all 3 tables
    await runMonthlyQuery('BCTable', 'MF_Sales_Sales_Invoice_Alll', 'BCTable (3 Ls)');
    await runMonthlyQuery('BCTable', 'mf_sales_invoice_all', 'BCTable (lowercase)');
    await runMonthlyQuery('LandingStage2', 'mf_sales_si_siheader_all', 'LandingStage2 (current)');

  } catch(e) {
    console.error('Fatal:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main();
