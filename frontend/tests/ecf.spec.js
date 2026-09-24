import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('个人中心→错因统计正确跳转', async ({page,request})=>{
  const u='ecf_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'E'}});
  const lr=await request.post(`${API}/api/auth/login`,{data:{username:u,password:'Test123456'}});
  const {token,user}=await lr.json();
  const buf=await readFile(DOCX);
  const up=await request.post(`${API}/api/upload`,{multipart:{file:{name:'q.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:buf}},headers:{Authorization:'Bearer '+token}});
  const upj=await up.json();
  const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  for(const q of (upj.extractedQuestions||[]).slice(0,6)){
    const ans=(q.answer||'').replace(/[^A-Z]/g,'');
    const wrong=Object.keys(q.options||{}).find(k=>!ans.includes(k))||'B';
    await request.post(`${API}/api/check`,{headers:h,data:{question:q,userAnswer:wrong,questionType:q.type||'single',answerTime:15000}});
  }
  await page.addInitScript(([t,u])=>{localStorage.setItem('token',t);localStorage.setItem('user',JSON.stringify(u));},[token,user]);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.locator('a, button, .nav-item, .tab').filter({hasText:/我的|个人/}).first().click();
  await page.waitForTimeout(1000);
  console.log('[CF] 个人中心', page.url());
  // 精确点"错因统计"
  await page.locator('.menu-item').filter({hasText:'错因统计'}).click();
  await page.waitForTimeout(2000);
  console.log('[CF] 点错因统计后', page.url());
  const cn=await page.locator('canvas').count();
  console.log('[CF] canvas数', cn);
  expect(cn).toBeGreaterThanOrEqual(3);
});
