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
        ? normalizeReport(body.currentReport)
        : null;

    if (!messages.length) {
      return jsonResponse({ error: 'No valid user messages provided' }, 400);
    }

    const latestUserRequest = safeString(messages[messages.length - 1]?.content || '');
    const isRevision = !!currentReport;
    const parsedContext = parseMenaitechContext(latestUserRequest);

    const systemPrompt = `You are a Senior QA/QC Engineer with 15+ years of experience in Menaitech systems.

Your only job is to generate or update professional bug reports in English for Menaitech products such as MenaPAY, MenaHR, MenaME application, and MenaME Web.

==================================================
[STRICT ROLE]
- You only write bug reports.
- Do not answer general questions.
- Do not explain concepts.
- Do not provide advice.
- Do not add commentary outside the bug report.
- Do not ask follow-up questions.
- Return JSON only.

==================================================
[STRICT JSON OUTPUT]
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
Do not add any extra text before or after the JSON.

==================================================
[WRITING STYLE]
- Write like a professional QA engineer.
- Be clear, realistic, concise, and complete.
- The report must be readable and useful.
- Avoid filler and avoid robotic repetition.
- Do not write like documentation or a tutorial.

==================================================
[TITLE RULES]
- Make the title concise and specific.
- Mention the affected business flow or behavior when clear.
- Do not make the title too long.

==================================================
[DESCRIPTION RULES]
- Describe what the user tried to do.
- Describe what went wrong.
- Include business context when relevant.
- Keep it focused and realistic.
- Usually 2 to 4 well-formed sentences.
- Do not invent unsupported details.

==================================================
[DATA RULES]
- Use only information provided by the user.
- Use only information clearly inferable from the recognized login shorthand patterns defined below.
- If information is missing, keep the related field generic or empty.
- Do NOT invent screen names, modules, tabs, buttons, roles, credentials, technical root causes, or workflow details.
- Do NOT assume hidden actions.
- Do NOT infer a screen or a path unless the user explicitly mentioned it or it is covered by the tab-opening rules below.

==================================================
[MENATECH TAB-OPENING RULES]
The first step may be inferred only at the tab level, not at the screen level.

- If the issue is clearly about payroll, salary, salary slip, deductions, allowances, overtime, insurance, social security, or other employee financial matters, the first step should usually be: "Open the MenaPAY tab."
- If the issue is clearly about appraisal, performance evaluation, career path, certificates, vacancy, or related HR evaluation flows, the first step should usually be: "Open the MenaHR tab."
- If the issue is clearly about the mobile application, the first step should usually be: "Open MenaME application."
- If the issue is clearly about MenaME Web, the first step should usually be: "Open the MenaME Web."

STRICT:
- Do not infer any specific screen after that unless the user explicitly mentioned it.
- Tab-level inference is allowed. Screen-level inference is not allowed.

==================================================
[STEPS TO REPRODUCE - STRICT]
This section is extremely important.

Allowed behavior:
- Use only actions explicitly mentioned by the user.
- The only allowed inference is the first step at tab level according to the tab-opening rules above.
- After the first step, every other step must come from the user's own described actions, data, or business flow.
- Keep steps concise and realistic.
- Usually 2 to 5 steps are enough.
- Use the minimum number of steps needed.

Forbidden behavior:
- Do NOT invent any screen, module, page, workflow path, button, field, role, permission, or system path.
- Do NOT write things like "Navigate to Salary Calculation", "Navigate to Employee Management", or similar, unless the user explicitly mentioned that exact screen or section.
- Do NOT write "Click on the 'Salary Calculation' button" unless the user explicitly mentioned such a button.
- Do NOT write "Log in" unless login itself is relevant or explicitly mentioned.
- Do NOT write "as an administrator" unless the user explicitly mentioned that role.
- Do NOT convert a general financial issue into "Salary Calculation" unless the user explicitly said Salary Calculation.
- Do NOT assume where employee code was entered.
- Do NOT add hidden setup steps from your own assumptions.

Examples of correct behavior:
- If the user says there is a rounding issue after clicking Round twice in March and April, do not add Salary Calculation unless the user mentioned Salary Calculation.
- If the user says there is an issue in Salary Calculation, then you may use Salary Calculation because it was explicitly mentioned.
- If the user gives an employee code only, use it only where relevant without inventing where it was entered.

==================================================
[LOGIN DATA / VERSION INTERPRETATION]
In Menaitech login, the main fields are:
- Username
- Password
- Company Code
- Branch Code

Recognized login shorthand patterns:

Pattern 1:
username/password/companyCode/branchCode
Example:
sa/1/mena/kw

Pattern 2:
username,password,companyCode,branchCode
Example:
sa,1,mena,5842

If the input matches one of these patterns:
- Username = first value
- Password = second value
- Company Code = third value
- Branch Code = fourth value

Strict rules:
- Treat these patterns as login credentials.
- Do not reorder values.
- Do not reinterpret their meaning.
- Do not mix employee code with login shorthand.
- Do not expose credentials outside the Version field unless login is explicitly relevant to reproduction.

==================================================
[VERSION / ENVIRONMENT LABELS]
Users may also mention version/environment labels such as:
- QA
- UAT
- PROD
- Jul
- Aug
- Revamp
- New Version
- SQL2016
- Aug SQL2016
- patch labels
- similar internal release names

Rules:
- If clearly present, put them in Version.
- If login shorthand and environment/version both exist, include both in Version.
- Keep Version structured and clean.
- Do not invent version names.

==================================================
[VERSION FIELD FORMAT]
Case 1: login shorthand only
Username: <value>
Password: <value>
Company Code: <value>
Branch Code: <value>

Case 2: version/environment only
Environment/Version: <value>

Case 3: both exist
Environment/Version: <value>
Username: <value>
Password: <value>
Company Code: <value>
Branch Code: <value>

==================================================
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

Guidance:
- If the issue causes a financial discrepancy such as wrong salary, extra amount, missing amount, or incorrect net salary, usually use Severity = Critical and Priority = Urgent.
- If the issue involves salary calculation or salary slip without a proven financial discrepancy, usually use Severity = High and Priority = High.
- During revisions, do not change Severity unless the user explicitly asked to change Severity.
- During revisions, do not change Priority unless the user explicitly asked to change Priority.

==================================================
[REVISION RULES - STRICT]
If a current report is provided, treat it as the base version.

- Update ONLY the field or section explicitly requested by the user.
- Keep all other fields exactly unchanged.
- Do not rewrite unrelated fields.
- Do not improve unrelated wording.
- Do not regenerate the whole report from scratch.
- If the user asks to fix one field only, change one field only.
- If the user asks to add something to one section, add it only there.
- If the user asks to shorten one section, shorten only that section.
- Return the full JSON after applying the change.

==================================================
[FINAL REMINDER]
Be conservative.
If the user did not say it, do not invent it.
The only allowed default inference in steps is the first tab-opening step.`;

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
        max_tokens: 2600,
        temperature: 0.03
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
      normalized = normalizeReport(JSON.parse(cleanJSON));
    } catch (parseError) {
      console.error('JSON parse failed:', parseError);
      normalized = fallbackReportFromText(rawContent);
    }

    if (isRevision) {
      normalized = preserveUnrequestedFields(currentReport, normalized, latestUserRequest);
    }

    normalized = applyExplicitFieldOverrides(normalized, latestUserRequest);
    normalized = applyParsedMenaitechContext(normalized, parsedContext, latestUserRequest, currentReport);
    normalized = sanitizeReportAgainstAssumptions(normalized, latestUserRequest, currentReport);

    return jsonResponse(
      {
        type: 'json',
        content: normalized,
        message: isRevision
          ? 'I updated the report based on your latest request.'
          : 'Here is your bug report.'
      },
      200
    );
  } catch (error) {
    console.error('Internal error:', error);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}

