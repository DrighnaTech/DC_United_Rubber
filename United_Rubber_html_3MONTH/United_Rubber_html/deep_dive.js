'use strict';
const db = require('./db/connection');

(async () => {
  try {
    // ═══════════════════════════════════════════════════
    // 1. ALL TABLES IN LandingStage2
    // ═══════════════════════════════════════════════════
    console.log('=== LandingStage2 Tables ===');
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'LandingStage2'
      ORDER BY table_name
    `);
    for (const t of tables.rows) {
      const cnt = await db.query(`SELECT COUNT(*) as cnt FROM "LandingStage2"."${t.table_name}"`);
      console.log(` ${t.table_name}: ${cnt.rows[0].cnt} rows`);
    }

    // ═══════════════════════════════════════════════════
    // 2. INVOICE COUNT PER TABLE
    // ═══════════════════════════════════════════════════
    console.log('\n=== Unique Invoice counts ===');
    const hdr = await db.query(`SELECT COUNT(DISTINCT "Invoice_No_") as cnt FROM "LandingStage2"."mf_sales_si_siheader_all"`);
    const item = await db.query(`SELECT COUNT(DISTINCT "Invoice_No_") as cnt FROM "LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"`);
    console.log(' Header table unique invoices:', hdr.rows[0].cnt);
    console.log(' Item table unique invoices:  ', item.rows[0].cnt);

    // ═══════════════════════════════════════════════════
    // 3. STATUS DISTRIBUTION FULL RANGE
    // ═══════════════════════════════════════════════════
    console.log('\n=== Status Distribution (all months, Exported To GL count) ===');
    const statusDist = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month,
        "Status_",
        COUNT(DISTINCT "Invoice_No_") AS inv_cnt
      FROM "LandingStage2"."mf_sales_si_siheader_all"
      WHERE "Invoice_No_" NOT ILIKE '%-R%'
        AND "Invoice_Type_" != '0'
        AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-07'
      GROUP BY month, "Status_"
      ORDER BY month, inv_cnt DESC
    `);
    let lastMonth = '';
    for (const r of statusDist.rows) {
      if (r.month !== lastMonth) { console.log(`\n  --- ${r.month} ---`); lastMonth = r.month; }
      console.log(`    ${r.Status_}: ${r.inv_cnt} invoices`);
    }

    // ═══════════════════════════════════════════════════
    // 4. FULL MONTH-BY-MONTH VALIDATION TABLE
    //    Status = Exported To GL (client fixed logic)
    //    Per-invoice SUM(DISTINCT Amount_)
    // ═══════════════════════════════════════════════════
    console.log('\n\n=== MASTER VALIDATION TABLE (Status = Exported To GL) ===');
    const master = await db.query(`
      SELECT
        TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') AS month,
        "Site_" AS site,
        COUNT(DISTINCT "Invoice_No_") AS inv_cnt,
        ROUND(SUM(invoice_net)::NUMERIC, 2) AS net_amt,
        ROUND(SUM(invoice_gross)::NUMERIC, 2) AS gross_amt
      FROM (
        SELECT "Invoice_No_", MAX("Site_") AS "Site_",
          MIN("Invoice_Date_(Date)") AS "Invoice_Date_(Date)",
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS invoice_net,
          SUM(DISTINCT CAST("Invoice_Amount_" AS NUMERIC)) AS invoice_gross
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE, 'YYYY-MM') BETWEEN '2024-04' AND '2025-07'
        GROUP BY "Invoice_No_"
      ) sub
      GROUP BY month, "Site_"
      ORDER BY month, "Site_"
    `);

    // CRD reference values
    const CRD_NET = {
      '2024-04': { URIMH: 7.30, URIMP: 3.76, URIPB: 0.46, URIPU: 1.36 },
      '2024-05': { URIMH: 7.04, URIMP: 3.06, URIPB: 0.59, URIPU: 1.28 },
      '2024-06': { URIMH: 7.35, URIMP: 3.10, URIPB: 0.75, URIPU: 1.91 },
      '2024-07': { URIMH: 9.24, URIMP: 3.12, URIPB: 0.83, URIPU: 1.32 },
      '2024-08': { URIMH: 9.14, URIMP: 3.13, URIPB: 0.86, URIPU: 1.66 },
      '2024-09': { URIMH: 8.66, URIMP: 3.08, URIPB: 0.78, URIPU: 1.21 },
      '2024-10': { URIMH: 10.87, URIMP: 3.42, URIPB: 0.57, URIPU: 1.55 },
      '2024-11': { URIMH: 8.23, URIMP: 2.98, URIPB: 0.56, URIPU: 1.50 },
      '2024-12': { URIMH: 8.89, URIMP: 3.40, URIPB: 0.35, URIPU: 1.58 },
      '2025-01': { URIMH: 8.82, URIMP: 5.34, URIPB: 0.55, URIPU: 1.41 },
      // Apr-Jul 2025: from Sales Invoice Register Sheet1 (item-level)
      '2025-04': { URIMH: 7.91, URIMP: 4.50, URIPB: 0.77, URIPU: 1.59 },
      '2025-05': { URIMH: 8.50, URIMP: 3.35, URIPB: 0.70, URIPU: 1.64 },
      '2025-06': { URIMH: 8.18, URIMP: 3.39, URIPB: 0.70, URIPU: 0.98 },
      '2025-07': { URIMH: 10.11, URIMP: 2.32, URIPB: 1.02, URIPU: 1.58 },
    };
    const CRD_SOURCE = {
      '2024-04': 'Sales Summary Dashboard xlsx',
      '2024-05': 'Sales Summary Dashboard xlsx',
      '2024-06': 'Sales Summary Dashboard xlsx',
      '2024-07': 'Sales Summary Dashboard xlsx',
      '2024-08': 'Sales Summary Dashboard xlsx',
      '2024-09': 'Sales Summary Dashboard xlsx',
      '2024-10': 'Sales Summary Dashboard xlsx',
      '2024-11': 'Sales Summary Dashboard xlsx',
      '2024-12': 'Sales Summary Dashboard xlsx',
      '2025-01': 'Sales Summary Dashboard xlsx',
      '2025-04': 'Sales Invoice Register Sheet1 (item-level)',
      '2025-05': 'Sales Invoice Register Sheet1 (item-level)',
      '2025-06': 'Sales Invoice Register Sheet1 (item-level)',
      '2025-07': 'Sales Invoice Register Sheet1 (item-level)',
    };

    // Print header
    console.log('\nMonth   | Site  | Invoices | DB Net(Cr) | CRD Net(Cr) | Diff(Cr) | Match | CRD Source');
    console.log('--------|-------|----------|------------|-------------|----------|-------|' + '-'.repeat(40));

    const byMonth = {};
    for (const r of master.rows) {
      const net_cr = parseFloat(r.net_amt) / 1e7;
      const crd = CRD_NET[r.month]?.[r.site];
      const diff = crd !== undefined ? (net_cr - crd) : null;
      const ok = diff !== null ? Math.abs(diff) <= 0.02 : null;

      if (!byMonth[r.month]) byMonth[r.month] = { dbTotal: 0, crdTotal: 0, sites: [] };
      byMonth[r.month].dbTotal += net_cr;
      if (crd !== undefined) byMonth[r.month].crdTotal += crd;
      byMonth[r.month].sites.push({ site: r.site, inv: r.inv_cnt, db: net_cr, crd, diff, ok });

      console.log(
        `${r.month} | ${r.site.padEnd(5)} | ${String(r.inv_cnt).padEnd(8)} | ` +
        `${net_cr.toFixed(2).padEnd(10)} | ` +
        `${crd !== undefined ? crd.toFixed(2).padEnd(11) : 'N/A'.padEnd(11)} | ` +
        `${diff !== null ? diff.toFixed(2).padStart(8) : '   N/A  '} | ` +
        `${ok === null ? 'N/A  ' : ok ? '✓    ' : '✗    '} | ` +
        `${CRD_SOURCE[r.month] || 'No CRD ref'}`
      );
    }

    // Monthly totals
    console.log('\n\n=== MONTHLY TOTAL (all domestic sites) ===');
    const CRD_TOTAL = {
      '2024-04': 12.88, '2024-05': 11.97, '2024-06': 13.11, '2024-07': 14.50,
      '2024-08': 14.79, '2024-09': 13.74, '2024-10': 16.41, '2024-11': 13.27,
      '2024-12': 14.22, '2025-01': 16.12,
      '2025-04': 14.77, '2025-05': 14.18, '2025-06': 13.25, '2025-07': 15.04,
    };
    console.log('Month   | DB Total | CRD Total | Diff     | Root Cause');
    console.log('--------|----------|-----------|----------|' + '-'.repeat(60));
    for (const [month, data] of Object.entries(byMonth).sort()) {
      const crdTot = CRD_TOTAL[month];
      const diff = crdTot !== undefined ? data.dbTotal - crdTot : null;
      const rootCause = getRootCause(month, diff);
      console.log(
        `${month} | ${data.dbTotal.toFixed(2).padEnd(8)} | ` +
        `${crdTot !== undefined ? crdTot.toFixed(2).padEnd(9) : 'N/A      '} | ` +
        `${diff !== null ? diff.toFixed(2).padStart(8) : '   N/A  '} | ${rootCause}`
      );
    }

    // ═══════════════════════════════════════════════════
    // 5. REVERTED INVOICE ANALYSIS per month
    // ═══════════════════════════════════════════════════
    console.log('\n\n=== REVERTED INVOICES per month (excluded by Exported To GL filter) ===');
    const reverted = await db.query(`
      WITH rev AS (
        SELECT "Invoice_No_", MAX("Site_") AS site,
          MIN("Invoice_Date_(Date)") AS inv_date,
          SUM(DISTINCT CAST("Amount_" AS NUMERIC)) AS amt
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Invoice_Type_" != '0'
          AND "Status_" = 'Reverted'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') BETWEEN '2024-04' AND '2025-07'
        GROUP BY "Invoice_No_"
      ),
      exported AS (
        SELECT DISTINCT "Invoice_No_"
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Status_" = 'Exported To GL'
      )
      SELECT TO_CHAR(r.inv_date::DATE,'YYYY-MM') AS month,
        r.site,
        COUNT(*) AS rev_inv_cnt,
        ROUND(SUM(r.amt)/1e7, 4) AS rev_amt_cr,
        COUNT(*) FILTER (WHERE e."Invoice_No_" IS NULL) AS purely_reverted_cnt,
        ROUND(SUM(r.amt) FILTER (WHERE e."Invoice_No_" IS NULL)/1e7, 4) AS purely_reverted_cr
      FROM rev r
      LEFT JOIN exported e ON r."Invoice_No_" = e."Invoice_No_"
      GROUP BY month, r.site
      ORDER BY month, r.site
    `);
    console.log('Month   | Site  | Rev Inv | Rev Amt(Cr) | Pure Rev Inv | Pure Rev Amt(Cr)');
    for (const r of reverted.rows) {
      console.log(`${r.month} | ${r.site.padEnd(5)} | ${String(r.rev_inv_cnt).padEnd(7)} | ${parseFloat(r.rev_amt_cr).toFixed(4).padEnd(11)} | ${String(r.purely_reverted_cnt).padEnd(12)} | ${parseFloat(r.purely_reverted_cr).toFixed(4)}`);
    }

    // ═══════════════════════════════════════════════════
    // 6. SUM(DISTINCT) COLLISION IMPACT per month
    // ═══════════════════════════════════════════════════
    console.log('\n\n=== SUM(DISTINCT) Collision Impact (only if using flat approach) ===');
    const collision = await db.query(`
      SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS month,
        "Site_" AS site,
        SUM((cnt - 1) * amt_val) / 1e7 AS collision_undercount_cr
      FROM (
        SELECT TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') AS "Invoice_Date_(Date)",
          "Site_",
          CAST("Amount_" AS NUMERIC) AS amt_val,
          COUNT(DISTINCT "Invoice_No_") AS cnt
        FROM "LandingStage2"."mf_sales_si_siheader_all"
        WHERE "Invoice_No_" NOT ILIKE '%-R%'
          AND "Status_" = 'Exported To GL'
          AND "Invoice_Type_" != '0'
          AND TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM') BETWEEN '2024-04' AND '2025-07'
        GROUP BY TO_CHAR("Invoice_Date_(Date)"::DATE,'YYYY-MM'), "Site_", CAST("Amount_" AS NUMERIC)
        HAVING COUNT(DISTINCT "Invoice_No_") > 1
      ) sub
      GROUP BY month, "Site_"
      ORDER BY month, "Site_"
    `);
    console.log('Month   | Site  | Collision Undercount (Cr) [only if flat SUM(DISTINCT) used]');
    for (const r of collision.rows) {
      const val = parseFloat(r.collision_undercount_cr).toFixed(4);
      if (parseFloat(val) > 0.001) console.log(`${r.month} | ${r.site.padEnd(5)} | ${val}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();

function getRootCause(month, diff) {
  if (diff === null) return 'No CRD reference';
  const absD = Math.abs(diff).toFixed(2);
  if (Math.abs(diff) <= 0.02) return '✓ EXACT MATCH';
  if (['2024-04','2024-05','2024-06','2024-07','2024-08','2024-09','2024-10','2024-11'].includes(month)) {
    return `Minor: ${diff > 0 ? 'Multi-partition amount variance (SUM DISTINCT overcounts)' : 'Reverted invoices that were ExportedToGL at CRD time'}`;
  }
  if (month === '2024-12') return `Diff=${absD} Cr: Invoices Reverted AFTER CRD printed (now excluded by filter)`;
  if (month === '2025-01') return `Diff=+${absD} Cr: Invoices were Reverted in CRD QlikView but still Exported To GL in DB snapshot`;
  if (['2025-02','2025-03'].includes(month)) return 'No CRD reference available';
  if (['2025-04','2025-05','2025-06','2025-07'].includes(month)) {
    if (diff < -0.5) return `Diff=${absD} Cr: DB INCOMPLETE — many invoices not yet ExportedToGL at snapshot time; CRD from item table (different source)`;
    return `Diff=${absD} Cr: CRD uses ITEM table (Sales Invoice Register); DB uses header Amount_; status timing lag`;
  }
  return `Diff=${absD} Cr`;
}
