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

    const systemPrompt = `You are a Senior QA/QC Engineer specialized in Menaitech systems.

Your ONLY task is to generate or revise professional bug reports in English.
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

CORE RULES:
- Output English only.
- Do not add any text outside the JSON.
- Do not ask follow-up questions.
- Do not explain anything outside the bug report.
- Keep the wording professional, realistic, and concise.
- Do not redesign the report structure.

FACTUALITY RULES:
- Use only information provided by the user.
- Make conservative inferences only when they are directly supported by the user text.
- If a detail was not given, leave it empty instead of guessing.
- Never invent screens, modules, tabs, buttons, paths, roles, credentials, versions, months, or environments.
- Never convert a general issue into a specific screen or business path unless the user explicitly mentioned it.

TITLE:
- Make it concise, specific, and bug-focused.
- Mention the affected feature or process only if it was actually mentioned.

DESCRIPTION:
- 2-4 strong sentences when enough information exists.
- Explain what the user was doing, what happened, and why it matters.
- Do not invent missing business context.
- Do not invent module names or screen names.

STEPS TO REPRODUCE:
- Steps must come only from the user's wording or from direct, unavoidable implications.
- Do not introduce any screen, page, module, tab, button, or navigation path that the user did not mention.
- Do not add login steps unless login/authentication is explicitly relevant.
- Do not add role names such as administrator unless explicitly stated.
- Keep steps short, clear, and realistic.
- Usually 3-6 steps when enough information exists.
- If the user did not provide enough information for a certain step, keep the steps minimal rather than guessing.
- It is better to write fewer accurate steps than longer invented steps.

VERSION / LOGIN / TEST DATA:
- Only fill Version if the user explicitly provided version, environment, release label, or recognized login shorthand.
- If Version is not explicitly provided, keep Version as an empty string.
- Recognized login shorthand formats:
  1) username/password/companyCode/branchCode
  2) username,password,companyCode,branchCode
- If recognized login shorthand exists, place it in Version exactly as structured data.
- Do not guess missing credentials.
- Treat employee codes as test data, not login data.

ENVIRONMENT:
- Fill Environment only when explicitly provided.
- Otherwise keep it empty.

SEVERITY / PRIORITY:
Allowed Severity: Critical, High, Medium, Low
Allowed Priority: Urgent, High, Medium, Low

Classification rules:
- Be conservative.
- Do NOT default to Critical or Urgent.
- Use Critical only for truly severe cases such as confirmed financial corruption, confirmed wrong payroll amounts, security risk, data loss, system-wide outage, or a blocker that prevents a critical business operation from continuing.
- Use Urgent only when immediate action is clearly required because of severe business risk, deadline-sensitive payroll impact, production-wide outage, or similar major harm.
- Use High for important functional failures with strong business impact but without extreme risk.
- Use Medium for normal functional issues or unclear impact.
- Use Low for minor or cosmetic issues.
- If the user later asks to change Severity or Priority, update only what was requested.

REVISION RULES:
When a current report is provided, treat it as the base version.
- Update only the requested part.
- Keep all untouched fields exactly unchanged.
- Do not regenerate the whole report from scratch.
- If the user asks to rewrite, shorten, add, remove, correct, or rephrase a specific part, apply that change only in the relevant field or fields.
- If the user refers to text that already exists in the current report, update the field containing that text.
- If the user adds new information, insert it only into the relevant field or fields.
- Return the full JSON after the requested update.

FINAL RULE:
Accuracy is more important than completeness. If a field is not clearly supported, leave it empty.``;

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
    normalized = applyConservativeClassification(
      normalized,
      latestUserRequest,
      isRevision ? normalizeReport(currentReport) : null
    );

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
  return `Generate a professional bug report from the user's issue.

Strict requirements:
- Follow the exact JSON structure from the system instruction.
- Use only details provided by the user.
- Never invent screens, modules, buttons, paths, tabs, or versions.
- Never assume salary calculation, payroll screens, or any other business flow unless the user explicitly mentioned them.
- Keep steps minimal, clear, and accurate.
- If details are missing, leave the relevant field empty instead of guessing.
- Be conservative when assigning Severity and Priority.

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
- Update ONLY the requested field or section.
- Keep every other field EXACTLY unchanged.
- Do NOT regenerate the whole report from scratch.
- If the user refers to a sentence, phrase, place, step, or part of the existing report, update the field that contains that content.
- If the user adds new information, place it only in the relevant field or fields.
- Do NOT change Severity or Priority unless explicitly requested or unless the user added new information that directly changes business impact.
- Return the full updated JSON only.

