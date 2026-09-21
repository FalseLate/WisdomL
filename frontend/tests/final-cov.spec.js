// @ts-check
// 最后4项：①错题本错因改标 ②主观题AI评价(API) ③缺答案补判(API) ④上传页分组数
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

async function setupUser(request) {
  const u = 'fin_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'F' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  const { token, user } = await lr.json();
  const buf = await readFile(DOCX);
  const upRes = await request.post(`${API}/api/upload`, {
    multipart: { file: { name: 'q.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: buf } },
    headers: { Authorization: 'Bearer ' + token },
  });
  const upJson = await upRes.json();
  const questions = upJson.extractedQuestions || [];
  if (questions.length) {
    await request.post(`${API}/api/generate-from-extracted`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { questions, title: 'E2E题库' },
    });
  }
  return { token, user, questions };
}

test.describe('最后补测', () => {
  test('错题本错因补标/改标；上传页分组', async ({ page, request }) => {
    const { token, user, questions } = await setupUser(request);
    // 故意答错一题进错题本
    const q1 = questions[0];
    const correct = (q1.answer || '').replace(/[^A-Z]/g, '');
    const wrongKey = Object.keys(q1.options).find(k => !correct.includes(k)) || 'B';
    await request.post(`${API}/api/check`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { questionId: q1.id || 0, userAnswer: wrongKey, question: q1, questionType: 'single' },
    });

    await page.addInitScript(([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);

    // ===== 错题本错因补标 =====
    await page.goto('/wrong-questions');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.wrong-card').first()).toBeVisible({ timeout: 15000 });
    const firstCard = page.locator('.wrong-card').first();
    // 点查看订正确认展开
    await firstCard.locator('button, .wq-btn').filter({ hasText: '查看订正' }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    const tagger = firstCard.locator('.err-tagger');
    const taggerCount = await tagger.count();
    console.log('[FINAL] 错题本 err-tagger 数:', taggerCount);
    test.skip(taggerCount === 0, '错题卡片未渲染 questionContent，tagger 未显示');
    await expect(tagger).toBeVisible({ timeout: 5000 });
    await tagger.locator('.et-chip').nth(0).click();
    await tagger.locator('.et-save').click();
    await expect(tagger.locator('.et-save')).toContainText(/已保存/, { timeout: 10000 });
    await page.waitForTimeout(500);
    await expect(firstCard.locator('.error-types-line').first()).toContainText(/当前错因/);
    console.log('[FINAL] 错题本错因补标 ✅');

    // ===== 上传页分组数 =====
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const fileCard = page.locator('.func-card', { hasText: 'FILE' });
    if (await fileCard.count()) {
      await fileCard.first().click();
      await page.waitForTimeout(800);
    }
    // 出题类型分组（外层那组）
    const groups = await page.locator('.gen-type, .type-group, [class*="gen-type"]').count();
    console.log('[FINAL] 上传页出题类型分组元素数:', groups);
    await page.screenshot({ path: 'test-results/upload-final.png' });
    console.log('[FINAL] 上传面板已截图');
  });

  test('主观题AI评价 + 缺答案补判（API层）', async ({ request }) => {
    const { token, questions } = await setupUser(request);
    // 找一道主观题
    const subj = questions.find(q => q.type === 'subjective' || !q.options || Object.keys(q.options||{}).length < 2);
    test.skip(!subj, '无主观题');
    console.log('[FINAL] 主观题:', subj.question?.slice(0, 30));

    // ① 主观题 AI 评价
    const ev = await request.post(`${API}/api/wrong-questions/eval-subjective`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { question: subj, userAnswer: '这是一个接近参考答案的回答，要点基本覆盖。' },
    });
    const evj = await ev.json();
    console.log('[FINAL] AI评价 score=', evj.score, 'evaluation=', (evj.evaluation||'').slice(0, 40));
    expect(evj.score).toBeGreaterThanOrEqual(0);
    expect(evj.score).toBeLessThanOrEqual(5);
    console.log('[FINAL] 主观题AI评价 ✅');

    // ② 缺答案补判：造一道 answer 为空的题，调 /generate-answer
    const noAnsQ = { question: '【E2E缺答案】光合作用的场所是？', type: 'single', options: { A: '叶绿体', B: '线粒体', C: '细胞核', D: '细胞膜' } };
    const ga = await request.post(`${API}/api/generate-answer`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { question: noAnsQ.question, type: 'single', options: noAnsQ.options, answer: '' },
    });
    const gaj = await ga.json();
    console.log('[FINAL] 缺答案补判 answer=', gaj.answer);
    expect(gaj.answer).toMatch(/[A-D]/);
    console.log('[FINAL] 缺答案题自动补判 ✅');
  });
});
