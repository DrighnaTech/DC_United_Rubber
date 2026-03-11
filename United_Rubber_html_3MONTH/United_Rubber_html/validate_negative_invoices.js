'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';

  // INSIGHT: Formula D (Amount_ > 0 only) = 14.2897 Cr (ABOVE CRD 14.22)
  // Standard A (all exported incl. negative Sales Returns) = 14.1496 Cr (BELOW CRD 14.22)
  // CRD = 14.22 is between these two.
  // This means: CRD excludes SOME but not ALL negative invoices.
  //
  // URIMH theory: Sales Return invoices at URIMH (Exported To GL, negative amounts)
  // total EXACTLY the URIMH gap (0.01 Cr) → CRD excludes URIMH Sales Returns only.

  // ── PART 1: Per-site breakdown of NEGATIVE exported invoices ───────────────
  console.log('='.repeat(80));
  console.log('PART 1 — Negative Amount_ Exported To GL invoices per site (Sales Returns)');
  console.log('If CRD excludes these, our total + these negatives = CRD');
  console.log('='.repeat(80));

  const negRes = await db.query(`
    SELECT "Site_" AS site, "Invoice_Type_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 6) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Site_", "Invoice_Type_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_", "Site_", "Invoice_Type_"
    ) sub
    WHERE net < 0
    GROUP BY site, "Invoice_Type_"
    ORDER BY site, net_cr
  `, [DATE_FROM, DATE_TO]);

  const CRD  = { URIMH: 8.8943, URIMP: 3.4010, URIPB: 0.3492, URIPU: 1.5751 };
  const DB   = { URIMH: 8.8843, URIMP: 3.3410, URIPB: 0.3492, URIPU: 1.5751 };
  const GAPS = { URIMH: 0.0100, URIMP: 0.0600, URIPB: 0.0000, URIPU: 0.0000 };

  const negBySite = {};
  for (const r of negRes.rows) {
    if (!negBySite[r.site]) negBySite[r.site] = 0;
    negBySite[r.site] += parseFloat(r.net_cr);
    const match = Math.abs(parseFloat(r.net_cr) - (-GAPS[r.site])) < 0.0005 ? ' ← MATCHES GAP!' : '';
    console.log(`  ${r.site} | ${(r['Invoice_Type_']||'').padEnd(25)} | ${r.inv} inv | ${r.net_cr} Cr${match}`);
  }

  console.log('\n  Per-site summary of negatives:');
  console.log('  Site   | Neg Exported Cr | Gap to CRD | -Neg = DB+neg | CRD    | Match?');
  console.log('  ' + '-'.repeat(80));
  let totalNeg = 0;
  for (const [site, neg] of Object.entries(negBySite)) {
    totalNeg += neg;
    const dbPlusNeg = DB[site] + Math.abs(neg); // if CRD excludes negatives
    const match = Math.abs(dbPlusNeg - CRD[site]) < 0.001 ? ' ✓ EXACT MATCH' : Math.abs(dbPlusNeg - CRD[site]) < 0.01 ? ' ~ CLOSE' : '';
    console.log(`  ${site.padEnd(7)}| ${neg.toFixed(6).padEnd(17)}| ${GAPS[site].toFixed(4).padEnd(11)}| ${dbPlusNeg.toFixed(6).padEnd(15)}| ${CRD[site]}  | ${match}`);
  }
  console.log(`\n  Total negative exported: ${totalNeg.toFixed(6)} Cr`);
  console.log(`  Standard formula total: 14.1496 Cr`);
  console.log(`  If CRD excludes all negatives: ${(14.1496 + Math.abs(totalNeg)).toFixed(4)} Cr | CRD: 14.22`);

  // ── PART 2: URIMH — list ALL negative exported invoices ────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('PART 2 — URIMH Dec: ALL negative exported invoices (detail)');
  console.log('='.repeat(80));

  const urimhNegRes = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      TO_CHAR(MAX("Created_Date"::TIMESTAMP),'YYYY-MM-DD') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Invoice_Type_"
    HAVING SUM(DISTINCT CAST("Amount_" AS NUMERIC)) < 0
    ORDER BY net_cr
  `, [DATE_FROM, DATE_TO]);

  let urimhNegTotal = 0;
  for (const r of urimhNegRes.rows) {
    urimhNegTotal += parseFloat(r.net_cr);
    console.log(`  ${r['Invoice_No_'].padEnd(28)} | ${(r['Invoice_Type_']||'').padEnd(25)} | ${r.net_cr} Cr | created=${r.created}`);
  }
  console.log(`\n  URIMH negative total: ${urimhNegTotal.toFixed(6)} Cr`);
  console.log(`  URIMH DB (exported): 8.8843 Cr`);
  console.log(`  URIMH + ABS(neg): ${(8.8843 + Math.abs(urimhNegTotal)).toFixed(6)} Cr`);
  console.log(`  URIMH CRD: 8.8943 Cr`);
  console.log(`  Match: ${Math.abs((8.8843 + Math.abs(urimhNegTotal)) - 8.8943) < 0.001 ? '✓ EXACT' : 'NO - diff=' + ((8.8843 + Math.abs(urimhNegTotal)) - 8.8943).toFixed(6)}`);

  // ── PART 3: URIMP — list ALL negative exported invoices ─────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('PART 3 — URIMP Dec: ALL negative exported invoices (detail)');
  console.log('='.repeat(80));

  const urimpNegRes = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      TO_CHAR(MAX("Created_Date"::TIMESTAMP),'YYYY-MM-DD') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY "Invoice_No_", "Invoice_Type_"
    HAVING SUM(DISTINCT CAST("Amount_" AS NUMERIC)) < 0
    ORDER BY net_cr
  `, [DATE_FROM, DATE_TO]);

  let urimpNegTotal = 0;
  for (const r of urimpNegRes.rows) {
    urimpNegTotal += parseFloat(r.net_cr);
    console.log(`  ${r['Invoice_No_'].padEnd(28)} | ${(r['Invoice_Type_']||'').padEnd(25)} | ${r.net_cr} Cr | created=${r.created}`);
  }
  console.log(`\n  URIMP negative total: ${urimpNegTotal.toFixed(6)} Cr`);
  console.log(`  URIMP DB (exported): 3.3410 Cr`);
  console.log(`  URIMP + ABS(neg): ${(3.3410 + Math.abs(urimpNegTotal)).toFixed(6)} Cr`);
  console.log(`  URIMP CRD: 3.4010 Cr`);

  // ── PART 4: Verify — what is DB + ABS(all negatives) per site vs CRD? ──────
  console.log('\n' + '='.repeat(80));
  console.log('PART 4 — All sites: DB formula + ABS(Sales Returns) vs CRD');
  console.log('Testing theory: CRD excludes Sales Return (negative) invoices');
  console.log('='.repeat(80));

  const allSiteNeg = await db.query(`
    SELECT site,
      ROUND(SUM(pos_net)/1e7, 4) AS pos_cr,
      ROUND(SUM(neg_net)/1e7, 4) AS neg_cr,
      ROUND(SUM(pos_net + ABS(neg_net))/1e7, 4) AS excl_neg_cr
    FROM (
      SELECT "Site_" AS site,
        CASE WHEN SUM(DISTINCT CAST("Amount_" AS NUMERIC)) >= 0
          THEN SUM(DISTINCT CAST("Amount_" AS NUMERIC)) ELSE 0 END AS pos_net,
        CASE WHEN SUM(DISTINCT CAST("Amount_" AS NUMERIC)) < 0
          THEN SUM(DISTINCT CAST("Amount_" AS NUMERIC)) ELSE 0 END AS neg_net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Status_" = 'Exported To GL'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      GROUP BY "Invoice_No_", "Site_"
    ) sub
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let totalExclNeg = 0;
  console.log('\n  Site   | Pos Cr  | Neg Cr  | Excl-Neg Cr | CRD Cr | Diff');
  console.log('  ' + '-'.repeat(75));
  for (const r of allSiteNeg.rows) {
    totalExclNeg += parseFloat(r.excl_neg_cr);
    const crdVal = CRD[r.site] || 0;
    const diff = (parseFloat(r.excl_neg_cr) - crdVal).toFixed(4);
    const mark = Math.abs(parseFloat(r.excl_neg_cr) - crdVal) < 0.001 ? ' ✓' : '';
    console.log(`  ${r.site.padEnd(7)}| ${r.pos_cr.padEnd(8)}| ${r.neg_cr.padEnd(8)}| ${r.excl_neg_cr.padEnd(12)}| ${crdVal}  | ${diff}${mark}`);
  }
  console.log(`\n  TOTAL if CRD excludes negatives: ${totalExclNeg.toFixed(4)} Cr | CRD: 14.22 | diff: ${(totalExclNeg-14.22).toFixed(4)}`);

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
