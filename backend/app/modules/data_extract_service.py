import os
import imaplib
import traceback
from typing import Dict, Any, Optional, List
from dotenv import load_dotenv
from fastapi import UploadFile
from fastapi.exceptions import HTTPException

from app.helper.extract_helper import EmailInvoiceExtractor

load_dotenv(
    dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.env'),
    verbose=True,
    override=True,
)

class ExtractDataService:
    @staticmethod
    async def verify_email(email_address: str, email_password: str) -> Dict[str, Any]:
        """Test IMAP connection to verify email credentials."""
        try:
            mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
            mail.login(email_address, email_password)
            mail.select('inbox')
            mail.close()
            mail.logout()
            return {"success": True}
        except imaplib.IMAP4.error as e:
            error_msg = str(e)
            if "Invalid credentials" in error_msg:
                return {"success": False, "error": "Invalid email credentials. Check your email and password."}
            elif "NO LOGIN failed" in error_msg:
                return {"success": False, "error": "Login failed. Ensure IMAP is enabled in your Gmail settings."}
            return {"success": False, "error": f"IMAP error: {error_msg}"}
        except Exception as e:
            traceback.print_exc()
            return {"success": False, "error": f"Connection failed: {str(e)}"}

    @staticmethod
    async def extract_data_from_pdf(email_address: str, email_password: str, max_emails: Optional[int] = None) -> Dict[str, Any]:
        try:
            # Create email config
            email_config = {
                'server': 'imap.gmail.com',
                'email': email_address,
                'password': email_password,
                'port': 993
            }
            
            openai_api_key = os.getenv('OPENAI_API_KEY')
            if not openai_api_key:
                raise HTTPException(status_code=500, detail="OpenAI API key not configured in environment variables.")

            # Initialize extractor (OpenAI key from environment)
            extractor = EmailInvoiceExtractor(openai_api_key=openai_api_key)
            # Process emails
            result_data = await extractor.process_emails_with_invoices(email_config=email_config, search_criteria='ALL', max_emails=max_emails)

            if isinstance(result_data, dict) and "results" in result_data:
                return result_data
            return {"results": result_data, "usage": {"total_tokens": 0}}
        except Exception as e:
            # Get the traceback as a string
            traceback_str = traceback.format_exc()
            print(traceback_str)
            # Get the line number of the exception
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Exception occurred on line {line_no}")
            return str(e)

    @staticmethod
    async def extract_data_from_upload(files: List[UploadFile]) -> Dict[str, Any]:
        try:
            openai_api_key = os.getenv('OPENAI_API_KEY')
            if not openai_api_key:
                raise HTTPException(status_code=500, detail="OpenAI API key not configured in environment variables.")

            # Same extractor class used by email flow
            extractor = EmailInvoiceExtractor(openai_api_key=openai_api_key)

            # Read all uploaded files into (filename, bytes) tuples
            files_data = []
            for file in files:
                filename = file.filename or "unknown.pdf"
                file_bytes = await file.read()

                if not file_bytes:
                    continue

                ext = os.path.splitext(filename)[1].lower()
                if ext not in ('.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif'):
                    continue

                files_data.append((filename, file_bytes))

            if not files_data:
                return {
                    "results": [{"error": "No valid files uploaded. Allowed: PDF, PNG, JPG, TIFF"}]
                }

            # Delegate to helper — uses same pipeline as process_emails_with_invoices
            result_data = await extractor.process_uploaded_files(files_data=files_data)

            # Helper now returns {"results": [...], "usage": {...}}
            if isinstance(result_data, dict) and "results" in result_data:
                return result_data
            return {"results": result_data, "usage": {"total_tokens": 0}}

        except HTTPException:
            raise
        except Exception as e:
            traceback_str = traceback.format_exc()
            print(traceback_str)
            line_no = traceback.extract_tb(e.__traceback__)[-1][1]
            print(f"Exception occurred on line {line_no}")
            return str(e)
