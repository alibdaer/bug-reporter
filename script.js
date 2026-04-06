// ===== State Management =====
const state = {
    conversation: [],
    attachments: [],
    report: null,
    isProcessing: false
};

// ===== DOM Elements =====
const els = {
    chat: document.getElementById('chat-container'),
    input: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    attachBtn: document.getElementById('attach-btn'),
    fileInput: document.getElementById('file-input'),
    charCount: document.getElementById('char-count'),
    attachmentPreview: document.getElementById('attachment-preview'),
    reportPanel: document.getElementById('report-panel'),
    reportContent: document.getElementById('report-content'),
    loading: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    themeToggle: document.getElementById('theme-toggle')
};

// ===== Theme Management =====
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}
function updateThemeIcon(theme) {
    els.themeToggle.querySelector('.icon').textContent = theme === 'dark' ? '☀️' : '🌙';
}
initTheme();
els.themeToggle.addEventListener('click', toggleTheme);

// ===== Input Handling =====
els.input.addEventListener('input', () => {
    els.charCount.textContent = `${els.input.value.length}/2000`;
    els.sendBtn.disabled = els.input.value.trim().length === 0 && state.attachments.length === 0;
    autoResize(els.input);
});
els.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
els.sendBtn.addEventListener('click', sendMessage);

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

// ===== Attachments =====
els.attachBtn.addEventListener('click', () => els.fileInput.click());
els.fileInput.addEventListener('change', e => {
    Array.from(e.target.files).forEach(file => {
        if (file.size > 5 * 1024 * 1024) return alert(`الملف ${file.name} تجاوز 5MB`);
        const reader = new FileReader();
        reader.onload = ev => {
            state.attachments.push({ name: file.name, type: file.type, data: ev.target.result });
            renderAttachments();
        };
        reader.readAsDataURL(file);
    });
    els.fileInput.value = '';
});
window.removeAttachment = i => {
    state.attachments.splice(i, 1);
    renderAttachments();
};
function renderAttachments() {
    els.attachmentPreview.innerHTML = state.attachments.map((f, i) => `
        <div class="file-tag">📄 ${f.name} <span class="remove" onclick="removeAttachment(${i})">✕</span></div>
    `).join('');
    els.sendBtn.disabled = els.input.value.trim().length === 0 && state.attachments.length === 0;
}

// ===== Chat UI =====
function addMessage(html, isUser = false) {
    const msg = document.createElement('div');
    msg.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    msg.innerHTML = `
        <div class="message-avatar">${isUser ? '👤' : '🤖'}</div>
        <div class="message-content">${html}</div>
    `;
    els.chat.appendChild(msg);
    els.chat.scrollTop = els.chat.scrollHeight;
    return msg;
}
function showTyping() {
    const t = document.createElement('div');
    t.className = 'message bot-message';
    t.id = 'typing';
    t.innerHTML = `<div class="message-avatar">🤖</div><div class="message-content"><div class="typing"><span></span><span></span><span></span></div></div>`;
    els.chat.appendChild(t);
    els.chat.scrollTop = els.chat.scrollHeight;
}
function hideTyping() { const t = document.getElementById('typing'); if (t) t.remove(); }
function showLoading(txt) { els.loadingText.textContent = txt; els.loading.classList.remove('hidden'); }
function hideLoading() { els.loading.classList.add('hidden'); }

// ===== Core Logic =====
async function sendMessage() {
    const text = els.input.value.trim();
    if (!text && state.attachments.length === 0) return;

    const display = text + (state.attachments.length ? `<br><small style="opacity:0.8">📎 ${state.attachments.length} ملف</small>` : '');
    addMessage(display, true);
    els.input.value = '';
    els.charCount.textContent = '0/2000';
    els.sendBtn.disabled = true;
    state.isProcessing = true;

    showLoading(text.length < 15 ? '🔍 جاري تحليل الوصف...' : '🛠️ صياغة التقرير الاحترافي...');

    try {
        const res = await callAI(text);
        if (res.status === 'clarify') {
            addMessage(res.message);
            state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: res.message });
        } else if (res.status === 'report') {
            state.report = res.data;
            addMessage('✅ <strong>تم بنجاح!</strong> التقرير جاهز وفق المعايير العالمية. يمكنك نسخه أو تحميله أدناه.');
            renderReport(res.data);
            state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: 'تم إنشاء التقرير.' });
        }
    } catch (err) {
        console.error(err);
        addMessage('⚠️ عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.');
    } finally {
        hideLoading(); hideTyping();
        state.isProcessing = false;
        els.sendBtn.disabled = els.input.value.trim().length === 0 && state.attachments.length === 0;
        els.input.focus();
    }
}

