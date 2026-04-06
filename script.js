// script.js - Professional Bug Reporter AI (Final Clean Version)

const state = {
  conversation: [],
  report: null,
  isProcessing: false
};

let els = {};

// Initialize DOM Elements
function initElements() {
  els = {
    chat: document.getElementById('chat-container'),
    input: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    charCount: document.getElementById('char-count'),
    reportPanel: document.getElementById('report-panel'),
    reportContent: document.getElementById('report-content'),
    loading: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    themeToggle: document.getElementById('theme-toggle')
  };
}

// ===== Theme Management (Fixed) =====
function initTheme() {
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
    const icon = els.themeToggle.querySelector('.icon');
    if (icon) {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }
}

// ===== Input Handling =====
function setupInputHandlers() {
  if (!els.input || !els.sendBtn) return;

  els.input.addEventListener('input', () => {
    if (els.charCount) {
      els.charCount.textContent = `${els.input.value.length}/2000`;
    }
    els.sendBtn.disabled = els.input.value.trim().length === 0;
    autoResize(els.input);
  });

  els.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  els.sendBtn.addEventListener('click', sendMessage);
  
  // Initial state
  els.sendBtn.disabled = true;
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
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
  if (!text) return;

  addMessage(text, true);
  els.input.value = '';
  if (els.charCount) els.charCount.textContent = '0/2000';
  els.sendBtn.disabled = true;
  
  state.isProcessing = true;
  showLoading('🛠️ جاري صياغة التقرير الاحترافي...');

  try {
    const res = await callAI(text);
    
    if (res.status === 'clarify') {
      addMessage(res.message);
      state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: res.message });
    } else if (res.status === 'report') {
      state.report = res.data;
      addMessage('✅ <strong>تم إنشاء التقرير بنجاح!</strong>');
      renderReport(res.data);
      state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: 'تم إنشاء التقرير.' });
    }
  } catch (err) {
    console.error(err);
    addMessage('⚠️ حدث خطأ. يرجى المحاولة مرة أخرى.');
  } finally {
    hideLoading();
    state.isProcessing = false;
    els.sendBtn.disabled = els.input.value.trim().length === 0;
    els.input.focus();
  }
}

async function callAI(userText) {
  const payload = { 
    messages: [
      ...state.conversation,
      { role: 'user', content: userText }
    ]
  };

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

// ===== Professional Report Renderer (Matches Your Image) =====
function renderReport(r) {
  if (!els.reportContent || !els.reportPanel) return;

  els.reportContent.innerHTML = `
    <div class="report-section">
      <h3 class="section-title">Description</h3>
      <div class="section-content">
        ${r.Description || 'Not specified'}
      </div>
    </div>

    <div class="report-section">
      <h3 class="section-title">Steps to Reproduce</h3>
      <div class="section-content">
        <ol class="steps-list">
          ${(r.Steps_to_Reproduce || ['Not specified']).map(step => `
            <li>${step}</li>
          `).join('')}
        </ol>
      </div>
    </div>

    <div class="report-section">
      <h3 class="section-title">Expected Result</h3>
      <div class="section-content">
        ${r.Expected_Result || 'Not specified'}
      </div>
    </div>

    <div class="report-section">
      <h3 class="section-title">Actual Result</h3>
      <div class="section-content">
        ${r.Actual_Result || 'Not specified'}
      </div>
    </div>

    <div class="report-section">
      <h3 class="section-title">Severity/Priority</h3>
      <div class="section-content">
        <ul class="bullet-list">
          <li><strong>Severity:</strong> ${r.Severity_Priority || 'Medium'}</li>
          <li><strong>Priority:</strong> ${r.Severity_Priority?.split('/')[1] || 'Medium'}</li>
        </ul>
      </div>
    </div>

    <div class="report-section">
      <h3 class="section-title">Impact</h3>
      <div class="section-content">
        ${r.Impact || 'Not specified'}
      </div>
    </div>

    <div class="report-section">
      <h3 class="section-title">Environment</h3>
      <div class="section-content">
        ${r.Environment || 'Not specified'}
      </div>
    </div>
  `;

  els.reportPanel.classList.remove('hidden');
  els.reportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== Actions =====
function formatReport() {
  const r = state.report;
  if (!r) return '';
  
  return `BUG REPORT
========================================

Description:
${r.Description || 'Not specified'}

Steps to Reproduce:
${Array.isArray(r.Steps_to_Reproduce) ? r.Steps_to_Reproduce.map((s, i) => `${i+1}. ${s}`).join('\n') : r.Steps_to_Reproduce}

Expected Result:
${r.Expected_Result || 'Not specified'}

Actual Result:
${r.Actual_Result || 'Not specified'}

Severity/Priority: ${r.Severity_Priority || 'Medium'}

Impact:
${r.Impact || 'Not specified'}

Environment:
${r.Environment || 'Not specified'}
========================================`;
}

function setupActionButtons() {
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const newReportBtn = document.getElementById('new-report-btn');

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(formatReport()).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => copyBtn.textContent = originalText, 2000);
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
      state.report = null;
      
      if (els.chat) {
        els.chat.innerHTML = `
          <div class="message bot-message">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              <p><strong>مرحباً بك 👋</strong></p>
              <p>أنا مساعدك المتخصص في صياغة تقارير الـ Bug Reports الاحترافية.</p>
              <p>فقط اشرح لي العطل الذي واجهته، وسأقوم بتحويله فوراً إلى تقرير دقيق.</p>
            </div>
          </div>
        `;
      }
      
      if (els.reportPanel) els.reportPanel.classList.add('hidden');
      if (els.input) els.input.focus();
    });
  }
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
  initElements();
  initTheme();
  setupInputHandlers();
  setupActionButtons();
  
  // Add theme toggle listener
  if (els.themeToggle) {
    els.themeToggle.addEventListener('click', toggleTheme);
  }
});
