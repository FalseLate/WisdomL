import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('error-stats 直接访问看图', async ({page,request})=>{
  const u='ec_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'E'}});
  const lr=await request.post(`${API}/api/auth/login`,{data:{username:u,password:'Test123456'}});
  const {token,user}=await lr.json();
  const buf=await readFile(DOCX);
  const up=await request.post(`${API}/api/upload`,{multipart:{file:{name:'q.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:buf}},headers:{Authorization:'Bearer '+token}});
  const upj=await up.json();
  const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const sample=(upj.extractedQuestions||[]).slice(0,6);
  for(const q of sample){
    const ans=(q.answer||'').replace(/[^A-Z]/g,'');
    const wrong=Object.keys(q.options||{}).find(k=>!ans.includes(k))||'B';
    await request.post(`${API}/api/check`,{headers:h,data:{question:q,userAnswer:wrong,questionType:q.type||'single',answerTime:15000}});
  }
  await page.addInitScript(([t,u])=>{localStorage.setItem('token',t);localStorage.setItem('user',JSON.stringify(u));},[token,user]);
  await page.goto('/error-stats');
  await page.waitForTimeout(3000);
  const cn=await page.locator('canvas').count();
  console.log('[EC2] /error-stats canvas数',cn);
  const txt=await page.locator('body').innerText();
  console.log('[EC2] 含错因/慢题关键词:', /错因|慢题|未订正|复习中|已掌握/.test(txt));
});
