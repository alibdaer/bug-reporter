// script.js - Professional Bug Reporter AI (Final Stable Version)

const state = {
  conversation: [],
  report: null,
  isProcessing: false
};

let els = {};

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

// ===== Theme Management (Fixed & Robust) =====
// ===== Theme Management (100% Working) =====
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  
  const icon = document.querySelector('.theme-toggle .icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  
  console.log('Theme applied:', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  console.log('Toggling theme from', current, 'to', next);
  applyTheme(next);
}

function updateThemeIcon(theme) {
  if (els.themeToggle) {
    const icon = els.themeToggle.querySelector('.icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// ===== Input Handling =====
function setupInputHandlers() {
  if (!els.input || !els.sendBtn) return;

  els.input.addEventListener('input', () => {
    if (els.charCount) els.charCount.textContent = `${els.input.value.length}/2000`;
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
  showLoading('🛠️ Crafting professional report...');

  try {
    const res = await callAI(text);
    if (res.status === 'clarify') {
      addMessage(res.message);
      state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: res.message });
    } else if (res.status === 'report') {
      state.report = res.data;
      addMessage('✅ <strong>Report generated successfully!</strong>');
      renderReport(res.data);
      state.conversation.push({ role: 'user', content: text }, { role: 'assistant', content: 'Report created.' });
    }
  } catch (err) {
    console.error(err);
    addMessage('⚠️ Sorry, an error occurred. Please try again.');
  } finally {
    hideLoading();
    state.isProcessing = false;
    els.sendBtn.disabled = els.input.value.trim().length === 0;
    els.input.focus();
  }
}

async function callAI(userText) {
  const payload = { messages: [...state.conversation, { role: 'user', content: userText }] };
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.type === 'json' ? { status: 'report',  data.content } : { status: 'clarify', message: data.content };
}

// ===== Report Renderer =====
function renderReport(r) {
  if (!els.reportContent || !els.reportPanel) return;
  const sevColor = r.Severity_Priority?.toLowerCase().includes('high') || r.Severity_Priority?.toLowerCase().includes('critical') ? 'var(--accent)' : 'var(--text-secondary)';

  els.reportContent.innerHTML = `
    <div class="report-section">
      <h3 class="section-title">Title</h3>
      <div class="section-content" style="font-weight: 700; font-size: 1.15rem;">${r.Title || 'Not specified'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Description</h3>
      <div class="section-content">${r.Description || 'Not specified'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Steps to Reproduce</h3>
      <div class="section-content">
        <ol class="steps-list">${(r.Steps_to_Reproduce || ['Not specified']).map(s => `<li>${s}</li>`).join('')}</ol>
      </div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Expected Result</h3>
      <div class="section-content">${r.Expected_Result || 'Not specified'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Actual Result</h3>
      <div class="section-content">${r.Actual_Result || 'Not specified'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Severity/Priority</h3>
      <div class="section-content" style="color: ${sevColor}; font-weight: 600;">${r.Severity_Priority || 'Medium'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Impact</h3>
      <div class="section-content">${r.Impact || 'Not specified'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Environment</h3>
      <div class="section-content">${r.Environment || 'Not specified'}</div>
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
Title: ${r.Title || 'Not specified'}
Description: ${r.Description || 'Not specified'}
Steps to Reproduce:
${Array.isArray(r.Steps_to_Reproduce) ? r.Steps_to_Reproduce.map((s, i) => `${i+1}. ${s}`).join('\n') : r.Steps_to_Reproduce}
Expected Result: ${r.Expected_Result || 'Not specified'}
Actual Result: ${r.Actual_Result || 'Not specified'}
Severity/Priority: ${r.Severity_Priority || 'Medium'}
Impact: ${r.Impact || 'Not specified'}
Environment: ${r.Environment || 'Not specified'}
========================================`;
}

function setupActionButtons() {
  const copyBtn = document.getElementById('copy-btn');
  const downloadBtn = document.getElementById('download-btn');
  const newReportBtn = document.getElementById('new-report-btn');

  if (copyBtn) copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(formatReport()).then(() => {
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
    });
  });

  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    const blob = new Blob([formatReport()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BugReport-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  if (newReportBtn) newReportBtn.addEventListener('click', () => {
    state.conversation = [];
    state.report = null;
    if (els.chat) {
      els.chat.innerHTML = `<div class="message bot-message"><div class="message-avatar">🤖</div><div class="message-content"><p><strong>Welcome back! 👋</strong></p><p>Ready for the next description.</p></div></div>`;
    }
    if (els.reportPanel) els.reportPanel.classList.add('hidden');
    if (els.input) els.input.focus();
  });
}

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Loaded');
  initElements();
  initTheme();
  setupInputHandlers();
  setupActionButtons();
  
  // Direct event listener with console log
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    console.log('Theme button found');
    themeBtn.addEventListener('click', (e) => {
      console.log('Theme button clicked!', e);
      toggleTheme();
    });
  } else {
    console.error('Theme button NOT found!');
  }
});
