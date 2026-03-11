"""
United Rubber Sales Analytics — FastAPI Routes
Connects to DigitalOcean PostgreSQL (DC_UnitedRubber / LandingStage2 schema).
"""
import os
import psycopg2
import psycopg2.extras
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

router = APIRouter(prefix="/api/v1/urdb", tags=["United Rubber Sales DB"])

DB_CONFIG = dict(
    host=os.getenv("URDB_HOST", "db-postgresql-blr1-60665-do-user-15352878-0.k.db.ondigitalocean.com"),
    dbname=os.getenv("URDB_DBNAME", "DC_UnitedRubber"),
    port=int(os.getenv("URDB_PORT", "25060")),
    user=os.getenv("URDB_USER", "DC_RAUSHAN"),
    password=os.getenv("URDB_PASSWORD"),
    sslmode="require",
    connect_timeout=15,
)

H = '"LandingStage2".mf_sales_si_siheader_all'
D = '"LandingStage2"."mf_sales_si_sipl_siid_sisd_sibd_siacd_sidc_all"'


def _get_conn():
    return psycopg2.connect(**DB_CONFIG)


def _rows_as_dicts(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _to_num(col: str, alias: str = "") -> str:
    """Safe numeric cast — handles plain numbers and Indian comma-formatted strings (e.g. '7,30,582.50')."""
    p = f'"{alias}".' if alias else ""
    stripped = f"REPLACE(TRIM({p}\"{col}\"), ',', '')"
    return (
        f"COALESCE(SUM(CASE WHEN {stripped} ~ '^[-]?[0-9]+(\\.[0-9]+)?$' "
        f"THEN {stripped}::NUMERIC ELSE 0 END), 0)"
    )


def _build_where(
    date_from: Optional[str],
    date_to: Optional[str],
    status: Optional[str],
    invoice_type: Optional[str],
    site: Optional[str],
    ship_state: Optional[str],
    customer_name: Optional[str],
    alias: str = "h",
) -> tuple[str, list]:
    conds, params = [], []
    a = f'"{alias}".' if alias else ""

    if date_from:
        conds.append(f'{a}"Invoice_Date_(Date)" >= %s')
        params.append(date_from)
    if date_to:
        conds.append(f'{a}"Invoice_Date_(Date)" <= %s')
        params.append(date_to)

    for field, val in [
        ("Status_", status),
        ("Invoice_Type_", invoice_type),
        ("Site_", site),
        ("Ship_To_Address_State", ship_state),
        ("Customer_Name_", customer_name),
    ]:
        if val:
            vals = [v.strip() for v in val.split(",") if v.strip()]
            if vals:
                conds.append(f'{a}"{field}" = ANY(%s)')
                params.append(vals)

    return ("WHERE " + " AND ".join(conds)) if conds else "", params


# ── Shared filter query params as a dependency-like helper ─────────────────
def _fp(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    return date_from, date_to, status, invoice_type, site, ship_state, customer_name


# ══════════════════════════════════════════════════════════════
# 1. FILTER OPTIONS
# ══════════════════════════════════════════════════════════════
@router.get("/filter-options", summary="Distinct values for all filter dropdowns")
def filter_options():
    conn = _get_conn()
    try:
        cur = conn.cursor()

        def distinct(col, cond=""):
            cur.execute(
                f'SELECT DISTINCT "{col}" FROM {H} '
                f'WHERE "{col}" IS NOT NULL AND "{col}" NOT IN (\'\', \'0\') '
                f'{("AND " + cond) if cond else ""} '
                f'ORDER BY "{col}" LIMIT 200'
            )
            return [r[0] for r in cur.fetchall()]

        return {
            "statuses": distinct("Status_"),
            "invoice_types": distinct("Invoice_Type_"),
            "sites": distinct("Site_"),
            "ship_states": distinct("Ship_To_Address_State"),
            "customers": distinct("Customer_Name_"),
        }
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 2. KPI STATS (header table only — fast)
# ══════════════════════════════════════════════════════════════
@router.get("/stats", summary="KPI summary — net amount, gross amount, tax, invoice count")
def stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")
    sql = f"""
        SELECT
            COUNT(DISTINCT "Invoice_No_")                          AS invoice_count,
            {_to_num('Amount_')}                                   AS net_amount,
            {_to_num('Invoice_Amount_')}                           AS gross_amount,
            {_to_num('Tax_')}                                      AS tax_amount,
            MIN("Invoice_Date_(Date)")                             AS date_from,
            MAX("Invoice_Date_(Date)")                             AS date_to
        FROM {H}
        {where}
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        row = cur.fetchone()
        return {
            "invoice_count": int(row[0] or 0),
            "net_amount": float(row[1] or 0),
            "gross_amount": float(row[2] or 0),
            "tax_amount": float(row[3] or 0),
            "date_from": row[4],
            "date_to": row[5],
        }
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 3. MONTHLY TREND
# ══════════════════════════════════════════════════════════════
@router.get("/monthly-trend", summary="Net & gross amount by month")
def monthly_trend(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")
    sql = f"""
        SELECT
            SUBSTRING("Invoice_Date_(Date)", 1, 7)                AS month,
            {_to_num('Amount_')}                                   AS net_amount,
            {_to_num('Invoice_Amount_')}                           AS gross_amount
        FROM {H}
        {where}
        GROUP BY SUBSTRING("Invoice_Date_(Date)", 1, 7)
        ORDER BY month
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return [
            {"month": r[0], "net_amount": float(r[1] or 0), "gross_amount": float(r[2] or 0)}
            for r in cur.fetchall()
            if r[0]
        ]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 4. TOP CUSTOMERS
# ══════════════════════════════════════════════════════════════
@router.get("/top-customers", summary="Top 10 customers by gross amount")
def top_customers(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")
    sql = f"""
        SELECT
            "Customer_Name_",
            {_to_num('Invoice_Amount_')}  AS gross_amount,
            {_to_num('Amount_')}          AS net_amount,
            COUNT(DISTINCT "Invoice_No_") AS invoice_count
        FROM {H}
        WHERE "Customer_Name_" IS NOT NULL AND "Customer_Name_" != ''
        {"AND" if where.startswith("WHERE") else ""}
        {where.replace("WHERE", "", 1).strip() if where else ""}
        GROUP BY "Customer_Name_"
        ORDER BY gross_amount DESC
        LIMIT 10
    """
    # Rebuild cleanly
    if where:
        cond_body = where[6:].strip()  # strip "WHERE "
        sql = f"""
            SELECT
                "Customer_Name_",
                {_to_num('Invoice_Amount_')}  AS gross_amount,
                {_to_num('Amount_')}          AS net_amount,
                COUNT(DISTINCT "Invoice_No_") AS invoice_count
            FROM {H}
            WHERE "Customer_Name_" IS NOT NULL AND "Customer_Name_" != ''
              AND {cond_body}
            GROUP BY "Customer_Name_"
            ORDER BY gross_amount DESC
            LIMIT 10
        """
    else:
        sql = f"""
            SELECT
                "Customer_Name_",
                {_to_num('Invoice_Amount_')}  AS gross_amount,
                {_to_num('Amount_')}          AS net_amount,
                COUNT(DISTINCT "Invoice_No_") AS invoice_count
            FROM {H}
            WHERE "Customer_Name_" IS NOT NULL AND "Customer_Name_" != ''
            GROUP BY "Customer_Name_"
            ORDER BY gross_amount DESC
            LIMIT 10
        """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return [
            {
                "customer": r[0],
                "gross_amount": float(r[1] or 0),
                "net_amount": float(r[2] or 0),
                "invoice_count": int(r[3] or 0),
            }
            for r in cur.fetchall()
        ]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 5. ITEM CATEGORIES
# ══════════════════════════════════════════════════════════════
@router.get("/item-categories", summary="Net amount by item category (top 10)")
def item_categories(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    h_where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="h")
    sql = f"""
        SELECT
            d."Item_Category_Description"                                          AS category,
            COALESCE(SUM(
                CASE WHEN d."Item_NetAmount" ~ '^[-]?[0-9]+(\\.[0-9]+)?$'
                THEN d."Item_NetAmount"::NUMERIC ELSE 0 END), 0)                   AS net_amount
        FROM {D} d
        JOIN {H} h ON d."Invoice_No_" = h."Invoice_No_"
        {h_where}
        AND d."Item_Category_Description" IS NOT NULL
        AND d."Item_Category_Description" != ''
        GROUP BY d."Item_Category_Description"
        ORDER BY net_amount DESC
        LIMIT 10
    """
    # If no where clause, drop AND
    if not h_where:
        sql = f"""
            SELECT
                d."Item_Category_Description"                                              AS category,
                COALESCE(SUM(
                    CASE WHEN d."Item_NetAmount" ~ '^[-]?[0-9]+(\\.[0-9]+)?$'
                    THEN d."Item_NetAmount"::NUMERIC ELSE 0 END), 0)                       AS net_amount
            FROM {D} d
            WHERE d."Item_Category_Description" IS NOT NULL AND d."Item_Category_Description" != ''
            GROUP BY d."Item_Category_Description"
            ORDER BY net_amount DESC
            LIMIT 10
        """

    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return [
            {"category": r[0], "net_amount": float(r[1] or 0)}
            for r in cur.fetchall()
        ]
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 6. SITE-WISE MONTHLY STATS (for Summary Analysis tab)
# ══════════════════════════════════════════════════════════════
@router.get("/site-monthly", summary="Monthly net amount broken down by site")
def site_monthly(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")
    sql = f"""
        SELECT
            SUBSTRING("Invoice_Date_(Date)", 1, 7) AS month,
            "Site_",
            {_to_num('Amount_')}                   AS net_amount,
            {_to_num('Invoice_Amount_')}            AS gross_amount
        FROM {H}
        {where}
        GROUP BY SUBSTRING("Invoice_Date_(Date)", 1, 7), "Site_"
        ORDER BY month, "Site_"
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()

        # Pivot: {month: {site: {net, gross}}}
        months_set = sorted(set(r[0] for r in rows if r[0]))
        sites_set = sorted(set(r[1] for r in rows if r[1]))
        pivot = {m: {s: {"net": 0.0, "gross": 0.0} for s in sites_set} for m in months_set}
        for r in rows:
            if r[0] and r[1]:
                pivot[r[0]][r[1]] = {"net": float(r[2] or 0), "gross": float(r[3] or 0)}

        return {
            "months": months_set,
            "sites": sites_set,
            "data": [{
                "month": m,
                **{f"{s}_net": pivot[m][s]["net"] for s in sites_set},
                **{f"{s}_gross": pivot[m][s]["gross"] for s in sites_set},
            } for m in months_set],
        }
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 7. ORDERS TABLE (paginated)
# ══════════════════════════════════════════════════════════════
@router.get("/orders", summary="Paginated order detail list")
def orders(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_col: str = Query("Invoice_Date_(Date)"),
    sort_dir: str = Query("desc"),
):
    ALLOWED_SORT_COLS = {
        "Invoice_No_", "Invoice_Date_(Date)", "Invoice_Type_", "Status_",
        "Site_", "Customer_Name_", "Amount_", "Invoice_Amount_", "Tax_",
    }
    if sort_col not in ALLOWED_SORT_COLS:
        sort_col = "Invoice_Date_(Date)"
    sort_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")
    offset = (page - 1) * page_size

    count_sql = f'SELECT COUNT(DISTINCT "Invoice_No_") FROM {H} {where}'
    data_sql = f"""
        SELECT
            "Invoice_No_",
            "Invoice_Date_(Date)"           AS invoice_date,
            "Invoice_Type_",
            "Status_",
            "Site_",
            "Customer_Name_",
            "Ship_To_Address_City",
            "Ship_To_Address_State",
            "Invoice_Description_"          AS description,
            "Amount_"                       AS net_amount,
            "Tax_"                          AS tax,
            "Invoice_Amount_"               AS gross_amount,
            "Created_Date",
            "Approved_Date",
            "Preparation_Date_",
            "Removal_Date_",
            "Employee_Name_",
            "Party_Group_Description"
        FROM {H}
        {where}
        ORDER BY "{sort_col}" {sort_dir} NULLS LAST
        LIMIT %s OFFSET %s
    """

    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(count_sql, params)
        total = cur.fetchone()[0]

        cur.execute(data_sql, params + [page_size, offset])
        rows = _rows_as_dicts(cur)
        return {"total": int(total), "page": page, "page_size": page_size, "data": rows}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 8. INVOICE SUMMARY (paginated invoice-level totals)
# ══════════════════════════════════════════════════════════════
@router.get("/invoices", summary="Paginated invoice summary")
def invoices(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_col: str = Query("Invoice_Date_(Date)"),
    sort_dir: str = Query("desc"),
):
    ALLOWED = {"Invoice_No_", "Invoice_Date_(Date)", "Customer_Name_", "Invoice_Type_", "Status_", "Amount_", "Invoice_Amount_"}
    if sort_col not in ALLOWED:
        sort_col = "Invoice_Date_(Date)"
    sort_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")
    offset = (page - 1) * page_size

    count_sql = f'SELECT COUNT(*) FROM {H} {where}'
    data_sql = f"""
        SELECT
            "Invoice_No_",
            "Invoice_Date_(Date)"       AS invoice_date,
            "Site_",
            "Customer_Name_",
            "Invoice_Type_",
            "Status_",
            "Amount_"                   AS net_amount,
            "Tax_"                      AS tax,
            "Charge_"                   AS charge,
            "Discount_"                 AS discount,
            "Invoice_Amount_"           AS gross_amount,
            "Ship_To_Address_State"     AS ship_state,
            "Ship_To_Address_City"      AS ship_city,
            "Party_Group_Description"   AS party_group,
            "Employee_Name_"            AS employee
        FROM {H}
        {where}
        ORDER BY "{sort_col}" {sort_dir} NULLS LAST
        LIMIT %s OFFSET %s
    """

    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(count_sql, params)
        total = cur.fetchone()[0]
        cur.execute(data_sql, params + [page_size, offset])
        rows = _rows_as_dicts(cur)
        return {"total": int(total), "page": page, "page_size": page_size, "data": rows}
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 9. STATE-WISE REVENUE STATS (for Distribution Map)
# ══════════════════════════════════════════════════════════════
@router.get("/state-stats", summary="Revenue breakdown by ship-to state")
def state_stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")

    if where:
        cond_body = where[6:].strip()
        full_where = f'WHERE "Ship_To_Address_State" IS NOT NULL AND "Ship_To_Address_State" NOT IN (\'\', \'0\') AND {cond_body}'
    else:
        full_where = 'WHERE "Ship_To_Address_State" IS NOT NULL AND "Ship_To_Address_State" NOT IN (\'\', \'0\')'

    sql = f"""
        SELECT
            "Ship_To_Address_State"                AS state,
            COUNT(DISTINCT "Invoice_No_")          AS invoice_count,
            {_to_num('Amount_')}                   AS net_amount,
            {_to_num('Invoice_Amount_')}            AS gross_amount
        FROM {H}
        {full_where}
        GROUP BY "Ship_To_Address_State"
        ORDER BY net_amount DESC
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        total = sum(float(r[2] or 0) for r in rows)
        result = []
        for r in rows:
            net = float(r[2] or 0)
            inv_count = int(r[1] or 0)
            result.append({
                "state": r[0],
                "invoice_count": inv_count,
                "net_amount": net,
                "gross_amount": float(r[3] or 0),
                "avg_invoice": round(net / max(inv_count, 1), 2),
                "share_pct": round(net / total * 100, 1) if total > 0 else 0.0,
            })
        return result
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════
# 10. CITY-WISE REVENUE STATS (top 20)
# ══════════════════════════════════════════════════════════════
@router.get("/city-stats", summary="Revenue breakdown by city (top 20)")
def city_stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    invoice_type: Optional[str] = Query(None),
    site: Optional[str] = Query(None),
    ship_state: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
):
    where, params = _build_where(date_from, date_to, status, invoice_type, site, ship_state, customer_name, alias="")

    if where:
        cond_body = where[6:].strip()
        full_where = f'WHERE "Ship_To_Address_City" IS NOT NULL AND "Ship_To_Address_City" NOT IN (\'\', \'0\') AND {cond_body}'
    else:
        full_where = 'WHERE "Ship_To_Address_City" IS NOT NULL AND "Ship_To_Address_City" NOT IN (\'\', \'0\')'

    sql = f"""
        SELECT
            "Ship_To_Address_City"                 AS city,
            "Ship_To_Address_State"                AS state,
            COUNT(DISTINCT "Invoice_No_")          AS invoice_count,
            {_to_num('Amount_')}                   AS net_amount
        FROM {H}
        {full_where}
        GROUP BY "Ship_To_Address_City", "Ship_To_Address_State"
        ORDER BY net_amount DESC
        LIMIT 20
    """
    conn = _get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = cur.fetchall()
        return [
            {"city": r[0], "state": r[1], "invoice_count": int(r[2] or 0), "net_amount": float(r[3] or 0)}
            for r in rows
        ]
    finally:
        conn.close()
