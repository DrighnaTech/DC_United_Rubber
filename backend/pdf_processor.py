"""PDF to image conversion."""
import tempfile, os, subprocess
from pathlib import Path

def pdf_to_images(pdf_bytes, dpi=300):
    tmp = tempfile.mkdtemp(prefix="drw_")
    pdf_path = os.path.join(tmp, "input.pdf")
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)
    try:
        from pdf2image import convert_from_bytes
        imgs = convert_from_bytes(pdf_bytes, dpi=dpi, fmt="png")
        paths = []
        for i, img in enumerate(imgs):
            p = os.path.join(tmp, f"p{i+1}.png")
            img.save(p, "PNG")
            paths.append(p)
        return paths
    except Exception:
        pass
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        paths = []
        for i, pg in enumerate(doc):
            pix = pg.get_pixmap(matrix=fitz.Matrix(dpi/72, dpi/72))
            p = os.path.join(tmp, f"p{i+1}.png")
            pix.save(p)
            paths.append(p)
        doc.close()
        return paths
    except Exception:
        pass
    try:
        r = subprocess.run(
            ["pdftoppm", "-png", "-r", str(dpi), pdf_path, os.path.join(tmp, "pg")],
            capture_output=True, timeout=60
        )
        if r.returncode == 0:
            paths = sorted(str(p) for p in Path(tmp).glob("pg-*.png"))
            if paths:
                return paths
    except Exception:
        pass
    raise RuntimeError("PDF conversion failed. Install: pip install pdf2image  AND  poppler-utils")

def cleanup_images(paths):
    for p in paths:
        try:
            os.remove(p)
        except Exception:
            pass



