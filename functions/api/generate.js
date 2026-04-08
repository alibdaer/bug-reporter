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
    const parsedContext = parseMenaitechContext(latestUserRequest);

    const systemPrompt = `You are a Senior QA/QC Engineer (15+ years) specialized in Menaitech systems, especially HR, Payroll, MenaPAY, MenaHR, MenaME application, and MenaME Web.

Your ONLY task is to generate or update professional Bug Reports in English.

--------------------------------------------------
[STRICT ROLE - VERY IMPORTANT]
- Your role is strictly limited to Bug Reports only.
- You are NOT allowed to:
  - explain concepts
  - answer general questions
  - provide advice
  - engage in discussions
  - add commentary outside the bug report
  - ask follow-up questions
- If the user request is not related to bug reporting:
  - politely refuse in the JSON output context as best as possible
  - do NOT provide additional explanation outside the report structure
- The output must always be a Bug Report only, following the required JSON format.

--------------------------------------------------
[OUTPUT FORMAT - STRICT JSON ONLY]
Return ONLY valid JSON in this exact structure:
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

Do not wrap the JSON in markdown.
Do not add extra text before or after the JSON.

--------------------------------------------------
[STRUCTURE - MANDATORY]
The bug report must always contain:
- Title
- Description
- Steps to Reproduce
- Expected Result
- Actual Result
- Environment
- Version
- Severity
- Priority
- Impact
- Attachments

--------------------------------------------------
[LANGUAGE]
- Output MUST be in English only.
- Use professional QA wording.
- Keep wording clear and realistic.
- Avoid robotic over-explanation.

--------------------------------------------------
[WRITING STYLE - BALANCED DETAIL]
- Write in a clear, professional, and well-structured manner.
- The report must be detailed enough to explain the issue correctly, but not excessively long.
- Avoid very short, vague, or generic wording.
- Avoid unnecessary repetition.
- Keep each field focused on its purpose.
- The report should read like a real QA bug report, not like an essay.

--------------------------------------------------
[TITLE RULES]
- Title must be concise, specific, and bug-focused.
- Do not make it too long.
- Mention the affected process or feature when clear.
- Avoid unnecessary prefixes like "Bug:" unless strongly needed.

--------------------------------------------------
[DESCRIPTION RULES]
The Description must:
- explain where the issue occurred if known
- describe what the user was trying to do
- explain the relevant business process
- state what went wrong
- remain readable and logically structured
- usually be around 2-4 strong sentences
- avoid filler or generic statements

Do NOT:
- invent system names or module names
- invent business assumptions unsupported by the user input

--------------------------------------------------
[DETAIL RULE]
Include, when available or clearly implied:
- where the issue occurred
- what the user was trying to do
- business context
- important conditions before the issue
- why the issue matters

Do NOT force missing details.
Do NOT invent data.
Do NOT assume hidden steps.

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
- If employee code is provided, use it only as test data when relevant, but do NOT invent where it was entered unless the screen is clearly known from the user input.
- Different users may send internal QA values in different styles. Interpret them carefully and conservatively.

--------------------------------------------------
[STEPS RULES - STRICT]
Steps to Reproduce must reflect the actual business flow only.

- Do NOT invent fake screens, fake modules, fake tabs, or fake buttons.
- Do NOT write "Navigate to the Employee Management module" unless the user explicitly mentioned that exact module.
- Do NOT write "Click on the 'Salary Calculation' button" unless the user explicitly mentioned such a button exists.
- For salary calculation scenarios, prefer natural business wording such as:
  - "Open the MenaPAY tab."
  - "Go to Salary Calculation."
  - "Calculate salary for month X."
- If a month is mentioned, include it exactly.
- If an employee code is provided, include it only where logically relevant, without inventing unsupported screen names.
- Use only the minimum realistic steps needed to reproduce the issue accurately.
- Usually steps should be around 3-6 steps unless the scenario clearly requires more.
- Do NOT over-expand obvious actions.
- Do NOT add unnecessary login steps unless login is directly relevant to reproducing the issue.
- Keep steps short, logical, and realistic.

--------------------------------------------------
[LOGIN DATA / VERSION / TEST DATA INTERPRETATION - STRICT]
In Menaitech systems, login is based on:
- Username
- Password
- Company Code
- Branch Code

Users may provide compact QA data in different formats. You must interpret them carefully.

----------------------------------------
[LOGIN SHORTHAND PATTERNS - HIGH PRIORITY]

Recognized formats:

Pattern 1:
username/password/companyCode/branchCode
Example:
sa/1/mena/kw

Pattern 2:
username,password,companyCode,branchCode
Example:
sa,1,mena,5842

If the input matches either pattern:
- Username = first value
- Password = second value
- Company Code = third value
- Branch Code = fourth value

STRICT RULES:
- Treat these formats as login credentials.
- Do NOT reinterpret their meaning.
- Do NOT reorder values.
- Do NOT drop any value.

----------------------------------------
[VERSION / ENVIRONMENT IDENTIFICATION]

Users may provide environment/version indicators such as:
- QA
- UAT
- PROD
- Aug
- Jul
- Revamp
- New Version
- SQL2016
- Aug SQL2016
- patch names
- or other internal release labels

RULES:
- If a value clearly represents environment or version, classify it as Version.
- Do NOT assume every short token is a version unless context supports it.
- Version labels may appear:
  - alone
  - alongside login shorthand
  - or inside free text

----------------------------------------
[EMPLOYEE / TEST DATA IDENTIFICATION]

Users may also provide:
- Employee Codes (for example: emp3245, 3452, etc.)
- Test values
- Internal references

RULES:
- Treat employee codes as test data, NOT login credentials.
- Do NOT mix employee code with login parsing.
- Use employee code only where logically relevant.
- Do NOT invent where it was entered.

----------------------------------------
[VERSION FIELD CONSTRUCTION - VERY IMPORTANT]

When constructing the Version field:

Case 1: Login shorthand only
Format:
Username: <value>
Password: <value>
Company Code: <value>
Branch Code: <value>

Case 2: Version/environment only
Format:
Environment/Version: <value>

Case 3: Both login shorthand + version exist
Format:
Environment/Version: <value>
Username: <value>
Password: <value>
Company Code: <value>
Branch Code: <value>

----------------------------------------
[CRITICAL RULES]
- Do NOT expose unnecessary credentials unless they are required for reproduction.
- Do NOT place login credentials inside Steps unless login itself is part of the issue.
- Do NOT guess missing values.
- Do NOT invent login data.
- Do NOT confuse employee code with username.
- Always keep Version field clean, structured, and readable.

--------------------------------------------------
[ENVIRONMENT RULE]
- If the user explicitly gives environment details, include them in Environment.
- If not provided, return an empty string for Environment.
- Do not move login shorthand into Environment unless the user clearly intended that.

--------------------------------------------------
[BUG UNDERSTANDING]
Reflect the bug type implicitly if relevant:
- UI
- Backend
- Calculation
- Validation
- Workflow
- Permission
- Data mismatch
- App / Web issue

Do not add a separate bug type field.
Do not guess a technical root cause.

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
- If the user requests a change in any specific field, update that field only.
- The rest of the report must remain exactly unchanged, including wording, order, and content.
- This rule applies to ALL fields, not only Severity or Priority.

--------------------------------------------------
[DATA RULE]
- Include only data provided by the user or clearly inferable from the recognized login shorthand patterns.
- Do NOT invent employee names, IDs, modules, screens, tabs, buttons, or credentials.
- If values are not clear, leave the related field generic or empty rather than inventing.

--------------------------------------------------
[FINAL REMINDER]
You must behave like a professional QA bug report writer for Menaitech systems.
Return only valid JSON in the required structure.
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

    if (isRevision) {
      normalized = preserveUnrequestedFields(
        normalizeReport(currentReport),
        normalized,
        latestUserRequest
      );
    }

    normalized = applyExplicitFieldOverrides(normalized, latestUserRequest);
    normalized = applyParsedMenaitechContext(normalized, parsedContext, latestUserRequest);

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
  return `Generate a professional Menaitech bug report based on the issue below.

