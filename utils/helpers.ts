// utils/helpers.ts

function getCaracasTime(): string {
  return new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });
}

function getSaludoPorHora(): string {
  const hora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Caracas" })
  ).getHours();
  if (hora >= 5 && hora < 12) return "¡Buenos días!";
  if (hora >= 12 && hora < 19) return "¡Buenas tardes!";
  return "¡Buenas noches!";
}

function capitalizarNombre(nombre?: string | null): string {
  if (!nombre) return "";
  return nombre.toLowerCase().replace(/\b\w/g, (letra: string) => letra.toUpperCase());
}

function limpiarCedula(cedula?: string | number | null): string {
  if (!cedula) return "";
  return cedula.toString().replace(/[.,\s]/g, "");
}

/**
 * Normaliza un documento de identidad venezolano a "<LETRA>-<dígitos>".
 * Acepta V (venezolano), E (extranjero), J (jurídico/RIF), G (gobierno) y P (pasaporte).
 * Sin letra asume V. Devuelve null si no hay 7 a 9 dígitos válidos.
 */
function parseDocumentoIdentidad(raw?: string | number | null): string | null {
  if (raw === null || raw === undefined) return null;
  const t = String(raw)
    .trim()
    .replace(/^(?:(?:c[eé]dula(?:\s+de\s+identidad)?|rif|dni)\b|c\s*\.?\s*i\s*\.?)[:\-\s\.]*/i, "");
  const m = t.match(/^([vejgp])?[\s:\-\.]*(\d[\d\.\-\s]*\d)$/i);
  if (!m) return null;
  const digitos = m[2].replace(/\D/g, "");
  if (!/^\d{7,9}$/.test(digitos)) return null;
  return `${(m[1] || "V").toUpperCase()}-${digitos}`;
}

function formatBs(amount?: number | string | null): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return "0,00";
  return Number(amount).toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUsd(amount?: number | string | null): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return "0.00";
  return Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function esDiaNoLaborable(date: Date = new Date()): boolean {
  const { esDiaNoLaborable: checkDiaNoLaborable } = require("../services/horarioService");
  return checkDiaNoLaborable(date);
}

function esFinDeSemanaCaracas(date: Date = new Date()): boolean {
  return esDiaNoLaborable(date);
}

module.exports = {
  getCaracasTime,
  getSaludoPorHora,
  capitalizarNombre,
  limpiarCedula,
  parseDocumentoIdentidad,
  formatBs,
  formatUsd,
  esDiaNoLaborable,
  esFinDeSemanaCaracas,
};
