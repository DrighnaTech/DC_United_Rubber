'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';
  const CRD_TOTAL = 14.22;
  const CRD = { URIMH: 8.8943, URIMP: 3.4010, URIPB: 0.3492, URIPU: 1.5751 };

  // LandingStage1 = raw granular snapshots (clean, no cross-join duplication)
  // Each row = one invoice per snapshot week

  const weeks = ['w1','w2','w3','w4'];

  // ── STEP 1: Row count per LandingStage1 Dec partition ─────────────────────
  console.log('='.repeat(80));
  console.log('STEP 1 — LandingStage1 Dec partition row counts');
  console.log('='.repeat(80));

  for (const w of weeks) {
    const tbl = `mf_sales_si_siheader_2024_dec_${w}`;
    const r = await db.query(`SELECT COUNT(*) AS cnt FROM "LandingStage1"."${tbl}"`);
    console.log(`  ${tbl}: ${r.rows[0].cnt} rows`);
  }

  // ── STEP 2: LandingStage1 — LATEST snapshot per invoice (UNION, DISTINCT ON) ─
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — LandingStage1: Latest snapshot per invoice (clean dedup)');
  console.log('='.repeat(80));

  const latestSnap = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM (
      SELECT DISTINCT ON ("Invoice_No_") "Invoice_No_", "Site_", "Status_", "Amount_"
      FROM (
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 1 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2024_dec_w1"
        UNION ALL
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 2 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2024_dec_w2"
        UNION ALL
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 3 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2024_dec_w3"
        UNION ALL
        SELECT "Invoice_No_","Site_","Status_","Amount_","Invoice_Date_(Date)", 4 AS wk FROM "LandingStage1"."mf_sales_si_siheader_2024_dec_w4"
      ) all_weeks
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      ORDER BY "Invoice_No_", wk DESC
    ) latest
    WHERE "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let ls1Total = 0;
  console.log('\n  Site   | Inv  | Net Cr    | CRD Cr | Diff');
  console.log('  ' + '-'.repeat(60));
  for (const r of latestSnap.rows) {
    ls1Total += parseFloat(r.net_cr);
    const diff = (parseFloat(r.net_cr) - (CRD[r.site]||0)).toFixed(4);
    const mark = Math.abs(parseFloat(r.net_cr) - (CRD[r.site]||0)) < 0.001 ? ' ✓ EXACT' : '';
    console.log(`  ${r.site.padEnd(7)}| ${String(r.inv).padEnd(5)}| ${String(r.net_cr).padEnd(10)}| ${(CRD[r.site]||0).toFixed(4)}  | ${diff}${mark}`);
  }
  console.log(`\n  TOTAL: ${ls1Total.toFixed(4)} Cr | CRD: ${CRD_TOTAL} | diff: ${(ls1Total-CRD_TOTAL).toFixed(4)}`);

  // ── STEP 3: Each partition independently ──────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — LandingStage1: each partition independently (total)');
  console.log('='.repeat(80));

  for (const w of weeks) {
    const tbl = `mf_sales_si_siheader_2024_dec_${w}`;
    const r = await db.query(`
      SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
      FROM "LandingStage1"."${tbl}"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    `, [DATE_FROM, DATE_TO]);
    const diff = (parseFloat(r.rows[0].net_cr) - CRD_TOTAL).toFixed(4);
    const mark = Math.abs(parseFloat(r.rows[0].net_cr) - CRD_TOTAL) < 0.01 ? ' ✓ CLOSE' : '';
    console.log(`  ${w}: ${r.rows[0].inv} inv | ${r.rows[0].net_cr} Cr | diff from 14.22: ${diff}${mark}`);
  }

  // ── STEP 4: Per-site per-partition ────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — LandingStage1: per-site per-partition (find which matches CRD)');
  console.log('='.repeat(80));

  for (const site of ['URIMH','URIMP','URIPB','URIPU']) {
    console.log(`\n  ${site} (CRD=${CRD[site]}):`);
    for (const w of weeks) {
      const tbl = `mf_sales_si_siheader_2024_dec_${w}`;
      const r = await db.query(`
        SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
          ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
        FROM "LandingStage1"."${tbl}"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
      `, [site, DATE_FROM, DATE_TO]);
      const diff = (parseFloat(r.rows[0].net_cr) - CRD[site]).toFixed(4);
      const mark = Math.abs(parseFloat(r.rows[0].net_cr) - CRD[site]) < 0.001 ? ' ✓ EXACT MATCH' : Math.abs(parseFloat(r.rows[0].net_cr) - CRD[site]) < 0.01 ? ' ~ CLOSE' : '';
      console.log(`    ${w}: ${r.rows[0].inv} inv | ${r.rows[0].net_cr} Cr | diff=${diff}${mark}`);
    }
  }

  // ── STEP 5: Status breakdown in w4 (most recent) ──────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 5 — LandingStage1 w4: status breakdown per site');
  console.log('='.repeat(80));

  const w4Status = await db.query(`
    SELECT "Site_" AS site, "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage1"."mf_sales_si_siheader_2024_dec_w4"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Status_" NOT IN ('0','')
    GROUP BY site, "Status_"
    ORDER BY site, "Status_"
  `, [DATE_FROM, DATE_TO]);

  for (const r of w4Status.rows) {
    const mark = r['Status_'] === 'Exported To GL' ? ` ← diff from CRD: ${(parseFloat(r.net_cr) - (CRD[r.site]||0)).toFixed(4)}` : '';
    console.log(`  ${r.site} | ${r['Status_'].padEnd(18)} | ${String(r.inv).padEnd(5)} inv | ${r.net_cr} Cr${mark}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
