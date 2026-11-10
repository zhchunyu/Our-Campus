#!/usr/bin/env node
/**
 * node scripts/check-secrets.mjs           Scan Git-tracked working-tree text.
 * node scripts/check-secrets.mjs --staged  Scan the complete index, including
 *                                        partially staged files.
 *
 * Requires only Node.js and Git. Git's -I skips binary files; archives are not
 * unpacked, submodules are not traversed, and commit history is not inspected.
 * Binary/archived content and history need a separate audit. Ignore rules do
 * not exempt files that are already tracked. No content or token is printed.
 * Exit codes: 0 clean, 1 token found, 2 scan/command failed (fail closed).
 * Explicit sk-your-*, sk-example-* and sk-placeholder-* examples are ignored.
 */
import { spawnSync } from 'node:child_process';

const tokenPattern = /(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_-]{20,}/g;
const placeholderPattern = /^sk-(?:your|example|placeholder)(?:[-_]|$)/i;

function git(args, cwd, allowNoMatches = false) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || (result.status !== 0 && !(allowNoMatches && result.status === 1))) {
    // Git's diagnostics may include content or arguments. Never relay them.
    throw new Error('Git command failed.');
  }
  return result.stdout;
}

function hasToken(text) {
  return [...text.matchAll(tokenPattern)]
    .some(([token]) => !placeholderPattern.test(token));
}

function locations(output) {
  const found = [];
  let offset = 0;
  // `git grep -n -z` frames each result as path\0line-number\0matched-line\n.
  // Read the NUL fields before the newline so unusual filenames stay intact.
  while (offset < output.length) {
    const pathEnd = output.indexOf('\0', offset);
    const numberEnd = output.indexOf('\0', pathEnd + 1);
    const lineEnd = output.indexOf('\n', numberEnd + 1);
    if (pathEnd < offset || numberEnd < pathEnd || lineEnd < numberEnd) {
      throw new Error('invalid Git output.');
    }
    const path = output.slice(offset, pathEnd);
    const lineNumber = output.slice(pathEnd + 1, numberEnd);
    if (!/^[1-9][0-9]*$/.test(lineNumber)) {
      throw new Error('invalid Git output.');
    }
    if (hasToken(output.slice(numberEnd + 1, lineEnd))) {
      // Redact even a credential accidentally used as part of a filename.
      const safePath = path.replace(tokenPattern, (token) =>
        placeholderPattern.test(token) ? token : '[redacted]');
      const displayPath = /[\x00-\x1f\x7f]/.test(safePath)
        ? JSON.stringify(safePath) : safePath;
      found.push(`${displayPath}:${lineNumber}`);
    }
    offset = lineEnd + 1;
  }
  return found;
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--staged')) {
    throw new Error('unsupported arguments.');
  }
  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).replace(/\r?\n$/, '');
  const grepArgs = [
    'grep', '--full-name', '--no-color', '--no-heading', '--no-break',
    '--no-column', '--no-textconv', '--no-recurse-submodules', '-I', '-n', '-z', '-C0',
  ];
  if (args[0] === '--staged') grepArgs.push('--cached');
  // Capture Git's matched lines privately, then emit only path + line number.
  grepArgs.push('-E', '-e', 'sk-[A-Za-z0-9_-]{20,}', '--');
  const found = locations(git(grepArgs, root, true));
  if (found.length) process.stdout.write(found.join('\n') + '\n');
  process.exitCode = found.length ? 1 : 0;
} catch (error) {
  const safeMessages = new Set([
    'unsupported arguments.', 'Git command failed.', 'invalid Git output.',
  ]);
  const message = safeMessages.has(error?.message) ? error.message : 'scan could not complete.';
  process.stderr.write(`Secret scan failed: ${message}\n`);
  process.exitCode = 2;
}
