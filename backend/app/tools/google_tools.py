"""Google Workspace integration tools for cross-platform metadata workflows.

Provides LangChain tools that create Google Sheets and Google Docs
via the Google APIs, allowing agents to publish structured reports,
data quality summaries, and audit documents as part of multi-MCP
orchestration workflows.

Requires a Google Cloud Service Account with Sheets API and Docs API
enabled. Set GOOGLE_SERVICE_ACCOUNT_FILE in .env to the path of the
downloaded JSON key file.
"""

from __future__ import annotations

import json
import logging

from langchain_core.tools import tool

from app.core.config import settings

_logger = logging.getLogger(__name__)


def get_google_tools() -> list:
    """Return all Google Workspace LangChain tools."""
    return [create_google_sheet, create_google_doc, append_to_google_sheet]


def _get_google_services():
    """Build Google Sheets and Docs API service objects.

    Returns (sheets_service, docs_service, drive_service) or raises if
    credentials are not configured.
    """
    if not settings.google_service_account_file:
        raise RuntimeError(
            "Google Service Account not configured. "
            "Set GOOGLE_SERVICE_ACCOUNT_FILE in .env"
        )

    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/drive.file",
    ]
    creds = Credentials.from_service_account_file(
        settings.google_service_account_file, scopes=scopes
    )
    sheets = build("sheets", "v4", credentials=creds, cache_discovery=False)
    docs = build("docs", "v1", credentials=creds, cache_discovery=False)
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)
    return sheets, docs, drive


@tool
def create_google_sheet(title: str, headers: str, rows: str) -> str:
    """Create a new Google Sheet with structured tabular data.

    Use this to publish data quality reports, audit results, metadata
    inventories, or any tabular data as a shareable Google Sheet.
    The sheet is automatically shared with anyone who has the link.

    Args:
        title: The title of the spreadsheet (e.g. "DQ Report - 2025-06-28").
        headers: Comma-separated column headers (e.g. "Table,Test,Status,Severity").
        rows: JSON array of arrays representing row data. Each inner array
              has values matching the headers. Example:
              '[["orders","null_check","FAILED","critical"],["users","unique","PASSED","info"]]'
    """
    try:
        sheets, _, drive = _get_google_services()
    except RuntimeError as e:
        return str(e)

    header_list = [h.strip() for h in headers.split(",")]

    try:
        row_data = json.loads(rows) if isinstance(rows, str) else rows
    except json.JSONDecodeError:
        return "Error: 'rows' must be a valid JSON array of arrays."

    try:
        # Create the spreadsheet
        spreadsheet = sheets.spreadsheets().create(
            body={
                "properties": {"title": title},
                "sheets": [{"properties": {"title": "Report"}}],
            }
        ).execute()

        spreadsheet_id = spreadsheet["spreadsheetId"]
        spreadsheet_url = spreadsheet["spreadsheetUrl"]

        # Write headers + data
        all_rows = [header_list] + row_data
        sheets.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range="Report!A1",
            valueInputOption="RAW",
            body={"values": all_rows},
        ).execute()

        # Format header row (bold)
        sheets.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={
                "requests": [
                    {
                        "repeatCell": {
                            "range": {
                                "sheetId": 0,
                                "startRowIndex": 0,
                                "endRowIndex": 1,
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "textFormat": {"bold": True},
                                    "backgroundColor": {
                                        "red": 0.9,
                                        "green": 0.9,
                                        "blue": 0.95,
                                    },
                                }
                            },
                            "fields": "userEnteredFormat(textFormat,backgroundColor)",
                        }
                    },
                    {
                        "autoResizeDimensions": {
                            "dimensions": {
                                "sheetId": 0,
                                "dimension": "COLUMNS",
                                "startIndex": 0,
                                "endIndex": len(header_list),
                            }
                        }
                    },
                ]
            },
        ).execute()

        # Share with anyone who has the link
        drive.permissions().create(
            fileId=spreadsheet_id,
            body={"type": "anyone", "role": "reader"},
        ).execute()

        row_count = len(row_data)
        return (
            f"✅ Google Sheet created successfully!\n"
            f"- **Title**: {title}\n"
            f"- **Rows**: {row_count} data rows + header\n"
            f"- **Columns**: {', '.join(header_list)}\n"
            f"- **URL**: {spreadsheet_url}\n"
            f"- **Sharing**: Anyone with the link can view"
        )
    except Exception as e:
        _logger.exception("Error creating Google Sheet")
        return f"Error creating Google Sheet: {e}"


