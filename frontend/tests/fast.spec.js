import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('先URL截图后UI截图', async ({page,request})=>{
  const u='fast_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'F'}});
  const lr=await request.post(`${API}/api/auth/login`,{data:{username:u,password:'Test123456'}});
  const {token,user}=await lr.json();
  const buf=await readFile(DOCX);
  const up=await request.post(`${API}/api/upload`,{multipart:{file:{name:'q.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:buf}},headers:{Authorization:'Bearer '+token}});
  const upj=await up.json();
  const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  for(const q of (upj.extractedQuestions||[]).slice(0,5)){
    const ans=(q.answer||'').replace(/[^A-Z]/g,'');
    const wrong=Object.keys(q.options||{}).find(k=>!ans.includes(k))||'B';
    await request.post(`${API}/api/check`,{headers:h,data:{question:q,userAnswer:wrong,questionType:q.type||'single',answerTime:12000}});
  }
  await page.addInitScript(([t,u])=>{localStorage.setItem('token',t);localStorage.setItem('user',JSON.stringify(u));},[token,user]);
  // 1. 直接进 error-stats 立刻截图
  await page.goto('/error-stats');
  await page.waitForLoadState('networkidle');
  await page.screenshot({path:'fast-url.png',fullPage:true});
  console.log('[FAST] URL截图', page.url(), 'canvas', await page.locator('canvas').count());
  // 2. UI路径
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.locator('.nav-item, .tab, a, button').filter({hasText:/我的|个人/}).first().click();
  await page.waitForTimeout(800);
  await page.locator('.menu-item').filter({hasText:'错因统计'}).click();
  await page.waitForLoadState('networkidle');
  await page.screenshot({path:'fast-ui.png',fullPage:true});
  console.log('[FAST] UI截图', page.url(), 'canvas', await page.locator('canvas').count());
});
