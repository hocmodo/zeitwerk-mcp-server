# Zeitwerk MCP Server

## Description
This extension connects Claude Desktop to [Zeitwerk](http://www.hocmodo.nl), a professional time tracking and invoicing application for freelancers. It bridges Claude to the Zeitwerk local HTTP API (running on `127.0.0.1:27432`), letting you log time, manage projects and customers, generate reports, and create invoices entirely through natural language — without ever leaving your conversation.

> **Prerequisite:** Zeitwerk must be installed and running on your machine. The extension communicates only with the local Zeitwerk API; no data ever leaves your device.

## Features

- **Time logging** — Log hours in natural language ("2.5h on Website Redesign — fixed nav bug")
- **Reporting** — Get timesheet and earnings summaries by day, week, month, or custom range
- **Invoicing** — Draft, confirm, and create invoices from unbilled time; mark invoices as paid; download PDFs
- **Project & customer management** — Create and update customers and projects without opening the app
- **Import** — Bulk-import time entries from `.xlsx`, `.xls`, or `.csv` files
- **Dashboard** — Instant snapshot of today's hours, this week, this month, and outstanding invoice totals

## Installation

Install directly from the Claude Desktop Extensions directory:

**Settings → Extensions → Browse → search "Zeitwerk"**

Or install manually by adding the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zeitwerk": {
      "command": "node",
      "args": ["/path/to/zeitwerk-mcp-server/index.js"],
      "env": {
        "TOKEN": "your-zeitwerk-api-token"
      }
    }
  }
}
```

## Configuration

1. Open **Settings → Extensions → Zeitwerk MCP Server**
2. Paste your **Zeitwerk API Token** (found in Zeitwerk → Preferences → API)
3. Make sure the Zeitwerk desktop app is running before starting a conversation

## Available Tools

| Tool | Description |
|---|---|
| `get_status` | Dashboard summary: hours today/week/month, outstanding invoices |
| `get_customers` | List all active customers |
| `create_customer` | Create a new customer |
| `update_customer` | Update a customer's details |
| `get_projects` | List all projects, optionally filtered by customer |
| `create_project` | Create a new project with an hourly rate |
| `update_project` | Update a project's name, rate, or customer |
| `get_time_entries` | Fetch time entries for a date range |
| `create_time_entry` | Log a new time entry |
| `update_time_entry` | Edit an existing time entry |
| `delete_time_entry` | Soft-delete a time entry |
| `get_invoices` | List invoices, optionally filtered by status |
| `create_invoice` | Create an invoice with line items |
| `update_invoice` | Update an invoice (e.g. mark as paid) |
| `get_invoice_pdf` | Download an invoice PDF to your Downloads folder |
| `import_time_entries` | Import entries from an Excel or CSV file |

## Examples

### Example 1: Log time
**User prompt:** "Log 3 hours on the Acme Solutions Cloud Migration project — reviewed pull requests"

**Expected behavior:**
- Extension looks up the matching customer and project
- Creates a time entry with the given duration and description
- Confirms the entry with date, hours, and project name

### Example 2: Get an earnings report
**User prompt:** "How much did I earn from Cascade Partners this month?"

**Expected behavior:**
- Extension fetches time entries for the current month filtered to Cascade Partners
- Calculates total hours and earnings based on the project rate
- Returns summary with a per-project breakdown

### Example 3: Create an invoice
**User prompt:** "Create an invoice for Blue Ridge Consulting for all unbilled time in March 2026"

**Expected behavior:**
- Look up Blue Ridge Consulting customer ID
- Fetch unbilled time entries for March 2026
- Show draft invoice summary for confirmation
- Create invoice in Zeitwerk

### Example 4: Import time entries from a file
**User prompt:** "Can you import the excel sheets from the working folder into the Marketing project for Acme Corp in Zeitwerk?"

**Expected behavior:**
- Extension reads the Excel file at the given path
- Looks up Acme Corp and Marketing project in Zeitwerk
- Parses time entries from excel sheet for verifying import afterwards
- Import time entries into Zeitwerk by sending excel sheet to Zeitwerk
- Reports how many entries were imported, verify them and flags any rows it could not parse

## Privacy

**Full privacy policy:** [https://www.hocmodo.nl/zeitwerk-mcp-privacy/](https://www.hocmodo.nl/zeitwerk-mcp-privacy/)

| Topic | Detail |
|---|---|
| **Data collected** | None. This extension does not collect, store, or transmit any personal data. |
| **External network requests** | None. All communication is exclusively with the Zeitwerk app running locally on `127.0.0.1:27432`. |
| **Third-party sharing** | None. No data is shared with any third party, including Anthropic or the extension author. |
| **Data retention** | Not applicable — no data is collected or stored by this extension. |
| **Authentication** | Your Zeitwerk API token is stored locally by Claude Desktop using your OS secure storage (macOS Keychain / Windows Credential Manager). It is never transmitted externally. |

**Privacy contact:** joost.evertse@hocmodo.nl

## Support

- **Issues & feature requests:** [github.com/hocmodo/zeitwerk-plugin](https://github.com/hocmodo/zeitwerk-plugin/issues)
- **Email:** joost.evertse@hocmodo.nl
- **Blog:** [blog.joustie.nl](https://blog.joustie.nl)