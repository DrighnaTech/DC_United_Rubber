'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // Per-site gaps as told by user (CRD per-site values)
  const SITE_GAPS = {
    URIMH: 0.01,   // URIMH is 0.01 Cr short
    URIMP: 0.06,   // URIMP is 0.06 Cr short
    URIPB: 0,
    URIPU: 0,
  };

  // Current DB exported values per site
  const SITE_DB = {
    URIMH: 8.8843,
    URIMP: 3.3410,
    URIPB: 0.3492,
    URIPU: 1.5751,
  };

  console.log('='.repeat(80));
  console.log('DEC 2024 — PER-SITE GAP ROOT CAUSE');
  console.log('='.repeat(80));
  console.log('\nSite    | DB (Cr)  | Gap (Cr) | CRD est. (Cr)');
  console.log('-'.repeat(50));
  for (const [site, gap] of Object.entries(SITE_GAPS)) {
    const db_v = SITE_DB[site];
    console.log(`${site.padEnd(8)}| ${db_v.toFixed(4).padEnd(9)}| ${gap.toFixed(4).padEnd(9)}| ${(db_v + gap).toFixed(4)}`);
  }

  // ── For each problem site, find ALL non-Exported invoices ─────────────
  for (const site of ['URIMH', 'URIMP']) {
    const gap    = SITE_GAPS[site];
    const gapAmt = gap * 1e7;

    console.log('\n' + '='.repeat(80));
    console.log(`SITE: ${site}  |  DB = ${SITE_DB[site]} Cr  |  Gap needed = ${gap} Cr = ₹${Math.round(gapAmt).toLocaleString('en-IN')}`);
    console.log('='.repeat(80));

    // All non-Exported invoices for this site in Dec 2024
    const nonExpRes = await db.query(`
      SELECT "Invoice_No_", "Invoice_Type_", "Status_",
        ARRAY_AGG(DISTINCT "Status_") AS all_statuses,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = $1
        AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
        AND "Status_" != '0'
        AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_No_", "Invoice_Type_", "Status_"
      HAVING NOT (ARRAY_AGG(DISTINCT "Status_") @> ARRAY['Exported To GL'])
      ORDER BY net_cr DESC
    `, [site, DATE_FROM, DATE_TO]);

    const pool = nonExpRes.rows.map(r => ({
      inv:    r['Invoice_No_'],
      type:   r['Invoice_Type_'],
      status: r['Status_'],
      net:    parseFloat(r.net_cr)
    }));

    // Group by status
    const byStatus = {};
    for (const p of pool) {
      if (!byStatus[p.status]) byStatus[p.status] = { count: 0, total: 0, items: [] };
      byStatus[p.status].count++;
      byStatus[p.status].total += p.net;
      byStatus[p.status].items.push(p);
    }

    console.log(`\nAll non-Exported invoices for ${site}:`);
    for (const [st, v] of Object.entries(byStatus)) {
      console.log(`  "${st}": ${v.count} inv | ${v.total.toFixed(4)} Cr`);
    }

    // ── Single invoice exact match ──────────────────────────────────────
    console.log(`\n  --- Single invoice matching gap (${gap} Cr) ---`);
    const sorted = [...pool].sort((a,b) => Math.abs(a.net*1e7 - gapAmt) - Math.abs(b.net*1e7 - gapAmt));
    for (const r of sorted.slice(0, 8)) {
      const newTotal = SITE_DB[site] + r.net;
      const diff     = (r.net*1e7 - gapAmt).toFixed(0);
      const match    = Math.abs(r.net - gap) < 0.005 ? '✓ MATCH' : '';
      console.log(`  ${r.inv.padEnd(25)} | ${r.status.padEnd(15)} | ${r.type.padEnd(22)} | ${r.net.toFixed(6)} Cr | diff=₹${diff} ${match}`);
    }

    // ── Two-invoice combos ──────────────────────────────────────────────
    console.log(`\n  --- Two-invoice combos matching gap ---`);
    const combos = [];
    for (let i = 0; i < pool.length; i++) {
      for (let j = i+1; j < pool.length; j++) {
        const sum  = pool[i].net + pool[j].net;
        const diff = Math.abs(sum*1e7 - gapAmt);
        if (diff < 30000) combos.push({ a: pool[i], b: pool[j], sum, diff });
      }
    }
    combos.sort((a,b) => a.diff - b.diff);
    for (const c of combos.slice(0, 6)) {
      const match = Math.abs(c.sum - gap) < 0.005 ? '✓ MATCH' : (Math.abs(c.sum - gap) < 0.01 ? '~ close' : '');
      console.log(`  [${c.a.inv} (${c.a.status})] + [${c.b.inv} (${c.b.status})]`);
      console.log(`   ${c.a.net.toFixed(6)} + ${c.b.net.toFixed(6)} = ${c.sum.toFixed(6)} Cr | diff=₹${c.diff.toFixed(0)} ${match}`);
    }

    // ── Invoice type breakdown of the gap ──────────────────────────────
    console.log(`\n  --- By invoice type ---`);
    const byType = {};
    for (const p of pool) {
      if (!byType[p.type]) byType[p.type] = { count: 0, total: 0 };
      byType[p.type].count++;
      byType[p.type].total += p.net;
    }
    for (const [t, v] of Object.entries(byType)) {
      const mark = Math.abs(v.total - gap) < 0.01 ? ' ← matches gap!' : '';
      console.log(`    "${t}": ${v.count} inv | ${v.total.toFixed(4)} Cr${mark}`);
    }

    // ── Check if Reverted invoices alone explain the gap ───────────────
    const reverted = pool.filter(p => p.status === 'Reverted');
    const revTotal = reverted.reduce((a,b)=>a+b.net,0);
    console.log(`\n  Reverted only: ${reverted.length} inv | ${revTotal.toFixed(4)} Cr | diff from gap: ${(revTotal - gap).toFixed(4)} Cr`);

    // ── Per-partition check for this site ──────────────────────────────
    const partRes = await db.query(`
      SELECT "src_table",
        COUNT(DISTINCT "Invoice_No_") AS inv_exp,
        ROUND(SUM(sub.net)/1e7, 4) AS net_cr
      FROM (
        SELECT "Invoice_No_", "src_table",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
        GROUP BY "Invoice_No_", "src_table"
      ) sub
      GROUP BY "src_table" ORDER BY "src_table"
    `, [site, DATE_FROM, DATE_TO]);

    console.log(`\n  Exported To GL per partition (${site}):`);
    for (const r of partRes.rows) {
      console.log(`    ${r.src_table}: ${r.inv_exp} inv | ${r.net_cr} Cr`);
    }
  }

  // ── Summary with proposed solution ─────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('ROOT CAUSE SUMMARY & SOLUTION');
  console.log('='.repeat(80));

  // Precise per-site query for Reverted invoices
  for (const site of ['URIMH', 'URIMP']) {
    const revRes = await db.query(`
      SELECT "Invoice_Type_",
        COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Reverted'
        AND "Site_" = $1
        AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
        AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_Type_" ORDER BY net_cr DESC
    `, [site, DATE_FROM, DATE_TO]);

    const appRes = await db.query(`
      SELECT "Invoice_Type_",
        COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS net_cr
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Approved'
        AND "Site_" = $1
        AND "Invoice_Date_(Date)" BETWEEN $2 AND $3
        AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_Type_" ORDER BY net_cr DESC
    `, [site, DATE_FROM, DATE_TO]);

    console.log(`\n${site}:`);
    console.log(`  DB Exported: ${SITE_DB[site]} Cr | Gap: ${SITE_GAPS[site]} Cr`);
    console.log(`  Reverted by type:`);
    for (const r of revRes.rows) console.log(`    "${r['Invoice_Type_']}": ${r.inv} inv | ${r.net_cr} Cr`);
    console.log(`  Approved by type:`);
    for (const r of appRes.rows) console.log(`    "${r['Invoice_Type_']}": ${r.inv} inv | ${r.net_cr} Cr`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
