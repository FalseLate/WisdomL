import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('对比 UI进入 vs 直接URL进入 error-stats', async ({page,request})=>{
  const u='cmp_'+Date.now();
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
  // 路径1：UI点击
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.locator('.nav-item, .tab, a, button').filter({hasText:/我的|个人/}).first().click();
  await page.waitForTimeout(1000);
  await page.locator('.menu-item').filter({hasText:'错因统计'}).click();
  await page.waitForTimeout(2500);
  console.log('[CMP] UI进入 URL:', page.url());
  console.log('[CMP] UI进入 canvas数:', await page.locator('canvas').count());
  await page.screenshot({path:'cmp-ui.png',fullPage:true});
  // 路径2：直接goto
  await page.goto('/error-stats');
  await page.waitForTimeout(2500);
  console.log('[CMP] URL直接进入:', page.url());
  console.log('[CMP] URL进入 canvas数:', await page.locator('canvas').count());
  await page.screenshot({path:'cmp-url.png',fullPage:true});
  // body文本对比
  const t1 = await page.locator('body').innerText();
  console.log('[CMP] body前100字:', t1.slice(0,100).replace(/\n/g,' '));
});
