# DataCaffé AI Data Extractor v3.0

> AI-powered tool that automatically reads business documents and engineering drawings, extracts key information, and converts it into structured data.

## 🚀 Quick Start

### Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`

### Backend (FastAPI + Python)

```bash
cd backend
pip install -r requirements.txt
python api_server.py
```

Backend runs at `http://localhost:8000`

## 📁 Project Structure

```
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ParticleField.jsx    # Animated floating particles
│   │   │   ├── Logo.jsx             # Animated DataCaffé logo with steam
│   │   │   ├── Navbar.jsx           # Scroll-aware navigation bar
│   │   │   ├── HeroSection.jsx      # Landing hero with parallax
│   │   │   ├── WorkflowOrbit.jsx    # Animated circular workflow diagram
│   │   │   ├── WhatIsSection.jsx    # Pipeline explanation section
│   │   │   ├── WizardModal.jsx      # Multi-step extraction wizard
│   │   │   ├── Footer.jsx           # Full footer with links
│   │   │   └── index.js             # Barrel exports
│   │   ├── hooks/
│   │   │   └── useAnimations.js     # Custom hooks (scroll, intersection, parallax)
│   │   ├── utils/
│   │   │   └── constants.js         # App data & configuration
│   │   ├── styles/
│   │   │   ├── index.css            # Global CSS variables & reset
│   │   │   └── animations.css       # All animation keyframes
│   │   ├── App.jsx                  # Root application component
│   │   └── main.jsx                 # React entry point
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── api_server.py
│   ├── extractor.py
│   ├── pdf_processor.py
│   ├── excel_builder.py
│   └── requirements.txt
└── README.md
```

## ✨ Features

### Animated Landing Page
- Floating particle field background
- Pulsing logo with coffee steam animation
- Rotating orbital workflow diagram with traveling energy dots
- Parallax mouse-tracking effects
- Staggered entrance animations
- Gradient text animations

### Interactive Wizard Flow
1. **Document Type Selection** — Sales Order, Costing Diagram, or ECI
2. **Upload Method** (Sales Order) — Email or Direct Upload PDF
3. **Configuration** — Email credentials form or drag-and-drop file uploader

### Core Components Pipeline
- Upload → Render → AI Processing → Tokens → Download
- Interactive hover cards with colored accents

## 🛠 Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Frontend | React 18, Vite 5, Framer Motion         |
| Styling  | CSS Variables, Custom Animations        |
| Backend  | FastAPI, Python, OpenAI API             |
| Fonts    | Playfair Display, DM Sans, JetBrains Mono |

## 📝 License

© 2026 DataCaffe. All rights reserved.
