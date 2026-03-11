'use strict';
const db = require('./db/connection');

(async () => {
  try {
    // ── URIMP Dec 2024: Calculate EXACT collision undercount ─────────
    console.log('=== URIMP Dec 2024: Total SUM(DISTINCT) collision undercount ===');
    const r1 = await db.query(`
      SELECT SUM(undercount) AS total_undercount_cr
      FROM (
        SELECT CAST("Amount_" AS NUMERIC) AS amt_val,
          COUNT(DISTINCT "Invoice_No_") AS inv_cnt,
          (COUNT(DISTINCT "Invoice_No_") - 1) * CAST("Amount_" AS NUMERIC) / 10000000.0 AS undercount
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND "Site_" = 'URIMP'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
        GROUP BY CAST("Amount_" AS NUMERIC)
        HAVING COUNT(DISTINCT "Invoice_No_") > 1
      ) sub
    `);
    console.log('Total collision undercount (flat SUM DISTINCT):', parseFloat(r1.rows[0].total_undercount_cr).toFixed(4), 'Cr');

    // ── Per-invoice approach: does it eliminate collision? ────────────
    console.log('\n=== URIMP Dec 2024: per-invoice approach vs flat approach ===');
    const r2 = await db.query(`
      SELECT
        SUM(invoice_net) / 10000000.0 AS per_invoice
      FROM (
        SELECT "Invoice_No_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND "Site_" = 'URIMP'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
        GROUP BY "Invoice_No_"
      ) sub
    `);
    console.log('Flat SUM(DISTINCT):', parseFloat(r2.rows[0].flat_distinct).toFixed(4), 'Cr (has collision error)');
    console.log('Per-invoice SUM:   ', parseFloat(r2.rows[0].per_invoice).toFixed(4), 'Cr (correct)');
    console.log('CRD reference:      3.4000 Cr');

    // ── URIMP Dec 2024: invoices with date changed across partitions ──
    console.log('\n=== URIMP Dec 2024: invoices with DIFFERENT dates across partitions ===');
    const r3 = await db.query(`
      SELECT "Invoice_No_",
        ARRAY_AGG(DISTINCT "Invoice_Date_(Date)" ORDER BY "Invoice_Date_(Date)") AS dates,
        ARRAY_AGG(DISTINCT "Status_") AS statuses,
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
      FROM "LandingStage2".mf_sales_si_siheader_all
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND "Site_" = 'URIMP'
        AND (
          TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
          OR TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') IN ('2024-11','2025-01')
        )
      GROUP BY "Invoice_No_"
      HAVING COUNT(DISTINCT "Invoice_Date_(Date)") > 1
        AND (
          '2024-12' = ANY(ARRAY_AGG(DISTINCT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM')))
        )
      ORDER BY amt DESC
      LIMIT 10
    `);
    if (r3.rows.length === 0) {
      console.log('  No date-shifting invoices found');
    } else {
      r3.rows.forEach(r => {
        console.log(' ', r.Invoice_No_, '| dates:', r.dates.join(' → '), '| statuses:', r.statuses.join(','), '| amt:', (r.amt/1e7).toFixed(4), 'Cr');
      });
    }

    // ── URIMP Dec 2024: total invoice count in DB vs what CRD implies ─
    console.log('\n=== URIMP Dec 2024: invoice count breakdown ===');
    const r4 = await db.query(`
      SELECT "Status_",
        COUNT(DISTINCT "Invoice_No_") AS inv_cnt,
        SUM(invoice_net) / 10000000.0 AS net_cr
      FROM (
        SELECT "Invoice_No_", "Status_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Invoice_Type_" != '0'
          AND "Site_" = 'URIMP'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
        GROUP BY "Invoice_No_", "Status_"
      ) sub
      GROUP BY "Status_"
      ORDER BY net_cr DESC
    `);
    let grandTotal = 0;
    r4.rows.forEach(r => {
      grandTotal += parseFloat(r.net_cr);
      console.log(' ', r.Status_, ':', r.inv_cnt, 'invoices,', parseFloat(r.net_cr).toFixed(4), 'Cr');
    });
    console.log(' GRAND TOTAL (all statuses):', grandTotal.toFixed(4), 'Cr | CRD=3.40 Cr');

    // ── What if CRD includes invoices with MULTIPLE statuses? ─────────
    console.log('\n=== URIMP Dec 2024: the "best of each invoice" approach ===');
    // Take the invoice, pick status in priority: ExportedToGL > Approved > Released > Open
    const r5 = await db.query(`
      WITH ranked AS (
        SELECT "Invoice_No_",
          CASE "Status_"
            WHEN 'Exported To GL' THEN 1
            WHEN 'Released' THEN 2
            WHEN 'Approved' THEN 3
            WHEN 'Open' THEN 4
            ELSE 5
          END AS priority,
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
        FROM "LandingStage2".mf_sales_si_siheader_all
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Invoice_Type_" != '0'
          AND "Site_" = 'URIMP'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '2024-12'
          AND "Status_" IN ('Exported To GL','Released','Approved','Open')
        GROUP BY "Invoice_No_", "Status_"
      ),
      best AS (
        SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", priority, amt
        FROM ranked
        ORDER BY "Invoice_No_", priority ASC
      )
      SELECT
        COUNT(*) AS inv_cnt,
        SUM(amt) / 10000000.0 AS total_cr
      FROM best
    `);
    console.log(' Best-status per-invoice total:', parseFloat(r5.rows[0].total_cr).toFixed(4), 'Cr (', r5.rows[0].inv_cnt, 'invoices) | CRD=3.40 Cr');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