@tool
def create_google_doc(title: str, content: str) -> str:
    """Create a new Google Doc with a formatted report or document.

    Use this to publish detailed audit reports, data contracts, compliance
    summaries, or governance documents as shareable Google Docs.
    Content should be in markdown-like format and will be inserted as plain text.
    The document is automatically shared with anyone who has the link.

    Args:
        title: The document title (e.g. "PII Compliance Report - Q2 2025").
        content: The full document content. Use markdown-style formatting:
                 lines starting with # for headings, - for bullets, etc.
    """
    try:
        _, docs, drive = _get_google_services()
    except RuntimeError as e:
        return str(e)

    try:
        # Create the document
        doc = docs.documents().create(body={"title": title}).execute()
        doc_id = doc["documentId"]

        # Insert content (reverse order since each insert goes at index 1)
        lines = content.split("\n")
        requests = []
        # Insert all content at once at position 1 (after the implicit newline)
        full_text = content + "\n"
        requests.append(
            {"insertText": {"location": {"index": 1}, "text": full_text}}
        )

        # Apply heading formatting for lines starting with #
        if requests:
            docs.documents().batchUpdate(
                documentId=doc_id, body={"requests": requests}
            ).execute()

        # Apply heading styles in a second pass
        # Re-read the doc to get accurate indices
        updated_doc = docs.documents().get(documentId=doc_id).execute()
        style_requests = []
        for element in updated_doc.get("body", {}).get("content", []):
            paragraph = element.get("paragraph")
            if not paragraph:
                continue
            text_elements = paragraph.get("elements", [])
            if not text_elements:
                continue
            text = text_elements[0].get("textRun", {}).get("content", "")
            start_index = text_elements[0].get("startIndex", 0)
            end_index = text_elements[-1].get("endIndex", start_index)

            if text.startswith("# "):
                style_requests.append({
                    "updateParagraphStyle": {
                        "range": {"startIndex": start_index, "endIndex": end_index},
                        "paragraphStyle": {"namedStyleType": "HEADING_1"},
                        "fields": "namedStyleType",
                    }
                })
                # Remove the "# " prefix
                style_requests.append({
                    "deleteContentRange": {
                        "range": {
                            "startIndex": start_index,
                            "endIndex": start_index + 2,
                        }
                    }
                })
            elif text.startswith("## "):
                style_requests.append({
                    "updateParagraphStyle": {
                        "range": {"startIndex": start_index, "endIndex": end_index},
                        "paragraphStyle": {"namedStyleType": "HEADING_2"},
                        "fields": "namedStyleType",
                    }
                })
                style_requests.append({
                    "deleteContentRange": {
                        "range": {
                            "startIndex": start_index,
                            "endIndex": start_index + 3,
                        }
                    }
                })
            elif text.startswith("### "):
                style_requests.append({
                    "updateParagraphStyle": {
                        "range": {"startIndex": start_index, "endIndex": end_index},
                        "paragraphStyle": {"namedStyleType": "HEADING_3"},
                        "fields": "namedStyleType",
                    }
                })
                style_requests.append({
                    "deleteContentRange": {
                        "range": {
                            "startIndex": start_index,
                            "endIndex": start_index + 4,
                        }
                    }
                })

        if style_requests:
            # Process deletes in reverse order to preserve indices
            docs.documents().batchUpdate(
                documentId=doc_id, body={"requests": style_requests}
            ).execute()

        # Share with anyone who has the link
        drive.permissions().create(
            fileId=doc_id,
            body={"type": "anyone", "role": "reader"},
        ).execute()

        doc_url = f"https://docs.google.com/document/d/{doc_id}/edit"
        word_count = len(content.split())
        return (
            f"✅ Google Doc created successfully!\n"
            f"- **Title**: {title}\n"
            f"- **Word count**: ~{word_count}\n"
            f"- **URL**: {doc_url}\n"
            f"- **Sharing**: Anyone with the link can view"
        )
    except Exception as e:
        _logger.exception("Error creating Google Doc")
        return f"Error creating Google Doc: {e}"


@tool
def append_to_google_sheet(spreadsheet_id: str, rows: str) -> str:
    """Append rows to an existing Google Sheet.

    Use this to add new data to a tracking sheet — for example, logging
    data quality incidents, appending audit results, or updating a
    metadata change log over time.

    Args:
        spreadsheet_id: The ID of the target spreadsheet (from the URL).
        rows: JSON array of arrays representing row data to append.
              Example: '[["2025-06-28","orders.amount","null_check","FAILED"]]'
    """
    try:
        sheets, _, _ = _get_google_services()
    except RuntimeError as e:
        return str(e)

    try:
        row_data = json.loads(rows) if isinstance(rows, str) else rows
    except json.JSONDecodeError:
        return "Error: 'rows' must be a valid JSON array of arrays."

    try:
        result = sheets.spreadsheets().values().append(
            spreadsheetId=spreadsheet_id,
            range="A1",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": row_data},
        ).execute()

        updates = result.get("updates", {})
        rows_appended = updates.get("updatedRows", len(row_data))
        return (
            f"✅ Appended {rows_appended} rows to Google Sheet!\n"
            f"- **Spreadsheet**: https://docs.google.com/spreadsheets/d/{spreadsheet_id}\n"
            f"- **Updated range**: {updates.get('updatedRange', 'N/A')}"
        )
    except Exception as e:
        _logger.exception("Error appending to Google Sheet")
        return f"Error appending to Google Sheet: {e}"
