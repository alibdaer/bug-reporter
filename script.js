let conversation = [];
let currentReport = null;
let lastReportMessage = null;
const THEME_STORAGE_KEY = 'bug-reporter-theme';

const START_NEW_PATTERNS = [
  /^new\s+conversation\s*$/i,
  /^new\s+report\s*$/i,
  /^start\s+new\s+report\s*$/i,
  /^start\s+new\s+conversation\s*$/i,
  /^ابدأ\s+تقرير\s+جديد\s*$/,
  /^ابدأ\s+محادثة\s+جديدة\s*$/,
  /^تقرير\s+جديد\s*$/,
  /^محادثة\s+جديدة\s*$/
];

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const newConversationTop = document.getElementById('new-conversation-top');
  const themeToggle = document.getElementById('theme-toggle');

  applyStoredTheme();

  input.addEventListener('input', () => {
    autoResize(input);
    checkInput();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!sendBtn.disabled) {
        sendMessage();
      }
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  newConversationTop.addEventListener('click', newConversation);
  themeToggle.addEventListener('click', toggleTheme);

  autoResize(input);
  checkInput();
  input.focus();
});

function applyStoredTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const shouldUseDark = savedTheme === 'dark';
  document.documentElement.setAttribute('data-theme', shouldUseDark ? 'dark' : 'light');
  updateThemeToggleLabel(shouldUseDark);
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const nextIsDark = !isDark;
  document.documentElement.setAttribute('data-theme', nextIsDark ? 'dark' : 'light');
  localStorage.setItem(THEME_STORAGE_KEY, nextIsDark ? 'dark' : 'light');
  updateThemeToggleLabel(nextIsDark);
}

