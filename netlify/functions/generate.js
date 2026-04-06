exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const hfToken = process.env.HF_API_KEY;
    if (!hfToken) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key missing' }) };
    }

    const { messages } = JSON.parse(event.body || '{}');
    const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');

    // ✅ الموديل البسيط والمضمون + الرابط الصحيح
    const MODEL_URL = 'https://api-inference.huggingface.co/models/google/flan-t5-small';
    
    // برومت مبسط يناسب الموديل الصغير
    const prompt = `Bug report: ${userText}. Format: Title, Description, Steps, Expected, Actual, Severity.`;

    const response = await fetch(MODEL_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json',
        'X-Wait-For-Model': 'true'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 500,
          temperature: 0.3
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HF Error:', response.status, errorText);
      
      if (response.status === 503) {
        return { statusCode: 503, body: JSON.stringify({ error: 'Model loading. Retry in 20s.' }) };
      }
      if (response.status === 401) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid API Key' }) };
      }
      if (response.status === 404) {
        return { statusCode: 404, body: JSON.stringify({ error: 'Model not found. Check model name.' }) };
      }
      
      return { statusCode: response.status, body: JSON.stringify({ error: errorText }) };
    }

    const data = await response.json();
    const text = data[0]?.generated_text || 'No response';

    return {
      statusCode: 200,
      body: JSON.stringify({
        type: 'text',
        content: text
      })
    };

  } catch (error) {
    console.error('💥 Crash:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal error', details: error.message })
    };
  }
};
