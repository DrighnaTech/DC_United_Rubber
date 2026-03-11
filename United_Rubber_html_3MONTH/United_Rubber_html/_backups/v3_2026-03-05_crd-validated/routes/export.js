/**
 * routes/export.js
 * Data export endpoints
 *
 * GET /api/export?dashboard=<name>&type=excel|pdf
 *
 * Supported dashboards: sales-dashboard, invoice-summary, sales-analysis, sales-map
 * - Exclusion rule enforced in every query (Invoice_No_ NOT LIKE '%-R')
 * - Dedup first, filter after
 * - Filters respected from query params
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const ExcelJS  = require('exceljs');
const PDFDoc   = require('pdfkit');
const db       = require('../db/connection');
const { AMOUNT_EXPR, C, buildDedupCTE } = require('../services/queryBuilder');

function fmtCurrency(val) {
  const n = parseFloat(val) || 0;
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n);
}

/* ── Fetch export data ─────────────────────────────────────── */
async function fetchExportData(dashboard, filters) {
  const { cte, postFilter, values } = buildDedupCTE(filters);
  const baseWhere = postFilter || 'WHERE TRUE';

  switch (dashboard) {
    case 'sales-dashboard':
    case 'invoice-summary':
      return (await db.query(
        `${cte}
         SELECT
           "${C.invoiceNo}"                           AS "Invoice No",
           "${C.invoiceDate}"                         AS "Invoice Date",
           COALESCE("${C.customerName}", '')          AS "Customer",
           COALESCE("${C.invoiceType}", '')           AS "Invoice Type",
           COALESCE("${C.status}", '')                AS "Status",
           ${AMOUNT_EXPR}                             AS "Amount",
           COALESCE("${C.billState}", '')             AS "State",
           COALESCE("${C.billCity}", '')              AS "City"
         FROM deduped
         ${postFilter}
         ORDER BY "${C.invoiceDate}"::DATE DESC
         LIMIT 50000`,
        values
      )).rows;

    case 'sales-map':
      return (await db.query(
        `${cte}
         SELECT
           "${C.billState}"        AS "State",
           COUNT(*)                AS "Invoice Count",
           SUM(${AMOUNT_EXPR})     AS "Total Amount",
           AVG(${AMOUNT_EXPR})     AS "Avg Amount"
         FROM deduped
         ${baseWhere}
           AND "${C.billState}" IS NOT NULL AND "${C.billState}" != ''
         GROUP BY "${C.billState}"
         ORDER BY "Total Amount" DESC`,
        values
      )).rows;

    case 'sales-analysis':
      return (await db.query(
        `${cte}
         SELECT
           TO_CHAR("${C.invoiceDate}"::DATE, 'YYYY-MM') AS "Month",
           COUNT(*)                                      AS "Invoice Count",
           SUM(${AMOUNT_EXPR})                           AS "Total Amount",
           AVG(${AMOUNT_EXPR})                           AS "Avg Amount"
         FROM deduped
         ${baseWhere}
           AND "${C.invoiceDate}" IS NOT NULL
         GROUP BY "Month"
         ORDER BY "Month"`,
        values
      )).rows;

    default:
      throw new Error(`Unknown dashboard: ${dashboard}`);
  }
}

/* ── Excel Export ─────────────────────────────────────────── */
async function exportExcel(res, dashboard, filters) {
  const rows = await fetchExportData(dashboard, filters);
  if (!rows.length) return res.status(404).json({ error: 'No data to export' });

  const workbook  = new ExcelJS.Workbook();
  workbook.creator = 'United Rubber Sales Analytics';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Export', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
  });

  const headers = Object.keys(rows[0]);

  // Header row
  sheet.addRow(headers);
  const hr = sheet.getRow(1);
  hr.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
  hr.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C5E' } };
  hr.height    = 20;
  hr.alignment = { vertical: 'middle', horizontal: 'center' };

  // Column widths
  headers.forEach((h, i) => {
    sheet.getColumn(i + 1).width = Math.max(h.length + 4, 14);
  });

  // Data rows
  rows.forEach((row, idx) => {
    const vals   = Object.values(row).map(v => v === null || v === undefined ? '' : v);
    const dr     = sheet.addRow(vals);
    dr.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 0 ? 'FFF5F8FF' : 'FFFFFFFF' } };
    dr.border    = { bottom: { style: 'thin', color: { argb: 'FFD0D7E5' } } };
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${dashboard}-${Date.now()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

/* ── PDF Export ───────────────────────────────────────────── */
async function exportPDF(res, dashboard, filters) {
  const rows = await fetchExportData(dashboard, filters);
  if (!rows.length) return res.status(404).json({ error: 'No data to export' });

  const doc = new PDFDoc({ margin: 30, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${dashboard}-${Date.now()}.pdf"`);
  doc.pipe(res);

  // Title
  doc.fontSize(16).font('Helvetica-Bold')
     .text(`United Rubber — ${dashboard.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`, { align: 'center' });
  doc.fontSize(9).font('Helvetica')
     .text(`Generated: ${new Date().toLocaleString('en-IN')}  ·  Total Records: ${rows.length}`, { align: 'center' });
  doc.moveDown(0.8);

  const headers  = Object.keys(rows[0]);
  const colWidth = Math.floor((doc.page.width - 60) / headers.length);
  const startX   = 30;
  let   y        = doc.y;

  // Header row
  doc.rect(startX, y, doc.page.width - 60, 18).fill('#1A3C5E');
  doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
  headers.forEach((h, i) => {
    doc.text(h, startX + i * colWidth + 2, y + 4, { width: colWidth - 4, ellipsis: true });
  });
  doc.fillColor('black').font('Helvetica');
  y += 20;

  // Data (PDF: first 500 rows)
  const pdfRows = rows.slice(0, 500);
  pdfRows.forEach((row, rowIdx) => {
    if (y > doc.page.height - 60) {
      doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
      y = 30;
    }
    if (rowIdx % 2 === 0) doc.rect(startX, y, doc.page.width - 60, 16).fill('#F0F4FA');
    doc.fillColor('black').fontSize(7).font('Helvetica');
    Object.values(row).forEach((val, i) => {
      doc.text(String(val ?? ''), startX + i * colWidth + 2, y + 3, { width: colWidth - 4, ellipsis: true });
    });
    y += 17;
  });

  if (rows.length > 500) {
    doc.moveDown(1).fontSize(8).fillColor('gray')
       .text(`* PDF shows first 500 rows. Download Excel for full ${rows.length} records.`);
  }

  doc.end();
}

/* ── Route ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const { dashboard, type } = req.query;
  if (!dashboard) return res.status(400).json({ error: 'dashboard param required' });

  const filters = {
    status:       req.query.status,
    invoiceType:  req.query.invoice_type,
    dateFrom:     req.query.date_from,
    dateTo:       req.query.date_to,
    site:         req.query.site,
    shipState:    req.query.ship_state,
    customerName: req.query.customer_name,
  };

  try {
    if (type === 'pdf') await exportPDF(res, dashboard, filters);
    else                await exportExcel(res, dashboard, filters);
  } catch (err) {
    console.error('[export] Error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed', detail: err.message });
  }
});

module.exports = router;
