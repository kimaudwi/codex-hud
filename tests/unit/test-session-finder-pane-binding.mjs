import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SessionFinder } from '../../dist/collectors/session-finder.js';

const env = process['env'];

function makeTempCodexHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hud-session-finder-'));
}

function todayParts() {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return { year, month, day };
}

function rolloutTimestampLabel(offsetMinutes = 0) {
  const now = new Date(Date.now() + offsetMinutes * 60_000);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}-${minute}-${second}`;
}

function writeRollout(home, { sessionId, cwd, fileOffsetMinutes = 0, modifiedAt, extraLines = [] }) {
  const { year, month, day } = todayParts();
  const dir = path.join(home, 'sessions', year, month, day);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `rollout-${rolloutTimestampLabel(fileOffsetMinutes)}-${sessionId}.jsonl`);
  const lines = [
    JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'session_meta',
      payload: {
        id: sessionId,
        timestamp: new Date().toISOString(),
        cwd,
        originator: 'codex-tui',
        cli_version: '0.118.0',
        source: 'cli',
        model_provider: 'openai',
      },
    }),
    ...extraLines.map((line) => JSON.stringify(line)),
  ];

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');

  if (modifiedAt) {
    fs.utimesSync(filePath, modifiedAt, modifiedAt);
  }

  return filePath;
}

function writeSnapshot(home, threadId, paneId, nonce) {
  const dir = path.join(home, 'shell_snapshots');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${threadId}.${nonce}.sh`);
  fs.writeFileSync(
    filePath,
    [
      '# Snapshot file',
      `export TMUX_PANE='${paneId}'`,
      "export PATH='/usr/bin'",
      '',
    ].join('\n'),
    'utf8'
  );
  return filePath;
}

function assertSameFilePath(actual, expected, message) {
  assert.equal(fs.realpathSync(actual), fs.realpathSync(expected), message);
}

const originalCodexHome = process.env.CODEX_HOME;
const originalMainPane = process.env.CODEX_HUD_MAIN_PANE;
const originalSessionsPath = process.env.CODEX_SESSIONS_PATH;

const originalHudSessionId = env.CODEX_HUD_SESSION_ID;
const originalHudTmuxBin = env.CODEX_HUD_TMUX_BIN;