Current report JSON:
${JSON.stringify(normalizeReport(currentReport), null, 2)}

Latest user request:
${requestText}`;
}

function preserveUnrequestedFields(currentReport, updatedReport, latestUserRequest) {
  const base = normalizeReport(currentReport);
  const proposed = normalizeReport(updatedReport);
  const request = safeString(latestUserRequest);
  const lowerRequest = request.toLowerCase();

  const fieldMatchers = {
    Title: /\btitle\b|\bsubject\b|\bheadline\b|\bالعنوان\b/i,
    Description: /\bdescription\b|\bdesc\b|\bdetails\b|\bsummary\b|\bcontext\b|\bparagraph\b|\btext\b|\bdescription part\b|\bالوصف\b|\bالنص\b|\bالصياغة\b/i,
    Steps_to_Reproduce: /\bsteps?\b|\breproduce\b|\breproduction\b|\bscenario\b|\bflow\b|\bpath\b|\bstep by step\b|\bالخطوات\b|\bخطوة\b|\bسيناريو\b/i,
    Expected_Result: /\bexpected\b|\bexpected result\b|\bshould\b|\bالمتوقع\b/i,
    Actual_Result: /\bactual\b|\bactual result\b|\bcurrent result\b|\bwhat happened\b|\bالنتيجة الفعلية\b|\bالفعلي\b/i,
    Environment: /\benvironment\b|\benv\b|\bserver\b|\bdatabase\b|\bالبيئة\b/i,
    Version: /\bversion\b|\blogin\b|\busername\b|\bpassword\b|\bcompany code\b|\bbranch code\b|\brelease\b|\bbuild\b|\bالنسخة\b/i,
    Severity: /\bseverity\b|\bcriticality\b|\bالخطورة\b/i,
    Priority: /\bpriority\b|\burgency\b|\bالأولوية\b/i,
    Impact: /\bimpact\b|\bbusiness impact\b|\beffect\b|\bالأثر\b/i,
    Attachments: /\battachment\b|\battachments\b|\bscreenshot\b|\bvideo\b|\bfile\b|\bمرفق\b|\bمرفقات\b/i
  };

  const broadRewriteRequest =
    /\b(rewrite|regenerate|improve the report|improve all|rewrite all|rewrite report|revise the report|update the report|refine the report|make it better|rephrase the report|rewrite it all)\b/i.test(
      request
    ) && !hasSpecificFieldMention(lowerRequest, fieldMatchers);

  if (broadRewriteRequest) {
    return proposed;
  }

  const allowedFields = detectRequestedFields(base, request, fieldMatchers);

  if (!allowedFields.size) {
    return proposed;
  }

  const result = { ...base };

  for (const fieldName of allowedFields) {
    result[fieldName] = proposed[fieldName];
  }

  return normalizeReport(result);
}

function detectRequestedFields(currentReport, latestUserRequest, fieldMatchers) {
  const request = safeString(latestUserRequest);
  const allowedFields = new Set();

  for (const [fieldName, pattern] of Object.entries(fieldMatchers)) {
    if (pattern.test(request)) {
      allowedFields.add(fieldName);
    }
  }

  if (/\b(grammar|typo|wording|rephrase|rewrite|shorten|simplify|clarify)\b/i.test(request) && !allowedFields.size) {
    allowedFields.add('Description');
  }

  if (/\b(add|include|insert|append)\b/i.test(request) && /\b(step|steps)\b/i.test(request)) {
    allowedFields.add('Steps_to_Reproduce');
  }

  if (/\b(remove|delete)\b/i.test(request) && /\b(step|steps)\b/i.test(request)) {
    allowedFields.add('Steps_to_Reproduce');
  }

  if (/\b(place|location|screen|module|button|path|tab)\b/i.test(request) || /\bالمكان\b|\bالشاشة\b|\bالمسار\b|\bالتبويب\b/i.test(request)) {
    allowedFields.add('Description');
    allowedFields.add('Steps_to_Reproduce');
  }

  const quotedSegments = [
    ...request.matchAll(/"([^"]{3,})"/g),
    ...request.matchAll(/'([^']{3,})'/g),
    ...request.matchAll(/“([^”]{3,})”/g),
    ...request.matchAll(/`([^`]{3,})`/g)
  ]
    .map((match) => safeString(match[1]))
    .filter(Boolean);

  for (const segment of quotedSegments) {
    const owners = findFieldsContainingText(currentReport, segment);
    owners.forEach((field) => allowedFields.add(field));
  }

  if (/\bthis sentence\b|\bthis line\b|\bthat sentence\b|\bthat line\b|\bthis part\b|\bthat part\b|\bهذا الجزء\b|\bهذا النص\b|\bهذا السطر\b/i.test(request)) {
    const referencedOwners = findFieldsContainingText(currentReport, request);
    referencedOwners.forEach((field) => allowedFields.add(field));
    if (!referencedOwners.size) {
      allowedFields.add('Description');
    }
  }

  if (/\b(add|include|mention|write|insert)\b/i.test(request) && !allowedFields.size) {
    allowedFields.add('Description');
  }

  return allowedFields;
}

