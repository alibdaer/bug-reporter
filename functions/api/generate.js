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
    const currentReport =
      body.currentReport && typeof body.currentReport === 'object'
        ? body.currentReport
        : null;

    if (!messages.length) {
      return jsonResponse({ error: 'No valid user messages provided' }, 400);
    }

    const latestUserRequest = safeString(messages[messages.length - 1]?.content || '');
    const isRevision = !!currentReport;

    const systemPrompt = `You are a Senior QA/QC Engineer (15+ years) specialized in HR & Payroll systems (Menaitech HRMS).
Your ONLY task is to generate or update professional Bug Reports in English.

--------------------------------------------------
[STRICT ROLE - VERY IMPORTANT]
- Your role is strictly limited to Bug Reports only.
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
- be clear, easy to understand, and logically structured
- avoid overly long paragraphs
- avoid unnecessary repetition
- avoid generic or vague wording
- aim for a balanced length (typically 2–4 well-formed sentences)

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
- MenaME Mobile
- MenaME Web

Also handle technical issues:
- validation
- calculation errors
- permissions
- data mismatch
- system errors

--------------------------------------------------
[MENATECH NAVIGATION RULES - VERY IMPORTANT]
When writing Steps to Reproduce, use Menaitech-specific navigation behavior and NEVER invent generic modules or screens.

Tab opening rules:
- If the issue is related to payroll, salary calculation, salary slip, financial transactions, allowances, deductions, overtime, social security, insurance, net salary, or any employee financial matter → the first step should usually be: "Open the MenaPAY tab."
- If the issue is related to employee appraisal, performance evaluation, career path, certificates, vacancy, recruitment-related employee evaluation flows, or similar HR evaluation processes → the first step should usually be: "Open the MenaHR tab."
- If the issue is related to the mobile app version → the first step should usually be: "Open MenaME application."
- If the issue is related to MenaME web → the first step should usually be: "Open the MenaME Web."

STRICT RULES:
- Do NOT write generic steps like "Log in to the HRMS system as an administrator" unless the user explicitly mentioned login/authentication as part of the issue.
- Do NOT add "as an administrator" unless the user explicitly mentioned that role.
- Do NOT invent module names such as "Employee Management module" unless the user explicitly provided that exact screen/module name.
- Do NOT invent screen names, buttons, or paths that are not explicitly mentioned or strongly implied by the scenario.
- If employee code is provided, use it only as test data or credential context when relevant, but do NOT invent where it was entered unless the screen is clearly known from the user input.
- If the user gives credentials or slash-formatted data such as employee code / password / version, infer them carefully as test data when strongly implied, but do NOT force the exact format in the report.
- Different user formats may represent employee code, password, version, or environment. Interpret them contextually and conservatively.

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
- include system responses when relevant
- stay concise and logical
- avoid unnecessary or repetitive micro-steps
- include only the minimum logical steps needed to reproduce the issue accurately
- usually be around 3-6 steps unless the scenario clearly requires more
- never expand obvious actions into too many tiny steps

If values are given (salary, allowance, overtime, leave) → include them.

--------------------------------------------------
[STEPS PRECISION RULES - STRICT]
Steps to Reproduce must reflect the actual business flow only.

- Do NOT invent fake screens, fake modules, or fake buttons.
- Do NOT write "Navigate to the Employee Management module" unless the user explicitly mentioned that exact module.
- Do NOT write "Click on the 'Salary Calculation' button" unless the user explicitly mentioned such a button exists.
- For salary calculation scenarios, prefer natural business wording such as:
  - "Open the MenaPAY tab."
  - "Go to Salary Calculation."
  - "Calculate salary for month X."
- If a month is mentioned, include it exactly.
- If an employee code is provided, include it only where logically relevant, without inventing unsupported screen names.
- Use the minimum number of realistic steps needed to reproduce the issue.
- Avoid over-explaining obvious actions.
- Avoid technical assumptions not explicitly supported by the user input.

--------------------------------------------------
[DATA RULE]
- Include only data provided by the user.
- Do NOT invent employee info.
- Do NOT force Employee Name or Code.
- If scenario includes creating employee → include given setup details only.

--------------------------------------------------
[TEST DATA INTERPRETATION RULES]
Users may provide compact internal QA test data in multiple formats.
Examples may include employee code, password, environment, patch version, or other internal reference values.

Rules:
- Interpret compact QA data conservatively and contextually.
- Do NOT assume one rigid format.
- If the meaning is reasonably clear from context, use the values appropriately in the report.
- If the values appear to represent employee code / password / version / environment, incorporate them only where relevant.
- Do NOT expose unnecessary credentials in the bug report unless they are needed for reproduction.
- Prefer using such values in Preconditions, Environment, Version, or Steps only when clearly relevant.

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
Allowed Severity values:
- Critical
- High
- Medium
- Low

Allowed Priority values:
- Urgent
- High
- Medium
- Low

General rules:
- Assign based on business impact and urgency.
- If the issue involves Salary Calculation or Salary Slip → Severity: High, Priority: High
- If the issue causes financial discrepancy (wrong salary, extra amount, missing amount, incorrect net salary) → Severity: Critical, Priority: Urgent
- Do NOT change Severity unless the user explicitly asks to change Severity during a revision.
- Do NOT change Priority unless the user explicitly asks to change Priority during a revision.

--------------------------------------------------
[REVISION RULES - VERY IMPORTANT]
If the user asks to modify, refine, shorten, rewrite, add, remove, or correct a specific part of the current bug report:
- You MUST treat the existing report as the base version.
- You MUST update ONLY the requested field or section.
- You MUST keep all other fields unchanged.
- You MUST NOT rewrite, improve, shorten, expand, or reformat any field unless the user explicitly asked for that.
- If a field is not explicitly mentioned in the user's request, it MUST remain unchanged.
- Return the FULL bug report JSON after applying the requested change.
- Minimal change only.
- Do NOT regenerate the report from scratch when a current report is provided.
- Do NOT change Severity unless the user explicitly asks to change Severity.
- Do NOT change Priority unless the user explicitly asks to change Priority.
- Do NOT change Steps unless the user explicitly asks to change Steps or the requested change directly targets them.
- Do NOT change Description unless the user explicitly asks to change Description or the requested change directly targets it.
- Do NOT change Title unless the user explicitly asks to change Title.
- Do NOT remove details unless the user explicitly asks to shorten, simplify, or remove them.
- If the user asks to add something, add it only in the relevant field(s), without rewriting unrelated fields.
- If the user asks to fix grammar in one section, fix grammar in that section only.

Additional strict revision behavior:
- If the user requests a change in any specific field, update that field only.
- The rest of the report must remain exactly unchanged, including wording, order, and content.
- This rule applies to ALL fields, not only Severity or Priority.

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
No extra text.`;

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
        temperature: 0.05
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

    let normalized;

    try {
      const parsed = JSON.parse(cleanJSON);
      normalized = normalizeReport(parsed);
    } catch (parseError) {
      console.error('JSON parse failed:', parseError);
      normalized = fallbackReportFromText(rawContent);
    }

    // Enforce surgical updates on top of the current report when this is a revision.
    if (isRevision) {
      normalized = preserveUnrequestedFields(
        normalizeReport(currentReport),
        normalized,
        latestUserRequest
      );
    }

    // Optional direct override for explicitly requested severity/priority values.
    normalized = applyExplicitFieldOverrides(normalized, latestUserRequest);

    const assistantMessage = isRevision
      ? 'I updated the report based on your latest request.'
      : 'Here is your bug report.';

    return jsonResponse(
      {
        type: 'json',
        content: normalized,
        message: assistantMessage
      },
      200
    );
  } catch (error) {
    console.error('Internal error:', error);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}

