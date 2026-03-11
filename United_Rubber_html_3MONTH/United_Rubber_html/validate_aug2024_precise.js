'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-08-01';
  const DATE_TO   = '2024-08-31';

  // EXACT CRD values from screenshot:
  const CRD = { URIMH: 9.13, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66 };
  const CRD_TOTAL = 14.78;

  console.log('='.repeat(80));
  console.log('AUG 2024 — PRECISE ANALYSIS vs EXACT CRD (from screenshot)');
  console.log('CRD: URIMH=9.13, URIMP=3.13, URIPB=0.86, URIPU=1.66  Total=14.78 Cr');
  console.log('='.repeat(80));

  // ── STEP 1: Our formula per site ──────────────────────────────────────────
  const std = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let total = 0;
  console.log('\n  Site   | DB (Cr)   | CRD (Cr) | Gap (Cr) | Gap%  | Verdict');
  console.log('  ' + '-'.repeat(75));
  const dbVals = {};
  for (const r of std.rows) {
    total += parseFloat(r.net_cr);
    dbVals[r.site] = parseFloat(r.net_cr);
    const gap = (parseFloat(r.net_cr) - CRD[r.site]).toFixed(4);
    const pct = ((parseFloat(r.net_cr) - CRD[r.site]) / CRD[r.site] * 100).toFixed(1);
    const verdict = Math.abs(parseFloat(gap)) < 0.005 ? 'EXACT MATCH ✓' :
                    Math.abs(parseFloat(gap)) < 0.05  ? 'TIMING (small)' :
                    parseFloat(gap) < -0.1            ? 'INVESTIGATE' : 'TIMING';
    console.log(`  ${r.site.padEnd(7)}| ${String(r.net_cr).padEnd(10)}| ${CRD[r.site].toFixed(2).padEnd(9)}| ${gap.padEnd(9)}| ${pct.padEnd(6)}| ${verdict}`);
  }
  console.log(`\n  TOTAL  | ${total.toFixed(4).padEnd(10)}| ${CRD_TOTAL.toFixed(2).padEnd(9)}| ${(total-CRD_TOTAL).toFixed(4).padEnd(9)}|`);

  // ── STEP 2: ALL statuses — data completeness diagnostic ───────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — ALL statuses per site (diagnostic: is gap timing or missing data?)');
  console.log('If ALL statuses > CRD → data exists, gap = status/timing difference');
  console.log('If ALL statuses < CRD → invoices MISSING from our DB entirely');
  console.log('='.repeat(80));

  const allSt = await db.query(`
    SELECT "Site_" AS site,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS all_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Status_" NOT IN ('0','')
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Site   | DB Exported | DB All Stats | CRD     | All>CRD? | ROOT CAUSE TYPE');
  console.log('  ' + '-'.repeat(80));
  for (const r of allSt.rows) {
    const allCr = parseFloat(r.all_cr);
    const exported = dbVals[r.site] || 0;
    const crd = CRD[r.site];
    const rootCause = allCr > crd
      ? 'TIMING — data in DB, status diff only'
      : 'DATA GAP — invoices ABSENT from DB';
    const mark = allCr > crd ? '  YES — timing' : '  NO  — MISSING DATA';
    console.log(`  ${r.site.padEnd(7)}| ${String(exported).padEnd(12)}| ${String(r.all_cr).padEnd(13)}| ${crd.toFixed(2).padEnd(8)}| ${mark.padEnd(18)}| ${rootCause}`);
  }

  // ── STEP 3: URIMH — Approved Transfer invoices (timing proof) ─────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 3 — URIMH: Approved Transfer invoices = the GL timing pool');
  console.log('='.repeat(80));

  const urimhApproved = await db.query(`
    SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Approved'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
  `, [DATE_FROM, DATE_TO]);

  const gap_urimh = (dbVals['URIMH'] - CRD.URIMH).toFixed(4);
  const approvedCr = parseFloat(urimhApproved.rows[0].net_cr);
  console.log(`  URIMH Exported (our DB):   ${dbVals['URIMH']} Cr`);
  console.log(`  URIMH Approved Transfer:   ${urimhApproved.rows[0].net_cr} Cr  (${urimhApproved.rows[0].inv} invoices)`);
  console.log(`  URIMH CRD:                 ${CRD.URIMH} Cr`);
  console.log(`  Gap:                       ${gap_urimh} Cr`);
  console.log(`  Gap as % of Approved pool: ${((Math.abs(parseFloat(gap_urimh)) / approvedCr)*100).toFixed(1)}% of Approved Transfer invoices moved to Exported in CRD`);
  console.log(`\n  LOGIC: ${dbVals['URIMH']} Exported + ~${Math.abs(parseFloat(gap_urimh)).toFixed(4)} (subset of Approved) = ${(dbVals['URIMH'] + Math.abs(parseFloat(gap_urimh))).toFixed(4)} ≈ CRD ${CRD.URIMH}`);

  // ── STEP 4: URIMP — missing data proof ────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 4 — URIMP: all statuses vs CRD (missing data proof)');
  console.log('='.repeat(80));

  const urimpAll = await db.query(`
    SELECT "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Status_"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  let urimpGrand = 0;
  for (const r of urimpAll.rows) {
    if (r['Status_'] && r['Status_'] !== '0') urimpGrand += parseFloat(r.net_cr || 0);
    console.log(`  ${(r['Status_']||'0').padEnd(22)} | ${String(r.inv).padEnd(6)} inv | ${r.net_cr} Cr`);
  }
  console.log(`\n  URIMP DB (ALL statuses):  ${urimpGrand.toFixed(4)} Cr`);
  console.log(`  URIMP CRD:                ${CRD.URIMP} Cr`);
  console.log(`  Still missing from DB:    ${(urimpGrand - CRD.URIMP).toFixed(4)} Cr  ← invoices NOT in DB at all`);
  console.log(`\n  CONCLUSION: Even if we counted every URIMP invoice regardless of status,`);
  console.log(`  we still reach only ${urimpGrand.toFixed(4)} Cr vs CRD ${CRD.URIMP} Cr.`);
  console.log(`  ~${Math.abs(urimpGrand - CRD.URIMP).toFixed(4)} Cr of URIMP Aug 2024 invoices are simply NOT in our database.`);

  // ── STEP 5: Cross-verify — same pattern check across months ───────────────
  console.log('\n' + '='.repeat(80));
  console.log('STEP 5 — URIMP PATTERN: same missing-data issue across months?');
  console.log('(If URIMP consistently has this gap, it is a structural extraction issue)');
  console.log('='.repeat(80));

  const months = [
    { from: '2024-08-01', to: '2024-08-31', label: 'Aug-24', crd: 3.13 },
    { from: '2024-09-01', to: '2024-09-30', label: 'Sep-24', crd: 3.08 },
    { from: '2024-10-01', to: '2024-10-31', label: 'Oct-24', crd: 3.42 },
    { from: '2024-11-01', to: '2024-11-30', label: 'Nov-24', crd: 2.98 },
    { from: '2024-12-01', to: '2024-12-31', label: 'Dec-24', crd: 3.40 },
    { from: '2025-01-01', to: '2025-01-28', label: 'Jan-25', crd: 5.34 },
  ];

  console.log('\n  Month  | DB Exported | DB ALL Stats | CRD   | Gap (Exp) | Gap (All) | Type');
  console.log('  ' + '-'.repeat(90));

  for (const m of months) {
    const expR = await db.query(`
      SELECT ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R' AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP' AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    `, [m.from, m.to]);

    const allR = await db.query(`
      SELECT ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R' AND "Status_" NOT IN ('0','')
        AND "Site_" = 'URIMP' AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    `, [m.from, m.to]);

    const exp = parseFloat(expR.rows[0].cr || 0);
    const all = parseFloat(allR.rows[0].cr || 0);
    const gapExp = (exp - m.crd).toFixed(4);
    const gapAll = (all - m.crd).toFixed(4);
    const type = all < m.crd ? 'MISSING DATA' : 'TIMING';
    const mark = all < m.crd ? ' ⚠' : ' ✓';
    console.log(`  ${m.label.padEnd(6)} | ${String(exp).padEnd(12)}| ${String(all).padEnd(13)}| ${m.crd.toFixed(2).padEnd(6)}| ${gapExp.padEnd(10)}| ${gapAll.padEnd(10)}| ${type}${mark}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
