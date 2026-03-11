# import os
# import traceback
# import io
# import asyncio
# import base64
# import json
# import email
# import imaplib
# import tempfile
# import fitz
# from typing import List, Dict, Any, Tuple, Optional
# from PIL import Image
# from openai import AsyncOpenAI
# from datetime import datetime
# import pandas as pd
# import openpyxl

# # Path to the Excel template — used as base for multi-sheet export
# SALES_ORDER_TEMPLATE_PATH = r"C:\Users\SamirSethi\Downloads\Python_extractor_dashboard\DataCaffe_AI_Extractor_v3_React\.claude\Sales_Order_Template.xlsx"


# class EmailInvoiceExtractor:
#     def __init__(self, openai_api_key: str):
#         self.client = AsyncOpenAI(api_key=openai_api_key)
#         self.max_pages = 20
    
#     def connect_to_email(self, email_config: Dict[str, str]) -> imaplib.IMAP4_SSL:
#         try:
#             mail = imaplib.IMAP4_SSL("imap.gmail.com")
#             mail.login(email_config['email'], email_config['password'])
#             return mail
#         except imaplib.IMAP4.error as e:
#             error_msg = f"IMAP error: {str(e)}"
#             if "Invalid credentials" in str(e):
#                 error_msg = "Invalid email credentials"
#             elif "NO LOGIN failed" in str(e):
#                 error_msg = "Login failed - check if IMAP is enabled in email settings"
#             return error_msg
#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Failed to connect to email: {line_no}")
#             return str(e)
        

#     def extract_pdfs_from_email(self, email_message, save_dir="uploads") -> List[Tuple[str, bytes]]:
#         try:
#             os.makedirs(save_dir, exist_ok=True)
#             pdf_attachments = []
#             for part in email_message.walk():
#                 content_disposition = str(part.get("Content-Disposition", "")).lower()
#                 if "attachment" in content_disposition:
#                     filename = part.get_filename()
#                     if filename and filename.lower().endswith(".pdf"):
#                         payload = part.get_payload(decode=True)
#                         if payload:
#                             filepath = os.path.join(save_dir, filename)
#                             with open(filepath, 'wb') as f:
#                                 f.write(payload)
#                             pdf_attachments.append((filename, payload))
#             return pdf_attachments
#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Error fetching emails: {line_no}")
#             return str(e)
        

#     def extract_body_from_email(self, email_message) -> Dict[str, Optional[str]]:
#         """Extract HTML and plain-text body from an email message (skipping attachments)."""
#         body: Dict[str, Optional[str]] = {"html": None, "text": None}
#         try:
#             for part in email_message.walk():
#                 content_type = part.get_content_type()
#                 content_disposition = str(part.get("Content-Disposition", "")).lower()

#                 if "attachment" in content_disposition:
#                     continue

#                 payload = part.get_payload(decode=True)
#                 if not payload:
#                     continue

#                 charset = part.get_content_charset() or "utf-8"
#                 try:
#                     decoded = payload.decode(charset, errors="replace")
#                 except Exception:
#                     decoded = payload.decode("utf-8", errors="replace")

#                 if content_type == "text/html" and body["html"] is None:
#                     body["html"] = decoded
#                 elif content_type == "text/plain" and body["text"] is None:
#                     body["text"] = decoded
#         except Exception as e:
#             print(f"extract_body_from_email error: {e}")
#         return body


#     async def extract_from_email_body_with_gpt(
#         self,
#         body: Dict[str, Optional[str]],
#         email_subject: str,
#         email_sender: str,
#     ) -> Optional[Dict[str, Any]]:
#         """
#         Send email body content (HTML or plain text) to GPT-4o and extract any
#         tabular sales-order / purchase-order data it contains.
#         Returns the structured JSON dict, or None if no data found.
#         """
#         content = body.get("html") or body.get("text") or ""
#         if not content or len(content.strip()) < 50:
#             return None

#         # Limit payload size
#         if len(content) > 15000:
#             content = content[:15000]

#         prompt = f"""You are an expert data extraction system. Extract sales order or purchase order tabular data from this email body content.

# Email Subject: {email_subject}
# Email From: {email_sender}

# Email Body:
# {content}

# Look for any tables or structured data with columns such as:
# - Part No / Item Code / Product Code
# - Part Description / Description
# - Vendor / Supplier
# - Item Category / Category
# - PO NO / Purchase Order Number / Customer PO Number
# - PO RATE / Rate / Unit Price
# - Schedule Qty / Quantity / SO Qty
# - Priority
# - Delivery Date / Required Date / Dispatch Date
# - UOM / Unit of Measure
# - Remarks

# Return ONLY valid JSON in this exact format. Use null for missing fields:
# {{
#     "header": {{
#         "transactionStatus": null,
#         "salesOrderDescription": null,
#         "transactionType": null,
#         "site": null,
#         "customerCode": null,
#         "creditTerms": null,
#         "deliveryTerm": null,
#         "deliveryMode": null,
#         "soDate": null,
#         "transactionCategory": null,
#         "consigneeCode": null,
#         "salesOrderRemarks": null,
#         "salesOrderComments": null,
#         "customerPONumber": null,
#         "customerPODate": null,
#         "challanNumber": null,
#         "challanDate": null,
#         "employeeCode": null,
#         "projectCode": null,
#         "reference": null,
#         "referAlternateHSN": null,
#         "commissionGroup": null
#     }},
#     "addresses": {{
#         "addressCode": null,
#         "addressType": null
#     }},
#     "line_items": [
#         {{
#             "sourceLocation": null,
#             "itemCode": "exact part number",
#             "itemDescription": "part description",
#             "vendor": "vendor name if present",
#             "itemCategory": "item category if present",
#             "salesOrderQuantity": 0,
#             "salesUOM": null,
#             "rate": 0,
#             "packSize": null,
#             "packQuantity": null,
#             "remarks": null,
#             "requiredDate": null,
#             "dispatchDate": null,
#             "costCenterCode": null,
#             "mrpRate": null,
#             "priority": "priority value if present",
#             "taxes": {{}},
#             "charges": {{}},
#             "discounts": {{}}
#         }}
#     ]
# }}

# If no tabular or structured order data exists in the body, return: {{"no_data": true}}
# Return only valid JSON, no other text."""

#         try:
#             response = await self.client.chat.completions.create(
#                 model="gpt-4o-2024-11-20",
#                 messages=[{"role": "user", "content": prompt}],
#                 max_tokens=4000,
#                 temperature=0.1,
#             )
#             raw = response.choices[0].message.content.strip()
#             raw = raw.replace("```json", "").replace("```", "").strip()
#             result = json.loads(raw)

#             if result.get("no_data"):
#                 return None

#             # Attach token usage info
#             if hasattr(response, "usage") and response.usage:
#                 result["_usage"] = {
#                     "prompt_tokens": response.usage.prompt_tokens,
#                     "completion_tokens": response.usage.completion_tokens,
#                     "total_tokens": response.usage.total_tokens,
#                 }

#             return result

#         except json.JSONDecodeError as e:
#             print(f"Email body GPT JSON parse error: {e}")
#             return None
#         except Exception as e:
#             print(f"Email body GPT extraction failed: {e}")
#             return None


#     def get_emails_with_invoice_pdfs(self, email_config: Dict[str, str], search_criteria: str = 'UNSEEN', max_emails: Optional[int] = None) -> List[Dict[str, Any]]:
#         try:
#             mail = self.connect_to_email(email_config)
#             mail.select('inbox')
            
