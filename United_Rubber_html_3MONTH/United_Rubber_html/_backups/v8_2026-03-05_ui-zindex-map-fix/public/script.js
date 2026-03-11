/**
 * script.js
 * United Rubber — Sales Analytics Frontend
 *
 * Architecture:
 *  - Global filter bar → sends params to active tab only
 *  - Each tab has its own init / refresh functions
 *  - All Chart.js instances stored in `charts` map (destroyed before recreating)
 *  - Leaflet map initialised once, choropleth layer rebuilt on filter change
 *  - No data is hardcoded — all comes from backend API
 *  - No aggregation done here — only rendering
 */

'use strict';

/* ═══════════════════════════════════════════════
   GLOBALS
═══════════════════════════════════════════════ */
const API = '';  // same origin — backend serves frontend on same Express server

// Chart.js instances (destroy before recreate to avoid canvas re-use errors)
const charts = {};

// Leaflet map instance (initialised once)
let leafletMap   = null;
let geojsonLayer = null;
let indiaGeoJson = null;   // cached GeoJSON

// Active tab id
let activeTab = 'sales-analysis';

// Table state per tab
const tableState = {
  'sales-dashboard': { page: 1, sort: 'invoice_date', dir: 'desc' },
  'invoice-summary': { page: 1, sort: 'invoice_date', dir: 'desc' },
};

/* ═══════════════════════════════════════════════
   INITIALISATION
═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await loadFilterOptions();
  loadTab('sales-dashboard');
});

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════
   MULTI-SELECT HELPERS
═══════════════════════════════════════════════ */
const MS_DEFAULTS = {
  filterStatus:       'All Statuses',
  filterInvoiceType:  'All Types',
  filterSite:         'All Sites',
  filterShipState:    'All States',
  filterCustomerName: 'All Customers',
};

/** Escape HTML for safe attribute injection */
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Populate a multi-select dropdown with checkbox options */
function buildMultiSelect(id, values) {
  const dropdown = document.getElementById('ms-dropdown-' + id);
  if (!dropdown) return;
  dropdown.innerHTML = values.map(v => `
    <label class="ms-option">
      <input type="checkbox" value="${escHtml(v)}"
             onchange="updateMultiSelectLabel('${id}'); onFilterChange()">
      <span>${escHtml(v)}</span>
    </label>`).join('');
  updateMultiSelectLabel(id);
}

/** Populate a multi-select with search box + Select All + count (for large option lists) */
function buildSearchableMultiSelect(id, values, placeholder) {
  const dropdown = document.getElementById('ms-dropdown-' + id);
  if (!dropdown) return;
  const total = values.length;
  const opts = values.map(v => `
    <label class="ms-option">
      <input type="checkbox" value="${escHtml(v)}"
             onchange="updateMultiSelectLabel('${id}'); syncSelectAll('${id}'); onFilterChange()">
      <span>${escHtml(v)}</span>
    </label>`).join('');
  dropdown.innerHTML = `
    <div class="ms-search">
      <input type="text" class="ms-search-input" placeholder="${escHtml(placeholder || 'Search…')}"
             oninput="filterMsOptions('${id}', this.value)"
             onclick="event.stopPropagation()"
             autocomplete="off" />
      <span class="ms-count" id="ms-count-${id}">${total} items</span>
    </div>
    <div class="ms-select-all-row">
      <label class="ms-option ms-select-all-label">
        <input type="checkbox" id="ms-all-${id}"
               onchange="toggleSelectAll('${id}', this.checked)"
               onclick="event.stopPropagation()">
        <span>Select All</span>
      </label>
    </div>
    <div class="ms-options-list" id="ms-options-${id}">${opts}</div>`;
  updateMultiSelectLabel(id);
}

/** Filter visible options; update count display */
function filterMsOptions(id, query) {
  const list = document.getElementById('ms-options-' + id);
  if (!list) return;
  const q = (query || '').toLowerCase();
  let visible = 0;
  list.querySelectorAll('.ms-option').forEach(opt => {
    const text = (opt.querySelector('span')?.textContent || '').toLowerCase();
    const show = text.includes(q);
    opt.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const countEl = document.getElementById('ms-count-' + id);
  if (countEl) countEl.textContent = visible + ' item' + (visible !== 1 ? 's' : '');
  syncSelectAll(id);
}

/** Select / deselect all currently visible options */
function toggleSelectAll(id, checked) {
  const list = document.getElementById('ms-options-' + id);
  if (!list) return;
  list.querySelectorAll('.ms-option').forEach(opt => {
    if (opt.style.display !== 'none') {
      const cb = opt.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = checked;
    }
  });
  updateMultiSelectLabel(id);
  onFilterChange();
}

/** Sync the Select All checkbox state based on visible checked items */
function syncSelectAll(id) {
  const list   = document.getElementById('ms-options-' + id);
  const allCb  = document.getElementById('ms-all-' + id);
  if (!list || !allCb) return;
  const visible  = Array.from(list.querySelectorAll('.ms-option')).filter(o => o.style.display !== 'none');
  const checked  = visible.filter(o => o.querySelector('input')?.checked);
  allCb.indeterminate = checked.length > 0 && checked.length < visible.length;
  allCb.checked = visible.length > 0 && checked.length === visible.length;
}

/** Toggle open/close of a multi-select dropdown */
function toggleMultiSelect(id) {
  const dropdown = document.getElementById('ms-dropdown-' + id);
  const trigger  = document.getElementById('ms-trigger-' + id);
  const isOpen   = dropdown.classList.contains('open');
  // Close all dropdowns first
  document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.ms-trigger').forEach(t => t.classList.remove('open'));
  if (!isOpen) {
    dropdown.classList.add('open');
    trigger.classList.add('open');
  }
}

/** Update the trigger label text based on checked items */
function updateMultiSelectLabel(id) {
  const dropdown = document.getElementById('ms-dropdown-' + id);
  const textEl   = document.getElementById('ms-text-' + id);
  if (!dropdown || !textEl) return;
  const checked = Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'));
  const def = MS_DEFAULTS[id] || 'All';
  if (checked.length === 0) {
    textEl.textContent = def;
    textEl.classList.remove('ms-has-selection');
  } else if (checked.length === 1) {
    textEl.textContent = checked[0].value;
    textEl.classList.add('ms-has-selection');
  } else {
    textEl.textContent = checked.length + ' selected';
    textEl.classList.add('ms-has-selection');
  }
}

/** Get comma-separated checked values from a multi-select dropdown */
function getMultiSelectValues(id) {
  const dropdown = document.getElementById('ms-dropdown-' + id);
  if (!dropdown) return '';
  return Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value)
    .join(',');
}

// Close dropdowns when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.ms-wrapper')) {
    document.querySelectorAll('.ms-dropdown').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.ms-trigger').forEach(t => t.classList.remove('open'));
  }
});

