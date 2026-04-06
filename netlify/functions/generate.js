// netlify/functions/generate.js
// AI Bug Report Generator - Final Version (Powered by OpenRouter)

exports.handler = async function(event, context) {
  // السماح فقط بطلبات POST
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    
    // التحقق من مفتاح الـ API
    if (!apiKey) {
      console.error('❌ OPENROUTER_API_KEY is missing');
      return { 
        statusCode: 500, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API key not configured' }) 
      };
    }

    // تحليل جسم الطلب
    const { messages } = JSON.parse(event.body || '{}');
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    // 🎯 البرومبت الاحترافي (نسخة OpenRouter المحسنة)
    const systemPrompt = `أنت خبير QA/QC محترف بخبرة 20+ عاماً. مهمتك الوحيدة هي تحويل وصف المستخدم إلى تقرير Bug احترافي.

⚠️ قواعد صارمة:
1. **نطاق العمل**: ترفض تماماً أي طلب غير كتابة تقارير الـ Bugs. إذا طُلب منك غير ذلك، اعتذر واحترافية: "أعتذر، أنا نظام متخصص حصرياً في صياغة تقارير الـ Bug Reports الاحترافية."
2. **التفاعل الذكي**: إذا كان الوصف أقل من 15 كلمة، اطلب توضيحاً محدداً (الخطوات، البيئة).
3. **الهيكل**: أخرج التقرير حصرياً كـ JSON صالح بهذا الهيكل:
{
  "Title": "عنوان واضح بالإنجليزي",
  "Description": "وصف شامل ومفصل",
  "Steps_to_Reproduce": ["خطوة 1", "خطوة 2"],
  "Expected_Result": "النتيجة المتوقعة",
  "Actual_Result": "النتيجة الفعلية",
  "Environment": "البيئة",
  "Severity_Priority": "High/Medium/Low - [سبب]",
  "Impact": "التأثير",
  "Attachments": "ذكر المرفقات"
}

🎯 المعايير:
- لا حشو، لا مواضيع جانبية.
- التزم بالهيكل JSON تماماً.`;

    // 📡 استدعاء OpenRouter API
    // ملاحظة: الـ Headers التالية إلزامية لاستخدام الموديلات المجانية
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost', // مطلوب للطبقة المجانية
        'X-Title': 'Bug Reporter Tool'       // مطلوب للطبقة المجانية
      },
      body: JSON.stringify({
        // ✅ هذا الموديل مجاني 100% ومستقر جداً
        model: 'meta-llama/llama-3.1-8b-instruct:free', 
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.filter(m => m.role !== 'system')
        ],
        temperature: 0.1, // نخفض الحرارة لزيادة الالتزام بالتعليمات
        max_tokens: 2048,
        response_format: { type: 'json_object' } // يجبر الموديل على إخراج JSON
      })
    });

    // 📥 معالجة الاستجابة
    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ OpenRouter Error:', response.status, errText);
      
      if (response.status === 401) return { statusCode: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid API Key' }) };
      if (response.status === 429) return { statusCode: 429, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Rate limit exceeded.' }) };
      
      return { statusCode: response.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI service error' }) };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    console.log('✅ OpenRouter Success');

    // 🔍 استخراج JSON
    let cleanJSON = content;
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch) cleanJSON = jsonMatch[1];

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {
      console.log('ℹ️ Not valid JSON, returning as text');
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'text', content }) };

  } catch (error) {
    console.error('💥 Handler crashed:', error.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
