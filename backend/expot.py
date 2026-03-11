import json
import pandas as pd

# Load the extracted JSON file
with open("extracted_invoices_20250729_172734.json", "r", encoding="utf-8") as f:
    data = json.load(f)

rows = []

for email_entry in data:
    for invoice in email_entry.get("invoices", []):
        header = invoice.get("header", {})
        address = invoice.get("addresses", {})
        line_items = invoice.get("line_items", [])

        for item in line_items:
            row = {}
            row.update(header)
            row.update(address)

            for key, value in item.items():
                if key == "charges":
                    if isinstance(value, dict):
                        row["charges"] = ', '.join(f"{k}={v}" for k, v in value.items() if k == "Raj1")
                    else:
                        row["charges"] = None
                elif key == "discounts":
                    if isinstance(value, dict):
                        row["discounts"] = ', '.join(f"{k}={v}" for k, v in value.items() if k == "discount123")
                    else:
                        row["discounts"] = None
                elif isinstance(value, dict):
                    for subkey, subval in value.items():
                        row[f"{key}_{subkey}"] = subval
                else:
                    row[key] = value

            rows.append(row)

# Convert to DataFrame
df = pd.DataFrame(rows)

# Drop legacy keys if present
columns_to_remove = [col for col in df.columns if col.startswith("charges_") or col.startswith("discounts_")]
df.drop(columns=columns_to_remove, inplace=True, errors='ignore')

# Save to file
df.to_csv("invoices_export_corrected.csv", index=False)
df.to_excel("invoices_export_corrected.xlsx", index=False)

print("✅ Export complete — only correct keys appear in 'charges' and 'discounts'")