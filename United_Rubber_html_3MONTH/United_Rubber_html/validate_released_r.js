'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // 8 URIMP -R documents with Status=Released (reversal INITIATED but NOT Exported yet)
  // Their originals might be Reverted in our DB but were Exported in CRD's view
  // This could explain the URIMP 0.06 Cr gap.

  // ── PART 1: Find the originals of URIMP Released -R documents ─────────────
  console.log('='.repeat(80));
  console.log('PART 1 — URIMP: Originals of the 8 Released -R documents');
  console.log('If originals are Reverted (not counted), but CRD saw them as Exported → GAP!');
  console.log('='.repeat(80));

  const releasedR = await db.query(`
    SELECT r."Invoice_No_" AS r_doc,
      orig."Invoice_No_" AS original,
      orig."Site_",
      orig."Invoice_Type_",
      ARRAY_AGG(DISTINCT orig."Status_") AS orig_statuses,
      ROUND(SUM(DISTINCT CAST(orig."Amount_" AS NUMERIC))/1e7, 6) AS orig_net_cr,
      TO_CHAR(MAX(r."Created_Date"::TIMESTAMP),'YYYY-MM-DD') AS r_created,
      ARRAY_AGG(DISTINCT r."Status_") AS r_statuses
    FROM "LandingStage2"."mf_sales_si_siheader_all" r
    JOIN "LandingStage2"."mf_sales_si_siheader_all" orig
      ON orig."Invoice_No_" = REPLACE(r."Invoice_No_", '-R', '')
    WHERE r."Invoice_No_" LIKE '%-R'
      AND r."Site_" = 'URIMP'
      AND r."Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND r."Status_" = 'Released'
    GROUP BY r."Invoice_No_", orig."Invoice_No_", orig."Site_", orig."Invoice_Type_"
    ORDER BY orig_net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  let releasedTotal = 0;
  let countedInDB = 0;
  let notCountedInDB = 0;
  let countedTotal = 0;
  let notCountedTotal = 0;

  console.log('\n  Original       | Orig Status        | Net Cr     | -R Status | Counted in our formula?');
  console.log('  ' + '-'.repeat(85));
  for (const r of releasedR.rows) {
    const counted = r.orig_statuses.includes('Exported To GL');
    const note = counted ? 'YES (Exported in DB)' : `NO (${r.orig_statuses.join(',')})`;
    releasedTotal += parseFloat(r.orig_net_cr);
    if (counted) { countedInDB++; countedTotal += parseFloat(r.orig_net_cr); }
    else { notCountedInDB++; notCountedTotal += parseFloat(r.orig_net_cr); }
    console.log(`  ${r.original.padEnd(20)} | ${r.orig_statuses.join(',').padEnd(18)} | ${String(r.orig_net_cr).padEnd(11)}| ${r.r_statuses.join(',').padEnd(10)}| ${note}`);
  }
  console.log(`\n  Total original amounts: ${releasedTotal.toFixed(6)} Cr`);
  console.log(`  Already counted in our formula (Exported in DB): ${countedInDB} inv | ${countedTotal.toFixed(6)} Cr`);
  console.log(`  NOT counted (not Exported in DB): ${notCountedInDB} inv | ${notCountedTotal.toFixed(6)} Cr`);
  console.log(`\n  If CRD counts the NOT-EXPORTED originals: 3.3410 + ${notCountedTotal.toFixed(6)} = ${(3.3410 + notCountedTotal).toFixed(6)} Cr`);
  console.log(`  URIMP CRD: 3.4010 Cr | Diff: ${(3.3410 + notCountedTotal - 3.4010).toFixed(6)}`);

  // ── PART 2: Full URIMP -R detail — ALL -R docs and their original status ───
  console.log('\n' + '='.repeat(80));
  console.log('PART 2 — URIMP: ALL -R documents and original invoice status');
  console.log('='.repeat(80));

  const allR = await db.query(`
    SELECT r."Invoice_No_" AS r_doc,
      ARRAY_AGG(DISTINCT r."Status_") AS r_statuses,
      ROUND(SUM(DISTINCT CAST(r."Amount_" AS NUMERIC))/1e7, 6) AS r_net_cr,
      ARRAY_AGG(DISTINCT orig."Status_") AS orig_statuses,
      ROUND(SUM(DISTINCT CAST(orig."Amount_" AS NUMERIC))/1e7, 6) AS orig_net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all" r
    LEFT JOIN "LandingStage2"."mf_sales_si_siheader_all" orig
      ON orig."Invoice_No_" = REPLACE(r."Invoice_No_", '-R', '')
    WHERE r."Invoice_No_" LIKE '%-R'
      AND r."Site_" = 'URIMP'
      AND r."Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY r."Invoice_No_"
    ORDER BY r_net_cr
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  -R Document              | -R Status       | -R Amount  | Orig Status     | Orig Amount');
  console.log('  ' + '-'.repeat(95));
  let origNotExported = 0;
  let origExported = 0;
  for (const r of allR.rows) {
    const origExp = r.orig_statuses && r.orig_statuses.includes('Exported To GL');
    if (!origExp) origNotExported += parseFloat(r.orig_net_cr || 0);
    else origExported += parseFloat(r.orig_net_cr || 0);
    const flag = !origExp ? ` ← ORIG NOT EXPORTED (${r.orig_statuses?.join(',')})` : '';
    console.log(`  ${r.r_doc.padEnd(25)}| ${(r.r_statuses?.join(',')??'').padEnd(16)}| ${String(r.r_net_cr).padEnd(11)}| ${(r.orig_statuses?.join(',')??'').padEnd(16)}| ${r.orig_net_cr}${flag}`);
  }
  console.log(`\n  Originals NOT in our Exported formula: ${origNotExported.toFixed(6)} Cr`);
  console.log(`  Originals already in our Exported formula: ${origExported.toFixed(6)} Cr`);
  console.log(`\n  If CRD counts NOT-exported originals + our current: ${(3.3410 + origNotExported).toFixed(6)} Cr vs CRD 3.4010`);

  // ── PART 3: URIMH same check ───────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('PART 3 — URIMH: ALL -R documents and original invoice status');
  console.log('Looking for originals that are NOT Exported To GL in our DB but are in CRD');
  console.log('='.repeat(80));

  const urimhR = await db.query(`
    SELECT r."Invoice_No_" AS r_doc,
      ARRAY_AGG(DISTINCT r."Status_") AS r_statuses,
      ROUND(SUM(DISTINCT CAST(r."Amount_" AS NUMERIC))/1e7, 6) AS r_net_cr,
      ARRAY_AGG(DISTINCT orig."Status_") AS orig_statuses,
      ROUND(SUM(DISTINCT CAST(orig."Amount_" AS NUMERIC))/1e7, 6) AS orig_net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all" r
    LEFT JOIN "LandingStage2"."mf_sales_si_siheader_all" orig
      ON orig."Invoice_No_" = REPLACE(r."Invoice_No_", '-R', '')
    WHERE r."Invoice_No_" LIKE '%-R'
      AND r."Site_" = 'URIMH'
      AND r."Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY r."Invoice_No_"
    ORDER BY r_net_cr
  `, [DATE_FROM, DATE_TO]);

  let urimhOrigNotExp = 0;
  console.log('\n  -R Document              | -R Status       | -R Amount  | Orig Status     | Orig Amount');
  console.log('  ' + '-'.repeat(95));
  for (const r of urimhR.rows) {
    const origExp = r.orig_statuses && r.orig_statuses.includes('Exported To GL');
    const flag = !origExp ? ` ← ORIG NOT EXP` : '';
    if (!origExp) urimhOrigNotExp += parseFloat(r.orig_net_cr || 0);
    console.log(`  ${r.r_doc.padEnd(25)}| ${(r.r_statuses?.join(',')??'').padEnd(16)}| ${String(r.r_net_cr).padEnd(11)}| ${(r.orig_statuses?.join(',')??'').padEnd(16)}| ${r.orig_net_cr}${flag}`);
  }
  console.log(`\n  URIMH originals NOT in our formula: ${urimhOrigNotExp.toFixed(6)} Cr`);
  console.log(`  If CRD counts these: 8.8843 + ${urimhOrigNotExp.toFixed(6)} = ${(8.8843 + urimhOrigNotExp).toFixed(6)} Cr vs CRD 8.8943`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
