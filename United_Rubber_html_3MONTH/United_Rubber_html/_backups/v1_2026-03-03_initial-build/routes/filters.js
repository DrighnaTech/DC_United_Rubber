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

router.get('/', async (req, res) => {
  try {
    const [statusRes, typeRes] = await Promise.all([
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
    ]);

    res.json({
      status:      statusRes.rows.map(r => r.value),
      invoiceType: typeRes.rows.map(r => r.value),
    });
  } catch (err) {
    console.error('[filters] Error:', err.message);
    res.status(500).json({ error: 'Failed to load filter options' });
  }
});

module.exports = router;
