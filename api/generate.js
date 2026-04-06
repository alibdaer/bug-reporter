export const config = { runtime: 'edge' };

export default async function handler(req) {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    try {
        const { messages } = await req.json();
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return new Response(JSON.stringify({ error: 'API Key missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
                    generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 1024 }
                })
            }
        );

        const geminiData = await geminiRes.json();
        let raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Extract JSON if wrapped in markdown
        const jsonMatch = raw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        const cleanJSON = jsonMatch ? jsonMatch[1] : raw;

        try {
            const parsed = JSON.parse(cleanJSON);
            // Validate minimal fields
            if (parsed.Title && parsed.Description) {
                return new Response(JSON.stringify({ type: 'json', content: parsed }), { headers: { 'Content-Type': 'application/json' } });
            }
        } catch (e) { /* Not JSON or invalid -> fallback to text */ }

        // Fallback: treat as clarification message
        return new Response(JSON.stringify({ type: 'text', content: raw }), { headers: { 'Content-Type': 'application/json' } });

    } catch (err) {
        console.error('AI API Error:', err);
        return new Response(JSON.stringify({ type: 'text', content: '⚠️ عذراً، حدث خطأ تقني مؤقت. يرجى المحاولة خلال لحظات.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
