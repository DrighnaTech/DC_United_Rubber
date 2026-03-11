# United Rubber Sales Analytics System - Architecture Document

**Version:** 1.0
**Date:** 2026-03-06
**System:** United Rubber Sales Analytics Dashboard

---

## 1. System Overview

The United Rubber Sales Analytics System is a full-stack web application that provides real-time sales analytics, geographic distribution visualization, invoice management, and data export capabilities. It is built on a Node.js/Express backend with a PostgreSQL database hosted on DigitalOcean, and a static HTML/CSS/JavaScript frontend using Chart.js and Leaflet.js.

### 1.1 Technology Stack

| Layer       | Technology                             |
|-------------|----------------------------------------|
| Runtime     | Node.js >= 18.0.0                      |
| Backend     | Express.js 4.22.1                      |
| Database    | PostgreSQL (DigitalOcean Managed, SSL)  |
| DB Driver   | pg 8.19.0                              |
| Frontend    | Vanilla HTML5 / CSS3 / JavaScript (ES6)|
| Charts      | Chart.js (CDN)                         |
| Maps        | Leaflet.js (CDN)                       |
| Export      | ExcelJS 4.4.0 (Excel), PDFKit 0.15.2 (PDF) |
| Logging     | Morgan 1.10.1                          |
| Dev Server  | Nodemon 3.1.4                          |

---

## 2. Project Structure

```
United_Rubber_html/
|-- server.js                          # Express entry point
|-- package.json                       # Dependencies and scripts
|-- .env                               # Database credentials (not committed)
|
|-- db/
|   |-- connection.js                  # PostgreSQL pool + query wrapper + health check
|
|-- services/
|   |-- dbConfig.js                    # Schema, table names, column-name mapping
|   |-- queryBuilder.js                # CTE builders, amount expressions, pagination
|
|-- routes/
|   |-- filters.js                     # GET /api/filters
|   |-- salesDashboard.js              # GET /api/sales-dashboard[/table]
|   |-- salesDistributionMap.js        # GET /api/sales-map
|   |-- salesInvoiceSummary.js         # GET /api/invoice-summary[/table]
|   |-- salesSummaryAnalysis.js        # GET /api/sales-analysis
|   |-- export.js                      # GET /api/export
|
|-- public/
|   |-- index.html                     # SPA shell (4-tab dashboard)
|   |-- script.js                      # Frontend logic (API calls, charts, tables)
|   |-- style.css                      # Styling
|
|-- logo/                              # Company logo assets
|-- CRD/                               # Customer Reference Document (validation Excel)
|-- _backups/                          # Version backups
|-- ARCH/                              # This architecture documentation
```

---

## 3. Database Architecture

### 3.1 Connection Configuration

- **Host:** DigitalOcean Managed PostgreSQL (SSL required)
- **Database:** `DC_UnitedRubber`
- **Schema:** `LandingStage2`
- **SSL:** `{ rejectUnauthorized: false }`
- **Pool:** Max 20 connections, 30s idle timeout, 10s connection timeout, 2-min statement timeout

### 3.2 Tables

| Table | Description | Rows | Unique Keys |
|-------|-------------|------|-------------|
| `mf_sales_si_siheader_all` | Sales invoice header (primary) | ~265K | ~65,046 unique Invoice_No_ |
| `mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all` | Sales invoice item detail | ~373K | (Invoice_No_, Item_Code_) |
| `mf_importexport_esi_esiheader_...` | Export/Import header | ~2.9K | - |
| `mf_importexport_esi_esiitemdetail_all` | Export/Import item detail | ~70K | - |

### 3.3 Column Mapping (Header Table)

All columns are TEXT type in the database. Numeric values require explicit casting.

**Core Fields:**
| Logical Name    | DB Column                 | Description                        |
|-----------------|---------------------------|------------------------------------|
| invoiceNo       | `Invoice_No_`             | Primary key; "-R" suffix = reversal|
| invoiceDate     | `Invoice_Date_(Date)`     | ISO date string "YYYY-MM-DD"       |
| invoiceType     | `Invoice_Type_`           | Commercial, Sales Return, Service, Transfer |
| status          | `Status_`                 | Open, Approved, Released, Exported To GL, Reverted, Cancelled, Rejected |
| site            | `Site_`                   | URIFB, URIMH, URIMP, URIPB, URIPU |

