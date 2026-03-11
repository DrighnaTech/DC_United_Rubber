"""
Extractor v4 — Large PDF support with precise token analytics.
- Pre-scan: tiktoken estimation BEFORE any API call
- Live tracking: per-batch token accumulation with callbacks
- Post-scan: 100% accurate actual tokens from API response
- Output analysis: completion token breakdown
- Cost: per-request and cumulative cost tracking
"""
import openai, base64, json, re, math, os, time
from pathlib import Path
from typing import Callable, Optional

# ──────────────────────────────────────────────────────────────
# TOKEN COUNTING (TIKTOKEN — 100% ACCURATE FOR TEXT)
# ──────────────────────────────────────────────────────────────

def get_encoding_for_model(model: str):
    try:
        import tiktoken
        try:
            return tiktoken.encoding_for_model(model)
        except KeyError:
            return tiktoken.get_encoding("cl100k_base")
    except ImportError:
        return None


def count_text_tokens(text: str, model: str) -> int:
    enc = get_encoding_for_model(model)
    if enc:
        return len(enc.encode(text))
    return math.ceil(len(text) / 4)


def count_image_tokens(image_path: str, detail: str = "high") -> dict:
    """
    OpenAI's EXACT image token formula:
    LOW:  85 tokens flat
    HIGH: scale → tile into 512×512 → (tiles × 170) + 85
    """
    try:
        from PIL import Image
        with Image.open(image_path) as img:
            width, height = img.size
            file_size_kb = os.path.getsize(image_path) / 1024
    except Exception:
        width, height, file_size_kb = 1024, 768, 500

    if detail == "low":
        return {"width": width, "height": height, "detail": "low",
                "tiles": 0, "tokens": 85, "file_size_kb": file_size_kb}

    orig_w, orig_h = width, height

    if max(width, height) > 2048:
        s = 2048 / max(width, height)
        width, height = int(width * s), int(height * s)
    if min(width, height) > 768:
        s = 768 / min(width, height)
        width, height = int(width * s), int(height * s)

    tx = math.ceil(width / 512)
    ty = math.ceil(height / 512)
    tiles = tx * ty
    tokens = (tiles * 170) + 85

    return {
        "width": orig_w, "height": orig_h,
        "scaled_w": width, "scaled_h": height,
        "detail": "high", "tiles_x": tx, "tiles_y": ty,
        "num_tiles": tiles, "tokens": tokens,
        "file_size_kb": round(file_size_kb, 1),
    }


def prescan_tokens(prompt_text: str, image_paths: list, model: str, detail: str = "high") -> dict:
    """
    PRE-SCAN: Estimate ALL input tokens BEFORE any API call.
    For large PDFs this tells you exactly how many tokens you'll use.
    """
    text_tokens = count_text_tokens(prompt_text, model)
    overhead = 7

    per_page = []
    total_img_tokens = 0
    total_file_kb = 0

    for i, p in enumerate(image_paths):
        info = count_image_tokens(p, detail)
        info["page_num"] = i + 1
        per_page.append(info)
        total_img_tokens += info["tokens"]
        total_file_kb += info.get("file_size_kb", 0)

    total_input = text_tokens + total_img_tokens + overhead

    return {
        "text_tokens": text_tokens,
        "image_count": len(image_paths),
        "per_page_images": per_page,
        "total_image_tokens": total_img_tokens,
        "message_overhead": overhead,
        "total_estimated_input": total_input,
        "total_file_size_kb": round(total_file_kb, 1),
    }


# ──────────────────────────────────────────────────────────────
# COST MODEL
# ──────────────────────────────────────────────────────────────

MODEL_PRICING = {
    "gpt-5.2":      {"input": 2.50,  "output": 10.00, "cached_input": 1.25},
    "gpt-5.2-mini": {"input": 0.40,  "output": 1.60,  "cached_input": 0.20},
    "gpt-4o":       {"input": 2.50,  "output": 10.00, "cached_input": 1.25},
    "gpt-4o-mini":  {"input": 0.15,  "output": 0.60,  "cached_input": 0.075},
    "gpt-4-turbo":  {"input": 10.00, "output": 30.00, "cached_input": 5.00},
    "gpt-4.1":      {"input": 2.00,  "output": 8.00,  "cached_input": 0.50},
    "gpt-4.1-mini": {"input": 0.40,  "output": 1.60,  "cached_input": 0.10},
    "gpt-4.1-nano": {"input": 0.10,  "output": 0.40,  "cached_input": 0.025},
    "o3":           {"input": 2.00,  "output": 8.00,  "cached_input": 0.50},
    "o4-mini":      {"input": 1.10,  "output": 4.40,  "cached_input": 0.275},
}
DEFAULT_PRICING = {"input": 2.50, "output": 10.00, "cached_input": 1.25}


