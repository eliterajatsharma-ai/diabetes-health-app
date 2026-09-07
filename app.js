// app.js — Main application state machine and event handling

import { PHASES, INTAKE_QUESTIONS, getQuestionById, calculateBMI, getBMICategory, renderQuestionText, formatChoiceButtons } from './chatbot.js';
import { GeminiClient } from './gemini.js';
import { computeRiskScore, computeVerdict, parseReportText } from './analyzer.js';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  phase: PHASES.WELCOME,
  patientData: {},
  currentQuestionIndex: 0,
  gemini: new GeminiClient(null),
  riskResult: null,
  reportValues: {},
  verdict: null,
  isTyping: false,
  uploadedImageBase64: null,
  uploadedImageMime: null,
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const messagesEl = $('#messages');
const inputEl = $('#userInput');
const sendBtn = $('#sendBtn');
const choicesEl = $('#choiceButtons');
const progressBar = $('#progressBar');
const phaseLabel = $('#phaseLabel');
const fileUploadBtn = $('#fileUploadBtn');
const fileInput = $('#fileInput');
const apiModal = $('#apiModal');
const apiKeyInput = $('#apiKeyInput');
const apiSaveBtn = $('#apiSaveBtn');
const apiSkipBtn = $('#apiSkipBtn');
const uploadSection = $('#uploadSection');
const typingIndicator = $('#typingIndicator');

// ─── Message Rendering ────────────────────────────────────────────────────────
function appendMessage(role, content, opts = {}) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (opts.isHTML) {
    bubble.innerHTML = content;
  } else {
    // Simple markdown: bold, bullet points, line breaks
    bubble.innerHTML = renderMarkdown(content);
  }

  div.appendChild(bubble);
  messagesEl.insertBefore(div, typingIndicator);
  scrollToBottom();
  return div;
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

function showTyping() {
  typingIndicator.style.display = 'flex';
  scrollToBottom();
}

function hideTyping() {
  typingIndicator.style.display = 'none';
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ─── Choice Buttons ───────────────────────────────────────────────────────────
function showChoices(choices) {
  choicesEl.innerHTML = '';
  choices.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      hideChoices();
      handleUserInput(value, label);
    });
    choicesEl.appendChild(btn);
  });
  choicesEl.style.display = 'flex';
}

function hideChoices() {
  choicesEl.style.display = 'none';
  choicesEl.innerHTML = '';
}

// ─── Progress ─────────────────────────────────────────────────────────────────
function updateProgress(phase) {
  const steps = {
    [PHASES.WELCOME]: 0,
    [PHASES.API_SETUP]: 0,
    [PHASES.INTAKE]: 33,
    [PHASES.RISK_REVEAL]: 50,
    [PHASES.TEST_RECOMMENDATION]: 60,
    [PHASES.AWAITING_RESULTS]: 70,
    [PHASES.REPORT_ANALYSIS]: 90,
    [PHASES.COMPLETE]: 100,
  };
  const labels = {
    [PHASES.INTAKE]: '📋 Phase 1: Patient Intake',
    [PHASES.RISK_REVEAL]: '📊 Risk Assessment',
    [PHASES.TEST_RECOMMENDATION]: '🧪 Phase 2: Test Recommendations',
    [PHASES.AWAITING_RESULTS]: '⏳ Awaiting Your Results',
    [PHASES.REPORT_ANALYSIS]: '🔬 Phase 3: Report Analysis',
    [PHASES.COMPLETE]: '✅ Assessment Complete',
  };
  const pct = steps[phase] || 0;
  progressBar.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', pct);
  if (labels[phase]) phaseLabel.textContent = labels[phase];
  // Dynamic color based on phase
  if (pct >= 90) progressBar.style.background = 'linear-gradient(90deg, #22c55e, #16a34a)';
  else if (pct >= 60) progressBar.style.background = 'linear-gradient(90deg, #06b6d4, #0891b2)';
}

// ─── Input Handling ────────────────────────────────────────────────────────────
function handleUserInput(value, displayText = null) {
  const shown = displayText || value;
  if (shown.trim()) {
    appendMessage('user', shown);
  }

  switch (state.phase) {
    case PHASES.INTAKE:
      processIntakeAnswer(value);
      break;
    case PHASES.AWAITING_RESULTS:
      processReportInput(value);
      break;
    default:
      break;
  }
}

