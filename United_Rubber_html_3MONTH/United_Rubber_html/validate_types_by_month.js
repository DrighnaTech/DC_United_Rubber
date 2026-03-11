'use strict';
const db = require('./db/connection');

(async () => {
  try {
    // What invoice types exist per month, and what is their net contribution?
    const r = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        "Invoice_Type_" AS type,
        COUNT(DISTINCT "Invoice_No_") AS invoices,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          MAX("Invoice_Type_") AS "Invoice_Type_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM')
              IN ('2024-04','2024-07','2024-10','2024-11','2025-04')
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month, type
      ORDER BY month, type
    `);

    console.log('Invoice types per month (Exported To GL, domestic sites):');
    console.log('Month   | Invoice Type                    | Invoices | Net (Cr)');
    console.log('--------|----------------------------------|----------|----------');
    let lastMonth = '';
    let monthTotals = {};
    for (const row of r.rows) {
      if (row.month !== lastMonth) {
        if (lastMonth) console.log(`        | ${'--- MONTH TOTAL ---'.padEnd(33)}| ${String(monthTotals[lastMonth].inv).padEnd(8)} | ${monthTotals[lastMonth].net.toFixed(4)}`);
        console.log('');
        lastMonth = row.month;
        monthTotals[row.month] = { inv: 0, net: 0 };
      }
      monthTotals[row.month].inv += parseInt(row.invoices);
      monthTotals[row.month].net += parseFloat(row.net_cr);
      console.log(`${row.month} | ${row.type.padEnd(33)}| ${String(row.invoices).padEnd(8)} | ${parseFloat(row.net_cr).toFixed(4)}`);
    }
    if (lastMonth) console.log(`        | ${'--- MONTH TOTAL ---'.padEnd(33)}| ${String(monthTotals[lastMonth].inv).padEnd(8)} | ${monthTotals[lastMonth].net.toFixed(4)}`);

    // Cross-check: what is the Sales Return contribution specifically?
    console.log('\n\n=== Sales Return (negative) contribution by month ===');
    const r2 = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        COUNT(DISTINCT "Invoice_No_") AS invoices,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" = 'Sales Return'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM')
              BETWEEN '2024-04' AND '2025-07'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month
      ORDER BY month
    `);
    for (const row of r2.rows) {
      console.log(`  ${row.month}: ${row.invoices} return invoices, net = ${row.net_cr} Cr`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
