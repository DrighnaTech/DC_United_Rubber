"""
Drawing Data Extractor — FastAPI Backend (Streamlit-free).
Provides REST API endpoints for the React frontend.
"""
import os
import tempfile
from typing import Any, Optional
from pydantic import BaseModel

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from extractor import extract_drawing, prescan_tokens, estimate_cost, MODEL_PRICING, EXTRACTION_PROMPT, MAX_IMAGES_PER_BATCH
from excel_builder import build_excel
from pdf_processor import pdf_to_images, cleanup_images

# Sales Order module router
from app.modules.data_extract_route import router as sales_order_router
# United Rubber sales analytics router
from app.modules.urdb_route import router as urdb_router

import math

load_dotenv()

app = FastAPI(
    title="Drawing Data Extractor API",
    version="2.0",
    description="AI-powered engineering drawing data extraction API"
)

# ── CORS for React frontend ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:5174", "http://127.0.0.1:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Create required directories for Sales Order module ──
for d in ["uploads", "json_data", "csv_exports", "excel_exports"]:
    os.makedirs(d, exist_ok=True)

# ── Include Sales Order routes (/api/v1/extract, /api/v1/extract/upload, etc.) ──
app.include_router(sales_order_router)
# ── Include United Rubber sales analytics routes (/api/v1/urdb/*) ──
app.include_router(urdb_router)

ALLOWED_MODELS = {"gpt-5.2", "gpt-5.2-mini", "gpt-4o", "gpt-4o-mini"}


class BuildExcelRequest(BaseModel):
    data: dict[str, Any]
    file_name: str = "extraction"


@app.get("/")
def home():
    return {"status": "ok", "message": "Drawing Data Extractor API v2.0. Open /docs for Swagger UI."}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/models")
def list_models():
    """Return available models with their metadata."""
    MODEL_INFO = {
        "gpt-5.2":      {"desc": "Latest & most capable", "max_tok": 4000},
        "gpt-5.2-mini": {"desc": "Fast & efficient",      "max_tok": 3000},
        "gpt-4o":       {"desc": "Proven vision model",    "max_tok": 2000},
        "gpt-4o-mini":  {"desc": "Lightweight & fast",     "max_tok": 1000},
    }
    result = {}
    for name, info in MODEL_INFO.items():
        pricing = MODEL_PRICING.get(name, {})
        result[name] = {
            **info,
            "pricing": pricing,
        }
    return result


def save_upload(uploaded: UploadFile) -> str:
    tmp_dir = tempfile.mkdtemp(prefix="drawing_api_")
    filename = uploaded.filename or "upload.bin"
    file_path = os.path.join(tmp_dir, filename)
    uploaded.file.seek(0)
    data = uploaded.file.read()
    with open(file_path, "wb") as f:
        f.write(data)
    return file_path


def get_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


@app.post("/extract")
async def extract_file(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(default=None),
    model: str = Form(default="gpt-5.2"),
    dpi: int = Form(default=250),
    max_tokens: int = Form(default=4000),
):
    """Extract all data points from an engineering drawing. Returns JSON."""
    if model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"Unsupported model: {model}")

    openai_key = api_key or os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(status_code=400, detail="OpenAI API key missing")

    filename = file.filename or "file"
    extension = get_extension(filename)
    images = []

    try:
        if extension in ["jpg", "jpeg", "png"]:
            image_path = save_upload(file)
            images = [image_path]
        elif extension == "pdf":
            pdf_bytes = await file.read()
            if not pdf_bytes:
                raise HTTPException(status_code=400, detail="Empty PDF uploaded")
            images = pdf_to_images(pdf_bytes, dpi=dpi)
        else:
            raise HTTPException(status_code=400, detail="Only PDF/JPG/PNG allowed")

        # Pre-scan for token estimation
        total_pages = len(images)
        pre = prescan_tokens(EXTRACTION_PROMPT, images, model, "high")
        num_batches = math.ceil(total_pages / MAX_IMAGES_PER_BATCH)
        est_output = min(max_tokens, 8000) * num_batches
        est_cost = estimate_cost(pre["total_estimated_input"], est_output, model)

        prescan_data = {
            **pre,
            "total_pages": total_pages,
            "num_batches": num_batches,
            "estimated_output_tokens": est_output,
            "estimated_cost": est_cost,
        }

        # Extract
        data, usage, token_analytics = extract_drawing(
            openai_key,
            images,
            model=model,
            max_tokens=max_tokens,
        )

        return JSONResponse({
            "file_name": filename,
            "total_pages": total_pages,
            "prescan": prescan_data,
            "data": data,
            "usage": usage,
            "token_analytics": token_analytics,
        })

    finally:
        if images:
            cleanup_images(images)


@app.post("/extract/excel")
async def extract_excel(
    file: UploadFile = File(...),
    api_key: Optional[str] = Form(default=None),
    model: str = Form(default="gpt-5.2"),
    dpi: int = Form(default=250),
    max_tokens: int = Form(default=4000),
):
    """Extract data and return as Excel file."""
    if model not in ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail=f"Unsupported model: {model}")

    openai_key = api_key or os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(status_code=400, detail="OpenAI API key missing")

    filename = file.filename or "file"
    extension = get_extension(filename)
    images = []

    try:
        if extension in ["jpg", "jpeg", "png"]:
            image_path = save_upload(file)
            images = [image_path]
        elif extension == "pdf":
            pdf_bytes = await file.read()
            if not pdf_bytes:
                raise HTTPException(status_code=400, detail="Empty PDF uploaded")
            images = pdf_to_images(pdf_bytes, dpi=dpi)
        else:
            raise HTTPException(status_code=400, detail="Only PDF/JPG/PNG allowed")

        data, _, _ = extract_drawing(
            openai_key,
            images,
            model=model,
            max_tokens=max_tokens,
        )

        excel_buffer = build_excel(data, filename)
        output_name = (filename.rsplit(".", 1)[0] if "." in filename else filename) + "_DATA_POINTS.xlsx"

        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{output_name}"'
            },
        )

    finally:
        if images:
            cleanup_images(images)


@app.post("/build-excel")
async def build_excel_from_json(payload: BuildExcelRequest):
    """Build Excel from already-extracted JSON data (no re-extraction)."""
    data = payload.data
    file_name = payload.file_name
    if not data:
        raise HTTPException(status_code=400, detail="No extraction data provided")

    excel_buffer = build_excel(data, file_name)
    output_name = (file_name.rsplit(".", 1)[0] if "." in file_name else file_name) + "_DATA_POINTS.xlsx"

    return StreamingResponse(
        excel_buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{output_name}"'
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