def calculate_cost(prompt_tokens: int, completion_tokens: int, model: str, cached_tokens: int = 0) -> dict:
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    non_cached = prompt_tokens - cached_tokens
    ic = (non_cached / 1e6) * pricing["input"]
    cc = (cached_tokens / 1e6) * pricing["cached_input"]
    oc = (completion_tokens / 1e6) * pricing["output"]
    return {
        "model": model,
        "pricing_per_1m": pricing,
        "prompt_tokens": prompt_tokens,
        "cached_tokens": cached_tokens,
        "non_cached_input": non_cached,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "input_cost_usd": round(ic, 6),
        "cached_cost_usd": round(cc, 6),
        "output_cost_usd": round(oc, 6),
        "total_cost_usd": round(ic + cc + oc, 6),
    }


def estimate_cost(input_tokens: int, est_output_tokens: int, model: str) -> dict:
    """Estimate cost BEFORE API call using estimated token counts."""
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    ic = (input_tokens / 1e6) * pricing["input"]
    oc = (est_output_tokens / 1e6) * pricing["output"]
    return {
        "estimated_input_tokens": input_tokens,
        "estimated_output_tokens": est_output_tokens,
        "estimated_input_cost": round(ic, 6),
        "estimated_output_cost": round(oc, 6),
        "estimated_total_cost": round(ic + oc, 6),
    }


# ──────────────────────────────────────────────────────────────
# EXTRACTION PROMPT
# ──────────────────────────────────────────────────────────────

