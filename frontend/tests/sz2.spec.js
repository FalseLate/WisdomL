import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('量所有canvas', async ({page,request})=>{
  const u='sz2_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'S'}});
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
  await page.waitForTimeout(2000);
  const before = await page.locator('canvas').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)}));
  console.log('[SZ2] 进入时所有canvas:', JSON.stringify(before));
  await page.screenshot({path:'sz2-before.png',fullPage:true});
  await page.reload();
  await page.waitForTimeout(2000);
  const after = await page.locator('canvas').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)}));
  console.log('[SZ2] 刷新后所有canvas:', JSON.stringify(after));
  await page.screenshot({path:'sz2-after.png',fullPage:true});
});
