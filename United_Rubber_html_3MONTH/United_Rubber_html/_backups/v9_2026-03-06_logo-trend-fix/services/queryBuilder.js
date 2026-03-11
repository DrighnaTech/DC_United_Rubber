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
 * DEDUP STRATEGY (reference-query-aligned):
 *   All user filters (status, type, date, site, state, customer) are placed
 *   INSIDE the CTE WHERE clause. DISTINCT ON then picks the latest row that
 *   MATCHES the filters — not the absolute latest row.
 *
 *   This matches the Excel-validated reference query:
 *     SELECT "Invoice_No_", SUM(DISTINCT CAST("Amount_" AS NUMERIC))
 *     FROM table WHERE [all conditions] GROUP BY "Invoice_No_"
 *
 *   Why this matters: an invoice that was "Exported To GL" in an older
 *   partition but "Reverted" in the latest partition will be INCLUDED
 *   (correct) rather than EXCLUDED by the old post-filter approach.
 *
 * Supported filters (all support multi-select via comma-separated values):
 *   status        — Status_
 *   invoiceType   — Invoice_Type_
 *   dateFrom      — Invoice_Date_(Date) >= dateFrom  (ISO or YYYY-MM-DD)
 *   dateTo        — Invoice_Date_(Date) <= dateTo
 *   site          — Site_
 *   shipState     — Ship_To_Address_State
 *   customerName  — Customer_Name_
 *
 * @param {object} filters       Filter values
 * @param {number} startParamIdx Starting $n index (default 1)
 */
function buildDedupCTE(filters = {}, startParamIdx = 1) {
  const { status, invoiceType, dateFrom, dateTo, site, shipState, customerName } = filters;

  // DEDUP STRATEGY — matches Excel-validated reference query exactly:
  //   SELECT Invoice_No_, SUM(DISTINCT Amount_) FROM table WHERE [filters] GROUP BY Invoice_No_
  //
  // Using GROUP BY + SUM(DISTINCT) instead of DISTINCT ON because:
  //  1. Invoices that changed status between partitions are correctly included
  //     (filter applied to ALL rows, not just the latest snapshot)
  //  2. 15 invoices have different Amount_ values across partitions —
  //     SUM(DISTINCT) correctly aggregates them, matching the reference
  //  3. Amount columns cast back to ::TEXT so existing AMOUNT_EXPR constants
  //     (COALESCE/NULLIF/::NUMERIC) work unchanged on the deduped CTE
  //
  // All user filters go in WHERE before the GROUP BY.
  // postFilter is always '' — outer queries use `${postFilter || 'WHERE TRUE'} AND ...`

  const whereConditions = [
    `"${C.invoiceNo}" NOT LIKE '%-R'`,
    `"${C.status}"      != '0'`,
    `"${C.invoiceType}" != '0'`,
  ];
  const values = [];
  let pi = startParamIdx;

  // Helper: SUM(DISTINCT ...) cast back to TEXT for AMOUNT_EXPR compat
  const amtCol = col => `SUM(DISTINCT COALESCE(NULLIF("${col}",'')::NUMERIC,0))::TEXT`;

  const statusArr = parseMultiValue(status);
  if (statusArr.length) {
    whereConditions.push(`"${C.status}" = ANY($${pi++})`);
    values.push(statusArr);
  }
  const invoiceTypeArr = parseMultiValue(invoiceType);
  if (invoiceTypeArr.length) {
    whereConditions.push(`"${C.invoiceType}" = ANY($${pi++})`);
    values.push(invoiceTypeArr);
  }
  if (dateFrom && dateFrom.trim() !== '') {
    whereConditions.push(`"${C.invoiceDate}" >= $${pi++}`);
    values.push(dateFrom.trim());
  }
  if (dateTo && dateTo.trim() !== '') {
    whereConditions.push(`"${C.invoiceDate}" <= $${pi++}`);
    values.push(dateTo.trim());
  }
  const siteArr = parseMultiValue(site);
  if (siteArr.length) {
    whereConditions.push(`"${C.site}" = ANY($${pi++})`);
    values.push(siteArr);
  }
  const shipStateArr = parseMultiValue(shipState);
  if (shipStateArr.length) {
    whereConditions.push(`"${C.shipState}" = ANY($${pi++})`);
    values.push(shipStateArr);
  }
  const customerNameArr = parseMultiValue(customerName);
  if (customerNameArr.length) {
    whereConditions.push(`"${C.customerName}" = ANY($${pi++})`);
    values.push(customerNameArr);
  }

  const where = whereConditions.join('\n    AND ');

  const cte = `WITH deduped AS (
  SELECT
    "${C.invoiceNo}",
    MAX("${C.invoiceDate}")       AS "${C.invoiceDate}",
    MAX("${C.status}")            AS "${C.status}",
    MAX("${C.invoiceType}")       AS "${C.invoiceType}",
    MAX("${C.customerName}")      AS "${C.customerName}",
    MAX("${C.customerCode}")      AS "${C.customerCode}",
    MAX("${C.site}")              AS "${C.site}",
    MAX("${C.description}")       AS "${C.description}",
    MAX("${C.createdDate}")       AS "${C.createdDate}",
    MAX("${C.approvedDate}")      AS "${C.approvedDate}",
    MAX("${C.prepDate}")          AS "${C.prepDate}",
    MAX("${C.removalDate}")       AS "${C.removalDate}",
    MAX("${C.employeeCode}")      AS "${C.employeeCode}",
    MAX("${C.employeeName}")      AS "${C.employeeName}",
    MAX("${C.partyGroup}")        AS "${C.partyGroup}",
    MAX("${C.partyCategory}")     AS "${C.partyCategory}",
    MAX("${C.shipState}")         AS "${C.shipState}",
    MAX("${C.shipDistrict}")      AS "${C.shipDistrict}",
    MAX("${C.shipCity}")          AS "${C.shipCity}",
    MAX("${C.shipZone}")          AS "${C.shipZone}",
    MAX("${C.shipRegion}")        AS "${C.shipRegion}",
    MAX("${C.billState}")         AS "${C.billState}",
    MAX("${C.billCity}")          AS "${C.billCity}",
    MAX("${C.billZone}")          AS "${C.billZone}",
    MAX("${C.billRegion}")        AS "${C.billRegion}",
    ${amtCol(C.amount)}           AS "${C.amount}",
    ${amtCol(C.amountGross)}      AS "${C.amountGross}",
    ${amtCol(C.amountFinal)}      AS "${C.amountFinal}",
    ${amtCol(C.tax)}              AS "${C.tax}",
    ${amtCol(C.charge)}           AS "${C.charge}",
    ${amtCol(C.discount)}         AS "${C.discount}",
    ${amtCol(C.netAmount)}        AS "${C.netAmount}",
    ${amtCol(C.paidAmount)}       AS "${C.paidAmount}",
    ${amtCol(C.openAmount)}       AS "${C.openAmount}"
  FROM ${FULL_TABLE}
  WHERE ${where}
  GROUP BY "${C.invoiceNo}"
)`;

  return { cte, postFilter: '', values, nextParamIndex: pi };
}