EXTRACTION_PROMPT = r"""You are an expert engineering drawing analyst for rubber/polymer automotive components.
Analyze the drawing image(s) and extract EVERY SINGLE data point. Be exhaustive — check every corner, table, note, dimension line, stamp, and border text.

RULES:
- Extract REAL values only. Do NOT invent data.
- Read ALL dimension lines, ALL tables, ALL notes, ALL title block fields.
- German: Benennung=Title, Werkstoff=Material, Massstab=Scale, Gewicht=Weight, Blatt=Sheet, Gez.=Drawn, Tabelle=Table, Faltenbalg=Bellows, Abdichtung=Seal, Schlauch=Hose
- Material codes: "MAN 305-EPDM-6-70" = MAN std, EPDM, grade 6, Shore 70. "VW 2.8.1-G50" = VW std, Shore 50.
- Weight: "(c)0.034" or "ca. 0.034" = approx 0.034 kg. "errechnet" = calculated.
- Coordinate tables: extract EVERY row (Label, X, Y, Z, R, Strecke, etc.)
- BOM tables: extract EVERY row (Item, Part No, Rev, Description, Material, Qty)
- Marking tables: extract EVERY row (Marking Type, Standard, Description)
- Dimensions: ALL diameters, lengths, wall thicknesses, radii, angles, tolerances
- "$" on a dimension = control dimension (VW-specific)
- Parenthesized dims like (15) = reference dimensions
- Confidence: 100%=directly readable, 95%=clear+context, 90%=interpretation, 80%=inferred, <80%=assumption

★★★ CRITICAL — DO NOT MISS THESE SECTIONS: ★★★

1. **"Unterlagen / References" BOX**: Look for a box titled "Unterlagen" or "References" near the drawing border. It lists referenced standards/documents vertically, e.g.:
   VW 01155, VW 10500, VW 91101, VW 91102, VW 01054, DIN 10514, PV 1015, VDA 260, VW 10550, VW 10560, VW 91100, VW 2.8.1, 2000/53/EG, DIN 1451, DIN ISO 3302-1M3
   → Extract EVERY LINE from this box into "standards". Each line = 1 entry.

2. **GENERAL TOLERANCE TABLE**: Look for a table showing tolerance ranges for undimensioned features. It has rows like:
   >400 ≤ 1000 | ±tolerance
   >120 ≤ 400  | ±tolerance
   > 30 ≤ 120  | ±tolerance
   >  6 ≤  30  | ±tolerance
   ≤ 6          | ±tolerance
   Winkel/Angle | ±tolerance
   → Extract EVERY ROW into "general_tolerances".
   → Also extract the text below/near: "Toleranzen der nicht-bemassten Laengen- und Winkelmosse zum Datensatz und definiertem RPS" / "Tolerances of undimensioned lengths and angular dimensions to the data record and defined RPS."

3. **ALL STANDARDS**: Scan ENTIRE drawing — title block, borders, notes, stamps, Unterlagen box, footnotes, tolerance tables — for ANY standard (VW, DIN, ISO, DIN ISO, EN, ASTM, MAN, PV, VDA, SAE, EU directives like 2000/53/EG).

4. **"Kennzeichnung / Identification" MARKING TABLE**: This is a critical table usually near the title block. It lists marking requirements with German labels, English translations, and VW/DIN standard codes. Extract EVERY row. The table typically contains these rows (translate German → English):

   | German (original)       | English Translation      | Standard     |
   |-------------------------|--------------------------|--------------|
   | Kennzeichnung           | Identification           | VW 105 00    |
   | Markenzeichen / Trademark | Trademark             | VW 105 14    |
   | Herstellland            | Country of Origin        | VW 105 50    |
   | Hersteller-Code         | Manufacturer Code (Mfr.) | VW 105 40    |
   | Teil-Nr.; Schrift       | Part No.; Lettering      | DIN 1451     |
   | Datumskennzeichnung     | Date Identification      | VW 105 60    |
   | Werkstoff-Code          | Material Code            | VDA 260      |

   → Extract EVERY ROW into "marking_table". Include BOTH the original German text AND the English translation.
   → The table may have more or fewer rows — extract whatever is present.
   → marking_type_german = original German label
   → marking_type = English translation
   → standard = the VW/DIN/VDA code

Return JSON with EXACTLY this structure:

{
  "drawing_info": {
    "drawing_number": "string", "part_name": "string", "company": "string",
    "domain": "e.g. Automotive", "part_type": "e.g. Hose, Seal",
    "drawing_standard": "e.g. ASME Y14.5M, DIN ISO 3302-1M3"
  },
  "title_block": [{"num": 1, "field": "...", "value": "...", "confidence": 100, "source_location": "..."}],
  "dimensions": [{"dim_id": "D001", "category": "diameter|length|wall_thickness|radius|angle|reference", "feature": "...", "nominal": "...", "tol_plus": null, "tol_minus": null, "unit": "mm", "raw_text": "...", "view": "...", "confidence": 100}],
  "coordinate_points": [{"point": "P0", "x": 0.0, "y": 0.0, "z": 0.0, "unit": "mm", "confidence": 100}],
  "bom": [{"item": 1, "part_number": "...", "rev": "A", "description": "...", "matl_spec": "...", "matl_qty": "...", "confidence": 100}],
  "notes": [{"note_num": "1", "category": "tolerance|marking|process|general|environmental|reference", "full_text": "...", "english_translation": "...", "confidence": 100}],
  "standards": [{"num": 1, "standard_type": "tolerance|material|marking|approval|environmental|surface|drawing|reference|EU_directive", "code": "VW 01155", "context": "Referenced in Unterlagen box", "confidence": 100}],
  "general_tolerances": [{"range": ">400 ≤ 1000", "tol_plus": "+1.2", "tol_minus": "-1.2", "unit": "mm", "tolerance_class": "if shown", "confidence": 100}],
  "general_tolerance_note": "Full original text of the note near the tolerance table + English translation if non-English",
  "marking_table": [{"marking_type_german": "Kennzeichnung", "marking_type": "Identification", "standard": "VW 105 00", "description": "Part identification marking per VW standard", "confidence": 100}],
  "revision_history": [{"rev": "A", "section": "", "description": "...", "english_translation": "", "date": "...", "change_code": "", "approved_by": "...", "confidence": 100}],
  "derived_data": [{"parameter": "...", "value": "...", "how_derived": "...", "confidence": 100}],
  "costing_input": [{"parameter": "...", "value": "...", "source": "...", "confidence": 100}],
  "accuracy_summary": {"total_data_points": 0, "confidence_100": 0, "confidence_90_99": 0, "confidence_80_89": 0, "confidence_below_80": 0, "overall_accuracy_pct": 0.0}
}

IMPORTANT:
- Empty sections → return [].
- "standards" MUST include ALL entries from the Unterlagen/References box PLUS any other standard found anywhere on the drawing. Do NOT skip any.
- "general_tolerances" MUST capture EVERY ROW from the general tolerance table, including the Winkel/Angle row.
- "general_tolerance_note" MUST include the full note text near the tolerance table.
- "marking_table" MUST capture EVERY ROW from the Kennzeichnung/Identification table. Always provide marking_type_german (original German) AND marking_type (English translation) for each row. Common translations: Kennzeichnung=Identification, Markenzeichen=Trademark, Herstellland=Country of Origin, Hersteller-Code=Manufacturer Code, Teil-Nr.=Part Number, Schrift=Lettering, Datumskennzeichnung=Date Identification, Werkstoff-Code=Material Code.
- derived_data: infer part type, material family, process type, complexity score, key dims, weight.
- costing_input: part number, revision, material, shore hardness, process type, key dimensions, weight.
- accuracy_summary: count ALL data points across ALL sections, bucket by confidence.
- Return ONLY valid JSON. No markdown, no commentary.
"""


