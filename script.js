// script.js - Professional Bug Reporter AI (Enhanced Version)

// ===== State Management =====
const state = {
  conversation: [],
  attachments: [],
  report: null,
  isProcessing: false
};

// ===== DOM Elements =====
let els = {};

// Initialize DOM Elements
function initElements() {
  els = {
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
}

// ===== Theme Management (Light Mode Default) =====
function initTheme() {
  // Light mode is default
  const saved = localStorage.getItem('theme') || 'light';
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
  if (els.themeToggle) {
    els.themeToggle.querySelector('.icon').textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// ===== Input Handling =====
function setupInputHandlers() {
  if (!els.input || !els.sendBtn) return;

  els.input.addEventListener('input', () => {
    if (els.charCount) {
      els.charCount.textContent = `${els.input.value.length}/2000`;
    }
    els.sendBtn.disabled = els.input.value.trim().length === 0 && state.attachments.length === 0;
    autoResize(els.input);
  });

  els.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.sendBtn.addEventListener('click', sendMessage);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

// ===== Attachments =====
function setupAttachmentHandlers() {
  if (!els.attachBtn || !els.fileInput) return;

  els.attachBtn.addEventListener('click', () => els.fileInput.click());
  
  els.fileInput.addEventListener('change', e => {
    Array.from(e.target.files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`الملف ${file.name} تجاوز 5MB`);
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        state.attachments.push({ name: file.name, type: file.type, data: ev.target.result });
        renderAttachments();
      };
      reader.readAsDataURL(file);
    });
    els.fileInput.value = '';
  });
}

window.removeAttachment = i => {
  state.attachments.splice(i, 1);
  renderAttachments();
};

function renderAttachments() {
  if (!els.attachmentPreview) return;
  
  els.attachmentPreview.innerHTML = state.attachments.map((f, i) => `
    <div class="file-tag">📄 ${f.name} <span class="remove" onclick="removeAttachment(${i})">✕</span></div>
  `).join('');
  
  if (els.sendBtn) {
    els.sendBtn.disabled = els.input.value.trim().length === 0 && state.attachments.length === 0;
  }
}

// ===== Chat UI =====
function addMessage(html, isUser = false) {
  if (!els.chat) return;
  
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
  if (!els.chat) return;
  
  const t = document.createElement('div');
  t.className = 'message bot-message';
  t.id = 'typing';
  t.innerHTML = `<div class="message-avatar">🤖</div><div class="message-content"><div class="typing"><span></span><span></span><span></span></div></div>`;
  els.chat.appendChild(t);
  els.chat.scrollTop = els.chat.scrollHeight;
}

function hideTyping() {
  const t = document.getElementById('typing');
  if (t) t.remove();
}

function showLoading(txt) {
  if (els.loadingText) els.loadingText.textContent = txt;
  if (els.loading) els.loading.classList.remove('hidden');
}

function hideLoading() {
  if (els.loading) els.loading.classList.add('hidden');
}

// ===== Core Logic =====
async function sendMessage() {
  const text = els.input.value.trim();
  if (!text && state.attachments.length === 0) return;

  const display = text + (state.attachments.length ? `<br><small style="opacity:0.8">📎 ${state.attachments.length} ملف</small>` : '');
  addMessage(display, true);
  
  els.input.value = '';
  if (els.charCount) els.charCount.textContent = '0/2000';
  if (els.sendBtn) els.sendBtn.disabled = true;
  
  state.isProcessing = true;
  showLoading(text.length < 15 ? '🔍 جاري تحليل الوصف...' : '🛠️ صياغة التقرير الاحترافي...');

  try {
    const res = await callAI(text);
    if (res.status === 'clarify') {
      addMessage(res.message);
      state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: res.message });
    } else if (res.status === 'report') {
      state.report = res.data;
      addMessage('✅ <strong>تم بنجاح!</strong> التقرير جاهز وفق المعايير العالمية.');
      renderReport(res.data);
      state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: 'تم إنشاء التقرير.' });
    }
  } catch (err) {
    console.error(err);
    addMessage('⚠️ عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.');
  } finally {
    hideLoading();
    hideTyping();
    state.isProcessing = false;
    if (els.sendBtn) {
      els.sendBtn.disabled = els.input.value.trim().length === 0 && state.attachments.length === 0;
    }
    if (els.input) els.input.focus();
  }
}

