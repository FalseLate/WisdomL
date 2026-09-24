// @ts-check
// 错题状态机（API层）：第1次对→锁1天；当天再对→notTime不计数；答错→清零当天可再做；连对4次→status=3移出今日复习
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const API = 'http://localhost:8080';
const DOCX = 'D:/C-project/WisdomL/证件抽考题库(2).docx';

// 只改当前测试用户某条错题的 next_review_time 到过去（不动表结构）
function expireNextReview(wrongId, userId) {
  const sql = `UPDATE user_wrong_question SET next_review_time = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id=${wrongId} AND user_id=${userId}`;
  execSync(`mysql -uroot -p123456 zhifuxi -e "${sql}"`, { stdio: 'ignore' });
}

async function setupUser(request) {
  const u = 'srs_' + Date.now() + '_' + Math.floor(Math.random() * 1e5);
  await request.post(`${API}/api/auth/register`, { data: { username: u, password: 'Test123456', nickname: 'S' } });
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

// 故意答错一道题进入错题本，返回错题 id
async function makeWrong(request, token, question) {
  const keys = Object.keys(question.options || {});
  const correct = (question.answer || '').replace(/[^A-Z]/g, '');
  const wrongKey = keys.find(k => !correct.includes(k)) || keys.find(k => k !== correct[0]) || keys[0];
  await request.post(`${API}/api/check`, {
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    data: { questionId: question.id || question._id || 0, userAnswer: wrongKey, question, questionType: 'single' },
  });
}

test.describe('错题状态机', () => {
  test('闸门/答错清零/连对4次掌握/今日复习队列', async ({ request }) => {
    const { token, user, questions } = await setupUser(request);
    const userId = user.id;
    expect(questions.length).toBeGreaterThan(10);

    // 选3道单选（答案单字母）
    const singles = questions.filter(q => (q.answer || '').replace(/[^A-Z]/g, '').length === 1);
    expect(singles.length).toBeGreaterThan(5);
    const [qA, qB, qC] = singles;

    // 3道都答错 → 进错题本
    await makeWrong(request, token, qA);
    await makeWrong(request, token, qB);
    await makeWrong(request, token, qC);
    const wl = await request.get(`${API}/api/wrong-questions`, { headers: { Authorization: 'Bearer ' + token } });
    const wrongList = await wl.json();
    expect(wrongList.length).toBe(3);
    // 按题面匹配找回三条 id
    const findId = (q) => wrongList.find(w => {
      try { return JSON.parse(w.questionContent).question === q.question; } catch (e) { return false; }
    }).id;
    const idA = findId(qA), idB = findId(qB), idC = findId(qC);
    console.log('[SRS] 错题本3条 id=', idA, idB, idC);

    const ansA = qA.answer.replace(/[^A-Z]/g, '');
    const ansB = qB.answer.replace(/[^A-Z]/g, '');
    const ansC = qC.answer.replace(/[^A-Z]/g, '');

    // ===== A：第1次对 → streak=1, status=2, next=未来1天 =====
    let r = await request.post(`${API}/api/wrong-questions/${idA}/redo`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { userAnswer: ansA, answerTime: 3 },
    });
    let j = await r.json();
    console.log('[SRS] A 第1次对:', JSON.stringify({ correct: j.correct, status: j.status, streak: j.correctStreak, next: j.nextReviewTime, notTime: j.notTime }));
    expect(j.correct).toBe(true);
    expect(j.correctStreak).toBe(1);
    expect(j.status).toBe(2);
    expect(j.nextReviewTime).not.toBeNull();

    // ===== A：当天立即再对 → notTime=true，streak 仍1 =====
    r = await request.post(`${API}/api/wrong-questions/${idA}/redo`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { userAnswer: ansA, answerTime: 2 },
    });
    j = await r.json();
    console.log('[SRS] A 当天立即再对:', JSON.stringify({ notTime: j.notTime, streak: j.correctStreak, status: j.status }));
    expect(j.notTime).toBe(true);
    expect(j.correctStreak).toBe(1); // 不推进
    console.log('[SRS] notTime 闸门 ✅');

    // ===== B：先对一次 streak=1，再答错 → 清零 status=0, next=now =====
    await request.post(`${API}/api/wrong-questions/${idB}/redo`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { userAnswer: ansB, answerTime: 3 },
    });
    const wrongKeyB = Object.keys(qB.options).find(k => k !== ansB);
    r = await request.post(`${API}/api/wrong-questions/${idB}/redo`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      data: { userAnswer: wrongKeyB, answerTime: 3 },
    });
    j = await r.json();
    console.log('[SRS] B 答错:', JSON.stringify({ correct: j.correct, streak: j.correctStreak, status: j.status, next: j.nextReviewTime }));
    expect(j.correct).toBe(false);
    expect(j.correctStreak).toBe(0);
    expect(j.status).toBe(0);
    console.log('[SRS] 答错清零 ✅');

    // ===== C：连对4次 → status=3, next=null（中间用 mysql 把 next 改到过去放开闸门）=====
    for (let streak = 1; streak <= 4; streak++) {
      if (streak > 1) expireNextReview(idC, userId); // 到期闸门放开
      r = await request.post(`${API}/api/wrong-questions/${idC}/redo`, {
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        data: { userAnswer: ansC, answerTime: 3 },
      });
      j = await r.json();
      console.log(`[SRS] C 第${streak}次对:`, JSON.stringify({ correct: j.correct, streak: j.correctStreak, status: j.status, next: j.nextReviewTime, notTime: j.notTime }));
    }
    expect(j.correctStreak).toBe(4);
    expect(j.status).toBe(3);
    expect(j.nextReviewTime).toBeNull();
    console.log('[SRS] 连对4次 → status=3 掌握 ✅');

    // B 答错后 next=now（秒级精度），为避开毫秒边界，把它改到过去确保到期
    expireNextReview(idB, userId);
    // ===== 今日复习队列：C(status=3) 应移出；A(status=2,next未来) 也不在；B(status=0,已到期) 在 =====
    const rt = await request.get(`${API}/api/wrong-questions/review-today`, { headers: { Authorization: 'Bearer ' + token } });
    const rtj = await rt.json();
    const ids = rtj.list.map(x => x.id);
    console.log('[SRS] review-today ids=', ids, 'count=', rtj.count);
    expect(ids).not.toContain(idC); // 掌握移出
    expect(ids).not.toContain(idA); // next 未来，未到期
    expect(ids).toContain(idB); // 答错后 next=now，到期
    console.log('[SRS] 今日复习队列只列到期题 ✅');

    console.log('[SRS] 状态机全流转完成');
  });
});
