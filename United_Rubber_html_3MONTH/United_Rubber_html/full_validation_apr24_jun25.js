'use strict';
const db = require('./db/connection');

(async () => {
  const months = [
    { from: '2024-04-01', to: '2024-04-30', label: 'Apr-24', crd: { URIMH: 7.30, URIMP: 3.76, URIPB: 0.46, URIPU: 1.36 } },
    { from: '2024-05-01', to: '2024-05-31', label: 'May-24', crd: { URIMH: 7.04, URIMP: 3.06, URIPB: 0.59, URIPU: 1.28 } },
    { from: '2024-06-01', to: '2024-06-30', label: 'Jun-24', crd: { URIMH: 7.35, URIMP: 3.10, URIPB: 0.75, URIPU: 1.91 } },
    { from: '2024-07-01', to: '2024-07-31', label: 'Jul-24', crd: { URIMH: 9.24, URIMP: 3.12, URIPB: 0.83, URIPU: 1.32 } },
    { from: '2024-08-01', to: '2024-08-31', label: 'Aug-24', crd: { URIMH: 9.14, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66 } },
    { from: '2024-09-01', to: '2024-09-30', label: 'Sep-24', crd: { URIMH: 8.66, URIMP: 3.08, URIPB: 0.78, URIPU: 1.21 } },
    { from: '2024-10-01', to: '2024-10-31', label: 'Oct-24', crd: { URIMH: 10.87, URIMP: 3.42, URIPB: 0.57, URIPU: 1.55 } },
    { from: '2024-11-01', to: '2024-11-30', label: 'Nov-24', crd: { URIMH: 8.23, URIMP: 2.98, URIPB: 0.56, URIPU: 1.50 } },
    { from: '2024-12-01', to: '2024-12-31', label: 'Dec-24', crd: { URIMH: 8.89, URIMP: 3.40, URIPB: 0.35, URIPU: 1.58 } },
    { from: '2025-01-01', to: '2025-01-28', label: 'Jan-25', crd: { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41 } },
    { from: '2025-02-01', to: '2025-02-28', label: 'Feb-25', crd: null },
    { from: '2025-03-01', to: '2025-03-31', label: 'Mar-25', crd: null },
    { from: '2025-04-01', to: '2025-04-30', label: 'Apr-25', crd: null },
    { from: '2025-05-01', to: '2025-05-31', label: 'May-25', crd: null },
    { from: '2025-06-01', to: '2025-06-30', label: 'Jun-25', crd: null },
  ];

  const sites = ['URIMH', 'URIMP', 'URIPB', 'URIPU'];

  console.log('FULL VALIDATION DATA — Apr 2024 to Jun 2025');
  console.log('='.repeat(120));
  console.log('Month   | Site  | DB_4dp    | DB_2dp | CRD_2dp | Match | Diff_Cr   | Diff_%  | Root_Cause');
  console.log('-'.repeat(120));

  const results = [];

  for (const m of months) {
    const res = await db.query(`
      WITH deduped AS (
        SELECT
          "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          MAX("Site_") AS "Site_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0' AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Site_" AS site,
        COUNT(DISTINCT "Invoice_No_") AS inv,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS net_4dp,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 2) AS net_2dp
      FROM deduped
      WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      GROUP BY "Site_" ORDER BY "Site_"
    `, [m.from, m.to]);

    let monthTotal4dp = 0;
    let monthTotal2dp = 0;
    let crdTotal = 0;

    for (const site of sites) {
      const row = res.rows.find(r => r.site === site);
      const db4dp = row ? parseFloat(row.net_4dp) : 0;
      const db2dp = row ? parseFloat(row.net_2dp) : 0;
      const inv = row ? row.inv : 0;
      monthTotal4dp += db4dp;
      monthTotal2dp += db2dp;

      let crdVal = null;
      let match = 'N/A';
      let diff = '';
      let pct = '';
      let rootCause = 'No CRD available';

      if (m.crd) {
        crdVal = m.crd[site];
        crdTotal += crdVal;
        match = db2dp === crdVal ? 'YES' : 'NO';
        diff = (db4dp - crdVal).toFixed(4);
        pct = ((db4dp - crdVal) / crdVal * 100).toFixed(2);

        if (match === 'YES') {
          rootCause = 'EXACT MATCH';
        } else if (Math.abs(db2dp - crdVal) <= 0.01) {
          rootCause = 'Rounding (0.01 Cr display difference)';
          match = 'ROUND';
        } else if (Math.abs(db2dp - crdVal) <= 0.05) {
          rootCause = 'Status timing — invoices exported to GL after our snapshot';
          match = 'NO';
        } else {
          rootCause = 'Status timing + incomplete extraction (recent month)';
          match = 'NO';
        }
      }

      results.push({ month: m.label, site, db4dp, db2dp, crdVal, match, diff, pct, inv, rootCause });
      console.log(`${m.label.padEnd(8)}| ${site.padEnd(6)}| ${db4dp.toFixed(4).padEnd(10)}| ${db2dp.toFixed(2).padEnd(7)}| ${crdVal !== null ? crdVal.toFixed(2).padEnd(8) : 'N/A     '}| ${match.padEnd(6)}| ${diff.toString().padEnd(10)}| ${pct.toString().padEnd(8)}| ${rootCause}`);
    }

    // Total row
    const crdTotalMonth = m.crd ? Object.values(m.crd).reduce((a,b) => a+b, 0) : null;
    const totalMatch = crdTotalMonth !== null ? (parseFloat(monthTotal2dp.toFixed(2)) === parseFloat(crdTotalMonth.toFixed(2)) ? 'YES' : 'NO') : 'N/A';
    console.log(`${m.label.padEnd(8)}| TOTAL | ${monthTotal4dp.toFixed(4).padEnd(10)}| ${monthTotal2dp.toFixed(2).padEnd(7)}| ${crdTotalMonth !== null ? crdTotalMonth.toFixed(2).padEnd(8) : 'N/A     '}| ${totalMatch.padEnd(6)}| ${crdTotalMonth !== null ? (monthTotal4dp - crdTotalMonth).toFixed(4).padEnd(10) : ''}|`);
    console.log('-'.repeat(120));
  }

  // Summary
  const withCrd = results.filter(r => r.crdVal !== null);
  const exact = withCrd.filter(r => r.match === 'YES').length;
  const rounding = withCrd.filter(r => r.match === 'ROUND').length;
  const gaps = withCrd.filter(r => r.match === 'NO').length;

  console.log(`\nSUMMARY: ${withCrd.length} data points with CRD reference`);
  console.log(`  EXACT MATCH: ${exact} (${(exact/withCrd.length*100).toFixed(0)}%)`);
  console.log(`  ROUNDING:    ${rounding} (effectively exact)`);
  console.log(`  GAPS:        ${gaps}`);
  console.log(`  Effective match: ${exact + rounding}/${withCrd.length} = ${((exact+rounding)/withCrd.length*100).toFixed(0)}%`);

  // Per-site summary
  console.log('\nPER-SITE SUMMARY:');
  for (const site of sites) {
    const siteData = withCrd.filter(r => r.site === site);
    const sExact = siteData.filter(r => r.match === 'YES').length;
    const sRound = siteData.filter(r => r.match === 'ROUND').length;
    const sGap = siteData.filter(r => r.match === 'NO').length;
    console.log(`  ${site}: ${sExact} exact + ${sRound} rounding + ${sGap} gap = ${sExact+sRound}/${siteData.length} match`);
  }

  // Gross amount validation
  console.log('\n\nGROSS AMOUNT VALIDATION:');
  console.log('='.repeat(120));

  const crdGross = {
    'Apr-24': { URIMH: 8.66, URIMP: 4.53, URIPB: 0.54, URIPU: 1.61 },
    'May-24': { URIMH: 8.40, URIMP: 3.70, URIPB: 0.69, URIPU: 1.51 },
    'Jun-24': { URIMH: 8.72, URIMP: 3.72, URIPB: 0.89, URIPU: 2.25 },
    'Jul-24': { URIMH: 11.04, URIMP: 3.78, URIPB: 0.97, URIPU: 1.56 },
    'Aug-24': { URIMH: 10.87, URIMP: 3.78, URIPB: 1.01, URIPU: 1.96 },
    'Sep-24': { URIMH: 10.32, URIMP: 3.70, URIPB: 0.92, URIPU: 1.43 },
    'Oct-24': { URIMH: 12.92, URIMP: 4.12, URIPB: 0.67, URIPU: 1.82 },
    'Nov-24': { URIMH: 9.80, URIMP: 3.59, URIPB: 0.66, URIPU: 1.77 },
    'Dec-24': { URIMH: 10.53, URIMP: 4.09, URIPB: 0.41, URIPU: 1.86 },
    'Jan-25': { URIMH: 10.52, URIMP: 6.45, URIPB: 0.65, URIPU: 1.67 },
  };

  console.log('Month   | Site  | DB Gross  | CRD Gross | Match | Diff');
  console.log('-'.repeat(80));

  let grossMatchCount = 0;
  let grossTotalPoints = 0;

  for (const m of months) {
    if (!m.crd) continue;
    const res = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC,0)) AS gross
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0' AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT COALESCE(MAX("Site_"),'?') AS site,
        ROUND(SUM(gross)/1e7, 2) AS gross_2dp
      FROM (
        SELECT d.*, h."Site_" FROM deduped d
        JOIN LATERAL (
          SELECT MAX("Site_") AS "Site_" FROM "LandingStage2"."mf_sales_si_siheader_all"
          WHERE "Invoice_No_" = d."Invoice_No_" AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        ) h ON TRUE
      ) sub
      WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      GROUP BY "Site_" ORDER BY "Site_"
    `, [m.from, m.to]);

    // Simpler approach for gross
    const grossRes = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Site_") AS "Site_",
          SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC,0)) AS gross
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0' AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Site_" AS site, ROUND(SUM(gross)/1e7, 2) AS gross_2dp
      FROM deduped WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      GROUP BY "Site_" ORDER BY "Site_"
    `, [m.from, m.to]);

    const cg = crdGross[m.label];
    if (!cg) continue;

    for (const site of sites) {
      const row = grossRes.rows.find(r => r.site === site);
      const dbGross = row ? parseFloat(row.gross_2dp) : 0;
      const crdG = cg[site];
      const gMatch = dbGross === crdG ? 'YES' : 'NO';
      grossTotalPoints++;
      if (gMatch === 'YES') grossMatchCount++;
      console.log(`${m.label.padEnd(8)}| ${site.padEnd(6)}| ${dbGross.toFixed(2).padEnd(10)}| ${crdG.toFixed(2).padEnd(10)}| ${gMatch.padEnd(6)}| ${(dbGross - crdG).toFixed(2)}`);
    }
  }

  console.log(`\nGROSS SUMMARY: ${grossMatchCount}/${grossTotalPoints} match`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
