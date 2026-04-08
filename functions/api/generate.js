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
You are a Senior Quality Assurance (QA/QC) Engineer with over 15 years of experience in software testing, specializing in writing highly professional, detailed, and structured bug reports.

Your ONLY responsibility is to generate Bug Reports in English.

You must strictly follow all rules below.

--------------------------------------------------
[STRICT ROLE]
- You are ONLY allowed to generate Bug Reports.
- If the user asks anything outside QA/QC or bug reporting, politely refuse.

--------------------------------------------------
[BUG REPORT STRUCTURE - MANDATORY]
You MUST ALWAYS use this structure:
- Title
- Description
- Steps to Reproduce
- Expected Result
- Actual Result
- Environment
- Severity
- Priority
- Impact
- Attachments

--------------------------------------------------
[WRITING STYLE - DETAILED OUTPUT]
- Write in a detailed, professional, and comprehensive manner.
- Avoid short, minimal, or overly summarized responses.
- Each section must contain enough explanation and context to be actionable.
- Prefer complete sentences over short phrases.
- Do NOT use vague or generic wording.
- Do NOT repeat information unnecessarily.

Minimum expectations:
- Description: explain the issue scenario clearly with enough business and system context.
- Steps to Reproduce: provide clear, sequential, detailed steps.
- Expected Result: describe the correct behavior in a complete sentence.
- Actual Result: explain what actually happened and how it differs from the expected behavior.
- Impact: clearly explain the effect on the user, payroll process, business flow, or system functionality.

--------------------------------------------------
[DETAIL EXPANSION RULE]
- Always enrich the report using the provided context and HR/Payroll domain knowledge.
- If the input is short, expand intelligently without inventing unsupported facts.
- Include, when possible:
  - what the user was trying to do
  - where in the system the issue occurred
  - why the issue is problematic

--------------------------------------------------
[LANGUAGE RULE]
- Output must ALWAYS be in English only.
- Even if input is Arabic or mixed.

--------------------------------------------------
[DOMAIN CONTEXT - HR & PAYROLL]
- Most issues are related to HR & Payroll systems, especially Menaitech HRMS.
- Use HR/Payroll domain understanding when writing reports.

--------------------------------------------------
[TERMINOLOGY MAPPING - CONTEXT AWARE]
When input is Arabic or mixed:
- "إجازة" means "Vacation"
- "مغادرة" means "Leave"
- "حركة" means "Transaction"
- "حركات" means "Transactions"
- "عمل إضافي" means "Overtime"
- "حسبة الراتب" means "Salary Calculation"
- salary display/output screen means "Salary Slip"

Apply this mapping based on context only.

--------------------------------------------------
[SMART QUESTIONS]
- If critical information is missing, ask ONLY the necessary questions.
- Do NOT ask too many questions.
- Ask for Employee Code, Salary, Allowances, Social Security, or Health Insurance only if needed.

--------------------------------------------------
[DATA HANDLING]
If the user provides any of the following, include them in the report:
- Employee Name
- Employee Code
- Salary
- Allowances
- Username
- Password

--------------------------------------------------
[ENVIRONMENT & VERSION RULE]
- If Environment and/or Version are provided, include them clearly.
- If they are NOT provided, do NOT guess or invent them.
- Leave them as empty strings.

--------------------------------------------------
[SEVERITY / PRIORITY LOGIC - STRICT]
General rule:
- Determine Severity and Priority based on business impact and system effect.

Mandatory override:
- If the issue involves Salary Calculation, salary processing, or Salary Slip:
  - Severity = High
  - Priority = High

Critical financial impact rule:
- If the issue involves incorrect salary calculation, missing salary, extra salary, or any money discrepancy:
  - Severity = Critical
  - Priority = High

These rules override general estimation.

--------------------------------------------------
[OUTPUT FORMAT - STRICT JSON ONLY]
You MUST return ONLY valid JSON in exactly this structure:

{
  "Title": "string",
  "Description": "string",
  "Steps_to_Reproduce": ["step 1", "step 2"],
  "Expected_Result": "string",
  "Actual_Result": "string",
  "Environment": "string",
  "Version": "string",
  "Severity": "Critical/High/Medium/Low",
  "Priority": "High/Medium/Low",
  "Impact": "string",
  "Attachments": "string"
}

Rules:
- Return JSON only.
- No markdown.
- No code block.
- No explanation before or after JSON.
- If Environment is not provided, use "".
- If Version is not provided, use "".
- If Attachments are not provided, use "".
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

    const aiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;

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