#             result, messages = mail.search(None, search_criteria)
#             email_ids = messages[0].split()

#             if max_emails is not None and max_emails > 0:
#                 email_ids = email_ids[-max_emails:]
#             else:
#                 email_ids = email_ids[-10:]
            
#             emails_with_pdfs = []
            
#             for email_id in email_ids:
#                 try:
#                     result, msg_data = mail.fetch(email_id, '(RFC822)')
#                     email_body = msg_data[0][1]
#                     email_message = email.message_from_bytes(email_body)
                    
#                     subject = email_message['subject'] or 'No Subject'
#                     sender = email_message['from'] or 'Unknown Sender'
#                     date = email_message['date'] or 'Unknown Date'
                    
#                     pdf_attachments = self.extract_pdfs_from_email(email_message)
#                     email_body = self.extract_body_from_email(email_message)

#                     has_body = bool(email_body.get('html') or email_body.get('text'))

#                     if pdf_attachments or has_body:
#                         emails_with_pdfs.append({
#                             'email_id': email_id.decode(),
#                             'subject': subject,
#                             'sender': sender,
#                             'date': date,
#                             'pdf_attachments': pdf_attachments or [],
#                             'email_body': email_body,
#                         })
                        
#                 except Exception as e:
#                     print(f"Error processing email {email_id}: {str(e)}")
#                     continue
            
#             mail.close()
#             mail.logout()
#             return emails_with_pdfs
#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Error fetching emails: {line_no}")
#             return str(e)
        

#     def pdf_bytes_to_images(self, pdf_data: bytes) -> List[Image.Image]:
#         try:
#             with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
#                 temp_file.write(pdf_data)
#                 temp_file_path = temp_file.name
            
#             try:
#                 doc = fitz.open(temp_file_path)
#                 images = []
#                 num_pages = min(len(doc), self.max_pages)
                
#                 for page_num in range(num_pages):
#                     page = doc.load_page(page_num)
#                     pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
#                     img_data = pix.tobytes("png")
#                     img = Image.open(io.BytesIO(img_data))
#                     images.append(img)
                    
#                 doc.close()
#                 return images
#             finally:
#                 os.unlink(temp_file_path)
#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Error converting PDF to images: {line_no}")
#             return str(e)
        

#     def image_to_base64(self, image: Image.Image) -> str:
#         try:
#             buffer = io.BytesIO()
#             image.save(buffer, format='PNG')
#             img_str = base64.b64encode(buffer.getvalue()).decode()
#             return img_str
#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Exception occurred on line {line_no}")
#             return str(e)
        

#     def get_extraction_prompt(self, page_number: int, is_first_page: bool) -> str:
#         if is_first_page:
#             return """
#         You are an expert invoice data extraction system. Extract information from this invoice/purchase order document and return ONLY a valid JSON response.

# ### CRITICAL TABLE EXTRACTION RULES:
# 1. READ EACH TABLE ROW INDIVIDUALLY - Do not combine, merge, or calculate totals
# 2. EXTRACT EXACT VALUES - Use the precise numbers shown in each cell
# 3. ONE ROW = ONE LINE ITEM - Even if item codes repeat across rows
# 4. PRESERVE ORIGINAL QUANTITIES - Never add, subtract, or modify quantity values

# ### STEP-BY-STEP TABLE READING:
# 1. Identify each row in the line items table
# 2. For each row, extract:
#    - Line number (if shown)
#    - Item code (exact text)
#    - Description (exact text)
#    - Quantity (exact number from that specific row)
#    - Unit price (exact number from that specific row)
#    - Extended price (exact number from that specific row)
#    - Delivery date (exact date from that specific row)

# ### EXAMPLE CORRECT EXTRACTION:
# If table shows:
# Line | Item Code | Description | Qty    | Unit Price | Extended Price | Date
# 1    | CL28P50244| BUSHING AM  | 16,000 | 1.24       | 19,840.00     | 07-02-2025
# 2    | 41045     | BUSHING HARD| 3,600  | 0.76       | 2,736.00      | 20-01-2025
# 2    | 41045     | BUSHING HARD| 2,400  | 0.76       | 1,824.00      | 03-02-2025
# 2    | 41045     | BUSHING HARD| 2,800  | 0.76       | 2,128.00      | 03-03-2025
# 2    | 41045     | BUSHING HARD| 5,600  | 0.76       | 4,256.00      | 07-04-2025
# 3    | 46595     | BUSHING     | 2,000  | 0.76       | 1,520.00      | 03-02-2025

# Extract as 6 separate line items with quantities: 16000, 3600, 2400, 2800, 5600, 2000

# ### WHAT NOT TO DO:
# ❌ Don't combine: 3600 + 2400 + 2800 + 5600 = 14400
# ❌ Don't create phantom quantities like 5800 or 7600
# ❌ Don't skip rows
# ❌ Don't merge rows with same item code

# ### Required extraction:
# 1. Header information (invoice details, vendor info, customer info, dates, totals)
# 2. Address information visible on this page
# 3. Line items visible on this page — ensure no line item is skipped
# 4. Other fields like transactionStatus, customerPONumber, PO Date, creditTerms, delivery info, etc.
# 5. Address Code (e.g., Postal Code / PIN Code)
# 6. Address Type (e.g., Residential, Commercial, Industrial — based on business name, estate, or road keywords)
# 7. Entity Type (e.g., Vendor, Customer, Shipper, Consignee — if identifiable from context)

# ### JSON Format:
# {
#     "header": {
#         "transactionStatus": "string",
#         "salesOrderDescription": "string",
#         "transactionType": "string",
#         "site": "string",
#         "siteAddress": "string",
#         "customerCode": "string",
#         "creditTerms": "string",
#         "deliveryTerm": "string",
#         "deliveryMode": "string",
#         "soDate": "YYYY-MM-DD or original format",
#         "transactionCategory": "string",
#         "consigneeCode": "string",
#         "salesOrderRemarks": "string",
#         "salesOrderComments": "string",
#         "customerPONumber": "string",
#         "customerPODate": "YYYY-MM-DD or original format",
#         "challanNumber": "string",
#         "challanDate": "YYYY-MM-DD or original format",
#         "employeeCode": "string",
#         "projectCode": "string",
#         "reference": "string",
#         "referAlternateHSN": "string",
#         "commissionGroup": "string"
#     },
#     "addresses": {
#         "addressCode": "string",
#         "addressType": "string"
#     },
#     "line_items": [
#         {
#         "sourceLocation": "string",
#         "itemCode": "string",
#         "itemDescription": "string",
#         "salesOrderQuantity": "number",
#         "salesUOM": "string",
#         "rate": "number",
#         "packSize": "string",
#         "packQuantity": "string",
#         "remarks": "string",
#         "requiredDate": "YYYY-MM-DD or original format",
#         "dispatchDate": "YYYY-MM-DD or original format",
#         "costCenterCode": "string",
#         "mrpRate": "number",
#         "taxes": {
#             "SGST_9_OUTPUT_INDIA": "number",
#             "CGST_9_On_Sales": "number"
#         },
#         "charges": {
#             "Raj1": "string"
#         },
#         "discounts": {
#             "discount123": "number"
#         }
#         }
#     ]
#     }

# ### VERIFICATION CHECKLIST:
# Before submitting JSON, verify:
# 1. ✓ Each table row is a separate line item
# 2. ✓ Quantities match exactly what's in the document
# 3. ✓ No phantom numbers that don't exist in original
# 4. ✓ All rows are included, none skipped
# 5. ✓ Item codes can repeat across multiple line items

