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
  AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, C, buildTrendCTE,
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
    // Use buildTrendCTE: GROUP BY (Invoice_No_, Invoice_Date_) — matches CRD
    // Invoices with different dates across partitions appear in BOTH months
    const { cte, postFilter, values } = buildTrendCTE(filters);
    const baseWhere = postFilter || 'WHERE TRUE';

    const [monthlyRes, siteRes] = await Promise.all([

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
    ]);

    res.json({
      monthly:     monthlyRes.rows,
      siteTrend:   siteRes.rows,
    });
  } catch (err) {
    console.error('[sales-analysis] Error:', err.message);
    res.status(500).json({ error: 'Analysis query failed', detail: err.message });
  }
});

module.exports = router;
