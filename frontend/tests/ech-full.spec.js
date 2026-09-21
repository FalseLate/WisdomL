import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const API='http://localhost:8080';
const DOCX='D:/C-project/WisdomL/证件抽考题库(2).docx';
test.describe('echarts全量', ()=>{
  test('echarts数据+尺寸+resize+空态', async ({page,request})=>{
    const u='ech_'+Date.now();
    await request.post(`${API}/api/auth/register`,{data:{username:u,password:'Test123456',nickname:'E'}});
    const lr=await request.post(`${API}/api/auth/login`,{data:{username:u,password:'Test123456'}});
    const {token,user}=await lr.json();
    const buf=await readFile(DOCX);
    const up=await request.post(`${API}/api/upload`,{multipart:{file:{name:'q.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:buf}},headers:{Authorization:'Bearer '+token}});
    const upj=await up.json();
    const h={Authorization:'Bearer '+token,'Content-Type':'application/json'};
    // 做6道错题，标注3个不同错因
    for(let i=0;i<6;i++){
      const q=upj.extractedQuestions[i];
      const ans=(q.answer||'').replace(/[^A-Z]/g,'');
      const wrong=Object.keys(q.options||{}).find(k=>!ans.includes(k))||'B';
      const r=await request.post(`${API}/api/check`,{headers:h,data:{question:q,userAnswer:wrong,questionType:q.type||'single',answerTime:12000}});
      const j=await r.json();
      // 标错因
      const qid=j.questionId||j.wrongQuestionId||j.id;
      if(qid){
        await request.post(`${API}/api/wrong-questions/error-type`,{headers:h,data:{questionId:qid,errorType:['audit','knowledge','math'][i%3]}});
      }
    }
    // 后端stats
    const st=await request.get(`${API}/api/wrong-questions/stats`,{headers:h});
    const stj=await st.json();
    console.log('[EC] 后端 totalWrong=',stj.totalWrong,'slowCount=',stj.slow?.slowCount,'errorTypeDist=',JSON.stringify(stj.errorTypeDist));

    await page.addInitScript(([t,u])=>{localStorage.setItem('token',t);localStorage.setItem('user',JSON.stringify(u));},[token,user]);
    await page.goto('/error-stats');
    await page.waitForTimeout(2000);

    // 1. KPI 数字
    const kpi = await page.locator('.kpi-num').allInnerTexts();
    console.log('[EC] KPI卡片:', JSON.stringify(kpi));

    // 2. 三图尺寸
    const sizes = await page.locator('canvas').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)}));
    console.log('[EC] 三图尺寸:', JSON.stringify(sizes));
    const narrow = sizes.filter(s=>s.startsWith('100x'));
    if(narrow.length) console.log('[EC] ❌ 有图宽度只有100px(没撑开)');
    else console.log('[EC] ✅ 图表宽度正常');

    // 3. 空态提示
    const empty = await page.locator('.chart-empty').count();
    console.log('[EC] 空态提示数:', empty);

    // 4. resize 窗口后图表是否自适应
    await page.setViewportSize({width:800,height:900});
    await page.waitForTimeout(1000);
    const sizesAfter = await page.locator('canvas').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)}));
    console.log('[EC] resize后:', JSON.stringify(sizesAfter));
    const changed = JSON.stringify(sizes) !== JSON.stringify(sizesAfter);
    console.log(changed ? '[EC] ✅ resize后尺寸更新' : '[EC] ❌ resize后尺寸没变(没监听)');
  });
});
