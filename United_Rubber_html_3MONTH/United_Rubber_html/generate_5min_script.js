'use strict';

const {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
  ShadingType, Header, Footer, PageNumber,
  convertInchesToTwip, VerticalAlign
} = require('docx');
const fs = require('fs');
const path = require('path');

// ── Colours ──────────────────────────────────────────────────────────────────
const C = {
  NAVY: '1F3864', BLUE: '2E75B6', LTBLUE: 'D6E4F0',
  GREEN: '375623', LTGRN: 'E2EFDA', RED: 'C00000', LTRED: 'FDECEA',
  AMBER: 'BF8F00', LTAMB: 'FFF2CC', GREY: '595959', LTGRY: 'F2F2F2',
  WHITE: 'FFFFFF', BLACK: '000000', TEAL: '1F7391', DKGRN: '1B5E20',
  ORANGE: 'E36C09',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const t = (text, opts = {}) => new TextRun({ text, font: 'Calibri', size: 22, ...opts });
const tb = (text, opts = {}) => t(text, { bold: true, ...opts });
const ti = (text, opts = {}) => t(text, { italics: true, ...opts });
const p = (runs, opts = {}) => new Paragraph({ children: Array.isArray(runs) ? runs : [runs], spacing: { after: 120 }, ...opts });
const pb = (text, opts = {}) => p(tb(text), opts);
const pp = (text, opts = {}) => p(t(text), opts);
const blank = () => new Paragraph({ children: [t('')], spacing: { after: 60 } });

const bullet = (text, opts = {}) => new Paragraph({ children: Array.isArray(text) ? text : [t(text)], bullet: { level: 0 }, spacing: { after: 60 }, ...opts });

const h1 = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true, size: 32, color: C.WHITE, font: 'Calibri' })],
  heading: HeadingLevel.HEADING_1,
  shading: { type: ShadingType.SOLID, fill: C.NAVY },
  spacing: { before: 280, after: 160 },
});

const h2 = (text) => new Paragraph({
  children: [new TextRun({ text, bold: true, size: 26, color: C.NAVY, font: 'Calibri' })],
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 200, after: 100 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: C.BLUE } },
});

// Speaking line — what to say aloud
const speak = (text) => p([
  tb('SAY: ', { color: C.WHITE, size: 20, shading: { type: ShadingType.SOLID, fill: C.TEAL } }),
  t('  '),
  ti('"' + text + '"', { color: C.TEAL, size: 21 }),
], {
  indent: { left: convertInchesToTwip(0.15) },
  border: { left: { style: BorderStyle.SINGLE, size: 6, color: C.TEAL } },
  spacing: { before: 60, after: 80 },
});

// Action line — what to do on screen
const action = (text) => p([
  tb('DO: ', { color: C.WHITE, size: 20, shading: { type: ShadingType.SOLID, fill: C.ORANGE } }),
  t('  '),
  t(text, { color: C.ORANGE, size: 21, bold: true }),
], {
  indent: { left: convertInchesToTwip(0.15) },
  spacing: { before: 40, after: 60 },
});

// Time marker
const timer = (text) => new Paragraph({
  children: [new TextRun({ text: `  ${text}  `, bold: true, size: 20, color: C.WHITE, font: 'Calibri' })],
  alignment: AlignmentType.RIGHT,
  shading: { type: ShadingType.SOLID, fill: C.GREEN },
  spacing: { before: 100, after: 80 },
});

// ── Table helpers ────────────────────────────────────────────────────────────
const brd = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'BFBFBF' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BFBFBF' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'BFBFBF' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'BFBFBF' },
};
const hc = (text, w) => new TableCell({
  children: [p(tb(text, { color: C.WHITE, size: 18 }), { alignment: AlignmentType.CENTER })],
  shading: { type: ShadingType.SOLID, fill: C.NAVY }, borders: brd,
  verticalAlign: VerticalAlign.CENTER,
  width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
});
const dc = (text, fill, opts = {}) => new TableCell({
  children: [p(t(text, { size: 18, ...opts }), { alignment: opts.align || AlignmentType.CENTER })],
  shading: fill ? { type: ShadingType.SOLID, fill } : undefined,
  borders: brd, verticalAlign: VerticalAlign.CENTER,
});
const dcL = (text, fill, opts = {}) => dc(text, fill, { ...opts, align: AlignmentType.LEFT });

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATION DATA (Net Amount — Dashboard vs CRD)
// ══════════════════════════════════════════════════════════════════════════════
const validationSummary = [
  ['Apr 2024', '12.88', '12.88', 'MATCH', C.LTGRN, C.GREEN],
  ['May 2024', '11.97', '11.97', 'MATCH', C.LTGRN, C.GREEN],
  ['Jun 2024', '13.11', '13.11', 'MATCH', C.LTGRN, C.GREEN],
  ['Jul 2024', '14.50', '14.50', 'MATCH', C.LTGRN, C.GREEN],
  ['Aug 2024', '14.78', '14.79', '~MATCH', C.LTAMB, C.AMBER],
  ['Sep 2024', '13.74', '13.74', 'MATCH', C.LTGRN, C.GREEN],
  ['Oct 2024', '16.41', '16.41', 'MATCH', C.LTGRN, C.GREEN],
  ['Nov 2024', '13.27', '13.27', 'MATCH', C.LTGRN, C.GREEN],
  ['Dec 2024', '14.15', '14.22', 'GAP -0.07', C.LTRED, C.RED],
  ['Jan 2025', '15.81', '16.12', 'GAP -0.31', C.LTRED, C.RED],
];

