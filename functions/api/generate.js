export async function onRequest(context) {
  const { request, env } = context;

  // السماح فقط بطلبات POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { messages } = await request.json();
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    const systemPrompt = `أنت خبير QA/QC محترف. مهمتك الوحيدة: تحويل وصف المستخدم إلى تقرير Bug احترافي بصيغة JSON.
القواعد:
1. ارفض أي طلب خارج نطاق تقارير الـ Bugs.
2. إذا كان الوصف قصيراً (<15 كلمة)، اطلب توضيح الخطوات والبيئة.
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
    const aiResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
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

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('❌ AI Error:', aiResponse.status, errText);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: aiResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.result?.response || '';

    // استخراج JSON بأمان
    let cleanJSON = content;
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch) cleanJSON = jsonMatch[1];

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        return new Response(JSON.stringify({ type: 'json', content: parsed }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (e) {
      console.log('ℹ️ Response not valid JSON');
    }

    return new Response(JSON.stringify({ type: 'text', content }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Handler Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
