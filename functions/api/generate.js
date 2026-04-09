export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!env.QWEN_API_KEY || !env.QWEN_BASE_URL) {
    return jsonResponse({ error: 'Server error' }, 500);
  }

  try {
    const body = await request.json();
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const currentReport = body.currentReport && typeof body.currentReport === 'object' ? normalizeReport(body.currentReport) : null;

    if (!messages.length) {
      return jsonResponse({ error: 'No valid user messages provided' }, 400);
    }

    const latestUserRequest = safeString(messages[messages.length - 1]?.content);
    const isRevision = !!currentReport;
    const parsedContext = parseMenaitechContext(latestUserRequest);

    const systemPrompt = buildSystemPrompt();
    const preparedMessages = buildModelMessages(messages, currentReport, parsedContext);
    const aiUrl = `${env.QWEN_BASE_URL}/chat/completions`;

    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.QWEN_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen3.6-plus',
        messages: [{ role: 'system', content: systemPrompt }, ...preparedMessages],
        max_tokens: 1200,
        temperature: 0.05,
        enable_thinking: false
      })
    });

    if (!aiResponse.ok) {
      const errorText = await safeReadText(aiResponse);
      return jsonResponse({ error: 'AI error', status: aiResponse.status, details: errorText }, aiResponse.status);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData?.choices?.[0]?.message?.content || '';
    const cleanJSON = extractJSONString(rawContent);

    let normalized;
    try {
      normalized = normalizeReport(JSON.parse(cleanJSON));
    } catch (error) {
      console.error('JSON parse failed:', error);
      normalized = fallbackReportFromText(rawContent, currentReport);
    }

    if (isRevision) {
      normalized = preserveUnrequestedFields(currentReport, normalized, latestUserRequest);
    }

    normalized = applyExplicitFieldOverrides(normalized, latestUserRequest);
    normalized = applyParsedMenaitechContext(normalized, parsedContext, latestUserRequest, currentReport);
    normalized = applyConservativeClassification(normalized, latestUserRequest, currentReport);
    normalized = finalizeReport(normalized, currentReport, isRevision);

    const assistantMessage = isRevision
      ? 'I updated the report based on your latest request.'
      : 'Here is your bug report.';

    return jsonResponse({ type: 'json', content: normalized, message: assistantMessage }, 200);
  } catch (error) {
    console.error('Internal error:', error);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
}

function buildSystemPrompt() {
  return `You are a Senior QA/QC Engineer specialized in writing professional bug reports for Menaitech-related testing.
Your ONLY task is to generate or revise professional bug reports in English.
Return ONLY valid JSON in this exact structure:
{
  "Title": "",
  "Description": "",
  "Steps_to_Reproduce": [],
  "Expected_Result": "",
  "Actual_Result": "",
  "Version": "",
  "Severity": "",
  "Priority": "",
  "Impact": "",
  "Attachments": ""
}

CORE RULES:
- Output English only.
- Do not add any text outside the JSON.
- Keep wording professional, realistic, concise, and useful.
- Never return Environment. Version is the only field for version or credentials.
- Version must always exist in the JSON. Leave it empty if unsupported.
- Use only user-provided facts and the supplied parsed context.
- If a detail was not given, leave it empty instead of guessing.
- Never invent systems, screen names, modules, tabs, buttons, navigation paths, roles, credentials, employee codes, months, or releases.
- Mention a system name only if the user explicitly mentioned it.
- Mention a screen or path only if the user explicitly mentioned it OR if a supplied safe navigation hint explicitly authorizes it.
- Do not convert a general issue into Salary Calculation or any other screen unless it was explicitly mentioned or explicitly authorized by the safe navigation hint.

DESCRIPTION:
- Write 2-4 strong sentences when enough information exists.
- Explain what the user was doing, what happened, and why it matters.
- Do not invent business context or screen names.

STEPS TO REPRODUCE:
- Use only the user's wording, the supplied test data, and any supplied safe navigation hint.
- Keep steps short, clear, and realistic.
- Prefer fewer accurate steps over longer invented steps.
- Do not add login unless login is explicitly relevant.
- If employee code or example data appears in the user text, keep it in steps where it belongs.
- Never invent employee codes.

VERSION:
- Only place release/version/credential information in Version.
- If supplied parsed credentials exist, use them.
- If supplied version exists, use it.
- If uncertain, do not guess.

REVISION RULES:
- When a current report is supplied, treat it as the base version.
- Apply minimal changes only.
- Update only the requested field or fields.
- Keep all untouched fields exactly unchanged.
- Do not regenerate the whole report from scratch.

SEVERITY / PRIORITY:
- Allowed Severity: Critical, High, Medium, Low.
- Allowed Priority: Urgent, High, Medium, Low.
- Be conservative.
- Do not default to Critical or Urgent.
- Use Critical only for clearly severe cases such as confirmed financial corruption, confirmed wrong payroll amounts, security risk, major data loss, system-wide outage, or a blocker that stops a critical business operation.
- Use Urgent only when immediate action is clearly required due to major business risk, payroll deadline risk, production-wide outage, or equivalent major harm.
- Use High for important functional failures with strong business impact.
- Use Medium for normal functional issues or unclear impact.
- Use Low for minor or cosmetic issues.

FINAL RULE:
Accuracy is more important than completeness.`;
}

