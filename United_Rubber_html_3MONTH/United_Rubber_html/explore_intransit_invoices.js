'use strict';
const db = require('./db/connection');

(async () => {
  // ═══════════════════════════════════════════════════════════════════
  // DEC 2024 URIMP — Invoices NOT Exported To GL (in-transit to GL)
  // These are in DB but with a different status
  // ═══════════════════════════════════════════════════════════════════
  console.log('='.repeat(80));
  console.log('DEC 2024 URIMP — Invoices NOT YET Exported To GL');
  console.log('These invoices are in our DB but with Approved/Reverted/other status');
  console.log('CRD (generated Jan 29) likely captured them AFTER they were exported');
  console.log('Gap to fill: 0.060011 Cr');
  console.log('='.repeat(80));

  const decNonExp = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" NOT IN ('0','','Exported To GL')
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Status_", "Invoice_Type_",
      "Invoice_Date_(Date)" AS inv_date,
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr,
      "Amount_"::NUMERIC AS raw_amt
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
  `);

  let runningSum = 0;
  let gapTarget = 0.060011;
  console.log('\n  Invoice_No_'.padEnd(34) + '| Status'.padEnd(24) + '| Type'.padEnd(22) + '| Date       | Amount Cr    | Running Sum  | vs Gap');
  console.log('  ' + '-'.repeat(140));

  const candidatesForGap = [];

  for (const r of decNonExp.rows) {
    runningSum += parseFloat(r.cr);
    const gapDiff = Math.abs(runningSum - gapTarget);
    const mark = gapDiff < 0.001 ? ' ← MATCHES GAP!' :
                 gapDiff < 0.005 ? ' ~ CLOSE' : '';

    if (mark) candidatesForGap.push({ sum: runningSum, invoices: [...candidatesForGap.map(c => c.inv || ''), r['Invoice_No_']] });

    console.log(`  ${r['Invoice_No_'].padEnd(32)} | ${(r['Status_']||'?').padEnd(22)} | ${(r['Invoice_Type_']||'?').padEnd(20)} | ${r.inv_date} | ${String(r.cr).padEnd(12)} | ${runningSum.toFixed(6).padEnd(12)} |${mark}`);
  }

  console.log(`\n  Total non-Exported invoices: ${decNonExp.rows.length}`);
  console.log(`  Total non-Exported amount: ${runningSum.toFixed(6)} Cr`);
  console.log(`  Gap to fill: ${gapTarget} Cr`);

  // Try to find exact combinations that match the gap
  console.log('\n  Searching for invoice combinations that sum to ~0.060011 Cr...');
  const amounts = decNonExp.rows.map(r => ({ inv: r['Invoice_No_'], status: r['Status_'], cr: parseFloat(r.cr), raw: parseFloat(r.raw_amt) }));

  // Check single invoices
  for (const a of amounts) {
    if (Math.abs(a.cr - gapTarget) < 0.003) {
      console.log(`  SINGLE: ${a.inv} (${a.status}) = ${a.cr.toFixed(6)} Cr — diff from gap: ${(a.cr - gapTarget).toFixed(6)}`);
    }
  }

  // Check pairs
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      const sum = amounts[i].cr + amounts[j].cr;
      if (Math.abs(sum - gapTarget) < 0.002) {
        console.log(`  PAIR: ${amounts[i].inv} + ${amounts[j].inv} = ${sum.toFixed(6)} Cr — diff: ${(sum - gapTarget).toFixed(6)}`);
      }
    }
  }

  // Check triplets
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      for (let k = j + 1; k < amounts.length; k++) {
        const sum = amounts[i].cr + amounts[j].cr + amounts[k].cr;
        if (Math.abs(sum - gapTarget) < 0.001) {
          console.log(`  TRIPLET: ${amounts[i].inv} + ${amounts[j].inv} + ${amounts[k].inv} = ${sum.toFixed(6)} Cr — diff: ${(sum - gapTarget).toFixed(6)}`);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // JAN 2025 URIMP — MISSING invoices (not in DB at all)
  // Check invoice number sequence gaps
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(80));
  console.log('JAN 2025 URIMP — MISSING INVOICES (not in DB at all)');
  console.log('Gap: 0.267389 Cr = ~₹26.7 lakh');
  console.log('DB ALL statuses = 5.20 Cr < CRD 5.34 Cr → 0.14 Cr genuinely missing');
  console.log('='.repeat(80));

  // Check non-Exported Jan invoices first
  console.log('\n--- Jan 2025 URIMP: Non-Exported invoices (in DB, not counted) ---');
  const janNonExp = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" NOT IN ('0','','Exported To GL')
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2025-01-01'
        AND "Invoice_Date_(Date)" <= '2025-01-28'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Status_", "Invoice_Type_",
      "Invoice_Date_(Date)" AS inv_date,
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
  `);

  let janNonExpTotal = 0;
  console.log('  Invoice_No_'.padEnd(34) + '| Status'.padEnd(24) + '| Type'.padEnd(22) + '| Date       | Amount Cr');
  console.log('  ' + '-'.repeat(110));
  for (const r of janNonExp.rows) {
    janNonExpTotal += parseFloat(r.cr);
    console.log(`  ${r['Invoice_No_'].padEnd(32)} | ${(r['Status_']||'?').padEnd(22)} | ${(r['Invoice_Type_']||'?').padEnd(20)} | ${r.inv_date} | ${r.cr}`);
  }
  console.log(`\n  Total Jan non-Exported: ${janNonExp.rows.length} invoices | ${janNonExpTotal.toFixed(6)} Cr`);
  console.log(`  Jan DB Exported:        5.072611 Cr`);
  console.log(`  Jan DB ALL statuses:    ${(5.072611 + janNonExpTotal).toFixed(6)} Cr`);
  console.log(`  Jan CRD:                5.340000 Cr`);
  console.log(`  Still missing from DB:  ${(5.34 - 5.072611 - janNonExpTotal).toFixed(6)} Cr`);

  // Check invoice number sequence — find gaps in PINV numbers
  console.log('\n--- Jan 2025 URIMP: Invoice number range analysis ---');
  const janRange = await db.query(`
    SELECT MIN("Invoice_No_") AS min_inv, MAX("Invoice_No_") AS max_inv,
      COUNT(DISTINCT "Invoice_No_") AS cnt
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" LIKE 'PINV/%'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2025-01-01'
      AND "Invoice_Date_(Date)" <= '2025-01-28'
  `);
  console.log(`  PINV range: ${janRange.rows[0].min_inv} to ${janRange.rows[0].max_inv} (${janRange.rows[0].cnt} invoices)`);

  // Check if there are Jan-dated URIMP invoices in Feb/Mar/later snapshots
  console.log('\n--- Jan-dated URIMP invoices in later monthly snapshots ---');
  const laterMonths = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'LandingStage1'
      AND table_name LIKE 'mf_sales_si_siheader_2025_%'
      AND table_name NOT LIKE '%jan%'
    ORDER BY table_name
  `);

  for (const t of laterMonths.rows) {
    try {
      const res = await db.query(`
        WITH deduped AS (
          SELECT "Invoice_No_", "Invoice_Date_(Date)",
            MAX("Status_") AS "Status_",
            SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
          FROM "LandingStage1"."${t.table_name}"
          WHERE "Invoice_No_" NOT LIKE '%-R'
            AND "Site_" = 'URIMP'
            AND "Invoice_Date_(Date)" >= '2025-01-01'
            AND "Invoice_Date_(Date)" <= '2025-01-28'
            AND "Status_" = 'Exported To GL'
          GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
        )
        SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
          ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
        FROM deduped
      `);
      if (res.rows[0].inv > 0) {
        console.log(`  ${t.table_name}: ${res.rows[0].inv} Jan-dated Exported inv | ${res.rows[0].cr} Cr ← FOUND!`);

        // List these invoices
        const detail = await db.query(`
          WITH deduped AS (
            SELECT "Invoice_No_", "Invoice_Date_(Date)",
              MAX("Status_") AS "Status_",
              SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
            FROM "LandingStage1"."${t.table_name}"
            WHERE "Invoice_No_" NOT LIKE '%-R'
              AND "Site_" = 'URIMP'
              AND "Invoice_Date_(Date)" >= '2025-01-01'
              AND "Invoice_Date_(Date)" <= '2025-01-28'
              AND "Status_" = 'Exported To GL'
            GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
          )
          SELECT "Invoice_No_", "Invoice_Date_(Date)" AS dt,
            ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
          FROM deduped ORDER BY "Amount_"::NUMERIC DESC LIMIT 20
        `);
        for (const d of detail.rows) {
          console.log(`    ${d['Invoice_No_'].padEnd(30)} | ${d.dt} | ${d.cr} Cr`);
        }
      } else {
        console.log(`  ${t.table_name}: 0 Jan-dated URIMP inv`);
      }
    } catch(e) {
      console.log(`  ${t.table_name}: error — ${e.message.substring(0,80)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // URIMH DEC + JAN — same analysis
  // ═══════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(80));
  console.log('URIMH DEC 2024 — Non-Exported invoices (gap: 0.010018 Cr)');
  console.log('='.repeat(80));

  const mhDecNonExp = await db.query(`
    WITH deduped AS (
      SELECT "Invoice_No_", "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" NOT IN ('0','','Exported To GL')
        AND "Site_" = 'URIMH'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Status_", "Invoice_Type_",
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
    LIMIT 20
  `);

  for (const r of mhDecNonExp.rows) {
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r['Status_']||'?').padEnd(20)} | ${(r['Invoice_Type_']||'?').padEnd(18)} | ${r.cr} Cr`);
  }

  // Check combinations for URIMH Dec gap (0.010018)
  console.log('\n  Searching for combinations matching URIMH Dec gap 0.010018 Cr...');
  const mhAmounts = mhDecNonExp.rows.map(r => ({ inv: r['Invoice_No_'], cr: parseFloat(r.cr) }));
  for (const a of mhAmounts) {
    if (Math.abs(a.cr - 0.010018) < 0.002) {
      console.log(`  SINGLE: ${a.inv} = ${a.cr.toFixed(6)} Cr — diff: ${(a.cr - 0.010018).toFixed(6)}`);
    }
  }
  for (let i = 0; i < mhAmounts.length; i++) {
    for (let j = i + 1; j < mhAmounts.length; j++) {
      const sum = mhAmounts[i].cr + mhAmounts[j].cr;
      if (Math.abs(sum - 0.010018) < 0.001) {
        console.log(`  PAIR: ${mhAmounts[i].inv} + ${mhAmounts[j].inv} = ${sum.toFixed(6)} Cr — diff: ${(sum - 0.010018).toFixed(6)}`);
      }
    }
  }

  // URIMH JAN non-exported
  console.log('\n' + '='.repeat(80));
  console.log('URIMH JAN 2025 — Non-Exported invoices (gap: 0.022801 Cr)');
  console.log('='.repeat(80));

  const mhJanNonExp = await db.query(`
    WITH deduped AS (
      SELECT "Invoice_No_", "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" NOT IN ('0','','Exported To GL')
        AND "Site_" = 'URIMH'
        AND "Invoice_Date_(Date)" >= '2025-01-01'
        AND "Invoice_Date_(Date)" <= '2025-01-28'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Status_", "Invoice_Type_",
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
    LIMIT 20
  `);

  for (const r of mhJanNonExp.rows) {
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r['Status_']||'?').padEnd(20)} | ${(r['Invoice_Type_']||'?').padEnd(18)} | ${r.cr} Cr`);
  }

  // Search for URIMH Jan gap combos (0.022801)
  console.log('\n  Searching for combinations matching URIMH Jan gap 0.022801 Cr...');
  const mhJanAmts = mhJanNonExp.rows.map(r => ({ inv: r['Invoice_No_'], cr: parseFloat(r.cr) }));
  for (const a of mhJanAmts) {
    if (Math.abs(a.cr - 0.022801) < 0.003) {
      console.log(`  SINGLE: ${a.inv} = ${a.cr.toFixed(6)} Cr — diff: ${(a.cr - 0.022801).toFixed(6)}`);
    }
  }
  for (let i = 0; i < mhJanAmts.length; i++) {
    for (let j = i + 1; j < mhJanAmts.length; j++) {
      const sum = mhJanAmts[i].cr + mhJanAmts[j].cr;
      if (Math.abs(sum - 0.022801) < 0.001) {
        console.log(`  PAIR: ${mhJanAmts[i].inv} + ${mhJanAmts[j].inv} = ${sum.toFixed(6)} Cr — diff: ${(sum - 0.022801).toFixed(6)}`);
      }
    }
  }

  // URIPU JAN non-exported (gap: 0.014180)
  console.log('\n' + '='.repeat(80));
  console.log('URIPU JAN 2025 — Non-Exported invoices (gap: 0.014180 Cr)');
  console.log('='.repeat(80));

  const puJanNonExp = await db.query(`
    WITH deduped AS (
      SELECT "Invoice_No_", "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" NOT IN ('0','','Exported To GL')
        AND "Site_" = 'URIPU'
        AND "Invoice_Date_(Date)" >= '2025-01-01'
        AND "Invoice_Date_(Date)" <= '2025-01-28'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_No_", "Status_", "Invoice_Type_",
      ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
    FROM deduped
    ORDER BY "Amount_"::NUMERIC DESC
    LIMIT 20
  `);

  for (const r of puJanNonExp.rows) {
    console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${(r['Status_']||'?').padEnd(20)} | ${(r['Invoice_Type_']||'?').padEnd(18)} | ${r.cr} Cr`);
  }

  console.log('\n  Searching for combinations matching URIPU Jan gap 0.014180 Cr...');
  const puAmts = puJanNonExp.rows.map(r => ({ inv: r['Invoice_No_'], cr: parseFloat(r.cr) }));
  for (const a of puAmts) {
    if (Math.abs(a.cr - 0.014180) < 0.003) {
      console.log(`  SINGLE: ${a.inv} = ${a.cr.toFixed(6)} Cr — diff: ${(a.cr - 0.014180).toFixed(6)}`);
    }
  }
  for (let i = 0; i < puAmts.length; i++) {
    for (let j = i + 1; j < puAmts.length; j++) {
      const sum = puAmts[i].cr + puAmts[j].cr;
      if (Math.abs(sum - 0.014180) < 0.001) {
        console.log(`  PAIR: ${puAmts[i].inv} + ${puAmts[j].inv} = ${sum.toFixed(6)} Cr — diff: ${(sum - 0.014180).toFixed(6)}`);
      }
    }
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
