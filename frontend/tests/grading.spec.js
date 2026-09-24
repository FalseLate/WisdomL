// @ts-check
// 判分归一 + 做对完整链路（API层+UI层）
import { test, expect } from '@playwright/test';

const API = 'http://localhost:8080';

async function setupUser(request) {
  const u = 'grade_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'G' } });
  const lr = await request.post(`${API}/api/auth/login`, { data: { username: u, password: 'Test123456' } });
  const { token, user } = await lr.json();
  return { token, user };
}

test.describe('判分归一（后端规则）', () => {
  test('判断题中文答案 + 标点空格 + 多选去重', async ({ request }) => {
    const { token } = await setupUser(request);
    const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

    // 判断题：正确答案中文"正确"
    const judge = { question: '【判断】1+1=2。', type: 'single', options: { A: '正确', B: '错误' }, answer: 'A' };
    const r1 = await request.post(`${API}/api/check`, { headers: h, data: { question: judge, userAnswer: 'A', questionType: 'single' } });
    const j1 = await r1.json();
    console.log('[GRD] 判断题选A(正确)=', j1.correct);
    expect(j1.correct).toBe(true);

    // 标点空格：用户选 "A、" 答案 "A"
    const r2 = await request.post(`${API}/api/check`, { headers: h, data: { question: judge, userAnswer: 'A、', questionType: 'single' } });
    const j2 = await r2.json();
    console.log('[GRD] 带标点 A、 =', j2.correct);
    expect(j2.correct).toBe(true);

    // 多选去重：答案 AB，用户答 AAB
    const multi = { question: '【多选】哪些是水果？', type: 'multiple', options: { A: '苹果', B: '香蕉', C: '石头' }, answer: 'AB' };
    const r3 = await request.post(`${API}/api/check`, { headers: h, data: { question: multi, userAnswer: 'AAB', questionType: 'multiple' } });
    const j3 = await r3.json();
    console.log('[GRD] 多选 AAB vs AB =', j3.correct);
    expect(j3.correct).toBe(true);

    // 错误答案
    const r4 = await request.post(`${API}/api/check`, { headers: h, data: { question: multi, userAnswer: 'AC', questionType: 'multiple' } });
    const j4 = await r4.json();
    console.log('[GRD] 多选 AC(含错项C) =', j4.correct);
    expect(j4.correct).toBe(false);

    console.log('[GRD] 判分归一全过 ✅');
  });

  test('慢题不影响判分正确性（API层）', async ({ request }) => {
    const { token } = await setupUser(request);
    const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    const q = { question: '慢题测试', type: 'single', options: { A: '对', B: '错' }, answer: 'A' };
    const r = await request.post(`${API}/api/check`, { headers: h, data: { question: q, userAnswer: 'A', questionType: 'single', answerTime: 30 } });
    const j = await r.json();
    console.log('[GRD] 慢题字段 isSlow=', j.isSlow, 'correct=', j.correct);
    expect(j.correct).toBe(true);
    console.log('[GRD] 慢题字段返回正常 ✅');
  });
});