**Financial Fields (all TEXT, cast to NUMERIC):**
| Logical Name    | DB Column                 | Description            |
|-----------------|---------------------------|------------------------|
| amount          | `Amount_`                 | Net Amount (pre-tax)   |
| amountGross     | `Invoice_Amount_`         | Gross Amount (incl. tax)|
| amountFinal     | `Final_Net_Amount_`       | Final Net Amount       |
| tax             | `Tax_`                    | Tax amount             |
| charge          | `Charge_`                 | Additional charges     |
| discount        | `Discount_`               | Discounts              |

**Geographic Fields (Ship-To used for maps, Bill-To secondary):**
| Logical Name    | DB Column                         |
|-----------------|-----------------------------------|
| shipState       | `Ship_To_Address_State`           |
| shipCity        | `Ship_To_Address_City`            |
| shipZone        | `Ship_to_Address_Zone`            |
| billState       | `Bill_To_Address_State`           |
| billCity        | `Bill_To_Address_City`            |

**Item Detail Fields:**
| Logical Name    | DB Column                 |
|-----------------|---------------------------|
| itemCode        | `Item_Code_`              |
| itemCategory    | `Item_Category_Description`|
| salesQty        | `Sales_Qty_`              |
| rate            | `Rate_`                   |

### 3.4 Data Characteristics

- **Date Range:** April 2024 - July 2025
- **Snapshot Duplication:** ~4x rows per invoice (weekly ETL snapshots). Requires deduplication.
- **Reversal Invoices:** Suffixed with "-R", always excluded via `NOT LIKE '%-R'`
- **Zero Statuses:** `Status_ = '0'` and `Invoice_Type_ = '0'` are metadata rows, always excluded
- **Sales Returns:** MHSRTN/MPSRTN invoices have zeroed-out shadow rows with amounts [-X, 0]
- **Item Shadow Rows:** Latest partition may have `Sales_Qty_ = '0'` or `'0.0'`; filtered with `COALESCE(NULLIF(qty,'')::NUMERIC,0) > 0`

---

## 4. Deduplication Strategy (Critical)

The database contains multiple snapshots of each invoice from weekly ETL loads. Two deduplication strategies are used depending on the query context.

### 4.1 buildDedupCTE — KPI/Summary Queries

**Purpose:** One row per Invoice_No_ for accurate totals.

**Strategy:** `GROUP BY "Invoice_No_"` with `SUM(DISTINCT amount)` for financial columns and `MAX()` for metadata columns. All user filters (status, type, date, site, state, customer) are applied INSIDE the WHERE clause before grouping.

```sql
WITH deduped AS (
  SELECT
    "Invoice_No_",
    MAX("Invoice_Date_(Date)")     AS "Invoice_Date_(Date)",
    MAX("Status_")                 AS "Status_",
    SUM(DISTINCT COALESCE(NULLIF("Amount_",'')::NUMERIC,0))::TEXT AS "Amount_",
    SUM(DISTINCT COALESCE(NULLIF("Invoice_Amount_",'')::NUMERIC,0))::TEXT AS "Invoice_Amount_",
    ...
  FROM "LandingStage2"."mf_sales_si_siheader_all"
  WHERE "Invoice_No_" NOT LIKE '%-R'
    AND "Status_" != '0'
    AND "Invoice_Type_" != '0'
    AND [user filters]
  GROUP BY "Invoice_No_"
)
```

**Why SUM(DISTINCT) instead of DISTINCT ON:**
- 15 invoices have different Amount_ values across partitions
- SUM(DISTINCT) correctly aggregates all distinct amounts
- Matches the Excel-validated reference query behavior

### 4.2 buildTrendCTE — Monthly Trend Queries

**Purpose:** Accurate monthly time-series data.

**Strategy:** `GROUP BY ("Invoice_No_", "Invoice_Date_(Date)")` — identical to buildDedupCTE except the date is included in the grouping key.