# ──────────────────────────────────────────────────────────────
# LARGE PDF BATCH PROCESSOR
# ──────────────────────────────────────────────────────────────

MAX_IMAGES_PER_BATCH = 4  # GPT vision handles 4-5 images well per request


def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def _call_api(client, image_paths, model, max_tokens, prompt):
    """Single API call for a batch of images. Returns (raw_text, usage_dict, elapsed)."""
    content = [{"type": "text", "text": prompt}]
    for img in image_paths:
        b64 = encode_image(img)
        mime = "image/png" if Path(img).suffix.lower() == ".png" else "image/jpeg"
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"}
        })
    t0 = time.time()
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": content}],
        max_completion_tokens=max_tokens,
        temperature=0.1,
    )
    elapsed = time.time() - t0

    raw = resp.choices[0].message.content.strip()

    cached = 0
    if hasattr(resp.usage, 'prompt_tokens_details') and resp.usage.prompt_tokens_details:
        cached = getattr(resp.usage.prompt_tokens_details, 'cached_tokens', 0) or 0

    usage = {
        "prompt_tokens": resp.usage.prompt_tokens,
        "completion_tokens": resp.usage.completion_tokens,
        "total_tokens": resp.usage.total_tokens,
        "cached_tokens": cached,
    }
    return raw, usage, elapsed


