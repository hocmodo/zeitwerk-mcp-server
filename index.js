#!/usr/bin/env node

/**
 * Zeitwerk MCP Server
 * Bridges Claude Code to the Zeitwerk local HTTP API running on 127.0.0.1:27432.
 * Auth token is passed via the TOKEN env var in .mcp.json (kept in sync by Zeitwerk).
 */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const ZEITWERK_HOST = "127.0.0.1";
const ZEITWERK_PORT = 27432;

// --- Token ---

function getToken() {
  const token = process.env.TOKEN;
  if (token) return token;
  throw new Error(
    "Zeitwerk token not set. Make sure the Zeitwerk app has been launched at least once."
  );
}

// --- HTTP helper ---

function apiRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: ZEITWERK_HOST,
      port: ZEITWERK_PORT,
      path: urlPath,
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", (e) => reject(new Error(`Zeitwerk API error: ${e.message}. Is Zeitwerk running?`)));
    if (payload) req.write(payload);
    req.end();
  });
}

function apiRequestBinary(method, urlPath) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const options = {
      hostname: ZEITWERK_HOST,
      port: ZEITWERK_PORT,
      path: urlPath,
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    });

    req.on("error", (e) => reject(new Error(`Zeitwerk API error: ${e.message}. Is Zeitwerk running?`)));
    req.end();
  });
}

function apiRequestMultipart(urlPath, fields, filePath) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const boundary = `----ZeitwerkBoundary${Date.now()}`;
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const parts = [];
    for (const [name, value] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
    parts.push(fileContent);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
    const payload = Buffer.concat(parts);

    const options = {
      hostname: ZEITWERK_HOST,
      port: ZEITWERK_PORT,
      path: urlPath,
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": payload.length,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", (e) => reject(new Error(`Zeitwerk API error: ${e.message}. Is Zeitwerk running?`)));
    req.write(payload);
    req.end();
  });
}

// --- MCP Protocol ---

