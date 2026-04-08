let conversation = [];
let currentReport = null;

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  setTheme(savedTheme);

  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const themeBtn = document.getElementById('theme-toggle');
  const newConversationTop = document.getElementById('new-conversation-top');

  input?.addEventListener('input', () => {
    autoResizeTextarea(input);
    updateComposerState();
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sendBtn.disabled) sendMessage();
    }
  });

  sendBtn?.addEventListener('click', sendMessage);
  themeBtn?.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });
  newConversationTop?.addEventListener('click', resetConversation);

  document.addEventListener('click', async (event) => {
    if (event.target.closest('.copy-report-btn')) {
      await copyCurrentReport();
    }

    if (event.target.closest('.new-conversation-btn')) {
      resetConversation();
    }
  });

  autoResizeTextarea(input);
  updateComposerState();
});

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 220) + 'px';
}

function updateComposerState() {
  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const charCount = document.getElementById('char-count');
  const length = input?.value.trim().length || 0;

  if (charCount) charCount.textContent = `${length}/2000`;
  if (sendBtn) sendBtn.disabled = length === 0;
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input?.value.trim() || '';
  if (!text) return;

  addTextMessage(text, true);
  input.value = '';
  autoResizeTextarea(input);
  updateComposerState();
  setLoading(true, 'Crafting report...');

  const requestMessages = [...conversation, { role: 'user', content: text }];

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: requestMessages,
        currentReport
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    conversation = requestMessages;

    if (data?.type === 'json' && data?.content) {
      currentReport = data.content;
      addReportMessage(currentReport);
      conversation.push({
        role: 'assistant',
        content: JSON.stringify(currentReport)
      });
    } else {
      const fallbackText = data?.content || 'Unable to generate the report.';
      addTextMessage(fallbackText, false);
      conversation.push({ role: 'assistant', content: fallbackText });
    }
  } catch (error) {
    console.error(error);
    addTextMessage('Something went wrong while generating the report. Please try again.', false);
  } finally {
    setLoading(false);
  }
}

function addTextMessage(text, isUser) {
  const chat = document.getElementById('chat-container');
  if (!chat) return;

  const wrapper = document.createElement('div');
  wrapper.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;

  const card = document.createElement('div');
  card.className = 'message-card';
  card.textContent = text;

  wrapper.appendChild(card);
  chat.appendChild(wrapper);
  scrollChatToBottom();
}

function addReportMessage(report) {
  const chat = document.getElementById('chat-container');
  const template = document.getElementById('report-actions-template');
  if (!chat || !report) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'message assistant-message';

  const card = document.createElement('div');
  card.className = 'message-card report-card';
  card.innerHTML = buildReportHtml(report);

  if (template?.content) {
    card.appendChild(template.content.cloneNode(true));
  }

  wrapper.appendChild(card);
  chat.appendChild(wrapper);
  scrollChatToBottom();
}

function buildReportHtml(report) {
  const escape = escapeHtml;
  const lines = [];

  lines.push(`<h2 class="report-title">${escape(report.Title || 'Untitled Bug Report')}</h2>`);
  lines.push(renderSection('Description', report.Description));
  lines.push(renderStepsSection(report.Steps_to_Reproduce));
  lines.push(renderSection('Expected Result', report.Expected_Result));
  lines.push(renderSection('Actual Result', report.Actual_Result));

  lines.push(`
    <div class="report-meta-grid">
      ${renderSection('Severity', report.Severity, false)}
      ${renderSection('Priority', report.Priority, false)}
      ${renderSection('Environment', report.Environment, false)}
      ${renderSection('Version', report.Version, false)}
    </div>
  `);

  lines.push(renderSection('Impact', report.Impact));
  lines.push(renderSection('Attachments', report.Attachments));

  return lines.join('');
}

function renderSection(label, value, wrap = true) {
  const content = formatFieldValue(value);
  const html = `
    <section class="report-section">
      <span class="report-label">${escapeHtml(label)}</span>
      <div class="report-text">${content || 'Not specified'}</div>
    </section>
  `;
  return wrap ? html : html;
}

function renderStepsSection(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const items = list
    .map((step) => `<li>${escapeHtml(typeof step === 'string' ? step : JSON.stringify(step))}</li>`)
    .join('');

  return `
    <section class="report-section">
      <span class="report-label">Steps to Reproduce</span>
      ${items ? `<ol class="report-list">${items}</ol>` : `<div class="report-text">Not specified</div>`}
    </section>
  `;
}

