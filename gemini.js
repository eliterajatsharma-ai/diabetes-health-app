// gemini.js — Gemini API integration for DiabetesAI chatbot

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You are DiabetesAI, a compassionate and knowledgeable medical AI assistant specializing in diabetes screening and education. You are NOT a replacement for a doctor — you are a screening and education tool.

Your role is to:
1. Collect patient health information conversationally and empathetically
2. Explain medical terms in simple language
3. Recommend appropriate diabetes tests based on risk factors
4. Analyze lab report values against ADA/WHO guidelines
5. Always add a disclaimer that your assessment is not a medical diagnosis

Rules:
- Be warm, patient, and non-alarming
- Ask one question at a time
- Always clarify that users should consult a real doctor
- Use simple English — avoid heavy jargon
- When analyzing reports, reference ADA/WHO standards
- Never make absolute diagnoses — say "suggests" or "indicates"

Diabetes reference values (ADA Guidelines):
- Fasting Glucose: Normal <100, Prediabetes 100–125, Diabetes ≥126 mg/dL
- HbA1c: Normal <5.7%, Prediabetes 5.7–6.4%, Diabetes ≥6.5%
- OGTT (2-hr): Normal <140, Prediabetes 140–199, Diabetes ≥200 mg/dL
- Random Glucose: Diabetes ≥200 mg/dL with symptoms`;

export class GeminiClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.conversationHistory = [];
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  isConfigured() {
    return !!this.apiKey && this.apiKey.trim().length > 10;
  }

  addToHistory(role, text) {
    this.conversationHistory.push({ role, parts: [{ text }] });
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  async sendMessage(userMessage, { streaming = false, onChunk = null } = {}) {
    if (!this.isConfigured()) {
      return null; // Caller will use rule-based fallback
    }

    this.addToHistory('user', userMessage);

    const payload = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: this.conversationHistory,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      }
    };

    try {
      const url = `${GEMINI_API_BASE}?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      this.addToHistory('model', text);
      return text;

    } catch (err) {
      console.error('Gemini API error:', err);
      throw err;
    }
  }

  async analyzeReportWithVision(imageBase64, mimeType, reportText, patientContext) {
    if (!this.isConfigured()) return null;

    const parts = [
      {
        text: `You are a diabetes report analyzer. The patient profile is:
${patientContext}

Please analyze the following lab report and:
1. Extract all relevant test values (HbA1c, Fasting Glucose, OGTT, Random Glucose, Cholesterol, etc.)
2. Compare each value against ADA/WHO diabetes thresholds
3. Provide an overall assessment: Normal / Prediabetes / Diabetes (Type 1/Type 2 likelihood)
4. Give actionable next steps
5. Always add a disclaimer

Format your response clearly with sections: 📊 Test Values Found, 🔍 Analysis, 🩺 Assessment, 💡 Recommendations, ⚠️ Disclaimer`
      }
    ];

    if (imageBase64) {
      parts.push({
        inline_data: { mime_type: mimeType, data: imageBase64 }
      });
    }

    if (reportText) {
      parts.push({ text: `\nReport text/values provided by patient:\n${reportText}` });
    }

    const payload = {
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
    };

    const url = `${GEMINI_API_BASE}?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
}
