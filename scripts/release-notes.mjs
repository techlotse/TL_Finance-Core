import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function argValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function extractCurrentReleaseNotes() {
  const pkg = JSON.parse(read("package.json"));
  const version = pkg.version;

  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`package.json version must be a plain semver release version, got "${version}".`);
  }

  const tag = `v${version}`;
  const changelog = read("docs/release/CHANGELOG.md");
  const headingPattern = new RegExp(`^## ${escapeRegExp(tag)} - \\d{4}-\\d{2}-\\d{2}\\s*$`, "m");
  const heading = changelog.match(headingPattern);

  if (!heading || heading.index === undefined) {
    fail(`docs/release/CHANGELOG.md is missing a dated section for ${tag}.`);
  }

  const remaining = changelog.slice(heading.index + heading[0].length);
  const nextHeadingOffset = remaining.search(/\n## /);
  const section =
    nextHeadingOffset === -1
      ? changelog.slice(heading.index)
      : changelog.slice(heading.index, heading.index + heading[0].length + nextHeadingOffset);
  const notes = section.trim();

  if (/No public changes yet\./i.test(notes)) {
    fail(`${tag} release notes still contain the placeholder text.`);
  }

  return { notes: `${notes}\n`, tag, version };
}

function assertReleaseWorkflow() {
  const workflowPath = ".github/workflows/docker-publish.yml";
  if (!existsSync(join(root, workflowPath))) {
    fail(`${workflowPath} is missing.`);
  }

  const workflow = read(workflowPath);
  const requiredSnippets = [
    "concurrency:",
    "release-plan:",
    "release_needed",
    "git ls-remote --exit-code --tags origin",
    "npm run test:release",
    "type=raw,value=${{ needs.release-plan.outputs.version }}",
    "github-release:",
    "contents: write",
    "node scripts/release-notes.mjs --out",
    "gh release create"
  ];

  const missing = requiredSnippets.filter((snippet) => !workflow.includes(snippet));
  if (missing.length > 0) {
    fail(`Release workflow is missing required automation hooks:\n- ${missing.join("\n- ")}`);
  }
}

const { notes, tag } = extractCurrentReleaseNotes();

if (args.includes("--check")) {
  assertReleaseWorkflow();
  console.log(`Release notes check passed for ${tag}.`);
}

const out = argValue("--out");
if (out) {
  const outputPath = resolve(root, out);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, notes, "utf8");
  console.log(`Wrote release notes for ${tag} to ${out}.`);
}

if (!args.includes("--check") && !out) {
  process.stdout.write(notes);
}
