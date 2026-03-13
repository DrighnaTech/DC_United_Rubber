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
  { label: "Import\nContracts", icon: "clipboard", angle: 0 },
  { label: "OCR Extract\n& Index", icon: "search", angle: 51.4 },
  { label: "AI Auto-Match™\nto existing data", icon: "bot", angle: 102.9 },
  { label: "Create records\nauto-linked", icon: "edit", angle: 154.3 },
  { label: "AI Train™\nEnhances Matching", icon: "brain", angle: 205.7 },
  { label: "AI Analyse™\nMeta Data", icon: "bar-chart", angle: 257.1 },
  { label: "Business Process\nAutomation", icon: "settings", angle: 308.6 },
];

export const PIPELINE_STEPS = [
  {
    num: 1,
    title: "Upload",
    desc: "Upload drawings or business documents to start extraction",
    color: "#6366f1",
    icon: "file-text",
    gradient: "linear-gradient(135deg, #6366f1, #818cf8)",
  },
  {
    num: 2,
    title: "Render",
    desc: "Convert files into a renderable format for AI processing",
    color: "#f59e0b",
    icon: "image",
    gradient: "linear-gradient(135deg, #f59e0b, #fbbf24)",
  },
  {
    num: 3,
    title: "AI Processing",
    desc: "AI analyzes the document and extracts key information",
    color: "#ef4444",
    icon: "brain",
    gradient: "linear-gradient(135deg, #ef4444, #f87171)",
  },
  {
    num: 4,
    title: "Tokens",
    desc: "Convert extracted info into structured data fields",
    color: "#10b981",
    icon: "bar-chart",
    gradient: "linear-gradient(135deg, #10b981, #34d399)",
  },
  {
    num: 5,
    title: "Download",
    desc: "Export structured data to Excel, CSV, or databases",
    color: "#3b82f6",
    icon: "download",
    gradient: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  },
];

export const DOC_TYPES = [
  {
    id: "sales",
    title: "Sales Order",
    desc: "Extract data from sales orders via email or PDF upload",
    icon: "receipt",
    gradient: "linear-gradient(135deg, #6366f1, #8b5cf6)",
  },
  {
    id: "costing",
    title: "Costing Diagram",
    desc: "Upload engineering drawings or costing diagrams for extraction",
    icon: "ruler",
    gradient: "linear-gradient(135deg, #f59e0b, #f97316)",
  },
];

export const UPLOAD_METHODS = [
  {
    id: "email",
    icon: "mail",
    title: "Email",
    desc: "Connect your email to auto-extract sales orders from incoming emails",
    gradient: "linear-gradient(135deg, #1A5EA8, #F07621)",
  },
  {
    id: "upload",
    icon: "file-text",
    title: "Direct Upload PDF",
    desc: "Upload PDF files directly from your device for instant extraction",
    gradient: "linear-gradient(135deg, #3b82f6, #60a5fa)",
  },
];

export const SOLUTIONS = [
  { label: "Insurance", href: "https://datacaffe.ai/insurance-analytics" },
  { label: "Manufacturing", href: "https://datacaffe.ai/manufacturing-analytics" },
  { label: "Payroll", href: "https://datacaffe.ai/payroll-analytics" },
  { label: "HRMS", href: "https://datacaffe.ai/hrms-analytics" },
  { label: "CRM", href: "https://datacaffe.ai/crm-analytics" },
  { label: "E-commerce", href: "https://datacaffe.ai/ecommerce-analytics" },
  { label: "Finance and Accounting", href: "https://datacaffe.ai/finance-analytics" },
  { label: "Healthcare", href: "https://datacaffe.ai/healthcare-analytics" },
];

export const PRODUCTS = [
  { label: "Integrator", href: "https://datacaffe.ai/integrator" },
  { label: "Transformer", href: "https://datacaffe.ai/transformer" },
  { label: "Insightor", href: "https://datacaffe.ai/insightor" },
  { label: "Accelerator", href: "https://datacaffe.ai/accelerator" },
];

export const COMPANY_LINKS = [
  // { label: "Book a Demo", href: "https://datacaffe.ai/demo" },
  { label: "Contact Us", href: "https://datacaffe.ai/contactus" },
  { label: "Pricing", href: "https://datacaffe.ai/pricing" },
  { label: "About Us", href: "https://datacaffe.ai/aboutus" },
  { label: "Community", href: "https://datacaffe.ai/community" },
];

export const SUPPORT_LINKS = [
  { icon: "lightbulb", text: "Help Center", href: "https://datacaffe.ai/help" },
  { icon: "alert-triangle", text: "Troubleshooting", href: "https://datacaffe.ai/troubleshooting" },
  { icon: "mail", text: "admin@datacaffe.ai", href: "mailto:admin@datacaffe.ai" },
  { icon: "map-pin", text: "Bengaluru, India", href: "https://maps.google.com/?q=Bengaluru,India" },
];

export const SOCIAL_LINKS = [
  { platform: "twitter", href: "https://x.com/datacaffe" },
  { platform: "linkedin", href: "https://www.linkedin.com/company/datacaffe" },
  { platform: "youtube", href: "https://www.youtube.com/@datacaffe" },
];

export const LEGAL_LINKS = [
  { label: "Privacy Policy", href: "https://datacaffe.ai/privacy" },
  { label: "Terms and Conditions", href: "https://datacaffe.ai/terms" },
  { label: "Security", href: "https://datacaffe.ai/security" },
];

export const STATS = [
  { value: "50+", label: "Data Points", icon: "bar-chart" },
  { value: "99.2%", label: "Enterprise Ready", icon: "shield" },
  { value: "AI™", label: "AI Extractor", icon: "star" },
];

export const API_BASE = "/api";