// ─── Phase: INTAKE ────────────────────────────────────────────────────────────
async function processIntakeAnswer(value) {
  const question = INTAKE_QUESTIONS[state.currentQuestionIndex];
  if (!question) return;

  // Validate
  if (question.validate && !question.validate(value)) {
    appendMessage('bot', '⚠️ Please enter a valid value and try again.');
    askCurrentQuestion();
    return;
  }

  // Extract and store
  let extracted;
  if (question.type === 'multiselect') {
    extracted = question.extract(value, question.choices);
  } else {
    extracted = question.extract(value);
  }
  state.patientData[question.key] = extracted;

  // Calculate BMI after weight is entered
  if (question.key === 'weight') {
    state.patientData.bmi = calculateBMI(state.patientData.height, state.patientData.weight);
    const bmiCat = getBMICategory(state.patientData.bmi);
    showTyping();
    await delay(600);
    hideTyping();
    appendMessage('bot', `📏 Your BMI is **${state.patientData.bmi}** — *${bmiCat.label}*`);
    await delay(300);
  }

  // Move to next question
  state.currentQuestionIndex++;

  if (state.currentQuestionIndex >= INTAKE_QUESTIONS.length) {
    // Intake complete
    await finishIntake();
  } else {
    await askCurrentQuestion();
  }
}

async function askCurrentQuestion() {
  const question = INTAKE_QUESTIONS[state.currentQuestionIndex];
  if (!question) return;

  showTyping();
  await delay(700);
  hideTyping();

  const text = renderQuestionText(question, state.patientData);
  appendMessage('bot', text);

  const choices = formatChoiceButtons(question);
  if (choices) {
    showChoices(choices);
    disableInput();
  } else {
    enableInput();
  }

  // Update progress bar proportionally through intake
  const pct = Math.round(10 + (state.currentQuestionIndex / INTAKE_QUESTIONS.length) * 40);
  progressBar.style.width = `${pct}%`;
}

async function finishIntake() {
  updateProgress(PHASES.RISK_REVEAL);
  state.phase = PHASES.RISK_REVEAL;

  showTyping();
  await delay(1000);
  hideTyping();

  appendMessage('bot', `✅ Thank you for sharing your health information, **${state.patientData.name}**!

I'm now calculating your **diabetes risk score** based on all the information you've provided...`);

  showTyping();
  await delay(1500);
  hideTyping();

  // Compute risk
  state.riskResult = computeRiskScore(state.patientData);
  await showRiskResult();
}

// ─── Phase: RISK REVEAL ───────────────────────────────────────────────────────
async function showRiskResult() {
  const r = state.riskResult;

  const riskHTML = `
    <div class="risk-card" style="border-left: 4px solid ${r.riskColor}">
      <div class="risk-header">
        <span class="risk-emoji">${r.riskEmoji}</span>
        <div>
          <div class="risk-title">Diabetes Risk Score</div>
          <div class="risk-score" style="color:${r.riskColor}">${r.score}/100 — ${r.riskLevel} Risk</div>
        </div>
      </div>
      <div class="risk-meter-wrap">
        <div class="risk-meter">
          <div class="risk-meter-fill" style="width:${r.score}%; background:${r.riskColor}"></div>
        </div>
      </div>
      <div class="risk-factors">
        <strong>📌 Key Risk Factors Identified:</strong>
        <ul>${r.factors.slice(0, 6).map(f => `<li>${f}</li>`).join('')}</ul>
      </div>
    </div>`;

  appendMessage('bot', riskHTML, { isHTML: true });

  await delay(800);
  updateProgress(PHASES.TEST_RECOMMENDATION);
  state.phase = PHASES.TEST_RECOMMENDATION;
  await showTestRecommendations();
}

// ─── Phase: TEST RECOMMENDATIONS ─────────────────────────────────────────────
async function showTestRecommendations() {
  showTyping();
  await delay(900);
  hideTyping();

  const r = state.riskResult;
  const testsHTML = `
    <div class="tests-card">
      <div class="tests-header">🧪 Recommended Tests for You</div>
      <p style="font-size:0.9em;color:#64748b;margin-bottom:12px">Based on your <strong>${r.riskLevel} risk profile</strong>, here are the tests you should take at a <strong>diagnostic center or hospital</strong>:</p>
      <div class="test-list">
        ${r.recommendedTests.map(t => `
          <div class="test-item urgency-${t.urgency.toLowerCase()}">
            <div class="test-name">🔬 ${t.name}</div>
            <div class="test-why">${t.why}</div>
            <span class="urgency-badge">${t.urgency}</span>
          </div>
        `).join('')}
      </div>
      <div class="test-note">
        💡 <strong>Tip:</strong> You can get these tests done at any certified diagnostic lab (e.g., SRL, Dr. Lal PathLabs, Thyrocare, Apollo Diagnostics). Many offer home sample collection services.
      </div>
    </div>`;

  appendMessage('bot', testsHTML, { isHTML: true });

  await delay(600);
  showTyping();
  await delay(800);
  hideTyping();

  appendMessage('bot', `📅 Once you have your **test results ready**, come back here and I'll help you analyze them!

Please share your results in one of these ways:
- **Type the values** directly (e.g., "HbA1c: 7.2%, Fasting Glucose: 135 mg/dL")
- **Upload a photo or image** of your lab report (click the 📎 button)

Whenever you're ready — go ahead!`);

  updateProgress(PHASES.AWAITING_RESULTS);
  state.phase = PHASES.AWAITING_RESULTS;
  enableInput();
  showUploadButton();
}