const TOOLS = [
  {
    name: "get_status",
    description: "Get a dashboard summary: today's hours, this week's hours, this month's hours and earnings, and outstanding invoice totals.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { title: "Get Status", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_customers",
    description: "List all active customers.",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { title: "Get Customers", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "create_customer",
    description: "Create a new customer.",
    inputSchema: {
      type: "object",
      properties: {
        name:    { type: "string", description: "Customer name" },
        contact: { type: "string", description: "Contact email or name (optional)" },
        address: { type: "string", description: "Billing address (optional)" },
        tax_id:  { type: "string", description: "VAT / tax ID (optional)" },
      },
      required: ["name"],
    },
    annotations: { title: "Create Customer", destructiveHint: false, openWorldHint: false },
  },
  {
    name: "update_customer",
    description: "Update an existing customer. Only supply the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        id:      { type: "string", description: "Customer ID" },
        name:    { type: "string", description: "Customer name" },
        contact: { type: "string", description: "Contact email or name" },
        address: { type: "string", description: "Billing address" },
        tax_id:  { type: "string", description: "VAT / tax ID" },
      },
      required: ["id"],
    },
    annotations: { title: "Update Customer", destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_projects",
    description: "List all active projects. Optionally filter by customer_id.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Filter by customer ID (optional)" },
      },
    },
    annotations: { title: "Get Projects", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "create_project",
    description: "Create a new project for a customer.",
    inputSchema: {
      type: "object",
      properties: {
        name:        { type: "string", description: "Project name" },
        customer_id: { type: "string", description: "Customer ID" },
        rate:        { type: "string", description: "Hourly rate" },
      },
      required: ["name", "customer_id", "rate"],
    },
    annotations: { title: "Create Project", destructiveHint: false, openWorldHint: false },
  },
  {
    name: "update_project",
    description: "Update an existing project. Only supply the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        id:          { type: "string", description: "Project ID" },
        name:        { type: "string", description: "Project name" },
        customer_id: { type: "string", description: "Customer ID" },
        rate:        { type: "string", description: "Hourly rate" },
      },
      required: ["id"],
    },
    annotations: { title: "Update Project", destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_time_entries",
    description: "Get time entries for a date range. Returns hours, description, project, customer, and amount per entry.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to:   { type: "string", description: "End date YYYY-MM-DD" },
        project_id: { type: "string", description: "Filter by project ID (optional)" },
      },
      required: ["from", "to"],
    },
    annotations: { title: "Get Time Entries", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "create_time_entry",
    description: "Log a new time entry.",
    inputSchema: {
      type: "object",
      properties: {
        project_id:  { type: "string", description: "Project ID" },
        hours:       { type: "number", description: "Hours worked (decimal, e.g. 2.5)" },
        date:        { type: "string", description: "Date YYYY-MM-DD" },
        description: { type: "string", description: "Description of work done" },
      },
      required: ["project_id", "hours", "date"],
    },
    annotations: { title: "Create Time Entry", destructiveHint: false, openWorldHint: false },
  },
  {
    name: "update_time_entry",
    description: "Update an existing time entry's hours or description.",
    inputSchema: {
      type: "object",
      properties: {
        id:          { type: "string", description: "Time entry ID" },
        hours:       { type: "number", description: "Updated hours" },
        description: { type: "string", description: "Updated description" },
      },
      required: ["id"],
    },
    annotations: { title: "Update Time Entry", destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "delete_time_entry",
    description: "Soft-delete a time entry.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Time entry ID to delete" },
      },
      required: ["id"],
    },
    annotations: { title: "Delete Time Entry", destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_invoices",
    description: "List invoices. Optionally filter by status: 'unpaid' or 'paid'.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["unpaid", "paid"], description: "Filter by status (optional)" },
      },
    },
    annotations: { title: "Get Invoices", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "create_invoice",
    description: "Create a new invoice with line items.",
    inputSchema: {
      type: "object",
      properties: {
        customer_id:          { type: "string" },
        invoice_number:       { type: "string", description: "e.g. 2026-042" },
        invoice_identifier:   { type: "string", description: "e.g. 2026-042" },
        invoice_date:         { type: "string", description: "YYYY-MM-DD" },
        due_date:             { type: "string", description: "YYYY-MM-DD" },
        tax:                  { type: "number", description: "VAT percentage (e.g. 21.0)" },
        line_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              project_id: { type: "string" },
              hours:      { type: "number" },
              rate:       { type: "number" },
              amount:     { type: "number" },
            },
            required: ["project_id", "hours", "rate"],
          },
        },
      },
      required: ["customer_id", "invoice_date"],
    },
    annotations: { title: "Create Invoice", destructiveHint: false, openWorldHint: false },
  },
  {
    name: "update_invoice",
    description: "Update an invoice — typically to mark it as paid.",
    inputSchema: {
      type: "object",
      properties: {
        id:     { type: "string", description: "Invoice ID" },
        status: { type: "string", enum: ["unpaid", "paid"] },
      },
      required: ["id", "status"],
    },
    annotations: { title: "Update Invoice", destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_invoice_pdf",
    description: "Download an invoice as a PDF. Returns the local file path where the PDF was saved.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Invoice ID" },
      },
      required: ["id"],
    },
    annotations: { title: "Get Invoice PDF", destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "import_time_entries",
    description: "Import time entries from an Excel (.xlsx, .xls) or CSV (.csv) file. All entries are assigned to the specified project. Returns the number of imported entries plus any warnings or errors.",
    inputSchema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute path to the .xlsx, .xls, or .csv file to import" },
        project_id: { type: "string", description: "Project ID to assign all imported entries to" },
      },
      required: ["file_path", "project_id"],
    },
    annotations: { title: "Import Time Entries", destructiveHint: false, openWorldHint: false },
  },
];

