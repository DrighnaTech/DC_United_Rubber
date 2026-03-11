'use strict';
const db = require('./db/connection');

(async () => {
  console.log('='.repeat(80));
  console.log('URIMP DEC 2024: ALTERNATIVE AMOUNT FIELDS');
  console.log('Testing Net_Amount_, Final_Net_Amount_, Base_Amount_');
  console.log('='.repeat(80));

  // Check all amount-like fields for URIMP Dec Exported
  const altAmts = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt,
        SUM(DISTINCT COALESCE(NULLIF("Net_Amount_",'')::NUMERIC,0)) AS net_amt,
        SUM(DISTINCT COALESCE(NULLIF("Final_Net_Amount_",'')::NUMERIC,0)) AS final_net,
        SUM(DISTINCT COALESCE(NULLIF("Base_Amount_",'')::NUMERIC,0)) AS base_amt,
        SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC,0)) AS inv_amt,
        SUM(DISTINCT COALESCE(NULLIF("Rounded_Amount_",'')::NUMERIC,0)) AS rounded
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      ROUND(SUM(amt)/1e7, 6) AS amount_cr,
      ROUND(SUM(net_amt)/1e7, 6) AS net_amount_cr,
      ROUND(SUM(final_net)/1e7, 6) AS final_net_cr,
      ROUND(SUM(base_amt)/1e7, 6) AS base_amount_cr,
      ROUND(SUM(inv_amt)/1e7, 6) AS invoice_amount_cr,
      ROUND(SUM(rounded)/1e7, 6) AS rounded_cr
    FROM deduped
  `);

  const r = altAmts.rows[0];
  console.log(`  Amount_:           ${r.amount_cr} Cr`);
  console.log(`  Net_Amount_:       ${r.net_amount_cr} Cr`);
  console.log(`  Final_Net_Amount_: ${r.final_net_cr} Cr`);
  console.log(`  Base_Amount_:      ${r.base_amount_cr} Cr`);
  console.log(`  Invoice_Amount_:   ${r.invoice_amount_cr} Cr`);
  console.log(`  Rounded_Amount_:   ${r.rounded_cr} Cr`);
  console.log(`  CRD:               3.401000 Cr`);
  console.log('');

  // Which one is closest to CRD?
  const fields = [
    { name: 'Amount_', val: parseFloat(r.amount_cr) },
    { name: 'Net_Amount_', val: parseFloat(r.net_amount_cr) },
    { name: 'Final_Net_Amount_', val: parseFloat(r.final_net_cr) },
    { name: 'Base_Amount_', val: parseFloat(r.base_amount_cr) },
    { name: 'Invoice_Amount_', val: parseFloat(r.invoice_amount_cr) },
    { name: 'Rounded_Amount_', val: parseFloat(r.rounded_cr) },
  ];

  for (const f of fields) {
    const gap = (f.val - 3.401).toFixed(6);
    const match = Math.abs(f.val - 3.401) < 0.001 ? ' ← MATCHES CRD!' :
                  Math.abs(f.val - 3.401) < 0.01  ? ' ← CLOSE!' : '';
    console.log(`  ${f.name.padEnd(20)} gap vs CRD: ${gap}${match}`);
  }

  // Also check a few sample invoices to understand the relationship between fields
  console.log('\n--- Sample invoices: field comparison ---');
  const sample = await db.query(`
    SELECT "Invoice_No_",
      MAX("Amount_") AS amt,
      MAX("Net_Amount_") AS net,
      MAX("Final_Net_Amount_") AS final_net,
      MAX("Base_Amount_") AS base,
      MAX("Invoice_Amount_") AS inv,
      MAX("Tax_") AS tax
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
      AND "Amount_" != '0' AND "Amount_" != ''
    GROUP BY "Invoice_No_"
    ORDER BY MAX("Amount_"::NUMERIC) DESC
    LIMIT 10
  `);

  console.log('  Invoice'.padEnd(32) + '| Amount_'.padEnd(12) + '| Net_Amount_'.padEnd(14) + '| Final_Net'.padEnd(14) + '| Base'.padEnd(12) + '| Invoice_Amt'.padEnd(14) + '| Tax');
  for (const r of sample.rows) {
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r.amt||'').toString().padEnd(10)} | ${(r.net||'').toString().padEnd(12)} | ${(r.final_net||'').toString().padEnd(12)} | ${(r.base||'').toString().padEnd(10)} | ${(r.inv||'').toString().padEnd(12)} | ${r.tax||''}`);
  }

  // ── ALTERNATIVE DATE HYPOTHESIS ──────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('ALTERNATIVE DATE HYPOTHESIS');
  console.log('What date columns exist in the header table?');
  console.log('='.repeat(80));

  const dateCols = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'LandingStage2' AND table_name = 'mf_sales_si_siheader_all'
      AND (column_name LIKE '%Date%' OR column_name LIKE '%date%')
    ORDER BY column_name
  `);

  for (const c of dateCols.rows) {
    console.log(`  ${c.column_name}`);
  }

  // Check if there are URIMP invoices with Invoice_Date in Nov/Jan but created/posted in Dec
  console.log('\n--- URIMP Exported invoices with Invoice_Date NOT in Dec but Created_Date in Dec ---');
  const crossDate = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        MAX("Invoice_Date_(Date)") AS inv_date,
        MAX("Created_Date") AS created,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Created_Date" >= '2024-12-01'
        AND "Created_Date" < '2025-01-01'
        AND ("Invoice_Date_(Date)" < '2024-12-01' OR "Invoice_Date_(Date)" > '2024-12-31')
      GROUP BY "Invoice_No_"
    )
    SELECT "Invoice_No_", inv_date, created,
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
    LIMIT 20
  `);

  if (crossDate.rows.length > 0) {
    let total = 0;
    for (const r of crossDate.rows) {
      total += parseFloat(r.cr);
      console.log(`  ${r['Invoice_No_'].padEnd(30)} | InvDate: ${r.inv_date} | Created: ${r.created} | ${r.cr} Cr`);
    }
    console.log(`  Total: ${total.toFixed(6)} Cr`);
    console.log(`  If CRD uses Created_Date instead of Invoice_Date, these would be in Dec CRD but not in our Dec query`);
  } else {
    console.log('  None found');
  }

  // Vice versa: Dec Invoice_Date but Created_Date NOT in Dec
  console.log('\n--- URIMP Dec Invoice_Date but Created_Date NOT in Dec ---');
  const crossDate2 = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        MAX("Invoice_Date_(Date)") AS inv_date,
        MAX("Created_Date") AS created,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
        AND ("Created_Date" < '2024-12-01' OR "Created_Date" >= '2025-01-01')
      GROUP BY "Invoice_No_"
    )
    SELECT
      CASE WHEN created < '2024-12-01' THEN 'Before Dec' ELSE 'After Dec' END AS period,
      COUNT(*) AS inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
    FROM deduped
    GROUP BY 1
  `);

  for (const r of crossDate2.rows) {
    console.log(`  ${r.period}: ${r.inv} inv | ${r.cr} Cr`);
  }

  // FINAL CHECK: What if we use Created_Date as the date field?
  console.log('\n--- URIMP with Created_Date in Dec (regardless of Invoice_Date) ---');
  const byCreated = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        MAX("Created_Date") AS created,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Created_Date" >= '2024-12-01'
        AND "Created_Date" < '2025-01-01'
      GROUP BY "Invoice_No_"
    )
    SELECT COUNT(*) AS inv, ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr FROM deduped
  `);

  console.log(`  By Created_Date in Dec: ${byCreated.rows[0].inv} inv | ${byCreated.rows[0].cr} Cr`);
  console.log(`  By Invoice_Date in Dec: 1500 inv | 3.340989 Cr`);
  console.log(`  CRD: 3.401000 Cr`);
  console.log(`  Gap (Created): ${(parseFloat(byCreated.rows[0].cr) - 3.401).toFixed(6)}`);
  console.log(`  Gap (Invoice): ${(3.340989 - 3.401).toFixed(6)}`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
