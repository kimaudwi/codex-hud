import assert from 'node:assert/strict';

import { renderRateLimitLine } from '../../dist/render/lines/activity-line.js';
import { stripAnsi } from '../../dist/render/colors.js';

const nowSeconds = Math.floor(Date.now() / 1000);
const rendered = stripAnsi(
  renderRateLimitLine({
    rateLimits: {
      primary: {
        used_percent: 14,
        window_minutes: 300,
        resets_at: nowSeconds + 4 * 60 * 60,
      },
      secondary: {
        used_percent: 12,
        window_minutes: 10080,
        resets_at: nowSeconds + 3 * 24 * 60 * 60 + 14 * 60 * 60,
      },
    },
  })
);

assert.match(rendered, /Usage:/, 'token line should include primary usage');
assert.match(rendered, /14%/, 'token line should include primary usage percent');
assert.match(rendered, /Weekly:/, 'token line should include weekly usage');
assert.match(rendered, /12%/, 'token line should include weekly usage percent');
assert.match(rendered, /resets in/, 'token line should include reset timing');

console.log('test-rate-limit-render: PASS');
