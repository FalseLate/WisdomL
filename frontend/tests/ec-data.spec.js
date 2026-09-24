import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('错因标注正确接口', async ({page,request})=>{
  const u='err_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'E'}});
  const lr=await request.post(`${API}/api/auth/login`,{data:{username:u,password:'Test123456'}});
  const {token,user}=await lr.json();
  const buf=await readFile(DOCX);
  const up=await request.post(`${API}/api/upload`,{multipart:{file:{name:'q.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:buf}},headers:{Authorization:'Bearer '+token}});
  const upj=await up.json();
  const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const qids=[];
  for(let i=0;i<6;i++){
    const q=upj.extractedQuestions[i];
    const ans=(q.answer||'').replace(/[^A-Z]/g,'');
    const wrong=Object.keys(q.options||{}).find(k=>!ans.includes(k))||'B';
    const r=await request.post(`${API}/api/check`,{headers:h,data:{question:q,userAnswer:wrong,questionType:q.type||'single',answerTime:12000}});
    const j=await r.json();
    qids.push(j.questionId);
    // 用正确字段 errorTypes
    await request.post(`${API}/api/wrong-questions/error-type`,{headers:h,data:{questionId:j.questionId,errorTypes:['audit','knowledge','math'][i%3],errorNote:'测'}});
  }
  const st=await request.get(`${API}/api/wrong-questions/stats`,{headers:h});
  const stj=await st.json();
  console.log('[EC] 标注后 errorTypeDist=', JSON.stringify(stj.errorTypeDist));
  // UI
  await page.addInitScript(([t,u])=>{localStorage.setItem('token',t);localStorage.setItem('user',JSON.stringify(u));},[token,user]);
  await page.goto('/error-stats');
  await page.waitForTimeout(2000);
  const kpi = await page.locator('.kpi-num').allInnerTexts();
  console.log('[EC] KPI:', JSON.stringify(kpi));
  await page.screenshot({path:'ec-data.png',fullPage:true});
});
