/**
 * services/dbConfig.js
 * Centralized column-name mapping for LandingStage2 tables.
 * All column names come from actual DB inspection — DO NOT rename without
 * verifying against information_schema.columns.
 *
 * LandingStage2 has 4 tables:
 *  1. mf_sales_si_siheader_all          — Sales invoice header (265K rows, ~65K unique)
 *  2. mf_sales_si_sipl_siid_sisd_...    — Sales invoice item detail (373K rows)
 *  3. mf_importexport_esi_esiheader_... — Export/Import header (2.9K rows)
 *  4. mf_importexport_esi_esiitemdetail — Export/Import item detail (70K rows)
 *
 * Dedup rule: DISTINCT ON ("Invoice_No_") ORDER BY row_id DESC (header)
 *             DISTINCT ON ("Invoice_No_","Item_Code_") ORDER BY row_id DESC (items)
 */

'use strict';

module.exports = {
  // Schema
  schema: process.env.DB_SCHEMA || 'LandingStage2',

  // Table names
  headerTable:     'mf_sales_si_siheader_all',
  itemTable:       'mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all',
  exportHdrTable:  'mf_importexport_esi_esiheader_esisd_esibd_esiacd_esipl_esipl_al',
  exportItemTable: 'mf_importexport_esi_esiitemdetail_all',

  // Backward-compat alias
  get table() { return this.headerTable; },

  /**
   * Column names exactly as they appear in the database.
   * All columns are TEXT type; cast as needed in queries.
   */
  columns: {
    // ── Core invoice fields (header table) ────────────────────────────
    invoiceNo:    'Invoice_No_',          // "-R" suffix = reversal — ALWAYS excluded
    invoiceDate:  'Invoice_Date_(Date)',  // ISO date "2024-04-01"
    invoiceType:  'Invoice_Type_',        // "Sales ( Commercial )", "Sales Return", "Service", "Transfer"
    status:       'Status_',              // "Approved", "Open", "Cancelled", "Rejected", "Released", "Exported To GL", "Reverted"
    description:  'Invoice_Description_',

    // ── Site / Organization ────────────────────────────────────────────
    site:         'Site_',               // "URIFB", "URIMH", "URIMP", "URIPB", "URIPU"

    // ── Customer ───────────────────────────────────────────────────────
    customerCode: 'Customer_Code_',
    customerName: 'Customer_Name_',
    partyGroup:   'Party_Group_Description',
    partyCategory:'Party_Category_Description',

    // ── Financial amounts (TEXT → cast to NUMERIC) ─────────────────────
    amount:        'Amount_',             // Net Amount (pre-tax) — CRD "Net Amount"
    amountGross:   'Invoice_Amount_',     // Gross Amount (incl. tax) — CRD "Gross Amount"
    amountFinal:   'Final_Net_Amount_',   // Final Net (≈ Invoice_Amount_)
    tax:           'Tax_',                // Tax amount
    charge:        'Charge_',             // Additional charges
    discount:      'Discount_',           // Discounts
    netAmount:     'Net_Amount_',
    roundedAmount: 'Rounded_Amount_',
    paidAmount:    'Paid_Amount_',
    openAmount:    'Final_Open_Invoice_Amount_',

    // ── Employee / Sales rep ───────────────────────────────────────────
    employeeCode: 'Employee_Code_',
    employeeName: 'Employee_Name_',

    // ── Geographic — Billing address (secondary) ───────────────────────
    billState:    'Bill_To_Address_State',
    billDistrict: 'Bill_To_Address_District',
    billCity:     'Bill_To_Address_City',
    billZone:     'Bill_to_Address_Zone',
    billRegion:   'Bill_To_Sales_Region_Description',

    // ── Geographic — Shipping address (PRIMARY for map/city per CRD) ───
    shipState:    'Ship_To_Address_State',
    shipDistrict: 'Ship_To_Address_District',
    shipCity:     'Ship_To_Address_City',
    shipZone:     'Ship_to_Address_Zone',
    shipRegion:   'Ship_To_Sales_Region_Description',

    // ── Dates ──────────────────────────────────────────────────────────
    createdDate:  'Created_Date',
    approvedDate: 'Approved_Date',
    prepDate:     'Preparation_Date_',
    removalDate:  'Removal_Date_',

    // ── Partition row identity (bigint) — used for deduplication ───────
    rowId:        'row_id',

    // ── Item detail table columns ──────────────────────────────────────
    itemCode:     'Item_Code_',
    itemDesc:     'Item_Description_',
    itemGroup:    'Item_Group_Description',
    itemCategory: 'Item_Category_Description',
    salesQty:     'Sales_Qty_',
    salesUOM:     'Sales_UOM_',
    rate:         'Rate_',
    itemAmount:   'Item_Amount',
    itemNetAmt:   'Item_NetAmount',
  },
};
