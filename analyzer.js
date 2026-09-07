// analyzer.js — Diabetes report analysis engine (ADA/WHO thresholds)

export const THRESHOLDS = {
  fastingGlucose: {
    label: 'Fasting Plasma Glucose',
    unit: 'mg/dL',
    normal: { max: 99, label: 'Normal' },
    prediabetes: { min: 100, max: 125, label: 'Prediabetes' },
    diabetes: { min: 126, label: 'Diabetes' },
  },
  hba1c: {
    label: 'HbA1c (Glycated Hemoglobin)',
    unit: '%',
    normal: { max: 5.6, label: 'Normal' },
    prediabetes: { min: 5.7, max: 6.4, label: 'Prediabetes' },
    diabetes: { min: 6.5, label: 'Diabetes' },
  },
  ogtt: {
    label: 'OGTT 2-Hour Glucose',
    unit: 'mg/dL',
    normal: { max: 139, label: 'Normal' },
    prediabetes: { min: 140, max: 199, label: 'Prediabetes' },
    diabetes: { min: 200, label: 'Diabetes' },
  },
  randomGlucose: {
    label: 'Random Blood Glucose',
    unit: 'mg/dL',
    normal: { max: 139, label: 'Normal' },
    prediabetes: null,
    diabetes: { min: 200, label: 'Diabetes (with symptoms)' },
  },
  bloodPressureSystolic: {
    label: 'Blood Pressure (Systolic)',
    unit: 'mmHg',
    normal: { max: 119, label: 'Normal' },
    elevated: { min: 120, max: 129, label: 'Elevated' },
    high: { min: 130, label: 'High (Hypertension)' },
  },
  cholesterolTotal: {
    label: 'Total Cholesterol',
    unit: 'mg/dL',
    normal: { max: 199, label: 'Desirable' },
    borderline: { min: 200, max: 239, label: 'Borderline High' },
    high: { min: 240, label: 'High' },
  }
};

/**
 * Classify a single test value
 */
export function classifyValue(testKey, value) {
  const t = THRESHOLDS[testKey];
  if (!t) return null;

  const v = parseFloat(value);
  if (isNaN(v)) return null;

  if (testKey === 'fastingGlucose' || testKey === 'hba1c' || testKey === 'ogtt' || testKey === 'randomGlucose') {
    if (v <= t.normal.max) return { status: 'normal', label: t.normal.label, color: '#22c55e' };
    if (t.prediabetes && v >= t.prediabetes.min && v <= t.prediabetes.max) return { status: 'prediabetes', label: t.prediabetes.label, color: '#f59e0b' };
    if (v >= t.diabetes.min) return { status: 'diabetes', label: t.diabetes.label, color: '#ef4444' };
  }

  if (testKey === 'bloodPressureSystolic') {
    if (v <= t.normal.max) return { status: 'normal', label: t.normal.label, color: '#22c55e' };
    if (v <= t.elevated.max) return { status: 'elevated', label: t.elevated.label, color: '#f59e0b' };
    return { status: 'high', label: t.high.label, color: '#ef4444' };
  }

  if (testKey === 'cholesterolTotal') {
    if (v <= t.normal.max) return { status: 'normal', label: t.normal.label, color: '#22c55e' };
    if (v <= t.borderline.max) return { status: 'borderline', label: t.borderline.label, color: '#f59e0b' };
    return { status: 'high', label: t.high.label, color: '#ef4444' };
  }

  return null;
}

/**
 * Parse user-entered report text to extract test values
 * Supports patterns like "hba1c 7.2" "fasting glucose: 130" etc.
 */
export function parseReportText(text) {
  const lower = text.toLowerCase();
  const results = {};

  // HbA1c
  const hba1cMatch = lower.match(/(?:hba1c|a1c|glycated|glycohemoglobin)[:\s=]*([0-9]+\.?[0-9]*)\s*%?/);
  if (hba1cMatch) results.hba1c = parseFloat(hba1cMatch[1]);

  // Fasting glucose
  const fastingMatch = lower.match(/(?:fasting\s*(?:plasma\s*)?(?:blood\s*)?glucose|fpg|fbs)[:\s=]*([0-9]+\.?[0-9]*)\s*(?:mg\/dl|mgdl)?/);
  if (fastingMatch) results.fastingGlucose = parseFloat(fastingMatch[1]);

  // OGTT
  const ogttMatch = lower.match(/(?:ogtt|oral\s*glucose\s*tolerance|2[-\s]?hour\s*glucose|pp\s*glucose|ppbs)[:\s=]*([0-9]+\.?[0-9]*)/);
  if (ogttMatch) results.ogtt = parseFloat(ogttMatch[1]);

  // Random glucose
  const randomMatch = lower.match(/(?:random\s*(?:blood\s*)?glucose|rbs|rbs)[:\s=]*([0-9]+\.?[0-9]*)/);
  if (randomMatch) results.randomGlucose = parseFloat(randomMatch[1]);

  // Blood pressure systolic
  const bpMatch = lower.match(/(?:bp|blood\s*pressure)[:\s=]*([0-9]+)\s*\/\s*[0-9]+/);
  if (bpMatch) results.bloodPressureSystolic = parseFloat(bpMatch[1]);

  // Total cholesterol
  const cholMatch = lower.match(/(?:total\s*cholesterol|cholesterol)[:\s=]*([0-9]+\.?[0-9]*)/);
  if (cholMatch) results.cholesterolTotal = parseFloat(cholMatch[1]);

  return results;
}