function buildModelMessages(messages, currentReport, parsedContext) {
  return messages
    .filter((message) => message && typeof message.content === 'string' && ['user', 'assistant'].includes(message.role))
    .map((message, index, array) => {
      if (message.role === 'assistant') {
        return { role: 'assistant', content: 'Report delivered.' };
      }

      const isLatest = index === array.length - 1;
      const text = safeString(message.content);
      if (!isLatest) {
        return { role: 'user', content: buildHistoricalUserInstruction(text) };
      }

      return {
        role: 'user',
        content: currentReport
          ? buildRevisionUserInstruction(text, currentReport, parsedContext)
          : buildInitialUserInstruction(text, parsedContext)
      };
    });
}

function buildHistoricalUserInstruction(issueText) {
  return `Generate a professional bug report from the user's issue.
Strict requirements:
- Follow the exact JSON structure from the system instruction.
- Use only details provided by the user.
- Never invent screens, modules, buttons, paths, tabs, systems, or versions.
- Keep steps minimal, clear, and accurate.
- If details are missing, leave the relevant field empty instead of guessing.
Issue details:
${issueText}`;
}

function buildInitialUserInstruction(issueText, parsedContext) {
  return `Generate a professional bug report from the user's issue.
Parsed context you may use:
${JSON.stringify(parsedContext, null, 2)}
User issue:
${issueText}`;
}

function buildRevisionUserInstruction(requestText, currentReport, parsedContext) {
  return `You previously generated a bug report. Update the SAME report according to the latest request.
Current report JSON:
${JSON.stringify(currentReport, null, 2)}
Parsed context you may use:
${JSON.stringify(parsedContext, null, 2)}
Latest user request:
${requestText}`;
}

function normalizeReport(report) {
  const normalized = {
    Title: safeString(report?.Title),
    Description: safeString(report?.Description),
    Steps_to_Reproduce: normalizeSteps(report?.Steps_to_Reproduce),
    Expected_Result: safeString(report?.Expected_Result),
    Actual_Result: safeString(report?.Actual_Result),
    Version: normalizeVersionValue(report?.Version),
    Severity: normalizeSeverity(report?.Severity),
    Priority: normalizePriority(report?.Priority),
    Impact: safeString(report?.Impact),
    Attachments: normalizeAttachments(report?.Attachments)
  };

  return normalized;
}

function normalizeSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map((step) => safeString(step)).filter(Boolean).slice(0, 12);
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
  if (normalized === 'low') return 'Low';
  return normalized === 'medium' ? 'Medium' : '';
}

function normalizePriority(value) {
  const normalized = safeString(value).toLowerCase();
  if (normalized === 'urgent') return 'Urgent';
  if (normalized === 'high') return 'High';
  if (normalized === 'low') return 'Low';
  return normalized === 'medium' ? 'Medium' : '';
}

function normalizeVersionValue(value) {
  return safeString(value)
    .replace(/^Environment\s*:\s*/i, '')
    .replace(/^Environment\s*\/\s*Version\s*:\s*/i, '')
    .replace(/^Version\s*:\s*/i, '')
    .trim();
}

