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
const AMOUNT_EXPR         = `COALESCE(NULLIF("${C.amountFinal}", '')::NUMERIC, 0)`;  // Final Net (backward compat)
const AMOUNT_NET_EXPR     = `COALESCE(NULLIF("${C.amount}", '')::NUMERIC, 0)`;       // Net Amount (Amount_) per CRD
const AMOUNT_GROSS_EXPR   = `COALESCE(NULLIF("${C.amountGross}", '')::NUMERIC, 0)`;  // Gross Amount (Invoice_Amount_)
const AMOUNT_TAX_EXPR     = `COALESCE(NULLIF("${C.tax}", '')::NUMERIC, 0)`;          // Tax
const AMOUNT_CHARGE_EXPR  = `COALESCE(NULLIF("${C.charge}", '')::NUMERIC, 0)`;       // Charges
const AMOUNT_DISCOUNT_EXPR= `COALESCE(NULLIF("${C.discount}", '')::NUMERIC, 0)`;     // Discounts
const ITEM_AMOUNT_EXPR    = `COALESCE(NULLIF("${C.itemAmount}", '')::NUMERIC, 0)`;   // Item-level amount

/**
 * Splits a comma-separated filter string into a clean array.
 * Returns [] if empty / undefined / 'all'.
 */
function parseMultiValue(val) {
  if (!val) return [];
  return val.split(',').map(s => s.trim()).filter(s => s && s !== 'all');
}

/**
 * Builds the standard dedup + filter query pattern.
 *
 * Supported filters (all support multi-select via comma-separated values):
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

  // Multi-value filters use = ANY($n) — supports both single and multiple selections
  const statusArr = parseMultiValue(status);
  if (statusArr.length) {
    postConditions.push(`"${C.status}" = ANY($${pi++})`);
    values.push(statusArr);
  }
  const invoiceTypeArr = parseMultiValue(invoiceType);
  if (invoiceTypeArr.length) {
    postConditions.push(`"${C.invoiceType}" = ANY($${pi++})`);
    values.push(invoiceTypeArr);
  }
  if (dateFrom && dateFrom.trim() !== '') {
    postConditions.push(`"${C.invoiceDate}"::DATE >= $${pi++}::DATE`);
    values.push(dateFrom.trim());
  }
  if (dateTo && dateTo.trim() !== '') {
    postConditions.push(`"${C.invoiceDate}"::DATE <= $${pi++}::DATE`);
    values.push(dateTo.trim());
  }
  const siteArr = parseMultiValue(site);
  if (siteArr.length) {
    postConditions.push(`"${C.site}" = ANY($${pi++})`);
    values.push(siteArr);
  }
  const shipStateArr = parseMultiValue(shipState);
  if (shipStateArr.length) {
    postConditions.push(`"${C.shipState}" = ANY($${pi++})`);
    values.push(shipStateArr);
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
 * Dedup key: (Invoice_No_, Item_Code_) — most recent NON-ZERO qty row per item per invoice.
 *
 * CRITICAL FIX: The item table has the same weekly-snapshot shadow-row problem as the header.
 * The LATEST row_id often has Sales_Qty_='0' (zeroed-out partition). Filtering those out
 * inside the WHERE clause ensures we pick the most recent snapshot with actual quantity data.
 */
function buildItemCTE() {
  return `deduped_items AS (
  SELECT DISTINCT ON ("${C.invoiceNo}", "${C.itemCode}") *
  FROM ${ITEM_FULL_TABLE}
  WHERE "${C.invoiceNo}" NOT LIKE '%-R'
    AND "${C.itemCode}" IS NOT NULL
    AND "${C.itemCode}" != ''
    AND "${C.itemCode}" != '0'
    AND COALESCE(NULLIF("${C.salesQty}", '')::NUMERIC, 0) > 0
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
  AMOUNT_CHARGE_EXPR,
  AMOUNT_DISCOUNT_EXPR,
  ITEM_AMOUNT_EXPR,
  C,
  buildDedupCTE,
  buildItemCTE,
  buildPagination,
  buildOrderBy,
  parseMultiValue,
};
