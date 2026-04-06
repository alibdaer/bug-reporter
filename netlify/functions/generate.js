exports.handler = async function(event, context) {
  console.log('🟢 Function started');
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const hfToken = process.env.HF_API_KEY;
    console.log('🔑 API Key exists:', !!hfToken);

    if (!hfToken) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key missing' }) };
    }

    const { messages } = JSON.parse(event.body || '{}');
    const userText = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');

    // استخدم موديل بسيط وسريع
    const MODEL = 'https://api-inference.huggingface.co/models/microsoft/Phi-3-mini-4k-instruct';
    
    const prompt = `You are a QA expert. Create a professional bug report in JSON format from this description: ${userText}`;

    console.log('📡 Calling API...');

    const response = await fetch(MODEL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hfToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 1000,
          temperature: 0.3,
          return_full_text: false
        }
      })
    });

    console.log('📥 Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, errorText);
      
      if (response.status === 503) {
        return { statusCode: 503, body: JSON.stringify({ error: 'Model loading. Wait 30s and retry.' }) };
      }
      if (response.status === 401) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid API Key' }) };
      }
      
      return { statusCode: response.status, body: JSON.stringify({ error: errorText }) };
    }

    const data = await response.json();
    console.log('✅ Success:', data);

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
      body: JSON.stringify({
        error: 'Internal error',
        details: error.message
      })
    };
  }
};
