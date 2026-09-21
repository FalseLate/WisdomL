import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('直接URL进入后是否被切走', async ({page,request})=>{
  const u='cut_'+Date.now();
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
  await page.goto('/error-stats');
  console.log('[CUT] goto后立即URL:', page.url());
  await page.waitForTimeout(500);
  console.log('[CUT] 0.5秒后URL:', page.url());
  await page.screenshot({path:'cut-now.png',fullPage:true});
  await page.waitForTimeout(5000);
  console.log('[CUT] 5秒后URL:', page.url());
  console.log('[CUT] 5秒后canvas:', await page.locator('canvas').count());
  await page.screenshot({path:'cut-after5s.png',fullPage:true});
});