**Why:** Some invoices (especially Sales Returns) have different dates across partitions (e.g., dated 2024-08 in one partition, re-dated to 2025-04 in another). The CRD reference includes such invoices in BOTH months. buildDedupCTE's MAX(date) would assign each invoice to only one month, causing monthly totals to mismatch.

### 4.3 buildItemCTE — Item Detail Queries

**Purpose:** One row per (Invoice_No_, Item_Code_) for item-level aggregation.

**Strategy:** `DISTINCT ON ("Invoice_No_", "Item_Code_") ORDER BY row_id DESC` with a critical filter: `COALESCE(NULLIF("Sales_Qty_",'')::NUMERIC, 0) > 0` to skip zeroed-out shadow rows.

### 4.4 Filter-Inside-CTE Rule

All user filters go INSIDE the CTE WHERE clause, not as a post-filter on the deduped result. This is critical because an invoice that was "Exported To GL" in an older partition but "Reverted" in the latest partition would be MISSED by a post-filter approach. The filter-inside-CTE approach captures it correctly.

**Validated:** Status='Exported To GL', April 2024 = 12.88 Cr (matches CRD reference).

---

## 5. API Architecture

### 5.1 Middleware Stack

```
Client Request
  |-- CORS (open)
  |-- JSON body parser
  |-- Morgan logger (dev/combined)
  |-- Static file server (public/)
  |-- Static file server (/logo)
  |-- API Routes
  |-- SPA catch-all (index.html)
  |-- Global error handler
```

### 5.2 API Endpoints

All endpoints accept these common query parameters (filters):
- `status` — comma-separated Status_ values
- `invoice_type` — comma-separated Invoice_Type_ values
- `date_from` / `date_to` — ISO date range
- `site` — comma-separated Site_ values
- `ship_state` — comma-separated Ship_To_Address_State values
- `customer_name` — comma-separated Customer_Name_ values

---

#### GET /api/filters

Returns distinct dropdown values for the global filter bar.

**Response:**
```json
{
  "status":       ["Approved", "Cancelled", "Exported To GL", ...],
  "invoiceType":  ["Sales ( Commercial )", "Sales Return", ...],
  "site":         ["URIFB", "URIMH", "URIMP", "URIPB", "URIPU"],
  "shipState":    ["Chhattisgarh", "Gujarat", "Madhya Pradesh", ...],
  "customerName": ["Customer A", "Customer B", ...]  // max 500
}
```

---

#### GET /api/sales-dashboard

Executive overview KPIs, monthly trend, customer breakdowns, item categories.

**Dedup Strategy:** buildDedupCTE (KPIs), buildTrendCTE (monthly chart)

**Response:**
```json
{
  "kpi": {
    "total_invoices": 65046,
    "total_net_amount": "2824512345.67",
    "total_gross_amount": "3352712345.67",
    "total_tax": "528112345.67",
    "total_rate_cr": "7.88",
    "total_sales_qty": "26000000",
    "first_date": "2024-04-01",
    "last_date": "2025-07-15"
  },
  "status":        [{ "status": "Exported To GL", "invoice_count": 50000, "total_amount": "..." }],
  "monthly":       [{ "month_key": "2024-04", "month_label": "Apr 2024", "total_net": "...", "total_amount": "..." }],
  "customers":     [{ "customer_name": "...", "total_amount": "..." }],     // Top 10 by gross (bar chart)
  "customers_net": [{ "customer_name": "...", "net_amount": "..." }],       // Top 15 by net (pie chart)
  "itemCategory":  [{ "category": "...", "total_amount": "...", "total_qty": "..." }]
}
```

---

#### GET /api/sales-dashboard/table

Paginated invoice list.

**Additional Params:** `page`, `page_size`, `sort_by`, `sort_dir`

**Response:**
```json
{
  "total": 65046,
  "page": 1,
  "pageSize": 50,
  "totalPages": 1301,
  "rows": [{ "invoice_no": "...", "invoice_date": "...", "description": "...", ... }]
}
```

---

#### GET /api/sales-map

Geographic sales distribution by state, city, and zone.