function fallbackReportFromText(rawContent, currentReport) {
  const base = currentReport || emptyReport();
  return normalizeReport({
    ...base,
    Title: base.Title,
    Description: safeString(rawContent).slice(0, 500),
    Steps_to_Reproduce: base.Steps_to_Reproduce,
    Expected_Result: base.Expected_Result,
    Actual_Result: base.Actual_Result,
    Version: base.Version,
    Severity: base.Severity,
    Priority: base.Priority,
    Impact: base.Impact,
    Attachments: base.Attachments
  });
}

function emptyReport() {
  return {
    Title: '',
    Description: '',
    Steps_to_Reproduce: [],
    Expected_Result: '',
    Actual_Result: '',
    Version: '',
    Severity: '',
    Priority: '',
    Impact: '',
    Attachments: ''
  };
}

function parseMenaitechContext(text) {
  const cleaned = safeString(text);
  const extracted = extractVersionAndCredentials(cleaned);
  const testData = extractExplicitTestData(cleaned);
  const navigation = getSafeNavigationHint(cleaned);

  return {
    version: extracted.version,
    version_format: extracted.version ? extracted.versionSource : '',
    credentials: extracted.credentials,
    version_display: extracted.versionDisplay,
    raw_candidates: extracted.rawCandidates,
    safe_navigation_hint: navigation,
    explicit_test_data: testData,
    explicit_system_names: extractExplicitSystems(cleaned)
  };
}

function extractExplicitSystems(text) {
  const systems = ['MenaPAY', 'MenaHR', 'MenaTA', 'MenaME web', 'MenaME Mobile', 'MenaBI'];
  return systems.filter((name) => new RegExp(escapeRegex(name), 'i').test(text));
}

function extractVersionAndCredentials(text) {
  const result = {
    version: '',
    versionSource: '',
    versionDisplay: '',
    credentials: null,
    rawCandidates: []
  };

  const candidates = [];

  const wrappedPattern = /\b([A-Za-z][A-Za-z0-9_-]{1,40})\s*\(\s*([^()\n]{3,120})\s*\)/g;
  let match;
  while ((match = wrappedPattern.exec(text)) !== null) {
    const wrapper = safeString(match[1]);
    const inner = safeString(match[2]);
    const credentials = parseCredentialTuple(inner);
    if (credentials) {
      candidates.push({ type: 'wrapped', wrapper, credentials, raw: match[0] });
    }
  }

  const keywordWrappedPattern = /\b(?:version|ver|build|release|env|environment)\s*[:=-]?\s*([A-Za-z0-9_-]{2,60})/gi;
  while ((match = keywordWrappedPattern.exec(text)) !== null) {
    candidates.push({ type: 'version_keyword', version: safeString(match[1]), raw: match[0] });
  }

  const contextVersionPattern = /\b(?:on|at)\s+([A-Za-z][A-Za-z0-9_-]{1,40})\b/gi;
  while ((match = contextVersionPattern.exec(text)) !== null) {
    const versionToken = safeString(match[1]);
    if (!looksLikeKnownScreenWord(versionToken) && !looksLikeEmployeeCode(versionToken)) {
      candidates.push({ type: 'context_version', version: versionToken, raw: match[0] });
    }
  }

  const looseCredentialPattern = /(^|[\s:;,-])([A-Za-z0-9._-]{1,30}\s*[,/]\s*[^\s,/()]{1,30}\s*[,/]\s*[A-Za-z0-9._-]{1,40}\s*[,/]\s*[A-Za-z0-9._-]{1,40})(?=$|[\s.;,)])/g;
  while ((match = looseCredentialPattern.exec(text)) !== null) {
    const chunk = safeString(match[2]);
    const credentials = parseCredentialTuple(chunk);
    if (credentials && !isLikelyEmployeeExample(chunk)) {
      candidates.push({ type: 'bare_credentials', credentials, raw: chunk });
    }
  }

  result.rawCandidates = candidates.map((item) => item.raw);

  const wrapped = candidates.find((item) => item.type === 'wrapped');
  const bare = candidates.find((item) => item.type === 'bare_credentials');
  const versionOnly = candidates.find((item) => item.version);

  if (wrapped) {
    result.version = wrapped.wrapper;
    result.versionSource = 'wrapped_credentials';
    result.credentials = wrapped.credentials;
  } else if (bare) {
    result.credentials = bare.credentials;
  }

  if (!result.version && versionOnly) {
    result.version = versionOnly.version;
    result.versionSource = versionOnly.type;
  }

  result.versionDisplay = buildVersionDisplay(result.version, result.credentials);
  return result;
}