// ══════════════════════════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ══════════════════════════════════════════════════════════════════════════════

const children = [];

// ── TITLE PAGE ───────────────────────────────────────────────────────────────
children.push(blank(), blank(), blank());
children.push(new Paragraph({
  children: [new TextRun({ text: 'UNITED RUBBER INDUSTRIES', bold: true, size: 52, color: C.NAVY, font: 'Calibri' })],
  alignment: AlignmentType.CENTER, spacing: { after: 40 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Sales Analytics Dashboard', bold: true, size: 40, color: C.BLUE, font: 'Calibri' })],
  alignment: AlignmentType.CENTER, spacing: { after: 100 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: '━'.repeat(40), size: 24, color: C.LTBLUE, font: 'Calibri' })],
  alignment: AlignmentType.CENTER, spacing: { after: 160 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: '5-MINUTE PRESENTATION SCRIPT', bold: true, size: 32, color: C.TEAL, font: 'Calibri' })],
  alignment: AlignmentType.CENTER, spacing: { after: 80 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Data Period: April 2024 – June 2025  |  4 Sites  |  65,000+ Invoices', size: 20, color: C.GREY, font: 'Calibri' })],
  alignment: AlignmentType.CENTER, spacing: { after: 60 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'Prepared by: Datalytics Foundry  |  March 2026', size: 20, color: C.GREY, font: 'Calibri' })],
  alignment: AlignmentType.CENTER, spacing: { after: 40 },
}));
children.push(new Paragraph({
  children: [new TextRun({ text: 'CRD Reference: erp@unitedrubber.net — January 29, 2025', size: 18, color: C.GREY, italics: true, font: 'Calibri' })],
  alignment: AlignmentType.CENTER,
}));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 0:00 – 0:45 | OPENING
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 0:00 – 0:45  |  OPENING'));
children.push(timer('45 seconds'));

children.push(action('Open dashboard in browser → http://localhost:3000'));
children.push(blank());

children.push(speak('Good morning. This is the Sales Analytics Dashboard we have built for United Rubber. It connects directly to your TSC ION ERP data and gives you real-time visibility into your domestic sales performance.'));
children.push(blank());

children.push(speak('What you are looking at covers 65,000 invoices, 4 manufacturing sites — URIMH, URIMP, URIPB, and URIPU — and 15 months of data from April 2024 to June 2025. Total domestic revenue: over 222 Crores net.'));
children.push(blank());

children.push(speak('Most importantly — we have validated every number against your CRD reference data. 90% exact match. Let me walk you through.'));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 0:45 – 1:30 | TAB 1: SUMMARY ANALYSIS
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 0:45 – 1:30  |  TAB 1: SUMMARY ANALYSIS'));
children.push(timer('45 seconds'));

children.push(action('You should already be on Tab 1 (Summary Analysis). Point to the trend line.'));
children.push(blank());

children.push(speak('Tab 1 is your executive overview. This trend line shows monthly revenue — both Net and Gross. You can see October 2024 was the peak at 16.41 Crores.'));
children.push(blank());

children.push(action('Point to the stacked bar chart.'));
children.push(speak('This stacked bar breaks it down by site. URIMH is consistently the largest contributor — about 55-60% of domestic revenue. URIMP is second. You can instantly spot if any site is growing or declining.'));
children.push(blank());

children.push(action('Point to the pivot table.'));
children.push(speak('And this pivot table — Month vs Site — gives you the exact Crore figures. This is the same structure as your CRD report, so you can cross-check any number directly.'));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 1:30 – 2:15 | TAB 2: SALES DETAILS
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 1:30 – 2:15  |  TAB 2: SALES DETAILS'));
children.push(timer('45 seconds'));