**Dedup Strategy:** buildDedupCTE

**Response:**
```json
{
  "states": [{ "state": "Madhya Pradesh", "invoice_count": 30000, "total_amount": "...", "net_amount": "..." }],
  "cities": [{ "city": "Indore", "invoice_count": 5000, "total_qty": "800000" }],  // Top 20 by qty
  "zones":  [{ "zone": "West", "invoice_count": 20000, "total_amount": "..." }],
  "summary": {
    "total_revenue": 3352712345.67,
    "max_state_rev": 1231100000,
    "states_covered": 19
  }
}
```

---

#### GET /api/invoice-summary

Invoice summary KPIs and breakdowns.

**Dedup Strategy:** buildDedupCTE

**Response:**
```json
{
  "kpi": {
    "invoice_count": 65046,
    "total_amount": "...",
    "total_net_amount": "...",
    "total_tax": "...",
    "max_amount": "...",
    "unique_customers": 194
  },
  "statusBreakdown": [{ "status": "...", "invoice_count": "...", "total_amount": "...", "pct_count": "..." }],
  "typeBreakdown":   [{ "invoice_type": "...", "invoice_count": "...", "total_amount": "...", "pct_amount": "..." }],
  "monthly":         [{ "month_key": "...", "month_label": "...", "invoice_count": "...", "total_amount": "..." }]
}
```

---

#### GET /api/invoice-summary/table

Full paginated invoice detail table with 15 columns.

**Additional Params:** `page`, `page_size`, `sort_by`, `sort_dir`

**Columns:** invoice_no, invoice_date, site, customer_name, invoice_type, status, net_amount, tax, amount (gross), charge, discount, state, city, party_group, employee_name

---

#### GET /api/sales-analysis

Trend analysis with monthly, yearly, MoM, type/status/site breakdowns.

**Dedup Strategy:** buildTrendCTE (all queries)

**Response:**
```json
{
  "monthly":     [{ "month_key": "...", "total_net": "...", "total_amount": "..." }],
  "yearly":      [{ "year": 2024, "total_net": "...", "unique_customers": 150 }],
  "mom":         [{ "month_key": "...", "revenue": "...", "mom_growth_pct": "5.23" }],
  "typeTrend":   [{ "month_key": "...", "invoice_type": "...", "total_amount": "..." }],
  "statusTrend": [{ "month_key": "...", "status": "...", "total_amount": "..." }],
  "siteTrend":   [{ "month_key": "...", "site": "URIMH", "total_net": "...", "total_amount": "..." }],
  "dateRange":   { "min_date": "2024-04-01", "max_date": "2025-07-15" }
}
```

---

#### GET /api/export

Export data as Excel (.xlsx) or PDF.

**Params:** `dashboard` (required: sales-dashboard, invoice-summary, sales-analysis, sales-map), `type` (excel|pdf)

- Excel: Up to 50,000 rows, formatted with headers, alternating row colors
- PDF: Up to 500 rows (landscape A4), with pagination notice for larger datasets

---

#### GET /health

Server + database health check.

**Response:**
```json
{
  "status": "ok",
  "db": "connected",
  "timestamp": "2026-03-06T10:00:00.000Z",
  "env": "development"
}
```

---

## 6. Frontend Architecture

### 6.1 SPA Structure

The frontend is a single-page application with 4 tabs, a global filter bar, and a common header. No frontend framework is used — it is vanilla HTML/CSS/JS.

### 6.2 Dashboard Tabs

#### Tab 1: Sales Dashboard
- **KPIs (6):** Net Amount, Gross Amount, Rate (Cr), Tax, Sales Qty, No of Invoices
- **Charts:**
  - Monthly trend line chart (Net Amount over time)
  - Customer pie chart (Net Amount distribution)
  - Top 10 customers bar chart (Gross Amount)
  - Item category bar chart (by item amount)
- **Table:** Paginated invoice list

#### Tab 2: Sales Distribution Map
- **KPIs (3):** States covered, Total revenue, Top state
- **Charts:**
  - State revenue bar chart
  - City sales quantity bar chart (Top 20)
  - Interactive Leaflet.js choropleth map of India
