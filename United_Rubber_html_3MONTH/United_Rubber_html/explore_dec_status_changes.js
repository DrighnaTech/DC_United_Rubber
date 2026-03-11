'use strict';
const db = require('./db/connection');

(async () => {
  const weeks = ['2024_dec_w1', '2024_dec_w2', '2024_dec_w3', '2024_dec_w4'];

  console.log('='.repeat(80));
  console.log('URIMP DEC 2024: TRACKING STATUS CHANGES ACROSS WEEKLY SNAPSHOTS');
  console.log('Finding invoices whose status DIFFERS between weekly captures');
  console.log('='.repeat(80));

  // Find all URIMP Dec invoices from each weekly snapshot with their status
  // Then compare

  // Build a combined view
  const allInvStatuses = {};

  for (const w of weeks) {
    const tname = `mf_sales_si_siheader_${w}`;
    const res = await db.query(`
      SELECT "Invoice_No_", MAX("Status_") AS status,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt
      FROM "LandingStage1"."${tname}"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
        AND "Status_" NOT IN ('0','')
      GROUP BY "Invoice_No_"
    `);

    for (const r of res.rows) {
      if (!allInvStatuses[r['Invoice_No_']]) allInvStatuses[r['Invoice_No_']] = {};
      allInvStatuses[r['Invoice_No_']][w] = { status: r.status, amt: parseFloat(r.amt) };
    }
  }

  // Find invoices with STATUS CHANGES across weeks
  const changed = [];
  for (const [inv, weekData] of Object.entries(allInvStatuses)) {
    const statuses = Object.values(weekData).map(d => d.status);
    const unique = [...new Set(statuses)];
    if (unique.length > 1) {
      changed.push({ inv, weekData });
    }
  }

  console.log(`\nTotal URIMP Dec invoices across all weekly snapshots: ${Object.keys(allInvStatuses).length}`);
  console.log(`Invoices with STATUS CHANGES: ${changed.length}`);

  if (changed.length > 0) {
    console.log('\nDETAIL — Invoices that changed status:');
    console.log('Invoice_No_'.padEnd(30) + ' | w1'.padEnd(22) + ' | w2'.padEnd(22) + ' | w3'.padEnd(22) + ' | w4'.padEnd(22) + ' | Amount');
    console.log('-'.repeat(130));

    let totalChangedAmt = 0;
    let exportedThenChanged = 0;

    for (const c of changed) {
      const line = [];
      let wasExported = false;
      let finalNotExported = false;
      let amt = 0;

      for (const w of weeks) {
        const d = c.weekData[w];
        if (d) {
          line.push(d.status.substring(0, 18));
          amt = d.amt;
          if (d.status === 'Exported To GL') wasExported = true;
        } else {
          line.push('-');
        }
      }

      // Check final status (last week that has data)
      for (let i = weeks.length - 1; i >= 0; i--) {
        const d = c.weekData[weeks[i]];
        if (d) {
          finalNotExported = d.status !== 'Exported To GL';
          break;
        }
      }

      const amtCr = (amt / 1e7).toFixed(6);
      totalChangedAmt += amt;

      const marker = wasExported && finalNotExported ? ' ← WAS EXPORTED, NOW NOT!' : '';
      if (wasExported && finalNotExported) exportedThenChanged++;

      console.log(`${c.inv.padEnd(30)} | ${line.map(l => l.padEnd(18)).join(' | ')} | ${amtCr} Cr${marker}`);
    }

    console.log(`\nTotal amount of status-changed invoices: ${(totalChangedAmt/1e7).toFixed(6)} Cr`);
    console.log(`Invoices that were Exported but later changed: ${exportedThenChanged}`);
  }

  // Also check: invoices in ONLY SOME weekly snapshots (not all)
  console.log('\n' + '='.repeat(80));
  console.log('INVOICES APPEARING IN ONLY SOME WEEKLY SNAPSHOTS:');
  console.log('='.repeat(80));

  const partialInv = {};
  for (const [inv, weekData] of Object.entries(allInvStatuses)) {
    const weekCount = Object.keys(weekData).length;
    if (weekCount < 4 && Object.values(weekData).some(d => d.status === 'Exported To GL')) {
      if (!partialInv[weekCount]) partialInv[weekCount] = [];
      partialInv[weekCount].push({ inv, weekData });
    }
  }

  for (const [cnt, invs] of Object.entries(partialInv)) {
    console.log(`\n  Exported invoices appearing in ${cnt} of 4 weekly snapshots: ${invs.length} invoices`);
    // Show which weeks they appear in
    const weekDist = {};
    for (const i of invs) {
      const key = Object.keys(i.weekData).sort().join('+');
      weekDist[key] = (weekDist[key] || 0) + 1;
    }
    for (const [k, v] of Object.entries(weekDist)) {
      console.log(`    ${k}: ${v} invoices`);
    }
  }

  // CRITICAL CHECK: Do the Reverted invoices in w1/w2 appear as Exported in ANY week?
  console.log('\n' + '='.repeat(80));
  console.log('REVERTED INVOICES: Were they ever Exported in any weekly snapshot?');
  console.log('='.repeat(80));

  for (const w of weeks) {
    const tname = `mf_sales_si_siheader_${w}`;
    const reverted = await db.query(`
      SELECT "Invoice_No_", MAX("Status_") AS status,
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt
      FROM "LandingStage1"."${tname}"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
        AND "Status_" = 'Reverted'
      GROUP BY "Invoice_No_"
    `);

    if (reverted.rows.length > 0) {
      console.log(`\n  ${w} — ${reverted.rows.length} Reverted invoices:`);
      for (const r of reverted.rows) {
        // Check this invoice in ALL other weeks
        const inv = r['Invoice_No_'];
        const otherStatuses = [];
        for (const ow of weeks) {
          if (ow === w) continue;
          const otname = `mf_sales_si_siheader_${ow}`;
          const check = await db.query(`
            SELECT MAX("Status_") AS status
            FROM "LandingStage1"."${otname}"
            WHERE "Invoice_No_" = $1 AND "Site_" = 'URIMP'
          `, [inv]);
          otherStatuses.push(`${ow}=${check.rows[0]?.status || 'NOT PRESENT'}`);
        }
        console.log(`    ${inv.padEnd(30)} | ${w}=Reverted | ${otherStatuses.join(' | ')} | ${(parseFloat(r.amt)/1e7).toFixed(6)} Cr`);
      }
    }
  }

  // MAX() alphabetical check: what does MAX pick between Exported/Reverted?
  console.log('\n' + '='.repeat(80));
  console.log('ALPHABETICAL MAX() CHECK:');
  console.log(`  MAX('Exported To GL', 'Reverted') = ?`);
  const maxCheck = await db.query(`SELECT GREATEST('Exported To GL', 'Reverted') AS result`);
  console.log(`  Result: ${maxCheck.rows[0].result}`);
  console.log('  So MAX(Status_) picks Reverted over Exported To GL');
  console.log('  This means: if an invoice appears as Exported in w1 and Reverted in w2,');
  console.log('  the _all table would show it as REVERTED (MAX picks R > E)');
  console.log('='.repeat(80));

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
