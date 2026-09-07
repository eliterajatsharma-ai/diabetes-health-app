// chatbot.js — Conversation flow, question sequences, and state machine

export const PHASES = {
  WELCOME: 'welcome',
  API_SETUP: 'api_setup',
  INTAKE: 'intake',
  RISK_REVEAL: 'risk_reveal',
  TEST_RECOMMENDATION: 'test_recommendation',
  AWAITING_RESULTS: 'awaiting_results',
  REPORT_ANALYSIS: 'report_analysis',
  COMPLETE: 'complete',
};

// Sequential intake questions
export const INTAKE_QUESTIONS = [
  {
    id: 'name',
    key: 'name',
    text: `👋 Hello! I'm **DiabetesAI**, your diabetes screening assistant.

I'll guide you through a quick health assessment to understand your diabetes risk, recommend the right tests for you, and help analyze your lab reports.

**This is a screening tool — not a medical diagnosis.** Please always consult a doctor for professional advice.

Let's start! 🌟

**What is your name?**`,
    type: 'text',
    validate: (v) => v.trim().length >= 1,
    extract: (v) => v.trim(),
    next: 'age',
  },
  {
    id: 'age',
    key: 'age',
    textFn: (data) => `Nice to meet you, **${data.name}**! 😊\n\n**How old are you?** (Enter your age in years)`,
    type: 'number',
    validate: (v) => {
      const n = parseInt(v);
      return !isNaN(n) && n >= 1 && n <= 120;
    },
    extract: (v) => parseInt(v),
    next: 'gender',
  },
  {
    id: 'gender',
    key: 'gender',
    text: '**What is your biological sex?** (This helps us assess hormonal risk factors)',
    type: 'choice',
    choices: [
      { value: 'male', label: '👨 Male' },
      { value: 'female', label: '👩 Female' },
      { value: 'other', label: '🧑 Other / Prefer not to say' },
    ],
    extract: (v) => v,
    next: 'height',
  },
  {
    id: 'height',
    key: 'height',
    text: '**What is your height?** (Enter in cm, e.g., 165)',
    type: 'number',
    validate: (v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n >= 50 && n <= 250;
    },
    extract: (v) => parseFloat(v),
    next: 'weight',
  },
  {
    id: 'weight',
    key: 'weight',
    text: '**What is your weight?** (Enter in kg, e.g., 72)',
    type: 'number',
    validate: (v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n >= 10 && n <= 400;
    },
    extract: (v) => parseFloat(v),
    next: 'familyHistory',
  },
  {
    id: 'familyHistory',
    key: 'familyHistory',
    text: `🧬 **Family History**

Does anyone in your **immediate or close family** have diabetes?`,
    type: 'choice',
    choices: [
      { value: 'parent', label: '👪 Yes — My parent(s) have diabetes' },
      { value: 'sibling', label: '👫 Yes — My sibling(s) have diabetes' },
      { value: 'extended', label: '👴 Yes — Grandparent / aunt / uncle / cousin' },
      { value: 'none', label: '✅ No — No family history of diabetes' },
      { value: 'unknown', label: '❓ I don\'t know' },
    ],
    extract: (v) => v,
    next: 'symptoms',
  },
  {
    id: 'symptoms',
    key: 'symptoms',
    text: `🩺 **Symptoms Check**

Which of these symptoms are you currently experiencing? (Select all that apply — type the numbers separated by commas, e.g., "1, 3, 5" or "none")

1. 💧 Excessive thirst (drinking more water than usual)
2. 🚽 Frequent urination (especially at night)
3. 🍽️ Excessive hunger even after eating
4. 😴 Unusual fatigue or tiredness
5. 👁️ Blurred vision
6. 🩹 Slow-healing cuts or wounds
7. 🦶 Tingling or numbness in hands/feet
8. ⚖️ Unexplained weight loss
9. 🌑 Dark patches of skin (neck, armpits)
10. 😤 None of the above`,
    type: 'multiselect',
    choices: [
      { value: 'excessiveThirst', num: 1 },
      { value: 'frequentUrination', num: 2 },
      { value: 'excessiveHunger', num: 3 },
      { value: 'fatigue', num: 4 },
      { value: 'blurredVision', num: 5 },
      { value: 'slowHealing', num: 6 },
      { value: 'tingling', num: 7 },
      { value: 'weightLoss', num: 8 },
      { value: 'darkSkin', num: 9 },
    ],
    extract: (v, choices) => {
      if (v.toLowerCase().includes('none') || v.trim() === '10') return [];
      const nums = v.match(/\d+/g) || [];
      return choices
        .filter(c => nums.includes(String(c.num)))
        .map(c => c.value);
    },
    next: 'activity',
  },
  {
    id: 'activity',
    key: 'activity',
    text: '🏃 **Physical Activity**\n\nHow would you describe your daily physical activity level?',
    type: 'choice',
    choices: [
      { value: 'active', label: '💪 Very active (exercise 5+ days/week)' },
      { value: 'moderate', label: '🚶 Moderately active (2–4 days/week)' },
      { value: 'low', label: '😐 Lightly active (1–2 days/week)' },
      { value: 'sedentary', label: '🛋️ Sedentary (little to no exercise)' },
    ],
    extract: (v) => v,
    next: 'diet',
  },
  {
    id: 'diet',
    key: 'diet',
    text: '🥗 **Diet Habits**\n\nHow would you describe your typical diet?',
    type: 'choice',
    choices: [
      { value: 'healthy', label: '🥦 Healthy (vegetables, whole grains, low sugar)' },
      { value: 'moderate', label: '🍱 Moderate (mixed, occasional junk food)' },
      { value: 'processed', label: '🍟 Mostly processed/fast food' },
      { value: 'highSugar', label: '🍰 High in sugary foods and drinks' },
    ],
    extract: (v) => v,
    next: 'smoking',
  },
  {
    id: 'smoking',
    key: 'smoking',
    text: '🚬 **Do you smoke or use tobacco products?**',
    type: 'choice',
    choices: [
      { value: 'no', label: '✅ No, I don\'t smoke' },
      { value: 'yes', label: '🚬 Yes, I currently smoke' },
      { value: 'former', label: '🔄 I used to smoke but quit' },
    ],
    extract: (v) => v,
    next: 'previousHighSugar',
  },
  {
    id: 'previousHighSugar',
    key: 'previousHighSugar',
    text: '🔬 **Medical History**\n\nHave you ever been told by a doctor that you have **high blood sugar** or **prediabetes**?',
    type: 'choice',
    choices: [
      { value: 'no', label: '✅ No' },
      { value: 'yes', label: '⚠️ Yes' },
      { value: 'unsure', label: '❓ Not sure' },
    ],
    extract: (v) => v,
    next: 'heartRate',
  },
  {
    id: 'heartRate',
    key: 'heartRate',
    text: '❤️ **Resting Heart Rate** (Optional)\n\nDo you know your resting heart rate? (beats per minute, e.g., 72)\nType "skip" if you don\'t know.',
    type: 'text',
    validate: (v) => {
      if (v.toLowerCase() === 'skip') return true;
      const n = parseInt(v);
      return !isNaN(n) && n >= 30 && n <= 200;
    },
    extract: (v) => v.toLowerCase() === 'skip' ? null : parseInt(v),
    next: 'bloodPressure',
  },
  {
    id: 'bloodPressure',
    key: 'bloodPressure',
    text: '🩺 **Blood Pressure** (Optional)\n\nDo you know your last blood pressure reading? (e.g., "120/80")\nType "skip" if you don\'t know.',
    type: 'text',
    validate: (v) => {
      if (v.toLowerCase() === 'skip') return true;
      return /^\d+\/\d+$/.test(v.trim());
    },
    extract: (v) => v.toLowerCase() === 'skip' ? null : v.trim(),
    next: null, // End of intake
  },
];

/**
 * Get a question by its id
 */
export function getQuestionById(id) {
  return INTAKE_QUESTIONS.find(q => q.id === id);
}

/**
 * Calculate BMI from height (cm) and weight (kg)
 */
export function calculateBMI(height, weight) {
  const heightM = height / 100;
  return parseFloat((weight / (heightM * heightM)).toFixed(1));
}

/**
 * Get BMI category
 */
export function getBMICategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', color: '#60a5fa' };
  if (bmi < 25) return { label: 'Normal weight', color: '#22c55e' };
  if (bmi < 30) return { label: 'Overweight', color: '#f59e0b' };
  if (bmi < 35) return { label: 'Obese (Class I)', color: '#f97316' };
  return { label: 'Obese (Class II+)', color: '#ef4444' };
}

/**
 * Render a question text (handles both static text and textFn)
 */
export function renderQuestionText(question, patientData) {
  if (question.textFn) return question.textFn(patientData);
  return question.text;
}

/**
 * Format choice buttons text for display
 */
export function formatChoiceButtons(question) {
  if (!question.choices || question.type === 'multiselect') return null;
  return question.choices;
}
