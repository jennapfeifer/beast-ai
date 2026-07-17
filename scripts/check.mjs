import fs from "node:fs";

const htmlPath = new URL("../public/index.html", import.meta.url);
const html = fs.readFileSync(htmlPath, "utf8");
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error("No inline script found in public/index.html");

// Parse the browser code without executing it.
new Function(match[1]);

const required = [
  "/api/message",
  "/api/speech",
  "/participant",
  "/supervisor",
  "the voice is AI-generated",
  "wordingSource===\"openai\""
];
for (const token of required) {
  if (!html.includes(token)) throw new Error(`Missing expected interface token: ${token}`);
}

console.log("Browser script parsed and required interface elements are present.");