function findFieldsContainingText(report, snippet) {
  const normalizedSnippet = normalizeComparableText(snippet);
  const owners = new Set();

  if (!normalizedSnippet) {
    return owners;
  }

  for (const [fieldName, value] of Object.entries(report)) {
    if (Array.isArray(value)) {
      if (
        value.some((item) => {
          const normalizedItem = normalizeComparableText(item);
          return normalizedItem && (normalizedItem.includes(normalizedSnippet) || normalizedSnippet.includes(normalizedItem));
        })
      ) {
        owners.add(fieldName);
      }
      continue;
    }

    const normalizedValue = normalizeComparableText(value);
    if (!normalizedValue) continue;

    if (normalizedValue.includes(normalizedSnippet) || normalizedSnippet.includes(normalizedValue)) {
      owners.add(fieldName);
    }
  }

  return owners;
}

function normalizeComparableText(value) {
  return safeString(value).toLowerCase().replace(/\s+/g, ' ').trim();
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

function applyConservativeClassification(report, latestUserRequest, currentReport) {
  const updated = normalizeReport(report);
  const request = safeString(latestUserRequest);

  if (explicitlyRequestsSeverityOrPriorityChange(request)) {
    return updated;
  }

  if (currentReport) {
    updated.Severity = normalizeSeverity(currentReport.Severity);
    updated.Priority = normalizePriority(currentReport.Priority);
    return updated;
  }

  const combinedText = [updated.Title, updated.Description, updated.Actual_Result, updated.Impact, request]
    .map((item) => safeString(item).toLowerCase())
    .join(' ');

  const isCritical = /\b(data loss|lost data|deleted data|security|unauthorized|breach|system down|cannot process payroll|wrong salary|incorrect net salary|financial discrepancy|extra amount|missing amount|all employees|all users|production down|crash for all|blocked payroll)\b/.test(combinedText);
  const isHigh = /\b(cannot save|save fails|unable to save|cannot submit|unable to submit|calculation incorrect|wrong calculation|validation fails|blocking|cannot continue|fails to complete|not generated|does not generate|incorrect result)\b/.test(combinedText);
  const isLow = /\b(ui|alignment|spacing|font|color|label|typo|cosmetic|display only|layout)\b/.test(combinedText);

  if (isCritical) {
    updated.Severity = 'Critical';
    updated.Priority = /\b(prod|production|payroll deadline|urgent|immediately|immediate)\b/.test(combinedText) ? 'Urgent' : 'High';
    return updated;
  }

  if (isHigh) {
    updated.Severity = 'High';
    updated.Priority = /\b(payroll|salary|month end|deadline|blocks|blocking)\b/.test(combinedText) ? 'High' : 'Medium';
    return updated;
  }

  if (isLow) {
    updated.Severity = 'Low';
    updated.Priority = 'Low';
    return updated;
  }

  updated.Severity = 'Medium';
  updated.Priority = 'Medium';
  return updated;
}

function explicitlyRequestsSeverityOrPriorityChange(request) {
  const text = safeString(request).toLowerCase();
  return /\bseverity\b|\bpriority\b|\bالخطورة\b|\bالأولوية\b/.test(text);
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