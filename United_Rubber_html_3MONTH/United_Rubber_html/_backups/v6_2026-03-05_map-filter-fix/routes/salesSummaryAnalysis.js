/**
 * routes/salesSummaryAnalysis.js
 * Sales Summary Analysis
 *
 * GET /api/sales-analysis → Monthly trend, yearly comparison, MoM growth,
 *                           invoice-type trend, status trend, domestic/export by site
 *
 * Rules:
 *  - Invoice_No_ NOT LIKE '%-R'
 *  - Dedup first, filter after
 *  - All aggregation in SQL
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const {
  AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, C, buildDedupCTE,
} = require('../services/queryBuilder');

router.get('/', async (req, res) => {
  try {
    const filters = {
      status:       req.query.status,
      invoiceType:  req.query.invoice_type,
      dateFrom:     req.query.date_from,
      dateTo:       req.query.date_to,
      site:         req.query.site,
      shipState:    req.query.ship_state,
      customerName: req.query.customer_name,
    };
    const { cte, postFilter, values } = buildDedupCTE(filters);
    const baseWhere = postFilter || 'WHERE TRUE';

    const [monthlyRes, yearlyRes, momRes, typeTrendRes, statusTrendRes, siteRes, dateRangeRes] = await Promise.all([

      // ── Monthly Revenue Trend ─────────────────────────────────────────
      db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')   AS month_key,
           TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')  AS month_label,
           EXTRACT(YEAR  FROM "${C.invoiceDate}"::DATE)    AS year,
           EXTRACT(MONTH FROM "${C.invoiceDate}"::DATE)    AS month_num,
           COUNT(*)                                         AS invoice_count,
           SUM(${AMOUNT_NET_EXPR})                          AS total_net,
           SUM(${AMOUNT_GROSS_EXPR})                        AS total_amount
         FROM deduped
         ${baseWhere}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY month_key, month_label, year, month_num
         ORDER BY month_key`,
        values
      ),

      // ── Year-wise Comparison ──────────────────────────────────────────
      db.query(
        `${cte}
         SELECT
           EXTRACT(YEAR FROM "${C.invoiceDate}"::DATE)  AS year,
           COUNT(*)                                       AS invoice_count,
           SUM(${AMOUNT_NET_EXPR})                        AS total_net,
           SUM(${AMOUNT_GROSS_EXPR})                      AS total_amount,
           AVG(${AMOUNT_GROSS_EXPR})                      AS avg_amount,
           COUNT(DISTINCT "${C.customerName}")            AS unique_customers
         FROM deduped
         ${baseWhere}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY year
         ORDER BY year`,
        values
      ),

      // ── Month-over-Month Growth % ─────────────────────────────────────
      db.query(
        `${cte},
         monthly AS (
           SELECT
             TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')   AS month_key,
             TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')  AS month_label,
             COUNT(*)                                         AS invoice_count,
             SUM(${AMOUNT_GROSS_EXPR})                        AS revenue
           FROM deduped
           ${baseWhere}
             AND "${C.invoiceDate}" IS NOT NULL
             AND "${C.invoiceDate}" != ''
           GROUP BY month_key, month_label
         )
         SELECT
           month_key,
           month_label,
           invoice_count,
           revenue,
           LAG(revenue) OVER (ORDER BY month_key)   AS prev_revenue,
           CASE
             WHEN LAG(revenue) OVER (ORDER BY month_key) IS NULL
               OR LAG(revenue) OVER (ORDER BY month_key) = 0
             THEN NULL
             ELSE ROUND(
               ((revenue - LAG(revenue) OVER (ORDER BY month_key))
                 / LAG(revenue) OVER (ORDER BY month_key)) * 100,
               2
             )
           END                                       AS mom_growth_pct
         FROM monthly
         ORDER BY month_key`,
        values
      ),

      // ── Invoice Type Revenue Trend by Month ───────────────────────────
      db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')    AS month_key,
           TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')   AS month_label,
           COALESCE("${C.invoiceType}", 'Unknown')          AS invoice_type,
           COUNT(*)                                          AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})                         AS total_amount
         FROM deduped
         ${baseWhere}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY month_key, month_label, "${C.invoiceType}"
         ORDER BY month_key, total_amount DESC`,
        values
      ),

      // ── Status Trend by Month ─────────────────────────────────────────
      db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')    AS month_key,
           TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')   AS month_label,
           COALESCE("${C.status}", 'Unknown')               AS status,
           COUNT(*)                                          AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})                         AS total_amount
         FROM deduped
         ${baseWhere}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY month_key, month_label, "${C.status}"
         ORDER BY month_key, total_amount DESC`,
        values
      ),

      // ── Domestic vs Export (Monthly by Site) ─────────────────────────
      db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')   AS month_key,
           TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')  AS month_label,
           COALESCE("${C.site}", 'Unknown')                AS site,
           COUNT(*)                                         AS invoice_count,
           SUM(${AMOUNT_NET_EXPR})                          AS total_net,
           SUM(${AMOUNT_GROSS_EXPR})                        AS total_amount
         FROM deduped
         ${baseWhere}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY month_key, month_label, "${C.site}"
         ORDER BY month_key, total_amount DESC`,
        values
      ),

      // ── Actual Min / Max Invoice Date (for From/To Date KPIs) ────────
      db.query(
        `${cte}
         SELECT
           TO_CHAR(MIN("${C.invoiceDate}"::DATE), 'YYYY-MM-DD') AS min_date,
           TO_CHAR(MAX("${C.invoiceDate}"::DATE), 'YYYY-MM-DD') AS max_date
         FROM deduped
         ${postFilter}`,
        values
      ),
    ]);

    res.json({
      monthly:     monthlyRes.rows,
      yearly:      yearlyRes.rows,
      mom:         momRes.rows,
      typeTrend:   typeTrendRes.rows,
      statusTrend: statusTrendRes.rows,
      siteTrend:   siteRes.rows,
      dateRange:   dateRangeRes.rows[0] || {},
    });
  } catch (err) {
    console.error('[sales-analysis] Error:', err.message);
    res.status(500).json({ error: 'Analysis query failed', detail: err.message });
  }
});

module.exports = router;
