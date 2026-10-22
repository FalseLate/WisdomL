const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function stripOptionPrefix(value, letter) {
  if (typeof value !== 'string' || !letter) return value
  const stripped = value.replace(new RegExp(`^\\s*${letter}\\s*[.、:：)）]?\\s*`, 'i'), '')
  return stripped || value
}

/**
 * 错题接口历史上同时存在 question/stem 两种题干字段，options 也有数组和对象两种形状。
 * 统一成 { question, options: { A, B, C... } }，避免页面把旧数据渲染成空题干和 0.1.2.。
 */
export function normalizeWrongQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const stem = [raw.question, raw.stem, raw.content, raw.title]
    .find(v => typeof v === 'string' && v.trim()) || ''
  if (!stem) return null

  let options = raw.options
  if (Array.isArray(options)) {
    options = Object.fromEntries(options.map((v, i) => {
      const letter = LETTERS[i] || String(i)
      return [letter, stripOptionPrefix(v, LETTERS[i] || '')]
    }))
  } else if (options && typeof options === 'object') {
    const entries = Object.entries(options)
    const numericKeys = entries.length > 0 && entries.every(([k]) => /^\d+$/.test(k))
    if (numericKeys) {
      options = Object.fromEntries(
        entries
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([, v], i) => {
            const letter = LETTERS[i] || String(i)
            return [letter, stripOptionPrefix(v, LETTERS[i] || '')]
          })
      )
    } else {
      options = Object.fromEntries(entries.map(([k, v]) => [
        /^[A-Z]$/i.test(k) ? k.toUpperCase() : k,
        v
      ]))
    }
  }

  return { ...raw, question: stem.trim(), options }
}