def _parse_json(raw: str) -> dict:
    raw = re.sub(r'^```json\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        return json.loads(m.group()) if m else {}


def _merge_results(results: list[dict]) -> dict:
    """Merge multiple batch results into one unified data dict."""
    if len(results) == 1:
        return results[0]

    merged = results[0].copy()
    list_keys = ["title_block", "dimensions", "coordinate_points", "bom",
                 "notes", "standards", "general_tolerances", "marking_table",
                 "revision_history", "derived_data", "costing_input"]

    for r in results[1:]:
        for k in list_keys:
            existing = merged.get(k, [])
            new_items = r.get(k, [])
            # Deduplicate by converting to string
            existing_strs = {json.dumps(x, sort_keys=True) for x in existing}
            for item in new_items:
                if json.dumps(item, sort_keys=True) not in existing_strs:
                    existing.append(item)
            merged[k] = existing

        # Merge drawing_info — prefer non-empty
        if "drawing_info" in r:
            for k2, v2 in r["drawing_info"].items():
                if v2 and not merged.get("drawing_info", {}).get(k2):
                    merged.setdefault("drawing_info", {})[k2] = v2

        # Merge general_tolerance_note — prefer longer
        if r.get("general_tolerance_note") and len(str(r.get("general_tolerance_note", ""))) > len(str(merged.get("general_tolerance_note", ""))):
            merged["general_tolerance_note"] = r["general_tolerance_note"]

    return merged


def extract_drawing(
    api_key: str,
    image_paths: list,
    model: str = "gpt-5.2",
    max_tokens: int = 16384,
    on_prescan: Optional[Callable] = None,
    on_batch_start: Optional[Callable] = None,
    on_batch_done: Optional[Callable] = None,
):
    """
    Extract drawing data with full token analytics.

    Callbacks for live UI updates:
      on_prescan(prescan_data)        — called after pre-scan, before any API call
      on_batch_start(batch_num, total_batches, pages_in_batch)
      on_batch_done(batch_num, total_batches, batch_usage, cumulative_usage)

    Returns: (data, usage, token_analytics)
    """
    client = openai.OpenAI(api_key=api_key)
    total_pages = len(image_paths)

    # ═══════════════════════════════════════════════════════════
    # PHASE 1: PRE-SCAN — estimate tokens BEFORE any API call
    # ═══════════════════════════════════════════════════════════
    pre = prescan_tokens(EXTRACTION_PROMPT, image_paths, model, "high")

    # Split into batches for large PDFs
    batches = []
    for i in range(0, total_pages, MAX_IMAGES_PER_BATCH):
        batches.append(image_paths[i:i + MAX_IMAGES_PER_BATCH])
    num_batches = len(batches)

    # Estimate output tokens (~60% of max_tokens typical for dense drawings)
    est_output_per_batch = min(max_tokens, 8000)
    est_total_output = est_output_per_batch * num_batches
    est_cost = estimate_cost(pre["total_estimated_input"], est_total_output, model)

    prescan_data = {
        **pre,
        "total_pages": total_pages,
        "num_batches": num_batches,
        "pages_per_batch": MAX_IMAGES_PER_BATCH,
        "estimated_output_tokens": est_total_output,
        "estimated_total_tokens": pre["total_estimated_input"] + est_total_output,
        "estimated_cost": est_cost,
    }

    if on_prescan:
        on_prescan(prescan_data)

    # ═══════════════════════════════════════════════════════════
    # PHASE 2: PROCESS — batch API calls with live tracking
    # ═══════════════════════════════════════════════════════════
    all_results = []
    batch_details = []
    cumulative = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "cached_tokens": 0,
        "elapsed_sec": 0,
        "api_calls": 0,
    }

    total_start = time.time()

    for b_idx, batch_images in enumerate(batches):
        batch_num = b_idx + 1
        page_nums = [image_paths.index(p) + 1 for p in batch_images]

        if on_batch_start:
            on_batch_start(batch_num, num_batches, page_nums)

        raw, usage, elapsed = _call_api(client, batch_images, model, max_tokens, EXTRACTION_PROMPT)
        data_part = _parse_json(raw)
        all_results.append(data_part)

        # Update cumulative
        cumulative["prompt_tokens"] += usage["prompt_tokens"]
        cumulative["completion_tokens"] += usage["completion_tokens"]
        cumulative["total_tokens"] += usage["total_tokens"]
        cumulative["cached_tokens"] += usage["cached_tokens"]
        cumulative["elapsed_sec"] += elapsed
        cumulative["api_calls"] += 1

        # Batch detail
        batch_cost = calculate_cost(usage["prompt_tokens"], usage["completion_tokens"], model, usage["cached_tokens"])
        batch_info = {
            "batch_num": batch_num,
            "pages": page_nums,
            "num_images": len(batch_images),
            "usage": usage,
            "elapsed_sec": round(elapsed, 2),
            "cost": batch_cost,
            "output_json_chars": len(raw),
            "output_json_tokens_estimate": count_text_tokens(raw, model),
        }
        batch_details.append(batch_info)

        if on_batch_done:
            on_batch_done(batch_num, num_batches, batch_info, {**cumulative})

    total_elapsed = time.time() - total_start

    # ═══════════════════════════════════════════════════════════
    # PHASE 3: MERGE & ANALYZE
    # ═══════════════════════════════════════════════════════════
    data = _merge_results(all_results)

    # Final cost from ACTUAL tokens
    final_cost = calculate_cost(
        cumulative["prompt_tokens"],
        cumulative["completion_tokens"],
        model,
        cumulative["cached_tokens"]
    )

    # Estimation accuracy
    est_in = pre["total_estimated_input"]
    act_in = cumulative["prompt_tokens"]
    accuracy_pct = round((1 - abs(act_in - est_in) / max(act_in, 1)) * 100, 2)

    # Output token analysis
    output_analysis = {
        "total_output_tokens": cumulative["completion_tokens"],
        "output_tokens_per_page": round(cumulative["completion_tokens"] / max(total_pages, 1), 1),
        "output_tokens_per_batch": round(cumulative["completion_tokens"] / max(num_batches, 1), 1),
        "max_tokens_setting": max_tokens,
        "utilization_pct": round((cumulative["completion_tokens"] / (max_tokens * num_batches)) * 100, 1),
    }

    token_analytics = {
        "prescan": prescan_data,
        "actual": {
            "prompt_tokens": cumulative["prompt_tokens"],
            "completion_tokens": cumulative["completion_tokens"],
            "total_tokens": cumulative["total_tokens"],
            "cached_tokens": cumulative["cached_tokens"],
            "api_calls": cumulative["api_calls"],
            "total_elapsed_sec": round(total_elapsed, 2),
        },
        "estimation_accuracy": {
            "estimated_input": est_in,
            "actual_input": act_in,
            "difference": act_in - est_in,
            "accuracy_pct": accuracy_pct,
        },
        "output_analysis": output_analysis,
        "batch_details": batch_details,
        "cost": final_cost,
    }

    # Flat usage (backward compat)
    usage = {
        "prompt_tokens": cumulative["prompt_tokens"],
        "completion_tokens": cumulative["completion_tokens"],
        "total_tokens": cumulative["total_tokens"],
    }

    return data, usage, token_analytics
