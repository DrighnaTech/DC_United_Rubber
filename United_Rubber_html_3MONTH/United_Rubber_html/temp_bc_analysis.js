'use strict';
require('dotenv').config();
const { pool, query } = require('./db/connection');

async function main() {
  try {
    // Step 1: Check what tables exist in BCTable schema
    console.log('=== Tables in BCTable schema ===');
    const tables = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'BCTable'
      ORDER BY table_name
    `);
    tables.rows.forEach(r => console.log('  ', r.table_name));

    // Step 2: Check columns in MF_Sales_Sales_Invoice_Alll (3 l's)
    console.log('\n=== Columns in BCTable.MF_Sales_Sales_Invoice_Alll ===');
    try {
      const cols1 = await query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'BCTable' AND table_name = 'MF_Sales_Sales_Invoice_Alll'
        ORDER BY ordinal_position
      `);
      cols1.rows.forEach(r => console.log('  ', r.column_name, '|', r.data_type));
    } catch(e) { console.log('  ERROR:', e.message); }

    // Step 3: Check columns in mf_sales_invoice_all
    console.log('\n=== Columns in BCTable.mf_sales_invoice_all ===');
    try {
      const cols2 = await query(`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'BCTable' AND table_name = 'mf_sales_invoice_all'
        ORDER BY ordinal_position
      `);
      cols2.rows.forEach(r => console.log('  ', r.column_name, '|', r.data_type));
    } catch(e) { console.log('  ERROR:', e.message); }

    // Also check case-insensitive for any sales invoice tables
    console.log('\n=== All BCTable tables matching "sales" or "invoice" (case-insensitive) ===');
    const salesTables = await query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'BCTable' AND LOWER(table_name) LIKE '%sales%invoice%'
      ORDER BY table_name
    `);
    salesTables.rows.forEach(r => console.log('  ', r.table_name));

  } catch(e) {
    console.error('Fatal:', e.message);
  } finally {
    await pool.end();
  }
}

main();
