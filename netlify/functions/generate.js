// netlify/functions/generate.js
// AI Bug Report Generator - Final Stable Version (Cloudflare Workers AI)

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const accountId = process.env.CF_ACCOUNT_ID;
    const apiToken = process.env.CF_API_TOKEN;

    if (!accountId || !apiToken) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Cloudflare credentials missing' }) };
    }

    const { messages } = JSON.parse(event.body || '{}');
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    const systemPrompt = `أنت خبير QA/QC محترف. مهمتك الوحيدة: تحويل وصف المستخدم إلى تقرير Bug احترافي بصيغة JSON.

القواعد:
1. ارفض أي طلب خارج نطاق تقارير الـ Bugs.
2. إذا كان الوصف قصيراً، اطلب توضيح.
3. أخرج JSON بهذا الهيكل فقط:
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

    // استدعاء Cloudflare AI
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.filter(m => m.role !== 'system')
          ]
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('❌ Cloudflare Error:', response.status, err);
      return { statusCode: response.status, body: JSON.stringify({ error: 'AI Error' }) };
    }

    const data = await response.json();
    const content = data.result?.response || '';

    // استخراج JSON
    try {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
      const cleanJSON = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(cleanJSON);
      
      if (parsed.Title && parsed.Description) {
        return { statusCode: 200, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {
      console.log('Not valid JSON');
    }

    return { statusCode: 200, body: JSON.stringify({ type: 'text', content }) };

  } catch (error) {
    console.error('💥 Crash:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
