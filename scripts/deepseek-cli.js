#!/usr/bin/env node

const path = require("path");
const readline = require("readline");
const axios = require("axios");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const apiKey = process.env.DEEPSEEK_API_KEY;
const model = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const messages = [
  { role: "system", content: "Responde de forma clara y útil en español." },
];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Uso: deepseek [consulta]");
  console.log("     deepseek                  modo interactivo");
  console.log("     deepseek \"tu consulta\"   respuesta única");
  process.exit(0);
}

if (!apiKey) {
  console.error("Falta DEEPSEEK_API_KEY en el archivo .env o en el entorno.");
  process.exit(1);
}

async function askDeepSeek(question) {
  messages.push({ role: "user", content: question });

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      { model, messages, temperature: 0.2 },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const answer = response.data.choices?.[0]?.message?.content;
    if (!answer) throw new Error("DeepSeek no devolvió una respuesta.");
    messages.push({ role: "assistant", content: answer });
    console.log(`\n${answer}\n`);
  } catch (error) {
    messages.pop();
    const detail = error.response?.data?.error?.message || error.message;
    console.error(`Error consultando DeepSeek: ${detail}`);
    process.exitCode = 1;
  }
}

const question = process.argv.slice(2).join(" ").trim();
if (question) {
  askDeepSeek(question);
} else {
  const terminal = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "deepseek> ",
  });

  console.log("DeepSeek CLI. Escribe una consulta o Ctrl-D para salir.");
  terminal.prompt();
  terminal.on("line", async (line) => {
    const input = line.trim();
    if (input) await askDeepSeek(input);
    terminal.prompt();
  });
  terminal.on("close", () => console.log("Hasta luego."));
}