// functions/api/generate.js
// Cloudflare Pages Function - QA Bug Report Generator

export async function onRequest(context) {
  const { request, env } = context;

  // 1. التحقق من طريقة الطلب
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
    // 3. قراءة بيانات الطلب
    const { messages } = await request.json();
    const userContent = messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n\n');

    // 4. البرومبت الاحترافي (مدمج في الخادم لضمان الثبات)
    const systemPrompt = `أنت خبير QA/QC محترف. مهمتك الوحيدة: تحويل وصف المستخدم إلى تقرير Bug بصيغة JSON.
القواعد الصارمة:
1. ارفض أي طلب خارج نطاق تقارير الـ Bugs.
2. إذا كان الوصف <15 كلمة أو غامضاً، اطلب توضيحاً محدداً.
3. أخرج JSON صالح بهذا الهيكل حصراً:
{
  "Title": "عنوان مختصر بالإنجليزي",
  "Description": "وصف دقيق بالعربي أو الإنجليزي",
  "Steps_to_Reproduce": ["خطوة 1", "خطوة 2"],
  "Expected_Result": "النتيجة المتوقعة",
  "Actual_Result": "النتيجة الفعلية",
  "Environment": "المتصفح/نظام التشغيل",
  "Severity_Priority": "Critical/High/Medium/Low - سبب مختصر",
  "Impact": "تأثير العطل",
  "Attachments": "قائمة المرفقات أو لا يوجد"
}
4. لا تضف نصوصاً خارج الـ JSON. التزم بالهيكل حرفياً.`;

    // 5. استدعاء Cloudflare AI API
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
        max_tokens: 1500
      })
    });

    // 6. معالجة استجابة AI
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

    // 7. استخراج JSON بأمان
    let cleanJSON = rawContent;
    const jsonMatch = rawContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch) cleanJSON = jsonMatch[1];

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description && Array.isArray(parsed.Steps_to_Reproduce)) {
        return new Response(JSON.stringify({ type: 'json', content: parsed }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      console.log('ℹ️ AI response not valid JSON');
    }

    // 8. Fallback: إرجاع النص كما هو إذا فشل التحليل
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
