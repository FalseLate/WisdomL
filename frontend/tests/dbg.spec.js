import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test('看错因接口返回', async ({request})=>{
  const u='dbg_'+Date.now();
  await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'D'}});
  const lr=await request.post(`${API}/api/auth/login`,{data:{username:u,password:'Test123456'}});
  const {token}=await lr.json();
  const buf=await readFile(DOCX);
  const up=await request.post(`${API}/api/upload`,{multipart:{file:{name:'q.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:buf}},headers:{Authorization:'Bearer '+token}});
  const upj=await up.json();
  const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const q=upj.extractedQuestions[0];
  const ans=(q.answer||'').replace(/[^A-Z]/g,'');
  const wrong=Object.keys(q.options||{}).find(k=>!ans.includes(k))||'B';
  const r=await request.post(`${API}/api/check`,{headers:h,data:{question:q,userAnswer:wrong,questionType:q.type||'single',answerTime:12000}});
  const j=await r.json();
  console.log('[DBG] check返回keys:', Object.keys(j));
  console.log('[DBG] check questionId=', j.questionId);
  // 列错题
  const wl=await request.get(`${API}/api/wrong-questions`,{headers:h});
  const wj=await wl.json();
  const list=Array.isArray(wj)?wj:wj.list||wj.records||[];
  console.log('[DBG] 错题数:', list.length, '首条questionId=', list[0]?.questionId, 'id=', list[0]?.id);
  // 用错题列表的 questionId 标
  if(list[0]){
    const er=await request.post(`${API}/api/wrong-questions/error-type`,{headers:h,data:{questionId:list[0].questionId,errorTypes:'audit'}});
    console.log('[DBG] 标注返回:', JSON.stringify(await er.json()));
  }
  const st=await request.get(`${API}/api/wrong-questions/stats`,{headers:h});
  console.log('[DBG] stats:', JSON.stringify((await st.json()).errorTypeDist));
});
