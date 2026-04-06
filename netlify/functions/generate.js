exports.handler = async function(event, context) {
  // السماح فقط بطلبات POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { messages } = JSON.parse(event.body || '{}');
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    // استدعاء Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini Error:', errText);
      return { statusCode: 500, body: JSON.stringify({ error: 'AI service error' }) };
    }

    const geminiData = await geminiRes.json();
    let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // استخراج JSON إذا كان موجوداً داخل markdown
    const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const cleanJSON = jsonMatch ? jsonMatch[1] : raw;

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        return { statusCode: 200, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {
      // ليس JSON صالح، نتعامل معه كنص توضيحي
    }

    return { statusCode: 200, body: JSON.stringify({ type: 'text', content: raw }) };

  } catch (error) {
    console.error('Handler Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
