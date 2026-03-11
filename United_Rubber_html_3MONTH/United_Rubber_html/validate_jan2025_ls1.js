'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2025-01-01';
  const DATE_TO   = '2025-01-28';

  // CRD (from email)
  const CRD = { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41 };

  // ── STEP 1: LandingStage1 Jan 2025 per site (UNION of w1-w4) ──────────────
  console.log('='.repeat(80));
  console.log('STEP 1 — LandingStage1 Jan 2025: UNION w1-w4 deduped vs CRD');
  console.log('='.repeat(80));

  const ls1 = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Site_", "Status_", "Amount_"
      FROM (
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 1 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w1"
        UNION ALL
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 2 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w2"
        UNION ALL
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 3 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w3"
        UNION ALL
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 4 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w4"
      ) all_weeks
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      ORDER BY "Invoice_No_", wk DESC
    ) latest
    WHERE "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let total = 0;
  console.log('\n  Site   | LS1 Cr    | CRD Cr | Gap     | Gap%');
  console.log('  ' + '-'.repeat(55));
  for (const r of ls1.rows) {
    total += parseFloat(r.net_cr);
    const gap = (parseFloat(r.net_cr) - CRD[r.site]).toFixed(4);
    const pct = ((parseFloat(r.net_cr) - CRD[r.site]) / CRD[r.site] * 100).toFixed(1);
    const mark = Math.abs(parseFloat(gap)) < 0.05 ? ' ✓ CLOSE' : Math.abs(parseFloat(gap)) < 0.005 ? ' ✓ EXACT' : '';
    console.log(`  ${r.site.padEnd(7)}| ${String(r.net_cr).padEnd(10)}| ${CRD[r.site].toFixed(2).padEnd(7)}| ${gap.padEnd(8)} | ${pct}%${mark}`);
  }
  console.log(`\n  TOTAL: ${total.toFixed(4)} Cr | CRD: 16.12 | diff: ${(total - 16.12).toFixed(4)}`);

  // ── STEP 2: Row counts per partition ──────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — LandingStage1 Jan 2025: row counts per partition');
  console.log('='.repeat(80));
  for (const w of ['w1','w2','w3','w4']) {
    const r = await db.query(`SELECT COUNT(*) AS cnt FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_${w}"`);
    console.log(`  2025_jan_${w}: ${r.rows[0].cnt} rows`);
  }

  // ── STEP 3: URIMP in each partition ───────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — URIMP per partition (LandingStage1): all statuses + Exported');
  console.log('='.repeat(80));
  for (const w of ['w1','w2','w3','w4']) {
    const r = await db.query(`
      SELECT COUNT(DISTINCT "Invoice_No_") AS inv_all,
        COUNT(DISTINCT CASE WHEN "Status_" = 'Exported To GL' THEN "Invoice_No_" END) AS inv_exp,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS all_cr,
        ROUND(SUM(CASE WHEN "Status_" = 'Exported To GL'
          THEN CAST("Amount_" AS NUMERIC) ELSE 0 END)/1e7, 4) AS exp_cr,
        MIN("Invoice_Date_(Date)") AS min_date,
        MAX("Invoice_Date_(Date)") AS max_date
      FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_${w}"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    `, [DATE_FROM, DATE_TO]);
    const row = r.rows[0];
    console.log(`  jan_${w}: all=${row.inv_all} inv (${row.all_cr} Cr) | exported=${row.inv_exp} (${row.exp_cr} Cr) | dates: ${row.min_date} → ${row.max_date}`);
  }

  // ── STEP 4: URIMP in each partition — unique invoices per partition ────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — URIMP: how many UNIQUE invoices appear across partitions?');
  console.log('(Union distinct — total unique invoices captured across all 4 weeks)');
  console.log('='.repeat(80));

  const urimpUnique = await db.query(`
    SELECT COUNT(DISTINCT "Invoice_No_") AS unique_inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Amount_" FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w1"
        WHERE "Invoice_No_" NOT LIKE '%-R' AND "Site_" = 'URIMP' AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      UNION ALL
      SELECT "Invoice_No_", "Amount_" FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w2"
        WHERE "Invoice_No_" NOT LIKE '%-R' AND "Site_" = 'URIMP' AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      UNION ALL
      SELECT "Invoice_No_", "Amount_" FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w3"
        WHERE "Invoice_No_" NOT LIKE '%-R' AND "Site_" = 'URIMP' AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      UNION ALL
      SELECT "Invoice_No_", "Amount_" FROM "LandingStage1"."mf_sales_si_siheader_2025_jan_w4"
        WHERE "Invoice_No_" NOT LIKE '%-R' AND "Site_" = 'URIMP' AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    ) all_weeks
  `, [DATE_FROM, DATE_TO]);
  console.log(`  URIMP unique invoices across all 4 Jan partitions: ${urimpUnique.rows[0].unique_inv} | ${urimpUnique.rows[0].net_cr} Cr (SUM DISTINCT Amount_)`);
  console.log(`  CRD URIMP Jan-25: 5.34 Cr`);
  console.log(`  Gap: ${(parseFloat(urimpUnique.rows[0].net_cr) - 5.34).toFixed(4)} Cr`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
