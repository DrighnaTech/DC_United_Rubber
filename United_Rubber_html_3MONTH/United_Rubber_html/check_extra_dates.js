'use strict';
require('dotenv').config();
const db = require('./db/connection');

(async () => {
  const extra = ['LINV252605801','LINV252605083','PINV/252605396','PINV/252605443','PINV/252605354','PINV/252605349','PINV/252605258'];
  const res = await db.query(`
    SELECT "Invoice_No_" AS inv, "Invoice_Date_(Date)" AS dt, "Site_" AS site,
      SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0)) AS net
    FROM "LandingStage2"."mf_sales_si_siheader_all"
    WHERE "Invoice_No_" = ANY($1)
      AND "Invoice_No_" NOT LIKE '%-R'
      AND "Status_" = 'Exported To GL'
      AND "Invoice_Type_" = 'Sales ( Commercial )'
    GROUP BY "Invoice_No_", "Invoice_Date_(Date)", "Site_"
    ORDER BY "Invoice_Date_(Date)"
  `, [extra]);
  console.log('Extra DB invoices dates:');
  for (const r of res.rows) {
    console.log(`  ${r.inv} | ${r.dt} | ${r.site} | ${parseFloat(r.net).toFixed(2)}`);
  }

  // Also check: are there CRD invoices on Jul 16?
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('./Validation_Month_csv/Jul_2025.xlsx');
  const ws = wb.getWorksheet('Sheet1');
  const jul16Invs = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const dt = row.getCell(3).value;
    if (dt instanceof Date && dt.toISOString().slice(0,10) === '2025-07-16') {
      jul16Invs.push(row.getCell(2).value);
    }
  });
  const uniqueJul16 = [...new Set(jul16Invs)];
  console.log(`\nCRD invoices on Jul 16: ${uniqueJul16.length}`);
  console.log('Sample:', uniqueJul16.slice(0,10).join(', '));

  process.exit(0);
})();