/**
 * Compute overall diabetes verdict from parsed test values
 */
export function computeVerdict(parsedValues, patientData) {
  const classifications = {};
  let diabetesCount = 0;
  let prediabetesCount = 0;
  let totalTests = 0;

  for (const [key, value] of Object.entries(parsedValues)) {
    if (['fastingGlucose', 'hba1c', 'ogtt', 'randomGlucose'].includes(key)) {
      const result = classifyValue(key, value);
      if (result) {
        classifications[key] = { value, ...result, threshold: THRESHOLDS[key] };
        totalTests++;
        if (result.status === 'diabetes') diabetesCount++;
        if (result.status === 'prediabetes') prediabetesCount++;
      }
    }
  }

  // Other vitals
  for (const [key, value] of Object.entries(parsedValues)) {
    if (['bloodPressureSystolic', 'cholesterolTotal'].includes(key)) {
      const result = classifyValue(key, value);
      if (result) classifications[key] = { value, ...result, threshold: THRESHOLDS[key] };
    }
  }

  let overallStatus, overallColor, severity, message, recommendations;

  if (totalTests === 0) {
    return null; // No diabetes-specific tests found
  }

  if (diabetesCount >= 1) {
    // ADA: Diagnosis of diabetes requires 2 abnormal results on same sample or 2 separate tests
    overallStatus = 'Diabetes Indicated';
    overallColor = '#ef4444';
    severity = diabetesCount >= 2 ? 'High Confidence' : 'Requires Confirmation';

    // Estimate type
    const age = patientData?.age || 0;
    const bmi = patientData?.bmi || 0;
    const familyHistory = patientData?.familyHistory;
    const symptoms = patientData?.symptoms || [];
    const rapidOnset = symptoms.includes('weightLoss') && age < 30;

    const typeGuess = rapidOnset
      ? 'Type 1 Diabetes (rapid onset + weight loss suggests autoimmune)'
      : 'Type 2 Diabetes (most likely based on your profile)';

    message = `Your test results ${severity === 'High Confidence' ? 'strongly indicate' : 'suggest'} **${typeGuess}**.`;
    recommendations = [
      '🏥 Visit an endocrinologist or diabetologist immediately',
      '🩸 Confirm diagnosis with your doctor (repeat testing may be done)',
      '💊 Discuss treatment plan: lifestyle changes, oral medications, or insulin',
      '📋 Get a complete metabolic panel, kidney function, and eye exam',
      '🥗 Begin a low-glycemic diet and increase physical activity',
      '📏 Monitor blood sugar daily with a glucometer',
    ];
  } else if (prediabetesCount >= 1) {
    overallStatus = 'Prediabetes Indicated';
    overallColor = '#f59e0b';
    severity = 'Moderate Risk';
    message = `Your results suggest **Prediabetes** — your blood sugar is higher than normal but not yet at diabetes levels. This is a critical window to prevent Type 2 Diabetes.`;
    recommendations = [
      '👨‍⚕️ Consult your doctor to confirm and develop a prevention plan',
      '🥗 Adopt a low-sugar, high-fiber diet (Mediterranean or DASH diet)',
      '🏃 Get at least 150 minutes of moderate exercise per week',
      '⚖️ Lose 5–7% of body weight if overweight',
      '🩸 Re-test HbA1c every 3–6 months',
      '🚭 Quit smoking and reduce alcohol intake',
    ];
  } else {
    overallStatus = 'Normal Range';
    overallColor = '#22c55e';
    severity = 'Low Risk';
    message = `Great news! Your test results are within **normal range** based on ADA guidelines. Keep maintaining your healthy lifestyle.`;
    recommendations = [
      '✅ Continue healthy eating and regular exercise',
      '🩸 Get fasting glucose and HbA1c checked annually',
      '⚖️ Maintain a healthy BMI (18.5–24.9)',
      '🧘 Manage stress — cortisol can affect blood sugar',
      '😴 Ensure adequate sleep (7–9 hours per night)',
    ];
  }

  return {
    classifications,
    overallStatus,
    overallColor,
    severity,
    message,
    recommendations,
    diabetesCount,
    prediabetesCount,
    totalTests,
  };
}

/**
 * Compute diabetes risk score from patient intake data (0–100)
 */