async function callAI(userText) {
    // Build payload with strict system prompt
    const sysPrompt = `أنت خبير QA/QC محترف بخبرة تتجاوز 20 عاماً في اختبار البرمجيات وكتابة تقارير الأعطال وفق المعايير العالمية (ISTQB, IEEE 829).
دورك الوحيد والحصري هو تحويل وصف المستخدم إلى تقرير Bug احترافي، واضح، ومختصر.

قواعد صارمة:
1. نطاق العمل: ترفض تماماً أي طلب خارج سياق كتابة تقارير الـ Bugs. إذا طُلب منك غير ذلك، اعتذر بأدب واحترافية: "أعتذر، أنا نظام متخصص حصرياً في صياغة تقارير الـ Bug Reports الاحترافية وفق معايير الجودة العالمية. جاهز لتحويل أي عطل تقني تشاركه معي إلى تقرير دقيق فوراً."
2. الأسلوب: احترافي، دقيق، موجز، وخالي من الحشو. تحدث كخبير QA مخضرم.
3. التفاعل الذكي:
   - إذا كان الوصف أقل من 20 كلمة أو مبهماً، اطلب توضيحاً محدداً ومباشراً (مثلاً: "يرجى توضيح خطوات إعادة إنتاج العطل بدقة، أو ذكر المتصفح/نظام التشغيل المستخدم").
   - لا تختلق معلومات. إذا نقصت معلومة، اسأل عنها فقط.
   - احفظ سياق المحادثة بالكامل لتجميع المعلومات تدريجياً حتى اكتمال التقرير.
4. الهيكل النهائي: عندما تتوفر المعلومات الكافية، قدّم التقرير حصرياً كـ JSON صالح بهذا الشكل:
{
  "Title": "...",
  "Description": "...",
  "Steps_to_Reproduce": ["...", "..."],
  "Expected_Result": "...",
  "Actual_Result": "...",
  "Environment": "...",
  "Severity_Priority": "Critical/High/Medium/Low - [سبب مختصر]",
  "Impact": "...",
  "Attachments": "..."
}
التزم بهذه القواعد حرفياً. لا تحيد عن دورك أبداً.`;

    const payload = { messages: [{ role: 'system', content: sysPrompt }, ...state.conversation] };
    if (userText) payload.messages.push({ role: 'user', content: userText });
    if (state.attachments.length > 0) {
        const attInfo = state.attachments.map(a => `- ${a.name} (${a.type})`).join('\n');
        payload.messages[payload.messages.length - 1].content += `\n\n📎 الملفات المرفقة:\n${attInfo}`;
    }

    const res = await fetch('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.type === 'json') return { status: 'report', data: data.content };
    return { status: 'clarify', message: data.content };
}

function renderReport(r) {
    const sevClass = r.Severity_Priority?.toLowerCase().includes('critical') ? 'sev-critical' :
                     r.Severity_Priority?.toLowerCase().includes('high') ? 'sev-high' :
                     r.Severity_Priority?.toLowerCase().includes('medium') ? 'sev-medium' :
                     r.Severity_Priority?.toLowerCase().includes('low') ? 'sev-low' : '';

    els.reportContent.innerHTML = `
        <div class="field-block"><span class="field-label">📌 Title</span>${r.Title || '-'}</div>
        <div class="field-block"><span class="field-label">📝 Description</span>${r.Description || '-'}</div>
        <div class="field-block"><span class="field-label">🔢 Steps to Reproduce</span>${Array.isArray(r.Steps_to_Reproduce) ? r.Steps_to_Reproduce.map((s,i) => `${i+1}. ${s}`).join('\n') : r.Steps_to_Reproduce || '-'}</div>
        <div class="field-block"><span class="field-label">✅ Expected Result</span>${r.Expected_Result || '-'}</div>
        <div class="field-block"><span class="field-label">❌ Actual Result</span>${r.Actual_Result || '-'}</div>
        <div class="field-block"><span class="field-label">🖥️ Environment</span>${r.Environment || '-'}</div>
        <div class="field-block"><span class="field-label">⚠️ Severity / Priority</span><span class="${sevClass}">${r.Severity_Priority || '-'}</span></div>
        <div class="field-block"><span class="field-label">💥 Impact</span>${r.Impact || '-'}</div>
        <div class="field-block"><span class="field-label">📎 Attachments</span>${r.Attachments || 'لا يوجد'}</div>
    `;
    els.reportPanel.classList.remove('hidden');
    els.reportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== Actions =====
function formatReport() {
    const r = state.report; if (!r) return '';
    return `=====================================
           BUG REPORT (AI-Generated)
=====================================
📌 Title: ${r.Title}
📝 Description: ${r.Description}
🔢 Steps to Reproduce: ${Array.isArray(r.Steps_to_Reproduce) ? r.Steps_to_Reproduce.join('\n- ') : r.Steps_to_Reproduce}
✅ Expected Result: ${r.Expected_Result}
❌ Actual Result: ${r.Actual_Result}
🖥️ Environment: ${r.Environment}
⚠️ Severity/Priority: ${r.Severity_Priority}
💥 Impact: ${r.Impact}
📎 Attachments: ${r.Attachments || 'None'}
=====================================`;
}

document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(formatReport()).then(() => {
        const b = document.getElementById('copy-btn'); b.textContent = '✅ تم النسخ';
        setTimeout(() => b.textContent = '📋 نسخ', 1500);
    });
});
document.getElementById('download-btn').addEventListener('click', () => {
    const blob = new Blob([formatReport()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `BugReport-${Date.now()}.txt`; a.click(); URL.revokeObjectURL(a.href);
});
document.getElementById('new-report-btn').addEventListener('click', () => {
    state.conversation = []; state.attachments = []; state.report = null;
    els.chat.innerHTML = `<div class="message bot-message"><div class="message-avatar">🤖</div><div class="message-content"><p><strong>مرحباً بك مجدداً 👋</strong></p><p>جاهز لتحويل الوصف التالي إلى تقرير دقيق.</p><div class="quick-tips">💡 مثال: "المستخدم لا يستطيع تسجيل الدخول عند استخدام متصفح سفاري على الآيفون"</div></div></div>`;
    els.reportPanel.classList.add('hidden');
    renderAttachments();
});