/**
 * Builds a trend-mode dedup CTE matching the CRD/QlikView approach.
 *
 * KEY DIFFERENCE from buildDedupCTE:
 *   GROUP BY ("Invoice_No_", "Invoice_Date_(Date)") instead of just "Invoice_No_".
 *
 *   Some invoices have DIFFERENT dates across weekly partitions (e.g. MHSRTN returns
 *   dated 2024-08 in one partition, re-dated to 2025-04 in another). The CRD monthly
 *   trend includes such invoices in BOTH months. buildDedupCTE uses MAX(date) which
 *   assigns each invoice to only ONE month — causing monthly mismatches.
 *
 * USE: monthly trend charts, site-wise domestic table, year-wise comparison
 * DO NOT USE for: KPI totals (those correctly use buildDedupCTE / GROUP BY Invoice_No_ only)
 */
function buildTrendCTE(filters = {}, startParamIdx = 1) {
  const { status, invoiceType, dateFrom, dateTo, site, shipState, customerName } = filters;

  const whereConditions = [
    `"${C.invoiceNo}" NOT LIKE '%-R'`,
    `"${C.status}"      != '0'`,
    `"${C.invoiceType}" != '0'`,
  ];
  const values = [];
  let pi = startParamIdx;

  const amtCol = col => `SUM(DISTINCT COALESCE(NULLIF("${col}",'')::NUMERIC,0))::TEXT`;

  const statusArr = parseMultiValue(status);
  if (statusArr.length) {
    whereConditions.push(`"${C.status}" = ANY($${pi++})`);
    values.push(statusArr);
  }
  const invoiceTypeArr = parseMultiValue(invoiceType);
  if (invoiceTypeArr.length) {
    whereConditions.push(`"${C.invoiceType}" = ANY($${pi++})`);
    values.push(invoiceTypeArr);
  }
  if (dateFrom && dateFrom.trim() !== '') {
    whereConditions.push(`"${C.invoiceDate}" >= $${pi++}`);
    values.push(dateFrom.trim());
  }
  if (dateTo && dateTo.trim() !== '') {
    whereConditions.push(`"${C.invoiceDate}" <= $${pi++}`);
    values.push(dateTo.trim());
  }
  const siteArr = parseMultiValue(site);
  if (siteArr.length) {
    whereConditions.push(`"${C.site}" = ANY($${pi++})`);
    values.push(siteArr);
  }
  const shipStateArr = parseMultiValue(shipState);
  if (shipStateArr.length) {
    whereConditions.push(`"${C.shipState}" = ANY($${pi++})`);
    values.push(shipStateArr);
  }
  const customerNameArr = parseMultiValue(customerName);
  if (customerNameArr.length) {
    whereConditions.push(`"${C.customerName}" = ANY($${pi++})`);
    values.push(customerNameArr);
  }

  const where = whereConditions.join('\n    AND ');

  // GROUP BY includes Invoice_Date_ — matches CRD: GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
  const cte = `WITH deduped AS (
  SELECT
    "${C.invoiceNo}",
    "${C.invoiceDate}",
    MAX("${C.status}")            AS "${C.status}",
    MAX("${C.invoiceType}")       AS "${C.invoiceType}",
    MAX("${C.customerName}")      AS "${C.customerName}",
    MAX("${C.customerCode}")      AS "${C.customerCode}",
    MAX("${C.site}")              AS "${C.site}",
    MAX("${C.shipState}")         AS "${C.shipState}",
    ${amtCol(C.amount)}           AS "${C.amount}",
    ${amtCol(C.amountGross)}      AS "${C.amountGross}",
    ${amtCol(C.amountFinal)}      AS "${C.amountFinal}",
    ${amtCol(C.tax)}              AS "${C.tax}",
    ${amtCol(C.charge)}           AS "${C.charge}",
    ${amtCol(C.discount)}         AS "${C.discount}",
    ${amtCol(C.netAmount)}        AS "${C.netAmount}"
  FROM ${FULL_TABLE}
  WHERE ${where}
  GROUP BY "${C.invoiceNo}", "${C.invoiceDate}"
)`;

  return { cte, postFilter: '', values, nextParamIndex: pi };
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
  buildTrendCTE,
  buildItemCTE,
  buildPagination,
  buildOrderBy,
  parseMultiValue,
};
