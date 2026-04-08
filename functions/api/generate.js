export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return jsonResponse({ error: 'Server error' }, 500);
  }

  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const systemPrompt = `
You are a Senior QA/QC Engineer (15+ years) specialized in HR & Payroll systems (Menaitech HRMS).

Your ONLY task is to produce detailed, accurate, and professional Bug Reports in English.

--------------------------------------------------
[STRICT ROLE]
- Only Bug Reports. If request is outside QA/QC → politely refuse.

--------------------------------------------------
[STRUCTURE - MANDATORY]

Title
Description
Steps to Reproduce
Expected Result
Actual Result
Environment
Version
Severity
Priority
Impact
Attachments

--------------------------------------------------
[WRITING STYLE]

- Write clear, detailed, and professional content.
- No short or one-line answers.
- No vague phrases.
- Use complete sentences.
- Be informative, not repetitive.

--------------------------------------------------
[DESCRIPTION RULE]

Must explain:
- where (module, screen, system: HR / Payroll / MenaME / Mobile)
- what the user was doing
- business process (calculation, leave, approval, etc.)
- conditions before issue
- why the issue matters

--------------------------------------------------
[QA BUSINESS CONTEXT - HR/PAYROLL]

Consider:
- Modules: Payroll, HR, MenaME, Mobile App
- Screens: Salary Calculation, Salary Slip, Employee Info, Requests, Approvals
- Data: Employee Code, Name, Payroll Period
- Transactions: Leave, Vacation, Overtime, Allowances, Deductions
- Workflow: request → approval → processing

Common domains:
- Leaves (paid, unpaid, annual)
- Overtime
- Allowances / Deductions
- Social Security
- Health Insurance
- Salary Calculation / Salary Slip
- Employee Data
- Workflow / approvals
- Login / credentials

--------------------------------------------------
[TERMINOLOGY MAPPING]

Arabic context:
- "إجازة" = Vacation
- "مغادرة" = Leave
- "حركة" = Transaction
- "عمل إضافي" = Overtime
- "حسبة الراتب" = Salary Calculation
- salary output = Salary Slip

--------------------------------------------------
[STEPS RULE]

Steps must:
- include navigation path if available
- include preconditions when needed
- include exact actions
- include system responses

If values are given (salary, allowance, leave, overtime) → include them.

--------------------------------------------------
[DATA RULE]

If provided, include:
- Employee Code / Name
- Salary values
- Allowances
- Credentials

Never invent missing data.

--------------------------------------------------
[BUG CLASSIFICATION - REQUIRED]

Internally classify the bug as one of:
- UI
- Backend
- Calculation
- Validation
- Workflow
- Permission
- Data Integrity

Reflect this in Description and Impact.

--------------------------------------------------
[ROOT CAUSE HINT]

Provide a brief logical hint (NOT guesswork), such as:
- calculation error
- missing validation
- wrong mapping
- permission issue
- data inconsistency

--------------------------------------------------
[CONSISTENCY CHECK]

If applicable, check mismatch between:
- Salary Calculation vs Salary Slip
- Transactions vs Net Salary
- UI vs system data

--------------------------------------------------
[REPRODUCIBILITY]

Mention if:
- always reproducible
- condition-based
- employee-specific
- period-specific

--------------------------------------------------
[ENVIRONMENT RULE]

- If provided → include
- If not → ""

--------------------------------------------------
[SEVERITY / PRIORITY]

General:
- based on impact

MANDATORY:
If related to Salary Calculation / Salary Slip:
- Severity: High
- Priority: High

CRITICAL:
If financial impact (increase/decrease/missing salary):
- Severity: Critical
- Priority: High

--------------------------------------------------
[IMPACT RULE]

Explain real impact on:
- payroll accuracy
- financial correctness
- employee records
- HR operations
- approvals/workflow

--------------------------------------------------
[DETAIL EXPANSION]

- Expand intelligently
- Add logical context only
- Do NOT hallucinate

--------------------------------------------------
[OUTPUT - STRICT JSON]

Return ONLY:

{
  "Title": "",
  "Description": "",
  "Steps_to_Reproduce": [],
  "Expected_Result": "",
  "Actual_Result": "",
  "Environment": "",
  "Version": "",
  "Severity": "",
  "Priority": "",
  "Impact": "",
  "Attachments": ""
}

No text before or after JSON.
No markdown.
`;

    const userMessages = messages
      .filter((m) => m && m.role === 'user' && typeof m.content === 'string')
      .map((m) => ({
        role: 'user',
        content: buildUserInstruction(m.content)
      }));

    if (userMessages.length === 0) {
      return jsonResponse({ error: 'No valid user messages provided' }, 400);
    }

    const aiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct-fast`;

    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          ...userMessages
        ],
        max_tokens: 3000,
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) {
      const errorText = await safeReadText(aiResponse);
      return jsonResponse(
        {
          error: 'AI error',
          status: aiResponse.status,
          details: errorText
        },
        aiResponse.status
      );
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData?.result?.response || '';

    const cleanJSON = extractJSONString(rawContent);

    try {
      const parsed = JSON.parse(cleanJSON);
      const normalized = normalizeReport(parsed);
      return jsonResponse({ type: 'json', content: normalized }, 200);
    } catch (parseError) {
      console.error('JSON parse failed:', parseError);

      const fallback = fallbackReportFromText(rawContent);
      return jsonResponse(
        {
          type: 'json',
          content: fallback,
          warning: 'Model did not return perfectly valid JSON. Fallback structure was used.'
        },
        200
      );
    }
  } catch (error) {
    console.error('Internal error:', error);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}

function buildUserInstruction(issueText) {
  return `
