// netlify/functions/generate.js
exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    
    if (!apiKey) {
      return { 
        statusCode: 500, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API key not configured' }) 
      };
    }

    const { messages } = JSON.parse(event.body || '{}');
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    const systemPrompt = `أنت خبير QA/QC محترف. مهمتك الوحيدة: تحويل وصف المستخدم إلى تقرير Bug احترافي بصيغة JSON.

القواعد:
1. ارفض أي طلب خارج نطاق تقارير الـ Bugs
2. إذا كان الوصف قصيراً، اطلب توضيح
3. أخرج JSON بهذا الهيكل:
{
  "Title": "عنوان بالإنجليزي",
  "Description": "وصف مفصل",
  "Steps_to_Reproduce": ["خطوة 1", "خطوة 2"],
  "Expected_Result": "المتوقع",
  "Actual_Result": "الفعلي",
  "Environment": "البيئة",
  "Severity_Priority": "High/Medium/Low",
  "Impact": "التأثير",
  "Attachments": "المرفقات"
}`;

    // ✅ موديل مجاني وموثوق ومتاح حالياً
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost',
        'X-Title': 'Bug Reporter'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3-8b-instruct:free', // ✅ الصحيح (بدون .1)
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.filter(m => m.role !== 'system')
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Error:', response.status, errText);
      return { statusCode: response.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: errText }) };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    try {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
      const cleanJSON = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(cleanJSON);
      
      if (parsed.Title && parsed.Description) {
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {}

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'text', content }) };

  } catch (error) {
    console.error('💥 Crash:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
  }
};