# ### TABLE COLUMN MAPPING:
# - Line/Linia = Line number
# - Kod Materialu = Item code
# - Opis = Item description
# - JM = Unit of measure  
# - Ilosc = Quantity (CRITICAL: Extract exact value)
# - Cena Jednostkowa = Unit price
# - Wartosc = Extended price
# - Data Dostawy = Delivery date

# Only return JSON — no other explanations. Use `null` for missing fields.
#     """

#         else:
#             return f"""
# You are an expert invoice data extraction system. Extract information from this invoice image (PAGE {page_number}) and return ONLY a valid JSON response.

# For CONTINUATION PAGES, extract only:
# - Line items visible on this page
# - Do NOT extract header information (already captured from first page)

# Return JSON in this exact format:
# {{
#   "line_items": [
#     {{
#       "sourceLocation": "string",
#       "itemCode": "string",
#       "itemDescription": "string",
#       "salesOrderQuantity": "number",
#       "salesUOM": "string",
#       "rate": "number",
#       "packSize": "number or string",
#       "packQuantity": "number or string",
#       "remarks": "string",
#       "requiredDate": "YYYY-MM-DD or original format",
#       "dispatchDate": "YYYY-MM-DD or original format",
#       "costCenterCode": "string",
#       "mrpRate": "number",
#       "taxes": {{
#           "SGST_9_OUTPUT_INDIA": "number",
#           "CGST_9_On_Sales": "number"
#       }},
#       "charges": {{
#           "Raj1": "string"
#       }},
#       "discounts": {{
#           "discount123": "number"
#       }}
#     }}
#   ]
# }}

# Extract only line items visible on this page. Use null for missing fields. Return only the JSON, no other text.
# """
        

#     async def extract_from_image(self, image: Image.Image, page_number: int, is_first_page: bool) -> Dict[str, Any]:
#         try:
#             base64_image = self.image_to_base64(image)
#             prompt = self.get_extraction_prompt(page_number, is_first_page)
            
#             response = await self.client.chat.completions.create(
#                 model="gpt-4o-2024-11-20",
#                 messages=[
#                     {
#                         "role": "user",
#                         "content": [
#                             {"type": "text", "text": prompt},
#                             {
#                                 "type": "image_url",
#                                 "image_url": {
#                                     "url": f"data:image/png;base64,{base64_image}",
#                                     "detail": "high"
#                                 }
#                             }
#                         ]
#                     }
#                 ],
#                 max_tokens=4000,
#                 temperature=0.1,
#             )
            
#             content = response.choices[0].message.content.strip()
            
#             if not content:
#                 return {"error": "Empty response from API", "page": page_number}
                
#             content = content.replace('```json', '').replace('```', '').strip()
            
#             try:
#                 return json.loads(content)
#             except json.JSONDecodeError as e:
#                 print(f"Raw API response that failed to parse: {content[:200]}...") 
#                 return {
#                     "error": f"JSON parsing failed: {str(e)}",
#                     "page": page_number,
#                     "raw_response": content[:1000]  
#                 }
                
#         except Exception as e:
#             return {
#                 "error": str(e),
#                 "page": page_number,
#                 "traceback": traceback.format_exc()
#             }
        

#     async def process_pdf_data(self, pdf_data: bytes, filename: str) -> Dict[str, Any]:
#         try:
#             images = self.pdf_bytes_to_images(pdf_data)
            
#             if not images:
#                 return {"error": "No images extracted from PDF", "filename": filename}
            
#             tasks = []
#             for i, image in enumerate(images):
#                 page_number = i + 1
#                 is_first_page = (i == 0)
#                 task = self.extract_from_image(image, page_number, is_first_page)
#                 tasks.append(task)
            
#             results = await asyncio.gather(*tasks, return_exceptions=True)
            
#             combined_data = {
#                 "filename": filename,
#                 "header": None,
#                 "addresses": None,
#                 "line_items": [],
#                 "processing_summary": {
#                     "total_pages_processed": len(images),
#                     "successful_pages": 0,
#                     "failed_pages": 0,
#                     "errors": []
#                 }
#             }
            
#             for i, result in enumerate(results):
#                 page_number = i + 1
                
#                 if isinstance(result, Exception):
#                     combined_data["processing_summary"]["failed_pages"] += 1
#                     combined_data["processing_summary"]["errors"].append({
#                         "page": page_number,
#                         "error": str(result)
#                     })
#                     continue
                
#                 if "error" in result:
#                     combined_data["processing_summary"]["failed_pages"] += 1
#                     combined_data["processing_summary"]["errors"].append({
#                         "page": page_number,
#                         "error": result["error"]
#                     })
#                     continue
                
#                 combined_data["processing_summary"]["successful_pages"] += 1
                
#                 if i == 0 and "header" in result:
#                     combined_data["header"] = result["header"]
                
#                 if "addresses" in result:
#                     combined_data["addresses"] = result["addresses"]

#                 if "line_items" in result and isinstance(result["line_items"], list):
#                     combined_data["line_items"].extend(result["line_items"])
            
#             return combined_data
            
#         except Exception as e:
#             return {"error": f"Processing failed: {str(e)}", "filename": filename}
        

#     async def process_emails_with_invoices(self, email_config: Dict[str, str], search_criteria: str = 'UNSEEN', max_emails: Optional[int] = None) -> List[Dict[str, Any]]:
#         try:
#             emails_with_pdfs = self.get_emails_with_invoice_pdfs(email_config, search_criteria, max_emails)
            
#             if not emails_with_pdfs:
#                 return {"message": "No emails with PDF attachments found"}
            
#             all_results = []
            
#             for email_data in emails_with_pdfs:
#                 email_result = {
#                     "email_metadata": {
#                         "email_id": email_data['email_id'],
#                         "subject": email_data['subject'],
#                         "sender": email_data['sender'],
#                         "date": email_data['date'],
#                         "processed_at": datetime.now().isoformat()
#                     },
#                     "invoices": [],
#                     "saved_files": []
#                 }

#                 for filename, pdf_data in email_data.get('pdf_attachments', []):
#                     invoice_data = await self.process_pdf_data(pdf_data, filename)
#                     email_result["invoices"].append(invoice_data)

#                     json_filename = os.path.splitext(filename)[0] + ".json"
#                     json_file_path = os.path.join("json_data", json_filename)

#                     try:
#                         with open(json_file_path, "w", encoding="utf-8") as f:
#                             json.dump(invoice_data, f, indent=2, ensure_ascii=False)
#                     except Exception as e:
#                         print(f"Error saving JSON file for {filename}: {e}")

#                     email_result["saved_files"].append({
#                         "filename": filename,
#                         "path": os.path.join("uploads", filename),
#                         "status": "saved" if os.path.exists(os.path.join("uploads", filename)) else "failed"
#                     })

#                 # Also extract tabular data from the email body itself
#                 if email_data.get('email_body'):
#                     body_data = await self.extract_from_email_body_with_gpt(
#                         email_data['email_body'],
#                         email_data['subject'],
#                         email_data['sender']
#                     )
#                     if body_data:
#                         body_filename = f"email_body_{email_data['email_id']}"
#                         body_data['filename'] = body_filename
#                         body_data['source'] = 'email_body'
#                         email_result["invoices"].append(body_data)

#                         json_file_path = os.path.join("json_data", f"{body_filename}.json")
#                         try:
#                             os.makedirs("json_data", exist_ok=True)
#                             with open(json_file_path, "w", encoding="utf-8") as f:
#                                 json.dump(body_data, f, indent=2, ensure_ascii=False)
#                         except Exception as e:
#                             print(f"Error saving body JSON: {e}")