async function callAI(userText) {
  const payload = { messages: [...state.conversation] };
  if (userText) payload.messages.push({ role: 'user', content: userText });
  
  if (state.attachments.length > 0) {
    const attInfo = state.attachments.map(a => `- ${a.name} (${a.type})`).join('\n');
    payload.messages[payload.messages.length - 1].content += `\n\n📎 الملفات المرفقة:\n${attInfo}`;
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  if (data.type === 'json') return { status: 'report', data: data.content };
  return { status: 'clarify', message: data.content };
}

// ===== Professional Report Renderer =====
function renderReport(r) {
  if (!els.reportContent || !els.reportPanel) return;

  const getSeverityBadge = (severity) => {
    const colors = {
      'Critical': '#ef4444',
      'High': '#f59e0b',
      'Medium': '#3b82f6',
      'Low': '#10b981'
    };
    const color = colors[severity] || colors['Medium'];
    return `<span style="background: ${color}; color: white; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 0.9rem; display: inline-block;">${severity || 'Medium'}</span>`;
  };

  els.reportContent.innerHTML = `
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 16px; margin-bottom: 24px; color: white; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
      <h2 style="margin: 0; font-size: 1.6rem; display: flex; align-items: center; gap: 12px; font-weight: 700;">
        🐛 Bug Report
      </h2>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.9rem;">Professional QA Documentation</p>
    </div>

    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 2px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1.1rem; font-weight: 600;">📌 Title</h3>
      <div style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%); padding: 16px; border-radius: 10px; border-left: 4px solid var(--accent); font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">
        ${r.Title || 'Not specified'}
      </div>
    </div>

    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; font-weight: 600;">📝 Description</h3>
      <p style="margin: 0; padding: 14px; background: var(--bg-tertiary); border-radius: 10px; line-height: 1.8; color: var(--text-primary);">
        ${r.Description || 'Not specified'}
      </p>
    </div>

    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 16px 0; font-size: 1rem; font-weight: 600;">🔢 Steps to Reproduce</h3>
      <ol style="margin: 0; padding-left: 0; list-style: none;">
        ${(r.Steps_to_Reproduce || ['Not specified']).map((step, index) => `
          <li style="margin-bottom: 12px; padding: 14px 16px 14px 50px; background: var(--bg-tertiary); border-radius: 10px; position: relative; color: var(--text-primary); line-height: 1.7;">
            <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); background: var(--accent); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
              ${index + 1}
            </span>
            ${step}
          </li>
        `).join('')}
      </ol>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 2px solid #10b981;">
        <h3 style="color: #10b981; margin: 0 0 12px 0; font-size: 1rem; font-weight: 600;">✅ Expected Result</h3>
        <p style="margin: 0; padding: 14px; background: rgba(16, 185, 129, 0.1); border-radius: 10px; border-left: 4px solid #10b981; line-height: 1.7; color: var(--text-primary);">
          ${r.Expected_Result || 'Not specified'}
        </p>
      </div>
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 2px solid #ef4444;">
        <h3 style="color: #ef4444; margin: 0 0 12px 0; font-size: 1rem; font-weight: 600;">❌ Actual Result</h3>
        <p style="margin: 0; padding: 14px; background: rgba(239, 68, 68, 0.1); border-radius: 10px; border-left: 4px solid #ef4444; line-height: 1.7; color: var(--text-primary);">
          ${r.Actual_Result || 'Not specified'}
        </p>
      </div>
    </div>

    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; font-weight: 600;">🖥️ Environment</h3>
      <div style="padding: 12px 16px; background: var(--bg-tertiary); border-radius: 10px; font-family: monospace; color: var(--text-primary); border-left: 4px solid var(--accent);">
        ${r.Environment || 'Not specified'}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
        <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; font-weight: 600;">⚠️ Severity / Priority</h3>
        <div style="padding: 12px;">${getSeverityBadge(r.Severity_Priority)}</div>
      </div>
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
        <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; font-weight: 600;">💥 Impact</h3>
        <p style="margin: 0; padding: 12px; background: var(--bg-tertiary); border-radius: 10px; line-height: 1.7; color: var(--text-primary);">
          ${r.Impact || 'Not specified'}
        </p>
      </div>
    </div>

    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; font-weight: 600;">📎 Attachments</h3>
      <p style="margin: 0; padding: 12px; background: var(--bg-tertiary); border-radius: 10px; color: var(--text-secondary);">
        ${r.Attachments || 'No attachments'}
      </p>
    </div>
  `;

  els.reportPanel.classList.remove('hidden');
  els.reportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== Actions =====
function formatReport() {
  const r = state.report;
  if (!r) return '';
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

function setupActionButtons() {
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const newReportBtn = document.getElementById('new-report-btn');

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(formatReport()).then(() => {
        copyBtn.textContent = '✅ تم النسخ';
        setTimeout(() => copyBtn.textContent = '📋 نسخ', 1500);
      });
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([formatReport()], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `BugReport-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  if (newReportBtn) {
    newReportBtn.addEventListener('click', () => {
      state.conversation = [];
      state.attachments = [];
      state.report = null;
      
      if (els.chat) {
        els.chat.innerHTML = `
          <div class="message bot-message">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              <p><strong>مرحباً بك مجدداً 👋</strong></p>
              <p>جاهز لتحويل الوصف التالي إلى تقرير دقيق.</p>
              <div class="quick-tips">💡 مثال: "المستخدم لا يستطيع تسجيل الدخول عند استخدام متصفح سفاري"</div>
            </div>
          </div>
        `;
      }
      
      if (els.reportPanel) els.reportPanel.classList.add('hidden');
      renderAttachments();
    });
  }
}

// ===== Initialize Everything =====
document.addEventListener('DOMContentLoaded', () => {
  initElements();
  initTheme();
  setupInputHandlers();
  setupAttachmentHandlers();
  setupActionButtons();
  
  // Set initial button state
  if (els.sendBtn) {
    els.sendBtn.disabled = true;
  }
});
