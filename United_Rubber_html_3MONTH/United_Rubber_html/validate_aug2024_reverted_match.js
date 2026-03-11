'use strict';
const db = require('./db/connection');

(async () => {
  const CRD       = 14.79;
  const EXPORTED  = 14.7759; // our current formula result
  const GAP       = CRD - EXPORTED; // 0.0141 Cr needed from reverted pool

  console.log(`CRD Target    : ${CRD} Cr`);
  console.log(`Exported Total: ${EXPORTED} Cr`);
  console.log(`Gap to fill   : ${GAP.toFixed(4)} Cr = ₹${Math.round(GAP * 1e7).toLocaleString('en-IN')}`);

  // Get all reverted invoices with exact amounts
  const revRes = await db.query(`
    SELECT "Invoice_No_", "Site_", "Invoice_Type_",
      SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Reverted'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN '2024-08-01' AND '2024-08-31'
    GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    ORDER BY net DESC
  `);

  const reverted = revRes.rows.map(r => ({
    inv:  r['Invoice_No_'],
    site: r['Site_'],
    type: r['Invoice_Type_'],
    net:  parseFloat(r.net)
  }));

  const gapAmt = GAP * 1e7; // in Rs

  console.log(`\nTotal reverted invoices: ${reverted.length}`);
  console.log(`Total reverted pool    : ${(reverted.reduce((a,b)=>a+b.net,0)/1e7).toFixed(4)} Cr`);

  // ── 1. Find single-invoice exact/closest match ─────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('1. SINGLE INVOICE — closest match to gap (0.0141 Cr)');
  console.log('='.repeat(70));

  const sorted = [...reverted].sort((a,b) => Math.abs(a.net - gapAmt) - Math.abs(b.net - gapAmt));
  for (const r of sorted.slice(0, 10)) {
    const diff    = (r.net - gapAmt).toFixed(0);
    const newTot  = (EXPORTED + r.net/1e7).toFixed(4);
    const match   = Math.abs(r.net/1e7 + EXPORTED - CRD) < 0.005 ? '✓ MATCHES CRD' : '';
    console.log(`  ${r.inv.padEnd(25)} | ${r.site} | ${(r.net/1e7).toFixed(6)} Cr | newTotal=${newTot} | diff=${diff} Rs ${match}`);
  }

  // ── 2. Find 2-invoice combinations closest to gap ─────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('2. TWO-INVOICE COMBINATIONS — closest to gap');
  console.log('='.repeat(70));

  const combos2 = [];
  for (let i = 0; i < reverted.length; i++) {
    for (let j = i+1; j < reverted.length; j++) {
      const sum  = reverted[i].net + reverted[j].net;
      const diff = Math.abs(sum - gapAmt);
      if (diff < 50000) { // within ₹50,000 of gap
        combos2.push({ invs: [reverted[i], reverted[j]], sum, diff });
      }
    }
  }
  combos2.sort((a,b) => a.diff - b.diff);
  for (const c of combos2.slice(0, 8)) {
    const newTot = (EXPORTED + c.sum/1e7).toFixed(4);
    const match  = Math.abs(c.sum/1e7 + EXPORTED - CRD) < 0.005 ? '✓ MATCHES CRD' : '';
    console.log(`  [${c.invs[0].inv} + ${c.invs[1].inv}]`);
    console.log(`   ${c.invs[0].site} ${(c.invs[0].net/1e7).toFixed(6)} Cr + ${c.invs[1].site} ${(c.invs[1].net/1e7).toFixed(6)} Cr = ${(c.sum/1e7).toFixed(6)} Cr | newTotal=${newTot} | diff=${c.diff.toFixed(0)} Rs ${match}`);
  }

  // ── 3. Cumulative — add reverted one by one until we cross CRD ────────
  console.log('\n' + '='.repeat(70));
  console.log('3. CUMULATIVE ADD — reverted invoices sorted by amount DESC');
  console.log('='.repeat(70));
  console.log(`${'Invoice'.padEnd(25)} | ${'Site'.padEnd(6)} | ${'Rev Amt Cr'.padEnd(12)} | ${'Running Total'.padEnd(14)} | vs CRD`);
  console.log('-'.repeat(75));

  let running = EXPORTED;
  let crossed = false;
  for (const r of reverted) {
    running += r.net / 1e7;
    const diff  = (running - CRD).toFixed(4);
    const mark  = Math.abs(running - CRD) < 0.005 ? '✓ MATCH' :
                  (running > CRD && !crossed)      ? '← CROSSED' : '';
    if (running > CRD && !crossed) crossed = true;
    if (Math.abs(running - CRD) < 0.02 || mark) {
      console.log(`${r.inv.padEnd(25)} | ${r.site.padEnd(6)} | ${(r.net/1e7).toFixed(6).padEnd(12)} | ${running.toFixed(4).padEnd(14)} | ${diff}  ${mark}`);
    }
  }

  // ── 4. Show what happens if ONLY Reverted invoices from URIMH are added ─
  console.log('\n' + '='.repeat(70));
  console.log('4. URIMH REVERTED ONLY — cumulative closest approach');
  console.log('='.repeat(70));
  const urimhRev = reverted.filter(r => r.site === 'URIMH').sort((a,b)=>a.net-b.net);
  let best = { diff: Infinity, combo: [], total: 0 };
  // Try all subsets up to 3 invoices from URIMH
  for (let i = 0; i < urimhRev.length; i++) {
    const s1 = urimhRev[i].net;
    const t1 = EXPORTED + s1/1e7;
    const d1 = Math.abs(t1 - CRD);
    if (d1 < best.diff) best = { diff: d1, combo: [urimhRev[i]], total: t1 };
    for (let j = i+1; j < urimhRev.length; j++) {
      const s2 = s1 + urimhRev[j].net;
      const t2 = EXPORTED + s2/1e7;
      const d2 = Math.abs(t2 - CRD);
      if (d2 < best.diff) best = { diff: d2, combo: [urimhRev[i], urimhRev[j]], total: t2 };
    }
  }
  console.log(`Best URIMH reverted combo to reach CRD:`);
  for (const r of best.combo) console.log(`  + ${r.inv} | ${(r.net/1e7).toFixed(6)} Cr`);
  console.log(`  Running total: ${best.total.toFixed(4)} Cr | diff from CRD: ${(best.total - CRD).toFixed(4)} Cr`);

  // ── 5. Final answer ───────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('ROOT CAUSE SUMMARY');
  console.log('='.repeat(70));
  console.log(`Exported To GL (current)  : ${EXPORTED} Cr`);
  console.log(`CRD Reference             : ${CRD} Cr`);
  console.log(`Gap                       : ${GAP.toFixed(4)} Cr = ₹${Math.round(gapAmt).toLocaleString('en-IN')}`);
  console.log(`\nClosest single reverted invoice:`);
  const closest = sorted[0];
  console.log(`  ${closest.inv} | ${closest.site} | ${closest.type}`);
  console.log(`  Amount: ${(closest.net/1e7).toFixed(6)} Cr = ₹${Math.round(closest.net).toLocaleString('en-IN')}`);
  console.log(`  If included: total = ${(EXPORTED + closest.net/1e7).toFixed(4)} Cr | diff from CRD = ${(EXPORTED + closest.net/1e7 - CRD).toFixed(4)} Cr`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