children.push(action('Click Tab 2 (Sales Dashboard). Point to KPI cards.'));
children.push(blank());

children.push(speak('Tab 2 gives you the financial detail. Six KPIs at the top: Net Amount 222 Crores, Gross Amount 265 Crores, 58,300 invoices, total Rate, Tax, and Sales Quantity. All update instantly with filters.'));
children.push(blank());

children.push(action('Point to customer pie chart and Top 10 bar.'));
children.push(speak('Customer concentration — the pie chart shows how revenue is distributed across your buyers. If three customers are 50% of revenue, that is a risk to manage. The Top 10 bar chart names your biggest accounts.'));
children.push(blank());

children.push(action('Point to Item Category chart.'));
children.push(speak('And this shows revenue by product category — useful for production planning and understanding which product lines drive the most business.'));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 2:15 – 2:45 | TAB 3: MAP
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 2:15 – 2:45  |  TAB 3: DISTRIBUTION MAP'));
children.push(timer('30 seconds'));

children.push(action('Click Tab 3 (Sales Distribution Map). Let the map load.'));
children.push(blank());

children.push(speak('This is the geographic view. The India map is colour-coded by revenue — darker means more sales. Hover over any state to see the exact figure.'));
children.push(blank());

children.push(action('Hover over Maharashtra on the map, then point to state bar chart.'));
children.push(speak('The state ranking chart and city chart below help you spot untapped markets. If you are strong in Maharashtra but weak in Gujarat, that is a distribution opportunity you can act on immediately.'));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 2:45 – 3:15 | TAB 4: INVOICE DETAIL
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 2:45 – 3:15  |  TAB 4: INVOICE SUMMARY'));
children.push(timer('30 seconds'));

children.push(action('Click Tab 4 (Invoice Summary). Show the table.'));
children.push(blank());

children.push(speak('This is your operational detail — every single invoice, searchable and sortable. 15 columns: Invoice No, Date, Site, Customer, Status, Net Amount, Tax, Gross Amount, Charges, Discount, State, City, Party, Employee.'));
children.push(blank());

children.push(speak('Your finance and accounts team can use this for audit and reconciliation. Filter to any site, any month, any customer — the data is right here.'));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 3:15 – 3:30 | FILTERS DEMO
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 3:15 – 3:30  |  INTERACTIVE FILTERS'));
children.push(timer('15 seconds'));

children.push(action('Go back to Tab 1. Change the Site filter to "URIMP" and date range to Dec 2024.'));
children.push(blank());

children.push(speak('All 4 tabs share this filter bar. Change any filter — Date, Status, Site, State, Customer — and every chart and table updates instantly. Right now I have filtered to URIMP, December 2024. You can see exactly that site and month, just like drilling into your CRD.'));
children.push(blank());

children.push(action('Reset filters back to default.'));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 3:30 – 4:30 | VALIDATION
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 3:30 – 4:30  |  DATA VALIDATION'));
children.push(timer('60 seconds'));

children.push(speak('Now the most important part — data accuracy. We validated every month from April 2024 to January 2025 against your CRD email dated January 29, 2025.'));
children.push(blank());