Generate a detailed and professional bug report based on the following issue.

Important requirements:
- The report must be rich in useful details.
- Do not make the report too short.
- Expand the Description, Actual Result, and Impact properly.
- Follow the required JSON structure exactly.
- If Environment or Version are not mentioned, keep them as empty strings.
- If the issue is related to salary calculation, salary processing, or salary slip, apply the required Severity/Priority rules.
- If the issue includes a real salary discrepancy or money difference, set Severity to Critical and Priority to High.

Issue details:
${issueText}
`.trim();
}

function extractJSONString(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return '{}';

  const fencedMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = rawContent.indexOf('{');
  const lastBrace = rawContent.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return rawContent.slice(firstBrace, lastBrace + 1).trim();
  }

  return rawContent.trim();
}

function normalizeReport(data) {
  const report = {
    Title: safeString(data.Title),
    Description: safeString(data.Description),
    Steps_to_Reproduce: normalizeSteps(data.Steps_to_Reproduce),
    Expected_Result: safeString(data.Expected_Result),
    Actual_Result: safeString(data.Actual_Result),
    Environment: safeString(data.Environment),
    Version: safeString(data.Version),
    Severity: normalizeSeverity(data.Severity),
    Priority: normalizePriority(data.Priority),
    Impact: safeString(data.Impact),
    Attachments: safeString(data.Attachments)
  };

  return report;
}

function fallbackReportFromText(text) {
  return {
    Title: extractField(text, ['Title']) || 'Bug Report',
    Description: extractField(text, ['Description']) || '',
    Steps_to_Reproduce: extractSteps(text),
    Expected_Result: extractField(text, ['Expected Result', 'Expected_Result']) || '',
    Actual_Result: extractField(text, ['Actual Result', 'Actual_Result']) || '',
    Environment: extractField(text, ['Environment']) || '',
    Version: extractField(text, ['Version']) || '',
    Severity: normalizeSeverity(extractField(text, ['Severity', 'Severity / Priority']) || 'Medium'),
    Priority: normalizePriority(extractField(text, ['Priority']) || 'Medium'),
    Impact: extractField(text, ['Impact']) || '',
    Attachments: extractField(text, ['Attachments']) || ''
  };
}

function extractField(text, fieldNames) {
  if (!text) return null;

  for (const fieldName of fieldNames) {
    const patterns = [
      new RegExp(`\\*\\*${escapeRegExp(fieldName)}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`, 'i'),
      new RegExp(`^${escapeRegExp(fieldName)}:?\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Za-z_ /]+:?\\n?|$)`, 'im'),
      new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"]*)"`, 'i')
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return null;
}

function extractSteps(text) {
  if (!text) return [];

  const stepsBlock =
    extractField(text, ['Steps to Reproduce', 'Steps_to_Reproduce']) || '';

  if (!stepsBlock) return [];

  if (stepsBlock.startsWith('[')) {
    try {
      const parsed = JSON.parse(stepsBlock);
      if (Array.isArray(parsed)) {
        return parsed.map((s) => safeString(s)).filter(Boolean);
      }
    } catch (_) {}
  }

  const numbered = stepsBlock
    .split(/\n?\s*\d+\.\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (numbered.length > 0) return numbered;

  const dashed = stepsBlock
    .split(/\n-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (dashed.length > 0) return dashed;

  return [stepsBlock.trim()].filter(Boolean);
}

function normalizeSteps(steps) {
  if (Array.isArray(steps)) {
    return steps.map((s) => safeString(s)).filter(Boolean);
  }

  if (typeof steps === 'string' && steps.trim()) {
    return steps
      .split(/\n?\s*\d+\.\s+|\n-\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeSeverity(value) {
  const v = safeString(value).toLowerCase();
  if (v === 'critical') return 'Critical';
  if (v === 'high') return 'High';
  if (v === 'medium') return 'Medium';
  if (v === 'low') return 'Low';
  return 'Medium';
}

function normalizePriority(value) {
  const v = safeString(value).toLowerCase();
  if (v === 'high') return 'High';
  if (v === 'medium') return 'Medium';
  if (v === 'low') return 'Low';
  return 'Medium';
}

function safeString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
