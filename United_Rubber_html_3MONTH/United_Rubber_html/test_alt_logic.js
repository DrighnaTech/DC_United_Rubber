'use strict';
const db = require('./db/connection');

const TABLE = '"LandingStage2"."mf_sales_si_siheader_all"';
const WHERE = `"Invoice_No_" NOT LIKE '%-R' AND "Status_" = 'Exported To GL' AND "Invoice_Date_(Date)" >= '2024-04-01' AND "Invoice_Date_(Date)" <= '2025-01-28'`;

async function q(label, sql) {
  console.log('\n=== ' + label + ' ===');
  try {
    const r = await db.query(sql);
    r.rows.forEach(r => {
      const mk = (r.mk === '2024-08' || r.mk === '2024-09' || r.mk === '2024-12' || r.mk === '2025-01') ? r.mk + ' ***' : r.mk;
      console.log(mk, r.net_cr);
    });
  } catch (e) { console.log('ERROR:', e.message.slice(0, 200)); }
}

(async () => {
  try {
    // 0. Current: SUM(DISTINCT Amount_) per (Invoice_No_, Date)
    await q('0. SUM(DISTINCT) per (InvNo + Date) [CURRENT]', `
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        ROUND(SUM(inv)/10000000,2) net_cr FROM (
        SELECT "Invoice_No_","Invoice_Date_(Date)",SUM(DISTINCT CAST("Amount_" AS NUMERIC)) inv
        FROM ${TABLE} WHERE ${WHERE}
        GROUP BY "Invoice_No_","Invoice_Date_(Date)") s
      GROUP BY mk ORDER BY mk`);

    // 1. DISTINCT ON latest row per invoice
    await q('1. DISTINCT ON latest row per Invoice_No_', `
      WITH d AS (
        SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_","Invoice_Date_(Date)","Amount_"
        FROM ${TABLE} WHERE ${WHERE} ORDER BY "Invoice_No_", row_id DESC)
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        ROUND(SUM(CAST("Amount_" AS NUMERIC))/10000000,2) net_cr
      FROM d GROUP BY mk ORDER BY mk`);

    // 2. DISTINCT ON latest row per (InvNo+Date)
    await q('2. DISTINCT ON latest per (InvNo+Date)', `
      WITH d AS (
        SELECT DISTINCT ON ("Invoice_No_","Invoice_Date_(Date)") "Invoice_No_","Invoice_Date_(Date)","Amount_"
        FROM ${TABLE} WHERE ${WHERE} ORDER BY "Invoice_No_","Invoice_Date_(Date)", row_id DESC)
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        ROUND(SUM(CAST("Amount_" AS NUMERIC))/10000000,2) net_cr
      FROM d GROUP BY mk ORDER BY mk`);

    // 3. MAX(Amount_) per (InvNo+Date)
    await q('3. MAX(Amount_) per (InvNo+Date)', `
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        ROUND(SUM(m)/10000000,2) net_cr FROM (
        SELECT "Invoice_No_","Invoice_Date_(Date)",MAX(CAST("Amount_" AS NUMERIC)) m
        FROM ${TABLE} WHERE ${WHERE}
        GROUP BY "Invoice_No_","Invoice_Date_(Date)") s
      GROUP BY mk ORDER BY mk`);

    // 4. SUM(DISTINCT ABS(Amount_))
    await q('4. SUM(DISTINCT ABS(Amount_))', `
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        ROUND(SUM(inv)/10000000,2) net_cr FROM (
        SELECT "Invoice_No_","Invoice_Date_(Date)",SUM(DISTINCT ABS(CAST("Amount_" AS NUMERIC))) inv
        FROM ${TABLE} WHERE ${WHERE}
        GROUP BY "Invoice_No_","Invoice_Date_(Date)") s
      GROUP BY mk ORDER BY mk`);

    // 5. Negative amounts check
    await q('5. Negative amounts by month', `
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        COUNT(DISTINCT "Invoice_No_") AS net_cr
      FROM ${TABLE}
      WHERE ${WHERE} AND CAST("Amount_" AS NUMERIC) < 0
      GROUP BY mk ORDER BY mk`);

    // 6. BCTable.MF_Sales_Sales_Invoice_Alll
    await q('6. BCTable.MF_Sales_Sales_Invoice_Alll', `
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        ROUND(SUM(inv)/10000000,2) net_cr FROM (
        SELECT "Invoice_No_","Invoice_Date_(Date)",SUM(DISTINCT CAST("Amount_" AS NUMERIC)) inv
        FROM "BCTable"."MF_Sales_Sales_Invoice_Alll"
        WHERE "Invoice_No_" NOT ILIKE '%-R%' AND "Status_" = 'Exported To GL'
          AND "Invoice_Date_(Date)" >= '2024-04-01' AND "Invoice_Date_(Date)" <= '2025-01-28'
        GROUP BY "Invoice_No_","Invoice_Date_(Date)") s
      GROUP BY mk ORDER BY mk`);

    // 7. Multi-amount invoices diagnostic for Aug, Sep, Dec, Jan
    console.log('\n=== 7. Multi-amount invoices per month (SUM(DISTINCT) > latest single value) ===');
    for (const month of ['2024-08','2024-09','2024-12','2025-01']) {
      const r = await db.query(`
        WITH inv_data AS (
          SELECT "Invoice_No_",
            SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS sd_amt,
            (SELECT CAST(sub."Amount_" AS NUMERIC) FROM ${TABLE} sub
             WHERE sub."Invoice_No_" = t."Invoice_No_" AND sub."Status_" = 'Exported To GL'
               AND sub."Invoice_No_" NOT LIKE '%-R'
             ORDER BY sub.row_id DESC LIMIT 1) AS latest_amt
          FROM ${TABLE} t
          WHERE ${WHERE}
            AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') = '${month}'
          GROUP BY "Invoice_No_"
          HAVING COUNT(DISTINCT "Amount_") > 1
        )
        SELECT COUNT(*) multi_inv,
          ROUND(SUM(sd_amt)/10000000,4) AS sd_total_cr,
          ROUND(SUM(latest_amt)/10000000,4) AS latest_total_cr,
          ROUND((SUM(latest_amt)-SUM(sd_amt))/10000000,4) AS diff_cr
        FROM inv_data`);
      const d = r.rows[0];
      console.log(month, 'multi-amount invoices:', d.multi_inv,
        'SUM(DISTINCT) total:', d.sd_total_cr, 'Latest total:', d.latest_total_cr, 'diff:', d.diff_cr);
    }

    // 8. Try: for multi-amount invoices, use LATEST instead of SUM(DISTINCT) — does this fix the gap?
    await q('8. HYBRID: latest for multi-amount inv, SUM(DISTINCT) for single-amount', `
      WITH classified AS (
        SELECT "Invoice_No_","Invoice_Date_(Date)",
          CAST("Amount_" AS NUMERIC) AS amt, row_id,
          COUNT(DISTINCT "Amount_") OVER (PARTITION BY "Invoice_No_") AS amt_count
        FROM ${TABLE} WHERE ${WHERE}
      ),
      single AS (
        SELECT "Invoice_No_","Invoice_Date_(Date)",
          SUM(DISTINCT amt) AS final_amt
        FROM classified WHERE amt_count = 1
        GROUP BY "Invoice_No_","Invoice_Date_(Date)"
      ),
      multi AS (
        SELECT DISTINCT ON ("Invoice_No_","Invoice_Date_(Date)")
          "Invoice_No_","Invoice_Date_(Date)", amt AS final_amt
        FROM classified WHERE amt_count > 1
        ORDER BY "Invoice_No_","Invoice_Date_(Date)", row_id DESC
      ),
      combined AS (
        SELECT * FROM single UNION ALL SELECT * FROM multi
      )
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') mk,
        ROUND(SUM(final_amt)/10000000,2) net_cr
      FROM combined GROUP BY mk ORDER BY mk`);

    process.exit(0);
  } catch (e) { console.error(e.message); process.exit(1); }
})();