function parseCredentialTuple(value) {
  const text = safeString(value);
  if (!text) return null;

  const separator = text.includes('/') ? '/' : text.includes(',') ? ',' : null;
  if (!separator) return null;

  const parts = text.split(separator).map((item) => safeString(item)).filter(Boolean);
  if (parts.length !== 4) return null;
  if (parts.some((part) => part.length > 40)) return null;

  const [username, password, companyCode, branchCode] = parts;

  if (!username || !password || !companyCode || !branchCode) return null;
  if (looksLikeEmployeeCode(username) && /pass(word)?/i.test(text)) return null;

  return { username, password, companyCode, branchCode, raw: text };
}

function buildVersionDisplay(version, credentials) {
  const lines = [];
  if (version) lines.push(`Version: ${version}`);
  if (credentials) {
    lines.push(`Username: ${credentials.username}`);
    lines.push(`Password: ${credentials.password}`);
    lines.push(`Company Code: ${credentials.companyCode}`);
    lines.push(`Branch Code: ${credentials.branchCode}`);
  }
  return lines.join('\n');
}

function extractExplicitTestData(text) {
  const employeeCodes = [];
  const codePatterns = [
    /\bemployee\s*code\s*[:=-]?\s*([A-Za-z0-9_-]{1,30})/gi,
    /\bemp(?:loyee)?\s*[:#-]?\s*([A-Za-z0-9_-]{1,30})/gi,
    /\bemployee\s+([A-Za-z][A-Za-z0-9_-]{0,20})\b/gi
  ];

  for (const pattern of codePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const code = safeString(match[1]);
      if (code && !employeeCodes.includes(code) && !looksLikeKnownScreenWord(code)) {
        employeeCodes.push(code);
      }
    }
  }

  const examplePasswords = [];
  const passwordPattern = /\bpassword\s*[:=-]?\s*([^\s,.;)]+)/gi;
  let passwordMatch;
  while ((passwordMatch = passwordPattern.exec(text)) !== null) {
    const value = safeString(passwordMatch[1]);
    if (value && !examplePasswords.includes(value)) {
      examplePasswords.push(value);
    }
  }

  return { employee_codes: employeeCodes, example_passwords: examplePasswords };
}

function getSafeNavigationHint(text) {
  const normalized = safeString(text).toLowerCase();
  const hints = [];

  const financialTransactions = [
    'overtime',
    'other income',
    'other deduction',
    'loan',
    'salary raise',
    'allowance raise',
    'non-payroll benefit transactions',
    'non-payroll benefit raise',
    'part time transactions',
    'permanent deduction transactions'
  ];

  const leaveTransactions = [
    'leave',
    'vacation',
    'vacations compensation',
    'vacations adjustment',
    'compound vacations'
  ];

  if (financialTransactions.some((item) => normalized.includes(item))) {
    hints.push('Safe path allowed only because the mentioned transaction matches a known rule: Workforce Management -> Financial Transactions -> Employees Transactions.');
  }

  if (leaveTransactions.some((item) => normalized.includes(item))) {
    hints.push('Safe path allowed only because the mentioned transaction matches a known rule: Workforce Management -> Leave Management -> Employees Transactions.');
  }

  if (normalized.includes('vacations balances')) {
    hints.push('Safe hint: Vacations Balances is reached from Workforce Management tab.');
  }

  if (/(add|create|define|new)\s+employee|personnel information/.test(normalized)) {
    hints.push('Safe hint: Employees -> Personnel Information can be used only for adding or editing basic employee information.');
  }

  if (/salary|allowance|social security|insurance|financial information/.test(normalized)) {
    hints.push('Safe hint: Employees -> Financial Information can be used only for employee financial data such as salary, allowance, social security, or insurance.');
  }

  if (normalized.includes('salary calculation')) {
    hints.push('Safe hint: Salary Calculation is under Workforce Management tab because the user explicitly mentioned it.');
  }

  if (normalized.includes('termination') || normalized.includes('employee termination')) {
    hints.push('Safe hint: Employee Termination is under Workforce Management tab because the user explicitly mentioned termination.');
  }

  if (
    normalized.includes('system parameters') ||
    normalized.includes('working hours per day') ||
    normalized.includes('number of yearly salaries') ||
    normalized.includes('working days per month') ||
    normalized.includes('is specified according to calendar days') ||
    normalized.includes('cut off date') ||
    normalized.includes('configuration system')
  ) {
    hints.push('Safe hint: Setting -> System Parameters may be referenced only because the user explicitly mentioned System Parameters or one of its known options.');
  }

  return hints;
}