#                 all_results.append(email_result)
#             self.convert_all_json_to_csv_and_xlsx(
#                 json_dir="json_data",
#                 csv_output_path="all_invoices.csv",
#                 xlsx_output_path="all_invoices.xlsx"
#             )
#             return all_results
#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Email processing failed at line {line_no}")
#             return str(e)
    

#     # ── Column definitions matching the Sales Order template ────────────────────

#     # Sheet: SalesOrder
#     SO_SHEET_COLS = [
#         "Sales Order Ref. Number", "Site", "Customer Code", "SO Type",
#         "Credit Terms", "Delivery Term", "Delivery Mode", "SO Date",
#         "Transaction Category", "Customer PO Number", "Customer PO Date",
#         "Challan Number", "Challan Date", "Consignee Code", "Employee Code",
#         "Project Cost Code", "SO Description", "Reference", "Remarks",
#         "Comments", "Status", "Refer Alternate HSN", "Commission Group",
#     ]

#     SO_SHEET_MAP = {
#         "Sales Order Ref. Number": "customerPONumber",
#         "Site": "site",
#         "Customer Code": "customerCode",
#         "SO Type": "transactionType",
#         "Credit Terms": "creditTerms",
#         "Delivery Term": "deliveryTerm",
#         "Delivery Mode": "deliveryMode",
#         "SO Date": "soDate",
#         "Transaction Category": "transactionCategory",
#         "Customer PO Number": "customerPONumber",
#         "Customer PO Date": "customerPODate",
#         "Challan Number": "challanNumber",
#         "Challan Date": "challanDate",
#         "Consignee Code": "consigneeCode",
#         "Employee Code": "employeeCode",
#         "Project Cost Code": "projectCode",
#         "SO Description": "salesOrderDescription",
#         "Reference": "reference",
#         "Remarks": "salesOrderRemarks",
#         "Comments": "salesOrderComments",
#         "Status": "transactionStatus",
#         "Refer Alternate HSN": "referAlternateHSN",
#         "Commission Group": "commissionGroup",
#     }

#     # Sheet: Itemdetail
#     ITEM_SHEET_COLS = [
#         "Sales Order Ref. Number", "Source Location", "Item Code",
#         "SO Qty", "Sales UOM", "Rate", "Pack Size",
#         "Pack Qty", "Required Date", "Remarks", "Cost Center Code",
#         "MRP Rate", "Dispatch Date",
#     ]

#     ITEM_SHEET_MAP = {
#         "Source Location": "sourceLocation",
#         "Item Code": "itemCode",
#         "SO Qty": "salesOrderQuantity",
#         "Sales UOM": "salesUOM",
#         "Rate": "rate",
#         "Pack Size": "packSize",
#         "Pack Qty": "packQuantity",
#         "Required Date": "requiredDate",
#         "Remarks": "remarks",
#         "Cost Center Code": "costCenterCode",
#         "MRP Rate": "mrpRate",
#         "Dispatch Date": "dispatchDate",
#     }

#     # Sheet: ServiceDetail
#     SERVICE_SHEET_COLS = [
#         "Sales Order Ref. Number", "Service Code", "Amount",
#         "Service Date", "Quantity", "Rate", "Service UOM", "Remarks",
#     ]

#     # Sheet: Address
#     ADDR_SHEET_COLS = [
#         "Sales Order Ref. Number", "Address Code", "Address Type",
#     ]

#     # Sheet: Version Details
#     VERSION_SHEET_COLS = [
#         "Solution Name", "Version Number",
#     ]

#     # Sheet: Tax (Sales Order Tax Detail)
#     TAX_SHEET_COLS = [
#         "Sales Order Ref. Number", "Tax Code / Tax Type", "Tax Amount / Percentage",
#     ]

#     def _find_header_row_and_col_map(self, ws, expected_cols: List[str]) -> Tuple[int, Dict[str, int]]:
#         """
#         Scan the worksheet to find the row containing the column headers.
#         Returns (header_row_number, {col_name: col_index}) where col_index is 1-based.
#         Falls back to row 1 if not found.
#         """
#         for row_idx in range(1, min(10, ws.max_row + 1)):
#             row_values = [str(ws.cell(row=row_idx, column=c).value or '').strip() for c in range(1, ws.max_column + 1)]
#             matches = sum(1 for col in expected_cols if col in row_values)
#             if matches >= max(1, len(expected_cols) // 3):
#                 col_map = {}
#                 for col_name in expected_cols:
#                     if col_name in row_values:
#                         col_map[col_name] = row_values.index(col_name) + 1
#                 return row_idx, col_map
#         return 0, {}  # not found

#     def _write_sheet_rows(self, ws, col_map: Dict[str, int], data_start_row: int, rows: List[Dict]):
#         """Write data rows into a worksheet using the column map."""
#         for row_offset, row_data in enumerate(rows):
#             row_num = data_start_row + row_offset
#             for col_name, col_idx in col_map.items():
#                 ws.cell(row=row_num, column=col_idx, value=row_data.get(col_name))

#     def _make_fresh_sheet(self, wb: openpyxl.Workbook, sheet_name: str, cols: List[str]) -> openpyxl.worksheet.worksheet.Worksheet:
#         """Create (or clear) a sheet and write column headers at row 1."""
#         if sheet_name in wb.sheetnames:
#             ws = wb[sheet_name]
#         else:
#             ws = wb.create_sheet(sheet_name)
#         for col_idx, col_name in enumerate(cols, 1):
#             ws.cell(row=1, column=col_idx, value=col_name)
#         return ws

#     def convert_all_json_to_csv_and_xlsx(self, json_dir: str = "json_data", csv_output_path: str = "all_invoices.csv", xlsx_output_path: str = "all_invoices.xlsx"):
#         try:
#             # ── 1. Collect all invoice data from JSON files ──────────────────
#             all_invoice_data = []  # list of (header_dict, addresses_list, line_items_list)

#             if not os.path.exists(json_dir):
#                 print(f"JSON directory not found: {json_dir}")
#                 return

#             for json_file in sorted(os.listdir(json_dir)):
#                 if not json_file.endswith(".json"):
#                     continue
#                 json_path = os.path.join(json_dir, json_file)
#                 try:
#                     with open(json_path, "r", encoding="utf-8") as f:
#                         data = json.load(f)

#                     # Support both flat invoice objects and wrapped email objects
#                     invoices = data.get("invoices", [data])

#                     for invoice in invoices:
#                         header = invoice.get("header") or {}
#                         addresses = invoice.get("addresses") or {}
#                         line_items = invoice.get("line_items") or []
#                         all_invoice_data.append((header, addresses, line_items))

#                 except Exception as e:
#                     print(f"Error reading {json_file}: {e}")

#             # ── 2. Build row lists for each sheet ───────────────────────────
#             so_rows = []        # one row per invoice header
#             item_rows = []      # one row per line item
#             service_rows = []   # one row per service item (empty unless service data exists)
#             addr_rows = []      # one row per address
#             tax_rows = []       # one row per tax entry

#             for header, addresses, line_items in all_invoice_data:
#                 so_ref = header.get("customerPONumber") or ""

#                 # SalesOrder sheet row
#                 so_row = {"Sales Order Ref. Number": so_ref}
#                 for col_name, json_key in self.SO_SHEET_MAP.items():
#                     so_row[col_name] = header.get(json_key)
#                 so_row["Sales Order Ref. Number"] = so_ref  # ensure consistent ref
#                 so_rows.append(so_row)

