// netlify/functions/generate.js
// AI Bug Report Generator - Professional QA Expert

exports.handler = async function(event, context) {
  // السماح فقط بطلبات POST
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const groqKey = process.env.GROQ_API_KEY;
    
    // التحقق من مفتاح الـ API
    if (!groqKey) {
      console.error('❌ GROQ_API_KEY is missing in environment variables');
      return { 
        statusCode: 500, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API key not configured' }) 
      };
    }

    // تحليل جسم الطلب
    const { messages } = JSON.parse(event.body || '{}');
    
    // استخراج الرسائل من المحادثة
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    // 🎯 البرومبت الاحترافي القوي (النسخة الكاملة)
    const systemPrompt = `أنت خبير QA/QC محترف بخبرة 20+ عاماً في اختبار البرمجيات وكتابة التقارير وفق المعايير العالمية (ISTQB, IEEE 829).

📋 مهمتك الوحيدة: تحويل وصف المستخدم إلى تقرير Bug احترافي، واضح، ومختصر.

⚠️ قواعد صارمة:
1. نطاق العمل: ترفض تماماً أي طلب خارج سياق كتابة تقارير الـ Bugs. إذا طُلب منك غير ذلك، اعتذر بأدب واحترافية: "أعتذر، أنا نظام متخصص حصرياً في صياغة تقارير الـ Bug Reports الاحترافية وفق معايير الجودة العالمية. جاهز لتحويل أي عطل تقني تشاركه معي إلى تقرير دقيق فوراً."
2. الأسلوب: احترافي، دقيق، موجز، وخالي من الحشو. تحدث كخبير QA مخضرم.
3. التفاعل الذكي:
   - إذا كان الوصف أقل من 20 كلمة أو مبهماً، اطلب توضيحاً محدداً ومباشراً: "يرجى توضيح خطوات إعادة إنتاج العطل بدقة، أو ذكر المتصفح/نظام التشغيل المستخدم."
   - لا تختلق معلومات. إذا نقصت معلومة، اسأل عنها فقط.
   - احفظ سياق المحادثة بالكامل لتجميع المعلومات تدريجياً حتى اكتمال التقرير.
4. الهيكل النهائي: عندما تتوفر المعلومات الكافية، قدّم التقرير حصرياً كـ JSON صالح بهذا الشكل:
{
  "Title": "عنوان واضح ومختصر بالإنجليزي",
  "Description": "وصف شامل ومفصل بالعربي أو الإنجليزي",
  "Steps_to_Reproduce": ["خطوة 1", "خطوة 2", "خطوة 3"],
  "Expected_Result": "النتيجة المتوقعة",
  "Actual_Result": "النتيجة الفعلية",
  "Environment": "البيئة (OS, Browser, App Version)",
  "Severity_Priority": "Critical/High/Medium/Low - [سبب مختصر]",
  "Impact": "تأثير المشكلة على المستخدم/النظام",
  "Attachments": "ذكر المرفقات إن وجدت"
}

🎯 معايير الجودة:
- العنوان بالإنجليزي دائماً
- الوصف واضح ومباشر (3-5 أسطر كحد أقصى)
- الخطوات مرقمة ودقيقة وقابلة للتنفيذ
- تقييم Severity منطقي:
  * Critical: النظام معطل أو فقدان بيانات
  * High: feature رئيسية لا تعمل
  * Medium: خلل وظيفي ثانوي أو مشاكل واجهة
  * Low: مشاكل تجميلية أو نصوص
- لا حشو أو تكرار أو معلومات غير ضرورية

التزم بهذه القواعد حرفياً. لا تحيد عن دورك أبداً. لا تفتح مواضيع جانبية. ركّز فقط على كتابة تقرير Bug احترافي.`;

    // 📡 استدعاء Groq API
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        // ✅ الموديل المدعوم حالياً (سريع ومجاني)
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.filter(m => m.role !== 'system')
        ],
        temperature: 0.2, // منخفض للالتزام بالتعليمات
        max_tokens: 2000, // مساحة كافية للتقرير
        response_format: { type: 'json_object' } // يفضّل إخراج JSON
      })
    });

    // 📥 معالجة الاستجابة
    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Groq API Error:', response.status, errText);
      
      // أخطاء شائعة
      if (response.status === 401) {
        return { 
          statusCode: 401, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid API Key' }) 
        };
      }
      if (response.status === 429) {
        return { 
          statusCode: 429, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' }) 
        };
      }
      if (response.status === 500) {
        return { 
          statusCode: 500, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Groq service temporarily unavailable' }) 
        };
      }
      
      return { 
        statusCode: response.status, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'AI service error: ' + errText }) 
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('✅ Received response, length:', content.length);

    // 🔍 استخراج JSON إذا كان محاطاً بـ markdown
    let cleanJSON = content;
    const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch) {
      cleanJSON = jsonMatch[1];
      console.log('🔍 Extracted JSON from markdown');
    }

    // 🧪 محاولة تحليل كـ JSON
    try {
      const parsed = JSON.parse(cleanJSON);
      
      // التحقق من الحقول الأساسية
      if (parsed.Title && parsed.Description) {
        console.log('📦 Valid JSON report generated');
        return { 
          statusCode: 200, 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'json', 
            content: parsed,
            raw: content // للاحتياط
          }) 
        };
      } else {
        console.log('⚠️ JSON missing required fields');
      }
    } catch (e) {
      console.log('ℹ️ Response not valid JSON, returning as text');
    }

    // 📝 فallback: إرجاع النص كما هو
    return { 
      statusCode: 200, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'text', 
        content: content,
        note: 'Response was not valid JSON. Frontend should handle gracefully.'
      }) 
    };

  } catch (error) {
    console.error('💥 Handler crashed:', error.message, error.stack);
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }) 
    };
  }
};
