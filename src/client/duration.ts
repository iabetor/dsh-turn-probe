/**
 * 轮次耗时:从 turn 的起止时间算出人读的时长文本。
 *
 * 抽成纯函数以便单测 —— 边界(亚秒、跨分钟、缺一端时间戳)最容易写错,而它们
 * 都只是数字运算,不需要渲染就能验证。
 * @module dsh-turn-probe/client/duration
 */

/** 时长展示文本的来源:两端都有才算"已完成"。 */
export interface TurnTiming {
  /** 开始时间(ms epoch);缺省表示该轮没有可用的开始时刻。 */
  readonly startedAt?: number | undefined
  /** 结束时间(ms epoch);缺省表示仍在进行中。 */
  readonly endedAt?: number | undefined
}

/**
 * 毫秒 → 紧凑时长文本。
 *
 * 精度随量级递减:秒级给一位小数(读者关心"12.4 秒"而不是"12.438 秒"),
 * 分钟级只给整秒,小时级只给整分。
 * @param ms - 时长(毫秒);负数按 0 处理。
 * @returns 形如 `840ms` / `12.4s` / `1m32s` / `1h05m`。
 */
export function formatDuration(ms: number): string {
  const value = Number.isFinite(ms) && ms > 0 ? ms : 0
  if (value < 1000) return `${Math.round(value)}ms`
  const seconds = value / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${String(Math.floor(seconds % 60)).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
}

/**
 * 取一轮的耗时文本。
 *
 * 未结束的轮次(`endedAt` 缺省)返回 undefined —— 不显示一个会随时间变化的数字,
 * 列表就不会为了刷新它而反复重渲染;想看到"进行中"由调用方另行决定。
 * 只有一端时间戳(事件缺 `time`)时同样返回 undefined,而不是伪造 0。
 * @param turn - 该轮的起止时间。
 * @returns 时长文本;无法计算时为 undefined。
 */
export function turnDuration(turn: TurnTiming): string | undefined {
  const { startedAt, endedAt } = turn
  if (startedAt === undefined || endedAt === undefined) return undefined
  return formatDuration(endedAt - startedAt)
}
