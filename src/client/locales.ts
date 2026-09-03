/** Locale dictionaries for the turn-probe view tab. */

export const NS = 'turn-probe'

/** Simplified Chinese dictionary (key-set source of truth). */
export const zh = {
  'view.sessionTree': '链路',
  'tree.empty': '暂无会话树',
  'tree.role.main': '主会话',
  'tree.role.subagent': '子代理',
  'tree.current': '当前',
  'tree.noTurns': '暂无对话轮次',
  'tree.parentCatalogMissing': '请先点击父节点展开（加载子代理 catalog），再点击本节点',
  'tree.loadingOlder': '正在加载更早的轮次…',
  'selection.hint': '点击一个轮次进行分析',
  'selection.turnSelected': '已选第 {index} 轮',
  'selection.analyze': '分析',
  'prompt.label': '分析指令（可编辑，⌘/Ctrl+Enter 直接分析）',
  'prompt.reset': '恢复默认',
  'analysis.empty': '所选轮次没有可分析的内容',
  'analysis.failed': '分析失败：无法创建分析会话或模型未返回结果',
  'preview.mode.preview': '预览',
  'preview.mode.source': '源码',
  'markdown.copy': '复制',
  'markdown.copied': '已复制',
  'markdown.footnotes': '脚注',
} satisfies Record<string, string>

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'view.sessionTree': 'Lineage',
  'tree.empty': 'No session tree',
  'tree.role.main': 'Main',
  'tree.role.subagent': 'Subagent',
  'tree.current': 'current',
  'tree.noTurns': 'No turns',
  'tree.parentCatalogMissing': 'Click the parent node first to load the subagent catalog, then click this node',
  'tree.loadingOlder': 'Loading older turns…',
  'selection.hint': 'Click a turn to analyze',
  'selection.turnSelected': 'Turn {index} selected',
  'selection.analyze': 'Analyze',
  'prompt.label': 'Analysis instruction (editable; ⌘/Ctrl+Enter to analyze)',
  'prompt.reset': 'Reset to default',
  'analysis.empty': 'No analyzable content in the selected turns',
  'analysis.failed': 'Analysis failed: could not run the model',
  'preview.mode.preview': 'Preview',
  'preview.mode.source': 'Source',
  'markdown.copy': 'Copy',
  'markdown.copied': 'Copied',
  'markdown.footnotes': 'Footnotes',
} satisfies Record<string, string>
