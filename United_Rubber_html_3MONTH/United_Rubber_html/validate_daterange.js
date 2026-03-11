/**
 * Validate monthly Net Amount (Cr) with date range 2024-04-01 to 2025-01-28
 * matching the Excel reference filter.
 */
'use strict';
const db = require('./db/connection');
const { buildTrendCTE, AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, C } = require('./services/queryBuilder');

(async () => {
  try {
    const filters = {
      status: 'Exported To GL',
      dateFrom: '2024-04-01',
      dateTo: '2025-01-28',
    };
    const { cte, values } = buildTrendCTE(filters);

    // Monthly Net Amount
    const res = await db.query(
      `${cte}
       SELECT
         TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM') AS month_key,
         TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY') AS month_label,
         ROUND(SUM(${AMOUNT_NET_EXPR}) / 10000000, 2) AS net_cr,
         ROUND(SUM(${AMOUNT_GROSS_EXPR}) / 10000000, 2) AS gross_cr,
         COUNT(*) AS invoice_count
       FROM deduped
       WHERE "${C.invoiceDate}" IS NOT NULL AND "${C.invoiceDate}" != ''
       GROUP BY month_key, month_label
       ORDER BY month_key`,
      values
    );

    console.log('\n=== Monthly Net/Gross (Cr) — Date Range 2024-04-01 to 2025-01-28 ===');
    console.log('Month       | Net Cr   | Gross Cr | Invoices');
    console.log('------------|----------|----------|--------');
    for (const r of res.rows) {
      console.log(`${r.month_label.padEnd(12)}| ${String(r.net_cr).padEnd(9)}| ${String(r.gross_cr).padEnd(9)}| ${r.invoice_count}`);
    }

    // Also show site×month breakdown for cross-validation
    const siteRes = await db.query(
      `${cte}
       SELECT
         TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM') AS month_key,
         TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY') AS month_label,
         COALESCE("${C.site}", 'Unknown') AS site,
         ROUND(SUM(${AMOUNT_NET_EXPR}) / 10000000, 2) AS net_cr,
         ROUND(SUM(${AMOUNT_GROSS_EXPR}) / 10000000, 2) AS gross_cr
       FROM deduped
       WHERE "${C.invoiceDate}" IS NOT NULL AND "${C.invoiceDate}" != ''
       GROUP BY month_key, month_label, "${C.site}"
       ORDER BY month_key, site`,
      values
    );

    console.log('\n=== Site × Month Net (Cr) — Date Range 2024-04-01 to 2025-01-28 ===');
    console.log('Month       | Site              | Net Cr   | Gross Cr');
    console.log('------------|-------------------|----------|--------');
    for (const r of siteRes.rows) {
      console.log(`${r.month_label.padEnd(12)}| ${r.site.padEnd(18)}| ${String(r.net_cr).padEnd(9)}| ${r.gross_cr}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
