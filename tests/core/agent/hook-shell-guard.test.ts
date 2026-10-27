/* The pre-tool guard is the barrier between a cloud model and the user's journal. Every case
 * runs the installed script through Windows PowerShell exactly as Claude Code starts it, with
 * the hook input on stdin: exit 2 blocks, exit 0 allows. A false block costs the agent one
 * retry; a false allow leaks, so the block tables are the long ones. */

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderSetupFile } from '@core/agent/setup-marker';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';
import { registeredHook, runHook, type HookCommand } from '../../helpers/hook';
import { createTempVault, type TempVault } from '../../helpers/vault';

const GUARD_PATH = '.claude/hooks/gaston-shell-guard.ps1';
/** Replaced by the temp vault's absolute Windows path when a case runs. */
const ROOT = '<root>';
const TIMEOUT = 120_000;

function guardTemplate() {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === GUARD_PATH);
  if (found === undefined) throw new Error(`no template at ${GUARD_PATH}`);
  return found;
}

interface GuardCase {
  name: string;
  tool: string;
  input: Record<string, string>;
  /** Vault-relative working directory; the vault root when absent. */
  cwd?: string;
}

const bash = (command: string, cwd?: string): GuardCase => ({
  name: `Bash ${command}${cwd === undefined ? '' : ` (in ${cwd})`}`,
  tool: 'Bash',
  input: { command },
  ...(cwd === undefined ? {} : { cwd }),
});
const ps = (command: string, cwd?: string): GuardCase => ({
  ...bash(command, cwd),
  name: `PowerShell ${command}${cwd === undefined ? '' : ` (in ${cwd})`}`,
  tool: 'PowerShell',
});
const tool = (name: string, input: Record<string, string>): GuardCase => ({
  name: `${name} ${JSON.stringify(input)}`,
  tool: name,
  input,
});

const JOURNAL_FILE = 'journal/2026/10/2026-10-01.md';
const HELP_DIR = `modules/${HELP_MODULE_SLUG}`;
const HELP_PAGE = `${HELP_DIR}/wiki/concepts/agent.md`;