#                 # Itemdetail sheet rows
#                 for item in line_items:
#                     item_row = {"Sales Order Ref. Number": so_ref}
#                     for col_name, json_key in self.ITEM_SHEET_MAP.items():
#                         item_row[col_name] = item.get(json_key)
#                     item_rows.append(item_row)

#                     # Tax sheet — one row per non-null tax entry
#                     taxes = item.get("taxes") or {}
#                     if isinstance(taxes, dict):
#                         for tax_key, tax_val in taxes.items():
#                             if tax_val is not None:
#                                 tax_rows.append({
#                                     "Sales Order Ref. Number": so_ref,
#                                     "Tax Code / Tax Type": tax_key,
#                                     "Tax Amount / Percentage": tax_val,
#                                 })

#                 # Address sheet
#                 if isinstance(addresses, dict) and addresses:
#                     addr_rows.append({
#                         "Sales Order Ref. Number": so_ref,
#                         "Address Code": addresses.get("addressCode"),
#                         "Address Type": addresses.get("addressType"),
#                     })
#                 elif isinstance(addresses, list):
#                     for addr in addresses:
#                         addr_rows.append({
#                             "Sales Order Ref. Number": so_ref,
#                             "Address Code": addr.get("addressCode"),
#                             "Address Type": addr.get("addressType"),
#                         })

#             # ── 3. Also export flat CSV (for backward compatibility) ─────────
#             try:
#                 if item_rows:
#                     pd.DataFrame(item_rows).to_csv(csv_output_path, index=False)
#                 elif so_rows:
#                     pd.DataFrame(so_rows).to_csv(csv_output_path, index=False)
#             except Exception as e:
#                 print(f"CSV export warning: {e}")

#             # ── 4. Build the multi-sheet Excel ──────────────────────────────
#             use_template = os.path.exists(SALES_ORDER_TEMPLATE_PATH)

#             if use_template:
#                 wb = openpyxl.load_workbook(SALES_ORDER_TEMPLATE_PATH)
#                 # Remove reference/metadata sheets that should not appear in output
#                 for sheet_to_remove in ["Sheet1", "Sheet2", "Sheet3", "Sheet"]:
#                     if sheet_to_remove in wb.sheetnames:
#                         del wb[sheet_to_remove]
#             else:
#                 wb = openpyxl.Workbook()
#                 # Remove default sheet
#                 if "Sheet" in wb.sheetnames:
#                     del wb["Sheet"]

#             sheet_configs = [
#                 ("SalesOrder",      self.SO_SHEET_COLS,      so_rows),
#                 ("Itemdetail",      self.ITEM_SHEET_COLS,    item_rows),
#                 ("ServiceDetail",   self.SERVICE_SHEET_COLS, service_rows),
#                 ("Address",         self.ADDR_SHEET_COLS,    addr_rows),
#                 ("Version Details", self.VERSION_SHEET_COLS, []),
#                 ("Tax",             self.TAX_SHEET_COLS,     tax_rows),
#             ]

#             for sheet_name, cols, rows in sheet_configs:
#                 if use_template and sheet_name in wb.sheetnames:
#                     ws = wb[sheet_name]
#                     header_row, col_map = self._find_header_row_and_col_map(ws, cols)
#                     if col_map:
#                         data_start_row = header_row + 1
#                         # Clear ALL existing data rows (removes sample data from template)
#                         if ws.max_row >= data_start_row:
#                             for r in range(data_start_row, ws.max_row + 1):
#                                 for c in range(1, ws.max_column + 1):
#                                     ws.cell(row=r, column=c, value=None)
#                         self._write_sheet_rows(ws, col_map, data_start_row, rows)
#                     else:
#                         # Headers not matched — write fresh from row 1
#                         ws = self._make_fresh_sheet(wb, sheet_name, cols)
#                         col_map = {col: idx + 1 for idx, col in enumerate(cols)}
#                         self._write_sheet_rows(ws, col_map, 2, rows)
#                 else:
#                     ws = self._make_fresh_sheet(wb, sheet_name, cols)
#                     col_map = {col: idx + 1 for idx, col in enumerate(cols)}
#                     self._write_sheet_rows(ws, col_map, 2, rows)

#             wb.save(xlsx_output_path)
#             print(f"✅ Multi-sheet Excel saved to: {xlsx_output_path}")
#             if not use_template:
#                 print("   (template not found — created fresh workbook)")

#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Combined export failed at line {line_no}")
#             return str(e)


#     async def process_image_data(self, image_data: bytes, filename: str) -> Dict[str, Any]:
#         """
#         Process a single image file (PNG/JPG/TIFF).
#         Uses the SAME extract_from_image() and get_extraction_prompt() as PDF flow.
#         Treated as a single-page document (is_first_page=True).
#         """
#         try:
#             print(f"Processing image file: {filename}")
#             image = Image.open(io.BytesIO(image_data))

#             if image.mode in ('RGBA', 'P', 'LA'):
#                 image = image.convert('RGB')

#             result = await self.extract_from_image(image, page_number=1, is_first_page=True)

#             combined_data = {
#                 "filename": filename,
#                 "header": None,
#                 "addresses": None,
#                 "line_items": [],
#                 "processing_summary": {
#                     "total_pages_processed": 1,
#                     "successful_pages": 0,
#                     "failed_pages": 0,
#                     "errors": []
#                 }
#             }

#             if isinstance(result, Exception) or "error" in result:
#                 combined_data["processing_summary"]["failed_pages"] = 1
#                 error_msg = str(result) if isinstance(result, Exception) else result["error"]
#                 combined_data["processing_summary"]["errors"].append({
#                     "page": 1,
#                     "error": error_msg
#                 })
#             else:
#                 combined_data["processing_summary"]["successful_pages"] = 1
#                 if "header" in result:
#                     combined_data["header"] = result["header"]
#                 if "addresses" in result:
#                     combined_data["addresses"] = result["addresses"]
#                 if "line_items" in result and isinstance(result["line_items"], list):
#                     combined_data["line_items"].extend(result["line_items"])

#             print(f"Image processing complete for {filename}. Extracted {len(combined_data['line_items'])} line items.")
#             return combined_data

#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Image processing failed at line {line_no}")
#             return {"error": f"Image processing failed: {str(e)}", "filename": filename}


#     async def process_uploaded_files(self, files_data: List[Tuple[str, bytes]]) -> List[Dict[str, Any]]:
#         """
#         Process directly uploaded files. Same extraction pipeline as email flow.
#         PDF  -> self.process_pdf_data()    (identical to email attachment processing)
#         Image -> self.process_image_data() (same extract_from_image + get_extraction_prompt)
#         """
#         try:
#             if not files_data:
#                 return [{"error": "No files provided"}]

#             print(f"Processing {len(files_data)} uploaded file(s)")

#             all_results = []

#             for filename, file_bytes in files_data:
#                 try:
#                     # Save uploaded file to uploads/
#                     upload_dir = os.path.join(os.getcwd(), "uploads")
#                     os.makedirs(upload_dir, exist_ok=True)
#                     filepath = os.path.join(upload_dir, filename)
#                     with open(filepath, 'wb') as f:
#                         f.write(file_bytes)
#                     print(f"Saved: {filepath}")

#                     ext = os.path.splitext(filename)[1].lower()

#                     if ext == '.pdf':
#                         invoice_data = await self.process_pdf_data(file_bytes, filename)
#                     elif ext in ('.png', '.jpg', '.jpeg', '.tiff', '.tif'):
#                         invoice_data = await self.process_image_data(file_bytes, filename)
#                     else:
#                         invoice_data = {"error": f"Unsupported file type: {ext}", "filename": filename}

