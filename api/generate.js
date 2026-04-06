// Vercel Serverless Function - Simple & Reliable
export default async function handler(req, res) {
  // Allow only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Call Gemini API
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
      return res.status(500).json({ error: 'AI service error' });
    }

    const geminiData = await geminiRes.json();
    let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Try to extract JSON if wrapped in markdown
    const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const cleanJSON = jsonMatch ? jsonMatch[1] : raw;

    try {
      const parsed = JSON.parse(cleanJSON);
      if (parsed.Title && parsed.Description) {
        return res.status(200).json({ type: 'json', content: parsed });
      }
    } catch (e) {
      // Not valid JSON -> treat as clarification text
    }

    // Fallback: return as text response
    return res.status(200).json({ type: 'text', content: raw });

  } catch (error) {
    console.error('Handler Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
