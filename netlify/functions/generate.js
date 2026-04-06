exports.handler = async function(event, context) {
  console.log('🟢 Function triggered');
  
  if (event.httpMethod !== 'POST') {
    console.warn('⚠️ Method not allowed:', event.httpMethod);
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { messages } = JSON.parse(event.body || '{}');
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.length < 10) {
      console.error('❌ API Key missing or invalid:', !!apiKey, apiKey?.substring(0, 5));
      return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    console.log('📡 Sending request to Gemini...');

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
      console.error('❌ Gemini API Error:', geminiRes.status, errText);
      return { statusCode: geminiRes.status, body: JSON.stringify({ error: 'AI service error', details: errText }) };
    }

    const geminiData = await geminiRes.json();
    let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('✅ Gemini response received');

    const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const cleanJSON = jsonMatch ? jsonMatch[1] : raw;

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        console.log('📦 Returning JSON report');
        return { statusCode: 200, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {
      console.log('ℹ️ Not valid JSON, returning as text');
    }

    return { statusCode: 200, body: JSON.stringify({ type: 'text', content: raw }) };

  } catch (error) {
    console.error('💥 Handler crashed:', error.message, error.stack);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error', details: error.message }) };
  }
};
