import os
import json
import glob as glob_module
import datetime
from fastapi import APIRouter, Form, File, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from typing import Optional, List

from app.modules.data_extract_service import ExtractDataService

router = APIRouter(prefix = "/api/v1", tags = ["Sales Order Extraction"])


@router.get("/health", summary="Health check")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.datetime.utcnow().isoformat()}


@router.get("/dashboard/stats", summary="Dashboard statistics")
async def dashboard_stats():
    json_dir = os.path.join(os.getcwd(), "json_data")
    files = glob_module.glob(os.path.join(json_dir, "*.json"))

    total = len(files)
    today = datetime.date.today()
    docs_today = 0
    successful_extractions = 0
    total_line_items = 0

    for fp in files:
        try:
            mtime = datetime.date.fromtimestamp(os.path.getmtime(fp))
            if mtime == today:
                docs_today += 1
            with open(fp) as f:
                d = json.load(f)
            summary = d.get("processing_summary", {})
            if summary.get("successful_pages", 0) > 0:
                successful_extractions += 1
            total_line_items += len(d.get("line_items", []))
        except Exception:
            pass

    success_rate = round((successful_extractions / total * 100) if total > 0 else 0, 1)

    return {
        "total_extractions": total,
        "success_rate": success_rate,
        "docs_today": docs_today,
        "total_line_items": total_line_items,
    }


@router.get("/dashboard/recent", summary="Recent extraction activity")
async def dashboard_recent():
    json_dir = os.path.join(os.getcwd(), "json_data")
    all_files = glob_module.glob(os.path.join(json_dir, "*.json"))
    files = sorted(all_files, key=os.path.getmtime, reverse=True)[:20]

    results = []
    for fp in files:
        try:
            with open(fp) as f:
                d = json.load(f)
            summary = d.get("processing_summary", {})
            sp = summary.get("successful_pages", 0)
            tp = summary.get("total_pages_processed", 0)
            status = "success" if sp > 0 else "failed"
            mtime = datetime.datetime.fromtimestamp(os.path.getmtime(fp))
            results.append({
                "filename": d.get("filename", os.path.basename(fp)),
                "status": status,
                "pages": tp,
                "successful_pages": sp,
                "line_items": len(d.get("line_items", [])),
                "timestamp": mtime.isoformat(),
                "errors": len(summary.get("errors", [])),
            })
        except Exception:
            pass

    return {"results": results}


@router.post("/verify-email", summary = "Verify email credentials via IMAP")
async def verify_email(email_address: str = Form(...), email_password: str = Form(...)):
    result = await ExtractDataService.verify_email(email_address=email_address, email_password=email_password)

    if result.get("success"):
        return JSONResponse(content={"status": True, "response": "Email connected successfully", "data": None})
    else:
        return JSONResponse(content={"status": False, "response": result.get("error", "Connection failed"), "data": None})


@router.post("/extract", summary = "Extract data from PDF attachments in email")
async def extract_data_from_pdf(email_address: str = Form(...), email_password: str = Form(...), max_emails: Optional[int] = Form(None)):
    response = await ExtractDataService.extract_data_from_pdf(email_address=email_address, email_password=email_password, max_emails=max_emails)

    if response is not None and isinstance(response, dict):
        print(f"[Sales Order Email] Extraction response keys: {list(response.keys())}")
        usage = response.get("usage", {"total_tokens": 0})
        if "results" in response:
            for i, r in enumerate(response["results"]):
                if isinstance(r, dict):
                    summary = r.get("processing_summary", {})
                    print(f"  Result[{i}]: {r.get('filename', 'N/A')} — "
                          f"pages={summary.get('total_pages_processed', 0)}, "
                          f"ok={summary.get('successful_pages', 0)}, "
                          f"failed={summary.get('failed_pages', 0)}, "
                          f"line_items={len(r.get('line_items', []))}, "
                          f"errors={summary.get('errors', [])[:2]}")
        print(f"  Total tokens used: {usage.get('total_tokens', 0)}")
        return JSONResponse(content={"status": True, "response": "Data extracted successfully", "data": response, "usage": usage})
    else:
        print(f"[Sales Order Email] Extraction returned non-dict: {type(response)} -> {str(response)[:300]}")
        return JSONResponse(content={"status": False, "response": str(response) if response else "Failed to extract data", "data": None})


@router.post("/extract/upload", summary = "Extract data from directly uploaded PDF/Image files")
async def extract_data_from_upload(files: List[UploadFile] = File(...)):
    response = await ExtractDataService.extract_data_from_upload(files=files)

    if response is not None and isinstance(response, dict):
        print(f"[Sales Order Upload] Extraction response keys: {list(response.keys())}")
        usage = response.get("usage", {"total_tokens": 0})
        if "results" in response:
            for i, r in enumerate(response["results"]):
                if isinstance(r, dict):
                    summary = r.get("processing_summary", {})
                    print(f"  Result[{i}]: {r.get('filename', 'N/A')} — "
                          f"pages={summary.get('total_pages_processed', 0)}, "
                          f"ok={summary.get('successful_pages', 0)}, "
                          f"failed={summary.get('failed_pages', 0)}, "
                          f"line_items={len(r.get('line_items', []))}, "
                          f"errors={summary.get('errors', [])[:2]}")
        print(f"  Total tokens used: {usage.get('total_tokens', 0)}")
        return JSONResponse(content={"status": True, "response": "Data extracted successfully", "data": response, "usage": usage})
    else:
        print(f"[Sales Order Upload] Extraction returned non-dict: {type(response)} -> {str(response)[:300]}")
        return JSONResponse(content={"status": False, "response": str(response) if response else "Failed to extract data", "data": None})


@router.get("/download/excel", summary = "Download the generated Excel export")
async def download_excel():
    xlsx_path = os.path.join(os.getcwd(), "all_invoices.xlsx")
    if not os.path.exists(xlsx_path):
        return JSONResponse(content={"status": False, "response": "No Excel file available. Run extraction first.", "data": None})
    return FileResponse(
        path=xlsx_path,
        filename="sales_order_data.xlsx",
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
