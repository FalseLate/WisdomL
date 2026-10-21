/**
 * 星系的派生规则：不新增数据库字段，先把“领域 · 主题”这种命名里的领域读成一级星域。
 * 只有同一领域下至少两颗星球才会成团——单颗主题不配一个空星系，否则满屏都是一颗球的星系。
 *
 * 支持的分隔：· • ｜ | ： : / — –，以及「内科学（循环系统）」这种括号写法。
 * 前端只读，落库仍然是 starmap_topic；以后后端给出 galaxy 字段时，这里可以直接让位给真实字段。
 */
const SEPARATOR = /^(.*?)[\s]*[·•｜|:：/—–][\s]*(.+)$/
const BRACKET = /^(.*?)[\s]*[（(](.+?)[）)][\s]*$/

export function galaxyOfTitle(title) {
  const text = String(title || '').trim()
  if (!text) return null
  const bracket = BRACKET.exec(text)
  if (bracket) {
    const name = bracket[1].trim()
    if (name.length >= 2 && name.length <= 24) return { key: name, name }
  }
  const split = SEPARATOR.exec(text)
  if (split) {
    const name = split[1].trim()
    if (name.length >= 2 && name.length <= 24) return { key: name, name }
  }
  return null
}

/**
 * topics: [{ key, title, color }]
 * 返回 { byTopic: Map<topicKey, galaxyKey>, galaxies: [{ key, title, color, topics }] }
 */
export function deriveGalaxyGroups(topics) {
  const buckets = new Map()
  const byTopic = new Map()
  for (const t of topics) {
    const found = galaxyOfTitle(t.title)
    if (!found) continue
    byTopic.set(t.key, found.key)
    if (!buckets.has(found.key)) buckets.set(found.key, { key: found.key, title: found.name, topics: [], color: null })
    const bucket = buckets.get(found.key)
    bucket.topics.push(t)
    if (!bucket.color && t.color) bucket.color = t.color
  }

  const galaxies = []
  for (const bucket of buckets.values()) {
    if (bucket.topics.length < 2) {
      for (const t of bucket.topics) byTopic.delete(t.key)
      continue
    }
    const topicsOf = bucket.topics.map(t => t.key)
    galaxies.push({
      key: bucket.key,
      title: bucket.title,
      color: bucket.color,
      topics: topicsOf
    })
  }
  return { byTopic, galaxies }
}
