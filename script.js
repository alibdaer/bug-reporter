// Global State
let conversation = [];
let currentReport = null;

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
  checkInput();
});

// Theme Toggle
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('.theme-toggle .icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

// Input Handling
function checkInput() {
  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const charCount = document.getElementById('char-count');
  
  if (input && sendBtn && charCount) {
    const length = input.value.trim().length;
    charCount.textContent = length + '/2000';
    sendBtn.disabled = length === 0;
  }
}

// Send Message
async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input ? input.value.trim() : '';
  
  if (!text) return;
  
  // Add user message
  addMessage(text, true);
  
  // Clear input
  if (input) {
    input.value = '';
    checkInput();
  }
  
  // Show loading
  showLoading('🛠️ Crafting report...');
  
  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          ...conversation,
          { role: 'user', content: text }
        ]
      })
    });
    
    if (!response.ok) throw new Error('HTTP ' + response.status);
    
    const data = await response.json();
    
    if (data.type === 'json' && data.content) {
      currentReport = data.content;
      addMessage('✅ <strong>Report generated!</strong>', false);
      renderReport(currentReport);
      conversation.push({ role: 'user', content: text });
      conversation.push({ role: 'assistant', content: 'Report created.' });
    } else {
      addMessage(data.content || 'Please provide more details.', false);
      conversation.push({ role: 'user', content: text });
      conversation.push({ role: 'assistant', content: data.content });
    }
  } catch (error) {
    console.error(error);
    addMessage('⚠️ Error occurred. Please try again.', false);
  }
  
  hideLoading();
}

// Add Message to Chat
function addMessage(html, isUser) {
  const chat = document.getElementById('chat-container');
  if (!chat) return;
  
  const msg = document.createElement('div');
  msg.className = 'message ' + (isUser ? 'user-message' : 'bot-message');
  msg.innerHTML = `
    <div class="message-avatar">${isUser ? '👤' : '🤖'}</div>
    <div class="message-content">${html}</div>
  `;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}

// Show/Hide Loading
function showLoading(text) {
  const overlay = document.getElementById('loading-overlay');
  const loadingText = document.getElementById('loading-text');
  if (loadingText) loadingText.textContent = text;
  if (overlay) overlay.classList.remove('hidden');
}

function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// Render Report
function renderReport(r) {
  const content = document.getElementById('report-content');
  const panel = document.getElementById('report-panel');
  if (!content || !panel) return;
  
  const sevClass = (r.Severity_Priority || '').toLowerCase().includes('high') ? 'sev-high' : 'sev-medium';
  
  content.innerHTML = `
    <div class="report-section">
      <h3 class="section-title">Title</h3>
      <div class="section-content" style="font-weight:700;font-size:1.15rem">${r.Title || 'Not specified'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Description</h3>
      <div class="section-content">${r.Description || 'Not specified'}</div>
    </div>
    <div class="report-section">
      <h3 class="section-title">Steps to Reproduce</h3>
      <div class="section-content">
        <ol class="steps-list">
          ${(r.Steps_to_Reproduce || ['Not specified']).map(s => {
  // ذكي: يتعامل مع النص أو الكائن
  let text = typeof s === 'object' ? (s.step || s.description || JSON.stringify(s)) : s;
  return '<li>' + text + '</li>';
}).join('')}
        </ol>
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
      <div class="section-content ${sevClass}">${r.Severity_Priority || 'Medium'}</div>
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
  
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Actions
function copyReport() {
  if (!currentReport) return;
  const text = formatReport();
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-btn');
    if (btn) {
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = '📋 Copy', 2000);
    }
  });
}

function downloadReport() {
  if (!currentReport) return;
  const blob = new Blob([formatReport()], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'BugReport-' + Date.now() + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

function newReport() {
  conversation = [];
  currentReport = null;
  const chat = document.getElementById('chat-container');
  const panel = document.getElementById('report-panel');
  if (chat) {
    chat.innerHTML = `
      <div class="message bot-message">
        <div class="message-avatar">🤖</div>
        <div class="message-content">
          <p><strong>Welcome back! 👋</strong></p>
          <p>Ready for the next report.</p>
        </div>
      </div>
    `;
  }
  if (panel) panel.classList.add('hidden');
  const input = document.getElementById('user-input');
  if (input) {
    input.value = '';
    input.focus();
    checkInput();
  }
}

function formatReport() {
  if (!currentReport) return '';
  const r = currentReport;
  return `BUG REPORT
========================================
Title: ${r.Title || 'Not specified'}
Description: ${r.Description || 'Not specified'}
Steps to Reproduce:
${Array.isArray(r.Steps_to_Reproduce) ? r.Steps_to_Reproduce.map((s,i) => (i+1) + '. ' + s).join('\n') : r.Steps_to_Reproduce}
Expected Result: ${r.Expected_Result || 'Not specified'}
Actual Result: ${r.Actual_Result || 'Not specified'}
Severity/Priority: ${r.Severity_Priority || 'Medium'}
Impact: ${r.Impact || 'Not specified'}
Environment: ${r.Environment || 'Not specified'}
========================================`;
}

// Enter key support
document.addEventListener('keydown', function(e) {
  if (e.target.id === 'user-input' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const btn = document.getElementById('send-btn');
    if (btn && !btn.disabled) sendMessage();
  }
});