/** Build query-string from current filter values (+ extra params) */
function buildParams(extra = {}) {
  const status       = getMultiSelectValues('filterStatus');
  const invoiceType  = getMultiSelectValues('filterInvoiceType');
  const site         = getMultiSelectValues('filterSite');
  const shipState    = getMultiSelectValues('filterShipState');
  const customerName = getMultiSelectValues('filterCustomerName');
  const dateFrom     = document.getElementById('filterDateFrom')?.value || '';
  const dateTo       = document.getElementById('filterDateTo')?.value || '';
  const p = new URLSearchParams();
  if (status)       p.set('status', status);
  if (invoiceType)  p.set('invoice_type', invoiceType);
  if (dateFrom)     p.set('date_from', dateFrom);
  if (dateTo)       p.set('date_to', dateTo);
  if (site)         p.set('site', site);
  if (shipState)    p.set('ship_state', shipState);
  if (customerName) p.set('customer_name', customerName);
  Object.entries(extra).forEach(([k, v]) => { if (v !== undefined && v !== null) p.set(k, v); });
  return p.toString();
}

/** Simple in-memory cache for API responses — cleared on every filter change */
const fetchCache = {};

/** Fetch JSON from API with loading indicator (cached per URL) */
async function apiFetch(path) {
  if (fetchCache[path]) return fetchCache[path];
  showLoader(true);
  try {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    fetchCache[path] = data;
    return data;
  } catch (err) {
    console.error('API Error:', path, err.message);
    showToast('Error fetching data: ' + err.message, 'error');
    return null;
  } finally {
    showLoader(false);
  }
}

/** Destroy and remove Chart.js chart */
function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

