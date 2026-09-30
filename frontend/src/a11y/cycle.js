/**
 * 步进选答的循环游标语义（纯逻辑，可 Node 自测）
 * - 前进（点头）：单向环路 A->B->C->D->A
 * - 后退（微笑）：同样绕回的环路 A->D->C->B->A；未进入时从最后一项开始
 */

export function cycleNext(i, n) {
  if (n <= 0) return -1
  return (i + 1 + n) % n
}

export function cyclePrev(i, n) {
  if (n <= 0) return -1
  if (i < 0) return n - 1   // 还没进入步进态：后退从最后一项开始
  return (i - 1 + n) % n
}
