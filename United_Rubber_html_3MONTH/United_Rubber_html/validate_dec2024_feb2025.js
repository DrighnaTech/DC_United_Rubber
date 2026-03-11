'use strict';
const db = require('./db/connection');

(async () => {
  const DATE_FROM = '2024-12-01';
  const DATE_TO   = '2024-12-31';
  const CRD_URIMH = 8.8943;
  const CRD_URIMP = 3.4010;
  const CRD_TOTAL = 14.22;

  // ── THEORY: CRD was run Jan 29, 2025. ETL captured Feb 2025.
  // If any Dec invoices were Exported→GL on Jan 29 but then REVERTED
  // between Jan 29 and Feb 2025, CRD sees them as Exported but our DB sees Reverted.
  // The -R document's Created_Date would be in Jan-Feb 2025 if this happened.

  console.log('='.repeat(80));
  console.log('THEORY: Dec invoices Exported on Jan 29 but Reverted before Feb 2025 ETL');
  console.log('='.repeat(80));

  // Look for Dec 2024 invoices with Status=Reverted whose -R document was created in Jan/Feb 2025
  const lateRevRes = await db.query(`
    SELECT orig."Invoice_No_", orig."Site_", orig."Invoice_Type_",
      orig."Status_" AS orig_status,
      CAST(orig."Amount_" AS NUMERIC) AS orig_amount,
      orig."Invoice_Date_(Date)" AS inv_date,
      rev."Status_" AS rev_status,
      CAST(rev."Amount_" AS NUMERIC) AS rev_amount,
      TO_CHAR(rev."Created_Date"::TIMESTAMP,'YYYY-MM-DD HH24:MI') AS rev_created
    FROM "LandingStage2"."mf_sales_si_siheader_all" orig
    JOIN "LandingStage2"."mf_sales_si_siheader_all" rev
      ON rev."Invoice_No_" = orig."Invoice_No_" || '-R'
    WHERE orig."Invoice_No_" NOT LIKE '%-R'
      AND orig."Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND orig."Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND orig."Status_" = 'Reverted'
      AND orig."Invoice_Type_" != '0'
      AND TO_CHAR(rev."Created_Date"::TIMESTAMP,'YYYY-MM') >= '2025-01'
    GROUP BY orig."Invoice_No_", orig."Site_", orig."Invoice_Type_",
      orig."Status_", orig."Amount_", orig."Invoice_Date_(Date)",
      rev."Status_", rev."Amount_", rev."Created_Date"
    ORDER BY rev."Created_Date" DESC
  `, [DATE_FROM, DATE_TO]);

  if (lateRevRes.rows.length === 0) {
    console.log('\n  NONE found — no Reverted invoices whose -R was created in Jan/Feb 2025.');
    console.log('  This means all reversals happened BEFORE Jan 29, so CRD also sees them as Reverted.');
    console.log('  Theory DISPROVED — gap is NOT caused by late reversals.');
  } else {
    console.log(`\n  Found ${lateRevRes.rows.length} invoices reversed AFTER Jan 2025:`);
    let lateRevTotal = 0;
    const bysite = {};
    for (const r of lateRevRes.rows) {
      lateRevTotal += parseFloat(r.orig_amount) / 1e7;
      if (!bysite[r['Site_']]) bysite[r['Site_']] = { count: 0, total: 0 };
      bysite[r['Site_']].count++;
      bysite[r['Site_']].total += parseFloat(r.orig_amount) / 1e7;
      console.log(`  ${r['Invoice_No_'].padEnd(25)} | ${r['Site_']} | rev_created=${r.rev_created} | orig=${(parseFloat(r.orig_amount)/1e7).toFixed(6)} Cr`);
    }
    console.log(`\n  Total late-reverted: ${lateRevTotal.toFixed(4)} Cr`);
    for (const [s,v] of Object.entries(bysite)) {
      console.log(`    ${s}: ${v.count} inv | ${v.total.toFixed(4)} Cr`);
    }
  }

  // ── CHECK 2: ALL Reverted invoices in Dec 2024 — per site + -R created date ──
  console.log('\n' + '='.repeat(80));
  console.log('ALL Reverted Dec 2024 invoices — when was the -R document created?');
  console.log('='.repeat(80));

  const allRevRes = await db.query(`
    SELECT orig."Invoice_No_", orig."Site_", orig."Invoice_Type_",
      ROUND(CAST(orig."Amount_" AS NUMERIC)/1e7,6) AS net_cr,
      orig."Invoice_Date_(Date)" AS inv_date,
      TO_CHAR(rev."Created_Date"::TIMESTAMP,'YYYY-MM-DD HH24:MI') AS rev_created,
      rev."Status_" AS rev_status
    FROM "LandingStage2"."mf_sales_si_siheader_all" orig
    LEFT JOIN "LandingStage2"."mf_sales_si_siheader_all" rev
      ON rev."Invoice_No_" = orig."Invoice_No_" || '-R'
    WHERE orig."Invoice_No_" NOT LIKE '%-R'
      AND orig."Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND orig."Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND orig."Status_" = 'Reverted'
      AND orig."Invoice_Type_" != '0'
    GROUP BY orig."Invoice_No_", orig."Site_", orig."Invoice_Type_",
      orig."Amount_", orig."Invoice_Date_(Date)",
      rev."Created_Date", rev."Status_"
    ORDER BY orig."Site_", rev."Created_Date" DESC
  `, [DATE_FROM, DATE_TO]);

  const revBySite = {};
  for (const r of allRevRes.rows) {
    const s = r['Site_'];
    if (!revBySite[s]) revBySite[s] = [];
    revBySite[s].push(r);
  }

  for (const [s, rows] of Object.entries(revBySite)) {
    const siteTotal = rows.reduce((a,b) => a + parseFloat(b.net_cr), 0);
    console.log(`\n  ${s}: ${rows.length} Reverted invoices | ${siteTotal.toFixed(4)} Cr`);
    // Group by -R created month
    const byMonth = {};
    for (const r of rows) {
      const mo = r.rev_created ? r.rev_created.substring(0,7) : 'NO -R DOC';
      if (!byMonth[mo]) byMonth[mo] = { count: 0, total: 0 };
      byMonth[mo].count++;
      byMonth[mo].total += parseFloat(r.net_cr);
    }
    for (const [mo, v] of Object.entries(byMonth).sort()) {
      const mark = mo >= '2025-01' ? ' ← AFTER CRD JAN 29?' : '';
      console.log(`    Rev created ${mo}: ${v.count} inv | ${v.total.toFixed(4)} Cr${mark}`);
    }
  }

  // ── CHECK 3: URIMH — STO invoices that are Approved — can they explain 0.01 gap? ──
  console.log('\n' + '='.repeat(80));
  console.log('URIMH: ALL non-Exported-To-GL invoices with their current status');
  console.log('='.repeat(80));

  const urimhNonExp = await db.query(`
    SELECT "Status_", "Invoice_Type_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Status_", "Invoice_Type_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMH'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" != 'Exported To GL'
      GROUP BY "Invoice_No_", "Status_", "Invoice_Type_"
    ) sub
    GROUP BY "Status_", "Invoice_Type_"
    ORDER BY "Status_", net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Status           | Type                    | Inv | Net Cr    | Diff from 0.01 gap');
  console.log('  ' + '-'.repeat(75));
  for (const r of urimhNonExp.rows) {
    const diff = (parseFloat(r.net_cr) - 0.01).toFixed(4);
    const mark = Math.abs(parseFloat(r.net_cr) - 0.01) < 0.005 ? ' ← MATCH' : '';
    console.log(`  ${r['Status_'].padEnd(17)}| ${(r['Invoice_Type_']||'').padEnd(23)} | ${String(r.inv).padEnd(4)}| ${String(r.net_cr).padEnd(10)}| ${diff}${mark}`);
  }

  // ── CHECK 4: URIMP — all non-Exported invoices ──────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('URIMP: ALL non-Exported-To-GL invoices with their current status');
  console.log('='.repeat(80));

  const urimpNonExp = await db.query(`
    SELECT "Status_", "Invoice_Type_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "Status_", "Invoice_Type_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" = 'URIMP'
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Status_" != '0' AND "Invoice_Type_" != '0'
        AND "Status_" != 'Exported To GL'
      GROUP BY "Invoice_No_", "Status_", "Invoice_Type_"
    ) sub
    GROUP BY "Status_", "Invoice_Type_"
    ORDER BY "Status_", net_cr DESC
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Status           | Type                    | Inv | Net Cr    | Diff from 0.06 gap');
  console.log('  ' + '-'.repeat(75));
  for (const r of urimpNonExp.rows) {
    const diff = (parseFloat(r.net_cr) - 0.06).toFixed(4);
    const mark = Math.abs(parseFloat(r.net_cr) - 0.06) < 0.005 ? ' ← MATCH' : '';
    console.log(`  ${r['Status_'].padEnd(17)}| ${(r['Invoice_Type_']||'').padEnd(23)} | ${String(r.inv).padEnd(4)}| ${String(r.net_cr).padEnd(10)}| ${diff}${mark}`);
  }

  // ── CHECK 5: CRD methodology — does Exported+Reverted match CRD? ────────────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 5 — What if CRD counts Exported To GL + Reverted (both "were exported")?');
  console.log('='.repeat(80));

  const expPlusRevRes = await db.query(`
    SELECT "Site_" AS site,
      SUM(CASE WHEN "Status_" = 'Exported To GL' THEN net ELSE 0 END) AS exp_cr,
      SUM(CASE WHEN "Status_" = 'Reverted'        THEN net ELSE 0 END) AS rev_cr,
      SUM(net) AS combined_cr
    FROM (
      SELECT "Invoice_No_", "Site_", "Status_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7 AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Status_" IN ('Exported To GL','Reverted')
        AND "Invoice_Type_" != '0'
      GROUP BY "Invoice_No_", "Site_", "Status_"
    ) sub
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  let expPlusRevTotal = 0;
  console.log('\n  Site   | Exported Cr | Reverted Cr | Combined Cr | CRD Cr | Diff');
  console.log('  ' + '-'.repeat(70));
  for (const r of expPlusRevRes.rows) {
    const exp = parseFloat(r.exp_cr).toFixed(4);
    const rev = parseFloat(r.rev_cr).toFixed(4);
    const comb = parseFloat(r.combined_cr).toFixed(4);
    const crdSite = r.site==='URIMH'?CRD_URIMH:r.site==='URIMP'?CRD_URIMP:null;
    const diffStr = crdSite ? (parseFloat(comb)-crdSite).toFixed(4) : '-';
    expPlusRevTotal += parseFloat(r.combined_cr);
    console.log(`  ${r.site.padEnd(7)}| ${exp.padEnd(12)}| ${rev.padEnd(12)}| ${comb.padEnd(12)}| ${crdSite||'-'}  | ${diffStr}`);
  }
  console.log(`\n  TOTAL Combined: ${expPlusRevTotal.toFixed(4)} Cr | CRD: ${CRD_TOTAL} | Diff: ${(expPlusRevTotal - CRD_TOTAL).toFixed(4)}`);

  // ── CHECK 6: The -R amount net effect — does CRD NOT subtract reversals? ───
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 6 — What if CRD includes -R documents as POSITIVE (no sign flip)?');
  console.log('='.repeat(80));
  // -R documents have negative Amount_ values. Our formula excludes them.
  // What if CRD includes them but interprets as positive (absolute value)?
  const rAbsRes = await db.query(`
    SELECT "Site_" AS site,
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 4) AS neg_cr,
      ROUND(ABS(SUM(DISTINCT CAST("Amount_" AS NUMERIC)))/1e7, 4) AS abs_cr
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
    GROUP BY site ORDER BY site
  `, [DATE_FROM, DATE_TO]);

  for (const r of rAbsRes.rows) {
    const crdSite = r.site==='URIMH'?CRD_URIMH:r.site==='URIMP'?CRD_URIMP:null;
    console.log(`  ${r.site}: ${r.inv} -R docs | neg=${r.neg_cr} Cr | abs=${r.abs_cr} Cr | (if included as +, diff from CRD: ${crdSite ? (8.8843 - CRD_URIMH).toFixed(4) : '?'})`);
  }

  // ── CHECK 7: URIMH exact — find invoices totaling EXACTLY 0.01 Cr (±100) ──
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 7 — URIMH: single Reverted invoice closest to 0.01 Cr gap');
  console.log('='.repeat(80));

  const urimhRevSorted = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      TO_CHAR(MIN("Created_Date"::TIMESTAMP),'YYYY-MM-DD') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Reverted'
      AND "Site_" = 'URIMH'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_Type_" != '0'
    GROUP BY "Invoice_No_", "Invoice_Type_"
    ORDER BY ABS(SUM(DISTINCT CAST("Amount_" AS NUMERIC)) - 100000)
    LIMIT 10
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Closest Reverted invoices to 0.01 Cr (₹1,00,000):');
  for (const r of urimhRevSorted.rows) {
    const diff = ((parseFloat(r.net_cr) - 0.01)*1e7).toFixed(0);
    const match = Math.abs(parseFloat(r.net_cr) - 0.01) < 0.001 ? ' ✓ MATCH' : '';
    console.log(`  ${r['Invoice_No_'].padEnd(28)} | ${(r['Invoice_Type_']||'').padEnd(22)} | ${r.net_cr} Cr | diff=₹${diff}${match} | created=${r.created}`);
  }

  // ── CHECK 8: URIMP exact — Reverted invoices closest to 0.06 Cr ─────────────
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 8 — URIMP: single Reverted invoice closest to 0.06 Cr gap');
  console.log('='.repeat(80));

  const urimpRevSorted = await db.query(`
    SELECT "Invoice_No_", "Invoice_Type_",
      ROUND(SUM(DISTINCT CAST("Amount_" AS NUMERIC))/1e7, 6) AS net_cr,
      TO_CHAR(MIN("Created_Date"::TIMESTAMP),'YYYY-MM-DD') AS created
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Reverted'
      AND "Site_" = 'URIMP'
      AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
      AND "Invoice_Type_" != '0'
    GROUP BY "Invoice_No_", "Invoice_Type_"
    ORDER BY ABS(SUM(DISTINCT CAST("Amount_" AS NUMERIC)) - 600000)
    LIMIT 10
  `, [DATE_FROM, DATE_TO]);

  console.log('\n  Closest Reverted invoices to 0.06 Cr (₹6,00,000):');
  for (const r of urimpRevSorted.rows) {
    const diff = ((parseFloat(r.net_cr) - 0.06)*1e7).toFixed(0);
    const match = Math.abs(parseFloat(r.net_cr) - 0.06) < 0.001 ? ' ✓ MATCH' : '';
    console.log(`  ${r['Invoice_No_'].padEnd(28)} | ${(r['Invoice_Type_']||'').padEnd(22)} | ${r.net_cr} Cr | diff=₹${diff}${match} | created=${r.created}`);
  }

  // ── CHECK 9: What DOES the CRD Jan 29 snapshot look like if we use partitions up to w4? ─
  console.log('\n' + '='.repeat(80));
  console.log('CHECK 9 — Per-partition + status breakdown: which partition is closest to CRD?');
  console.log('='.repeat(80));

  const partStatusRes = await db.query(`
    SELECT p.src_table, "Status_",
      COUNT(DISTINCT "Invoice_No_") AS inv,
      ROUND(SUM(sub.net)/1e7, 4) AS net_cr
    FROM (
      SELECT "Invoice_No_", "src_table", "Status_",
        SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS net
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT LIKE '%-R'
        AND "Site_" IN ('URIMH','URIMP','URIPB','URIPU')
        AND "Invoice_Date_(Date)" BETWEEN $1 AND $2
        AND "Invoice_Type_" != '0'
        AND "Status_" IN ('Exported To GL','Approved','Reverted')
      GROUP BY "Invoice_No_", "src_table", "Status_"
    ) sub
    JOIN "LandingStage2"."mf_sales_si_siheader_all" p
      ON p."Invoice_No_" = sub."Invoice_No_" AND p.src_table = sub.src_table
    GROUP BY p.src_table, "Status_"
    ORDER BY p.src_table, "Status_"
  `, [DATE_FROM, DATE_TO]);

  let lastSrc = '';
  for (const r of partStatusRes.rows) {
    if (r.src_table !== lastSrc) {
      console.log(`\n  ${r.src_table}:`);
      lastSrc = r.src_table;
    }
    const mark = r['Status_'] === 'Exported To GL' ? ` | diff from CRD: ${(parseFloat(r.net_cr)-CRD_TOTAL).toFixed(4)}` : '';
    console.log(`    ${r['Status_'].padEnd(17)}: ${String(r.inv).padEnd(5)} inv | ${r.net_cr} Cr${mark}`);
  }

  process.exit(0);
})().catch(e => { console.error(e.message, e.stack); process.exit(1); });
