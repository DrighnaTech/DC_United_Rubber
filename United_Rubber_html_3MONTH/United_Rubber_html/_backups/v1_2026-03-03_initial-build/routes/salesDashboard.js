/**
 * routes/salesDashboard.js
 * Sales Dashboard — Executive Overview
 *
 * GET /api/sales-dashboard          → KPIs + status breakdown + monthly trend + top 10 customers
 * GET /api/sales-dashboard/table    → Paginated invoice table
 *
 * Query strategy:
 *   1. Deduplicate entire table first (latest snapshot per Invoice_No_)
 *   2. Apply Status_ / Invoice_Type_ filter on deduplicated result
 *
 * RULE: Invoice_No_ NOT LIKE '%-R'  — enforced in dedup CTE, never on frontend.
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const {
  AMOUNT_EXPR, C,
  buildDedupCTE,
  buildPagination,
  buildOrderBy,
} = require('../services/queryBuilder');

/* ─────────────────────────────────────────────
   GET /api/sales-dashboard
───────────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const filters = {
      status:      req.query.status,
      invoiceType: req.query.invoice_type,
    };
    const { cte, postFilter, values } = buildDedupCTE(filters);

    const [kpiRes, statusRes, monthlyRes, customerRes] = await Promise.all([

      // ── KPI Summary ──────────────────────────────
      db.query(
        `${cte}
         SELECT
           COUNT(*)                                      AS total_invoices,
           SUM(${AMOUNT_EXPR})                           AS total_sales,
           AVG(${AMOUNT_EXPR})                           AS avg_invoice_value,
           MIN("${C.invoiceDate}"::DATE)                 AS first_date,
           MAX("${C.invoiceDate}"::DATE)                 AS last_date,
           COUNT(DISTINCT "${C.customerName}")           AS unique_customers
         FROM deduped
         ${postFilter}`,
        values
      ),

      // ── Status Breakdown ─────────────────────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.status}", 'Unknown')  AS status,
           COUNT(*)                             AS invoice_count,
           SUM(${AMOUNT_EXPR})                  AS total_amount
         FROM deduped
         ${postFilter}
         GROUP BY "${C.status}"
         ORDER BY total_amount DESC`,
        values
      ),

      // ── Monthly Revenue Trend ─────────────────────
      // postFilter may be empty or "WHERE x = $1" — append date condition accordingly
      db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')   AS month_key,
           TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')  AS month_label,
           COUNT(*)                                         AS invoice_count,
           SUM(${AMOUNT_EXPR})                              AS total_amount
         FROM deduped
         ${postFilter || 'WHERE TRUE'}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY month_key, month_label
         ORDER BY month_key`,
        values
      ),

      // ── Top 10 Customers by Revenue ──────────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.customerName}", 'Unknown')  AS customer_name,
           COUNT(*)                                   AS invoice_count,
           SUM(${AMOUNT_EXPR})                        AS total_amount
         FROM deduped
         ${postFilter || 'WHERE TRUE'}
           AND "${C.customerName}" IS NOT NULL
           AND "${C.customerName}" != ''
         GROUP BY "${C.customerName}"
         ORDER BY total_amount DESC
         LIMIT 10`,
        values
      ),
    ]);

    res.json({
      kpi:       kpiRes.rows[0]   || {},
      status:    statusRes.rows   || [],
      monthly:   monthlyRes.rows  || [],
      customers: customerRes.rows || [],
    });
  } catch (err) {
    console.error('[sales-dashboard] Error:', err.message);
    res.status(500).json({ error: 'Sales dashboard query failed', detail: err.message });
  }
});

/* ─────────────────────────────────────────────
   GET /api/sales-dashboard/table
───────────────────────────────────────────── */
router.get('/table', async (req, res) => {
  try {
    const filters = {
      status:      req.query.status,
      invoiceType: req.query.invoice_type,
    };
    const { cte, postFilter, values, nextParamIndex } = buildDedupCTE(filters);
    const orderBy = buildOrderBy(req.query.sort_by, req.query.sort_dir);

    // Total count for pagination
    const countRes = await db.query(
      `${cte} SELECT COUNT(*) AS total FROM deduped ${postFilter}`,
      values
    );
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    // Paginated data
    const { limitClause, page, pageSize } = buildPagination(
      values, nextParamIndex, req.query.page, req.query.page_size
    );

    const dataRes = await db.query(
      `${cte}
       SELECT
         "${C.invoiceNo}"                              AS invoice_no,
         "${C.invoiceDate}"                            AS invoice_date,
         COALESCE("${C.customerName}", '')             AS customer_name,
         COALESCE("${C.invoiceType}", '')              AS invoice_type,
         COALESCE("${C.status}", '')                   AS status,
         ${AMOUNT_EXPR}                                AS amount,
         COALESCE("${C.billState}", '')                AS state
       FROM deduped
       ${postFilter}
       ${orderBy}
       ${limitClause}`,
      values
    );

    res.json({
      total, page, pageSize,
      totalPages: Math.ceil(total / pageSize),
      rows: dataRes.rows,
    });
  } catch (err) {
    console.error('[sales-dashboard/table] Error:', err.message);
    res.status(500).json({ error: 'Table query failed', detail: err.message });
  }
});

module.exports = router;
