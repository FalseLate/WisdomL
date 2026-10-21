// 轻量 Markdown 渲染（AI 回复用）：先转义 HTML 防注入，再处理 标题/列表/加粗/行内代码/换行。
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
}
export function renderMarkdown(text) {
  if (text == null) return ''
  const lines = esc(String(text)).split('\n')
  let html = '', inList = false
  const closeList = () => { if (inList) { html += '</ul>'; inList = false } }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    const li = line.match(/^[-*]\s+(.*)$/)
    const ol = line.match(/^\d+\.\s+(.*)$/)
    if (h) { closeList(); const lvl = Math.min(h[1].length + 2, 6); html += `<h${lvl}>${inline(h[2])}</h${lvl}>` }
    else if (li || ol) { if (!inList) { html += '<ul>'; inList = true } html += `<li>${inline((li || ol)[1])}</li>` }
    else if (line === '') { closeList() }
    else { closeList(); html += `<p>${inline(line)}</p>` }
  }
  closeList()
  return html
}
