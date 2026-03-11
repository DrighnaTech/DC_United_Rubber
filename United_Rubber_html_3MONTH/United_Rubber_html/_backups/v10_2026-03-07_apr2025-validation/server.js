/**
 * server.js
 * Entry point for the United Rubber Sales Analytics System.
 *
 * Endpoints:
 *   GET /api/filters                  — filter dropdown options
 *   GET /api/sales-dashboard          — executive overview KPIs + charts
 *   GET /api/sales-dashboard/table    — paginated invoice table
 *   GET /api/sales-map                — geographic sales aggregation
 *   GET /api/invoice-summary          — invoice summary KPIs + charts
 *   GET /api/invoice-summary/table    — paginated invoice table (sortable)
 *   GET /api/sales-analysis           — trend analysis
 *   GET /api/export                   — Excel/PDF export
 *   GET /health                       — DB + server health check
 */

'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');

const { ping } = require('./db/connection');

const filterRoutes   = require('./routes/filters');
const dashboardRoutes = require('./routes/salesDashboard');
const mapRoutes      = require('./routes/salesDistributionMap');
const summaryRoutes  = require('./routes/salesInvoiceSummary');
const analysisRoutes = require('./routes/salesSummaryAnalysis');
const exportRoutes   = require('./routes/export');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/logo', express.static(path.join(__dirname, 'logo')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/filters',          filterRoutes);
app.use('/api/sales-dashboard',  dashboardRoutes);
app.use('/api/sales-map',        mapRoutes);
app.use('/api/invoice-summary',  summaryRoutes);
app.use('/api/sales-analysis',   analysisRoutes);
app.use('/api/export',           exportRoutes);

// ── Health Check ──────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const dbOk = await ping();
    res.json({
      status:    'ok',
      db:        dbOk ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
      env:       process.env.NODE_ENV || 'development',
    });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'unreachable', message: err.message });
  }
});

// ── Catch-all: serve index.html for SPA routing ───────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Global error handler ──────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Global Error]', err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Start server ─────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  United Rubber Sales Analytics              ║`);
  console.log(`║  Server running on http://localhost:${PORT}   ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  try {
    await ping();
    console.log(`✓ Database connected (${process.env.DB_NAME}@${process.env.DB_HOST})`);
  } catch (err) {
    console.error(`✗ Database connection failed: ${err.message}`);
    console.error('  Check your .env credentials and DB host/port.');
  }
});

module.exports = app;
