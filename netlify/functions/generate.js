exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { messages } = JSON.parse(event.body || '{}');
    const hfToken = process.env.HF_API_KEY;

    if (!hfToken) {
      console.error('❌ HF_API_KEY is missing');
      return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    // تجهيز البرومت من المحادثة
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
    const prompt = `You are a professional QA expert. Format the following bug description into a professional JSON bug report.
    
User description:
${userMsgs}

Output ONLY valid JSON with these keys: Title, Description, Steps_to_Reproduce (array), Expected_Result, Actual_Result, Environment, Severity_Priority, Impact, Attachments.`;

    console.log('📡 Calling Hugging Face API...');

    // استخدام موديل مستقر وسريع
    const MODEL_URL = 'https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct';

    const hfRes = await fetch(MODEL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
        'X-Wait-For-Model': 'true' // ينتظر لو الموديل بيدخل وضع السكون
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 1500,
          temperature: 0.1, // منخفض عشان نلتزم بـ JSON
          return_full_text: false,
          stop: ["</s>", "<end_of_turn>"]
        }
      })
    });

    const responseText = await hfRes.text(); // نقرأ النص أولاً عشان نشوف الخطأ لو صار

    if (!hfRes.ok) {
      console.error('❌ HF API Error:', hfRes.status, responseText);
      
      // معالجة الأخطاء الشائعة
      if (hfRes.status === 410) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Model deprecated. Please update code.' }) };
      }
      if (hfRes.status === 503) {
        return { statusCode: 503, body: JSON.stringify({ error: 'Model is loading. Please retry in 20 seconds.' }) };
      }
      if (hfRes.status === 401) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid API Key' }) };
      }
      
      return { statusCode: hfRes.status, body: JSON.stringify({ error: 'AI service error: ' + responseText }) };
    }

    let hfData;
    try {
      hfData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse HF response:', responseText);
      return { statusCode: 500, body: JSON.stringify({ error: 'Invalid response from AI' }) };
    }

    let raw = hfData[0]?.generated_text || '';
    console.log('✅ Received response from AI');

    // استخراج JSON إذا كان محاطاً بـ markdown
    const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const cleanJSON = jsonMatch ? jsonMatch[1] : raw;

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        console.log('📦 Valid JSON report generated');
        return { statusCode: 200, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {
      console.log('ℹ️ Response not valid JSON, returning as text');
    }

    return { statusCode: 200, body: JSON.stringify({ type: 'text', content: raw }) };

  } catch (error) {
    console.error('💥 Handler crashed:', error.message, error.stack);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
