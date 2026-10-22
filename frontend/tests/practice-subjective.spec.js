// @ts-check
// 纯题目提取可能只有主观题：试卷模式不能因为“没有客观题”把整个列表藏掉。
// 今日复习的 options 也可能是数组，点击后 picked 必须是字符串。
import { test, expect } from '@playwright/test'

const AUTH = ['fake-token-for-subjective-only', { id: 1001, username: 'subonly', nickname: '主观题' }]

function seed(page) {
  return page.addInitScript(([token, user]) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
  }, AUTH)
}

test('只有主观题的纯题目记录：试卷模式直接显示主观题，不再空白', async ({ page }) => {
  await seed(page)
  const subjective = Array.from({ length: 6 }, (_, i) => ({
    id: i + 1,
    type: 'subjective',
    question: `第 ${i + 1} 道主观题：请说明你的理解。`,
    answer: `参考答案 ${i + 1}`,
    explanation: `解析 ${i + 1}`
  }))
  // 题库跳转后会写进 qStore；这里直接把同样的题目状态带到 /practice，
  // 专门验证“客观 0 + 主观 6”时 PracticeView 不再把主观列表藏掉。
  await page.addInitScript(qs => {
    localStorage.setItem('zhifuxi-questions', JSON.stringify({ questions: qs }))
  }, subjective)

  await page.goto('/practice')
  await expect(page.locator('.sub-card').first()).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.sub-card')).toHaveCount(6)
  await expect(page.locator('.empty-state')).toHaveCount(0)
  // 只有一种题型时不显示双 tab，但题目本身必须出现
  await expect(page.locator('.cyber-tabs')).toHaveCount(0)
  await page.screenshot({ path: 'shots/practice-subjective-only.png' })
})

test('今日复习：options 是数组时点击选项不会让 picked 变成数字', async ({ page }) => {
  await seed(page)
  const q = {
    question: '下面哪个选项是正确的？',
    options: ['选项一', '选项二', '选项三', '选项四'],
    answer: 'A',
    explanation: '测试解析'
  }
  await page.route('**/api/wrong-questions/review-today', r => r.fulfill({
    json: {
      list: [{
        id: 7,
        questionType: 'single',
        questionContent: JSON.stringify(q),
        correctAnswer: 'A',
        wrongCount: 1,
        isSlow: 0
      }]
    }
  }))
  const errors = []
  page.on('pageerror', e => errors.push(String(e?.message || e)))

  await page.goto('/review-today')
  await expect(page.locator('.rv-card')).toBeVisible({ timeout: 10000 })
  await page.locator('.rv-option').first().click()
  await expect(page.locator('.rv-option').first()).toHaveClass(/pick/)
  expect(errors.join('\n')).not.toContain('picked.includes')
})