#                     all_results.append(invoice_data)

#                     # Save extracted JSON to json_data/
#                     json_dir = os.path.join(os.getcwd(), "json_data")
#                     os.makedirs(json_dir, exist_ok=True)
#                     json_filename = os.path.splitext(filename)[0] + ".json"
#                     json_file_path = os.path.join(json_dir, json_filename)

#                     try:
#                         with open(json_file_path, "w", encoding="utf-8") as f:
#                             json.dump(invoice_data, f, indent=2, ensure_ascii=False)
#                         print(f"JSON saved: {json_file_path}")
#                     except Exception as e:
#                         print(f"Error saving JSON file for {filename}: {e}")

#                 except Exception as e:
#                     print(f"Error processing file {filename}: {str(e)}")
#                     all_results.append({"error": str(e), "filename": filename})
#                     continue

#             # Export combined CSV/XLSX (same method as email flow)
#             self.convert_all_json_to_csv_and_xlsx(
#                 json_dir="json_data",
#                 csv_output_path="all_invoices.csv",
#                 xlsx_output_path="all_invoices.xlsx"
#             )

#             return all_results

#         except Exception as e:
#             traceback_str = traceback.format_exc()
#             print(traceback_str)
#             line_no = traceback.extract_tb(e.__traceback__)[-1][1]
#             print(f"Upload processing failed at line {line_no}")
#             return [{"error": str(e)}]
#----------------------------------------------

import os
import traceback
import io
import asyncio
import base64
import json
import email
import imaplib
import tempfile
import fitz
from typing import List, Dict, Any, Tuple, Optional
from PIL import Image
from openai import AsyncOpenAI
from datetime import datetime
import pandas as pd