function updateThemeToggleLabel(isDark) {
  const themeToggle = document.getElementById('theme-toggle');
  if (!themeToggle) return;
  const icon = themeToggle.querySelector('.theme-icon');
  const label = themeToggle.querySelector('.theme-label');
  if (icon) icon.textContent = isDark ? '☀️' : '🌙';
  if (label) label.textContent = isDark ? 'Light mode' : 'Dark mode';
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 240)}px`;
}

function checkInput() {
  const input = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');
  const charCount = document.getElementById('char-count');
  const length = input.value.length;

  charCount.textContent = `${length}/4000`;
  sendBtn.disabled = input.value.trim().length === 0;
}

function isStartNewConversation(text) {
  return START_NEW_PATTERNS.some((pattern) => pattern.test(text.trim()));
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  if (isStartNewConversation(text)) {
    newConversation();
    return;
  }

  addTextMessage(text, true);

  input.value = '';
  autoResize(input);
  checkInput();

  showLoading(currentReport ? 'Updating report...' : 'Crafting report...');

  try {
    const payload = {
      messages: [...conversation, { role: 'user', content: text }],
      currentReport
    };

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    conversation.push({ role: 'user', content: text });

    if (data.type === 'json' && data.content) {
      currentReport = data.content;
      const messageText = data.message || (conversation.length <= 1 ? 'Here is your bug report.' : 'I updated only the requested parts of the report.');
      conversation.push({ role: 'assistant', content: JSON.stringify(currentReport) });
      addReportMessage(currentReport, messageText);
    } else {
      const fallbackText = data.content || 'Please provide more details.';
      conversation.push({ role: 'assistant', content: fallbackText });
      addTextMessage(fallbackText, false);
    }
  } catch (error) {
    console.error(error);
    addTextMessage('An error occurred while processing your request. Please try again.', false);
  } finally {
    hideLoading();
  }
}

function addTextMessage(text, isUser) {
  const chat = document.getElementById('chat-container');
  const wrapper = document.createElement('article');
  wrapper.className = `message ${isUser ? 'user-message' : 'assistant-message'}`;

  if (!isUser) {
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';
    wrapper.appendChild(avatar);
  }

  const body = document.createElement('div');
  body.className = 'message-body';

  const textBlock = document.createElement('div');
  textBlock.className = 'plain-text';
  textBlock.textContent = text;

  if (isUser) {
    body.appendChild(textBlock);
  } else {
    const card = document.createElement('div');
    card.className = 'intro-card';
    card.appendChild(textBlock);
    body.appendChild(card);
  }

  wrapper.appendChild(body);
  chat.appendChild(wrapper);
  scrollToBottom();
}

function addReportMessage(report, messageText) {
  const chat = document.getElementById('chat-container');
  const wrapper = document.createElement('article');
  wrapper.className = 'message assistant-message';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = 'AI';
  wrapper.appendChild(avatar);

  const body = document.createElement('div');
  body.className = 'message-body';

  const card = document.createElement('div');
  card.className = 'report-card';

  const toolbar = document.createElement('div');
  toolbar.className = 'report-toolbar';

  const title = document.createElement('div');
  title.className = 'report-toolbar-title';
  title.textContent = messageText || 'Bug report';

  const actions = document.createElement('div');
  actions.className = 'report-toolbar-actions';

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'toolbar-btn';
  copyBtn.textContent = 'Copy report';
  copyBtn.addEventListener('click', async () => {
    try {
      await copyReportToClipboard(report);
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 1800);
    } catch (error) {
      console.error(error);
      copyBtn.textContent = 'Copy failed';
      setTimeout(() => {
        copyBtn.textContent = 'Copy report';
      }, 1800);
    }
  });

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'toolbar-btn';
  newBtn.textContent = 'New conversation';
  newBtn.addEventListener('click', newConversation);

  actions.append(copyBtn, newBtn);
  toolbar.append(title, actions);

  const content = renderReport(report);
  card.append(toolbar, content);
  body.appendChild(card);
  wrapper.appendChild(body);

  chat.appendChild(wrapper);
  lastReportMessage = wrapper;
  scrollToBottom();
}

function renderReport(report) {
  const container = document.createElement('div');
  container.className = 'report-content';

  const title = document.createElement('h2');
  title.className = 'report-title';
  title.textContent = safeValue(report.Title, 'Bug Report');
  container.appendChild(title);

  container.appendChild(createSection('Description', createParagraph(report.Description)));
  container.appendChild(createSection('Steps to Reproduce', createOrderedList(report.Steps_to_Reproduce)));
  container.appendChild(createSection('Expected Result', createParagraph(report.Expected_Result)));
  container.appendChild(createSection('Actual Result', createParagraph(report.Actual_Result)));
  container.appendChild(createSection('Severity/Priority', createMetaList(report)));
  container.appendChild(createSection('Impact', createParagraph(report.Impact)));
  container.appendChild(createSection('Environment', createParagraph(report.Environment)));
  container.appendChild(createSection('Version', createParagraph(report.Version)));
  container.appendChild(createSection('Attachments', createAttachments(report.Attachments)));

  return container;
}

function createSection(label, contentNode) {
  const section = document.createElement('section');
  section.className = 'report-section';

  const heading = document.createElement('h3');
  heading.className = 'report-label';
  heading.textContent = `${label}:`;

  section.append(heading, contentNode);
  return section;
}

function createParagraph(value) {
  const p = document.createElement('p');
  p.className = 'report-value';
  const text = safeValue(value, 'Not specified');
  if (text === 'Not specified') {
    p.classList.add('report-empty');
  }
  p.textContent = text;
  return p;
}

function createOrderedList(steps) {
  const list = document.createElement('ol');
  list.className = 'report-list';
  const normalized = Array.isArray(steps) ? steps : [];

  if (!normalized.length) {
    const li = document.createElement('li');
    li.className = 'report-empty';
    li.textContent = 'Not specified';
    list.appendChild(li);
    return list;
  }

  normalized.forEach((step) => {
    const li = document.createElement('li');
    li.textContent = typeof step === 'string' ? step : JSON.stringify(step);
    list.appendChild(li);
  });

  return list;
}

function createMetaList(report) {
  const list = document.createElement('ul');
  list.className = 'report-meta-list';

  const entries = [
    { label: 'Severity', value: safeValue(report.Severity, 'Medium') },
    { label: 'Priority', value: safeValue(report.Priority, 'Medium') }
  ];

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}`;
    list.appendChild(li);
  });

  return list;
}

function createAttachments(value) {
  if (Array.isArray(value)) {
    const list = document.createElement('ul');
    list.className = 'report-meta-list';
    if (!value.length) {
      const li = document.createElement('li');
      li.className = 'report-empty';
      li.textContent = 'Not specified';
      list.appendChild(li);
      return list;
    }
    value.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    return list;
  }
  return createParagraph(value);
}

function safeValue(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : String(value || '').trim();
  return text || fallback;
}

function formatReport(report) {
  const lines = [];
  lines.push(`${safeValue(report.Title, 'Bug Report')}`);
  lines.push('');
  lines.push('Description:');
  lines.push(safeValue(report.Description, 'Not specified'));
  lines.push('');
  lines.push('Steps to Reproduce:');

  const steps = Array.isArray(report.Steps_to_Reproduce) ? report.Steps_to_Reproduce : [];
  if (steps.length) {
    steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  } else {
    lines.push('1. Not specified');
  }

  lines.push('');
  lines.push('Expected Result:');
  lines.push(safeValue(report.Expected_Result, 'Not specified'));
  lines.push('');
  lines.push('Actual Result:');
  lines.push(safeValue(report.Actual_Result, 'Not specified'));
  lines.push('');
  lines.push('Severity/Priority:');
  lines.push(`• Severity: ${safeValue(report.Severity, 'Medium')}`);
  lines.push(`• Priority: ${safeValue(report.Priority, 'Medium')}`);
  lines.push('');
  lines.push('Impact:');
  lines.push(safeValue(report.Impact, 'Not specified'));
  lines.push('');
  lines.push('Environment:');
  lines.push(safeValue(report.Environment, 'Not specified'));
  lines.push('');
  lines.push('Version:');
  lines.push(safeValue(report.Version, 'Not specified'));
  lines.push('');
  lines.push('Attachments:');
  lines.push(Array.isArray(report.Attachments)
    ? (report.Attachments.length ? report.Attachments.map((item) => `• ${item}`).join('\n') : 'Not specified')
    : safeValue(report.Attachments, 'Not specified'));
  return lines.join('\n');
}

