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
  AMOUNT_EXPR, AMOUNT_NET_EXPR, AMOUNT_GROSS_EXPR, AMOUNT_TAX_EXPR,
  ITEM_AMOUNT_EXPR, ITEM_FULL_TABLE, C,
  buildDedupCTE, buildItemCTE,
  buildPagination,
  buildOrderBy,
} = require('../services/queryBuilder');

/* ─────────────────────────────────────────────
   GET /api/sales-dashboard
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
    const itemCTE = buildItemCTE();

    const [kpiRes, statusRes, monthlyRes, customerRes, itemCatRes, itemKpiRes, custNetRes] = await Promise.all([

      // ── KPI Summary ──────────────────────────────
      db.query(
        `${cte}
         SELECT
           COUNT(*)                                      AS total_invoices,
           SUM(${AMOUNT_EXPR})                           AS total_sales,
           SUM(${AMOUNT_NET_EXPR})                       AS total_net_amount,
           SUM(${AMOUNT_GROSS_EXPR})                     AS total_gross_amount,
           SUM(${AMOUNT_TAX_EXPR})                       AS total_tax,
           AVG(${AMOUNT_GROSS_EXPR})                     AS avg_invoice_value,
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
           SUM(${AMOUNT_GROSS_EXPR})            AS total_amount
         FROM deduped
         ${postFilter}
         GROUP BY "${C.status}"
         ORDER BY total_amount DESC`,
        values
      ),

      // ── Monthly Revenue Trend ─────────────────────
      db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM')   AS month_key,
           TO_CHAR("${C.invoiceDate}"::DATE, 'Mon YYYY')  AS month_label,
           COUNT(*)                                         AS invoice_count,
           SUM(${AMOUNT_NET_EXPR})                          AS total_net,
           SUM(${AMOUNT_GROSS_EXPR})                        AS total_amount
         FROM deduped
         ${postFilter || 'WHERE TRUE'}
           AND "${C.invoiceDate}" IS NOT NULL
           AND "${C.invoiceDate}" != ''
         GROUP BY month_key, month_label
         ORDER BY month_key`,
        values
      ),

      // ── Top 10 Customers by Gross Amount ─────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.customerName}", 'Unknown')  AS customer_name,
           COUNT(*)                                   AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})                  AS total_amount,
           SUM(${AMOUNT_NET_EXPR})                    AS net_amount
         FROM deduped
         ${postFilter || 'WHERE TRUE'}
           AND "${C.customerName}" IS NOT NULL
           AND "${C.customerName}" != ''
         GROUP BY "${C.customerName}"
         ORDER BY total_amount DESC
         LIMIT 10`,
        values
      ),

      // ── Net Amount by Item Category (item detail table joined to filtered header) ──
      db.query(
        `${cte},
         filtered_inv AS (
           SELECT "${C.invoiceNo}" FROM deduped ${postFilter}
         ),
         ${itemCTE}
         SELECT
           COALESCE(di."${C.itemCategory}", 'Uncategorized') AS category,
           COUNT(DISTINCT di."${C.invoiceNo}")                AS invoice_count,
           ROUND(SUM(${ITEM_AMOUNT_EXPR}), 2)                AS total_amount,
           ROUND(SUM(COALESCE(NULLIF(di."${C.salesQty}",'')::NUMERIC,0)), 0) AS total_qty
         FROM deduped_items di
         INNER JOIN filtered_inv fi ON di."${C.invoiceNo}" = fi."${C.invoiceNo}"
         WHERE di."${C.itemCategory}" IS NOT NULL
           AND di."${C.itemCategory}" != ''
         GROUP BY di."${C.itemCategory}"
         ORDER BY total_amount DESC
         LIMIT 15`,
        values
      ),

      // ── Total Sales Qty + Total Rate Sum (CRD method: SUM DISTINCT per invoice+item+qty) ─
      db.query(
        `${cte},
         filtered_inv AS (
           SELECT "${C.invoiceNo}" FROM deduped ${postFilter}
         ),
         item_base AS (
           SELECT i."${C.invoiceNo}", i."${C.itemCode}", i."${C.salesQty}",
             COALESCE(NULLIF(i."${C.rate}",'')::NUMERIC, 0)     AS rate_val,
             COALESCE(NULLIF(i."${C.salesQty}",'')::NUMERIC, 0) AS qty_val
           FROM ${ITEM_FULL_TABLE} i
           INNER JOIN filtered_inv fi ON i."${C.invoiceNo}" = fi."${C.invoiceNo}"
           WHERE i."${C.invoiceNo}" NOT LIKE '%-R'
             AND i."${C.itemCode}" IS NOT NULL
             AND i."${C.itemCode}" != ''
             AND i."${C.itemCode}" != '0'
         ),
         rate_agg AS (
           SELECT "Invoice_No_", "Item_Code_", "Sales_Qty_",
             SUM(DISTINCT CASE WHEN rate_val <> 0 THEN rate_val END) AS rate_sum
           FROM item_base GROUP BY "Invoice_No_", "Item_Code_", "Sales_Qty_"
         ),
         qty_agg AS (
           SELECT "Invoice_No_", "Item_Code_",
             SUM(DISTINCT CASE WHEN qty_val <> 0 THEN qty_val END) AS qty_sum
           FROM item_base GROUP BY "Invoice_No_", "Item_Code_"
         )
         SELECT
           (SELECT ROUND(SUM(rate_sum)/10000000, 2) FROM rate_agg) AS total_rate_cr,
           (SELECT ROUND(SUM(qty_sum), 0)            FROM qty_agg) AS total_sales_qty`,
        values
      ),

      // ── Customer Net Amount (Pie: Sales Distribution by Customer) ─────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.customerName}", 'Unknown') AS customer_name,
           SUM(${AMOUNT_NET_EXPR})                   AS net_amount
         FROM deduped
         ${postFilter || 'WHERE TRUE'}
           AND "${C.customerName}" IS NOT NULL
           AND "${C.customerName}" != ''
         GROUP BY "${C.customerName}"
         ORDER BY net_amount DESC
         LIMIT 15`,
        values
      ),
    ]);

    // Merge item KPIs into the header KPI row
    const kpi = kpiRes.rows[0] || {};
    const itemKpi = itemKpiRes.rows[0] || {};
    kpi.total_sales_qty = itemKpi.total_sales_qty || 0;
    kpi.total_rate_cr   = itemKpi.total_rate_cr   || 0;

    res.json({
      kpi,
      status:        statusRes.rows   || [],
      monthly:       monthlyRes.rows  || [],
      customers:     customerRes.rows || [],   // gross by customer (bar)
      customers_net: custNetRes.rows  || [],   // net by customer (pie)
      itemCategory:  itemCatRes.rows  || [],
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
         ${AMOUNT_NET_EXPR}                            AS net_amount,
         ${AMOUNT_GROSS_EXPR}                          AS amount,
         ${AMOUNT_TAX_EXPR}                            AS tax,
         COALESCE("${C.site}", '')                     AS site,
         COALESCE("${C.shipState}", '')                AS state,
         COALESCE("${C.shipCity}", '')                 AS city
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
