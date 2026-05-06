/**
 * Identity Line Renderer
 * Renders: [Model]
 * Model name only; context usage is rendered on the token/detail line.
 */

import type { HudData, LayoutConfig } from '../../types.js';
import { theme, truncate, truncateAnsi } from '../colors.js';
import { getModelDisplayName } from '../../collectors/codex-config.js';

/**
 * Render the identity line
 * Format: [Model]
 */
export function renderIdentityLine(
  data: HudData,
  _layout: LayoutConfig,
  options: { maxWidth?: number } = {}
): string {
  // Model name in brackets
  const modelName = data.session?.model ?? getModelDisplayName(data.config);
  const reasoningEffort = data.session?.reasoningEffort ?? data.config.model_reasoning_effort;
  const showReasoningEffort = Boolean((data.session?.model ?? data.config.model) && reasoningEffort);
  const identityName = showReasoningEffort ? `${modelName} ${reasoningEffort}` : modelName;

  const maxWidth = options.maxWidth;
  let modelDisplay = theme.modelBracket('[') + theme.model(identityName) + theme.modelBracket(']');
  if (maxWidth && maxWidth > 0) {
    const maxModelLen = Math.max(1, maxWidth - 2);
    const trimmedModel = truncate(identityName, maxModelLen, '…');
    modelDisplay = theme.modelBracket('[') + theme.model(trimmedModel) + theme.modelBracket(']');
  }

  return maxWidth ? truncateAnsi(modelDisplay, maxWidth) : modelDisplay;
}
