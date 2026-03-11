'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2025-01-01';
  const DATE_TO   = '2025-01-28';
  const CRD = { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41 };
  const CRD_TOTAL = 16.12;

  console.log('='.repeat(80));
  console.log('JAN 2025 (1-28) — ROW BY ROW — EXPORTED TO GL ONLY');
  console.log('CRD: URIMH=8.82, URIMP=5.34, URIPB=0.55, URIPU=1.41 | Total=16.12');
  console.log('='.repeat(80));

  // ── STEP 1: TrendCTE per site — 6 decimal precision ─────────────────
  console.log('\n--- STEP 1: TrendCTE per site (6 decimal) ---');
  const trend = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_") AS "Status_",
        MAX("Site_") AS "Site_",
        MAX("Invoice_Type_") AS "Invoice_Type_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Invoice_Date_(Date)" >= $1
        AND "Invoice_Date_(Date)" <= $2
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      "Site_" AS site,
      COUNT(*) AS rows,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS net_cr,
      SUM("Amount_"::NUMERIC) AS raw_sum
    FROM deduped
    WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
    GROUP BY "Site_"
    ORDER BY "Site_"
  `, [DATE_FROM, DATE_TO]);

  let total = 0;
  console.log('  Site   | Inv  | DB Cr        | CRD Cr  | Gap Cr      | Gap %   | Verdict');
  console.log('  ' + '-'.repeat(80));
  const dbVals = {};
  for (const r of trend.rows) {
    const dbCr = parseFloat(r.net_cr);
    total += dbCr;
    dbVals[r.site] = dbCr;
    const crd = CRD[r.site];
    const gap = (dbCr - crd).toFixed(6);
    const pct = ((dbCr - crd) / crd * 100).toFixed(2);
    const verdict = Math.abs(parseFloat(gap)) < 0.005 ? 'EXACT MATCH' :
                    Math.abs(parseFloat(gap)) < 0.02  ? 'ROUNDING (~0.01)' :
                    Math.abs(parseFloat(gap)) < 0.05  ? 'SMALL GAP' : 'GAP';
    console.log(`  ${r.site.padEnd(7)}| ${String(r.inv).padEnd(5)}| ${String(r.net_cr).padEnd(13)}| ${crd.toFixed(2).padEnd(8)}| ${gap.padEnd(12)}| ${pct.padEnd(8)}| ${verdict}`);
  }
  console.log(`\n  TOTAL  |      | ${total.toFixed(6).padEnd(13)}| ${CRD_TOTAL.toFixed(2).padEnd(8)}| ${(total-CRD_TOTAL).toFixed(6).padEnd(12)}|`);

  // ── STEP 2: Per-site deep dive for sites with gap ─────────────────
  const gaps = Object.entries(dbVals).filter(([s,v]) => Math.abs(v - CRD[s]) >= 0.005);

  for (const [site, val] of gaps) {
    const crd = CRD[site];
    const gap = (val - crd).toFixed(6);

    console.log('\n' + '='.repeat(80));
    console.log(`DEEP DIVE: ${site} — DB: ${val.toFixed(6)} Cr | CRD: ${crd} Cr | Gap: ${gap} Cr (${((val-crd)/crd*100).toFixed(2)}%)`);
    console.log('='.repeat(80));

    // Invoice Type breakdown
    console.log('\n  Invoice Type breakdown (Exported To GL):');
    const byType = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Invoice_Type_") AS "Invoice_Type_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Invoice_Type_", COUNT(*) AS cnt,
        SUM(CASE WHEN "Amount_"::NUMERIC < 0 THEN 1 ELSE 0 END) AS neg_cnt,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
      FROM deduped GROUP BY "Invoice_Type_" ORDER BY cr DESC
    `, [site, DATE_FROM, DATE_TO]);

    for (const r of byType.rows) {
      console.log(`    ${(r['Invoice_Type_']||'?').padEnd(25)} | ${r.cnt} inv (${r.neg_cnt} neg) | ${r.cr} Cr`);
    }

    // Negative invoices
    const negInv = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Invoice_Type_") AS "Invoice_Type_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Invoice_No_", "Invoice_Type_",
        ROUND("Amount_"::NUMERIC/1e7, 6) AS cr
      FROM deduped WHERE "Amount_"::NUMERIC < 0
      ORDER BY "Amount_"::NUMERIC
    `, [site, DATE_FROM, DATE_TO]);

    if (negInv.rows.length > 0) {
      console.log('\n  Negative-amount invoices:');
      let negTotal = 0;
      for (const r of negInv.rows) {
        negTotal += parseFloat(r.cr);
        console.log(`    ${r['Invoice_No_'].padEnd(30)} | ${(r['Invoice_Type_']||'?').padEnd(20)} | ${r.cr} Cr`);
      }
      console.log(`    Total negative: ${negTotal.toFixed(6)} Cr`);
    }

    // Raw rows per invoice
    const rawDist = await db.query(`
      SELECT rows_per_inv, COUNT(*) AS inv_count
      FROM (
        SELECT "Invoice_No_", COUNT(*) AS rows_per_inv
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
        GROUP BY "Invoice_No_"
      ) t GROUP BY rows_per_inv ORDER BY rows_per_inv
    `, [site, DATE_FROM, DATE_TO]);

    console.log('\n  Raw rows per invoice:');
    for (const r of rawDist.rows) {
      console.log(`    ${r.rows_per_inv} rows: ${r.inv_count} invoices`);
    }

    // ALL statuses breakdown
    console.log('\n  ALL statuses (not just Exported):');
    const allSt = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          MAX("Status_") AS "Status_",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" NOT IN ('0','')
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT "Status_", COUNT(*) AS cnt,
        ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
      FROM deduped GROUP BY "Status_" ORDER BY cr DESC
    `, [site, DATE_FROM, DATE_TO]);

    let allTotal = 0;
    for (const r of allSt.rows) {
      allTotal += parseFloat(r.cr);
      const mark = r['Status_'] === 'Exported To GL' ? ' ←' : '';
      console.log(`    ${(r['Status_']||'?').padEnd(22)} | ${String(r.cnt).padEnd(5)} inv | ${r.cr} Cr${mark}`);
    }
    console.log(`    ALL statuses total: ${allTotal.toFixed(6)} Cr vs CRD ${crd}`);

    // Weekly snapshot check
    console.log('\n  Weekly snapshot breakdown:');
    const janWeeks = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'LandingStage1'
        AND table_name LIKE 'mf_sales_si_siheader_2025_jan%'
      ORDER BY table_name
    `);

    for (const t of janWeeks.rows) {
      const wRes = await db.query(`
        WITH deduped AS (
          SELECT "Invoice_No_", "Invoice_Date_(Date)",
            SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
          FROM "LandingStage1"."${t.table_name}"
          WHERE "Invoice_No_" NOT LIKE '%-R'
            AND "Status_" = 'Exported To GL'
            AND "Site_" = $1
            AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
          GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
        )
        SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
          ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
        FROM deduped
      `, [site, DATE_FROM, DATE_TO]);
      console.log(`    ${t.table_name}: ${wRes.rows[0].inv || 0} inv | ${wRes.rows[0].cr || 0} Cr`);
    }

    // Check Feb 2025 snapshots for Jan-dated invoices (spillover)
    console.log('\n  Feb 2025 spillover check (Jan-dated invoices in Feb snapshots):');
    const febWeeks = await db.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'LandingStage1'
        AND table_name LIKE 'mf_sales_si_siheader_2025_feb%'
      ORDER BY table_name
    `);

    if (febWeeks.rows.length === 0) {
      console.log('    No Feb 2025 weekly tables exist');
    } else {
      for (const t of febWeeks.rows) {
        const fRes = await db.query(`
          WITH deduped AS (
            SELECT "Invoice_No_", "Invoice_Date_(Date)",
              SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
            FROM "LandingStage1"."${t.table_name}"
            WHERE "Invoice_No_" NOT LIKE '%-R'
              AND "Status_" = 'Exported To GL'
              AND "Site_" = $1
              AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
            GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
          )
          SELECT COUNT(DISTINCT "Invoice_No_") AS inv,
            ROUND(SUM("Amount_"::NUMERIC)/1e7, 6) AS cr
          FROM deduped
        `, [site, DATE_FROM, DATE_TO]);
        console.log(`    ${t.table_name}: ${fRes.rows[0].inv || 0} inv | ${fRes.rows[0].cr || 0} Cr`);
      }
    }

    // Alternative amount fields
    console.log('\n  Alternative amount fields:');
    const altAmts = await db.query(`
      WITH deduped AS (
        SELECT "Invoice_No_", "Invoice_Date_(Date)",
          SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS amt,
          SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC,0)) AS gross
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT LIKE '%-R'
          AND "Status_" = 'Exported To GL'
          AND "Site_" = $1
          AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
        GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
      )
      SELECT ROUND(SUM(amt)/1e7, 6) AS net_cr, ROUND(SUM(gross)/1e7, 6) AS gross_cr FROM deduped
    `, [site, DATE_FROM, DATE_TO]);

    console.log(`    Amount_ (net):        ${altAmts.rows[0].net_cr} Cr`);
    console.log(`    Invoice_Amount_ (gross): ${altAmts.rows[0].gross_cr} Cr`);
    console.log(`    CRD:                  ${crd} Cr`);

    // Invoice count in _all vs weekly
    const allInvCnt = await db.query(`
      SELECT COUNT(DISTINCT "Invoice_No_") AS cnt
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" = $1
        AND "Invoice_Date_(Date)" >= $2 AND "Invoice_Date_(Date)" <= $3
    `, [site, DATE_FROM, DATE_TO]);
    console.log(`\n  _all table unique invoices: ${allInvCnt.rows[0].cnt}`);
  }

  // ── STEP 3: Non-gap sites — quick confirmation ─────────────────────
  const exact = Object.entries(dbVals).filter(([s,v]) => Math.abs(v - CRD[s]) < 0.005);
  if (exact.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('EXACT MATCH SITES (gap < 0.005 Cr):');
    for (const [s, v] of exact) {
      console.log(`  ${s}: DB=${v.toFixed(6)} | CRD=${CRD[s]} | diff=${(v-CRD[s]).toFixed(6)}`);
    }
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
