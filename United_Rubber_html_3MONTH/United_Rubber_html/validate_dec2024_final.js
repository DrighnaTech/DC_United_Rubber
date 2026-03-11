'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL THEORY: Dec partitions (w1-w4) are weekly snapshots taken DURING Dec.
  // CRD was generated Jan 29, 2025 from LIVE MF system.
  // Gap = invoices that moved from Approved → Exported To GL between last Dec
  // snapshot (≈Dec 28) and Jan 29, 2025.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── PART 1: URIMH — Approved Transfer invoices that moved to Exported post-Dec 28 ──
  console.log('='.repeat(80));
  console.log('PART 1: URIMH — Do STO/242502907 + STO/242502762 explain 0.01 Cr gap?');
  console.log('Theory: These Approved invoices in Dec snapshots got Exported To GL in Jan');
  console.log('='.repeat(80));

  const stoDetail = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      ROUND(SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC))/1e7, 6) AS gross_cr,
      COUNT(*) AS row_count,
      ARRAY_AGG(DISTINCT "Status_") AS statuses,
      ARRAY_AGG(DISTINCT src_table) AS partitions
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" IN ('STO/242502762','STO/242502907')
    GROUP BY "Invoice_No_", "Invoice_Type_"
    ORDER BY "Invoice_No_"
  `);

  let stoTotal = 0;
  for (const r of stoDetail.rows) {
    stoTotal += parseFloat(r.net_cr);
    console.log(`\n  ${r['Invoice_No_']}:`);
    console.log(`    Net Cr (Amount_)   : ${r.net_cr}`);
    console.log(`    Gross Cr (Invoice_): ${r.gross_cr}`);
    console.log(`    Statuses           : ${r.statuses.join(', ')}`);
    console.log(`    Partitions         : ${r.partitions.join(', ')}`);
    console.log(`    Row count          : ${r.row_count}`);
  }
  console.log(`\n  COMBINED: ${stoTotal.toFixed(6)} Cr | Gap needed: 0.010000 Cr | Match: ${Math.abs(stoTotal - 0.01) < 0.0001 ? '✓ EXACT' : Math.abs(stoTotal - 0.01) < 0.002 ? '~ CLOSE' : 'NO'}`);

  // ── PART 2: PINV/242512558 — different amount columns ───────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('PART 2: PINV/242512558 — which amount column gives 0.06 Cr?');
  console.log('Gap needed: 0.060000 Cr = ₹6,00,000');
  console.log('='.repeat(80));

  const colCheck = await db.query(`
    SELECT
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      ROUND(SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC))/1e7, 6) AS invoice_cr,
      ROUND(SUM(DISTINCT CAST("Final_Net_Amount_" AS NUMERIC))/1e7, 6) AS final_net_cr,
      ROUND(SUM(DISTINCT CAST("Net_Amount_" AS NUMERIC))/1e7, 6) AS net_amount_cr,
      ARRAY_AGG(DISTINCT "Status_") AS statuses
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" = 'PINV/242512558'
  `);
  const cc = colCheck.rows[0];
  console.log('\n  Amount_ (net)            : ' + cc.net_cr + ' Cr | diff from 0.06: ' + (parseFloat(cc.net_cr) - 0.06).toFixed(6));
  console.log('  Invoice_Amount_ (gross)  : ' + cc.invoice_cr + ' Cr | diff from 0.06: ' + (parseFloat(cc.invoice_cr) - 0.06).toFixed(6));
  console.log('  Final_Net_Amount_        : ' + cc.final_net_cr + ' Cr | diff from 0.06: ' + (parseFloat(cc.final_net_cr) - 0.06).toFixed(6));
  console.log('  Net_Amount_              : ' + cc.net_amount_cr + ' Cr | diff from 0.06: ' + (parseFloat(cc.net_amount_cr) - 0.06).toFixed(6));
  console.log('  Statuses in DB           : ' + cc.statuses.join(', '));

  // ── PART 3: URIMP — are there any Approved invoices in Dec? (double-check) ──
  console.log('\n' + '='.repeat(80));
  console.log('PART 3: URIMP — Approved invoices in Dec 2024 (should be none based on earlier check)');
  console.log('='.repeat(80));

  const urimpApp = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      ARRAY_AGG(DISTINCT src_table) AS partitions
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Approved'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_Type_" != '0'
    GROUP BY "Invoice_No_", "Invoice_Type_"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  if (urimpApp.rows.length === 0) {
    console.log('\n  CONFIRMED: ZERO Approved invoices at URIMP in Dec 2024.');
    console.log('  → The URIMP 0.06 gap CANNOT be from an invoice moving Approved→Exported after Dec.');
  } else {
    let appTotal = 0;
    for (const r of urimpApp.rows) {
      appTotal += parseFloat(r.net_cr);
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r['Invoice_Type_']} | ${r.net_cr} Cr`);
    }
    console.log(`  Total Approved URIMP: ${appTotal.toFixed(4)} Cr`);
  }

  // ── PART 4: URIMP Reverted — per-partition status check (was any ever Exported?) ──
  console.log('\n' + '='.repeat(80));
  console.log('PART 4: URIMP Reverted Dec 2024 — all rows per partition (was any Exported in w1?)');
  console.log('='.repeat(80));

  const urimpRevPart = await db.query(`
    SELECT "Invoice_No_", src_table, "Status_",
      ROUND(CAST("Amount_" AS NUMERIC)/1e7, 6) AS net_cr,
      TO_CHAR("Created_Date"::TIMESTAMP,'YYYY-MM-DD') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Status_" = 'Reverted'
      AND "Invoice_Type_" != '0'
      AND CAST("Amount_" AS NUMERIC) > 0
    GROUP BY "Invoice_No_", src_table, "Status_", "Amount_", "Created_Date"
    ORDER BY "Invoice_No_", src_table
  `, [DATE_FROM, DATE_TO]);

  let lastInv = '';
  const exported_in_earlier = [];
  for (const r of urimpRevPart.rows) {
    if (r['Invoice_No_'] !== lastInv) {
      console.log(`\n  ${r['Invoice_No_']} | ${r.net_cr} Cr`);
      lastInv = r['Invoice_No_'];
    }
    console.log(`    ${r.src_table} | Reverted | created=${r.created}`);
  }

  // ── PART 5: Root cause summary ──────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('PART 5: SUMMARY — URIMH Approved Transfer invoices total if they got Exported post-Dec');
  console.log('='.repeat(80));

  // All Approved Transfer invoices at URIMH with amounts
  const approvedSTO = await db.query(`
    SELECT "Invoice_No_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      ROUND(SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC))/1e7, 6) AS gross_cr,
      MAX(src_table) AS last_partition,
      TO_CHAR(MAX("Created_Date"::TIMESTAMP),'YYYY-MM-DD') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Approved'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_Type_" = 'Transfer'
    GROUP BY "Invoice_No_"
    ORDER BY ABS(SUM(DISTINCT CAST("Amount_" AS NUMERIC)) - 50000)
    LIMIT 20
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Top 20 Approved Transfer invoices closest to ₹50,000 (5000 Cr):');
  console.log('  Invoice_No_              | Net Cr     | Gross Cr   | Last Partition    | Created');
  console.log('  ' + '-'.repeat(90));
  let runTotal = 0;
  for (const r of approvedSTO.rows) {
    runTotal += parseFloat(r.net_cr);
    console.log(`  ${r['Invoice_No_'].padEnd(25)}| ${String(r.net_cr).padEnd(11)}| ${String(r.gross_cr).padEnd(11)}| ${r.last_partition.padEnd(18)}| ${r.created}`);
  }
  console.log(`\n  Running total (top 20): ${runTotal.toFixed(6)} Cr`);

  // ── PART 6: Check STO invoices created AFTER last Dec snapshot (Dec 28+) ──
  console.log('\n' + '='.repeat(80));
  console.log('PART 6: Approved Transfer invoices created Dec 29-31 (most likely to be exported in Jan)');
  console.log('='.repeat(80));

  const lateSTO = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      TO_CHAR(MAX("Created_Date"::TIMESTAMP),'YYYY-MM-DD HH24:MI') AS created,
      ARRAY_AGG(DISTINCT "Status_") AS statuses,
      ARRAY_AGG(DISTINCT src_table) AS partitions
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Approved'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_Type_" = 'Transfer'
      AND "Created_Date" >= '2024-12-27 00:00:00'
    GROUP BY "Invoice_No_", "Invoice_Type_"
    ORDER BY created DESC
  `, [DATE_FROM, DATE_TO]);

  if (lateSTO.rows.length === 0) {
    console.log('\n  None found (no Approved Transfer created Dec 27+).');
  } else {
    let lateTotal = 0;
    for (const r of lateSTO.rows) {
      lateTotal += parseFloat(r.net_cr);
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r.net_cr} Cr | created=${r.created} | parts=${r.partitions.join(',')}`);
    }
    console.log(`  Total: ${lateTotal.toFixed(6)} Cr`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
