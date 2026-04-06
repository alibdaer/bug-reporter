exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Groq API key missing' }) };
    }

    const { messages } = JSON.parse(event.body || '{}');
    
    // بناء البرومت من المحادثة
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // ✅ الموديل الجديد المدعوم
        model: 'llama-3.1-8b-instant', 
        messages: [
          { role: 'system', content: systemMsg || 'You are a professional QA expert. Output ONLY valid JSON bug reports with keys: Title, Description, Steps_to_Reproduce, Expected_Result, Actual_Result, Environment, Severity_Priority, Impact, Attachments.' },
          { role: 'user', content: userMsgs }
        ],
        temperature: 0.3,
        max_tokens: 1500,
        response_format: { type: 'json_object' } // يضمن إخراج JSON
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('❌ Groq Error:', response.status, err);
      return { statusCode: response.status, body: JSON.stringify({ error: 'AI service error: ' + err }) };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    try {
      const parsed = JSON.parse(content);
      if (parsed.Title && parsed.Description) {
        return { statusCode: 200, body: JSON.stringify({ type: 'json', content: parsed }) };
      }
    } catch (e) {
      console.log('ℹ️ Response not valid JSON');
    }

    return { statusCode: 200, body: JSON.stringify({ type: 'text', content }) };

  } catch (error) {
    console.error('💥 Crash:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal error', details: error.message }) };
  }
};
