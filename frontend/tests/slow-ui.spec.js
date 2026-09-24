import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('试卷模式慢题提示 vs 懒人模式', async ({page,request})=>{
  const u='slow_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'S'}});
  const lr=await request.post(`${API}/api/auth/login`,{data:{username:u,password:'Test123456'}});
  const {token,user}=await lr.json();
  const buf=await readFile(DOCX);
  const up=await request.post(`${API}/api/upload`,{multipart:{file:{name:'q.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:buf}},headers:{Authorization:'Bearer '+token}});
  const upj=await up.json();
  const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  // 先积累几道同题型，让均值形成
  for(const q of (upj.extractedQuestions||[]).slice(0,4)){
    const ans=(q.answer||'').replace(/[^A-Z]/g,'');
    await request.post(`${API}/api/check`,{headers:h,data:{question:q,userAnswer:q.answer,questionType:q.type||'single',answerTime:3000}});
  }
  await page.addInitScript(([t,u])=>{localStorage.setItem('token',t);localStorage.setItem('user',JSON.stringify(u));},[token,user]);
  await page.goto('/question-bank');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.locator('.qb-card').first().locator('button,.cyber-button').filter({hasText:'试卷模式'}).first().click();
  await page.waitForURL(/\/practice/);
  await page.waitForTimeout(1500);
  // 第一题停留久点再选
  const card=page.locator('.obj-card').nth(0);
  await card.locator('.opt').nth(0).click();
  await page.waitForTimeout(8000); // 停留8秒
  await card.locator('.act button,.cyber-button').filter({hasText:'提交答案'}).click();
  await page.waitForTimeout(3000);
  const body=await page.locator('body').innerText();
  const hasSlow=body.includes('慢题');
  console.log('[SLOW] 试卷模式提交后含"慢题"提示:', hasSlow);
  if(hasSlow) console.log('[SLOW] ✅ 试卷模式有慢题提示');
  else console.log('[SLOW] ❌ 试卷模式无慢题提示（后端isSlow返回但UI没渲染）');
});