function applyParsedMenaitechContext(report, parsedContext, latestUserRequest, currentReport) {
  const next = normalizeReport(report);

  if (parsedContext.versionDisplay) {
    next.Version = parsedContext.versionDisplay;
  } else if (!next.Version && currentReport?.Version) {
    next.Version = currentReport.Version;
  }

  next.Version = sanitizeForbiddenGuesses(next.Version, latestUserRequest, parsedContext);
  next.Steps_to_Reproduce = sanitizeSteps(next.Steps_to_Reproduce, latestUserRequest, parsedContext);
  next.Title = sanitizeForbiddenGuesses(next.Title, latestUserRequest, parsedContext);
  next.Description = sanitizeForbiddenGuesses(next.Description, latestUserRequest, parsedContext);
  next.Expected_Result = sanitizeForbiddenGuesses(next.Expected_Result, latestUserRequest, parsedContext);
  next.Actual_Result = sanitizeForbiddenGuesses(next.Actual_Result, latestUserRequest, parsedContext);
  next.Impact = sanitizeForbiddenGuesses(next.Impact, latestUserRequest, parsedContext);

  return next;
}

function sanitizeSteps(steps, latestUserRequest, parsedContext) {
  const safeSteps = normalizeSteps(steps);
  return safeSteps.map((step) => sanitizeForbiddenGuesses(step, latestUserRequest, parsedContext));
}

