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
    const currentReport = body.currentReport && typeof body.currentReport === 'object' ? body.currentReport : null;

    if (!messages.length) {
      return jsonResponse({ error: 'No valid user messages provided' }, 400);
    }

    const systemPrompt = ` You are a Senior QA/QC Engineer (15+ years) specialized in HR & Payroll systems (Menaitech HRMS).
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
[WRITING STYLE - BALANCED DETAIL]
- Write in a clear, professional, and well-structured manner.
- The report must be detailed enough to fully explain the issue, but not unnecessarily long.
- Avoid overly short responses and avoid excessive verbosity.
- Focus on clarity, relevance, and readability.
- Each section should contain meaningful information without repetition or filler.
- Prefer concise explanations that fully deliver the idea.
--------------------------------------------------
[DESCRIPTION RULE - BALANCED]
The Description must:
- clearly explain where the issue occurred (module/screen/system if provided)
- describe what the user was trying to do
- explain the business process involved
- describe what went wrong
- The description should be:
- clear and easy to understand
- logically structured
- focused on the issue
- Avoid:
- overly long paragraphs
- unnecessary repetition
- generic or vague wording
- Aim for a balanced length (typically 2–4 well-formed sentences).
--------------------------------------------------
[DETAIL RULE]
The report should include, when available or clearly implied:
- where the issue occurred (module / screen / system if provided)
- what the user was trying to do
- the relevant business context (HR / payroll process)
- any important conditions before the issue
- why the issue matters
- Do not force missing details.
- Do not assume or invent information.
- Add context only when it improves clarity.
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
`;

    const preparedMessages = buildModelMessages(messages, currentReport);
    const aiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.1-8b-instruct-fast`;

    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{ role: 'system', content: systemPrompt }, ...preparedMessages],
        max_tokens: 3000,
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) {
      const errorText = await safeReadText(aiResponse);
      return jsonResponse(
        { error: 'AI error', status: aiResponse.status, details: errorText },
        aiResponse.status
      );
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData?.result?.response || '';
    const cleanJSON = extractJSONString(rawContent);

    try {
      const parsed = JSON.parse(cleanJSON);
      const normalized = normalizeReport(parsed);
      const assistantMessage = currentReport
        ? 'I updated the report based on your latest request.'
        : 'Here is your bug report.';
      return jsonResponse({ type: 'json', content: normalized, message: assistantMessage }, 200);
    } catch (parseError) {
      console.error('JSON parse failed:', parseError);
      const fallback = fallbackReportFromText(rawContent);
      return jsonResponse(
        {
          type: 'json',
          content: fallback,
          message: currentReport
            ? 'I updated the report based on your latest request.'
            : 'Here is your bug report.',
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

function buildModelMessages(messages, currentReport) {
  const sanitizedMessages = messages
    .filter((message) => message && typeof message.content === 'string' && ['user', 'assistant'].includes(message.role))
    .map((message, index, array) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: 'Report delivered.'
        };
      }

      const isLatest = index === array.length - 1;
      const previousUserText = message.content.trim();

      if (!isLatest) {
        return {
          role: 'user',
          content: buildHistoricalUserInstruction(previousUserText)
        };
      }

      return {
        role: 'user',
        content: currentReport
          ? buildRevisionUserInstruction(previousUserText, currentReport)
          : buildInitialUserInstruction(previousUserText)
      };
    });

  return sanitizedMessages;
}

function buildHistoricalUserInstruction(issueText) {
  return `Generate a highly detailed and professional bug report based on the issue below.
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
- HR / Payroll context including but not limited to: Leaves, Vacations, Overtime, Allowances, Deductions, Social Security, Health Insurance, and any other related HR or payroll operations
- Workflow processes including but not limited to: requests, approvals, manager actions, and other workflow-related scenarios
- System modules only if explicitly mentioned by the user (do not assume system names)
- Technical issues including but not limited to: validation, calculation, permissions, data mismatch, system errors, and any other related system or logic issues
Issue details: ${issueText}`;
}

function buildInitialUserInstruction(issueText) {
  return buildHistoricalUserInstruction(issueText);
}

function buildRevisionUserInstruction(requestText, currentReport) {
  return `You previously generated a bug report.
Now update the SAME report according to the user's latest request.
Important requirements:
- Return the full updated bug report only in the exact JSON structure defined in the system instructions.
- Keep all valid information from the current report unless the user clearly requests changing it.
- Apply the latest user request as an edit, refinement, addition, rewrite, or correction to the current report.
- Do NOT remove details unless the user asks to shorten, simplify, or delete them.
- Do NOT invent missing facts.
- If the user requests stronger wording, improve the wording professionally without adding fake data.
- If the user requests a new section detail, update the relevant fields while keeping consistency across the whole report.
- Steps must remain clear, ordered, and aligned with the latest request.
- Preserve severity and priority rules from the system instructions.
Current report JSON:
${JSON.stringify(normalizeReport(currentReport), null, 2)}
Latest user request:
${requestText}`;
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
  return {
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
    Attachments: normalizeAttachments(data.Attachments)
  };
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
    Attachments: normalizeAttachments(extractField(text, ['Attachments']) || '')
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

  const stepsBlock = extractField(text, ['Steps to Reproduce', 'Steps_to_Reproduce']) || '';
  if (!stepsBlock) return [];

  if (stepsBlock.startsWith('[')) {
    try {
      const parsed = JSON.parse(stepsBlock);
      if (Array.isArray(parsed)) {
        return parsed.map((step) => safeString(step)).filter(Boolean);
      }
    } catch (_) {
      // ignore
    }
  }

  const numbered = stepsBlock
    .split(/\n?\s*\d+\.\s+/)
    .map((step) => step.trim())
    .filter(Boolean);

  if (numbered.length) return numbered;

  const dashed = stepsBlock
    .split(/\n-\s+/)
    .map((step) => step.trim())
    .filter(Boolean);

  if (dashed.length) return dashed;

  return [stepsBlock.trim()].filter(Boolean);
}

function normalizeSteps(steps) {
  if (Array.isArray(steps)) {
    return steps
      .map((step) => {
        if (typeof step === 'object' && step !== null) {
          return safeString(step.step || step.description || step.text || step.content || JSON.stringify(step));
        }
        return safeString(step);
      })
      .filter(Boolean);
  }

  if (typeof steps === 'string' && steps.trim()) {
    return steps
      .split(/\n?\s*\d+\.\s+|\n-\s+/)
      .map((step) => step.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeAttachments(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeString(item)).filter(Boolean);
  }

  return safeString(value);
}

function normalizeSeverity(value) {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'critical') return 'Critical';
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
  return 'Medium';
}

function normalizePriority(value) {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'high') return 'High';
  if (normalized === 'medium') return 'Medium';
  if (normalized === 'low') return 'Low';
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
