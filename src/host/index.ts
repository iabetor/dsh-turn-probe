/**
 * dsh-turn-probe host half: a no-op host entry. The plugin's substance is
 * the browser half (the conversation-view tab); this entry exists so the
 * bundle row resolves and the `dsh.client` scan picks up the client bundle.
 */

import type { Context } from '@deepseek-ai/cordis'

/** Stable Cordis plugin name. */
export const name = 'dsh-turn-probe'

/** No services required. */
export const inject: string[] = []

/** No host-side behavior. */
export function apply(_ctx: Context): void {
  // Intentionally empty: all behavior lives in the browser half.
}