function buildModelMessages(messages, currentReport) {
  const sanitizedMessages = messages
    .filter(
      (message) =>
        message &&
        typeof message.content === 'string' &&
        ['user', 'assistant'].includes(message.role)
    )
    .map((message, index, array) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: 'Report delivered.'
        };
      }

      const isLatest = index === array.length - 1;
      const userText = message.content.trim();

      if (!isLatest) {
        return {
          role: 'user',
          content: buildHistoricalUserInstruction(userText)
        };
      }

      return {
        role: 'user',
        content: currentReport
          ? buildRevisionUserInstruction(userText, currentReport)
          : buildInitialUserInstruction(userText)
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
- Steps must be clear, logically ordered, concise, and only as many as needed to reproduce the issue accurately.
- Prefer concise steps. Avoid over-expanding obvious micro-actions.
- Include navigation path and values only when they are relevant and actually provided.
Severity & Priority rules:
- If the issue involves Salary Calculation, salary processing, or Salary Slip → Severity = High, Priority = High.
- If the issue causes any financial discrepancy (increase, decrease, missing salary, wrong amount) → Severity = Critical, Priority = High.
Focus areas:
- HR / Payroll context including but not limited to: Leaves, Vacations, Overtime, Allowances, Deductions, Social Security, Health Insurance, and any other related HR or payroll operations
- Workflow processes including but not limited to: requests, approvals, manager actions, and other workflow-related scenarios
- System modules only if explicitly mentioned by the user (do not assume system names)
- Technical issues including but not limited to: validation, calculation, permissions, data mismatch, system errors, and any other related system or logic issues

Issue details:
${issueText}`;
}

function buildInitialUserInstruction(issueText) {
  return buildHistoricalUserInstruction(issueText);
}

function buildRevisionUserInstruction(requestText, currentReport) {
  return `You previously generated a bug report.

Now update the SAME report according to the user's latest request.

STRICT UPDATE RULES:
- The current report is the base version.
- Apply minimal changes only.
- Update ONLY the explicitly requested field or section.
- Keep every other field EXACTLY unchanged.
- Do NOT regenerate the report from scratch.
- Do NOT rewrite unrelated fields.
- Do NOT improve unrelated wording.
- Do NOT adjust Severity unless explicitly requested.
- Do NOT adjust Priority unless explicitly requested.
- Do NOT modify Steps unless explicitly requested.
- Do NOT modify Title, Description, Expected Result, Actual Result, Environment, Version, Impact, or Attachments unless explicitly requested.
- Preserve wording and structure of all untouched fields exactly as-is.
- Return the full updated bug report in the exact JSON structure only.

Current report JSON:
${JSON.stringify(normalizeReport(currentReport), null, 2)}

Latest user request:
${requestText}`;
}

function preserveUnrequestedFields(currentReport, updatedReport, latestUserRequest) {
  const base = normalizeReport(currentReport);
  const proposed = normalizeReport(updatedReport);
  const request = safeString(latestUserRequest).toLowerCase();

  const fieldMatchers = {
    Title: /\btitle\b/,
    Description: /\bdescription\b|\bdesc\b/,
    Steps_to_Reproduce:
      /\bsteps?\b|\breproduce\b|\breproduction\b|\bsteps to reproduce\b/,
    Expected_Result: /\bexpected\b|\bexpected result\b/,
    Actual_Result: /\bactual\b|\bactual result\b/,
    Environment: /\benvironment\b|\benv\b/,
    Version: /\bversion\b/,
    Severity: /\bseverity\b/,
    Priority: /\bpriority\b/,
    Impact: /\bimpact\b|\bbusiness impact\b/,
    Attachments: /\battachment\b|\battachments\b|\bscreenshot\b|\bvideo\b|\bfile\b/
  };

  const broadRewriteRequest =
    /\b(rewrite|regenerate|improve the report|improve all|rewrite all|rewrite report|revise the report|update the report|refine the report|make it better|rephrase the report)\b/.test(
      request
    ) && !hasSpecificFieldMention(request, fieldMatchers);

  const addGeneralInfo =
    /\b(add|include)\b/.test(request) && !hasSpecificFieldMention(request, fieldMatchers);

  if (broadRewriteRequest || addGeneralInfo) {
    return proposed;
  }

  const allowedFields = new Set();

  for (const [fieldName, pattern] of Object.entries(fieldMatchers)) {
    if (pattern.test(request)) {
      allowedFields.add(fieldName);
    }
  }

  // Heuristics: some requests imply a target field even without naming it directly.
  if (/\bgrammar\b|\btypo\b|\bwording\b/.test(request)) {
    if (!allowedFields.size) {
      allowedFields.add('Description');
    }
  }

  if (/\bshorten\b|\bsimplify\b|\bmake it shorter\b/.test(request)) {
    if (!allowedFields.size) {
      allowedFields.add('Description');
    }
  }

  if (/\badd\b/.test(request) && /\bstep\b/.test(request)) {
    allowedFields.add('Steps_to_Reproduce');
  }

  if (/\bremove\b/.test(request) && /\bstep\b/.test(request)) {
    allowedFields.add('Steps_to_Reproduce');
  }

  // If no specific target field is recognized, allow the model output as-is.
  if (!allowedFields.size) {
    return proposed;
  }

  const result = { ...base };

  for (const fieldName of allowedFields) {
    result[fieldName] = proposed[fieldName];
  }

  return normalizeReport(result);
}

function hasSpecificFieldMention(request, fieldMatchers) {
  return Object.values(fieldMatchers).some((pattern) => pattern.test(request));
}

function applyExplicitFieldOverrides(report, latestUserRequest) {
  const updated = normalizeReport(report);
  const request = safeString(latestUserRequest).toLowerCase();

  const severityMatch =
    request.match(
      /(?:change|update|set|make|adjust)\s+(?:the\s+)?severity\s+(?:to|as)?\s*(critical|high|medium|low)/i
    ) ||
    request.match(/severity\s*(?:to|as|=|becomes?)\s*(critical|high|medium|low)/i);

  const priorityMatch =
    request.match(
      /(?:change|update|set|make|adjust)\s+(?:the\s+)?priority\s+(?:to|as)?\s*(urgent|high|medium|low)/i
    ) ||
    request.match(/priority\s*(?:to|as|=|becomes?)\s*(urgent|high|medium|low)/i);

  if (severityMatch?.[1]) {
    updated.Severity = normalizeSeverity(severityMatch[1]);
  }

  if (priorityMatch?.[1]) {
    updated.Priority = normalizePriority(priorityMatch[1]);
  }

  return updated;
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
    Title: safeString(data?.Title),
    Description: safeString(data?.Description),
    Steps_to_Reproduce: normalizeSteps(data?.Steps_to_Reproduce),
    Expected_Result: safeString(data?.Expected_Result),
    Actual_Result: safeString(data?.Actual_Result),
    Environment: safeString(data?.Environment),
    Version: safeString(data?.Version),
    Severity: normalizeSeverity(data?.Severity),
    Priority: normalizePriority(data?.Priority),
    Impact: safeString(data?.Impact),
    Attachments: normalizeAttachments(data?.Attachments)
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
    Severity: normalizeSeverity(
      extractField(text, ['Severity', 'Severity / Priority']) || 'Medium'
    ),
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
          return safeString(
            step.step ||
              step.description ||
              step.text ||
              step.content ||
              JSON.stringify(step)
          );
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
  if (normalized === 'urgent') return 'Urgent';
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