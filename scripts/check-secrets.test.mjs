import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scanner = fileURLToPath(new URL('./check-secrets.mjs', import.meta.url));
// Construct synthetic credentials at runtime so fixtures never resemble real keys.
const token = 'sk-' + 'a'.repeat(32);

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, 'temporary repository setup must succeed');
  return result.stdout;
}

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'secret-scan-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '--quiet');
  return cwd;
}

function write(cwd, path, contents) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), contents);
}

function scan(cwd, ...args) {
  const result = spawnSync(process.execPath, [scanner, ...args], {
    cwd,
    encoding: 'utf8',
  });
  // Check booleans before assertions that might echo stdout/stderr on failure.
  assert.equal((result.stdout + result.stderr).includes(token), false,
    'scanner output must never contain a credential');
  return result;
}

test('reports only tracked text paths and line numbers, once per matching line', (t) => {
  const cwd = repository(t);
  write(cwd, 'credentials.txt', `safe\napi_key=${token}\n中文说明\n${token} ${token}\n`);
  git(cwd, 'add', '--', 'credentials.txt');

  const result = scan(cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'credentials.txt:2\ncredentials.txt:4\n');
  assert.equal(result.stderr, '');
});

test('ignores explicit placeholder tokens, short tokens and ordinary hashes', (t) => {
  const cwd = repository(t);
  const placeholders = ['your', 'example', 'placeholder']
    .map((marker) => 'sk-' + marker + '-' + 'x'.repeat(32));
  write(cwd, 'examples.txt', [
    ...placeholders,
    'sha256=' + 'a'.repeat(64),
    'task-' + 'a'.repeat(32),
    'sk-' + 'b'.repeat(19),
  ].join('\n'));
  git(cwd, 'add', '--', 'examples.txt');

  const result = scan(cwd);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('a placeholder on the same line cannot hide a real token', (t) => {
  const cwd = repository(t);
  write(cwd, 'mixed.txt', 'sk-' + 'example-' + 'x'.repeat(32) + ` ${token}\n`);
  git(cwd, 'add', '--', 'mixed.txt');

  const result = scan(cwd);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'mixed.txt:1\n');
});

test('ignores local ignored env files and other untracked files in both modes', (t) => {
  const cwd = repository(t);
  write(cwd, '.gitignore', 'ignored.env\n');
  write(cwd, 'tracked.txt', 'safe\n');
  git(cwd, 'add', '--', '.gitignore', 'tracked.txt');
  write(cwd, 'ignored.env', `API_KEY=${token}\n`);
  write(cwd, 'untracked.txt', token);

  for (const args of [[], ['--staged']]) {
    const result = scan(cwd, ...args);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
});

test('still scans a tracked file after an ignore rule is added', (t) => {
  const cwd = repository(t);
  write(cwd, 'notes/private.txt', token);
  git(cwd, 'add', '--', 'notes/private.txt');
  write(cwd, '.gitignore', '/notes/\n');
  git(cwd, 'add', '--', '.gitignore');

  for (const args of [[], ['--staged']]) {
    const result = scan(cwd, ...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, 'notes/private.txt:1\n');
  }
});

test('staged mode reads the index even when the working copy is already clean', (t) => {
  const cwd = repository(t);
  write(cwd, 'partial.txt', `safe\n${token}\n`);
  git(cwd, 'add', '--', 'partial.txt');
  write(cwd, 'partial.txt', 'safe\nredacted\n');

  const working = scan(cwd);
  assert.equal(working.status, 0);
  const staged = scan(cwd, '--staged');
  assert.equal(staged.status, 1);
  assert.equal(staged.stdout, 'partial.txt:2\n');
  assert.equal(staged.stderr, '');
});

test('staged mode ignores a secret introduced only in the working copy', (t) => {
  const cwd = repository(t);
  write(cwd, 'partial.txt', 'safe\n');
  git(cwd, 'add', '--', 'partial.txt');
  write(cwd, 'partial.txt', token);

  assert.equal(scan(cwd, '--staged').status, 0);
  assert.equal(scan(cwd).status, 1);
});

test('skips binary blobs without treating embedded bytes as text', (t) => {
  const cwd = repository(t);
  write(cwd, 'binary.dat', Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(token)]));
  git(cwd, 'add', '--', 'binary.dat');

  for (const args of [[], ['--staged']]) {
    assert.equal(scan(cwd, ...args).status, 0);
  }
});

test('works from a repository subdirectory', (t) => {
  const cwd = repository(t);
  write(cwd, 'nested/文件名.txt', `${token}\r\n`);
  git(cwd, 'add', '--', 'nested/文件名.txt');

  const result = scan(join(cwd, 'nested'));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'nested/文件名.txt:1\n');
});

test('rejects unsupported arguments without echoing their contents', (t) => {
  const cwd = repository(t);
  const result = scan(cwd, '--unknown=' + token);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Secret scan failed: unsupported arguments.\n');
});

test('fails closed when Git cannot inspect the repository', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'secret-scan-no-repo-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const result = scan(cwd);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Secret scan failed: Git command failed.\n');
});
