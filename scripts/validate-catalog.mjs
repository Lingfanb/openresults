import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(await readFile(resolve(root, "data/results.json"), "utf8"));
const required = ["slug", "title", "date", "project", "category", "status", "summary", "path", "thumbnail", "thumbnailAlt", "tags", "metrics"];
const slugs = new Set();
const errors = [];

const insideRoot = (path) => {
  const rel = relative(root, path);
  return rel && !rel.startsWith("..") && !isAbsolute(rel);
};

const checkPath = async (result, field, expectedType) => {
  const value = result[field];
  if (typeof value !== "string" || isAbsolute(value) || /^[a-z]+:/i.test(value)) {
    errors.push(`${result.slug}: ${field} must be a relative site path`);
    return;
  }
  const target = resolve(root, value);
  if (!insideRoot(target)) {
    errors.push(`${result.slug}: ${field} escapes the site root`);
    return;
  }
  try {
    const info = await stat(target);
    if (expectedType === "directory" && !info.isDirectory()) errors.push(`${result.slug}: ${field} must be a directory`);
    if (expectedType === "file" && !info.isFile()) errors.push(`${result.slug}: ${field} must be a file`);
  } catch {
    errors.push(`${result.slug}: ${field} does not exist: ${value}`);
  }
};

if (!Array.isArray(catalog.results) || catalog.results.length === 0) {
  errors.push("results must be a non-empty array");
} else {
  for (const [index, result] of catalog.results.entries()) {
    for (const field of required) {
      if (!result[field] || (Array.isArray(result[field]) && result[field].length === 0)) {
        errors.push(`results[${index}] is missing ${field}`);
      }
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug || "")) errors.push(`results[${index}]: invalid slug`);
    if (slugs.has(result.slug)) errors.push(`duplicate slug: ${result.slug}`);
    slugs.add(result.slug);
    const parsedDate = new Date(`${result.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date || "") || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== result.date) {
      errors.push(`${result.slug}: date must be a valid YYYY-MM-DD value`);
    }
    if (!Array.isArray(result.tags) || result.tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
      errors.push(`${result.slug}: tags must contain non-empty strings`);
    }
    if (!Array.isArray(result.metrics) || result.metrics.length !== 3 || result.metrics.some((metric) => !metric.value || !metric.label)) {
      errors.push(`${result.slug}: metrics must contain exactly 3 value/label pairs`);
    }
    if (typeof result.path === "string" && !result.path.endsWith("/")) errors.push(`${result.slug}: path must end with /`);
    if (typeof result.path === "string" && result.path !== `results/${result.slug}/`) errors.push(`${result.slug}: path must be results/${result.slug}/`);
    if (typeof result.thumbnail === "string" && typeof result.path === "string" && !result.thumbnail.startsWith(result.path)) {
      errors.push(`${result.slug}: thumbnail must live inside the result directory`);
    }
    await checkPath(result, "path", "directory");
    await checkPath(result, "thumbnail", "file");
    await checkPath({...result, index: `${result.path}index.html`}, "index", "file");
  }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Catalog valid: ${catalog.results.length} result(s), ${slugs.size} unique slug(s).`);