/** Format Indian currency */
function fmtINR(val) {
  const n = parseFloat(val) || 0;
  if (n >= 1e7)      return '₹' + (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5)      return '₹' + (n / 1e5).toFixed(2) + ' L';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/** Full currency for KPI cards */
function fmtINRFull(val) {
  const n = parseFloat(val) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Full Indian rupee rounded to nearest rupee — compact, no paisa, for Sales Dashboard KPIs */
function fmtINRKPI(val) {
  const n = Math.round(parseFloat(val) || 0);
  return '₹' + n.toLocaleString('en-IN');
}

/** Format number with commas */
function fmtNum(val) {
  return parseInt(val || 0).toLocaleString('en-IN');
}

/** Format date — "01 Apr 2024" (handles both "YYYY-MM-DD" and "YYYY-MM-DD HH:MM:SS") */
function fmtDate(val) {
  if (!val) return '—';
  const d = new Date(String(val).replace(' ', 'T'));
  if (isNaN(d)) return val;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format date as DD-MM-YYYY */
function fmtDateDMY(val) {
  if (!val) return '—';
  const s = String(val).substring(0, 10); // YYYY-MM-DD part
  if (s.length < 10 || !s.includes('-')) return val;
  const [y, m, d] = s.split('-');
  return `${d}-${m}-${y}`;
}

/** Show/hide global loading bar */
function showLoader(state) {
  document.getElementById('globalLoader').style.display = state ? 'flex' : 'none';
}

/** Toast notification */
function showToast(msg, type = 'info') {
  const existing = document.getElementById('toastMsg');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'toastMsg';
  t.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${type === 'error' ? '#DC2626' : '#1A3C5E'};
    color:white; padding:12px 20px; border-radius:8px;
    font-size:13px; max-width:360px; box-shadow:0 4px 20px rgba(0,0,0,.2);
    animation: slideUp .2s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

/** Status badge HTML */
function statusBadge(s) {
  const map = {
    'Approved':       'badge-approved',
    'Open':           'badge-open',
    'Rejected':       'badge-rejected',
    'Cancelled':      'badge-cancelled',
    'Released':       'badge-released',
    'Exported To GL': 'badge-exported',
    'Reverted':       'badge-reverted',
  };
  return `<span class="badge ${map[s] || 'badge-default'}">${s || '—'}</span>`;
}

/** Standard Chart.js palette */
const PALETTE = [
  '#2463A4','#E8A838','#16A34A','#DC2626','#7C3AED',
  '#0891B2','#D97706','#9333EA','#059669','#E11D48',
  '#F97316','#06B6D4','#8B5CF6','#10B981','#F43F5E',
];

/* ═══════════════════════════════════════════════
   FILTERS
═══════════════════════════════════════════════ */
async function loadFilterOptions() {
  const data = await apiFetch('/api/filters');
  if (!data) return;
  buildMultiSelect('filterStatus',      data.status      || []);
  buildMultiSelect('filterInvoiceType', data.invoiceType || []);
  buildMultiSelect('filterSite',        data.site        || []);
  buildMultiSelect('filterShipState',   data.shipState   || []);
  buildSearchableMultiSelect('filterCustomerName', data.customerName || [], 'Search customer…');
}

/** Called whenever a filter changes */
function onFilterChange() {
  Object.keys(fetchCache).forEach(k => delete fetchCache[k]);
  updateFilterBadge();
  loadTab(activeTab);
}


function clearFilters() {
  ['filterStatus', 'filterInvoiceType', 'filterSite', 'filterShipState', 'filterCustomerName'].forEach(id => {
    const dropdown = document.getElementById('ms-dropdown-' + id);
    if (dropdown) {
      dropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
      // Clear search box + reset count + reset Select All inside searchable dropdowns
      const searchInput = dropdown.querySelector('.ms-search-input');
      if (searchInput) {
        searchInput.value = '';
        filterMsOptions(id, '');
      }
      const allCb = document.getElementById('ms-all-' + id);
      if (allCb) { allCb.checked = false; allCb.indeterminate = false; }
    }
    updateMultiSelectLabel(id);
  });
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value   = '';
  Object.keys(fetchCache).forEach(k => delete fetchCache[k]);
  updateFilterBadge();
  loadTab(activeTab);
}

function updateFilterBadge() {
  let count = 0;
  ['filterStatus', 'filterInvoiceType', 'filterSite', 'filterShipState', 'filterCustomerName'].forEach(id => {
    const v = getMultiSelectValues(id);
    if (v) count += v.split(',').length;
  });
  const dateFrom = document.getElementById('filterDateFrom')?.value;
  const dateTo   = document.getElementById('filterDateTo')?.value;
  if (dateFrom) count++;
  if (dateTo)   count++;
  const ind = document.getElementById('filterIndicator');
  if (count > 0) {
    ind.style.display = 'flex';
    document.getElementById('filterBadge').textContent =
      count + ' filter' + (count > 1 ? 's active' : ' active');
  } else {
    ind.style.display = 'none';
  }
}

/* ═══════════════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════════════ */
function switchTab(tabId, btnEl) {
  // Hide all content, deactivate all buttons
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  document.getElementById(`tab-${tabId}`).classList.add('active');
  btnEl.classList.add('active');
  activeTab = tabId;

  loadTab(tabId);

  // Leaflet: invalidate size then fit to India GeoJSON bounds (fixes panning to wrong area)
  if (tabId === 'sales-map' && leafletMap) {
    setTimeout(() => {
      leafletMap.invalidateSize();
      leafletMap.setView([22.5, 80.5], 5);
    }, 250);
  }
}

function loadTab(tabId) {
  switch (tabId) {
    case 'sales-dashboard':  loadSalesDashboard(); break;
    case 'sales-map':        loadSalesMap();       break;
    case 'invoice-summary':  loadInvoiceSummary(); break;
    case 'sales-analysis':   loadSalesAnalysis();  break;
  }
}

/* ═══════════════════════════════════════════════
   TAB 1 — SALES DASHBOARD
═══════════════════════════════════════════════ */
async function loadSalesDashboard() {
  const data = await apiFetch(`/api/sales-dashboard?${buildParams()}`);
  if (!data) return;

  const { kpi, monthly, customers, customers_net, itemCategory } = data;

  // ── KPI Cards (6 per CRD: Net, Gross, Rate, Tax, Sales Qty, No of Invoice)
  document.getElementById('sd-total-sales').textContent  = fmtINRKPI(kpi.total_net_amount);
  document.getElementById('sd-gross-amount').textContent = fmtINRKPI(kpi.total_gross_amount);
  document.getElementById('sd-total-rate').textContent   = fmtINRKPI(kpi.total_rate_val);
  document.getElementById('sd-total-tax').textContent    = fmtINRKPI(kpi.total_tax);
  document.getElementById('sd-sales-qty').textContent    = fmtNum(kpi.total_sales_qty);
  document.getElementById('sd-total-invoices').textContent = fmtNum(kpi.total_invoices);
  if (kpi.first_date && kpi.last_date) {
    document.getElementById('sd-date-range').textContent =
      fmtDate(kpi.first_date) + ' – ' + fmtDate(kpi.last_date);
  }
  document.getElementById('lastUpdated').textContent =
    'Updated: ' + new Date().toLocaleTimeString('en-IN');

  // ── Monthly Trend Line Chart (Sales Summary Over Time)
  renderMonthlyChart('sd-monthly-chart', monthly);

  // ── Sales Distribution by Customers (Pie — Net Amount)
  renderCustomersPie('sd-customers-pie-chart', customers_net);

  // ── Top Customers Bar Chart (Gross Amount)
  renderCustomersBar('sd-customers-chart', customers);

  // ── Net Amount by Item Category
  renderItemCategoryChart('sd-item-cat-chart', itemCategory);

  // ── Invoice Table
  tableState['sales-dashboard'].page = 1;
  await loadSdTable();
}

function renderMonthlyChart(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows.length) return;
  const labels = rows.map(r => r.month_label);
  const data   = rows.map(r => parseFloat(r.total_net || r.total_amount) || 0);
  const ctx    = document.getElementById(canvasId).getContext('2d');

  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Net Revenue (₹)',
        data,
        borderColor: '#2463A4',
        backgroundColor: 'rgba(36,99,164,.08)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#2463A4',
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => '  Revenue: ' + fmtINRFull(ctx.raw),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } },
        y: {
          grid: { color: '#E8EFF6' },
          ticks: {
            font: { size: 11 },
            callback: v => fmtINR(v),
          },
        },
      },
    },
  });
}

function renderStatusPie(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows.length) return;
  const labels = rows.map(r => r.status);
  const data   = rows.map(r => parseFloat(r.total_amount) || 0);
  const ctx    = document.getElementById(canvasId).getContext('2d');

  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => `  ${ctx.label}: ${fmtINR(ctx.raw)} (${Math.round(ctx.parsed * 100 / (ctx.dataset.data.reduce((a,b)=>a+b,0)||1))}%)`,
          },
        },
      },
    },
  });
}

function renderCustomersBar(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows.length) return;
  const labels = rows.map(r => r.customer_name);
  const data   = rows.map(r => parseFloat(r.total_amount) || 0);
  const ctx    = document.getElementById(canvasId).getContext('2d');

  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (₹)',
        data,
        backgroundColor: PALETTE[0],
        borderRadius: 5,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => '  ' + fmtINRFull(ctx.raw) } },
      },
      scales: {
        x: {
          grid: { color: '#E8EFF6' },
          ticks: { callback: v => fmtINR(v), font: { size: 11 } },
        },
        y: { grid: { display: false }, ticks: { font: { size: 12 } } },
      },
    },
  });
}

function renderCustomersPie(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows || !rows.length) return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  const TOP = 10;
  const topRows = rows.slice(0, TOP);
  const otherAmt = rows.slice(TOP).reduce((s, r) => s + (parseFloat(r.net_amount) || 0), 0);
  const labels = topRows.map(r => r.customer_name);
  const data   = topRows.map(r => parseFloat(r.net_amount) || 0);
  if (otherAmt > 0) { labels.push('Others'); data.push(otherAmt); }
  const ctx = el.getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data, backgroundColor: PALETTE, borderWidth: 1, borderColor: '#fff' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.label + ': ' + fmtINRFull(ctx.raw) } },
      },
    },
  });
}