- **Table:** State-wise revenue breakdown

#### Tab 3: Sales Invoice Summary
- **KPIs (4):** Invoice count, Total gross amount, Max invoice value, Unique customers
- **Table:** Full paginated invoice detail table (15 columns, sortable)
- **No additional charts** (per CRD specification)

#### Tab 4: Sales Summary Analysis
- **KPIs (4):** From Date, To Date, Net Amount, Gross Amount
- **Charts:**
  - Monthly trend line chart (Net + Gross)
  - Site-wise stacked bar chart (monthly by site)
- **Table:** Domestic pivot table (Month x Site breakdown)

### 6.3 Global Filter Bar

Positioned at the top of every tab. Filters include:
- Status (multi-select dropdown)
- Invoice Type (multi-select dropdown)
- Date Range (date picker: from/to)
- Site (multi-select dropdown)
- Ship State (multi-select dropdown)
- Customer Name (multi-select dropdown, max 500 options)

All filters are applied by re-fetching data from the API. Filter values are populated on page load from `GET /api/filters`.

### 6.4 External Libraries (CDN)

- **Chart.js** — All charts (line, bar, pie/doughnut)
- **Leaflet.js** — Interactive map with GeoJSON India state boundaries
- **Chart.js DataLabels plugin** — Value labels on charts

---

## 7. Data Flow

```
PostgreSQL (DigitalOcean)
  |
  | SSL Connection (pg pool, max 20)
  |
  v
db/connection.js (query wrapper + logging)
  |
  v
services/queryBuilder.js (CTE generation, dedup, filters, pagination)
  |
  v
routes/*.js (SQL assembly + response formatting)
  |
  v
Express.js (JSON API responses)
  |
  v
public/script.js (fetch API calls)
  |
  v
Chart.js / Leaflet.js / DOM (rendering)
```

### 7.1 Query Flow Detail

1. **Frontend** sends request with filter query params
2. **Route handler** extracts filters from `req.query`
3. **queryBuilder** generates parameterized CTE SQL with `$1..$n` placeholders
4. **Route handler** appends SELECT/GROUP BY/ORDER BY to the CTE
5. **db.query()** executes with parameter array (prevents SQL injection)
6. **Route handler** formats and returns JSON response
7. **Frontend** updates KPIs, charts, and tables

---

## 8. Amount Expression System

All financial columns are stored as TEXT in PostgreSQL. The queryBuilder defines safe casting expressions:

```javascript
AMOUNT_NET_EXPR     = COALESCE(NULLIF("Amount_", '')::NUMERIC, 0)           // Net Amount
AMOUNT_GROSS_EXPR   = COALESCE(NULLIF("Invoice_Amount_", '')::NUMERIC, 0)   // Gross Amount
AMOUNT_TAX_EXPR     = COALESCE(NULLIF("Tax_", '')::NUMERIC, 0)              // Tax
AMOUNT_CHARGE_EXPR  = COALESCE(NULLIF("Charge_", '')::NUMERIC, 0)           // Charges
AMOUNT_DISCOUNT_EXPR= COALESCE(NULLIF("Discount_", '')::NUMERIC, 0)         // Discounts
```

Inside the dedup CTE, amounts are aggregated as `SUM(DISTINCT ...)::TEXT` so the same expressions work on both raw and deduped data.

**Display Unit:** All dashboard amounts are displayed in Crores (Cr) = value / 10,000,000 (1 Crore = 10 Million).

---

## 9. Security Considerations

### 9.1 SQL Injection Prevention
- All queries use parameterized placeholders (`$1`, `$2`, ...)
- Column names come from the centralized `dbConfig.js` mapping, not user input
- Sort columns are whitelisted in `SORTABLE_COLUMNS`
- Pagination values are parsed as integers with bounds checking

### 9.2 Database Security
- SSL connection to DigitalOcean managed PostgreSQL
- Credentials stored in `.env` (not committed to version control)
- 2-minute statement timeout prevents runaway queries
- Connection pool limits prevent resource exhaustion