async function callTool(name, args) {
  let result;

  switch (name) {
    case "get_status":
      result = await apiRequest("GET", "/status");
      break;
    case "get_customers":
      result = await apiRequest("GET", "/customers");
      break;
    case "get_projects": {
      const qs = args.customer_id ? `?customer_id=${args.customer_id}` : "";
      result = await apiRequest("GET", `/projects${qs}`);
      break;
    }
    case "create_customer":
      result = await apiRequest("POST", "/customers", args);
      break;
    case "update_customer": {
      const { id, ...body } = args;
      result = await apiRequest("PATCH", `/customers/${id}`, body);
      break;
    }
    case "create_project":
      result = await apiRequest("POST", "/projects", { ...args, customer_id: parseInt(args.customer_id, 10), rate: parseFloat(args.rate) });
      break;
    case "update_project": {
      const { id, ...body } = args;
      if (body.customer_id) body.customer_id = parseInt(body.customer_id, 10);
      if (body.rate !== undefined) body.rate = parseFloat(body.rate);
      result = await apiRequest("PATCH", `/projects/${id}`, body);
      break;
    }
    case "get_time_entries": {
      let qs = `?from=${args.from}&to=${args.to}`;
      if (args.project_id) qs += `&project_id=${args.project_id}`;
      result = await apiRequest("GET", `/time-entries${qs}`);
      break;
    }
    case "create_time_entry":
      result = await apiRequest("POST", "/time-entries", { ...args, project_id: parseInt(args.project_id, 10) });
      break;
    case "update_time_entry": {
      const { id, ...body } = args;
      result = await apiRequest("PATCH", `/time-entries/${id}`, body);
      break;
    }
    case "delete_time_entry":
      result = await apiRequest("DELETE", `/time-entries/${args.id}`);
      break;
    case "get_invoices": {
      const qs = args.status ? `?status=${args.status}` : "";
      result = await apiRequest("GET", `/invoices${qs}`);
      break;
    }
    case "create_invoice": {
      const invoiceArgs = {
        ...args,
        customer_id: parseInt(args.customer_id, 10),
        line_items: args.line_items?.map(item => ({ ...item, project_id: parseInt(item.project_id, 10) })),
      };
      result = await apiRequest("POST", "/invoices", invoiceArgs);
      break;
    }
    case "update_invoice": {
      const { id, ...body } = args;
      result = await apiRequest("PATCH", `/invoices/${id}`, body);
      break;
    }
    case "get_invoice_pdf": {
      const pdfResult = await apiRequestBinary("GET", `/invoices/${args.id}/pdf`);
      if (pdfResult.status >= 400) {
        throw new Error(`Zeitwerk API returned ${pdfResult.status}`);
      }
      const outPath = path.join(os.homedir(), "Downloads", `zeitwerk-invoice-${args.id}.pdf`);
      fs.writeFileSync(outPath, pdfResult.buffer);
      return JSON.stringify({ saved_to: outPath });
    }
    case "import_time_entries": {
      result = await apiRequestMultipart("/time-entries/import", { project_id: parseInt(args.project_id, 10) }, args.file_path);
      break;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  if (result.status >= 400) {
    throw new Error(`Zeitwerk API returned ${result.status}: ${JSON.stringify(result.body)}`);
  }

  return JSON.stringify(result.body, null, 2);
}

// --- Stdio MCP loop ---

const rl = readline.createInterface({ input: process.stdin });
const pending = new Map();

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

rl.on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { id, method, params } = msg;

  try {
    if (method === "initialize") {
      send({ jsonrpc: "2.0", id, result: {
        protocolVersion: "2025-11-25",
        capabilities: { tools: {} },
        serverInfo: { name: "zeitwerk", version: "1.0.0" },
      }});
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (method === "tools/call") {
      try {
        const text = await callTool(params.name, params.arguments || {});
        send({ jsonrpc: "2.0", id, result: {
          content: [{ type: "text", text }],
          isError: false,
        }});
      } catch (toolErr) {
        // Unknown tool → protocol error; all other failures → tool execution error
        if (toolErr.message.startsWith("Unknown tool:")) {
          send({ jsonrpc: "2.0", id, error: { code: -32602, message: toolErr.message } });
        } else {
          send({ jsonrpc: "2.0", id, result: {
            content: [{ type: "text", text: toolErr.message }],
            isError: true,
          }});
        }
      }
    } else if (method === "notifications/initialized") {
      // no response needed
    } else {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
  } catch (err) {
    send({ jsonrpc: "2.0", id, error: { code: -32000, message: err.message } });
  }
});
