'use strict';
const db = require('./db/connection');

(async () => {
  // Replicate EXACTLY what buildTrendCTE does for Aug 2024
  // GROUP BY (Invoice_No_, Invoice_Date_) — same as dashboard SA tab

  const DATE_FROM = '2024-08-01';
  const DATE_TO   = '2024-08-31';
  const STATUS    = 'Exported To GL';

  const CRD = { URIMH: 9.13, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66 };

  console.log('='.repeat(80));
  console.log('REPLICATING DASHBOARD buildTrendCTE for Aug 2024');
  console.log('GROUP BY (Invoice_No_, Invoice_Date_) — exactly as dashboard SA tab');
  console.log('='.repeat(80));

  // ── EXACT buildTrendCTE replica ───────────────────────────────────────────
  const trendRes = await db.query(`
    WITH deduped AS (
      SELECT
        "Invoice_No_",
        "Invoice_Date_(Date)",
        MAX("Status_")  AS "Status_",
        MAX("Site_")    AS "Site_",
        SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS "Amount_"
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_"      != '0'
        AND "Invoice_Type_" != '0'
        AND "Status_"  = $1
        AND "Invoice_Date_(Date)" >= $2
        AND "Invoice_Date_(Date)" <= $3
      GROUP BY "Invoice_No_", "Invoice_Date_(Date)"
    )
    SELECT
      "Site_" AS site,
      COUNT(*)  AS row_count,
      COUNT(DISTINCT "Invoice_No_") AS unique_inv,
      ROUND(SUM("Amount_"::NUMERIC)/1e7, 4) AS net_cr
    FROM deduped
    WHERE "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
    GROUP BY "Site_"
    ORDER BY "Site_"
  `, [STATUS, DATE_FROM, DATE_TO]);

  let total = 0;
  console.log('\n  TREND CTE result (dashboard method):');
  console.log('  Site   | Rows  | Unique Inv | Net Cr    | CRD    | Diff    | Match?');
  console.log('  ' + '-'.repeat(72));
  for (const r of trendRes.rows) {
    total += parseFloat(r.net_cr || 0);
    const diff = (parseFloat(r.net_cr) - CRD[r.site]).toFixed(4);
    const mark = Math.abs(parseFloat(diff)) < 0.005 ? ' EXACT ✓' :
                 Math.abs(parseFloat(diff)) < 0.02  ? ' CLOSE (~0.01)' : '';
    console.log(`  ${r.site.padEnd(7)}| ${String(r.row_count).padEnd(6)}| ${String(r.unique_inv).padEnd(11)}| ${String(r.net_cr).padEnd(10)}| ${CRD[r.site].toFixed(2).padEnd(7)}| ${diff.padEnd(8)}|${mark}`);
  }
  console.log(`\n  TOTAL: ${total.toFixed(4)} Cr | CRD: 14.78 | diff: ${(total-14.78).toFixed(4)}`);

  // ── Compare: rows vs unique invoices (if rows > unique → date varies across partitions) ──
  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSIS: For URIMP — how many invoices have MULTIPLE Invoice_Date_ values?');
  console.log('This explains why TrendCTE gives more than raw SUM(DISTINCT Invoice_No_)');
  console.log('='.repeat(80));

  const multiDate = await db.query(`
    SELECT "Invoice_No_",
      COUNT(DISTINCT "Invoice_Date_(Date)") AS date_variants,
      ARRAY_AGG(DISTINCT "Invoice_Date_(Date)" ORDER BY "Invoice_Date_(Date)") AS dates,
      SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0))/1e7 AS amt_cr,
      MAX("Status_") AS status
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_"
    HAVING COUNT(DISTINCT "Invoice_Date_(Date)") > 1
    ORDER BY date_variants DESC, amt_cr DESC
    LIMIT 20
  `, [DATE_FROM, DATE_TO]);

  if (multiDate.rows.length === 0) {
    console.log('\n  No URIMP invoices with multiple Invoice_Date_ values in Aug 2024.');
    console.log('  Date variation is NOT the reason for the difference.');
  } else {
    console.log(`\n  Found ${multiDate.rows.length} URIMP invoices with multiple Invoice_Date_ values:`);
    let multiTotal = 0;
    for (const r of multiDate.rows) {
      multiTotal += parseFloat(r.amt_cr || 0);
      console.log(`  ${r['Invoice_No_'].padEnd(30)} | ${r.date_variants} dates: ${r.dates.join(', ')} | ${parseFloat(r.amt_cr).toFixed(6)} Cr`);
    }
    console.log(`\n  Combined amount of multi-date invoices: ${multiTotal.toFixed(6)} Cr`);
  }

  // ── Check URIMP invoices NOT in Aug partition but dated August ─────────────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK: URIMP invoices with Invoice_Date in Aug 2024 — what partition are they from?');
  console.log('(Row_id patterns / Created_Date tells us which weekly partition)');
  console.log('='.repeat(80));

  const partCheck = await db.query(`
    SELECT
      DATE_TRUNC('month', "Created_Date"::TIMESTAMP) AS capture_month,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0))/1e7,4) AS net_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY 1 ORDER BY 1
  `, [DATE_FROM, DATE_TO]);

  for (const r of partCheck.rows) {
    console.log(`  Captured in: ${r.capture_month?.toISOString().substring(0,7)} | ${r.inv} inv | ${r.net_cr} Cr`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