function formatFieldValue(value) {
  if (Array.isArray(value)) {
    return value.length ? escapeHtml(value.join('\n')) : '';
  }

  const text = String(value || '').trim();
  return text ? escapeHtml(text) : '';
}

async function copyCurrentReport() {
  if (!currentReport) return;

  const html = buildCopyableReportHtml(currentReport);
  const plainText = formatReportAsText(currentReport);

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' })
        })
      ]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }

    flashCopyButtons();
  } catch (error) {
    console.error(error);
  }
}

function buildCopyableReportHtml(report) {
  const steps = (report.Steps_to_Reproduce || [])
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('');

  return `
    <div>
      <h2>${escapeHtml(report.Title || 'Untitled Bug Report')}</h2>
      <p><strong>Description:</strong><br>${escapeHtml(report.Description || 'Not specified').replace(/\n/g, '<br>')}</p>
      <p><strong>Steps to Reproduce:</strong></p>
      ${steps ? `<ol>${steps}</ol>` : '<p>Not specified</p>'}
      <p><strong>Expected Result:</strong><br>${escapeHtml(report.Expected_Result || 'Not specified').replace(/\n/g, '<br>')}</p>
      <p><strong>Actual Result:</strong><br>${escapeHtml(report.Actual_Result || 'Not specified').replace(/\n/g, '<br>')}</p>
      <p><strong>Severity:</strong> ${escapeHtml(report.Severity || 'Not specified')}</p>
      <p><strong>Priority:</strong> ${escapeHtml(report.Priority || 'Not specified')}</p>
      <p><strong>Environment:</strong><br>${escapeHtml(report.Environment || 'Not specified').replace(/\n/g, '<br>')}</p>
      <p><strong>Version:</strong><br>${escapeHtml(report.Version || 'Not specified').replace(/\n/g, '<br>')}</p>
      <p><strong>Impact:</strong><br>${escapeHtml(report.Impact || 'Not specified').replace(/\n/g, '<br>')}</p>
      <p><strong>Attachments:</strong><br>${escapeHtml(report.Attachments || 'Not specified').replace(/\n/g, '<br>')}</p>
    </div>
  `;
}

function flashCopyButtons() {
  document.querySelectorAll('.copy-report-btn').forEach((button) => {
    const original = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = original;
    }, 1800);
  });
}

function formatReportAsText(report) {
  const steps = Array.isArray(report.Steps_to_Reproduce)
    ? report.Steps_to_Reproduce.map((step, index) => `${index + 1}. ${step}`).join('\n')
    : 'Not specified';

  return [
    report.Title || 'Untitled Bug Report',
    '',
    'Description:',
    report.Description || 'Not specified',
    '',
    'Steps to Reproduce:',
    steps,
    '',
    'Expected Result:',
    report.Expected_Result || 'Not specified',
    '',
    'Actual Result:',
    report.Actual_Result || 'Not specified',
    '',
    `Severity: ${report.Severity || 'Not specified'}`,
    `Priority: ${report.Priority || 'Not specified'}`,
    '',
    'Environment:',
    report.Environment || 'Not specified',
    '',
    'Version:',
    report.Version || 'Not specified',
    '',
    'Impact:',
    report.Impact || 'Not specified',
    '',
    'Attachments:',
    report.Attachments || 'Not specified'
  ].join('\n');
}

function resetConversation() {
  conversation = [];
  currentReport = null;
  const chat = document.getElementById('chat-container');
  if (chat) {
    chat.innerHTML = `
      <div class="message assistant-message intro-message">
        <div class="message-card">
          <p class="intro-title">Welcome back!</p>
          <p>I generate and revise Menaitech bug reports in English.</p>
          <p class="intro-hint">First message = new report. Any next message = update the same report unless you start a new conversation.</p>
        </div>
      </div>
    `;
  }

  const input = document.getElementById('user-input');
  if (input) {
    input.value = '';
    autoResizeTextarea(input);
    input.focus();
  }

  updateComposerState();
}

function setLoading(show, text = 'Crafting report...') {
  const indicator = document.getElementById('loading-indicator');
  const label = document.getElementById('loading-text');
  if (label) label.textContent = text;
  if (indicator) indicator.classList.toggle('hidden', !show);
}

function scrollChatToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
