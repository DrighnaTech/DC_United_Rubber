/**
 * routes/filters.js
 * GET /api/filters
 * Returns distinct Status_ and Invoice_Type_ values for the global filter dropdowns.
 * Exclusion rule applied: Invoice_No_ NOT LIKE '%-R'
 */

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { FULL_TABLE, C } = require('../services/queryBuilder');

// In-memory cache — filter options rarely change, cache for 10 minutes
let filterCache = null;
let filterCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

router.get('/', async (req, res) => {
  try {
    // Return cached result if still fresh
    if (filterCache && (Date.now() - filterCacheTime) < CACHE_TTL) {
      return res.json(filterCache);
    }

    const [statusRes, typeRes, siteRes, shipStateRes, customerNameRes, dateRangeRes] = await Promise.all([

      db.query(`
        SELECT DISTINCT "${C.status}" AS value
        FROM ${FULL_TABLE}
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.status}" IS NOT NULL
          AND "${C.status}" != ''
          AND "${C.status}" != '0'
        ORDER BY value
      `),

      db.query(`
        SELECT DISTINCT "${C.invoiceType}" AS value
        FROM ${FULL_TABLE}
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.invoiceType}" IS NOT NULL
          AND "${C.invoiceType}" != ''
          AND "${C.invoiceType}" != '0'
        ORDER BY value
      `),

      db.query(`
        SELECT DISTINCT "${C.site}" AS value
        FROM ${FULL_TABLE}
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.site}" IS NOT NULL
          AND "${C.site}" != ''
        ORDER BY value
      `),

      db.query(`
        SELECT DISTINCT "${C.shipState}" AS value
        FROM ${FULL_TABLE}
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.shipState}" IS NOT NULL
          AND "${C.shipState}" != ''
        ORDER BY value
      `),

      db.query(`
        SELECT DISTINCT "${C.customerName}" AS value
        FROM ${FULL_TABLE}
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.customerName}" IS NOT NULL
          AND "${C.customerName}" != ''
        ORDER BY value
        LIMIT 500
      `),

      db.query(`
        SELECT
          TO_CHAR(MIN("${C.invoiceDate}"::DATE), 'YYYY-MM-DD') AS min_date,
          TO_CHAR(MAX("${C.invoiceDate}"::DATE), 'YYYY-MM-DD') AS max_date
        FROM ${FULL_TABLE}
        WHERE "${C.invoiceNo}" NOT LIKE '%-R'
          AND "${C.invoiceDate}" IS NOT NULL
          AND "${C.invoiceDate}" != ''
          AND "${C.status}" != '0'
          AND "${C.invoiceType}" != '0'
      `),
    ]);

    const result = {
      status:        statusRes.rows.map(r => r.value),
      invoiceType:   typeRes.rows.map(r => r.value),
      site:          siteRes.rows.map(r => r.value),
      shipState:     shipStateRes.rows.map(r => r.value),
      customerName:  customerNameRes.rows.map(r => r.value),
      dateRange:     dateRangeRes.rows[0] || {},
    };

    // Cache the result
    filterCache = result;
    filterCacheTime = Date.now();

    res.json(result);
  } catch (err) {
    console.error('[filters] Error:', err.message);
    res.status(500).json({ error: 'Failed to load filter options' });
  }
});

module.exports = router;