Strict requirements:
- Follow the exact JSON structure defined in the system instructions.
- Keep the report realistic, professional, and readable.
- Do NOT invent screens, modules, or buttons.
- Use Menaitech-specific logic where relevant.
- Keep steps concise and logical.
- If the issue is related to finance/payroll, steps should usually start with "Open the MenaPAY tab."
- If the issue is related to appraisal/performance/career path/certificates/vacancy, steps should usually start with "Open the MenaHR tab."
- If the issue is related to the mobile app, steps should usually start with "Open MenaME application."
- If the issue is related to MenaME web, steps should usually start with "Open the MenaME Web."
- Do NOT add login steps unless login itself is relevant.
- Do NOT use generic phrases like "as an administrator" unless explicitly stated.
- If Environment or Version are not provided, leave them empty unless recognized shorthand login/version data is clearly present.
- Financial discrepancy issues should usually be Severity = Critical and Priority = Urgent.
- Salary Calculation / Salary Slip issues should usually be Severity = High and Priority = High unless a financial discrepancy makes them more severe.

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
    Version: /\bversion\b|\blogin\b|\busername\b|\bpassword\b|\bcompany code\b|\bbranch code\b/,
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

  if (/\bgrammar\b|\btypo\b|\bwording\b/.test(request) && !allowedFields.size) {
    allowedFields.add('Description');
  }

  if (/\bshorten\b|\bsimplify\b|\bmake it shorter\b/.test(request) && !allowedFields.size) {
    allowedFields.add('Description');
  }

  if (/\badd\b/.test(request) && /\bstep\b/.test(request)) {
    allowedFields.add('Steps_to_Reproduce');
  }

  if (/\bremove\b/.test(request) && /\bstep\b/.test(request)) {
    allowedFields.add('Steps_to_Reproduce');
  }

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

