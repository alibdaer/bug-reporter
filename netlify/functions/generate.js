exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { messages } = JSON.parse(event.body || '{}');
    const hfToken = process.env.HF_API_KEY;

    if (!hfToken) {
      return { statusCode: 500, body: JSON.stringify({ error: 'HF API key not configured' }) };
    }

    // بناء البرومت من المحادثة
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');
    const prompt = `${systemMsg}\n\n${userMsgs}`.trim();

    const hfRes = await fetch(
      'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hfToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 1024,
            temperature: 0.3,
            return_full_text: false,
            stop: ["</s>"]
          }
        })
      }
    );

    if (!hfRes.ok) {
      const err = await hfRes.text();
      console.error('HF Error:', hfRes.status, err);
      // إذا الموديل لسه بيحمل، انتظر شوي
      if (hfRes.status === 503) {
        return { statusCode: 503, body: JSON.stringify({ error: 'Model loading, please retry in 20s' }) };
      }
      return { statusCode: hfRes.status, body: JSON.stringify({ error: 'AI service error' }) };
    }

    const hfData = await hfRes.json();
    let raw = hfData[0]?.generated_text || '';

    // استخراج JSON إذا وجد
    const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const cleanJSON = jsonMatch ? jsonMatch[1] : raw;

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        return { statusCode: 200, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {}

    return { statusCode: 200, body: JSON.stringify({ type: 'text', content: raw }) };

  } catch (error) {
    console.error('Handler Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