try {
  delete env.CODEX_HUD_SESSION_ID;

  {
    const home = makeTempCodexHome();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hud-cwd-'));
    process.env.CODEX_HOME = home;
    delete process.env.CODEX_SESSIONS_PATH;
    process.env.CODEX_HUD_MAIN_PANE = '%70';

    const modifiedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    writeRollout(home, {
      sessionId: '019d7291-a135-7fe1-b46f-8f3eca4fa451',
      cwd,
      modifiedAt,
    });

    const finder = new SessionFinder(cwd);
    assert.equal(
      finder.check(),
      null,
      'fresh launch without a bound shell snapshot should stay in initialization state'
    );
  }

  {
    const home = makeTempCodexHome();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hud-cwd-'));
    process.env.CODEX_HOME = home;
    delete process.env.CODEX_SESSIONS_PATH;
    process.env.CODEX_HUD_MAIN_PANE = '%70';

    const activeThread = '019d7291-a135-7fe1-b46f-8f3eca4fa451';
    const boundThread = '019d7295-3ef8-7292-a039-fdf7ecd4f53e';

    writeRollout(home, {
      sessionId: activeThread,
      cwd,
      modifiedAt: new Date(),
    });
    const boundRollout = writeRollout(home, {
      sessionId: boundThread,
      cwd,
      fileOffsetMinutes: -1,
      modifiedAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    writeSnapshot(home, boundThread, '%70', 1775743876858615370n);

    const finder = new SessionFinder(cwd);
    const resolved = finder.check();
    assert.ok(resolved, 'expected a pane-bound session to resolve');
    assertSameFilePath(
      resolved.path,
      boundRollout,
      'pane-bound shell snapshot should override the newest unrelated rollout'
    );
  }

  {
    const home = makeTempCodexHome();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hud-cwd-'));
    process.env.CODEX_HOME = home;
    delete process.env.CODEX_SESSIONS_PATH;

    const paneOneThread = '019d7291-a135-7fe1-b46f-8f3eca4fa451';
    const paneTwoThread = '019d7295-3ef8-7292-a039-fdf7ecd4f53e';

    const paneOneRollout = writeRollout(home, {
      sessionId: paneOneThread,
      cwd,
      modifiedAt: new Date(Date.now() - 60 * 1000),
    });
    const paneTwoRollout = writeRollout(home, {
      sessionId: paneTwoThread,
      cwd,
      fileOffsetMinutes: -1,
      modifiedAt: new Date(),
    });

    writeSnapshot(home, paneOneThread, '%70', 1775743639864947215n);
    writeSnapshot(home, paneTwoThread, '%72', 1775743876858615370n);

    process.env.CODEX_HUD_MAIN_PANE = '%70';
    const finderOne = new SessionFinder(cwd);
    const resultOne = finderOne.check();
    assert.ok(resultOne, 'expected pane one to resolve');
    assertSameFilePath(resultOne.path, paneOneRollout, 'pane one should stay on its own thread');

    process.env.CODEX_HUD_MAIN_PANE = '%72';
    const finderTwo = new SessionFinder(cwd);
    const resultTwo = finderTwo.check();
    assert.ok(resultTwo, 'expected pane two to resolve');
    assertSameFilePath(resultTwo.path, paneTwoRollout, 'pane two should stay on its own thread');
  }

  {
    const home = makeTempCodexHome();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hud-cwd-'));
    env.CODEX_HOME = home;
    delete env.CODEX_SESSIONS_PATH;
    env.CODEX_HUD_MAIN_PANE = '%70';

    const newestThread = '019d7291-a135-7fe1-b46f-8f3eca4fa451';
    const explicitThread = '019d7295-3ef8-7292-a039-fdf7ecd4f53e';

    writeRollout(home, {
      sessionId: newestThread,
      cwd,
      modifiedAt: new Date(),
    });
    const explicitRollout = writeRollout(home, {
      sessionId: explicitThread,
      cwd,
      fileOffsetMinutes: -1,
      modifiedAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    env.CODEX_HUD_SESSION_ID = explicitThread;

    const finder = new SessionFinder(cwd);
    const resolved = finder.check();
    assert.ok(resolved, 'expected explicit HUD session id to resolve');
    assertSameFilePath(
      resolved.path,
      explicitRollout,
      'explicit HUD session id should override the newest unrelated rollout'
    );
  }

  {
    const home = makeTempCodexHome();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hud-cwd-'));
    env.CODEX_HOME = home;
    delete env.CODEX_SESSIONS_PATH;
    delete env.CODEX_HUD_SESSION_ID;
    env.CODEX_HUD_MAIN_PANE = '%70';

    const newestThread = '019d7291-a135-7fe1-b46f-8f3eca4fa451';
    const tmuxThread = '019d7295-3ef8-7292-a039-fdf7ecd4f53e';

    writeRollout(home, {
      sessionId: newestThread,
      cwd,
      modifiedAt: new Date(),
    });
    const tmuxRollout = writeRollout(home, {
      sessionId: tmuxThread,
      cwd,
      fileOffsetMinutes: -1,
      modifiedAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const tmuxBin = path.join(home, 'fake-tmux');
    fs.writeFileSync(
      tmuxBin,
      [
        '#!/bin/sh',
        `printf '%s\\n' '"/opt/homebrew/bin/codex resume --remote ws://127.0.0.1:8765 ${tmuxThread}"'`,
        '',
      ].join('\n'),
      'utf8'
    );
    fs.chmodSync(tmuxBin, 0o755);
    env.CODEX_HUD_TMUX_BIN = tmuxBin;

    const finder = new SessionFinder(cwd);
    const resolved = finder.check();
    assert.ok(resolved, 'expected tmux pane start command to resolve');
    assertSameFilePath(
      resolved.path,
      tmuxRollout,
      'tmux pane start command should resolve the resumed remote thread'
    );
  }
} finally {
  if (originalCodexHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = originalCodexHome;
  }

  if (originalMainPane === undefined) {
    delete process.env.CODEX_HUD_MAIN_PANE;
  } else {
    process.env.CODEX_HUD_MAIN_PANE = originalMainPane;
  }

  if (originalSessionsPath === undefined) {
    delete process.env.CODEX_SESSIONS_PATH;
  } else {
    process.env.CODEX_SESSIONS_PATH = originalSessionsPath;
  }
  if (originalHudSessionId === undefined) {
    delete env.CODEX_HUD_SESSION_ID;
  } else {
    env.CODEX_HUD_SESSION_ID = originalHudSessionId;
  }

  if (originalHudTmuxBin === undefined) {
    delete env.CODEX_HUD_TMUX_BIN;
  } else {
    env.CODEX_HUD_TMUX_BIN = originalHudTmuxBin;
  }
}

console.log('test-session-finder-pane-binding: PASS');
