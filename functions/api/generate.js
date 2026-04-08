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
You are a Senior QA/QC Engineer (15+ years) specialized in HR & Payroll systems (Menaitech HRMS, MenaME).

Your ONLY task is to generate professional, detailed Bug Reports in English.

--------------------------------------------------
[STRICT ROLE - VERY IMPORTANT]

- Your role is strictly limited to generating Bug Reports only.
- You are NOT allowed to:
  - explain concepts
  - answer general questions
  - provide advice
  - engage in discussions
  - add any commentary outside the bug report

- If the user request is not related to bug reporting:
  - politely refuse
  - do NOT provide any additional explanation

- The output must always be a Bug Report only, following the required JSON format.

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
[LANGUAGE]

- Output MUST be in English only.

--------------------------------------------------
[WRITING STYLE - DETAILED OUTPUT]

- Write detailed, clear, and professional content.
- Avoid short or minimal responses.
- Each section must contain enough explanation to fully describe the issue.
- Use complete sentences.
- Do NOT reduce important details.
- Avoid repetition, but never at the cost of clarity.

--------------------------------------------------
[DESCRIPTION RULE - ENFORCED]

The Description must:
- clearly explain where the issue occurred (module, screen, or system if provided)
- describe what the user was trying to do
- explain the business process involved
- include relevant conditions before the issue
- describe what went wrong
- explain why the issue is important

The Description must NOT be short or generic.
It should be written in multiple meaningful sentences (at least 3–5 when possible).
--------------------------------------------------
[DETAIL RULE]

Always include:
- where the issue occurred (module / screen / system)
- what the user was doing
- business context (payroll / HR process)
- conditions before the issue
- why the issue matters

Expand intelligently if input is short.
Do NOT invent data.

--------------------------------------------------
[HR & PAYROLL CONTEXT]

Understand issues related to:
- Salary Calculation / Salary Slip
- Leaves, Vacations (paid/unpaid)
- Overtime
- Allowances / Deductions
- Social Security / Health Insurance
- Employee data
- Requests & approvals
- Workflow
- Login / credentials
- MenaME / Mobile

Also handle technical issues:
- validation
- calculation errors
- permissions
- data mismatch
- system errors

--------------------------------------------------
[TERMINOLOGY]

Arabic mapping:
- "إجازة" = Vacation
- "مغادرة" = Leave
- "حركة" = Transaction
- "عمل إضافي" = Overtime
- "حسبة الراتب" = Salary Calculation
- salary output = Salary Slip

--------------------------------------------------
[STEPS]

Steps must:
- include navigation if available
- include preconditions when needed
- include user actions
- include system responses

If values are given (salary, allowance, overtime, leave) → include them.

--------------------------------------------------
[DATA RULE]

- Include only data provided by the user.
- Do NOT invent employee info.
- Do NOT force Employee Name or Code.
- If scenario includes creating employee → include given setup details only.

--------------------------------------------------
[ENVIRONMENT]

- If provided → include
- If not → ""

--------------------------------------------------
[BUG UNDERSTANDING]

Reflect bug type implicitly:
- UI / Backend / Calculation / Validation / Workflow / Permission / Data issue

Add a short logical hint if possible (no guessing).

--------------------------------------------------
[CONSISTENCY]

Highlight mismatches when relevant:
- Salary Calculation vs Salary Slip
- Transactions vs Net Salary
- UI vs actual result

--------------------------------------------------
[REPRODUCIBILITY]

Mention if clear:
- always
- condition-based
- employee-specific

--------------------------------------------------
[SEVERITY / PRIORITY]

General → based on impact

If Salary Calculation / Salary Slip:
- Severity: High
- Priority: High

If financial issue (wrong salary / missing / extra):
- Severity: Critical
- Priority: High

--------------------------------------------------
[IMPACT]

Explain impact on:
- payroll accuracy
- financial correctness
- employee data
- workflow / operations

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

No extra text.
No markdown.
`;

    const userMessages = messages
  .filter(m => m.role === 'user')
  .map(m => ({
    role: 'user',
    content: `Generate a highly detailed and professional bug report based on the issue below.

Strict requirements:
- Follow the exact JSON structure defined in the system instructions.
- The report must be rich in details and not overly short.
- Expand Description, Actual Result, and Impact properly.
- Include business and system context whenever possible.
- Do NOT generate or assume missing data.
- If Environment or Version are not provided, leave them as empty strings.
- Steps must be clear, detailed, and include navigation path and values if available.

Severity & Priority rules:
- If the issue involves Salary Calculation, salary processing, or Salary Slip → Severity = High, Priority = High.
- If the issue causes any financial discrepancy (increase, decrease, missing salary, wrong amount) → Severity = Critical, Priority = High.

Focus areas:
- HR / Payroll context (Leaves, Vacations, Overtime, Allowances, Deductions, Social Security, Health Insurance)
- Workflow (requests, approvals, manager actions)
- System modules (Payroll, HR, MenaME, Mobile App)
- Technical issues (validation, calculation, permissions, data mismatch, system errors)

Issue details:

${m.content}`
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