export function computeRiskScore(patientData) {
  let score = 0;
  const factors = [];

  // Age risk
  if (patientData.age >= 65) { score += 15; factors.push('Age 65+ (high risk)'); }
  else if (patientData.age >= 45) { score += 10; factors.push('Age 45+ (moderate risk)'); }
  else if (patientData.age >= 35) { score += 5; factors.push('Age 35+ (slightly elevated risk)'); }

  // BMI risk
  const bmi = patientData.bmi;
  if (bmi >= 35) { score += 20; factors.push('Severe obesity (BMI ≥35)'); }
  else if (bmi >= 30) { score += 15; factors.push('Obesity (BMI 30–34.9)'); }
  else if (bmi >= 25) { score += 8; factors.push('Overweight (BMI 25–29.9)'); }
  else if (bmi < 18.5) { score += 3; factors.push('Underweight (slight risk for Type 1)'); }

  // Family history
  if (patientData.familyHistory === 'parent') { score += 15; factors.push('Parent with diabetes'); }
  else if (patientData.familyHistory === 'sibling') { score += 12; factors.push('Sibling with diabetes'); }
  else if (patientData.familyHistory === 'extended') { score += 6; factors.push('Extended family with diabetes'); }

  // Symptoms
  const symptoms = patientData.symptoms || [];
  if (symptoms.includes('excessiveThirst')) { score += 8; factors.push('Excessive thirst (polydipsia)'); }
  if (symptoms.includes('frequentUrination')) { score += 8; factors.push('Frequent urination (polyuria)'); }
  if (symptoms.includes('excessiveHunger')) { score += 5; factors.push('Excessive hunger (polyphagia)'); }
  if (symptoms.includes('fatigue')) { score += 5; factors.push('Unusual fatigue'); }
  if (symptoms.includes('blurredVision')) { score += 7; factors.push('Blurred vision'); }
  if (symptoms.includes('slowHealing')) { score += 6; factors.push('Slow-healing wounds'); }
  if (symptoms.includes('tingling')) { score += 6; factors.push('Tingling/numbness in feet'); }
  if (symptoms.includes('weightLoss')) { score += 8; factors.push('Unexplained weight loss'); }
  if (symptoms.includes('darkSkin')) { score += 5; factors.push('Dark skin patches (acanthosis nigricans)'); }

  // Lifestyle
  if (patientData.activity === 'sedentary') { score += 10; factors.push('Sedentary lifestyle'); }
  else if (patientData.activity === 'low') { score += 5; factors.push('Low physical activity'); }
  if (patientData.diet === 'highSugar') { score += 8; factors.push('High sugar/carb diet'); }
  else if (patientData.diet === 'processed') { score += 5; factors.push('Processed food diet'); }
  if (patientData.smoking === 'yes') { score += 5; factors.push('Current smoker'); }

  // Medical history
  if (patientData.previousHighSugar === 'yes') { score += 15; factors.push('Previously elevated blood sugar'); }
  if (patientData.gestationalDiabetes === 'yes') { score += 12; factors.push('History of gestational diabetes'); }
  if (patientData.hypertension === 'yes') { score += 5; factors.push('Hypertension'); }
  if (patientData.gender === 'female' && patientData.pcos === 'yes') { score += 8; factors.push('PCOS (polycystic ovary syndrome)'); }

  // Cap at 100
  score = Math.min(score, 100);

  // Determine risk level
  let riskLevel, riskColor, riskEmoji;
  if (score >= 60) { riskLevel = 'High'; riskColor = '#ef4444'; riskEmoji = '🔴'; }
  else if (score >= 35) { riskLevel = 'Moderate'; riskColor = '#f59e0b'; riskEmoji = '🟡'; }
  else { riskLevel = 'Low'; riskColor = '#22c55e'; riskEmoji = '🟢'; }

  // Recommended tests based on risk
  let recommendedTests;
  if (score >= 60) {
    recommendedTests = [
      { name: 'Fasting Plasma Glucose (FPG)', why: 'Primary diabetes screening test', urgency: 'Urgent' },
      { name: 'HbA1c (Glycated Hemoglobin)', why: 'Shows 3-month average blood sugar', urgency: 'Urgent' },
      { name: 'Oral Glucose Tolerance Test (OGTT)', why: 'Detects early glucose regulation issues', urgency: 'Urgent' },
      { name: 'Lipid Profile (Cholesterol Panel)', why: 'Diabetes increases cardiovascular risk', urgency: 'Recommended' },
      { name: 'Kidney Function Test (KFT/eGFR)', why: 'Diabetes can damage kidneys', urgency: 'Recommended' },
      { name: 'Urine Microalbumin', why: 'Early kidney damage marker', urgency: 'Recommended' },
      { name: 'Random Blood Glucose', why: 'Quick screen anytime of day', urgency: 'Recommended' },
    ];
  } else if (score >= 35) {
    recommendedTests = [
      { name: 'Fasting Plasma Glucose (FPG)', why: 'Primary diabetes screening test', urgency: 'Recommended' },
      { name: 'HbA1c (Glycated Hemoglobin)', why: 'Shows 3-month average blood sugar', urgency: 'Recommended' },
      { name: 'Lipid Profile', why: 'Check cholesterol and triglycerides', urgency: 'Optional' },
    ];
  } else {
    recommendedTests = [
      { name: 'Fasting Plasma Glucose (FPG)', why: 'Annual preventive screening', urgency: 'Routine' },
      { name: 'HbA1c', why: 'Annual preventive screening', urgency: 'Routine' },
    ];
  }

  return { score, riskLevel, riskColor, riskEmoji, factors, recommendedTests };
}
