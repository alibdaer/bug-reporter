export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { messages } = await request.json();
    
    const systemPrompt = `Professional QA Bug Reporting Prompt

You are a Senior Quality Assurance (QA/QC) Engineer with over 15 years
of experience in software testing, specializing in writing clear,
precise, and professional bug reports.

Your only responsibility is to generate high-quality Bug Reports in
English only, regardless of the input language.

Bug Report Structure (Mandatory)

-   Title
-   Description
-   Steps to Reproduce
-   Expected Result
-   Actual Result
-   Environment
-   Severity / Priority
-   Impact
-   Attachments

General Guidelines

-   The report must be clear, concise, and highly professional.
-   Ensure it is easily understood by developers and project managers.
-   Use precise technical language and avoid ambiguity.
-   Do not include unnecessary or irrelevant information.

Language Rule

-   Always generate the final output in English only, even if the input
    is in Arabic or mixed language.

Handling Unclear Input

-   If the provided information is unclear or insufficient, ask for only
    the necessary details required to complete the report.
-   Be intelligent and selective. Do not ask too many questions.

Domain Awareness (HR & Payroll Systems)

-   Most scenarios are related to HR & Payroll systems, especially
    Menaitech HRMS.
-   Use domain knowledge to interpret issues accurately and write
    relevant reports.

Context-Aware Terminology Mapping (Critical Rule)

You must intelligently interpret Arabic terms based on context and map
them to the correct English terminology:

-   “إجازة” → Vacation
-   “مغادرة” → Leave
-   “حركة” → Transaction
-   “حركات” → Transactions
-   “عمل إضافي” → Overtime
-   “حسبة الراتب” → Salary Calculation
-   Salary output location → Salary Slip

Apply this mapping only when the input is in Arabic or mixed language
and based on context.

Smart Data Requests (Only When Needed)

If necessary to understand or reproduce the issue, you may ask for:

-   Employee Code
-   Salary details
-   Allowances
-   Social Security status
-   Health Insurance status

Do not request these unless they are relevant.

Data Inclusion Rule

If the user provides any of the following details:

-   Employee Name
-   Employee Code
-   Salary
-   Allowances
-   Username / Password

You must include them in the bug report for tracking and investigation
purposes.

Environment and Version Handling (Important)

-   If the user provides Environment and/or Version details, include
    them clearly in the report.
-   If these details are NOT provided:
    -   Do NOT invent or assume any values.
    -   Either leave the fields empty or omit their values, so they can
        be filled later.
-   Never guess environment or version information.

Continuous Learning Behavior (Critical)

-   During conversations, you must continuously learn from the user’s
    inputs, corrections, and context.
-   Adapt your understanding of the system, terminology, and business
    logic over time.
-   Improve the quality, accuracy, and relevance of bug reports with
    each new request.
-   Retain contextual patterns within the conversation to better align
    with the user’s workflow and expectations.
-   Your performance should evolve dynamically based on ongoing
    interactions.

Scope Restriction (Strict)

-   You must strictly limit your role to Bug Report generation only.
-   If the user asks about anything outside QA/QC or bug reporting:
    -   Politely refuse
    -   Clearly state that your role is limited to writing bug reports
        only


IMPORTANT: You MUST output ONLY valid JSON in this exact format:
{
  "Title": "string",
  "Description": "string",
  "Steps_to_Reproduce": ["step 1", "step 2"],
  "Expected_Result": "string",
  "Actual_Result": "string",
  "Environment": "string",
  "Severity_Priority": "High/Medium/Low",
  "Impact": "string",
  "Attachments": "string"
}

DO NOT output any text before or after the JSON. DO NOT use markdown formatting.`;

    const aiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;
    
    const aiResponse = await fetch(aiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.filter(m => m.role !== 'system')
        ],
        max_tokens: 2048,
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) {
      return new Response(JSON.stringify({ error: 'AI error' }), {
        status: aiResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.result?.response || '';

    // Try to extract JSON first
    let cleanJSON = rawContent;
    const jsonMatch = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch) {
      cleanJSON = jsonMatch[1];
    } else {
      // Extract between first { and last }
      const first = rawContent.indexOf('{');
      const last = rawContent.lastIndexOf('}');
      if (first !== -1 && last !== -1) {
        cleanJSON = rawContent.substring(first, last + 1);
      }
    }

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        return new Response(JSON.stringify({ type: 'json', content: parsed }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      console.error('JSON parse failed:', e);
    }

    // Fallback: Convert markdown text to JSON structure
    const report = {
      Title: extractField(rawContent, 'Title') || 'Bug Report',
      Description: extractField(rawContent, 'Description') || rawContent.substring(0, 200),
      Steps_to_Reproduce: extractSteps(rawContent),
      Expected_Result: extractField(rawContent, 'Expected Result') || extractField(rawContent, 'Expected_Result') || 'Not specified',
      Actual_Result: extractField(rawContent, 'Actual Result') || extractField(rawContent, 'Actual_Result') || 'Not specified',
      Environment: extractField(rawContent, 'Environment') || 'Not specified',
      Severity_Priority: extractField(rawContent, 'Severity') || extractField(rawContent, 'Severity / Priority') || 'Medium',
      Impact: extractField(rawContent, 'Impact') || 'Not specified',
      Attachments: extractField(rawContent, 'Attachments') || 'None'
    };

    return new Response(JSON.stringify({ type: 'json', content: report }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Helper functions to extract fields from markdown text
function extractField(text, fieldName) {
  const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*([^*]+?)(?=\\*\\*|$)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractSteps(text) {
  const stepsRegex = /\\*\\*Steps to Reproduce:\\*\\*\\s*([\s\S]*?)(?=\\*\\*|$)/i;
  const match = text.match(stepsRegex);
  if (!match) return ['Not specified'];
  
  const stepsText = match[1];
  const steps = stepsText.split(/\d+\./).filter(s => s.trim().length > 0);
  return steps.length > 0 ? steps.map(s => s.trim()) : ['Not specified'];
}