function parseMenaitechContext(userText) {
  const text = safeString(userText);
  if (!text) {
    return {
      login: null,
      versionLabel: '',
      employeeCode: '',
      mentionsLogin: false
    };
  }

  const login = parseLoginShorthand(text);
  const versionLabel = detectVersionLabel(text, login);
  const employeeCode = detectEmployeeCode(text, login);
  const mentionsLogin = /\blogin\b|\bsign in\b|\bsignin\b|\blog in\b|\bauthentication\b|\bcredentials\b/.test(
    text.toLowerCase()
  );

  return {
    login,
    versionLabel,
    employeeCode,
    mentionsLogin
  };
}

function parseLoginShorthand(text) {
  const slashMatch = text.match(/(?:^|[\s(])([^\/\s,]+)\/([^\/\s,]+)\/([^\/\s,]+)\/([^\/\s,]+)(?:[\s),.]|$)/);
  const commaMatch = text.match(/(?:^|[\s(])([^,\s\/]+),([^,\s\/]+),([^,\s\/]+),([^,\s\/]+)(?:[\s),.]|$)/);

  const match = slashMatch || commaMatch;
  if (!match) return null;

  return {
    username: safeString(match[1]),
    password: safeString(match[2]),
    companyCode: safeString(match[3]),
    branchCode: safeString(match[4])
  };
}

function detectVersionLabel(text, login) {
  const cleaned = safeString(text);

  const knownPatterns = [
    /\baug\s*sql\s*2016\b/i,
    /\bnew version\b/i,
    /\brevamp\b/i,
    /\bqa\b/i,
    /\buat\b/i,
    /\bprod\b/i,
    /\baug\b/i,
    /\bjul\b/i,
    /\bsql\s*2016\b/i,
    /\bpatch[\w-]*\b/i
  ];

  for (const pattern of knownPatterns) {
    const match = cleaned.match(pattern);
    if (match?.[0]) return match[0].trim();
  }

  if (login) {
    return '';
  }

  return '';
}

function detectEmployeeCode(text, login) {
  const cleaned = safeString(text);

  const codePatterns = [
    /\bemp\d+\b/i,
    /\bemployee\s*code\s*[:=-]?\s*([A-Za-z0-9_-]+)\b/i
  ];

  for (const pattern of codePatterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;

    if (match[1]) {
      return safeString(match[1]);
    }

    return safeString(match[0]);
  }

  if (login) {
    const rawTokens = extractRawTokens(cleaned);
    if (rawTokens.length === 4) return '';
  }

  return '';
}

