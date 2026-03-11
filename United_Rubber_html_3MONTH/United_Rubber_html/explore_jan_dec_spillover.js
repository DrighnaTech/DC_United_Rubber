'use strict';
const db = require('./db/connection');

(async () => {
  console.log('='.repeat(80));
  console.log('HYPOTHESIS: URIMP Dec invoices captured in JANUARY 2025 snapshots');
  console.log('CRD was generated Jan 29, 2025 — it sees the live ERP state');
  console.log('Our Dec w4 snapshot may not have captured all late-December exports');
  console.log('='.repeat(80));

  // First: find Jan 2025 weekly tables
  const janTables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage1'
      AND table_name LIKE 'mf_sales_si_siheader_2025_jan%'
    ORDER BY table_name
  `);

  console.log('\nJan 2025 weekly tables:');
  for (const t of janTables.rows) {
    console.log(`  ${t.table_name}`);
  }

  // For each Jan weekly table: find URIMP invoices dated Dec 2024
  for (const t of janTables.rows) {
    const tname = t.table_name;

    const res = await db.query(`
      WITH deduped AS (
        SELECT
          "Invoice_No_",
          "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage1"."${tname}"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Site_" = 'URIMP'
          AND "Invoice_Date_(Date)" >= '2024-12-01'
          AND "Invoice_Date_(Date)" <= '2024-12-31'
          AND "Status_" = 'Exported To GL'
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT COUNT(*) AS inv, ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
      FROM deduped
    `);

    console.log(`\n  ${tname}: ${res.rows[0].inv} Dec-dated URIMP Exported inv | ${res.rows[0].cr} Cr`);

    // Also check ALL statuses
    const allSt = await db.query(`
      WITH deduped AS (
        SELECT
          "Invoice_No_",
          "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage1"."${tname}"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Site_" = 'URIMP'
          AND "Invoice_Date_(Date)" >= '2024-12-01'
          AND "Invoice_Date_(Date)" <= '2024-12-31'
          AND "Status_" NOT IN ('0','')
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Status_", COUNT(*) AS cnt, ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
      FROM deduped GROUP BY "Status_" ORDER BY cr DESC
    `);

    for (const r of allSt.rows) {
      console.log(`    ${(r['Status_']||'?').padEnd(22)} | ${r.cnt} inv | ${r.cr} Cr`);
    }
  }

  // Now check: do the Jan snapshots have Dec URIMP invoices that are NOT in Dec snapshots?
  console.log('\n' + '='.repeat(80));
  console.log('CRITICAL: Dec URIMP invoices in Jan snapshots but NOT in Dec snapshots');
  console.log('='.repeat(80));

  // Get all Dec URIMP invoice numbers from Dec weekly tables
  const decInvoices = new Set();
  const decWeeks = ['2024_dec_w1', '2024_dec_w2', '2024_dec_w3', '2024_dec_w4'];

  for (const w of decWeeks) {
    const res = await db.query(`
      SELECT DISTINCT "Invoice_No_"
      FROM "LandingStage1"."mf_sales_si_siheader_${w}"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
    `);
    for (const r of res.rows) decInvoices.add(r['Invoice_No_']);
  }

  console.log(`\nTotal unique URIMP Dec invoices in Dec weekly tables: ${decInvoices.size}`);

  // Now find Jan snapshot invoices NOT in this set
  for (const t of janTables.rows) {
    const tname = t.table_name;
    const res = await db.query(`
      SELECT "Invoice_No_", MAX("Status_") AS status,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt,
        MAX("Invoice_Date_(Date)") AS inv_date
      FROM "LandingStage1"."${tname}"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
        AND "Status_" NOT IN ('0','')
      GROUP BY "Invoice_No_"
    `);

    const newInJan = [];
    for (const r of res.rows) {
      if (!decInvoices.has(r['Invoice_No_'])) {
        newInJan.push(r);
      }
    }

    if (newInJan.length > 0) {
      console.log(`\n  ${tname}: ${newInJan.length} NEW Dec-dated URIMP invoices not in Dec snapshots:`);
      let total = 0;
      for (const r of newInJan) {
        const crAmt = (parseFloat(r.amt)/1e7).toFixed(6);
        total += parseFloat(r.amt);
        console.log(`    ${r['Invoice_No_'].padEnd(30)} | ${r.status.padEnd(20)} | ${crAmt} Cr | Date: ${r.inv_date}`);
      }
      console.log(`    TOTAL new invoices: ${(total/1e7).toFixed(6)} Cr`);
      console.log(`    Gap to fill: 0.060011 Cr`);
      console.log(`    Match? ${Math.abs(total/1e7 - 0.060011) < 0.001 ? 'YES!' : 'No'}`);
    } else {
      console.log(`\n  ${tname}: No new Dec-dated URIMP invoices`);
    }
  }

  // Also check the _all table: are there Dec URIMP invoices NOT in any Dec weekly?
  console.log('\n' + '='.repeat(80));
  console.log('CHECK: _all table Dec URIMP invoices NOT in any Dec weekly snapshot');
  console.log('(Would indicate data came from Jan or other partition)');
  console.log('='.repeat(80));

  const allRes = await db.query(`
    SELECT "Invoice_No_", MAX("Status_") AS status,
      SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt,
      MAX("src_part") AS src_part,
      MAX("src_month") AS src_month
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
      AND "Status_" NOT IN ('0','')
    GROUP BY "Invoice_No_"
  `);

  let notInDec = 0;
  let notInDecExported = 0;
  let totalNewAmt = 0;
  const newInvList = [];

  for (const r of allRes.rows) {
    if (!decInvoices.has(r['Invoice_No_'])) {
      notInDec++;
      if (r.status === 'Exported To GL') {
        notInDecExported++;
        totalNewAmt += parseFloat(r.amt);
        newInvList.push(r);
      }
    }
  }

  console.log(`\n  _all table Dec URIMP invoices: ${allRes.rows.length}`);
  console.log(`  In Dec weekly snapshots: ${decInvoices.size}`);
  console.log(`  NOT in any Dec weekly: ${notInDec}`);
  console.log(`  NOT in Dec weekly + Exported To GL: ${notInDecExported}`);
  console.log(`  Amount of these Exported invoices: ${(totalNewAmt/1e7).toFixed(6)} Cr`);

  if (newInvList.length > 0) {
    console.log('\n  These Exported invoices NOT in Dec weekly snapshots:');
    for (const r of newInvList) {
      console.log(`    ${r['Invoice_No_'].padEnd(30)} | ${(parseFloat(r.amt)/1e7).toFixed(6)} Cr | src: ${r.src_month}/${r.src_part}`);
    }
  }

  // Check what src_month/src_part values exist for URIMP Dec invoices
  console.log('\n' + '='.repeat(80));
  console.log('SOURCE PARTITION DISTRIBUTION of URIMP Dec Exported invoices');
  console.log('='.repeat(80));

  const srcDist = await db.query(`
    SELECT "src_month", "src_part", COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0))/1e7, 6) AS cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
      AND "Status_" = 'Exported To GL'
    GROUP BY "src_month", "src_part"
    ORDER BY "src_month", "src_part"
  `);

  for (const r of srcDist.rows) {
    console.log(`  ${(r.src_month||'?').padEnd(8)} / ${(r.src_part||'?').padEnd(6)} | ${r.inv} inv | ${r.cr} Cr`);
  }

  // URIMH same check
  console.log('\n' + '='.repeat(80));
  console.log('URIMH Dec 2024: Same spillover check');
  console.log('='.repeat(80));

  const mhDecInvoices = new Set();
  for (const w of decWeeks) {
    const res = await db.query(`
      SELECT DISTINCT "Invoice_No_"
      FROM "LandingStage1"."mf_sales_si_siheader_${w}"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMH'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
    `);
    for (const r of res.rows) mhDecInvoices.add(r['Invoice_No_']);
  }

  const mhAll = await db.query(`
    SELECT "Invoice_No_", MAX("Status_") AS status,
      SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt,
      MAX("src_part") AS src_part, MAX("src_month") AS src_month
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
      AND "Status_" = 'Exported To GL'
    GROUP BY "Invoice_No_"
  `);

  let mhNotInDec = 0;
  let mhNewAmt = 0;
  for (const r of mhAll.rows) {
    if (!mhDecInvoices.has(r['Invoice_No_'])) {
      mhNotInDec++;
      mhNewAmt += parseFloat(r.amt);
      console.log(`  NEW: ${r['Invoice_No_'].padEnd(30)} | ${(parseFloat(r.amt)/1e7).toFixed(6)} Cr | src: ${r.src_month}/${r.src_part}`);
    }
  }
  console.log(`\n  URIMH Dec invoices NOT in Dec weekly snapshots: ${mhNotInDec}`);
  console.log(`  Their total Exported amount: ${(mhNewAmt/1e7).toFixed(6)} Cr`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
