/**
 * services/dbConfig.js
 * Centralized column-name mapping for the sales invoice header table.
 * All column names come from actual DB inspection — DO NOT rename without
 * verifying against information_schema.columns.
 *
 * The source table is a weekly-partitioned UNION ("all" table), so the same
 * invoice can appear up to 4 times per month. Every query MUST deduplicate
 * using DISTINCT ON ("Invoice_No_") ORDER BY row_id DESC to get the latest
 * snapshot of each invoice.
 */

'use strict';

module.exports = {
  // Schema and primary table
  schema: process.env.DB_SCHEMA || 'LandingStage2',
  table:  process.env.DB_TABLE_1 || 'mf_sales_si_siheader_all',

  /**
   * Column names exactly as they appear in the database.
   * All columns are TEXT type; cast as needed in queries.
   */
  columns: {
    // Core invoice fields
    invoiceNo:    'Invoice_No_',          // TEXT  e.g. "LINV/242500015"  — "-R" suffix = reversal
    invoiceDate:  'Invoice_Date_(Date)',  // TEXT  ISO date "2024-04-01"
    invoiceType:  'Invoice_Type_',        // TEXT  "Sales ( Commercial )", "Sales Return", "Service", "Transfer"
    status:       'Status_',              // TEXT  "Approved", "Open", "Cancelled", "Rejected", "Released", "Exported To GL", "Reverted"
    description:  'Invoice_Description_',

    // Customer
    customerCode: 'Customer_Code_',
    customerName: 'Customer_Name_',
    partyGroup:   'Party_Group_Description',
    partyCategory:'Party_Category_Description',

    // Financial amounts (TEXT → cast to NUMERIC in queries)
    amount:        'Final_Net_Amount_',   // PRIMARY amount column (post-discount, post-tax final)
    netAmount:     'Net_Amount_',
    invoiceAmount: 'Invoice_Amount_',
    roundedAmount: 'Rounded_Amount_',
    paidAmount:    'Paid_Amount_',
    openAmount:    'Final_Open_Invoice_Amount_',

    // Geographic (billing address — primary for map)
    billState:    'Bill_To_Address_State',
    billDistrict: 'Bill_To_Address_District',
    billCity:     'Bill_To_Address_City',
    billZone:     'Bill_to_Address_Zone',
    billRegion:   'Bill_To_Sales_Region_Description',

    // Geographic (shipping address — secondary)
    shipState:    'Ship_To_Address_State',
    shipDistrict: 'Ship_To_Address_District',
    shipCity:     'Ship_To_Address_City',
    shipZone:     'Ship_to_Address_Zone',
    shipRegion:   'Ship_To_Sales_Region_Description',

    // Employee / Sales rep
    employeeCode: 'Employee_Code_',
    employeeName: 'Employee_Name_',

    // Partition row identity (bigint) — used for deduplication
    rowId:        'row_id',
  },
};
