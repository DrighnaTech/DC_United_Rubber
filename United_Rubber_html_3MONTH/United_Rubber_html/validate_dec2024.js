'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';
  const CRD       = 14.22;   // from ARCHITECTURE.md CRD Ref
  const SITES     = ['URIMH','URIMP','URIPB','URIPU'];

  console.log('='.repeat(70));
  console.log('DEC 2024 VALIDATION — Root Cause Analysis');
  console.log('='.repeat(70));

  // ── 1. Current formula — site breakdown ──────────────────────────────
  const expRes = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  console.log('\n--- 1. Current Formula (Exported To GL, excl %-R) by Site ---');
  console.log('Site    | Invoices | Net (Cr) ');
  console.log('-'.repeat(35));
  let expTotal = 0;
  for (const r of expRes.rows) {
    expTotal += parseFloat(r.net_cr);
    console.log(`${r.site.padEnd(8)}| ${String(r.invoices).padEnd(9)}| ${r.net_cr}`);
  }
  console.log('-'.repeat(35));
  console.log(`TOTAL   |          | ${expTotal.toFixed(4)} Cr`);
  console.log(`CRD REF |          | ${CRD} Cr`);
  console.log(`GAP     |          | ${(expTotal - CRD).toFixed(4)} Cr = ₹${Math.abs(Math.round((expTotal-CRD)*1e7)).toLocaleString('en-IN')}`);

  // ── 2. All statuses breakdown ────────────────────────────────────────
  const statusRes = await db.query(`
    SELECT "Status_" AS status,
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Status_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_", "Status_"
    ) sub
    GROUP BY status ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  console.log('\n--- 2. All Status Breakdown (domestic, excl %-R, type!=0) ---');
  for (const r of statusRes.rows) {
    const cumul = (expTotal + parseFloat(r.net_cr)).toFixed(4);
    const note  = r.status === 'Exported To GL' ? '' : ` → if added: ${cumul} Cr (diff=${(parseFloat(cumul)-CRD).toFixed(4)})`;
    console.log(`  "${r.status}": ${r.invoices} inv | ${r.net_cr} Cr${note}`);
  }

  // ── 3. Multi-status invoices (KEY CHECK for Dec) ─────────────────────
  const multiRes = await db.query(`
    SELECT "Invoice_No_", "Site_", "Invoice_Type_",
      ARRAY_AGG(DISTINCT "Status_" ORDER BY "Status_") AS statuses,
      COUNT(*) AS total_rows,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Invoice_Type_" != '0'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    HAVING COUNT(DISTINCT "Status_") > 1
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  console.log(`\n--- 3. INVOICES WITH MULTIPLE STATUSES IN DB (Dec 2024): ${multiRes.rows.length} ---`);
  let multiTotal = 0; let expRevertedTotal = 0; let expRevertedCount = 0;
  for (const r of multiRes.rows) {
    const sts = r.statuses;
    const hasExp = sts.includes('Exported To GL');
    const hasRev = sts.includes('Reverted');
    const hasApp = sts.includes('Approved');
    const flag = hasExp && hasRev ? '← Exp→Reverted' : hasExp && hasApp ? '← Exp+Approved' : '';
    console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r['Site_']} | ${r['Invoice_Type_'].padEnd(22)} | [${sts.join('+')}] | rows=${r.total_rows} | ${r.net_cr} Cr  ${flag}`);
    multiTotal += parseFloat(r.net_cr);
    if (hasExp && hasRev) { expRevertedTotal += parseFloat(r.net_cr); expRevertedCount++; }
  }
  if (multiRes.rows.length > 0) {
    console.log(`  Multi-status total: ${multiTotal.toFixed(4)} Cr`);
    if (expRevertedCount > 0) console.log(`  Exported→Reverted: ${expRevertedCount} inv | ${expRevertedTotal.toFixed(4)} Cr`);
  }

  // ── 4. Approved invoices detail (timing candidates) ──────────────────
  const appRes = await db.query(`
    SELECT "Invoice_No_", "Site_", "Invoice_Type_",
      ARRAY_AGG(DISTINCT "Status_") AS statuses,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Invoice_Type_" != '0'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    HAVING ARRAY_AGG(DISTINCT "Status_") @> ARRAY['Approved']
       AND NOT (ARRAY_AGG(DISTINCT "Status_") @> ARRAY['Exported To GL'])
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  console.log(`\n--- 4. APPROVED-ONLY INVOICES (never Exported in our DB): ${appRes.rows.length} inv ---`);
  let appTotal = 0;
  for (const r of appRes.rows) {
    appTotal += parseFloat(r.net_cr);
    console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r['Site_']} | ${r['Invoice_Type_'].padEnd(22)} | ${r.net_cr} Cr`);
  }
  console.log(`  Approved-only total: ${appTotal.toFixed(4)} Cr`);
  console.log(`  If included: ${(expTotal + appTotal).toFixed(4)} Cr | diff from CRD: ${(expTotal + appTotal - CRD).toFixed(4)} Cr`);

  // ── 5. Reverted invoices ──────────────────────────────────────────────
  const revRes = await db.query(`
    SELECT "Invoice_No_", "Site_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Invoice_Type_" != '0'
      AND "Status_" = 'Reverted'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    ORDER BY net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  const reverted = revRes.rows.map(r => ({ inv: r['Invoice_No_'], site: r['Site_'], type: r['Invoice_Type_'], net: parseFloat(r.net_cr) }));
  const revTotal = reverted.reduce((a,b)=>a+b.net, 0);
  console.log(`\n--- 5. REVERTED INVOICES (${reverted.length} inv | ${revTotal.toFixed(4)} Cr) ---`);
  for (const r of reverted) console.log(`  ${r.inv.padEnd(25)} | ${r.site} | ${r.type.padEnd(22)} | ${r.net.toFixed(6)} Cr`);

  // ── 6. Partitions for Dec 2024 ───────────────────────────────────────
  const partRes = await db.query(`
    SELECT "src_table",
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ARRAY_AGG(DISTINCT "Status_") AS statuses_seen,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_No_" NOT LIKE '%-R'
      AND "Invoice_Type_" != '0'
    GROUP BY "src_table" ORDER BY "src_table"
  `, [DATE_FROM, DATE_TO]);

  console.log('\n--- 6. SOURCE PARTITIONS (Dec 2024) ---');
  for (const r of partRes.rows) {
    console.log(`  ${r.src_table}: ${r.invoices} inv | statuses=[${r.statuses_seen.join(',')}] | net=${r.net_cr} Cr`);
  }

  // Exported To GL per partition
  const partExpRes = await db.query(`
    SELECT "src_table",
      COUNT(DISTINCT "Invoice_No_") AS invoices,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "src_table",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Invoice_No_" NOT LIKE '%-R'
        AND "Invoice_Type_" != '0'
        AND "Status_" = 'Exported To GL'
      GROUP BY "Invoice_No_", "src_table"
    ) sub
    GROUP BY "src_table" ORDER BY "src_table"
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Exported To GL per partition:');
  for (const r of partExpRes.rows) {
    const diff = (parseFloat(r.net_cr) - CRD).toFixed(4);
    const mark = Math.abs(parseFloat(r.net_cr) - CRD) < 0.02 ? ' ← MATCHES CRD' : '';
    console.log(`  ${r.src_table}: ${r.invoices} inv | ${r.net_cr} Cr | diff=${diff}${mark}`);
  }

  // ── 7. Find exact reverted invoices that fill the gap ────────────────
  const GAP_AMT = (CRD - expTotal) * 1e7;
  console.log(`\n--- 7. FINDING REVERTED INVOICES THAT FILL THE GAP (${(GAP_AMT/1e7).toFixed(4)} Cr = ₹${Math.round(GAP_AMT).toLocaleString('en-IN')}) ---`);

  // Sort by closeness to gap
  const sorted = [...reverted].sort((a,b) => Math.abs(a.net*1e7 - GAP_AMT) - Math.abs(b.net*1e7 - GAP_AMT));
  console.log('\n  Single invoice closest to gap:');
  for (const r of sorted.slice(0,5)) {
    const newTot = expTotal + r.net;
    const diff   = (newTot - CRD).toFixed(4);
    const match  = Math.abs(newTot - CRD) < 0.005 ? '✓ EXACT MATCH' : '';
    console.log(`    ${r.inv.padEnd(25)} | ${r.site} | ${r.net.toFixed(6)} Cr | total=${newTot.toFixed(4)} | diff=${diff} ${match}`);
  }

  // Two-invoice combos
  const combos = [];
  for (let i=0; i<reverted.length; i++) {
    for (let j=i+1; j<reverted.length; j++) {
      const sum = reverted[i].net + reverted[j].net;
      if (Math.abs(sum*1e7 - GAP_AMT) < 50000) {
        combos.push({ a: reverted[i], b: reverted[j], sum, diff: Math.abs(sum*1e7 - GAP_AMT) });
      }
    }
  }
  combos.sort((a,b)=>a.diff-b.diff);
  if (combos.length > 0) {
    console.log('\n  Two-invoice combos closest to gap:');
    for (const c of combos.slice(0,5)) {
      const newTot = (expTotal + c.sum).toFixed(4);
      const diff   = (parseFloat(newTot) - CRD).toFixed(4);
      const match  = Math.abs(parseFloat(newTot) - CRD) < 0.005 ? '✓ EXACT MATCH' : '';
      console.log(`    ${c.a.inv} + ${c.b.inv}`);
      console.log(`    ${(c.a.net).toFixed(6)} + ${(c.b.net).toFixed(6)} = ${c.sum.toFixed(6)} Cr | total=${newTot} | diff=${diff} ${match}`);
    }
  }

  // Also try Approved invoices as the source of gap
  console.log('\n--- 8. APPROVED INVOICES AS TIMING SOURCE ---');
  const appSorted = [...appRes.rows].sort((a,b)=>Math.abs(parseFloat(a.net_cr)*1e7-GAP_AMT)-Math.abs(parseFloat(b.net_cr)*1e7-GAP_AMT));
  console.log(`  Single approved invoice closest to gap:`);
  for (const r of appSorted.slice(0,5)) {
    const v      = parseFloat(r.net_cr);
    const newTot = (expTotal + v).toFixed(4);
    const diff   = (parseFloat(newTot)-CRD).toFixed(4);
    const match  = Math.abs(parseFloat(newTot)-CRD)<0.005 ? '✓ EXACT MATCH' : '';
    console.log(`    ${r['Invoice_No_'].padEnd(25)} | ${r['Site_']} | ${r.net_cr} Cr | total=${newTot} | diff=${diff} ${match}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Current formula : ${expTotal.toFixed(4)} Cr`);
  console.log(`CRD Reference   : ${CRD} Cr`);
  console.log(`Gap             : ${(expTotal-CRD).toFixed(4)} Cr = ₹${Math.abs(Math.round((expTotal-CRD)*1e7)).toLocaleString('en-IN')}`);
  console.log(`Reverted pool   : ${reverted.length} inv | ${revTotal.toFixed(4)} Cr`);
  console.log(`Approved pool   : ${appRes.rows.length} inv | ${appTotal.toFixed(4)} Cr`);
  console.log(`Multi-status    : ${multiRes.rows.length} invoices`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