// ─── Phase: REPORT INPUT ──────────────────────────────────────────────────────
function showUploadButton() {
  uploadSection.style.display = 'flex';
}

async function processReportInput(text) {
  disableInput();
  hideUploadSection();

  updateProgress(PHASES.REPORT_ANALYSIS);
  state.phase = PHASES.REPORT_ANALYSIS;

  showTyping();
  await delay(1200);
  hideTyping();

  appendMessage('bot', '🔬 Analyzing your report values against **ADA/WHO diabetes thresholds**...');

  showTyping();
  await delay(1500);
  hideTyping();

  let geminiAnalysis = null;

  // Try Gemini analysis first (with image if uploaded)
  if (state.gemini.isConfigured()) {
    try {
      const patientContext = buildPatientContext();
      appendMessage('bot', '🤖 Using AI for deeper analysis...');
      showTyping();
      geminiAnalysis = await state.gemini.analyzeReportWithVision(
        state.uploadedImageBase64,
        state.uploadedImageMime,
        text,
        patientContext
      );
      hideTyping();
    } catch (err) {
      hideTyping();
      console.warn('Gemini analysis failed, using rule-based:', err.message);
    }
  }

  if (geminiAnalysis) {
    appendMessage('bot', geminiAnalysis);
  } else {
    // Rule-based analysis
    const parsed = parseReportText(text);
    state.reportValues = parsed;
    const verdict = computeVerdict(parsed, { ...state.patientData, bmi: state.patientData.bmi });
    state.verdict = verdict;

    if (!verdict || verdict.totalTests === 0) {
      appendMessage('bot', `⚠️ I couldn't detect specific diabetes test values in your message.

Please try entering values like:
- **HbA1c: 7.2%**
- **Fasting Glucose: 135 mg/dL**
- **OGTT: 180 mg/dL**

Or use the 📎 button to upload a photo of your report.`);
      enableInput();
      showUploadButton();
      state.phase = PHASES.AWAITING_RESULTS;
      return;
    }

    showVerdictCard(verdict);
  }

  await delay(1000);
  showFinalMessage();
}

function buildPatientContext() {
  const d = state.patientData;
  const bmiCat = getBMICategory(d.bmi);
  return `Patient: ${d.name}, Age: ${d.age}, Gender: ${d.gender}
BMI: ${d.bmi} (${bmiCat.label})
Family History: ${d.familyHistory}
Symptoms: ${(d.symptoms || []).join(', ') || 'none'}
Activity: ${d.activity}, Diet: ${d.diet}, Smoking: ${d.smoking}
Previous High Sugar: ${d.previousHighSugar}
Heart Rate: ${d.heartRate || 'unknown'}, BP: ${d.bloodPressure || 'unknown'}
Risk Score: ${state.riskResult?.score}/100 (${state.riskResult?.riskLevel} risk)`;
}

