/**
 * routes/salesDistributionMap.js
 * Sales Distribution Map
 *
 * GET /api/sales-map   → Aggregated sales by State, District, Zone
 *
 * Rules:
 *  - Invoice_No_ NOT LIKE '%-R'  (enforced in dedup CTE)
 *  - Dedup first → filter after  (correct financial figures)
 *  - Only returns aggregated data — NEVER raw invoice rows
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { AMOUNT_EXPR, C, buildDedupCTE } = require('../services/queryBuilder');

router.get('/', async (req, res) => {
  try {
    const filters = {
      status:      req.query.status,
      invoiceType: req.query.invoice_type,
    };
    const { cte, postFilter, values } = buildDedupCTE(filters);

    // Combine postFilter with additional conditions cleanly
    const baseWhere = postFilter || 'WHERE TRUE';

    const [stateRes, districtRes, zoneRes] = await Promise.all([

      // ── Sales by State (Bill_To_Address_State) ──────────────────────
      db.query(
        `${cte}
         SELECT
           "${C.billState}"           AS state,
           COUNT(*)                   AS invoice_count,
           SUM(${AMOUNT_EXPR})        AS total_amount,
           AVG(${AMOUNT_EXPR})        AS avg_amount
         FROM deduped
         ${baseWhere}
           AND "${C.billState}" IS NOT NULL
           AND "${C.billState}" != ''
         GROUP BY "${C.billState}"
         ORDER BY total_amount DESC`,
        values
      ),

      // ── Top 20 Districts ────────────────────────────────────────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.billDistrict}", 'Unknown')  AS district,
           COALESCE("${C.billState}", '')             AS state,
           COUNT(*)                                   AS invoice_count,
           SUM(${AMOUNT_EXPR})                        AS total_amount
         FROM deduped
         ${baseWhere}
           AND "${C.billState}" IS NOT NULL
           AND "${C.billState}" != ''
         GROUP BY "${C.billDistrict}", "${C.billState}"
         ORDER BY total_amount DESC
         LIMIT 20`,
        values
      ),

      // ── Sales by Zone ────────────────────────────────────────────────
      db.query(
        `${cte}
         SELECT
           COALESCE("${C.billZone}", 'Unassigned')  AS zone,
           COUNT(*)                                  AS invoice_count,
           SUM(${AMOUNT_EXPR})                       AS total_amount
         FROM deduped
         ${postFilter}
         GROUP BY "${C.billZone}"
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
      districts: districtRes.rows,
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
