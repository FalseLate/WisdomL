import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('刷新后饼图尺寸压扁验证', async ({page,request})=>{
  const u='sz_'+Date.now();
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
  const pieBefore = await page.locator('canvas').first().evaluate(el=>{const r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}});
  console.log('[SZ] 进入时饼图canvas:', JSON.stringify(pieBefore));
  await page.screenshot({path:'sz-before.png',fullPage:true});
  await page.reload();
  await page.waitForTimeout(2000);
  const pieAfter = await page.locator('canvas').first().evaluate(el=>{const r=el.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height)}});
  console.log('[SZ] 刷新后饼图canvas:', JSON.stringify(pieAfter));
  await page.screenshot({path:'sz-after.png',fullPage:true});
  if(pieAfter.h < pieBefore.h * 0.6) console.log('[SZ] ❌ 刷新后饼图压扁了！');
  else console.log('[SZ] 尺寸正常');
});
