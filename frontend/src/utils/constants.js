/* ═══════════════════════════════════════════════════════════════
   DataCaffé — Application Constants & Data
   ═══════════════════════════════════════════════════════════════ */

export const NAV_ITEMS = [
  { label: "Why DataCaffé AI Extractor?", href: "#why", active: true },
  { label: "Extract", href: "#extract" },
  { label: "History", href: "#history" },
  { label: "Analytics", href: "#analytics" },
  { label: "Settings", href: "#settings" },
];

export const WORKFLOW_STEPS = [
  { label: "Import\nContracts", icon: "📋", angle: 0 },
  { label: "OCR Extract\n& Index", icon: "🔍", angle: 51.4 },
  { label: "AI Auto-Match™\nto existing data", icon: "🤖", angle: 102.9 },
  { label: "Create records\nauto-linked", icon: "📝", angle: 154.3 },
  { label: "AI Train™\nEnhances Matching", icon: "🧠", angle: 205.7 },
  { label: "AI Analyse™\nMeta Data", icon: "📊", angle: 257.1 },
  { label: "Business Process\nAutomation", icon: "⚙️", angle: 308.6 },
];

export const PIPELINE_STEPS = [
  {
    num: 1,
    title: "Upload",
    desc: "Upload drawings or business documents to start extraction",
    color: "#6366f1",
    emoji: "📄",
    gradient: "linear-gradient(135deg, #6366f1, #818cf8)",
  },
  {
    num: 2,
    title: "Render",
    desc: "Convert files into a renderable format for AI processing",
    color: "#f59e0b",
    emoji: "🖼️",
    gradient: "linear-gradient(135deg, #f59e0b, #fbbf24)",
  },
  {
    num: 3,
    title: "AI Processing",
    desc: "AI analyzes the document and extracts key information",
    color: "#ef4444",
    emoji: "🧠",
    gradient: "linear-gradient(135deg, #ef4444, #f87171)",
  },
  {
    num: 4,
    title: "Tokens",
    desc: "Convert extracted info into structured data fields",
    color: "#10b981",
    emoji: "📊",
    gradient: "linear-gradient(135deg, #10b981, #34d399)",
  },
  {
    num: 5,
    title: "Download",
    desc: "Export structured data to Excel, CSV, or databases",
    color: "#3b82f6",
    emoji: "📥",
    gradient: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  },
];

export const DOC_TYPES = [
  {
    id: "sales",
    title: "Sales Order",
    desc: "Extract data from sales orders via email or PDF upload",
    icon: "🧾",
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  },
  {
    id: "costing",
    title: "Costing Diagram",
    desc: "Upload engineering drawings or costing diagrams for extraction",
    icon: "📐",
    gradient: "linear-gradient(135deg, #f59e0b, #f97316)",
  },
];

export const UPLOAD_METHODS = [
  {
    id: "email",
    icon: "📧",
    title: "Email",
    desc: "Connect your email to auto-extract sales orders from incoming emails",
    gradient: "linear-gradient(135deg, #1A5EA8, #F07621)",
  },
  {
    id: "upload",
    icon: "📄",
    title: "Direct Upload PDF",
    desc: "Upload PDF files directly from your device for instant extraction",
    gradient: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  },
];

export const SOLUTIONS = [
  "Insurance",
  "Manufacturing",
  "Payroll",
  "HRMS",
  "CRM",
  "E-commerce",
  "Finance and Accounting",
  "Healthcare",
];

export const PRODUCTS = ["Integrator", "Transformer", "Insightor", "Accelerator"];

export const COMPANY_LINKS = [
  "Book a Demo",
  "Contact Sales",
  "Pricing",
  "About Us",
  "Community",
];

export const SUPPORT_LINKS = [
  { icon: "💡", text: "Help Center" },
  { icon: "⚠️", text: "Troubleshooting" },
  { icon: "📧", text: "admin@datacaffe.ai" },
  { icon: "📍", text: "Bengaluru, India" },
];

export const STATS = [
  { value: "50+", label: "Data Points", icon: "📊" },
  { value: "99.2%", label: "Enterprise Ready", icon: "🛡️" },
  { value: "AI™", label: "AI Extractor", icon: "⭐" },
];

export const API_BASE = "/api";
