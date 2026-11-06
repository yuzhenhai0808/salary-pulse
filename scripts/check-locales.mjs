import fs from "node:fs";
const zh = JSON.parse(
  fs.readFileSync(
    new URL("../resources/locales/zh-CN/app.json", import.meta.url),
  ),
);
const en = JSON.parse(
  fs.readFileSync(
    new URL("../resources/locales/en-US/app.json", import.meta.url),
  ),
);
const keys = new Set([...Object.keys(zh), ...Object.keys(en)]);
for (const key of keys) {
  if (!zh[key] || !en[key]) throw new Error(`Missing translation: ${key}`);
  const params = (text) =>
    [...text.matchAll(/\{\{(.*?)\}\}/g)]
      .map((m) => m[1])
      .sort()
      .join(",");
  if (params(zh[key]) !== params(en[key]))
    throw new Error(`Interpolation mismatch: ${key}`);
}
console.log(`Verified ${keys.size} bilingual strings.`);
