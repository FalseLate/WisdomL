import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('SPA路由进入 vs F5刷新 尺寸对比', async ({page,request})=>{
  const u='cmp2_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'C'}});
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
  // 方式1：SPA路由进入（从首页点个人中心→错因统计）
  await page.goto('/');
  await page.waitForTimeout(1500);
  await page.locator('.nav-item, .tab, a, button').filter({hasText:/我的|个人/}).first().click();
  await page.waitForTimeout(800);
  await page.locator('.menu-item').filter({hasText:'错因统计'}).click();
  await page.waitForTimeout(2000);
  const spa = await page.locator('canvas').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)}));
  console.log('[CMP2] SPA路由进入:', JSON.stringify(spa));
  // 方式2：F5刷新
  await page.reload();
  await page.waitForTimeout(2000);
  const f5 = await page.locator('canvas').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)}));
  console.log('[CMP2] F5刷新后:', JSON.stringify(f5));
  if(JSON.stringify(spa)!==JSON.stringify(f5)) console.log('[CMP2] ❌ 两次尺寸不一样！');
  else console.log('[CMP2] 两次一样');
});
