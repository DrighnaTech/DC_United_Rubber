/**
 * routes/salesDistributionMap.js
 * Sales Distribution Map
 *
 * GET /api/sales-map  → Aggregated sales by Ship-To State, City, Zone (per CRD)
 *
 * Rules:
 *  - Invoice_No_ NOT LIKE '%-R'  (enforced in dedup CTE)
 *  - Dedup first → filter after
 *  - Map uses Ship_To_Address_State (CRD requirement)
 *  - Sales Qty by City from item detail table
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const {
  AMOUNT_GROSS_EXPR, AMOUNT_NET_EXPR, ITEM_AMOUNT_EXPR,
  C, buildDedupCTE, buildItemCTE,
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
    const itemCTE = buildItemCTE();
    const baseWhere = postFilter || 'WHERE TRUE';

    const [stateRes, cityQtyRes, zoneRes] = await Promise.all([

      // ── Sales by Ship-to State (Gross Amount) ────────────────────────
      db.query(
        `${cte}
         SELECT
           "${C.shipState}"           AS state,
           COUNT(*)                   AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})  AS total_amount,
           SUM(${AMOUNT_NET_EXPR})    AS net_amount,
           AVG(${AMOUNT_GROSS_EXPR})  AS avg_amount
         FROM deduped
         ${baseWhere}
           AND "${C.shipState}" IS NOT NULL
           AND "${C.shipState}" != ''
         GROUP BY "${C.shipState}"
         ORDER BY total_amount DESC`,
        values
      ),

      // ── Sales Qty by Ship-to City (from item detail table) ───────────
      db.query(
        `${cte},
         filtered_inv AS (
           SELECT "${C.invoiceNo}", "${C.shipCity}"
           FROM deduped
           ${baseWhere}
             AND "${C.shipCity}" IS NOT NULL
             AND "${C.shipCity}" != ''
         ),
         ${itemCTE}
         SELECT
           fi."${C.shipCity}"                                           AS city,
           COUNT(DISTINCT di."${C.invoiceNo}")                         AS invoice_count,
           ROUND(SUM(COALESCE(NULLIF(di."${C.salesQty}",'')::NUMERIC,0)), 2) AS total_qty,
           ROUND(SUM(${ITEM_AMOUNT_EXPR}), 2)                         AS total_amount
         FROM deduped_items di
         INNER JOIN filtered_inv fi ON di."${C.invoiceNo}" = fi."${C.invoiceNo}"
         WHERE di."${C.itemCode}" IS NOT NULL
         GROUP BY fi."${C.shipCity}"
         ORDER BY total_qty DESC
         LIMIT 20`,
        values
      ),

      // ── Sales by Ship-to Zone ─────────────────────────────────────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.shipZone}", 'Unassigned')  AS zone,
           COUNT(*)                                  AS invoice_count,
           SUM(${AMOUNT_GROSS_EXPR})                 AS total_amount
         FROM deduped
         ${postFilter}
         GROUP BY "${C.shipZone}"
         ORDER BY total_amount DESC
         LIMIT 15`,
        values
      ),
    ]);

    const stateData    = stateRes.rows;
    const maxAmount    = stateData.reduce((mx, r) => Math.max(mx, parseFloat(r.total_amount) || 0), 0);
    const totalRevenue = stateData.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);

    res.json({
      states:    stateData,
      cities:    cityQtyRes.rows,
      zones:     zoneRes.rows,
      summary: {
        total_revenue:  totalRevenue,
        max_state_rev:  maxAmount,
        states_covered: stateData.length,
      },
    });
  } catch (err) {
    console.error('[sales-map] Error:', err.message);
    res.status(500).json({ error: 'Map query failed', detail: err.message });
  }
});

module.exports = router;