function extractRawTokens(text) {
  if (!text) return [];

  if (text.includes('/')) {
    const slashParts = text.split('/').map((part) => part.trim()).filter(Boolean);
    if (slashParts.length === 4) return slashParts;
  }

  if (text.includes(',')) {
    const commaParts = text.split(',').map((part) => part.trim()).filter(Boolean);
    if (commaParts.length === 4) return commaParts;
  }

  return [];
}

function applyParsedMenaitechContext(report, parsedContext, latestUserRequest) {
  const updated = normalizeReport(report);
  const request = safeString(latestUserRequest).toLowerCase();

  const shouldUpdateVersion =
    !!parsedContext &&
    (
      !!parsedContext.login ||
      !!parsedContext.versionLabel
    ) &&
    (
      !updated.Version ||
      /\bversion\b|\blogin\b|\busername\b|\bpassword\b|\bcompany code\b|\bbranch code\b/.test(request) ||
      !request
    );

  if (shouldUpdateVersion) {
    updated.Version = buildVersionField(parsedContext, updated.Version);
  }

  if (!updated.Steps_to_Reproduce.length) {
    updated.Steps_to_Reproduce = buildFallbackStepsFromContext(parsedContext, latestUserRequest);
  }

  return normalizeReport(updated);
}

function buildVersionField(parsedContext, existingVersion) {
  if (!parsedContext) return existingVersion || '';

  const parts = [];

  if (parsedContext.versionLabel) {
    parts.push(`Environment/Version: ${parsedContext.versionLabel}`);
  }

  if (parsedContext.login) {
    parts.push(`Username: ${parsedContext.login.username}`);
    parts.push(`Password: ${parsedContext.login.password}`);
    parts.push(`Company Code: ${parsedContext.login.companyCode}`);
    parts.push(`Branch Code: ${parsedContext.login.branchCode}`);
  }

  if (!parts.length) {
    return existingVersion || '';
  }

  return parts.join('\n');
}

function buildFallbackStepsFromContext(parsedContext, latestUserRequest) {
  const request = safeString(latestUserRequest);
  const lower = request.toLowerCase();

  const steps = [];
  const firstStep = inferFirstStep(lower);

  if (firstStep) {
    steps.push(firstStep);
  }

  if (/\bsalary calculation\b|\bcalculate salary\b|\bsalary\b|\bpayroll\b/.test(lower)) {
    steps.push('Go to Salary Calculation.');

    const monthMatch =
      request.match(/\bmonth\s+([A-Za-z0-9_-]+)/i) ||
      request.match(/\bfor\s+month\s+([A-Za-z0-9_-]+)/i);

    if (monthMatch?.[1]) {
      steps.push(`Calculate salary for month ${monthMatch[1]}.`);
    } else {
      steps.push('Calculate the salary for the required month.');
    }
  }

  if (parsedContext?.employeeCode) {
    steps.push(`Use employee code ${parsedContext.employeeCode} where applicable.`);
  }

  return steps.slice(0, 6);
}

function inferFirstStep(lowerText) {
  if (
    /\bmename application\b|\bmobile\b|\bapp\b|\bandroid\b|\bios\b/.test(lowerText)
  ) {
    return 'Open MenaME application.';
  }

  if (
    /\bmename web\b|\bmena me web\b|\bweb version\b/.test(lowerText)
  ) {
    return 'Open the MenaME Web.';
  }

  if (
    /\bappraisal\b|\bperformance\b|\bcareer path\b|\bcertificate\b|\bcertificates\b|\bvacancy\b|\brecruitment\b/.test(
      lowerText
    )
  ) {
    return 'Open the MenaHR tab.';
  }

  if (
    /\bpayroll\b|\bsalary\b|\bsalary calculation\b|\bsalary slip\b|\ballowance\b|\bdeduction\b|\bovertime\b|\bsocial security\b|\binsurance\b|\bnet salary\b|\bfinancial\b/.test(
      lowerText
    )
  ) {
    return 'Open the MenaPAY tab.';
  }

  return '';
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
    } catch (_) {}
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
      .filter(Boolean)
      .slice(0, 10);
  }

  if (typeof steps === 'string' && steps.trim()) {
    return steps
      .split(/\n?\s*\d+\.\s+|\n-\s+/)
      .map((step) => step.trim())
      .filter(Boolean)
      .slice(0, 10);
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