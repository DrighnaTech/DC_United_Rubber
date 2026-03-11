'use strict';
const db = require('./db/connection');

(async () => {
  console.log('='.repeat(80));
  console.log('HYPOTHESIS: Invoice_Type_ = 0 filter excluding valid Exported invoices');
  console.log('='.repeat(80));

  // 1. URIMP Dec — Exported To GL invoices WITH Invoice_Type_ = '0'
  console.log('\n--- URIMP Dec 2024: Exported To GL with Invoice_Type_ = 0 ---');
  const typeZero = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT "Invoice_Type_", COUNT(*) AS cnt,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
    FROM deduped
    GROUP BY "Invoice_Type_"
    ORDER BY cr DESC
  `);

  for (const r of typeZero.rows) {
    const mark = r['Invoice_Type_'] === '0' ? ' ← EXCLUDED BY FILTER!' : '';
    console.log(`  Invoice_Type_: ${(r['Invoice_Type_']||'NULL').padEnd(25)} | ${r.cnt} inv | ${r.cr} Cr${mark}`);
  }

  // 2. Without Invoice_Type_ filter — what's the total?
  console.log('\n--- URIMP Dec: Exported WITHOUT Invoice_Type_ != 0 filter ---');
  const noTypeFilter = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" >= '2024-12-01'
        AND "Invoice_Date_(Date)" <= '2024-12-31'
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT COUNT(*) AS cnt, ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
    FROM deduped
  `);

  console.log(`  WITHOUT Invoice_Type_ filter: ${noTypeFilter.rows[0].cnt} inv | ${noTypeFilter.rows[0].cr} Cr`);
  console.log(`  WITH    Invoice_Type_ filter: 1500 inv | 3.340989 Cr (from TrendCTE)`);
  console.log(`  Difference: ${(parseFloat(noTypeFilter.rows[0].cr) - 3.340989).toFixed(6)} Cr`);
  console.log(`  CRD: 3.401000 Cr`);
  console.log(`  Gap WITH filter:    ${(3.340989 - 3.401).toFixed(6)} Cr`);
  console.log(`  Gap WITHOUT filter: ${(parseFloat(noTypeFilter.rows[0].cr) - 3.401).toFixed(6)} Cr`);

  // 3. Also check: Status_ != '0' filter impact
  console.log('\n--- Check: Status_ != 0 filter impact (should be none since we filter = Exported) ---');

  // 4. Check what Invoice_Type_ values look like for Exported invoices
  console.log('\n--- ALL Invoice_Type_ values for URIMP Dec Exported (raw rows) ---');
  const rawTypes = await db.query(`
    SELECT "Invoice_Type_", COUNT(*) AS rows, COUNT(DISTINCT "Invoice_No_") AS inv
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
    GROUP BY "Invoice_Type_"
    ORDER BY rows DESC
  `);

  for (const r of rawTypes.rows) {
    console.log(`  Type: ${(r['Invoice_Type_']||'NULL').padEnd(25)} | ${r.rows} rows | ${r.inv} unique invoices`);
  }

  // 5. The MAX(Invoice_Type_) issue — if an invoice has both '0' and 'Sales (Commercial)' rows
  // MAX() picks 'Sales (Commercial)' which is > '0' alphabetically
  // So Invoice_Type_ = '0' would only appear in deduped if ALL rows for that invoice have '0'
  console.log('\n--- Invoices where ALL raw rows have Invoice_Type_ = 0 ---');
  const allZeroType = await db.query(`
    SELECT "Invoice_No_",
      COUNT(*) AS rows,
      ARRAY_AGG(DISTINCT "Invoice_Type_") AS types,
      SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" >= '2024-12-01'
      AND "Invoice_Date_(Date)" <= '2024-12-31'
    GROUP BY "Invoice_No_"
    HAVING ARRAY_AGG(DISTINCT "Invoice_Type_") = ARRAY['0']
       OR (NOT ('Sales ( Commercial )' = ANY(ARRAY_AGG(DISTINCT "Invoice_Type_")))
           AND NOT ('Sales Return' = ANY(ARRAY_AGG(DISTINCT "Invoice_Type_"))))
  `);

  if (allZeroType.rows.length > 0) {
    let total = 0;
    console.log(`  Found ${allZeroType.rows.length} invoices with only Type=0:`);
    for (const r of allZeroType.rows) {
      total += parseFloat(r.amt);
      console.log(`    ${r['Invoice_No_'].padEnd(30)} | ${r.rows} rows | types: ${r.types.join(', ')} | ${(parseFloat(r.amt)/1e7).toFixed(6)} Cr`);
    }
    console.log(`    Total: ${(total/1e7).toFixed(6)} Cr — THIS IS WHAT'S BEING EXCLUDED`);
    console.log(`    Gap to fill: 0.060011 Cr`);
    console.log(`    Match? ${Math.abs(total/1e7 - 0.060011) < 0.005 ? 'YES! This explains the gap!' : 'No'}`);
  } else {
    console.log('  No invoices have only Type=0 — filter is not the issue');
  }

  // 6. ALL SITES: check same pattern — with vs without Invoice_Type_ filter
  console.log('\n' + '='.repeat(80));
  console.log('ALL SITES Dec 2024: Impact of Invoice_Type_ != 0 filter');
  console.log('='.repeat(80));

  const CRD = { URIMH: 8.8943, URIMP: 3.4010, URIPB: 0.3492, URIPU: 1.5751 };

  for (const site of ['URIMH', 'URIMP', 'URIPB', 'URIPU']) {
    const withFilter = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          MAX("Invoice_Type_") AS "Invoice_Type_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0' AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= '2024-12-01'
          AND "Invoice_Date_(Date)" <= '2024-12-31'
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT COUNT(*) AS cnt, ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr FROM deduped
    `, [site]);

    const withoutFilter = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= '2024-12-01'
          AND "Invoice_Date_(Date)" <= '2024-12-31'
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT COUNT(*) AS cnt, ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr FROM deduped
    `, [site]);

    const wf = parseFloat(withFilter.rows[0].cr || 0);
    const wof = parseFloat(withoutFilter.rows[0].cr || 0);
    const crd = CRD[site];
    const diff = wof - wf;

    console.log(`  ${site}: WITH filter=${wf.toFixed(6)} (${withFilter.rows[0].cnt} inv) | WITHOUT=${wof.toFixed(6)} (${withoutFilter.rows[0].cnt} inv) | diff=${diff.toFixed(6)} | CRD=${crd.toFixed(4)} | gap_with=${(wf-crd).toFixed(6)} | gap_without=${(wof-crd).toFixed(6)}`);
  }

  // 7. Check across ALL months for URIMP — with vs without Invoice_Type filter
  console.log('\n' + '='.repeat(80));
  console.log('URIMP ALL MONTHS: with vs without Invoice_Type_ filter');
  console.log('='.repeat(80));

  const months = [
    { from: '2024-04-01', to: '2024-04-30', label: 'Apr-24', crd: 2.34 },
    { from: '2024-05-01', to: '2024-05-31', label: 'May-24', crd: 2.45 },
    { from: '2024-06-01', to: '2024-06-30', label: 'Jun-24', crd: 2.95 },
    { from: '2024-07-01', to: '2024-07-31', label: 'Jul-24', crd: 3.01 },
    { from: '2024-08-01', to: '2024-08-31', label: 'Aug-24', crd: 3.13 },
    { from: '2024-09-01', to: '2024-09-30', label: 'Sep-24', crd: 3.08 },
    { from: '2024-10-01', to: '2024-10-31', label: 'Oct-24', crd: 3.42 },
    { from: '2024-11-01', to: '2024-11-30', label: 'Nov-24', crd: 2.98 },
    { from: '2024-12-01', to: '2024-12-31', label: 'Dec-24', crd: 3.40 },
  ];

  for (const m of months) {
    const wf = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" != '0' AND "Invoice_Type_" != '0'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = 'URIMP'
          AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT COUNT(*) AS cnt, ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS cr FROM deduped
    `, [m.from, m.to]);

    const wof = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = 'URIMP'
          AND "Invoice_Date_(Date)" >= $1 AND "Invoice_Date_(Date)" <= $2
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT COUNT(*) AS cnt, ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS cr FROM deduped
    `, [m.from, m.to]);

    const wfCr = parseFloat(wf.rows[0].cr || 0);
    const wofCr = parseFloat(wof.rows[0].cr || 0);
    const diff = wofCr - wfCr;
    console.log(`  ${m.label.padEnd(7)}| WITH: ${String(wfCr).padEnd(8)} (${String(wf.rows[0].cnt).padEnd(5)}) | WITHOUT: ${String(wofCr).padEnd(8)} (${String(wof.rows[0].cnt).padEnd(5)}) | diff: ${diff.toFixed(4)} | CRD: ${m.crd}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
