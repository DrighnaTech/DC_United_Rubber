/**
 * routes/salesInvoiceSummary.js
 * Sales Invoice Summary
 *
 * GET /api/invoice-summary        → KPIs + status + type breakdowns + monthly count
 * GET /api/invoice-summary/table  → Paginated + sortable invoice table (with all CRD columns)
 *
 * Rules:
 *  - Invoice_No_ NOT LIKE '%-R'
 *  - Dedup first, filter after
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const {
  AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, AMOUNT_TAX_EXPR,
  AMOUNT_CHARGE_EXPR, AMOUNT_DISCOUNT_EXPR, C,
  buildDedupCTE,
  buildPagination,
  buildOrderBy,
} = require('../services/queryBuilder');

/* ─────────────────────────────────────────────
   GET /api/invoice-summary
───────────────────────────────────────────── */
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

    const [kpiRes, statusRes, typeRes, monthlyRes] = await Promise.all([

      // ── KPI ──────────────────────────────────────
      db.query(
        `${cte}
         SELECT
           COUNT(*)                                    AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})                   AS total_amount,
           SUM(${AMOUNT_NET_EXPR})                     AS total_net_amount,
           SUM(${AMOUNT_TAX_EXPR})                     AS total_tax,
           AVG(${AMOUNT_GROSS_EXPR})                   AS avg_amount,
           MAX(${AMOUNT_GROSS_EXPR})                   AS max_amount,
           MIN(CASE WHEN ${AMOUNT_GROSS_EXPR} > 0 THEN ${AMOUNT_GROSS_EXPR} END) AS min_amount,
           COUNT(DISTINCT "${C.customerName}")         AS unique_customers,
           MIN("${C.invoiceDate}"::DATE)               AS period_start,
           MAX("${C.invoiceDate}"::DATE)               AS period_end
         FROM deduped
         ${postFilter}`,
        values
      ),

      // ── Status Breakdown ──────────────────────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.status}", 'Unknown')  AS status,
           COUNT(*)                             AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})            AS total_amount,
           ROUND(
             COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 2
           ) AS pct_count
         FROM deduped
         ${postFilter}
         GROUP BY "${C.status}"
         ORDER BY total_amount DESC`,
        values
      ),

      // ── Invoice Type Breakdown ────────────────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.invoiceType}", 'Unknown')  AS invoice_type,
           COUNT(*)                                  AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})                 AS total_amount,
           ROUND(
             SUM(${AMOUNT_GROSS_EXPR}) * 100.0
               / NULLIF(SUM(SUM(${AMOUNT_GROSS_EXPR})) OVER (), 0),
             2
           ) AS pct_amount
         FROM deduped
         ${postFilter}
         GROUP BY "${C.invoiceType}"
         ORDER BY total_amount DESC`,
        values
      ),

      // ── Monthly Invoice Count + Amount ────────────
      db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')   AS month_key,
           TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')  AS month_label,
           COUNT(*)                                         AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})                        AS total_amount
         FROM deduped
         ${baseWhere}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY month_key, month_label
         ORDER BY month_key`,
        values
      ),
    ]);

    res.json({
      kpi:             kpiRes.rows[0]  || {},
      statusBreakdown: statusRes.rows,
      typeBreakdown:   typeRes.rows,
      monthly:         monthlyRes.rows,
    });
  } catch (err) {
    console.error('[invoice-summary] Error:', err.message);
    res.status(500).json({ error: 'Invoice summary query failed', detail: err.message });
  }
});

/* ─────────────────────────────────────────────
   GET /api/invoice-summary/table
───────────────────────────────────────────── */
router.get('/table', async (req, res) => {
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
    const { cte, postFilter, values, nextParamIndex } = buildDedupCTE(filters);
    const orderBy = buildOrderBy(req.query.sort_by, req.query.sort_dir);

    const countRes = await db.query(
      `${cte} SELECT COUNT(*) AS total FROM deduped ${postFilter}`,
      values
    );
    const total = parseInt(countRes.rows[0]?.total || 0, 10);

    const { limitClause, page, pageSize } = buildPagination(
      values, nextParamIndex, req.query.page, req.query.page_size
    );

    const dataRes = await db.query(
      `${cte}
       SELECT
         "${C.invoiceNo}"                     AS invoice_no,
         "${C.invoiceDate}"                   AS invoice_date,
         COALESCE("${C.site}", '')            AS site,
         COALESCE("${C.customerName}", '')    AS customer_name,
         COALESCE("${C.invoiceType}", '')     AS invoice_type,
         COALESCE("${C.status}", '')          AS status,
         ${AMOUNT_NET_EXPR}                   AS net_amount,
         ${AMOUNT_TAX_EXPR}                   AS tax,
         ${AMOUNT_GROSS_EXPR}                 AS amount,
         ${AMOUNT_CHARGE_EXPR}                AS charge,
         ${AMOUNT_DISCOUNT_EXPR}              AS discount,
         COALESCE("${C.shipState}", '')       AS state,
         COALESCE("${C.shipCity}", '')        AS city,
         COALESCE("${C.partyGroup}", '')      AS party_group,
         COALESCE("${C.employeeName}", '')    AS employee_name
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
    console.error('[invoice-summary/table] Error:', err.message);
    res.status(500).json({ error: 'Table query failed', detail: err.message });
  }
});

module.exports = router;