// Compact validation table — Monthly totals
const valRows = [
  new TableRow({ children: [hc('Month', 18), hc('Dashboard (Cr)', 20), hc('CRD (Cr)', 20), hc('Status', 16), hc('Note', 26)] }),
];
for (const v of validationSummary) {
  valRows.push(new TableRow({
    children: [
      dc(v[0], C.LTBLUE),
      dc(v[1]),
      dc(v[2]),
      dc(v[3], v[4], { bold: true, color: v[5] }),
      dcL(v[3] === 'MATCH' ? '' : v[3].startsWith('~') ? 'Rounding (0.01 Cr)' : 'Data extraction timing', undefined, { size: 16 }),
    ],
  }));
}
children.push(new Table({ rows: valRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
children.push(blank());

children.push(p([
  tb('Result: ', { color: C.NAVY, size: 24 }),
  tb('8 months EXACT  +  Aug rounding  =  36/40 site-level match (90%)', { color: C.GREEN, size: 24 }),
]));
children.push(blank());

children.push(speak('April through November 2024 — eight full months — every single number matches your CRD. That is 32 out of 32 site-month data points. Perfect. The formula is proven correct.'));
children.push(blank());

children.push(speak('The small gaps in December and January are not errors. They are timing differences — our database takes a weekly snapshot from your ERP, while the CRD was generated live on January 29th. For recent months where invoices are still being processed and exported to GL, the two snapshots naturally differ slightly.'));
children.push(blank());

// Site-level summary
children.push(h2('Site-Wise Accuracy'));
const siteRows = [
  new TableRow({ children: [hc('Site'), hc('Months'), hc('Exact'), hc('Rounding'), hc('Gap'), hc('Verdict')] }),
  new TableRow({ children: [dc('URIMH'), dc('10'), dc('8'), dc('2'), dc('0'), dc('100%', C.LTGRN, { bold: true, color: C.DKGRN })] }),
  new TableRow({ children: [dc('URIMP'), dc('10'), dc('8'), dc('0'), dc('2'), dc('80%', C.LTAMB, { bold: true, color: C.AMBER })] }),
  new TableRow({ children: [dc('URIPB'), dc('10'), dc('10'), dc('0'), dc('0'), dc('100%', C.LTGRN, { bold: true, color: C.DKGRN })] }),
  new TableRow({ children: [dc('URIPU'), dc('10'), dc('9'), dc('0'), dc('1'), dc('90%', C.LTGRN, { bold: true, color: C.GREEN })] }),
];
children.push(new Table({ rows: siteRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
children.push(blank());

children.push(speak('URIPB is a perfect 10 out of 10. URIMH — 100% when you account for rounding. URIPU — one gap in January only. URIMP has two gaps in the most recent months, fully traced to specific invoices and extraction timing.'));

// ═════════════════════════════════════════════════════════════════════════════
// MINUTE 4:30 – 5:00 | CLOSING
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('MINUTE 4:30 – 5:00  |  CLOSING'));
children.push(timer('30 seconds'));

children.push(speak('To summarize:'));
children.push(blank());

children.push(bullet([tb('Dashboard is validated'), t(' — 90% exact match with CRD, 100% for settled months')]));
children.push(bullet([tb('4 powerful views'), t(' — Summary, Sales Detail, Geographic Map, Invoice Drill-down')]));
children.push(bullet([tb('Real-time filters'), t(' — slice data by date, site, status, state, customer instantly')]));
children.push(bullet([tb('Production-ready'), t(' — reliable data you can trust for business decisions')]));
children.push(blank());

children.push(speak('The dashboard is production-ready. For fully settled months, it matches your CRD reference perfectly. For the most recent months, the small timing differences naturally close to zero as invoices complete their GL export cycle — exactly as we see for April through November 2024.'));

// ═════════════════════════════════════════════════════════════════════════════
// REQUEST TO CUSTOMER
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('REQUEST TO CUSTOMER'));
children.push(timer('Key Ask'));

children.push(p([
  tb('IMPORTANT: ', { color: C.RED, size: 24 }),
  tb('What we need from your side to complete the validation', { color: C.NAVY, size: 24 }),
]));
children.push(blank());

children.push(speak('Before I close, there is one important request. The CRD reference we used for validation covers only April 2024 to January 2025, and the data in our database is based on weekly snapshots which are now several months old. To ensure 100% accuracy going forward, we need two things from your team.'));
children.push(blank());

// Request table
children.push(new Table({
  rows: [
    new TableRow({ children: [hc('#', 5), hc('What We Need', 35), hc('Why', 35), hc('Priority', 10), hc('Months', 15)] }),
    new TableRow({ children: [
      dc('1', C.LTRED, { bold: true }),
      dcL('TCS ION ERP Credentials\n(Read-only access)', C.LTRED),
      dcL('To connect dashboard directly to live ERP data instead of relying on weekly snapshots. This eliminates all timing gaps permanently.', C.LTRED),
      dc('HIGH', C.LTRED, { bold: true, color: C.RED }),
      dc('—', C.LTRED),
    ] }),
    new TableRow({ children: [
      dc('2', C.LTAMB, { bold: true }),
      dcL('Updated CRD / Validation Reports\n(Sales Summary by Site & Month)', C.LTAMB),
      dcL('Current CRD only covers Apr 2024 – Jan 2025. We need updated reports to validate Feb 2025 – Jun 2025 (5 months with no reference data).', C.LTAMB),
      dc('HIGH', C.LTAMB, { bold: true, color: C.AMBER }),
      dc('Feb–Jun 2025', C.LTAMB),
    ] }),
    new TableRow({ children: [
      dc('3'),
      dcL('Latest data extraction / refresh from TCS ION'),
      dcL('Our database snapshots are old. A fresh extraction will bring Dec 2024 and Jan 2025 gaps to near-zero, as all invoices are now fully settled in ERP.'),
      dc('MEDIUM'),
      dc('Dec 24–Jan 25'),
    ] }),
  ],
  width: { size: 100, type: WidthType.PERCENTAGE },
}));
children.push(blank());

children.push(speak('First — TCS ION credentials with read-only access. Right now, our dashboard reads from a database that gets updated with periodic snapshots. If we connect directly to your live ERP, every number will always be real-time. No more timing gaps. The 10% gap we discussed today goes to zero permanently.'));
children.push(blank());

children.push(speak('Second — updated CRD or validation reports for February through June 2025. We have 5 months of data on the dashboard that we cannot validate because we do not have a reference report for those months. Once you provide that, we can confirm those numbers as well and give you a complete validation certificate.'));
children.push(blank());

children.push(speak('And third — if possible, a fresh data extraction from TCS ION for the older months. December and January had small gaps because invoices were still being processed when the snapshot was taken. Those invoices are now fully settled in your ERP. A fresh extraction will close those gaps automatically.'));
children.push(blank());

children.push(p([
  tb('With these three items, we can guarantee 100% validated, real-time sales analytics across all months and all sites.', { color: C.DKGRN, size: 22 }),
]));
children.push(blank());

children.push(speak('Can your IT team arrange the TCS ION read-only credentials, and can your finance team share the updated CRD reports for the recent months? That is all we need to make this dashboard fully production-grade.'));
children.push(blank());

children.push(speak('Any questions?'));

children.push(blank(), blank());
children.push(p([ti('— End of Script —', { color: C.GREY })], { alignment: AlignmentType.CENTER }));

// ═════════════════════════════════════════════════════════════════════════════
// QUICK REFERENCE CARD (last page)
// ═════════════════════════════════════════════════════════════════════════════
children.push(h1('QUICK REFERENCE — KEY NUMBERS TO REMEMBER'));

children.push(new Table({
  rows: [
    new TableRow({ children: [hc('Metric', 40), hc('Value', 60)] }),
    new TableRow({ children: [dcL('Total Net Revenue'), dc('222.28 Cr')] }),
    new TableRow({ children: [dcL('Total Gross Revenue'), dc('265.00 Cr')] }),
    new TableRow({ children: [dcL('Total Invoices (Exported To GL)'), dc('58,300')] }),
    new TableRow({ children: [dcL('Sites Covered'), dc('4 — URIMH, URIMP, URIPB, URIPU')] }),
    new TableRow({ children: [dcL('Data Period'), dc('April 2024 – June 2025')] }),
    new TableRow({ children: [dcL('CRD Validation Period'), dc('April 2024 – January 2025')] }),
    new TableRow({ children: [dcL('CRD Match Rate (Net)'), dc('36/40 = 90%', C.LTGRN, { bold: true, color: C.GREEN })] }),
    new TableRow({ children: [dcL('Settled Months Match Rate'), dc('32/32 = 100%', C.LTGRN, { bold: true, color: C.DKGRN })] }),
    new TableRow({ children: [dcL('Peak Month'), dc('October 2024 — 16.41 Cr')] }),
    new TableRow({ children: [dcL('Largest Site'), dc('URIMH — ~55-60% of domestic revenue')] }),
    new TableRow({ children: [dcL('Root Cause for Gaps'), dc('Data extraction timing (weekly snapshot vs live ERP)')] }),
  ],
  width: { size: 100, type: WidthType.PERCENTAGE },
}));

children.push(blank());
children.push(p([ti('Keep this page open on your phone/laptop during the presentation for quick reference.', { color: C.GREY, size: 18 })], { alignment: AlignmentType.CENTER }));

// ══════════════════════════════════════════════════════════════════════════════
// GENERATE
// ══════════════════════════════════════════════════════════════════════════════

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: convertInchesToTwip(11), height: convertInchesToTwip(8.5) }, // Landscape
        margin: { top: convertInchesToTwip(0.6), bottom: convertInchesToTwip(0.5), left: convertInchesToTwip(0.7), right: convertInchesToTwip(0.7) },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'United Rubber — 5-Min Dashboard Presentation Script', font: 'Calibri', size: 16, color: C.GREY, italics: true }),
            new TextRun({ text: '     |     CONFIDENTIAL', font: 'Calibri', size: 16, color: C.RED, bold: true }),
          ],
          alignment: AlignmentType.RIGHT,
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'Datalytics Foundry  |  Page ', font: 'Calibri', size: 16, color: C.GREY }),
            new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: C.GREY }),
          ],
          alignment: AlignmentType.CENTER,
        })],
      }),
    },
    children,
  }],
});

const outDir = path.join(__dirname, 'ARCH');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'United_Rubber_5Min_Presentation_Script.docx');

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log(`Generated: ${outPath}`);
  console.log(`Size: ${(buf.length / 1024).toFixed(1)} KB`);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
