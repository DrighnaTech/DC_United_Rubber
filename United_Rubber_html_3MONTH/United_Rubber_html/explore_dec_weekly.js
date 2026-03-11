'use strict';
const db = require('./db/connection');

(async () => {
  // First find what Dec weekly tables exist in LandingStage1
  const decTables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage1'
      AND table_name LIKE '%siheader%dec%'
    ORDER BY table_name
  `);

  console.log('Dec 2024 siheader weekly tables in LandingStage1:');
  for (const t of decTables.rows) {
    console.log(`  ${t.table_name}`);
  }

  // For each Dec weekly table, get URIMP Exported To GL total
  for (const t of decTables.rows) {
    const tname = t.table_name;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`TABLE: LandingStage1.${tname}`);
    console.log('='.repeat(80));

    // Total URIMP Exported per this weekly snapshot
    const res = await db.query(`
      WITH deduped AS (
        SELECT
          "Invoice_No_",
          "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          MAX("Site_") AS "Site_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage1"."${tname}"
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
        COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS net_cr
      FROM deduped
    `);

    console.log(`  URIMP Exported: ${res.rows[0].inv} inv | ${res.rows[0].net_cr} Cr`);

    // ALL statuses for URIMP in this snapshot
    const allSt = await db.query(`
      WITH deduped AS (
        SELECT
          "Invoice_No_",
          "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          MAX("Site_") AS "Site_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage1"."${tname}"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" NOT IN ('0','')
          AND "Site_" = 'URIMP'
          AND "Invoice_Date_(Date)" >= '2024-12-01'
          AND "Invoice_Date_(Date)" <= '2024-12-31'
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Status_", COUNT(*) AS cnt, ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS cr
      FROM deduped GROUP BY "Status_" ORDER BY cr DESC
    `);

    let total = 0;
    for (const r of allSt.rows) {
      total += parseFloat(r.cr || 0);
      console.log(`    ${(r['Status_']||'?').padEnd(22)} | ${r.cnt} inv | ${r.cr} Cr`);
    }
    console.log(`    TOTAL: ${total.toFixed(4)} Cr`);

    // Also get URIMH for cross-reference
    const mhRes = await db.query(`
      WITH deduped AS (
        SELECT
          "Invoice_No_",
          "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          MAX("Site_") AS "Site_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage1"."${tname}"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = 'URIMH'
          AND "Invoice_Date_(Date)" >= '2024-12-01'
          AND "Invoice_Date_(Date)" <= '2024-12-31'
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT
        COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS net_cr
      FROM deduped
    `);
    console.log(`\n  URIMH Exported: ${mhRes.rows[0].inv} inv | ${mhRes.rows[0].net_cr} Cr`);
  }

  // Now check: invoices in _all table that are NOT in ANY weekly partition
  // (could be from Jan snapshots capturing Dec-dated invoices)
  console.log('\n' + '='.repeat(80));
  console.log('URIMP Dec invoices in _all table but checking their Created_Date');
  console.log('(To see if some Dec invoices were captured in Jan snapshots)');
  console.log('='.repeat(80));

  const captureMonth = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_",
        MAX("Created_Date") AS created
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      SUBSTRING(created::TEXT FROM 1 FOR 7) AS capture_month,
      COUNT(*) AS inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS cr
    FROM deduped
    GROUP BY 1 ORDER BY 1
  `);

  for (const r of captureMonth.rows) {
    console.log(`  Captured ${r.capture_month}: ${r.inv} inv | ${r.cr} Cr`);
  }

  // Check unique URIMP invoices count - _all vs each weekly
  console.log('\n' + '='.repeat(80));
  console.log('UNIQUE URIMP DEC INVOICE COUNT: _all vs sum of weeklies');
  console.log('='.repeat(80));

  const allInv = await db.query(`
    SELECT COUNT(DISTINCT "Invoice_No_") AS cnt
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
  `);
  console.log(`  _all table unique invoices: ${allInv.rows[0].cnt}`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
