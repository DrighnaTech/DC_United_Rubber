/**
 * services/queryBuilder.js
 * Central query-building utilities shared by all route files.
 *
 * DESIGN DECISION — deduplication vs. filter order:
 * ─────────────────────────────────────────────────
 * The source table has ~4× duplicate rows per invoice (weekly snapshots).
 * Each weekly snapshot may have different Status_, amounts, etc.
 *
 * CORRECT approach (used here):
 *   1. Deduplicate first  — pick the LATEST snapshot per Invoice_No_
 *                          (ORDER BY row_id DESC = most recent row wins)
 *   2. Filter on result  — Status_ / Invoice_Type_ apply to the CURRENT state
 *
 * WRONG approach (never do this):
 *   Filtering inside the DISTINCT ON CTE causes you to pick the latest row
 *   that matches the filter — which may not be the latest overall snapshot.
 *   This causes inflated totals that exceed the unfiltered total.
 *
 * KEY RULE (enforced here, never on the frontend):
 *   "Invoice_No_" NOT LIKE '%-R'
 */

'use strict';

const cfg = require('./dbConfig');

// Fully-qualified table reference  e.g. "LandingStage2"."mf_sales_si_siheader_all"
const FULL_TABLE = `"${cfg.schema}"."${cfg.table}"`;

// Column shortcuts
const C = cfg.columns;

// Safe amount expression — column is TEXT, cast to NUMERIC, default 0 for nulls/blanks
const AMOUNT_EXPR = `COALESCE(NULLIF("${C.amount}", '')::NUMERIC, 0)`;

/**
 * Builds the standard query pattern:
 *   WITH deduped AS (
 *     SELECT DISTINCT ON ("Invoice_No_") *
 *     FROM <table>
 *     WHERE "Invoice_No_" NOT LIKE '%-R'
 *     ORDER BY "Invoice_No_", row_id DESC
 *   )
 *   SELECT ...
 *   FROM deduped
 *   WHERE [status filter] AND [invoice_type filter]
 *
 * Returns:
 *   cte            — the WITH deduped AS (...) string (no trailing newline)
 *   postFilter     — AND conditions to append to a WHERE clause after deduped
 *   values         — parameter values array
 *   nextParamIndex — next available $n index
 *
 * @param {object} filters        { status?: string, invoiceType?: string }
 * @param {number} startParamIdx  Starting $n index (default 1)
 */
function buildDedupCTE(filters = {}, startParamIdx = 1) {
  const { status, invoiceType } = filters;
  const postConditions = [];
  const values = [];
  let pi = startParamIdx;

  if (status && status.trim() !== '' && status !== 'all') {
    postConditions.push(`"${C.status}" = $${pi++}`);
    values.push(status.trim());
  }
  if (invoiceType && invoiceType.trim() !== '' && invoiceType !== 'all') {
    postConditions.push(`"${C.invoiceType}" = $${pi++}`);
    values.push(invoiceType.trim());
  }

  // Base CTE — excludes -R, deduplicates to latest snapshot per invoice
  const cte = `WITH deduped AS (
  SELECT DISTINCT ON ("${C.invoiceNo}") *
  FROM ${FULL_TABLE}
  WHERE "${C.invoiceNo}" NOT LIKE '%-R'
  ORDER BY "${C.invoiceNo}", ${C.rowId} DESC
)`;

  // Post-dedup filter fragment (empty string if no filters)
  const postFilter = postConditions.length
    ? 'WHERE ' + postConditions.join(' AND ')
    : '';

  return { cte, postFilter, values, nextParamIndex: pi };
}

/**
 * Builds pagination params and appends them to an existing values array.
 * Returns { limitClause, page, pageSize }
 * MUTATES values array by appending limit + offset.
 */
function buildPagination(values, pi, page = 1, pageSize = 50) {
  const safePage     = Math.max(1, parseInt(page, 10) || 1);
  const safePageSize = Math.min(500, Math.max(10, parseInt(pageSize, 10) || 50));
  const offset       = (safePage - 1) * safePageSize;

  values.push(safePageSize, offset);

  return {
    limitClause: `LIMIT $${pi} OFFSET $${pi + 1}`,
    page:        safePage,
    pageSize:    safePageSize,
  };
}

/**
 * Whitelist of sortable columns for paginated tables.
 * Prevents SQL injection via ORDER BY.
 */
const SORTABLE_COLUMNS = {
  invoice_no:    `"${C.invoiceNo}"`,
  invoice_date:  `"${C.invoiceDate}"::DATE`,
  customer_name: `"${C.customerName}"`,
  invoice_type:  `"${C.invoiceType}"`,
  status:        `"${C.status}"`,
  amount:        AMOUNT_EXPR,
};

function buildOrderBy(sortBy = 'invoice_date', sortDir = 'desc') {
  const col = SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS['invoice_date'];
  const dir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${col} ${dir}`;
}

module.exports = {
  FULL_TABLE,
  AMOUNT_EXPR,
  C,
  buildDedupCTE,
  buildPagination,
  buildOrderBy,
};
