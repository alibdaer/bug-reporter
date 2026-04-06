// ===== Professional Report Renderer with Beautiful Styling =====
function renderReport(r) {
  // Helper for severity colors
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
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 16px; margin-bottom: 24px; color: white; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
      <h2 style="margin: 0; font-size: 1.6rem; display: flex; align-items: center; gap: 12px; font-weight: 700;">
        🐛 Bug Report
      </h2>
      <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 0.9rem;">Professional QA Documentation</p>
    </div>

    <!-- Title Section -->
    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 2px solid var(--border); box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
        📌 Title
      </h3>
      <div style="background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%); padding: 16px; border-radius: 10px; border-left: 4px solid var(--accent); font-weight: 700; font-size: 1.1rem; color: var(--text-primary); line-height: 1.6;">
        ${r.Title || 'Not specified'}
      </div>
    </div>

    <!-- Description -->
    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
        📝 Description
      </h3>
      <p style="margin: 0; padding: 14px; background: var(--bg-tertiary); border-radius: 10px; line-height: 1.8; color: var(--text-primary); font-size: 0.95rem;">
        ${r.Description || 'Not specified'}
      </p>
    </div>

    <!-- Steps to Reproduce -->
    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 16px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
        🔢 Steps to Reproduce
      </h3>
      <ol style="margin: 0; padding-left: 0; list-style: none; counter-reset: step-counter;">
        ${(r.Steps_to_Reproduce || ['Not specified']).map((step, index) => `
          <li style="counter-increment: step-counter; margin-bottom: 12px; padding: 14px 16px 14px 50px; background: var(--bg-tertiary); border-radius: 10px; position: relative; color: var(--text-primary); line-height: 1.7;">
            <span style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); background: var(--accent); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.9rem;">
              ${index + 1}
            </span>
            ${step}
          </li>
        `).join('')}
      </ol>
    </div>

    <!-- Expected vs Actual (Side by Side) -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 2px solid #10b981;">
        <h3 style="color: #10b981; margin: 0 0 12px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
          ✅ Expected Result
        </h3>
        <p style="margin: 0; padding: 14px; background: rgba(16, 185, 129, 0.1); border-radius: 10px; border-left: 4px solid #10b981; line-height: 1.7; color: var(--text-primary);">
          ${r.Expected_Result || 'Not specified'}
        </p>
      </div>
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 2px solid #ef4444;">
        <h3 style="color: #ef4444; margin: 0 0 12px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
          ❌ Actual Result
        </h3>
        <p style="margin: 0; padding: 14px; background: rgba(239, 68, 68, 0.1); border-radius: 10px; border-left: 4px solid #ef4444; line-height: 1.7; color: var(--text-primary);">
          ${r.Actual_Result || 'Not specified'}
        </p>
      </div>
    </div>

    <!-- Environment -->
    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
        🖥️ Environment
      </h3>
      <div style="padding: 12px 16px; background: var(--bg-tertiary); border-radius: 10px; font-family: 'Courier New', monospace; color: var(--text-primary); border-left: 4px solid var(--accent);">
        ${r.Environment || 'Not specified'}
      </div>
    </div>

    <!-- Severity & Impact -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
        <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
          ⚠️ Severity / Priority
        </h3>
        <div style="padding: 12px;">
          ${getSeverityBadge(r.Severity_Priority)}
        </div>
      </div>
      <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
        <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
          💥 Impact
        </h3>
        <p style="margin: 0; padding: 12px; background: var(--bg-tertiary); border-radius: 10px; line-height: 1.7; color: var(--text-primary);">
          ${r.Impact || 'Not specified'}
        </p>
      </div>
    </div>

    <!-- Attachments -->
    <div style="background: var(--bg-secondary); border-radius: 12px; padding: 20px; border: 1px solid var(--border);">
      <h3 style="color: var(--accent); margin: 0 0 12px 0; font-size: 1rem; display: flex; align-items: center; gap: 8px; font-weight: 600;">
        📎 Attachments
      </h3>
      <p style="margin: 0; padding: 12px; background: var(--bg-tertiary); border-radius: 10px; color: var(--text-secondary); font-style: italic;">
        ${r.Attachments || 'No attachments'}
      </p>
    </div>
  `;

  els.reportPanel.classList.remove('hidden');
  els.reportPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