function generateReportHtml(report) {
  const attachments = Array.isArray(report.Attachments)
    ? report.Attachments
    : (safeValue(report.Attachments, '') ? [safeValue(report.Attachments, '')] : []);
  const steps = Array.isArray(report.Steps_to_Reproduce) ? report.Steps_to_Reproduce : [];

  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #111827; line-height: 1.7; font-size: 15px;">
      <h2 style="margin: 0 0 20px; font-size: 28px; font-weight: 700;">${escapeHtml(safeValue(report.Title, 'Bug Report'))}</h2>
      ${richSectionHtml('Description', `<p style="margin: 0;">${escapeHtml(safeValue(report.Description, 'Not specified'))}</p>`) }
      ${richSectionHtml('Steps to Reproduce', orderedListHtml(steps))}
      ${richSectionHtml('Expected Result', `<p style="margin: 0;">${escapeHtml(safeValue(report.Expected_Result, 'Not specified'))}</p>`) }
      ${richSectionHtml('Actual Result', `<p style="margin: 0;">${escapeHtml(safeValue(report.Actual_Result, 'Not specified'))}</p>`) }
      ${richSectionHtml('Severity/Priority', `
        <ul style="margin: 0; padding-left: 24px;">
          <li><strong>Severity:</strong> ${escapeHtml(safeValue(report.Severity, 'Medium'))}</li>
          <li><strong>Priority:</strong> ${escapeHtml(safeValue(report.Priority, 'Medium'))}</li>
        </ul>
      `)}
      ${richSectionHtml('Impact', `<p style="margin: 0;">${escapeHtml(safeValue(report.Impact, 'Not specified'))}</p>`) }
      ${richSectionHtml('Environment', `<p style="margin: 0;">${escapeHtml(safeValue(report.Environment, 'Not specified'))}</p>`) }
      ${richSectionHtml('Version', `<p style="margin: 0;">${escapeHtml(safeValue(report.Version, 'Not specified'))}</p>`) }
      ${richSectionHtml('Attachments', attachments.length ? unorderedListHtml(attachments) : `<p style="margin: 0; color: #6b7280;">Not specified</p>`)}
    </div>
  `.trim();
}

function richSectionHtml(label, contentHtml) {
  return `
    <section style="margin: 0 0 18px;">
      <h3 style="margin: 0 0 8px; font-size: 17px; font-weight: 700;">${escapeHtml(label)}:</h3>
      ${contentHtml}
    </section>
  `;
}

function orderedListHtml(items) {
  if (!items.length) {
    return `<ol style="margin: 0; padding-left: 24px;"><li style="color: #6b7280;">Not specified</li></ol>`;
  }
  return `<ol style="margin: 0; padding-left: 24px;">${items.map((item) => `<li style="margin-bottom: 8px;">${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function unorderedListHtml(items) {
  return `<ul style="margin: 0; padding-left: 24px;">${items.map((item) => `<li style="margin-bottom: 8px;">${escapeHtml(item)}</li>`).join('')}</ul>`;
}

async function copyReportToClipboard(report) {
  const plainText = formatReport(report);
  const richHtml = generateReportHtml(report);

  if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
      'text/html': new Blob([richHtml], { type: 'text/html' })
    });
    await navigator.clipboard.write([item]);
    return;
  }

  await navigator.clipboard.writeText(plainText);
}

function newConversation() {
  conversation = [];
  currentReport = null;
  lastReportMessage = null;

  const chat = document.getElementById('chat-container');
  chat.innerHTML = `
    <article class="message assistant-message intro-message">
      <div class="message-avatar">AI</div>
      <div class="message-body intro-card">
        <p class="intro-title">Welcome back!</p>
        <p>Start a new bug report whenever you are ready.</p>
      </div>
    </article>
  `;

  const input = document.getElementById('user-input');
  input.value = '';
  autoResize(input);
  checkInput();
  input.focus();
  scrollToBottom();
}

function showLoading(text) {
  const overlay = document.getElementById('loading-overlay');
  const label = document.getElementById('loading-text');
  label.textContent = text;
  overlay.classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

function scrollToBottom() {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
