'use strict';
const db = require('./db/connection');

(async () => {
  console.log('='.repeat(80));
  console.log('URIMP DEC 2024: AMOUNT FIELD COMPARISON');
  console.log('Checking if CRD uses a different amount field');
  console.log('='.repeat(80));

  // What amount-related columns exist in the header table?
  const amtCols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'LandingStage2' AND table_name = 'mf_sales_si_siheader_all'
      AND (column_name LIKE '%mount%' OR column_name LIKE '%Net%' OR column_name LIKE '%Gross%'
           OR column_name LIKE '%Tax%' OR column_name LIKE '%Charge%' OR column_name LIKE '%Discount%')
    ORDER BY column_name
  `);

  console.log('\nAmount-related columns in siheader_all:');
  for (const c of amtCols.rows) {
    console.log(`  ${c.column_name}`);
  }

  // Compare Amount_ vs other amount fields for URIMP Dec
  const compare = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS net_amt,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC,0)) AS gross_amt,
        SUM(DISTINCT COALESCE(NULLIF("Tax_",'')::NUMERIC,0)) AS tax,
        SUM(DISTINCT COALESCE(NULLIF("Charge_",'')::NUMERIC,0)) AS charge,
        SUM(DISTINCT COALESCE(NULLIF("Discount_",'')::NUMERIC,0)) AS discount
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      ROUND(SUM(net_amt)/1e7, 6) AS net_cr,
      ROUND(SUM(gross_amt)/1e7, 6) AS gross_cr,
      ROUND(SUM(tax)/1e7, 6) AS tax_cr,
      ROUND(SUM(charge)/1e7, 6) AS charge_cr,
      ROUND(SUM(discount)/1e7, 6) AS discount_cr
    FROM deduped
  `);

  const r = compare.rows[0];
  console.log(`\n  Net Amount (Amount_):    ${r.net_cr} Cr`);
  console.log(`  Gross (Invoice_Amount_): ${r.gross_cr} Cr`);
  console.log(`  Tax:                     ${r.tax_cr} Cr`);
  console.log(`  Charge:                  ${r.charge_cr} Cr`);
  console.log(`  Discount:                ${r.discount_cr} Cr`);
  console.log(`  CRD reference:           3.4010 Cr`);
  console.log(`  Gap (Net vs CRD):        ${(parseFloat(r.net_cr) - 3.401).toFixed(6)} Cr`);
  console.log(`  Gap (Gross vs CRD):      ${(parseFloat(r.gross_cr) - 3.401).toFixed(6)} Cr`);

  // Check: does Net - Tax - Charge + Discount = something closer?
  const netCalc = parseFloat(r.net_cr);
  const grossCalc = parseFloat(r.gross_cr);
  console.log(`\n  Gross - Tax = ${(grossCalc - parseFloat(r.tax_cr)).toFixed(6)} Cr`);
  console.log(`  Net + Tax   = ${(netCalc + parseFloat(r.tax_cr)).toFixed(6)} Cr`);

  // Check the SUM(DISTINCT) dedup issue: are there any URIMP Dec invoices
  // where two different Invoice_No_ have exactly the same Amount_?
  console.log('\n' + '='.repeat(80));
  console.log('DEDUP PRECISION CHECK: Invoices with identical Amount_ values');
  console.log('(SUM(DISTINCT) would merge these if they share the same amount)');
  console.log('='.repeat(80));

  const dupeAmts = await db.query(`
    WITH inv_amts AS (
      SELECT "Invoice_No_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_"
    )
    SELECT amt, COUNT(*) AS cnt,
      ARRAY_AGG("Invoice_No_" ORDER BY "Invoice_No_") AS invoices
    FROM inv_amts
    GROUP BY amt
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, amt DESC
    LIMIT 30
  `);

  console.log(`\nFound ${dupeAmts.rows.length} amount values shared by multiple invoices:`);
  let totalLost = 0;
  for (const r of dupeAmts.rows) {
    const lost = (r.cnt - 1) * parseFloat(r.amt);
    totalLost += lost;
    console.log(`  Amount: ${r.amt} | ${r.cnt} invoices | Lost by SUM(DISTINCT): ${(lost/1e7).toFixed(6)} Cr | ${r.invoices.slice(0,5).join(', ')}${r.invoices.length > 5 ? '...' : ''}`);
  }
  console.log(`\n  TOTAL amount lost by SUM(DISTINCT) if applied globally: ${(totalLost/1e7).toFixed(6)} Cr`);
  console.log(`  But TrendCTE groups by Invoice_No_ first, so SUM(DISTINCT) is per-invoice`);
  console.log(`  So this should NOT cause loss in TrendCTE.`);

  // DEEPER: Check within TrendCTE grouping — per (Invoice_No_, Invoice_Date_)
  // Are there cases where same invoice has DIFFERENT Amount_ values in different rows
  // for the same date, causing SUM(DISTINCT) to add them up differently?
  console.log('\n' + '='.repeat(80));
  console.log('CHECK: Invoices with multiple DISTINCT Amount_ values (same inv+date)');
  console.log('These are the ones where SUM(DISTINCT) matters');
  console.log('='.repeat(80));

  const multiAmt = await db.query(`
    SELECT "Invoice_No_", "Invoice_Date_(Date)",
      COUNT(DISTINCT "Amount_") AS amt_variants,
      ARRAY_AGG(DISTINCT "Amount_" ORDER BY "Amount_") AS amounts,
      COUNT(*) AS total_rows
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
    GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    HAVING COUNT(DISTINCT "Amount_") > 1
    ORDER BY amt_variants DESC
    LIMIT 20
  `);

  if (multiAmt.rows.length === 0) {
    console.log('\n  NO invoices with multiple Amount_ values per (Invoice_No_, Date) combo.');
    console.log('  SUM(DISTINCT) is irrelevant — each invoice has exactly one Amount_ value.');
  } else {
    console.log(`\n  Found ${multiAmt.rows.length} invoices with multiple Amount_ values:`);
    for (const r of multiAmt.rows) {
      console.log(`  ${r['Invoice_No_'].padEnd(30)} | Date: ${r['Invoice_Date_(Date)']} | ${r.amt_variants} amounts: ${r.amounts.join(', ')} | ${r.total_rows} rows`);
    }
  }

  // FINAL: Compare TrendCTE total vs simple SUM (no DISTINCT) per invoice
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON: TrendCTE (SUM DISTINCT per inv+date) vs SIMPLE per-invoice SUM');
  console.log('='.repeat(80));

  const simple = await db.query(`
    WITH per_inv AS (
      SELECT "Invoice_No_",
        MAX(COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_"
    )
    SELECT COUNT(*) AS inv, ROUND(SUM(amt)/1e7, 6) AS cr FROM per_inv
  `);

  console.log(`  Simple MAX(Amount_) per invoice: ${simple.rows[0].inv} inv | ${simple.rows[0].cr} Cr`);
  console.log(`  TrendCTE (SUM DISTINCT per inv+date): 3.340989 Cr`);
  console.log(`  CRD: 3.4010 Cr`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
