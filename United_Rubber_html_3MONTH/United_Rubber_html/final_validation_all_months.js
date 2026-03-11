'use strict';
const db = require('./db/connection');

(async () => {
  // EXACT CRD values from email (Jan 29, 2025) — 2 decimal places
  const CRD = {
    'Apr-24': { from: '2024-04-01', to: '2024-04-30', URIMH: 7.30, URIMP: 3.76, URIPB: 0.46, URIPU: 1.36, total: 12.88 },
    'May-24': { from: '2024-05-01', to: '2024-05-31', URIMH: 7.04, URIMP: 3.06, URIPB: 0.59, URIPU: 1.28, total: 11.97 },
    'Jun-24': { from: '2024-06-01', to: '2024-06-30', URIMH: 7.35, URIMP: 3.10, URIPB: 0.75, URIPU: 1.91, total: 13.11 },
    'Jul-24': { from: '2024-07-01', to: '2024-07-31', URIMH: 9.24, URIMP: 3.12, URIPB: 0.83, URIPU: 1.32, total: 14.50 },
    'Aug-24': { from: '2024-08-01', to: '2024-08-31', URIMH: 9.14, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66, total: 14.79 },
    'Sep-24': { from: '2024-09-01', to: '2024-09-30', URIMH: 8.66, URIMP: 3.08, URIPB: 0.78, URIPU: 1.21, total: 13.74 },
    'Oct-24': { from: '2024-10-01', to: '2024-10-31', URIMH: 10.87, URIMP: 3.42, URIPB: 0.57, URIPU: 1.55, total: 16.41 },
    'Nov-24': { from: '2024-11-01', to: '2024-11-30', URIMH: 8.23, URIMP: 2.98, URIPB: 0.56, URIPU: 1.50, total: 13.27 },
    'Dec-24': { from: '2024-12-01', to: '2024-12-31', URIMH: 8.89, URIMP: 3.40, URIPB: 0.35, URIPU: 1.58, total: 14.22 },
    'Jan-25': { from: '2025-01-01', to: '2025-01-28', URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41, total: 16.12 },
  };

  const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];

  console.log('='.repeat(100));
  console.log('FINAL VALIDATION — Dashboard vs CRD (exact email values, 2-decimal)');
  console.log('CRD Source: Email from erp@unitedrubber.net, Jan 29, 2025');
  console.log('Dashboard Method: buildTrendCTE (GROUP BY Invoice_No_ + Invoice_Date_)');
  console.log('Filter: Status_ = Exported To GL, Invoice_No_ NOT LIKE %-R');
  console.log('='.repeat(100));

  let totalMatch = 0;
  let totalMismatch = 0;
  let totalDataPoints = 0;
  const mismatches = [];

  // MASTER TABLE
  console.log('\n  Month  | Site  | DB (4dp)  | DB (2dp) | CRD (2dp) | Match? | Gap (Cr)  | Gap %');
  console.log('  ' + '-'.repeat(90));

  for (const [monthLabel, m] of Object.entries(CRD)) {
    const res = await db.query(`
      WITH deduped AS (
        SELECT
          "Invoice_No_",
          "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          MAX("Site_") AS "Site_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Date_(Date)" >= $1
          AND "Invoice_Date_(Date)" <= $2
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT
        "Site_" AS site,
        COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS net_cr_4dp,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 2) AS net_cr_2dp
      FROM deduped
      WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      GROUP BY "Site_"
      ORDER BY "Site_"
    `, [m.from, m.to]);

    for (const site of sites) {
      const row = res.rows.find(r => r.site === site);
      const db4dp = row ? parseFloat(row.net_cr_4dp) : 0;
      const db2dp = row ? parseFloat(row.net_cr_2dp) : 0;
      const crd2dp = m[site];
      const match = db2dp === crd2dp;
      const gap = (db4dp - crd2dp).toFixed(4);
      const pct = crd2dp > 0 ? ((db4dp - crd2dp) / crd2dp * 100).toFixed(2) : '0';

      totalDataPoints++;
      if (match) {
        totalMatch++;
      } else {
        totalMismatch++;
        mismatches.push({ month: monthLabel, site, db4dp, db2dp, crd2dp, gap: parseFloat(gap), pct: parseFloat(pct), inv: row ? row.inv : 0 });
      }

      const status = match ? '  YES ✓' : '  NO  ✗';
      console.log(`  ${monthLabel.padEnd(7)}| ${site.padEnd(6)}| ${db4dp.toFixed(4).padEnd(10)}| ${db2dp.toFixed(2).padEnd(9)}| ${crd2dp.toFixed(2).padEnd(10)}|${status.padEnd(8)}| ${gap.padEnd(10)}| ${pct}%`);
    }

    // Monthly total
    const dbTotal = res.rows.reduce((s, r) => s + parseFloat(r.net_cr_4dp), 0);
    const crdTotal = m.total;
    const totalMatch2dp = parseFloat(dbTotal.toFixed(2)) === crdTotal;
    console.log(`  ${monthLabel.padEnd(7)}| TOTAL | ${dbTotal.toFixed(4).padEnd(10)}| ${dbTotal.toFixed(2).padEnd(9)}| ${crdTotal.toFixed(2).padEnd(10)}|${totalMatch2dp ? '  YES ✓' : '  NO  ✗'}  | ${(dbTotal - crdTotal).toFixed(4)}`);
    console.log('  ' + '-'.repeat(90));
  }

  console.log(`\n  SUMMARY: ${totalMatch}/${totalDataPoints} data points MATCH at 2-decimal level`);
  console.log(`  Mismatches: ${totalMismatch}`);

  if (mismatches.length > 0) {
    console.log('\n  MISMATCHED DATA POINTS:');
    console.log('  Month  | Site  | DB (4dp)  | DB (2dp) | CRD (2dp) | Gap Cr   | Gap %   | Display Diff');
    console.log('  ' + '-'.repeat(90));
    for (const m of mismatches) {
      const displayDiff = Math.abs(m.db2dp - m.crd2dp).toFixed(2);
      console.log(`  ${m.month.padEnd(7)}| ${m.site.padEnd(6)}| ${m.db4dp.toFixed(4).padEnd(10)}| ${m.db2dp.toFixed(2).padEnd(9)}| ${m.crd2dp.toFixed(2).padEnd(10)}| ${m.gap.toFixed(4).padEnd(9)}| ${m.pct.toFixed(2).padEnd(8)}| ${displayDiff} Cr`);
    }

    // Categorize mismatches
    const rounding = mismatches.filter(m => Math.abs(m.db2dp - m.crd2dp) <= 0.01);
    const small = mismatches.filter(m => Math.abs(m.db2dp - m.crd2dp) > 0.01 && Math.abs(m.db2dp - m.crd2dp) <= 0.05);
    const significant = mismatches.filter(m => Math.abs(m.db2dp - m.crd2dp) > 0.05);

    console.log(`\n  Rounding (diff ≤ 0.01 Cr): ${rounding.length} — ${rounding.map(m => `${m.month}/${m.site}`).join(', ') || 'none'}`);
    console.log(`  Small (0.01-0.05 Cr):      ${small.length} — ${small.map(m => `${m.month}/${m.site}`).join(', ') || 'none'}`);
    console.log(`  Significant (>0.05 Cr):    ${significant.length} — ${significant.map(m => `${m.month}/${m.site}`).join(', ') || 'none'}`);
  }

  // For each mismatch, check if it's the most recent months
  console.log('\n' + '='.repeat(100));
  console.log('MISMATCH PATTERN ANALYSIS');
  console.log('='.repeat(100));

  const monthOrder = ['Apr-24','May-24','Jun-24','Jul-24','Aug-24','Sep-24','Oct-24','Nov-24','Dec-24','Jan-25'];
  for (const site of sites) {
    const siteMismatches = mismatches.filter(m => m.site === site);
    if (siteMismatches.length > 0) {
      console.log(`\n  ${site}: ${siteMismatches.length} mismatches`);
      for (const m of siteMismatches) {
        console.log(`    ${m.month}: DB=${m.db4dp.toFixed(4)}, CRD=${m.crd2dp.toFixed(2)}, gap=${m.gap.toFixed(4)} Cr (${m.pct.toFixed(2)}%)`);
      }
    } else {
      console.log(`\n  ${site}: ALL 10 months MATCH ✓`);
    }
  }

  // DEEP DIVE: For Aug, Dec, Jan mismatches — show non-Exported invoice counts and amounts
  console.log('\n' + '='.repeat(100));
  console.log('DEEP DIVE: Non-Exported invoices for mismatched data points');
  console.log('='.repeat(100));

  for (const m of mismatches) {
    if (!['Aug-24','Dec-24','Jan-25'].some(mo => m.month === mo)) continue;

    const monthData = CRD[m.month];

    // Non-exported breakdown
    const nonExp = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          MAX("Invoice_Type_") AS "Invoice_Type_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" NOT IN ('0','','Exported To GL')
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Status_", COUNT(*) AS cnt,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS cr
      FROM deduped GROUP BY "Status_" ORDER BY cr DESC
    `, [m.site, monthData.from, monthData.to]);

    let allNonExp = 0;
    console.log(`\n  ${m.month} ${m.site} (gap: ${m.gap.toFixed(4)} Cr):`);
    console.log(`    Exported To GL: ${m.db4dp.toFixed(4)} Cr (${m.inv} inv)`);
    for (const r of nonExp.rows) {
      allNonExp += parseFloat(r.cr);
      console.log(`    ${(r['Status_']||'?').padEnd(22)}: ${r.cr} Cr (${r.cnt} inv)`);
    }
    const allTotal = m.db4dp + allNonExp;
    console.log(`    ALL statuses total: ${allTotal.toFixed(4)} Cr`);
    console.log(`    CRD: ${m.crd2dp.toFixed(2)} Cr`);

    if (allTotal >= m.crd2dp) {
      console.log(`    → ALL statuses (${allTotal.toFixed(4)}) >= CRD (${m.crd2dp.toFixed(2)}) → DATA EXISTS, gap is STATUS TIMING`);
      console.log(`    → Some invoices were exported to GL in live ERP after our weekly snapshot`);
    } else {
      console.log(`    → ALL statuses (${allTotal.toFixed(4)}) < CRD (${m.crd2dp.toFixed(2)}) → ${(m.crd2dp - allTotal).toFixed(4)} Cr MISSING from DB`);
      console.log(`    → Invoices not yet extracted into our database at time of weekly snapshot`);
    }
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