function renderItemCategoryChart(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows || !rows.length) return;
  const el = document.getElementById(canvasId);
  if (!el) return;
  const ctx = el.getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.category),
      datasets: [{
        label: 'Net Amount (₹)',
        data: rows.map(r => parseFloat(r.total_amount) || 0),
        backgroundColor: PALETTE.slice(0, rows.length),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `  ${fmtINRFull(ctx.raw)}  (qty: ${fmtNum(rows[ctx.dataIndex]?.total_qty)})`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#E8EFF6' }, ticks: { callback: v => fmtINR(v), font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

/* ── Sales Dashboard Table ─────────────────── */
async function loadSdTable() {
  const st = tableState['sales-dashboard'];
  const qs = buildParams({ page: st.page, page_size: sdPageSize(), sort_by: st.sort, sort_dir: st.dir });
  const data = await apiFetch(`/api/sales-dashboard/table?${qs}`);
  if (!data) return;

  renderTable('sd-table-body', data.rows, [
    r => `<code style="font-size:12px">${r.invoice_no}</code>`,
    r => fmtDate(r.invoice_date),
    r => r.ship_city || '—',
    r => `<span title="${r.description}">${r.description || '—'}</span>`,
    r => fmtDate(r.created_date),
    r => fmtDate(r.approved_date),
    r => fmtDate(r.prep_date),
    r => fmtDate(r.removal_date),
  ]);

  renderPagination('sd-pagination', data, sdChangePage);
}

function sdPageSize() { return parseInt(document.getElementById('sd-page-size')?.value || 50, 10); }

function sdChangePage(page) {
  tableState['sales-dashboard'].page = page;
  loadSdTable();
}

function sdSort(col) {
  const st = tableState['sales-dashboard'];
  st.dir   = (st.sort === col && st.dir === 'asc') ? 'desc' : 'asc';
  st.sort  = col;
  st.page  = 1;
  loadSdTable();
  updateSortHeaders('sd-table', col, st.dir);
}

/* ═══════════════════════════════════════════════
   TAB 2 — SALES DISTRIBUTION MAP
═══════════════════════════════════════════════ */
async function loadSalesMap() {
  const data = await apiFetch(`/api/sales-map?${buildParams()}`);
  if (!data) return;

  const { states, cities, summary } = data;

  // ── KPI Cards
  document.getElementById('map-states-count').textContent = summary.states_covered;
  document.getElementById('map-total-rev').textContent    = fmtINR(summary.total_revenue);
  document.getElementById('map-top-state').textContent    = states[0]?.state || '—';

  // ── State Bar Chart (top 10)
  renderStateBarChart(states.slice(0, 10));

  // Zone chart removed (not in CRD)

  // ── Sales Qty by City Chart
  renderCityQtyChart(cities);

  // ── State Revenue Table
  renderStateTable(states);

  // ── Leaflet Map
  await initLeafletMap(states);
}

function renderStateBarChart(rows) {
  const id = 'map-states-chart';
  destroyChart(id);
  if (!rows.length) return;
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.state),
      datasets: [{
        label: 'Revenue (₹)',
        data: rows.map(r => parseFloat(r.total_amount) || 0),
        backgroundColor: PALETTE.slice(0, rows.length),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => '  ' + fmtINRFull(ctx.raw) } },
      },
      scales: {
        x: { grid: { color: '#E8EFF6' }, ticks: { callback: v => fmtINR(v), font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

function renderZonePieChart(rows) {
  const id = 'map-zone-chart';
  destroyChart(id);
  if (!rows.length) return;
  const validRows = rows.filter(r => parseFloat(r.total_amount) > 0);
  if (!validRows.length) return;
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: validRows.map(r => r.zone),
      datasets: [{ data: validRows.map(r => parseFloat(r.total_amount) || 0), backgroundColor: PALETTE }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => `  ${ctx.label}: ${fmtINR(ctx.raw)}` } },
      },
    },
  });
}