function sanitizeForbiddenGuesses(value, latestUserRequest, parsedContext) {
  let text = safeString(value);
  if (!text) return '';

  text = text.replace(/\bEnvironment\s*:/gi, '');

  const userText = safeString(latestUserRequest);
  const explicitSystems = parsedContext.explicit_system_names || [];
  const allowedFragments = [
    ...explicitSystems,
    ...(parsedContext.safe_navigation_hint || []).flatMap((hint) => extractAllowedPathTokens(hint)),
    'System Parameters',
    'Personnel Information',
    'Financial Information',
    'Salary Calculation',
    'Employee Termination',
    'Vacations Balances'
  ];

  const protectedTerms = [
    'MenaPAY', 'MenaHR', 'MenaTA', 'MenaME web', 'MenaME Mobile', 'MenaBI',
    'Salary Calculation', 'Employee Termination', 'Personnel Information',
    'Financial Information', 'System Parameters', 'Vacations Balances'
  ];

  for (const term of protectedTerms) {
    const mentionedInUser = new RegExp(escapeRegex(term), 'i').test(userText);
    const allowedByHint = allowedFragments.some((item) => item.toLowerCase() === term.toLowerCase());
    if (!mentionedInUser && !allowedByHint) {
      text = text.replace(new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi'), '').replace(/\s{2,}/g, ' ').trim();
    }
  }

  return text;
}

function extractAllowedPathTokens(hint) {
  const tokens = [];
  const known = [
    'Workforce Management', 'Financial Transactions', 'Employees Transactions', 'Leave Management',
    'Vacations Balances', 'Setting', 'System Parameters', 'Employees', 'Personnel Information',
    'Financial Information', 'Salary Calculation', 'Employee Termination'
  ];
  for (const item of known) {
    if (new RegExp(escapeRegex(item), 'i').test(hint)) {
      tokens.push(item);
    }
  }
  return tokens;
}

function preserveUnrequestedFields(baseReport, updatedReport, latestUserRequest) {
  const base = normalizeReport(baseReport);
  const next = normalizeReport(updatedReport);
  const request = safeString(latestUserRequest).toLowerCase();

  const fieldPatterns = {
    Title: /(title|subject|headline)/,
    Description: /(description|details|rewrite description|shorten description|expand description)/,
    Steps_to_Reproduce: /(steps|step|reproduce|scenario|test data|employee code)/,
    Expected_Result: /(expected)/,
    Actual_Result: /(actual)/,
    Version: /(version|release|build|credential|credentials|login|username|password|company code|branch code)/,
    Severity: /(severity)/,
    Priority: /(priority)/,
    Impact: /(impact)/,
    Attachments: /(attachment|attachments|screenshot|video|file)/
  };

  for (const [field, pattern] of Object.entries(fieldPatterns)) {
    const wasMentioned = pattern.test(request);
    const containsExistingText = safeString(base[field]) && request.includes(safeString(base[field]).toLowerCase());
    const shouldUpdate = wasMentioned || containsExistingText || (!safeString(base[field]) && safeString(next[field]));
    if (!shouldUpdate) {
      next[field] = base[field];
    }
  }

  return next;
}

function applyExplicitFieldOverrides(report, latestUserRequest) {
  const next = normalizeReport(report);
  const request = safeString(latestUserRequest);

  if (/remove\s+attachments?|no\s+attachments?/i.test(request)) {
    next.Attachments = '';
  }

  if (/remove\s+version|clear\s+version/i.test(request)) {
    next.Version = '';
  }

  return next;
}

function applyConservativeClassification(report, latestUserRequest, currentReport) {
  const next = normalizeReport(report);
  const request = safeString(latestUserRequest).toLowerCase();

  const explicitlyChangesSeverity = /severity/i.test(request);
  const explicitlyChangesPriority = /priority/i.test(request);

  if (!next.Severity) {
    next.Severity = currentReport?.Severity || inferSeverity(request);
  }
  if (!next.Priority) {
    next.Priority = currentReport?.Priority || inferPriority(request);
  }

  if (!explicitlyChangesSeverity && currentReport?.Severity && !hasStrongImpactSignal(request)) {
    next.Severity = currentReport.Severity;
  }

  if (!explicitlyChangesPriority && currentReport?.Priority && !hasStrongImpactSignal(request)) {
    next.Priority = currentReport.Priority;
  }

  return next;
}

function inferSeverity(text) {
  if (/(security|data loss|wrong payroll|wrong salary|financial corruption|system[- ]wide|cannot continue|blocker)/i.test(text)) {
    return 'High';
  }
  if (/(ui|cosmetic|alignment|spacing|typo)/i.test(text)) {
    return 'Low';
  }
  return 'Medium';
}

function inferPriority(text) {
  if (/(deadline|urgent|payroll run|production outage|cannot continue)/i.test(text)) {
    return 'High';
  }
  if (/(ui|cosmetic|alignment|spacing|typo)/i.test(text)) {
    return 'Low';
  }
  return 'Medium';
}

function hasStrongImpactSignal(text) {
  return /(security|data loss|wrong payroll|wrong salary|financial corruption|system[- ]wide|production outage|blocker|cannot continue|deadline)/i.test(text);
}

function finalizeReport(report, currentReport, isRevision) {
  const next = normalizeReport(report);

  if (!next.Version) {
    next.Version = currentReport?.Version || '';
  }

  if (!next.Title && isRevision && currentReport?.Title) next.Title = currentReport.Title;
  if (!next.Description && isRevision && currentReport?.Description) next.Description = currentReport.Description;
  if (!next.Steps_to_Reproduce.length && isRevision && currentReport?.Steps_to_Reproduce?.length) {
    next.Steps_to_Reproduce = currentReport.Steps_to_Reproduce;
  }
  if (!next.Expected_Result && isRevision && currentReport?.Expected_Result) next.Expected_Result = currentReport.Expected_Result;
  if (!next.Actual_Result && isRevision && currentReport?.Actual_Result) next.Actual_Result = currentReport.Actual_Result;
  if (!next.Impact && isRevision && currentReport?.Impact) next.Impact = currentReport.Impact;
  if (!next.Attachments && isRevision && currentReport?.Attachments) next.Attachments = currentReport.Attachments;

  next.Version = normalizeVersionValue(next.Version);
  return next;
}

function extractJSONString(rawContent) {
  const text = safeString(rawContent);
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) {
    throw new Error('No JSON object found in response');
  }
  return text.slice(first, last + 1);
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeReadText(response) {
  return response.text().catch(() => '');
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looksLikeEmployeeCode(value) {
  return /^(?:p|emp|employee)[a-z0-9_-]{0,20}$/i.test(value);
}

function looksLikeKnownScreenWord(value) {
  return /^(open|click|save|employee|employees|screen|tab|setting|settings|system|parameters)$/i.test(value);
}

function isLikelyEmployeeExample(value) {
  return /employee\s*code|\bemp\b|\bemployee\b/i.test(value);
}