### 9.3 Application Security
- CORS enabled (currently open — restrict in production)
- No authentication implemented (intended for internal/intranet use)
- Export endpoints limit output size (50K Excel, 500 PDF)

---

## 10. Validated Reference Totals

These totals have been validated against the CRD (Customer Reference Document) Excel file:

| Metric            | Value                    |
|-------------------|--------------------------|
| Net Amount        | 282.45 Cr                |
| Gross Amount      | 335.27 Cr                |
| Tax               | 52.80 Cr                 |
| Total Invoices    | 65,046                   |
| Unique Customers  | 194                      |
| States Covered    | 19                       |
| Rate (Cr)         | 7.88                     |
| Sales Qty         | ~2.6 Cr units            |
| Top State         | Madhya Pradesh (123.11 Cr)|
| Top City (by Qty) | Indore                   |

### 10.1 Monthly Net Amount (Cr) — Exported To GL, Apr 2024 - Jan 2025

| Month    | Apr   | May   | Jun   | Jul   | Aug   | Sep   | Oct   | Nov   | Dec   | Jan   |
|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| CRD Ref  | 12.88 | 11.97 | 13.11 | 14.50 | 14.79 | 13.74 | 16.41 | 13.27 | 14.22 | 16.12 |
| System   | 12.88 | 11.97 | 13.11 | 14.50 | 14.78 | 13.74 | 16.41 | 13.27 | 14.15 | 15.81 |

**Note:** Minor discrepancies in Aug (0.01), Dec (0.07), and Jan (0.31) are attributed to data snapshot timing differences between the CRD source and the database, particularly at the URIMP site.

---

## 11. Deployment

### 11.1 Start Commands

```bash
# Production
cd "c:/UR html/United_Rubber_html"
node server.js

# Development (with auto-reload)
npm run dev
```

### 11.2 Environment Variables (.env)

```
DB_HOST=<digitalocean-host>
DB_PORT=25060
DB_NAME=DC_UnitedRubber
DB_USER=<username>
DB_PASSWORD=<password>
DB_SCHEMA=LandingStage2
NODE_ENV=development
PORT=3000
```

### 11.3 Dependencies

**Runtime:**
- express 4.22.1 — HTTP server and routing
- pg 8.19.0 — PostgreSQL client
- cors 2.8.6 — Cross-Origin Resource Sharing
- dotenv 16.6.1 — Environment variable loading
- morgan 1.10.1 — HTTP request logging
- exceljs 4.4.0 — Excel file generation
- pdfkit 0.15.2 — PDF file generation
- xlsx 0.18.5 — Excel file reading (CRD validation)

**Dev:**
- nodemon 3.1.4 — Auto-restart on file changes

---

## 12. Backup History

| Backup | Description |
|--------|-------------|
| `_backups/v5_2026-03-05_crd-aligned/` | CRD-aligned dashboard (all 4 tabs correct) |
| `_backups/v8_2026-03-05_ui-zindex-map-fix/` | Map z-index fix + filter-inside-CTE dedup fix |

---

## 13. Key Design Decisions Summary

1. **Filter-inside-CTE** — User filters applied before deduplication to correctly capture invoices that changed status across partitions
2. **SUM(DISTINCT) aggregation** — Handles invoices with different amounts across weekly snapshots
3. **Two CTE strategies** — buildDedupCTE (GROUP BY Invoice_No_) for KPIs vs buildTrendCTE (GROUP BY Invoice_No_ + Date) for monthly trends
4. **Ship-To for geography** — Map and geographic queries use Ship_To_Address_* fields per CRD requirement
5. **-R exclusion in SQL** — Reversal invoice filtering always happens server-side, never on the frontend
6. **TEXT column casting** — All amounts cast via COALESCE(NULLIF(col,'')::NUMERIC, 0) pattern for null/empty safety
7. **Item shadow-row fix** — Sales_Qty_ > 0 filter to skip zeroed-out partition rows (checked as NUMERIC, not string comparison)
8. **Rate KPI via CRD method** — SUM(DISTINCT Rate_) grouped by (Invoice_No_, Item_Code_, Sales_Qty_) / 10M = Cr