function showVerdictCard(verdict) {
  const classTable = Object.entries(verdict.classifications)
    .filter(([k]) => ['fastingGlucose', 'hba1c', 'ogtt', 'randomGlucose'].includes(k))
    .map(([key, c]) => `
      <tr>
        <td>${c.threshold?.label || key}</td>
        <td>${c.value} ${c.threshold?.unit || ''}</td>
        <td style="color:${c.color};font-weight:600">${c.label}</td>
      </tr>
    `).join('');

  const recList = verdict.recommendations.map(r => `<li>${r}</li>`).join('');

  const verdictHTML = `
    <div class="verdict-card" style="border-left:5px solid ${verdict.overallColor}">
      <div class="verdict-header" style="background:${verdict.overallColor}15">
        <span class="verdict-emoji">${verdict.overallColor === '#22c55e' ? '✅' : verdict.overallColor === '#f59e0b' ? '⚠️' : '🚨'}</span>
        <div>
          <div class="verdict-title">Assessment Result</div>
          <div class="verdict-status" style="color:${verdict.overallColor}">${verdict.overallStatus}</div>
          <div class="verdict-severity">${verdict.severity}</div>
        </div>
      </div>

      ${classTable ? `
      <div class="verdict-table-wrap">
        <table class="verdict-table">
          <thead><tr><th>Test</th><th>Your Value</th><th>Status</th></tr></thead>
          <tbody>${classTable}</tbody>
        </table>
      </div>` : ''}

      <div class="verdict-message">${verdict.message.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>

      <div class="verdict-recs">
        <strong>💡 Recommendations:</strong>
        <ul>${recList}</ul>
      </div>
    </div>`;

  appendMessage('bot', verdictHTML, { isHTML: true });
}

async function showFinalMessage() {
  state.phase = PHASES.COMPLETE;
  updateProgress(PHASES.COMPLETE);

  showTyping();
  await delay(800);
  hideTyping();

  appendMessage('bot', `🏁 **Assessment Complete!**

Thank you for using **DiabetesAI**. I hope this helps you take the right steps for your health.

⚠️ **Important Disclaimer**: This is a **screening tool only** and does not replace a professional medical diagnosis. Please share these results with a licensed physician or endocrinologist for proper evaluation and treatment.

---
💙 Take care of yourself — early detection saves lives! If you'd like to start over, refresh the page.`);
}

// ─── File Upload ──────────────────────────────────────────────────────────────
fileUploadBtn?.addEventListener('click', () => fileInput.click());

fileInput?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!validTypes.includes(file.type)) {
    appendMessage('bot', '⚠️ Please upload an image file (JPG, PNG, WebP) of your lab report.');
    return;
  }

  appendMessage('user', `📎 Uploaded: ${file.name}`);
  hideUploadSection();

  const reader = new FileReader();
  reader.onload = async (ev) => {
    const dataUrl = ev.target.result;
    const base64 = dataUrl.split(',')[1];
    state.uploadedImageBase64 = base64;
    state.uploadedImageMime = file.type;

    // Show preview
    const imgHTML = `<div class="report-preview">
      <p style="font-size:0.85em;color:#64748b;margin:0 0 6px">📄 Report uploaded:</p>
      <img src="${dataUrl}" alt="Lab report" style="max-width:100%;max-height:250px;border-radius:8px;border:1px solid #e2e8f0"/>
    </div>`;
    appendMessage('bot', imgHTML, { isHTML: true });

    // Trigger analysis
    await processReportInput('');
  };
  reader.readAsDataURL(file);
});

// ─── API Modal ────────────────────────────────────────────────────────────────
function showApiModal() {
  apiModal.style.display = 'flex';
  setTimeout(() => apiModal.classList.add('visible'), 10);
}

function hideApiModal() {
  apiModal.classList.remove('visible');
  setTimeout(() => apiModal.style.display = 'none', 300);
}

apiSaveBtn?.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key.length > 10) {
    state.gemini.setApiKey(key);
    hideApiModal();
    startIntake();
  } else {
    apiKeyInput.style.borderColor = '#ef4444';
    apiKeyInput.placeholder = 'Please enter a valid API key';
  }
});

apiSkipBtn?.addEventListener('click', () => {
  hideApiModal();
  startIntake();
});

apiKeyInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') apiSaveBtn.click();
});

// ─── Input Controls ────────────────────────────────────────────────────────────
function enableInput() {
  inputEl.disabled = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

function disableInput() {
  inputEl.disabled = true;
  sendBtn.disabled = true;
}

function hideUploadSection() {
  uploadSection.style.display = 'none';
}

// ─── Send Button & Enter Key ──────────────────────────────────────────────────
sendBtn?.addEventListener('click', () => {
  const val = inputEl.value.trim();
  if (!val) return;
  inputEl.value = '';
  handleUserInput(val);
});

inputEl?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

// ─── Utils ────────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function startIntake() {
  updateProgress(PHASES.INTAKE);
  state.phase = PHASES.INTAKE;
  state.currentQuestionIndex = 0;
  await askCurrentQuestion();
}

function init() {
  updateProgress(PHASES.WELCOME);
  phaseLabel.textContent = '👋 Welcome to DiabetesAI';

  // Show API setup modal after 1 second
  setTimeout(() => {
    showApiModal();
  }, 800);
}

init();