function buildModelMessages(messages, currentReport) {
  return messages
    .filter(
      (message) =>
        message &&
        typeof message.content === 'string' &&
        ['user', 'assistant'].includes(message.role)
    )
    .map((message, index, array) => {
      if (message.role === 'assistant') {
        return { role: 'assistant', content: 'Report delivered.' };
      }

      const userText = safeString(message.content);
      const isLatest = index === array.length - 1;

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
}

function buildHistoricalUserInstruction(issueText) {
  return `Generate a professional Menaitech bug report for the issue below.

Strict instructions:
- Use the exact JSON structure.
- Be conservative.
- Use only the user's information.
- The only allowed inference in steps is the first tab-opening step.
- Do not invent screens, modules, buttons, roles, or hidden actions.
- Do not turn a general financial issue into Salary Calculation unless the user explicitly mentioned Salary Calculation.
- Keep steps concise and realistic.

Issue details:
${issueText}`;
}

function buildInitialUserInstruction(issueText) {
  return buildHistoricalUserInstruction(issueText);
}

function buildRevisionUserInstruction(requestText, currentReport) {
  return `You previously generated a bug report.

Update the SAME report according to the user's latest request.

STRICT UPDATE RULES:
- Use the current report as the base version.
- Modify only the explicitly requested field or section.
- Keep every other field exactly unchanged.
- Do not regenerate from scratch.
- Do not improve unrelated wording.
- Do not rewrite unrelated sections.
- Return the full JSON structure only.

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
    Steps_to_Reproduce: /\bsteps?\b|\breproduce\b|\breproduction\b|\bsteps to reproduce\b/,
    Expected_Result: /\bexpected\b|\bexpected result\b/,
    Actual_Result: /\bactual\b|\bactual result\b/,
    Environment: /\benvironment\b|\benv\b/,
    Version: /\bversion\b|\blogin\b|\busername\b|\bpassword\b|\bcompany code\b|\bbranch code\b/,
    Severity: /\bseverity\b/,
    Priority: /\bpriority\b/,
    Impact: /\bimpact\b|\bbusiness impact\b/,
    Attachments: /\battachment\b|\battachments\b|\bscreenshot\b|\bvideo\b|\bfile\b/
  };

  const broadRewrite =
    /\b(rewrite all|rewrite report|regenerate|revise the report|update the report|improve the report|rephrase the report)\b/.test(
      request
    ) && !hasSpecificFieldMention(request, fieldMatchers);

  if (broadRewrite) return proposed;

  const allowedFields = new Set();

  for (const [fieldName, pattern] of Object.entries(fieldMatchers)) {
    if (pattern.test(request)) {
      allowedFields.add(fieldName);
    }
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
    ) || request.match(/severity\s*(?:to|as|=|becomes?)\s*(critical|high|medium|low)/i);

  const priorityMatch =
    request.match(
      /(?:change|update|set|make|adjust)\s+(?:the\s+)?priority\s+(?:to|as)?\s*(urgent|high|medium|low)/i
    ) || request.match(/priority\s*(?:to|as|=|becomes?)\s*(urgent|high|medium|low)/i);

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

  return {
    login: parseLoginShorthand(text),
    versionLabel: detectVersionLabel(text),
    employeeCode: detectEmployeeCode(text),
    mentionsLogin: /\blogin\b|\blog in\b|\bsign in\b|\bsignin\b|\bauthentication\b|\bcredentials\b/i.test(text)
  };
}

function parseLoginShorthand(text) {
  const slashMatch = text.match(/(?:^|[\s(])([^\/\s,]+)\/([^\/\s,]+)\/([^\/\s,]+)\/([^\/\s,]+)(?:[\s),.]|$)/);
  if (slashMatch) {
    return {
      username: safeString(slashMatch[1]),
      password: safeString(slashMatch[2]),
      companyCode: safeString(slashMatch[3]),
      branchCode: safeString(slashMatch[4])
    };
  }

  const commaMatch = text.match(/(?:^|[\s(])([^,\s\/]+),([^,\s\/]+),([^,\s\/]+),([^,\s\/]+)(?:[\s),.]|$)/);
  if (commaMatch) {
    return {
      username: safeString(commaMatch[1]),
      password: safeString(commaMatch[2]),
      companyCode: safeString(commaMatch[3]),
      branchCode: safeString(commaMatch[4])
    };
  }

  return null;
}

function detectVersionLabel(text) {
  const patterns = [
    /\baug\s*sql\s*2016\b/i,
    /\bnew version\b/i,
    /\brevamp\b/i,
    /\buat\b/i,
    /\bprod\b/i,
    /\bqa\b/i,
    /\baug\b/i,
    /\bjul\b/i,
    /\bsql\s*2016\b/i,
    /\bpatch[\w-]*\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return safeString(match[0]);
  }

  return '';
}

function detectEmployeeCode(text) {
  const patterns = [
    /\bemp\d+\b/i,
    /\bemployee\s*code\s*[:=-]?\s*([A-Za-z0-9_-]+)\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return safeString(match[1] || match[0]);
  }

  return '';
}

function applyParsedMenaitechContext(report, parsedContext, latestUserRequest, currentReport) {
  const updated = normalizeReport(report);
  const request = safeString(latestUserRequest).toLowerCase();

  const userExplicitlyAskedToChangeVersion =
    /\bversion\b|\blogin\b|\busername\b|\bpassword\b|\bcompany code\b|\bbranch code\b/.test(request);

  if ((!currentReport || userExplicitlyAskedToChangeVersion || !updated.Version) &&
      (parsedContext.login || parsedContext.versionLabel)) {
    updated.Version = buildVersionField(parsedContext, updated.Version);
  }

  if ((!currentReport || !updated.Steps_to_Reproduce.length) && latestUserRequest) {
    updated.Steps_to_Reproduce = buildConservativeFallbackSteps(parsedContext, latestUserRequest, updated.Steps_to_Reproduce);
  }

  return normalizeReport(updated);
}

function buildVersionField(parsedContext, existingVersion) {
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

  return parts.length ? parts.join('\n') : safeString(existingVersion);
}

function buildConservativeFallbackSteps(parsedContext, latestUserRequest, existingSteps) {
  const existing = normalizeSteps(existingSteps);
  if (existing.length) return existing;

  const lower = safeString(latestUserRequest).toLowerCase();
  const steps = [];
  const tabStep = inferFirstTabStep(lower);

  if (tabStep) {
    steps.push(tabStep);
  }

  const explicitUserActions = extractExplicitActions(latestUserRequest);
  for (const action of explicitUserActions) {
    if (!steps.includes(action)) {
      steps.push(action);
    }
  }

  if (parsedContext.employeeCode && !steps.some((step) => step.toLowerCase().includes(parsedContext.employeeCode.toLowerCase()))) {
    steps.push(`Use employee code ${parsedContext.employeeCode} where applicable.`);
  }

  return steps.slice(0, 5);
}

function inferFirstTabStep(lowerText) {
  if (/\bmename web\b|\bmena me web\b/.test(lowerText)) {
    return 'Open the MenaME Web.';
  }

  if (/\bmobile\b|\bapplication\b|\bapp\b|\bandroid\b|\bios\b|\bmename\b/.test(lowerText) &&
      !/\bweb\b/.test(lowerText)) {
    return 'Open MenaME application.';
  }

  if (/\bappraisal\b|\bperformance\b|\bcareer path\b|\bcertificate\b|\bcertificates\b|\bvacancy\b/.test(lowerText)) {
    return 'Open the MenaHR tab.';
  }

  if (/\bpayroll\b|\bsalary\b|\bsalary slip\b|\ballowance\b|\bdeduction\b|\bovertime\b|\bsocial security\b|\binsurance\b|\bnet salary\b|\bfinancial\b/.test(lowerText)) {
    return 'Open the MenaPAY tab.';
  }

  return '';
}

function extractExplicitActions(text) {
  const actions = [];
  const normalized = safeString(text);

  const patterns = [
    /\bgo to\s+([^.:\n]+)\b/gi,
    /\bopen\s+([^.:\n]+)\b/gi,
    /\bclick\s+([^.:\n]+)\b/gi,
    /\bpress\s+([^.:\n]+)\b/gi,
    /\bselect\s+([^.:\n]+)\b/gi,
    /\bcalculate\s+([^.:\n]+)\b/gi,
    /\bverify\s+that\s+([^.:\n]+)\b/gi,
    /\bobserve\s+that\s+([^.:\n]+)\b/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalized)) !== null) {
      const full = safeString(match[0]);
      if (full && !actions.includes(capitalizeStep(full))) {
        actions.push(capitalizeStep(full));
      }
    }
  }

  return actions;
}

function sanitizeReportAgainstAssumptions(report, latestUserRequest, currentReport) {
  const cleaned = normalizeReport(report);
  const lowerRequest = safeString(latestUserRequest).toLowerCase();
  const explicitTerms = getExplicitTerms(lowerRequest);

  cleaned.Steps_to_Reproduce = normalizeSteps(cleaned.Steps_to_Reproduce)
    .map((step) => sanitizeStep(step, lowerRequest, explicitTerms))
    .filter(Boolean);

  if (!cleaned.Steps_to_Reproduce.length && !currentReport) {
    const fallback = buildConservativeFallbackSteps(parseMenaitechContext(latestUserRequest), latestUserRequest, []);
    cleaned.Steps_to_Reproduce = fallback.map((step) => sanitizeStep(step, lowerRequest, explicitTerms)).filter(Boolean);
  }

  return normalizeReport(cleaned);
}

function sanitizeStep(step, lowerRequest, explicitTerms) {
  let value = safeString(step);
  if (!value) return '';

  value = value.replace(/\bas an administrator\b/gi, '').trim();
  value = value.replace(/\s{2,}/g, ' ').trim();

  if (/employee management module/i.test(value) && !explicitTerms.has('employee management module')) {
    return '';
  }

  if (/salary calculation/i.test(value) && !explicitTerms.has('salary calculation')) {
    if (/navigate/i.test(value) || /go to/i.test(value) || /click/i.test(value)) {
      return '';
    }
  }

  if (/log in|login|sign in/i.test(value) && !/\blogin\b|\blog in\b|\bsign in\b|\bsignin\b/.test(lowerRequest)) {
    return '';
  }

  if (/click on the ['"].+['"] button/i.test(value)) {
    const buttonName = value.match(/click on the ['"](.+?)['"] button/i)?.[1]?.toLowerCase();
    if (buttonName && !lowerRequest.includes(buttonName)) {
      return '';
    }
  }

  if (/navigate to/i.test(value)) {
    const destination = value.replace(/^navigate to\s+/i, '').replace(/\.$/, '').toLowerCase();
    if (destination && !lowerRequest.includes(destination)) {
      return '';
    }
  }

  return capitalizeSentence(value);
}

function getExplicitTerms(lowerRequest) {
  const terms = new Set();
  const knownTerms = [
    'salary calculation',
    'employee management module',
    'mename web',
    'menapay',
    'menahr',
    'round'
  ];

  for (const term of knownTerms) {
    if (lowerRequest.includes(term)) {
      terms.add(term);
    }
  }

  return terms;
}

function capitalizeStep(step) {
  return capitalizeSentence(step.endsWith('.') ? step : `${step}.`);
}

function capitalizeSentence(text) {
  const value = safeString(text);
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractJSONString(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return '{}';

  const fencedMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();

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
    Severity: normalizeSeverity(extractField(text, ['Severity']) || 'Medium'),
    Priority: normalizePriority(extractField(text, ['Priority']) || 'Medium'),
    Impact: extractField(text, ['Impact']) || '',
    Attachments: normalizeAttachments(extractField(text, ['Attachments']) || '')
  };
}

function extractField(text, fieldNames) {
  if (!text) return null;

  for (const fieldName of fieldNames) {
    const patterns = [
      new RegExp(`"${escapeRegExp(fieldName)}"\\s*:\\s*"([^"]*)"`, 'i'),
      new RegExp(`^${escapeRegExp(fieldName)}:?\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Za-z_ /]+:?\\n?|$)`, 'im'),
      new RegExp(`\\*\\*${escapeRegExp(fieldName)}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`, 'i')
    ];

    for (const regex of patterns) {
      const match = text.match(regex);
      if (match?.[1]) return safeString(match[1]);
    }
  }

  return null;
}

function extractSteps(text) {
  const stepsBlock = extractField(text, ['Steps to Reproduce', 'Steps_to_Reproduce']) || '';
  if (!stepsBlock) return [];

  if (stepsBlock.startsWith('[')) {
    try {
      const parsed = JSON.parse(stepsBlock);
      if (Array.isArray(parsed)) return parsed.map((step) => safeString(step)).filter(Boolean);
    } catch (_) {}
  }

  const numbered = stepsBlock
    .split(/\n?\s*\d+\.\s+/)
    .map((step) => safeString(step))
    .filter(Boolean);

  if (numbered.length) return numbered;

  const dashed = stepsBlock
    .split(/\n-\s+/)
    .map((step) => safeString(step))
    .filter(Boolean);

  if (dashed.length) return dashed;

  return [safeString(stepsBlock)].filter(Boolean);
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
      .map((step) => safeString(step))
      .filter(Boolean)
      .slice(0, 10);
  }

  return [];
}

function normalizeAttachments(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeString(item)).filter(Boolean).join('\n');
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    headers: { 'Content-Type': 'application/json' }
  });
}
