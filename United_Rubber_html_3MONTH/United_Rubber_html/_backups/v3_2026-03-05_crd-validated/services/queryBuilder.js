/**
 * services/queryBuilder.js
 * Central query-building utilities shared by all route files.
 *
 * DESIGN DECISION — deduplication vs. filter order:
 * ─────────────────────────────────────────────────
 * The source table has ~4× duplicate rows per invoice (weekly snapshots).
 *
 * CORRECT approach (used here):
 *   1. Deduplicate first  — pick the LATEST snapshot per Invoice_No_
 *                          (ORDER BY row_id DESC = most recent row wins)
 *   2. Filter on result  — Status_ / Invoice_Type_ / date / site etc.
 *                          apply to the CURRENT state
 *
 * KEY RULE (enforced here, never on the frontend):
 *   "Invoice_No_" NOT LIKE '%-R'
 *
 * Tables used:
 *   FULL_TABLE      — Sales invoice header (primary)
 *   ITEM_FULL_TABLE — Sales invoice item detail (item-level queries)
 */

'use strict';

const cfg = require('./dbConfig');

// Fully-qualified table references
const FULL_TABLE      = `"${cfg.schema}"."${cfg.headerTable}"`;
const ITEM_FULL_TABLE = `"${cfg.schema}"."${cfg.itemTable}"`;

// Column shortcuts
const C = cfg.columns;

// Amount expressions — all TEXT columns, safely cast to NUMERIC
const AMOUNT_EXPR       = `COALESCE(NULLIF("${C.amountFinal}", '')::NUMERIC, 0)`;  // Final Net (backward compat)
const AMOUNT_NET_EXPR   = `COALESCE(NULLIF("${C.amount}", '')::NUMERIC, 0)`;       // Net Amount (Amount_) per CRD
const AMOUNT_GROSS_EXPR = `COALESCE(NULLIF("${C.amountGross}", '')::NUMERIC, 0)`;  // Gross Amount (Invoice_Amount_)
const AMOUNT_TAX_EXPR   = `COALESCE(NULLIF("${C.tax}", '')::NUMERIC, 0)`;          // Tax
const ITEM_AMOUNT_EXPR  = `COALESCE(NULLIF("${C.itemAmount}", '')::NUMERIC, 0)`;    // Item-level amount

/**
 * Builds the standard dedup + filter query pattern.
 *
 * Supported filters:
 *   status        — Status_
 *   invoiceType   — Invoice_Type_
 *   dateFrom      — Invoice_Date_(Date) >= dateFrom  (ISO or YYYY-MM-DD)
 *   dateTo        — Invoice_Date_(Date) <= dateTo
 *   site          — Site_
 *   shipState     — Ship_To_Address_State
 *   customerName  — Customer_Name_ ILIKE %name%
 *
 * @param {object} filters       Filter values
 * @param {number} startParamIdx Starting $n index (default 1)
 */
function buildDedupCTE(filters = {}, startParamIdx = 1) {
  const { status, invoiceType, dateFrom, dateTo, site, shipState, customerName } = filters;
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
  if (dateFrom && dateFrom.trim() !== '') {
    postConditions.push(`"${C.invoiceDate}"::DATE >= $${pi++}::DATE`);
    values.push(dateFrom.trim());
  }
  if (dateTo && dateTo.trim() !== '') {
    postConditions.push(`"${C.invoiceDate}"::DATE <= $${pi++}::DATE`);
    values.push(dateTo.trim());
  }
  if (site && site.trim() !== '' && site !== 'all') {
    postConditions.push(`"${C.site}" = $${pi++}`);
    values.push(site.trim());
  }
  if (shipState && shipState.trim() !== '' && shipState !== 'all') {
    postConditions.push(`"${C.shipState}" = $${pi++}`);
    values.push(shipState.trim());
  }
  if (customerName && customerName.trim() !== '') {
    postConditions.push(`"${C.customerName}" ILIKE $${pi++}`);
    values.push('%' + customerName.trim() + '%');
  }

  // Base CTE — excludes -R and shadow rows (Status/Type='0' are partition
  // placeholders that zero out amounts and corrupt DISTINCT ON selection),
  // then deduplicates to the latest valid snapshot per invoice.
  const cte = `WITH deduped AS (
  SELECT DISTINCT ON ("${C.invoiceNo}") *
  FROM ${FULL_TABLE}
  WHERE "${C.invoiceNo}" NOT LIKE '%-R'
    AND "${C.status}"      != '0'
    AND "${C.invoiceType}" != '0'
  ORDER BY "${C.invoiceNo}", ${C.rowId} DESC
)`;

  const postFilter = postConditions.length
    ? 'WHERE ' + postConditions.join(' AND ')
    : '';

  return { cte, postFilter, values, nextParamIndex: pi };
}

/**
 * Builds a deduped CTE for the item detail table.
 * Dedup key: (Invoice_No_, Item_Code_) — latest row per unique item per invoice.
 */
function buildItemCTE() {
  return `deduped_items AS (
  SELECT DISTINCT ON ("${C.invoiceNo}", "${C.itemCode}") *
  FROM ${ITEM_FULL_TABLE}
  WHERE "${C.invoiceNo}" NOT LIKE '%-R'
    AND "${C.itemCode}" IS NOT NULL
    AND "${C.itemCode}" != ''
    AND "${C.itemCode}" != '0'
  ORDER BY "${C.invoiceNo}", "${C.itemCode}", ${C.rowId} DESC
)`;
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
  net_amount:    AMOUNT_NET_EXPR,
  gross_amount:  AMOUNT_GROSS_EXPR,
};

function buildOrderBy(sortBy = 'invoice_date', sortDir = 'desc') {
  const col = SORTABLE_COLUMNS[sortBy] || SORTABLE_COLUMNS['invoice_date'];
  const dir = sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${col} ${dir}`;
}

module.exports = {
  FULL_TABLE,
  ITEM_FULL_TABLE,
  AMOUNT_EXPR,
  AMOUNT_NET_EXPR,
  AMOUNT_GROSS_EXPR,
  AMOUNT_TAX_EXPR,
  ITEM_AMOUNT_EXPR,
  C,
  buildDedupCTE,
  buildItemCTE,
  buildPagination,
  buildOrderBy,
};
