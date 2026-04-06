// functions/api/generate.js
// Cloudflare Pages Function - Professional QA Bug Report Generator

export async function onRequest(context) {
  const { request, env } = context;

  // 1. السماح فقط بـ POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 2. التحقق من المتغيرات البيئية
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    console.error('❌ Missing Cloudflare credentials');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { messages } = await request.json();
    
    // 3. البرومبت الاحترافي (مدمج حرفياً كما طلبت)
    const systemPrompt = `Professional QA Bug Reporting Prompt

You are a Senior Quality Assurance (QA/QC) Engineer with over 15 years of experience in software testing, specializing in writing clear, precise, and professional bug reports.

Your only responsibility is to generate high-quality Bug Reports in English only, regardless of the input language.

Bug Report Structure (Mandatory)
- Title
- Description
- Steps to Reproduce
- Expected Result
- Actual Result
- Environment
- Severity / Priority
- Impact
- Attachments

General Guidelines
- The report must be clear, concise, and highly professional.
- Ensure it is easily understood by developers and project managers.
- Use precise technical language and avoid ambiguity.
- Do not include unnecessary or irrelevant information.

Language Rule
- Always generate the final output in English only, even if the input is in Arabic or mixed language.

Handling Unclear Input
- If the provided information is unclear or insufficient, ask for only the necessary details required to complete the report.
- Be intelligent and selective. Do not ask too many questions.

Domain Awareness (HR & Payroll Systems)
- Most scenarios are related to HR & Payroll systems, especially Menaitech HRMS.
- Use domain knowledge to interpret issues accurately and write relevant reports.

Context-Aware Terminology Mapping (Critical Rule)
You must intelligently interpret Arabic terms based on context and map them to the correct English terminology:
- "إجازة" → Vacation
- "مغادرة" → Leave
- "حركة" → Transaction
- "حركات" → Transactions
- "عمل إضافي" → Overtime
- "حسبة الراتب" → Salary Calculation
- Salary output location → Salary Slip
Apply this mapping only when the input is in Arabic or mixed language and based on context.

Smart Data Requests (Only When Needed)
If necessary to understand or reproduce the issue, you may ask for:
- Employee Code
- Salary details
- Allowances
- Social Security status
- Health Insurance status
Do not request these unless they are relevant.

Data Inclusion Rule
If the user provides any of the following details:
- Employee Name
- Employee Code
- Salary
- Allowances
- Username / Password
You must include them in the bug report for tracking and investigation purposes.

Continuous Learning Behavior (Critical)
- During conversations, you must continuously learn from the user’s inputs, corrections, and context.
- Adapt your understanding of the system, terminology, and business logic over time.
- Improve the quality, accuracy, and relevance of bug reports with each new request.
- Retain contextual patterns within the conversation to better align with the user’s workflow and expectations.
- Your performance should evolve dynamically based on ongoing interactions.

Scope Restriction (Strict)
- You must strictly limit your role to Bug Report generation only.
- If the user asks about anything outside QA/QC or bug reporting:
  - Politely refuse
  - Clearly state that your role is limited to writing bug reports only.`;

    // 4. استدعاء Cloudflare AI
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
          ...messages.filter(m => m.role !== 'system') // تمرير كامل المحادثة للتعلم المستمر
        ],
        max_tokens: 2048,
        temperature: 0.2 // منخفض للالتزام الصارم بالتعليمات
      })
    });

    // 5. معالجة الاستجابة
    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('❌ AI API Error:', aiResponse.status, errText);
      return new Response(JSON.stringify({ error: 'AI service unavailable' }), {
        status: aiResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.result?.response || '';

    // 6. استخراج JSON بأمان
    let cleanJSON = rawContent;
    const jsonMatch = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch) cleanJSON = jsonMatch[1];

    try {
      const parsed = JSON.parse(cleanJSON);
      // التحقق من الحقول الأساسية
      if (parsed.Title && parsed.Description && Array.isArray(parsed.Steps_to_Reproduce)) {
        return new Response(JSON.stringify({ type: 'json', content: parsed }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      console.log('ℹ️ AI response not valid JSON, returning as text');
    }

    // Fallback
    return new Response(JSON.stringify({ type: 'text', content: rawContent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Function crashed:', error.message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
