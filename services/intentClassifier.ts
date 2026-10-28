// services/intentClassifier.js
// Detección local por regex — sin llamadas a la API de IA

const BCV_PATTERNS = [
  /tasa\s*(bcv|de cambio|del d[oó]lar)/i,
  /d[oó]lar\s*(oficial|bcv|hoy|actual)/i,
  /precio\s*(del\s*)?d[oó]lar/i,
  /(a cu[aá]nto|en cu[aá]nto|cu[aá]l es).{0,10}(d[oó]lar|tasa)/i,
  /valor\s*(del\s*)?d[oó]lar/i,
  /cambio\s*(oficial|bcv)/i,
];

function isAskingForBCVRate(userMessage) {
  if (!userMessage) return false;
  return BCV_PATTERNS.some((regex) => regex.test(userMessage));
}

const { buscarFAQ, normalizeText, getSaboresEnStock } = require("./faqMatcher");

module.exports = { isAskingForBCVRate, buscarFAQ, normalizeText, getSaboresEnStock };
