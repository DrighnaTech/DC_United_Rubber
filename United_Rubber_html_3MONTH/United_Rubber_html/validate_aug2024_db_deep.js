'use strict';
const db = require('./db/connection');

(async () => {
  try {
    const CRD = 14.79;

    // ── 1. All rows for Aug 2024 domestic — check ALL distinct statuses per invoice ──
    // The DB has multiple partitions (weekly ETL snapshots), CSV might be just one.
    // An invoice that was Exported To GL in week 1 but Reverted by week 3
    // will show BOTH statuses across different rows in the DB.
    const multiStatusRes = await db.query(`
      SELECT
        "Invoice_No_",
        "Site_",
        "Invoice_Type_",
        ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS all_statuses,
        COUNT(*) AS total_rows,
        COUNT(DISTINCT "Status_") AS distinct_status_count,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= '2024-08-01'
        AND "Invoice_Date_(Date)" <= '2024-08-31'
      GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
      HAVING COUNT(DISTINCT "Status_") > 1
      ORDER BY "Invoice_No_"
    `);

    console.log(`\n=== INVOICES WITH MULTIPLE STATUSES IN DB (Aug 2024) ===`);
    console.log(`Found: ${multiStatusRes.rows.length} invoices with conflicting statuses across partitions\n`);

    let exportedRevertedTotal = 0;
    let exportedRevertedCount = 0;
    for (const r of multiStatusRes.rows) {
      const statuses = r.all_statuses;
      const hasExported = statuses.includes('Exported To GL');
      const hasReverted = statuses.includes('Reverted');
      const flag = hasExported && hasReverted ? '← Exported→Reverted' : '';
      console.log(`  ${r['Invoice_No_']} | ${r['Site_']} | ${r['Invoice_Type_']}`);
      console.log(`    statuses: [${statuses.join(', ')}]  rows=${r.total_rows}  net=${r.net_cr} Cr  ${flag}`);
      if (hasExported && hasReverted) {
        exportedRevertedTotal += parseFloat(r.net_cr);
        exportedRevertedCount++;
      }
    }

    if (exportedRevertedCount > 0) {
      console.log(`\n  Exported→Reverted invoices: ${exportedRevertedCount} | total: ${exportedRevertedTotal.toFixed(4)} Cr`);
    }

    // ── 2. Current formula total (our benchmark) ──────────────────────────
    const currentRes = await db.query(`
      SELECT ROUND(SUM(sub.net)/1e7, 4) AS net_cr, COUNT(*) AS invoices
      FROM (
        SELECT "Invoice_No_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-08-01'
          AND "Invoice_Date_(Date)" <= '2024-08-31'
        GROUP BY "Invoice_No_"
      ) sub
    `);
    const current = parseFloat(currentRes.rows[0].net_cr);
    console.log(`\n=== CURRENT FORMULA (Exported To GL, SUM DISTINCT) ===`);
    console.log(`  Total: ${current} Cr | Invoices: ${currentRes.rows[0].invoices} | Diff from CRD: ${(current - CRD).toFixed(4)} Cr`);

    // ── 3. Include invoices that EVER had Exported To GL status ──────────
    // (even if now Reverted — use any row where Status_='Exported To GL' existed)
    const everExportedRes = await db.query(`
      SELECT ROUND(SUM(sub.net)/1e7, 4) AS net_cr, COUNT(*) AS invoices
      FROM (
        SELECT "Invoice_No_",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" != '0'
          AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-08-01'
          AND "Invoice_Date_(Date)" <= '2024-08-31'
          AND "Invoice_No_" IN (
            SELECT DISTINCT "Invoice_No_"
            FROM "LandingStage2"."mf_sales_si_siheader_all"
            WHERE "Status_" = 'Exported To GL'
              AND "Invoice_Date_(Date)" >= '2024-08-01'
              AND "Invoice_Date_(Date)" <= '2024-08-31'
          )
        GROUP BY "Invoice_No_"
      ) sub
    `);
    const everExported = parseFloat(everExportedRes.rows[0].net_cr);
    console.log(`\n=== EVER EXPORTED (incl. later Reverted) ===`);
    console.log(`  Total: ${everExported} Cr | Invoices: ${everExportedRes.rows[0].invoices} | Diff from CRD: ${(everExported - CRD).toFixed(4)} Cr`);

    // ── 4. What do Reverted invoices look like in DB? ─────────────────────
    const revertedRes = await db.query(`
      SELECT "Invoice_No_", "Site_", "Invoice_Type_",
        ARRAY_AGG(DISTINCT "Status_") AS statuses,
        COUNT(*) AS rows,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= '2024-08-01'
        AND "Invoice_Date_(Date)" <= '2024-08-31'
      GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
      HAVING ARRAY_AGG(DISTINCT "Status_") @> ARRAY['Reverted']
      ORDER BY net_cr DESC
    `);

    console.log(`\n=== ALL REVERTED INVOICES IN Aug 2024 DB (${revertedRes.rows.length} invoices) ===`);
    let revertedTotal = 0;
    for (const r of revertedRes.rows) {
      const sts = r.statuses.join('+');
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r['Site_']} | ${r['Invoice_Type_'].padEnd(22)} | statuses=[${sts}] | rows=${r.rows} | ${r.net_cr} Cr`);
      revertedTotal += parseFloat(r.net_cr);
    }
    console.log(`  TOTAL Reverted: ${revertedTotal.toFixed(4)} Cr`);

    // ── 5. Partition-level detail: how many src_tables exist for Aug 2024 ─
    const partRes = await db.query(`
      SELECT "src_table", COUNT(DISTINCT "Invoice_No_") AS invoices,
        ARRAY_AGG(DISTINCT "Status_") AS statuses_seen,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" >= '2024-08-01'
        AND "Invoice_Date_(Date)" <= '2024-08-31'
        AND "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
      GROUP BY "src_table"
      ORDER BY "src_table"
    `);

    console.log(`\n=== SOURCE PARTITIONS (src_table) for Aug 2024 ===`);
    for (const r of partRes.rows) {
      console.log(`  ${r.src_table}: ${r.invoices} invoices | statuses=[${r.statuses_seen.join(',')}] | net=${r.net_cr} Cr`);
    }

    // ── 6. Per-partition Exported To GL total ──────────────────────────────
    const partExpRes = await db.query(`
      SELECT "src_table",
        COUNT(DISTINCT "Invoice_No_") AS invoices,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_", "src_table",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
          AND "Invoice_Date_(Date)" >= '2024-08-01'
          AND "Invoice_Date_(Date)" <= '2024-08-31'
          AND "Invoice_No_" NOT LIKE '%-R'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
        GROUP BY "Invoice_No_", "src_table"
      ) sub
      GROUP BY "src_table"
      ORDER BY "src_table"
    `);

    console.log(`\n=== EXPORTED TO GL PER PARTITION (Aug 2024) ===`);
    for (const r of partExpRes.rows) {
      const diff = (parseFloat(r.net_cr) - CRD).toFixed(4);
      const mark = Math.abs(parseFloat(r.net_cr) - CRD) < 0.02 ? ' ← MATCHES CRD!' : '';
      console.log(`  ${r.src_table}: ${r.invoices} invoices | ${r.net_cr} Cr | diff from CRD=${diff}${mark}`);
    }

    // ── 7. FINAL SUMMARY ──────────────────────────────────────────────────
    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`CRD Reference                  : ${CRD} Cr`);
    console.log(`Current formula (Exported only): ${current} Cr  | diff = ${(current-CRD).toFixed(4)} Cr`);
    console.log(`Ever-Exported (incl. reverted) : ${everExported} Cr  | diff = ${(everExported-CRD).toFixed(4)} Cr`);
    console.log(`Reverted invoice pool total    : ${revertedTotal.toFixed(4)} Cr`);
    console.log(`Multi-status invoices in DB    : ${multiStatusRes.rows.length}`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message, err.stack);
    process.exit(1);
  }
})();