// The hook runtime is Windows PowerShell (powershell.exe), and the CI runner is Windows.
// 60 s: queued spawns (see runHook's concurrency cap) wait inside the test timeout.
describe.runIf(process.platform === 'win32')('pre-tool guard', { timeout: TIMEOUT }, () => {
  let vault: TempVault;
  let hook: HookCommand;

  beforeAll(async () => {
    vault = await createTempVault();
    await vault.write(JOURNAL_FILE, '# Private\n');
    await vault.write('raw/web/page.md', '# Source\n');
    await vault.write('modules/m/wiki/index.md', '# Index\n');
    await vault.write('.secondbrain/index/x.bodies/ab.json', '{}\n');
    await vault.write('.secondbrain/chats/s1.json', '{}\n');
    await vault.write('.secondbrain/agent/results/j1.md', '# Result\n');
    await vault.write('.secondbrain/agent/jobs/j1.md', '# Job\n');
    await vault.write(GUARD_PATH, renderSetupFile(guardTemplate()));
    // Started exactly as settings.json registers it, with the placeholder Claude Code resolves.
    hook = registeredHook(SETTINGS_TEMPLATE.body, 'PreToolUse', vault.root);
  });

  afterAll(async () => {
    await vault.cleanup();
  });

  const runGuard = (stdin: string) => runHook(hook, stdin);

  function decide(c: GuardCase) {
    const toolInput = Object.fromEntries(
      Object.entries(c.input).map(([key, value]) => [key, value.replaceAll(ROOT, vault.root)]),
    );
    const cwd = c.cwd === undefined ? vault.root : vault.absolute(c.cwd);
    return runGuard(
      JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: c.tool,
        tool_input: toolInput,
        cwd,
      }),
    );
  }

  async function expectBlocked(c: GuardCase) {
    const result = await decide(c);
    expect(result.code, c.name).toBe(2);
    expect(result.stderr.trim(), c.name).not.toBe('');
    // A crash inside the guard also exits 2; a case only counts when the guard decided.
    expect(result.stderr, c.name).not.toContain('guard error');
  }

  /** Blocked for the named reason, not merely by some earlier, unrelated check. */
  function expectBlockedWith(reason: string) {
    return async (c: GuardCase) => {
      const result = await decide(c);
      expect(result.code, c.name).toBe(2);
      expect(result.stderr, c.name).toContain(reason);
    };
  }

  async function expectAllowed(c: GuardCase) {
    const result = await decide(c);
    expect({ code: result.code, stdout: result.stdout, stderr: result.stderr }, c.name).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
  }

  it.concurrent.each([
    bash(`cat ${JOURNAL_FILE}`),
    bash('head -n 5 ./Journal/2026/10/2026-10-01.md'),
    bash(`cat "${ROOT}\\journal\\2026\\10\\2026-10-01.md"`),
    bash('ls journal'),
    bash('cd journal && cat 2026/10/2026-10-01.md'),
    bash(`cat ../../${JOURNAL_FILE}`, 'modules/m/wiki'),
    bash('cat JOURNA~1/2026/10/2026-10-01.md'),
    bash('cat */2026/10/*.md'),
    bash('cat j*/2026/10/*.md'),
    bash(`bash -c "cat ${JOURNAL_FILE}"`),
    bash('cmd /c type journal\\2026\\10\\2026-10-01.md'),
    ps('Get-Content journal\\2026\\10\\2026-10-01.md'),
    ps('gc .\\JOURNAL\\2026\\10\\2026-10-01.md'),
    bash('cat .secondbrain/index/x.bodies/ab.json'),
    bash('cat .secondbrain/chats/s1.json'),
    bash('type .secondbrain\\INDEX\\a.json'),
  ])(
    'a shell command that reads a journal file is blocked with a reason: $name',
    expectBlocked,
    TIMEOUT,
  );

  it.concurrent.each([
    ps('type .\\JOURNAL\\2026\\10\\2026-10-01.md'),
    ps('Get-Content -LiteralPath journal\\..'),
    ps('Get-Content -Path:journal\\2026\\10\\2026-10-01.md'),
    bash('cat "jour""nal/2026/10/2026-10-01.md"'),
    bash("cat 'journal. '/2026/10/2026-10-01.md"),
    bash('cat journal./2026/10/2026-10-01.md'),
    bash('cat journal/*'),
    bash('cat j{o,}urnal/2026/10/2026-10-01.md'),
    bash('cat jour\\nal/2026/10/2026-10-01.md'),
    bash('cat jour$()nal/2026/10/2026-10-01.md'),
    bash("cat $'journal'/2026/10/2026-10-01.md"),
    bash('cat [jJ]ournal/2026/10/*.md'),
    bash('cat **/2026-10-01.md'),
    ps("Get-Content ('jour' + 'nal/2026/10/2026-10-01.md')"),
    ps('gc -Path journal'),
    ps('Select-String x journal\\*'),
    bash('more journal\\2026\\10\\2026-10-01.md'),
    bash('cmd /c "type journal\\2026\\10\\2026-10-01.md"'),
    bash('sort journal/2026/10/2026-10-01.md'),
    bash('type jour^nal\\2026\\10\\2026-10-01.md'),
    bash("d=jour; cat $d'nal/2026/10/2026-10-01.md'"),
    bash("cat $'jour\\x6eal'/2026/10/2026-10-01.md"),
    ps('gc ("jour$([char]110)al\\2026\\10\\2026-10-01.md")'),
    ps("gc ('{0}{1}' -f 'jour','nal')"),
    bash('cat /c/x/journal/2026/10/2026-10-01.md'),
    bash('cat .secondbrain/*/a.json'),
    bash('cat .secondbrain/in{d,}ex/x.bodies/ab.json'),
    bash('cd .secondbrain && cat index/x.bodies/ab.json'),
    ps('Get-Content -Path .secondbrain\\chats\\s1.json'),
  ])('other spellings of a journal path are blocked too: $name', expectBlocked, TIMEOUT);

  it.concurrent.each([
    bash('grep -rn mood .'),
    bash('rg mood'),
    bash('find . -name "*.md" -exec cat {} +'),
    bash('cd .. && grep -r mood .', 'modules'),
    bash('findstr /s mood *.md'),
    ps('Get-ChildItem -Recurse | Select-String mood'),
    ps('Get-ChildItem -Path . -Recurse -Filter *.md'),
    tool('Grep', { pattern: 'mood' }),
    tool('Grep', { pattern: 'mood', path: 'journal' }),
    bash('grep -r --include=*.md mood'),
    bash('grep -r -e mood -e sad'),
    bash('grep -rn mood ..', 'modules'),
    bash('echo "grep -r mood ." | bash'),
    bash('ls | xargs grep -r mood'),
    bash('tar czf /tmp/vault.tgz .'),
    bash('cmd /c "dir /s /b"'),
    ps('gci -r -fi *.md | gc'),
    ps('powershell -ExecutionPolicy Bypass -Command Get-ChildItem -Recurse'),
    ps('Copy-Item -Recurse . C:\\Temp\\copy'),
    bash('for /r . %f in (*.md) do type %f'),
    bash('grep -rc mood ..', 'modules'),
    bash('rg mood $PWD/..', 'modules'),
    ps('gci | gci | gci | gci | gc'),
    bash('ls | xargs -I{} cat {}/*/*/*.md'),
    ps("Start-Process powershell -ArgumentList '-c gci -r'"),
    tool('Grep', { pattern: 'mood', path: '..' }),
    bash('grep -rn mood .secondbrain'),
    tool('Grep', { pattern: 'mood', path: '.secondbrain' }),
    bash('rg mood .secondbrain/index'),
    bash('git log -p'),
    bash('git diff'),
    bash('git show HEAD'),
    bash('git blame x'),
    bash('git cat-file -p HEAD:x'),
    bash('git whatchanged -p'),
    bash('git reflog -p'),
    bash('git stash show -p'),
    bash('git format-patch -1'),
    bash('git archive HEAD'),
    bash('git log -p', 'modules'),
    bash('git -C modules log -p -- m'),
  ])('a recursive search from the vault root is blocked: $name', expectBlocked, TIMEOUT);

  it.concurrent.each([
    ps('powershell -EncodedCommand ZQBjAGgAbwA='),
    ps('iex $cmd'),
    bash('eval "$x"'),
    ps('$cmd | iex'),
    bash('echo Z2NpIC1y | base64 -d | bash'),
    bash('bash -c "bash -c \'bash -c \\"bash -c ls\\"\'"'),
  ])('an encoded or dynamic command is blocked: $name', expectBlocked, TIMEOUT);

  it.concurrent.each([
    ps('$p = -join [char[]](106,111,117,114,110,97,108); gc $p'),
    ps('-join [ CHAR [ ] ](106,111)'),
    ps('[System.Char[]]"journal" -join ""'),
  ])(
    'a char array cast is blocked as a dynamic command: $name',
    expectBlockedWith('encoded or dynamic'),
    TIMEOUT,
  );

  it.concurrent.each([
    bash('cat raw/web/page.md'),
    bash('head -20 raw/web/page.md | wc -l'),
    bash('grep -n mood raw/web/page.md'),
    ps('Get-Content raw\\web\\page.md -TotalCount 20'),
  ])('a shell command that only reads raw is allowed: $name', expectAllowed, TIMEOUT);

  it.concurrent.each([
    bash('grep -rn mood modules/'),
    bash('cat modules/m/wiki/concepts/journal-habits.md'),
    bash('grep -n journaling modules/m/wiki/index.md'),
    bash('ls modules/*/wiki'),
    ps('Get-ChildItem modules -Recurse -Filter *.md'),
    tool('Grep', { pattern: 'mood', path: 'modules' }),
    tool('Glob', { pattern: '**/*.md' }),
    bash('ls -la | grep md'),
    ps('Get-ChildItem | Select-Object Name'),
    bash('cat .secondbrain/agent/results/j1.md'),
    bash('grep -rn x .secondbrain/agent'),
    tool('Grep', { pattern: 'x', path: '.secondbrain/agent' }),
    tool('Read', { file_path: '.secondbrain/agent/jobs/j1.md' }),
    bash('git log -p -- modules/m/wiki/index.md'),
    bash('git diff -- modules/'),
    bash('git log --oneline'),
    bash('git status'),
    bash('git rev-parse --show-toplevel'),
  ])('reads and searches scoped away from the journal are allowed: $name', expectAllowed, TIMEOUT);

  it.concurrent.each([
    bash('rm raw/web/page.md'),
    bash('mv raw/web/page.md modules/m/wiki/sources/'),
    bash('cp modules/m/wiki/index.md raw/web/'),
    bash('echo hi > raw/web/page.md'),
    bash('sed -i s/a/b/ raw/web/page.md'),
    bash('cat raw/web/page.md | tee raw/web/b.md'),
    bash('rm -rf r*'),
    bash('git checkout -- .'),
    ps('Remove-Item raw\\web\\page.md'),
    ps('Set-Content -Path raw\\web\\page.md -Value x'),
    ps('Move-Item raw\\web\\page.md modules\\m\\wiki\\sources\\page.md'),
    ps('Get-ChildItem raw | ForEach-Object { Remove-Item $_.FullName }'),
    ps('Get-ChildItem raw | % Delete'),
    bash('del /s /q *.md'),
    bash('echo x > RAW~1/web/page.md'),
    bash('dd if=/dev/zero of=raw/web/page.md'),
    ps('(Get-ChildItem raw).Delete()'),
  ])(
    'a shell command that writes, moves or deletes under raw is blocked: $name',
    expectBlocked,
    TIMEOUT,
  );

  it.concurrent.each([
    bash('rm -rf .claude/hooks'),
    bash('echo {} > .claude/settings.json'),
    ps('Set-Content CLAUDE.md x'),
  ])('the agent cannot change its own guard through the shell: $name', expectBlocked, TIMEOUT);

  it.concurrent.each([
    tool('Read', { file_path: `${ROOT}\\Journal\\2026\\10\\2026-10-01.md` }),
    tool('Glob', { pattern: '*.md', path: 'journal' }),
    tool('Glob', { pattern: '*.json', path: '.secondbrain/chats' }),
    tool('Read', { file_path: `${ROOT}\\.secondbrain\\index\\a.json` }),
    tool('Read', { file_path: '.secondbrain/index/x.bodies/ab.json' }),
    tool('Write', { file_path: 'modules/m/wiki/overview.md', content: 'x' }),
    tool('Edit', { file_path: 'modules/m/module.md', old_string: 'a', new_string: 'b' }),
    tool('Write', { file_path: 'projects/p.md', content: 'x' }),
    tool('Write', { file_path: '.secondbrain/agent/jobs/j1.md', content: 'x' }),
    tool('Write', { file_path: '.secondbrain/gardener.json', content: 'x' }),
    tool('Write', { file_path: 'raw/web/x.md', content: 'x' }),
    tool('Write', { file_path: 'modules/m/wiki/overview.md:stream', content: 'x' }),
    // A path-like field the guard does not know by name is scanned as a fallback.
    tool('Read', { target_path: `${ROOT}/${JOURNAL_FILE}` }),
    tool('Grep', { search_dir: 'journal', pattern: 'x' }),
  ])(
    'file tools reach only the wiki layer and the hand-over folders (blocked): $name',
    expectBlocked,
    TIMEOUT,
  );

  it.concurrent.each([
    tool('Read', { file_path: 'modules/m/wiki/index.md' }),
    tool('Write', { file_path: 'modules/m/wiki/concepts/x.md', content: 'x' }),
    tool('Write', { file_path: '.secondbrain/agent/results/j1.md', content: 'x' }),
    // Content may mention the journal; only path-like fields are scanned.
    tool('Write', {
      file_path: 'modules/m/wiki/concepts/x.md',
      content: 'notes about my journal habits',
    }),
    tool('Write', { file_path: join(tmpdir(), 'gaston-guard-outside', 'x.md'), content: 'x' }),
    bash('mkdir -p modules/m/wiki/concepts'),
    bash('echo x >> modules/m/wiki/log.md'),
  ])(
    'file tools reach only the wiki layer and the hand-over folders (allowed): $name',
    expectAllowed,
    TIMEOUT,
  );

  it.concurrent.each([
    tool('Write', { file_path: HELP_PAGE, content: 'x' }),
    tool('Edit', { file_path: HELP_PAGE, old_string: 'a', new_string: 'b' }),
    tool('MultiEdit', { file_path: HELP_PAGE }),
    tool('NotebookEdit', { notebook_path: `${HELP_DIR}/wiki/n.ipynb` }),
    bash(`echo x > ${HELP_DIR}/wiki/a.md`),
    ps(`Set-Content ${HELP_DIR}/module.md x`),
    bash(`cp a.md ${HELP_DIR}/wiki/`),
  ])(
    'the help module is read-only for the agent (blocked): $name',
    expectBlockedWith('help module'),
    TIMEOUT,
  );

  it.concurrent.each([
    tool('Read', { file_path: HELP_PAGE }),
    bash(`cat ${HELP_PAGE}`),
    tool('Write', { file_path: 'modules/other/wiki/a.md', content: 'x' }),
  ])('the help module is read-only for the agent (allowed): $name', expectAllowed, TIMEOUT);

  it.concurrent.each([
    bash('cat 2026/10/2026-10-01.md', 'journal'),
    bash('ls', '.secondbrain/index'),
    bash('cat s1.json', '.secondbrain/chats'),
    ps('Get-Content 2026\\10\\2026-10-01.md', 'journal'),
  ])('a working directory inside a protected folder is blocked: $name', expectBlocked, TIMEOUT);

  it(
    'a file tool started inside a protected folder is blocked',
    async () => {
      for (const toolName of ['Read', 'Grep', 'Glob']) {
        const result = await runGuard(
          JSON.stringify({
            hook_event_name: 'PreToolUse',
            tool_name: toolName,
            tool_input: { pattern: 'x', file_path: 'a.md' },
            cwd: vault.absolute('journal/2026'),
          }),
        );
        expect(result.code, toolName).toBe(2);
      }
    },
    TIMEOUT,
  );

  it.concurrent.each([
    { name: 'non-JSON stdin', stdin: 'not json' },
    {
      name: 'a command that is a number',
      stdin: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 42 },
      }),
    },
    {
      name: 'an unknown path-like field that is a number',
      stdin: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'modules/m/wiki/index.md', extra_path: 5 },
      }),
    },
  ])(
    'malformed input is blocked, never allowed: $name',
    async ({ stdin }) => {
      const result = await runGuard(stdin);
      expect(result.code).toBe(2);
      expect(result.stderr.trim()).not.toBe('');
    },
    TIMEOUT,
  );
});
