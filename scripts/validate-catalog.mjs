import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalogPath = resolve(root, "data/results.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const required = ["slug", "title", "date", "project", "category", "status", "summary", "path", "thumbnail", "tags", "metrics"];
const slugs = new Set();
const errors = [];

for (const [index, result] of catalog.results.entries()) {
  for (const field of required) {
    if (!result[field] || (Array.isArray(result[field]) && result[field].length === 0)) {
      errors.push(`results[${index}] is missing ${field}`);
    }
  }
  if (slugs.has(result.slug)) errors.push(`duplicate slug: ${result.slug}`);
  slugs.add(result.slug);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date)) errors.push(`${result.slug}: date must be YYYY-MM-DD`);
  if (!Array.isArray(result.metrics) || result.metrics.length !== 3) errors.push(`${result.slug}: metrics must contain exactly 3 items`);
  for (const field of ["path", "thumbnail"]) {
    try {
      await access(resolve(root, result[field]));
    } catch {
      errors.push(`${result.slug}: ${field} does not exist: ${result[field]}`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Catalog valid: ${catalog.results.length} result(s), ${slugs.size} unique slug(s).`);