class EmailInvoiceExtractor:
    def __init__(self, openai_api_key: str):
        self.client = AsyncOpenAI(api_key=openai_api_key)
        self.max_pages = 20
    
    def connect_to_email(self, email_config: Dict[str, str]) -> imaplib.IMAP4_SSL:
        try:
            mail = imaplib.IMAP4_SSL("imap.gmail.com")
            mail.login(email_config['email'], email_config['password'])
            return mail
        except imaplib.IMAP4.error as e:
            error_msg = f"IMAP error: {str(e)}"
            if "Invalid credentials" in str(e):
                error_msg = "Invalid email credentials"
            elif "NO LOGIN failed" in str(e):
                error_msg = "Login failed - check if IMAP is enabled in email settings"
            return error_msg
        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Failed to connect to email: {line_no}")
            return str(e)
        

    def extract_pdfs_from_email(self, email_message, save_dir="uploads") -> List[Tuple[str, bytes]]:
        try:
            os.makedirs(save_dir, exist_ok=True)
            pdf_attachments = []
            for part in email_message.walk():
                content_disposition = str(part.get("Content-Disposition", "")).lower()
                if "attachment" in content_disposition:
                    filename = part.get_filename()
                    if filename and filename.lower().endswith(".pdf"):
                        payload = part.get_payload(decode=True)
                        if payload:
                            filepath = os.path.join(save_dir, filename)
                            with open(filepath, 'wb') as f:
                                f.write(payload)
                            pdf_attachments.append((filename, payload))
            return pdf_attachments
        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Error fetching emails: {line_no}")
            return str(e)
        

    def get_emails_with_invoice_pdfs(self, email_config: Dict[str, str], search_criteria: str = 'UNSEEN', max_emails: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            mail = self.connect_to_email(email_config)
            mail.select('inbox')
            
            result, messages = mail.search(None, search_criteria)
            email_ids = messages[0].split()

            if max_emails is not None and max_emails > 0:
                email_ids = email_ids[-max_emails:]
            else:
                email_ids = email_ids[-10:]
            
            emails_with_pdfs = []
            
            for email_id in email_ids:
                try:
                    result, msg_data = mail.fetch(email_id, '(RFC822)')
                    email_body = msg_data[0][1]
                    email_message = email.message_from_bytes(email_body)
                    
                    subject = email_message['subject'] or 'No Subject'
                    sender = email_message['from'] or 'Unknown Sender'
                    date = email_message['date'] or 'Unknown Date'
                    
                    pdf_attachments = self.extract_pdfs_from_email(email_message)
                    
                    if pdf_attachments:
                        emails_with_pdfs.append({
                            'email_id': email_id.decode(),
                            'subject': subject,
                            'sender': sender,
                            'date': date,
                            'pdf_attachments': pdf_attachments
                        })
                        
                except Exception as e:
                    print(f"Error processing email {email_id}: {str(e)}")
                    continue
            
            mail.close()
            mail.logout()
            return emails_with_pdfs
        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Error fetching emails: {line_no}")
            return str(e)
        

    def pdf_bytes_to_images(self, pdf_data: bytes) -> List[Image.Image]:
        try:
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_file:
                temp_file.write(pdf_data)
                temp_file_path = temp_file.name
            
            try:
                doc = fitz.open(temp_file_path)
                images = []
                num_pages = min(len(doc), self.max_pages)
                
                for page_num in range(num_pages):
                    page = doc.load_page(page_num)
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img_data = pix.tobytes("png")
                    img = Image.open(io.BytesIO(img_data))
                    images.append(img)
                    
                doc.close()
                return images
            finally:
                os.unlink(temp_file_path)
        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Error converting PDF to images: {line_no}")
            return str(e)
        

    def image_to_base64(self, image: Image.Image) -> str:
        try:
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            img_str = base64.b64encode(buffer.getvalue()).decode()
            return img_str
        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Exception occurred on line {line_no}")
            return str(e)
        

    def get_extraction_prompt(self, page_number: int, is_first_page: bool) -> str:
        if is_first_page:
            return """
        You are an expert invoice data extraction system. Extract information from this invoice/purchase order document and return ONLY a valid JSON response.

### CRITICAL TABLE EXTRACTION RULES:
1. READ EACH TABLE ROW INDIVIDUALLY - Do not combine, merge, or calculate totals
2. EXTRACT EXACT VALUES - Use the precise numbers shown in each cell
3. ONE ROW = ONE LINE ITEM - Even if item codes repeat across rows
4. PRESERVE ORIGINAL QUANTITIES - Never add, subtract, or modify quantity values

### STEP-BY-STEP TABLE READING:
1. Identify each row in the line items table
2. For each row, extract:
   - Line number (if shown)
   - Item code (exact text)
   - Description (exact text)
   - Quantity (exact number from that specific row)
   - Unit price (exact number from that specific row)
   - Extended price (exact number from that specific row)
   - Delivery date (exact date from that specific row)

### EXAMPLE CORRECT EXTRACTION:
If table shows:
Line | Item Code | Description | Qty    | Unit Price | Extended Price | Date
1    | CL28P50244| BUSHING AM  | 16,000 | 1.24       | 19,840.00     | 07-02-2025
2    | 41045     | BUSHING HARD| 3,600  | 0.76       | 2,736.00      | 20-01-2025
2    | 41045     | BUSHING HARD| 2,400  | 0.76       | 1,824.00      | 03-02-2025
2    | 41045     | BUSHING HARD| 2,800  | 0.76       | 2,128.00      | 03-03-2025
2    | 41045     | BUSHING HARD| 5,600  | 0.76       | 4,256.00      | 07-04-2025
3    | 46595     | BUSHING     | 2,000  | 0.76       | 1,520.00      | 03-02-2025

Extract as 6 separate line items with quantities: 16000, 3600, 2400, 2800, 5600, 2000

### WHAT NOT TO DO:
❌ Don't combine: 3600 + 2400 + 2800 + 5600 = 14400
❌ Don't create phantom quantities like 5800 or 7600
❌ Don't skip rows
❌ Don't merge rows with same item code

### Required extraction:
1. Header information (invoice details, vendor info, customer info, dates, totals)
2. Address information visible on this page
3. Line items visible on this page — ensure no line item is skipped
4. Other fields like transactionStatus, customerPONumber, PO Date, creditTerms, delivery info, etc.
5. Address Code (e.g., Postal Code / PIN Code)
6. Address Type (e.g., Residential, Commercial, Industrial — based on business name, estate, or road keywords)
7. Entity Type (e.g., Vendor, Customer, Shipper, Consignee — if identifiable from context)

### JSON Format:
{
    "header": {
        "transactionStatus": "string",
        "salesOrderDescription": "string",
        "transactionType": "string",
        "site": "string",
        "siteAddress": "string",
        "customerCode": "string",
        "creditTerms": "string",
        "deliveryTerm": "string",
        "deliveryMode": "string",
        "transactionCategory": "string",
        "consigneeCode": "string",
        "salesOrderRemarks": "string",
        "salesOrderComments": "string",
        "customerPONumber": "string",
        "customerPODate": "YYYY-MM-DD or original format",
        "projectCode": "string"
    },
    "addresses": {
        "addressCode": "string",
        "addressType": "string"
    },
    "line_items": [
        {
        "sourceLocation": "string",
        "itemCode": "string",
        "salesOrderQuantity": "number",
        "salesUOM": "string",
        "rate": "number",
        "packSize": "string",
        "packQuantity": "string",
        "remarks": "string",
        "dispatchDate": "YYYY-MM-DD or original format",
        "taxes": {
            "SGST_9_OUTPUT_INDIA": "number",
            "CGST_9_On_Sales": "number"
        },
        "charges": {
            "Raj1": "string"
        },
        "discounts": {
            "discount123": "number"
        }
        }
    ]
    }

### VERIFICATION CHECKLIST:
Before submitting JSON, verify:
1. ✓ Each table row is a separate line item
2. ✓ Quantities match exactly what's in the document
3. ✓ No phantom numbers that don't exist in original
4. ✓ All rows are included, none skipped
5. ✓ Item codes can repeat across multiple line items

### TABLE COLUMN MAPPING:
- Line/Linia = Line number
- Kod Materialu = Item code
- Opis = Item description
- JM = Unit of measure  
- Ilosc = Quantity (CRITICAL: Extract exact value)
- Cena Jednostkowa = Unit price
- Wartosc = Extended price
- Data Dostawy = Delivery date

Only return JSON — no other explanations. Use `null` for missing fields.
    """

        else:
            return f"""
You are an expert invoice data extraction system. Extract information from this invoice image (PAGE {page_number}) and return ONLY a valid JSON response.

For CONTINUATION PAGES, extract only:
- Line items visible on this page
- Do NOT extract header information (already captured from first page)

Return JSON in this exact format:
{{
  "line_items": [
    {{
      "sourceLocation": "string",
            "itemCode": "string",
            "salesOrderQuantity": "number",
            "salesUOM": "string",
            "rate": "number",
            "packSize": "number or string",
            "packQuantity": "number or string",
            "remarks": "string",
            "dispatchDate": "YYYY-MM-DD or original format",
            "taxes": [
                "SGST_9_OUTPUT_INDIA": "number",
                "CGST_9_On_Sales": "number"
            ],
            "charges": [
                "Raj1": "string"
            ],
            "discounts": [
                "discount123": "number"
            ]
    }}
  ]
}}

Extract only line items visible on this page. Use null for missing fields. Return only the JSON, no other text.
"""
        

    async def extract_from_image(self, image: Image.Image, page_number: int, is_first_page: bool) -> Dict[str, Any]:
        try:
            base64_image = self.image_to_base64(image)
            prompt = self.get_extraction_prompt(page_number, is_first_page)
            
            response = await self.client.chat.completions.create(
                model="gpt-4o-2024-11-20",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{base64_image}",
                                    "detail": "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=4000,
                temperature=0.1,
            )
            
            content = response.choices[0].message.content.strip()

            # Capture token usage from this API call
            _usage = {}
            if hasattr(response, "usage") and response.usage:
                _usage = {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                }

            if not content:
                return {"error": "Empty response from API", "page": page_number, "_usage": _usage}

            content = content.replace('```json', '').replace('```', '').strip()

            try:
                parsed = json.loads(content)
                parsed["_usage"] = _usage
                return parsed
            except json.JSONDecodeError as e:
                print(f"Raw API response that failed to parse: {content[:200]}...")
                return {
                    "error": f"JSON parsing failed: {str(e)}",
                    "page": page_number,
                    "raw_response": content[:1000],
                    "_usage": _usage,
                }

        except Exception as e:
            return {
                "error": str(e),
                "page": page_number,
                "traceback": traceback.format_exc()
            }
        

    async def process_pdf_data(self, pdf_data: bytes, filename: str) -> Dict[str, Any]:
        try:
            images = self.pdf_bytes_to_images(pdf_data)
            
            if not images:
                return {"error": "No images extracted from PDF", "filename": filename}
            
            tasks = []
            for i, image in enumerate(images):
                page_number = i + 1
                is_first_page = (i == 0)
                task = self.extract_from_image(image, page_number, is_first_page)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            combined_data = {
                "filename": filename,
                "header": None,
                "addresses": None,
                "line_items": [],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                "processing_summary": {
                    "total_pages_processed": len(images),
                    "successful_pages": 0,
                    "failed_pages": 0,
                    "errors": []
                }
            }

            for i, result in enumerate(results):
                page_number = i + 1

                if isinstance(result, Exception):
                    combined_data["processing_summary"]["failed_pages"] += 1
                    combined_data["processing_summary"]["errors"].append({
                        "page": page_number,
                        "error": str(result)
                    })
                    continue

                # Accumulate token usage from each page
                page_usage = result.pop("_usage", {})
                combined_data["usage"]["prompt_tokens"] += page_usage.get("prompt_tokens", 0)
                combined_data["usage"]["completion_tokens"] += page_usage.get("completion_tokens", 0)
                combined_data["usage"]["total_tokens"] += page_usage.get("total_tokens", 0)

                if "error" in result:
                    combined_data["processing_summary"]["failed_pages"] += 1
                    combined_data["processing_summary"]["errors"].append({
                        "page": page_number,
                        "error": result["error"]
                    })
                    continue

                combined_data["processing_summary"]["successful_pages"] += 1

                if i == 0 and "header" in result:
                    combined_data["header"] = result["header"]

                if "addresses" in result:
                    combined_data["addresses"] = result["addresses"]

                if "line_items" in result and isinstance(result["line_items"], list):
                    combined_data["line_items"].extend(result["line_items"])

            return combined_data
            
        except Exception as e:
            return {"error": f"Processing failed: {str(e)}", "filename": filename}
        

    async def process_emails_with_invoices(self, email_config: Dict[str, str], search_criteria: str = 'UNSEEN', max_emails: Optional[int] = None) -> List[Dict[str, Any]]:
        try:
            emails_with_pdfs = self.get_emails_with_invoice_pdfs(email_config, search_criteria, max_emails)
            
            if not emails_with_pdfs:
                return {"message": "No emails with PDF attachments found"}
            
            all_results = []
            
            for email_data in emails_with_pdfs:
                email_result = {
                    "email_metadata": {
                        "email_id": email_data['email_id'],
                        "subject": email_data['subject'],
                        "sender": email_data['sender'],
                        "date": email_data['date'],
                        "processed_at": datetime.now().isoformat()
                    },
                    "invoices": [],
                    "saved_files": []
                }

                for filename, pdf_data in email_data['pdf_attachments']:
                    invoice_data = await self.process_pdf_data(pdf_data, filename)
                    email_result["invoices"].append(invoice_data)

                    json_filename = os.path.splitext(filename)[0] + ".json"
                    json_file_path = os.path.join("json_data", json_filename)
                    
                    try:
                        with open(json_file_path, "w", encoding="utf-8") as f:
                            json.dump(invoice_data, f, indent=2, ensure_ascii=False)
                    except Exception as e:
                        print(f"Error saving JSON file for {filename}: {e}")

                    email_result["saved_files"].append({
                        "filename": filename,
                        "path": os.path.join("uploads", filename),
                        "status": "saved" if os.path.exists(os.path.join("uploads", filename)) else "failed"
                    })

                all_results.append(email_result)

            self.convert_all_json_to_csv_and_xlsx(
                json_dir="json_data",
                csv_output_path="all_invoices.csv",
                xlsx_output_path="all_invoices.xlsx"
            )

            # Sum token usage across all invoices in all emails
            total_tokens = sum(
                inv.get("usage", {}).get("total_tokens", 0)
                for er in all_results if isinstance(er, dict)
                for inv in (er.get("invoices") or []) if isinstance(inv, dict)
            )
            return {
                "results": all_results,
                "usage": {"total_tokens": total_tokens},
            }
        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Email processing failed at line {line_no}")
            return str(e)
    

    def convert_all_json_to_csv_and_xlsx(self, json_dir: str = "json_data", csv_output_path: str = "all_invoices.csv", xlsx_output_path: str = "all_invoices.xlsx"):
        try:
            all_rows = []

            for json_file in os.listdir(json_dir):
                if not json_file.endswith(".json"):
                    continue

                json_path = os.path.join(json_dir, json_file)
                try:
                    with open(json_path, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    invoices = data.get("invoices", [data])

                    for invoice in invoices:
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

                            all_rows.append(row)

                except Exception as e:
                    print(f"Error processing {json_file}: {str(e)}")

            df = pd.DataFrame(all_rows)

            columns_to_remove = [col for col in df.columns if col.startswith("charges_") or col.startswith("discounts_")]
            df.drop(columns=columns_to_remove, inplace=True, errors='ignore')

            df.to_csv(csv_output_path, index=False)
            df.to_excel(xlsx_output_path, index=False)

            print(f"✅ Combined data saved to:\n  - {csv_output_path}\n  - {xlsx_output_path}")

        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Combined export failed at line {line_no}")
            return str(e)


    async def process_image_data(self, image_data: bytes, filename: str) -> Dict[str, Any]:
        """
        Process a single image file (PNG/JPG/TIFF).
        Uses the SAME extract_from_image() and get_extraction_prompt() as PDF flow.
        Treated as a single-page document (is_first_page=True).
        """
        try:
            print(f"Processing image file: {filename}")
            image = Image.open(io.BytesIO(image_data))

            if image.mode in ('RGBA', 'P', 'LA'):
                image = image.convert('RGB')

            result = await self.extract_from_image(image, page_number=1, is_first_page=True)

            page_usage = result.pop("_usage", {}) if isinstance(result, dict) else {}

            combined_data = {
                "filename": filename,
                "header": None,
                "addresses": None,
                "line_items": [],
                "usage": {
                    "prompt_tokens": page_usage.get("prompt_tokens", 0),
                    "completion_tokens": page_usage.get("completion_tokens", 0),
                    "total_tokens": page_usage.get("total_tokens", 0),
                },
                "processing_summary": {
                    "total_pages_processed": 1,
                    "successful_pages": 0,
                    "failed_pages": 0,
                    "errors": []
                }
            }

            if isinstance(result, Exception) or "error" in result:
                combined_data["processing_summary"]["failed_pages"] = 1
                error_msg = str(result) if isinstance(result, Exception) else result["error"]
                combined_data["processing_summary"]["errors"].append({
                    "page": 1,
                    "error": error_msg
                })
            else:
                combined_data["processing_summary"]["successful_pages"] = 1
                if "header" in result:
                    combined_data["header"] = result["header"]
                if "addresses" in result:
                    combined_data["addresses"] = result["addresses"]
                if "line_items" in result and isinstance(result["line_items"], list):
                    combined_data["line_items"].extend(result["line_items"])

            print(f"Image processing complete for {filename}. Extracted {len(combined_data['line_items'])} line items.")
            return combined_data

        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Image processing failed at line {line_no}")
            return {"error": f"Image processing failed: {str(e)}", "filename": filename}


    async def process_uploaded_files(self, files_data: List[Tuple[str, bytes]]) -> List[Dict[str, Any]]:
        """
        Process directly uploaded files. Same extraction pipeline as email flow.
        PDF  -> self.process_pdf_data()    (identical to email attachment processing)
        Image -> self.process_image_data() (same extract_from_image + get_extraction_prompt)
        """
        try:
            if not files_data:
                return [{"error": "No files provided"}]

            print(f"Processing {len(files_data)} uploaded file(s)")

            all_results = []

            for filename, file_bytes in files_data:
                try:
                    # Save uploaded file to uploads/
                    upload_dir = os.path.join(os.getcwd(), "uploads")
                    os.makedirs(upload_dir, exist_ok=True)
                    filepath = os.path.join(upload_dir, filename)
                    with open(filepath, 'wb') as f:
                        f.write(file_bytes)
                    print(f"Saved: {filepath}")

                    ext = os.path.splitext(filename)[1].lower()

                    if ext == '.pdf':
                        invoice_data = await self.process_pdf_data(file_bytes, filename)
                    elif ext in ('.png', '.jpg', '.jpeg', '.tiff', '.tif'):
                        invoice_data = await self.process_image_data(file_bytes, filename)
                    else:
                        invoice_data = {"error": f"Unsupported file type: {ext}", "filename": filename}

                    all_results.append(invoice_data)

                    # Save extracted JSON to json_data/
                    json_dir = os.path.join(os.getcwd(), "json_data")
                    os.makedirs(json_dir, exist_ok=True)
                    json_filename = os.path.splitext(filename)[0] + ".json"
                    json_file_path = os.path.join(json_dir, json_filename)

                    try:
                        with open(json_file_path, "w", encoding="utf-8") as f:
                            json.dump(invoice_data, f, indent=2, ensure_ascii=False)
                        print(f"JSON saved: {json_file_path}")
                    except Exception as e:
                        print(f"Error saving JSON file for {filename}: {e}")

                except Exception as e:
                    print(f"Error processing file {filename}: {str(e)}")
                    all_results.append({"error": str(e), "filename": filename})
                    continue

            # Export combined CSV/XLSX (same method as email flow)
            self.convert_all_json_to_csv_and_xlsx(
                json_dir="json_data",
                csv_output_path="all_invoices.csv",
                xlsx_output_path="all_invoices.xlsx"
            )

            # Sum token usage across all processed files
            total_tokens = sum(
                r.get("usage", {}).get("total_tokens", 0)
                for r in all_results if isinstance(r, dict)
            )
            return {
                "results": all_results,
                "usage": {"total_tokens": total_tokens},
            }

        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Upload processing failed at line {line_no}")
            return [{"error": str(e)}]