function renderStateTable(rows) {
  const tbody = document.getElementById('map-district-body');
  if (!tbody) return;
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No state data available</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.state || '—'}</td>
      <td class="text-right">${fmtNum(r.invoice_count)}</td>
      <td class="text-right fw-bold">${fmtINR(r.total_amount)}</td>
      <td class="text-right">${fmtINR(r.avg_amount)}</td>
    </tr>
  `).join('');
}

function renderCityQtyChart(rows) {
  const id = 'map-city-qty-chart';
  destroyChart(id);
  const el = document.getElementById(id);
  if (!el) return;
  const validRows = (rows || []).filter(r => parseFloat(r.total_qty) > 0).slice(0, 20);
  if (!validRows.length) return;
  const ctx = el.getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: validRows.map(r => r.city),
      datasets: [{
        label: 'Sales Qty',
        data: validRows.map(r => parseFloat(r.total_qty) || 0),
        backgroundColor: PALETTE[2],
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `  Qty: ${fmtNum(ctx.raw)}  |  Amt: ${fmtINR(validRows[ctx.dataIndex]?.total_amount)}`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#E8EFF6' }, ticks: { font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

/* ── Leaflet Map ───────────────────────────── */
async function initLeafletMap(stateData) {
  // Build lookup: normalised state name → row
  const stateLookup = {};
  stateData.forEach(r => {
    stateLookup[normaliseState(r.state)] = r;
  });

  const maxVal = Math.max(...stateData.map(r => parseFloat(r.total_amount) || 0), 1);

  // Initialise map once
  if (!leafletMap) {
    leafletMap = L.map('leaflet-map', {
      center: [20.5937, 78.9629], zoom: 4,
      zoomControl: true, scrollWheelZoom: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd', maxZoom: 14,
    }).addTo(leafletMap);
  }

  // Remove previous GeoJSON layer
  if (geojsonLayer) { leafletMap.removeLayer(geojsonLayer); geojsonLayer = null; }

  // Load GeoJSON (cached)
  if (!indiaGeoJson) {
    try {
      // Fetch India states GeoJSON from CDN
      // For production: host india_states.geojson locally in /public/
      const gjRes = await fetch(
        'https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson'
      );
      if (gjRes.ok) {
        indiaGeoJson = await gjRes.json();
      } else {
        throw new Error('GeoJSON fetch failed');
      }
    } catch (e) {
      console.warn('Could not load India GeoJSON from CDN:', e.message);
      renderMapFallback(stateData);
      return;
    }
  }

  geojsonLayer = L.geoJSON(indiaGeoJson, {
    style: feature => {
      const name  = normaliseState(getGeoStateName(feature));
      const row   = stateLookup[name];
      const val   = row ? parseFloat(row.total_amount) || 0 : 0;
      return {
        fillColor:   choroplethColor(val, maxVal),
        fillOpacity: row ? 0.78 : 0.1,
        color:       '#FFFFFF',
        weight:      1.2,
        opacity:     0.8,
      };
    },
    onEachFeature: (feature, layer) => {
      const name  = getGeoStateName(feature);
      const norm  = normaliseState(name);
      const row   = stateLookup[norm];
      layer.on({
        mouseover(e) {
          e.target.setStyle({ weight: 2.5, fillOpacity: 0.9 });
        },
        mouseout(e) {
          geojsonLayer.resetStyle(e.target);
        },
        click() {
          const content = row
            ? `<div class="map-popup-title">${name}</div>
               <div class="map-popup-row"><span>Revenue</span><span class="map-popup-val">${fmtINR(row.total_amount)}</span></div>
               <div class="map-popup-row"><span>Invoices</span><span class="map-popup-val">${fmtNum(row.invoice_count)}</span></div>
               <div class="map-popup-row"><span>Avg Invoice</span><span class="map-popup-val">${fmtINR(row.avg_amount)}</span></div>`
            : `<div class="map-popup-title">${name}</div><div class="text-muted" style="font-size:12px">No invoice data</div>`;
          L.popup().setLatLng(e.latlng || layer.getBounds().getCenter())
            .setContent(content).openOn(leafletMap);
        },
      });
      if (row) {
        layer.bindTooltip(
          `<strong>${name}</strong><br>${fmtINR(row.total_amount)}`,
          { sticky: true, className: '' }
        );
      }
    },
  }).addTo(leafletMap);
}

function getGeoStateName(feature) {
  // Different GeoJSON sources use different property keys
  return feature.properties.ST_NM
      || feature.properties.NAME_1
      || feature.properties.name
      || feature.properties.State
      || feature.properties.state
      || '';
}

function normaliseState(name) {
  return (name || '').toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Choropleth color — blue gradient proportional to value */
function choroplethColor(val, max) {
  if (!val || val === 0) return '#EBF3FF';
  const ratio = val / max;
  if (ratio > 0.75) return '#0F2540';
  if (ratio > 0.5)  return '#1A3C5E';
  if (ratio > 0.25) return '#2463A4';
  if (ratio > 0.1)  return '#5B9BD5';
  return '#A8C9EA';
}

/** Fallback when GeoJSON fails — show state table instead */
function renderMapFallback(stateData) {
  const mapEl = document.getElementById('leaflet-map');
  mapEl.innerHTML = `
    <div style="padding:24px; font-family:var(--font)">
      <p style="color:#DC2626; margin-bottom:16px; font-size:13px">
        ⚠ Map tiles unavailable. Showing state revenue table.
      </p>
      <table style="width:100%; border-collapse:collapse; font-size:13px">
        <thead>
          <tr style="background:#1A3C5E; color:white">
            <th style="padding:8px 12px; text-align:left">State</th>
            <th style="padding:8px 12px; text-align:right">Invoices</th>
            <th style="padding:8px 12px; text-align:right">Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${stateData.map((r, i) => `
            <tr style="background:${i%2===0?'#F5F8FF':'#fff'}">
              <td style="padding:8px 12px">${r.state}</td>
              <td style="padding:8px 12px; text-align:right">${fmtNum(r.invoice_count)}</td>
              <td style="padding:8px 12px; text-align:right; font-weight:600">${fmtINR(r.total_amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ═══════════════════════════════════════════════
   TAB 3 — INVOICE SUMMARY
═══════════════════════════════════════════════ */
async function loadInvoiceSummary() {
  const data = await apiFetch(`/api/invoice-summary?${buildParams()}`);
  if (!data) return;

  const { kpi } = data;

  // ── KPI Cards
  document.getElementById('is-count').textContent     = fmtNum(kpi.invoice_count);
  document.getElementById('is-total').textContent     = fmtINR(kpi.total_amount);
  document.getElementById('is-avg').textContent       = 'Avg: ' + fmtINR(kpi.avg_amount);
  document.getElementById('is-customers').textContent = fmtNum(kpi.unique_customers);
  if (kpi.period_start && kpi.period_end) {
    document.getElementById('is-period').textContent =
      fmtDate(kpi.period_start) + ' – ' + fmtDate(kpi.period_end);
  }

  // ── Table
  tableState['invoice-summary'].page = 1;
  await loadIsTable();
}

function renderStatusBarChart(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows.length) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.status),
      datasets: [
        {
          label: 'Revenue (₹)', data: rows.map(r => parseFloat(r.total_amount) || 0),
          backgroundColor: PALETTE.slice(0, rows.length),
          borderRadius: 5, yAxisID: 'y1',
        },
        {
          label: 'Count', data: rows.map(r => parseInt(r.invoice_count) || 0),
          backgroundColor: 'rgba(232,168,56,.3)',
          borderColor: '#E8A838', borderWidth: 2,
          type: 'line', yAxisID: 'y2', tension: .3,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? '  Revenue: ' + fmtINRFull(ctx.raw)
              : '  Count: ' + fmtNum(ctx.raw),
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y1: { position: 'left', ticks: { callback: v => fmtINR(v), font: { size: 11 } }, grid: { color: '#E8EFF6' } },
        y2: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function renderTypePieChart(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows.length) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: rows.map(r => r.invoice_type),
      datasets: [{ data: rows.map(r => parseFloat(r.total_amount) || 0), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => `  ${ctx.label}: ${fmtINR(ctx.raw)} (${ctx.dataset._pct?.[ctx.dataIndex] || ''}%)` } },
      },
    },
  });
}

function renderMonthlyCountChart(canvasId, rows) {
  destroyChart(canvasId);
  if (!rows.length) return;
  const ctx = document.getElementById(canvasId).getContext('2d');
  charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.month_label),
      datasets: [{
        label: 'Invoice Count',
        data: rows.map(r => parseInt(r.invoice_count) || 0),
        backgroundColor: 'rgba(36,99,164,.7)',
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => '  Count: ' + fmtNum(ctx.raw) } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { grid: { color: '#E8EFF6' }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

/* ── Invoice Summary Table ─────────────────── */
async function loadIsTable() {
  const st = tableState['invoice-summary'];
  const qs = buildParams({ page: st.page, page_size: isPageSize(), sort_by: st.sort, sort_dir: st.dir });
  const data = await apiFetch(`/api/invoice-summary/table?${qs}`);
  if (!data) return;

  renderTable('is-table-body', data.rows, [
    r => `<code style="font-size:12px">${r.invoice_no}</code>`,
    r => fmtDate(r.invoice_date),
    r => r.site || '—',
    r => `<span title="${r.customer_name}">${r.customer_name || '—'}</span>`,
    r => r.invoice_type || '—',
    r => statusBadge(r.status),
    r => `<span class="text-right fw-bold" style="display:block">${fmtINR(r.net_amount)}</span>`,
    r => `<span class="text-right" style="display:block">${fmtINR(r.tax)}</span>`,
    r => `<span class="text-right fw-bold" style="display:block">${fmtINR(r.amount)}</span>`,
    r => `<span class="text-right" style="display:block">${fmtINR(r.charge)}</span>`,
    r => `<span class="text-right" style="display:block">${fmtINR(r.discount)}</span>`,
    r => r.state || '—',
    r => r.city || '—',
    r => r.party_group || '—',
    r => r.employee_name || '—',
  ]);

  renderPagination('is-pagination', data, isChangePage);
}

function isPageSize() { return parseInt(document.getElementById('is-page-size')?.value || 50, 10); }
function isChangePage(page) { tableState['invoice-summary'].page = page; loadIsTable(); }
function isSort(col) {
  const st = tableState['invoice-summary'];
  st.dir   = (st.sort === col && st.dir === 'asc') ? 'desc' : 'asc';
  st.sort  = col; st.page = 1;
  loadIsTable();
  updateSortHeaders('is-table', col, st.dir);
}

/* ═══════════════════════════════════════════════
   TAB 4 — SALES SUMMARY ANALYSIS
═══════════════════════════════════════════════ */
async function loadSalesAnalysis() {
  const data = await apiFetch(`/api/sales-analysis?${buildParams()}`);
  if (!data) return;

  const { monthly, siteTrend, dateRange } = data;

  // ── KPI Cards: From Date, To Date, Net Amount, Gross Amount
  if (monthly.length) {
    const totalNet   = monthly.reduce((s, r) => s + (parseFloat(r.total_net) || 0), 0);
    const totalGross = monthly.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);

    // From/To Date: use active filter values if set, otherwise use DB min/max
    const filterFrom = document.getElementById('filterDateFrom')?.value || '';
    const filterTo   = document.getElementById('filterDateTo')?.value   || '';
    const fromDate   = filterFrom || dateRange?.min_date || '';
    const toDate     = filterTo   || dateRange?.max_date || '';

    document.getElementById('sa-from-date').textContent   = fmtDateDMY(fromDate);
    document.getElementById('sa-to-date').textContent     = fmtDateDMY(toDate);
    document.getElementById('sa-net-amount').textContent  = fmtINR(totalNet);
    document.getElementById('sa-gross-amount').textContent = fmtINR(totalGross);
  }

  // ── Monthly Sales Summary Line Chart (Net Amount)
  renderTrendChart(monthly);

  // ── Monthly Sales by Site Bar Chart (Domestic)
  renderSiteBarChart(siteTrend);

  // ── Domestic Site × Month Pivot Table
  renderDomesticTable(siteTrend);
}

function renderYearlyKPIs(rows) {
  const container = document.getElementById('sa-yearly-kpis');
  container.innerHTML = rows.map((r, i) => `
    <div class="kpi-card">
      <div class="kpi-icon kpi-icon--${['blue','green','orange'][i % 3]}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
        </svg>
      </div>
      <div class="kpi-body">
        <div class="kpi-label">FY ${r.year}</div>
        <div class="kpi-value">${fmtINR(r.total_amount)}</div>
        <div class="kpi-sub">${fmtNum(r.invoice_count)} invoices · ${fmtNum(r.unique_customers)} customers</div>
      </div>
    </div>
  `).join('');
}

function renderTrendChart(rows) {
  const id = 'sa-trend-chart';
  destroyChart(id);
  if (!rows.length) return;
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: rows.map(r => r.month_label),
      datasets: [
        {
          label: 'Net Revenue (₹)',
          data: rows.map(r => parseFloat(r.total_net || r.total_amount) || 0),
          borderColor: '#2463A4', backgroundColor: 'rgba(36,99,164,.07)',
          borderWidth: 2.5, fill: true, tension: .35, pointRadius: 3,
          yAxisID: 'y1',
        },
        {
          label: 'Invoice Count',
          data: rows.map(r => parseInt(r.invoice_count) || 0),
          borderColor: '#E8A838', backgroundColor: 'transparent',
          borderWidth: 2, borderDash: [5, 3], pointRadius: 2, tension: .35,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 0
              ? '  Revenue: ' + fmtINRFull(ctx.raw)
              : '  Count: ' + fmtNum(ctx.raw),
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y1: { position: 'left',  ticks: { callback: v => fmtINR(v), font: { size: 11 } }, grid: { color: '#E8EFF6' } },
        y2: { position: 'right', ticks: { font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function renderSiteBarChart(rows) {
  const id = 'sa-site-bar-chart';
  destroyChart(id);
  const el = document.getElementById(id);
  if (!el || !rows.length) return;

  // Build months × site pivot
  const months = [...new Set(rows.map(r => r.month_key))].sort();
  const sites  = [...new Set(rows.map(r => r.site))].filter(Boolean).sort();
  const monthLabels = months.map(mk => {
    const r = rows.find(r => r.month_key === mk);
    return r ? r.month_label : mk;
  });

  const siteColors = ['#2463A4','#E8A838','#3BB67A','#9B59B6','#E74C3C','#1ABC9C'];
  const datasets = sites.map((site, i) => ({
    label: site,
    data: months.map(mk => {
      const r = rows.find(r => r.month_key === mk && r.site === site);
      return r ? (parseFloat(r.total_net) || 0) : 0;
    }),
    backgroundColor: siteColors[i % siteColors.length],
    borderRadius: 3,
    borderSkipped: false,
  }));

  const ctx = el.getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels: monthLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 11 }, usePointStyle: true } },
        tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtINRFull(ctx.raw) } },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { stacked: true, ticks: { callback: v => fmtINR(v), font: { size: 11 } }, grid: { color: '#E8EFF6' } },
      },
    },
  });
}

function renderMomChart(rows) {
  const id = 'sa-mom-chart';
  destroyChart(id);
  const validRows = rows.filter(r => r.mom_growth_pct !== null);
  if (!validRows.length) return;
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: validRows.map(r => r.month_label),
      datasets: [{
        label: 'MoM Growth %',
        data: validRows.map(r => parseFloat(r.mom_growth_pct) || 0),
        backgroundColor: validRows.map(r => (parseFloat(r.mom_growth_pct) || 0) >= 0 ? '#16A34A' : '#DC2626'),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `  Growth: ${ctx.raw > 0 ? '+' : ''}${ctx.raw}%` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: {
          grid: { color: '#E8EFF6' },
          ticks: { callback: v => v + '%', font: { size: 11 } },
          afterBuildTicks(axis) {
            if (!axis.ticks.some(t => t.value === 0)) axis.ticks.push({ value: 0 });
          },
        },
      },
    },
  });
}

function renderYearlyChart(rows) {
  const id = 'sa-yearly-chart';
  destroyChart(id);
  if (!rows.length) return;
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => 'FY ' + r.year),
      datasets: [{
        label: 'Annual Revenue (₹)',
        data: rows.map(r => parseFloat(r.total_amount) || 0),
        backgroundColor: PALETTE.slice(0, rows.length),
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => '  ' + fmtINRFull(ctx.raw) } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: '#E8EFF6' }, ticks: { callback: v => fmtINR(v), font: { size: 11 } } },
      },
    },
  });
}

function renderTypeTrendChart(rows) {
  const id = 'sa-type-chart';
  destroyChart(id);
  if (!rows.length) return;

  // Pivot: months as labels, types as datasets
  const months = [...new Set(rows.map(r => r.month_key))].sort();
  const types  = [...new Set(rows.map(r => r.invoice_type))];

  const datasets = types.map((t, i) => {
    const dataByMonth = {};
    rows.filter(r => r.invoice_type === t).forEach(r => { dataByMonth[r.month_key] = parseFloat(r.total_amount) || 0; });
    return {
      label: t,
      data: months.map(m => dataByMonth[m] || 0),
      backgroundColor: PALETTE[i % PALETTE.length],
      borderRadius: 2,
      stack: 'types',
    };
  });

  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'bar',
    data: { labels: months.map(m => m), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, usePointStyle: true, padding: 8 } },
        tooltip: { callbacks: { label: ctx => `  ${ctx.dataset.label}: ${fmtINR(ctx.raw)}` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { stacked: true, grid: { color: '#E8EFF6' }, ticks: { callback: v => fmtINR(v), font: { size: 11 } } },
      },
    },
  });
}

function renderStatusTrendChart(rows) {
  const id = 'sa-status-trend-chart';
  destroyChart(id);
  if (!rows.length) return;

  const months   = [...new Set(rows.map(r => r.month_key))].sort();
  const statuses = [...new Set(rows.map(r => r.status))];

  const datasets = statuses.map((s, i) => {
    const byMonth = {};
    rows.filter(r => r.status === s).forEach(r => { byMonth[r.month_key] = parseInt(r.invoice_count) || 0; });
    return {
      label: s,
      data: months.map(m => byMonth[m] || 0),
      borderColor: PALETTE[i % PALETTE.length],
      backgroundColor: PALETTE[i % PALETTE.length] + '22',
      fill: false, tension: .3, borderWidth: 2, pointRadius: 2,
    };
  });

  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, {
    type: 'line',
    data: { labels: months, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, usePointStyle: true, padding: 8 } },
        tooltip: { callbacks: { label: ctx => `  ${ctx.dataset.label}: ${fmtNum(ctx.raw)}` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
        y: { grid: { color: '#E8EFF6' }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

function renderMomTable(momRows, monthlyRows) {
  // Merge mom data with invoice counts
  const monthMap = {};
  monthlyRows.forEach(r => { monthMap[r.month_key] = r; });

  const tbody = document.getElementById('sa-mom-table-body');
  tbody.innerHTML = momRows.map(r => {
    const cnt  = monthMap[r.month_key]?.invoice_count || '—';
    const growth = r.mom_growth_pct;
    const growthHtml = growth === null
      ? '<span class="text-muted">—</span>'
      : `<span class="${parseFloat(growth) >= 0 ? 'text-success' : 'text-danger'} fw-bold">
           ${parseFloat(growth) >= 0 ? '▲' : '▼'} ${Math.abs(parseFloat(growth))}%
         </span>`;

    return `<tr>
      <td>${r.month_label}</td>
      <td class="text-right fw-bold">${fmtINR(r.revenue)}</td>
      <td class="text-right">${fmtNum(cnt)}</td>
      <td class="text-right">${r.prev_revenue ? fmtINR(r.prev_revenue) : '—'}</td>
      <td class="text-right">${growthHtml}</td>
    </tr>`;
  }).join('');
}

function renderDomesticTable(rows) {
  const container = document.getElementById('sa-domestic-wrap');
  if (!container) return;
  if (!rows || !rows.length) {
    container.innerHTML = '<p class="text-muted" style="padding:16px;font-size:13px">No site data available</p>';
    return;
  }

  // Unique months (sorted) and unique sites
  const months      = [...new Set(rows.map(r => r.month_key))].sort();
  const monthLabels = {};
  rows.forEach(r => { monthLabels[r.month_key] = r.month_label; });
  const sites = [...new Set(rows.map(r => r.site))].sort();

  // Pivot: site → month_key → net amount
  const pivot = {};
  rows.forEach(r => {
    if (!pivot[r.site]) pivot[r.site] = {};
    pivot[r.site][r.month_key] = parseFloat(r.total_net) || 0;
  });

  // Row and column totals
  const siteTotals  = {};
  sites.forEach(s => {
    siteTotals[s] = months.reduce((sum, m) => sum + (pivot[s]?.[m] || 0), 0);
  });
  const monthTotals = {};
  months.forEach(m => {
    monthTotals[m] = sites.reduce((sum, s) => sum + (pivot[s]?.[m] || 0), 0);
  });
  const grandTotal = Object.values(siteTotals).reduce((a, b) => a + b, 0);

  const thead = `<tr>
    <th>Site</th>
    ${months.map(m => `<th class="text-right">${monthLabels[m]}</th>`).join('')}
    <th class="text-right">Total</th>
  </tr>`;

  const tbody = sites.map(s => `<tr>
    <td><strong>${s}</strong></td>
    ${months.map(m => `<td class="text-right">${fmtINR(pivot[s]?.[m] || 0)}</td>`).join('')}
    <td class="text-right fw-bold">${fmtINR(siteTotals[s])}</td>
  </tr>`).join('');

  const tfoot = `<tr>
    <td><strong>Total</strong></td>
    ${months.map(m => `<td class="text-right fw-bold">${fmtINR(monthTotals[m])}</td>`).join('')}
    <td class="text-right fw-bold">${fmtINR(grandTotal)}</td>
  </tr>`;

  container.innerHTML = `
    <div class="table-responsive">
      <table class="data-table data-table--pivot">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
        <tfoot>${tfoot}</tfoot>
      </table>
    </div>`;
}

/* ═══════════════════════════════════════════════
   SHARED TABLE & PAGINATION HELPERS
═══════════════════════════════════════════════ */
function renderTable(tbodyId, rows, colRenderers) {
  const tbody = document.getElementById(tbodyId);
  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="${colRenderers.length}" class="table-empty">No records found</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r =>
    `<tr>${colRenderers.map(fn => `<td>${fn(r)}</td>`).join('')}</tr>`
  ).join('');
}

function renderPagination(containerId, data, changeFn) {
  const container = document.getElementById(containerId);
  const { total, page, pageSize, totalPages } = data;

  if (totalPages <= 1) {
    container.innerHTML = `<span class="text-muted" style="font-size:12px">Showing ${fmtNum(total)} records</span>`;
    return;
  }

  // Build page number array with ellipsis
  const pages = buildPageNumbers(page, totalPages);

  const btns = pages.map(p => {
    if (p === '…') return `<span class="pg-ellipsis">…</span>`;
    return `<button class="pg-btn ${p === page ? 'active' : ''}"
              onclick="${changeFn.name}(${p})">${p}</button>`;
  }).join('');

  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);

  container.innerHTML = `
    <span class="text-muted" style="font-size:12px">
      Showing ${fmtNum(start)}–${fmtNum(end)} of ${fmtNum(total)} records
    </span>
    <div class="pagination-pages">
      <button class="pg-btn" onclick="${changeFn.name}(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>
      ${btns}
      <button class="pg-btn" onclick="${changeFn.name}(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>›</button>
    </div>`;
}

function buildPageNumbers(current, total) {
  const pages = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function updateSortHeaders(tableId, sortCol, sortDir) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('th.sortable').forEach(th => {
    const col  = th.dataset.col || th.getAttribute('onclick')?.match(/\('(\w+)'\)/)?.[1];
    const icon = th.querySelector('.sort-icon');
    th.classList.remove('sorted');
    if (icon) icon.textContent = '↕';
    if (col === sortCol) {
      th.classList.add('sorted');
      if (icon) icon.textContent = sortDir === 'asc' ? '↑' : '↓';
    }
  });
}

/* ═══════════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════════ */
function exportData(type) {
  const dashboardMap = {
    'sales-dashboard':  'sales-dashboard',
    'sales-map':        'sales-map',
    'invoice-summary':  'invoice-summary',
    'sales-analysis':   'sales-analysis',
  };
  const dashboard = dashboardMap[activeTab] || 'sales-dashboard';
  const qs = buildParams({ dashboard, type });
  window.open(`${API}/api/export?${qs}`, '_blank');
}

/** Download the active tab as a standalone HTML file (charts captured as images) */
function exportHTML() {
  const tabEl = document.getElementById('tab-' + activeTab);
  if (!tabEl) return;

  // Capture all canvas elements as PNG data URLs before cloning
  const canvasData = {};
  tabEl.querySelectorAll('canvas').forEach(canvas => {
    if (canvas.id) {
      try { canvasData[canvas.id] = canvas.toDataURL('image/png'); } catch (_) { /* tainted */ }
    }
  });

  // Clone DOM so we can mutate it without affecting the live page
  const clone = tabEl.cloneNode(true);

  // Replace canvas elements with <img> snapshots
  clone.querySelectorAll('canvas').forEach(canvas => {
    if (canvas.id && canvasData[canvas.id]) {
      const img = document.createElement('img');
      img.src = canvasData[canvas.id];
      img.style.cssText = 'width:100%;height:auto;display:block';
      canvas.parentNode.replaceChild(img, canvas);
    }
  });

  // Collect local CSS rules (skip cross-origin CDN sheets)
  let cssText = '';
  Array.from(document.styleSheets).forEach(ss => {
    try { cssText += Array.from(ss.cssRules).map(r => r.cssText).join('\n'); } catch (_) { /* cross-origin */ }
  });

  const tabTitle = document.querySelector('.tab-btn.active')?.textContent?.trim() || activeTab;
  const exported = new Date().toLocaleString('en-IN');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>United Rubber — ${tabTitle}</title>
  <style>${cssText}</style>
</head>
<body>
  <div style="background:#1A3C5E;color:#fff;padding:16px 24px;margin-bottom:16px">
    <strong style="font-size:16px">United Rubber — ${tabTitle}</strong>
    <span style="float:right;font-size:12px;opacity:.7">Exported: ${exported}</span>
  </div>
  ${clone.innerHTML}
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `UR-${activeTab}-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
