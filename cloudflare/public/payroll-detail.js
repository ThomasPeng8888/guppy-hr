/** Guppy HR Phase 1.1.7.8 — self-only CLOSED monthly payslip.
 * Install alongside the existing app; DO NOT replace existing app.js.
 * Integration: window.GuppyPayrollUI.mount(rootElement, { api: (action, data) => existingAuthenticatedApi(action, data) });
 * The api callback must use the existing authenticated Cloudflare Worker -> HMAC GAS channel.
 * Salary data is never stored locally, logged, or sent to a third-party endpoint.
 */
(function (global) {
  'use strict';
  const currency = new Intl.NumberFormat('zh-TW', {style:'currency',currency:'TWD',minimumFractionDigits:0,maximumFractionDigits:0});
  const minuteText = m => {
    const x = Math.max(0, Math.round(Number(m) || 0));
    return `${Math.floor(x / 60)} 小時 ${x % 60} 分鐘`;
  };
  const timeText = value => {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? new Intl.DateTimeFormat('zh-TW', {timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t)) : '';
  };
  const dateText = value => {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t)) : '';
  };
  function element(tag, className, text) {
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text !== undefined)node.textContent=String(text);
    return node;
  }
  function child(parent, tag, cls, text) {const node=element(tag,cls,text);parent.appendChild(node);return node;}
  function row(label, value, emphasize=false) {
    const r=element('div','ghp-row'+(emphasize?' ghp-row--em':'') );
    child(r,'span','ghp-muted',label); child(r,'strong','ghp-value',value);
    return r;
  }
  function money(n) {return currency.format(Number(n)||0);}
  const namedCategories={NORMAL:'正常／臨時出勤',OVERTIME:'核准加班',LEAVE:'假別工資',ADDITION:'其他加給',EXPENSE:'代墊報支',OTHER:'其他項目'};
  function sectionTitle(text) {return element('h3','ghp-section-title',text);}
  function main(root,options) {
    if(!root || typeof root.replaceChildren !== 'function')throw new Error('GUPPY_PAYROLL_MOUNT_ELEMENT_REQUIRED');
    if(!options || typeof options.api!=='function')throw new Error('GUPPY_PAYROLL_AUTHENTICATED_API_REQUIRED');
    let stopped=false, requestNo=0, months=[], selected='';
    root.classList.add('ghp-root');
    root.setAttribute('aria-label','我的薪資明細');
    const outer=element('section','ghp');root.replaceChildren(outer);
    const head=child(outer,'header','ghp-head');
    child(head,'div','ghp-kicker','GUPPY HR · PAYROLL');
    child(head,'h2','ghp-title','我的薪資明細');
    child(head,'p','ghp-head-desc','僅顯示本人已正式封存的月結薪資。');
    const filter=child(outer,'div','ghp-filter');
    const label=child(filter,'label','ghp-label','結算月份');
    const select=child(filter,'select','ghp-month');
    const id='ghp-month-'+Math.random().toString(36).slice(2);
    label.htmlFor=id;select.id=id;
    const reload=child(filter,'button','ghp-reload','重新整理');
    reload.type='button';reload.setAttribute('aria-label','重新整理薪資明細');
    const area=child(outer,'div','ghp-content');area.setAttribute('aria-live','polite');
    function message(text, kind) {
      area.replaceChildren();child(area,'div','ghp-message'+(kind?' ghp-message--'+kind:''),text);
    }
    function cardForDate(date, entries) {
      const card=element('div','ghp-day-card');
      const cap=child(card,'div','ghp-day-heading');
      child(cap,'strong','',date||'歷史封存（未記錄逐日日期）');
      const mins=entries.filter(x=>x.category==='NORMAL'||x.category==='OVERTIME').reduce((s,x)=>s+Math.max(0,Number(x.minutes)||0),0);
      child(cap,'span','ghp-mini',mins ? minuteText(mins):`${entries.length} 筆`);
      for(const item of entries){
        const line=child(card,'div','ghp-detail-row');
        const left=child(line,'div','ghp-detail-left');
        child(left,'strong','ghp-detail-name',item.title||namedCategories[item.category]||'薪資項目');
        const times=item.startAt&&item.endAt ? `${dateText(item.startAt)} ${timeText(item.startAt)} → ${dateText(item.endAt)} ${timeText(item.endAt)}`:'';
        const info=[times, Number(item.minutes)>0 ? minuteText(item.minutes):''].filter(Boolean).join(' · ');
        if(info) child(left,'div','ghp-detail-meta',info);
        child(line,'span','ghp-detail-amount',money(item.amount));
      }
      return card;
    }
    function showSlip(d){
      area.replaceChildren();
      if(!d || d.closed!==true){message('此月份尚未封存，暫不開放查看薪資金額。');return;}
      const badge=child(area,'div','ghp-status');
      child(badge,'span','ghp-status-dot','●');child(badge,'strong','',`${d.yearMonth} · 已封存`);
      const tiles=child(area,'div','ghp-tiles');
      for(const [label,value] of [['正常計薪工時',d.normalMinutes],['核准加班工時',d.overtimeMinutes],['總計薪工時',d.totalWorkMinutes]]){
        const t=child(tiles,'div','ghp-tile');child(t,'span','ghp-tile-label',label);child(t,'strong','ghp-tile-value',minuteText(value));
      }
      const total=child(area,'section','ghp-summary');
      child(total,'h3','ghp-section-title','薪資摘要');
      total.appendChild(row('正常工資、加班及假勤',money(d.salaryGross)));
      total.appendChild(row('其他加給',money(d.otherPayTotal)));
      total.appendChild(row('核准代墊款',money(d.expenseTotal)));
      total.appendChild(row('本月應發合計',money(d.gross),true));
      child(total,'p','ghp-footnote','明細金額依封存快照呈現，工資總額依正式月結的四捨五入結果為準；未包含未設置的法定代扣項目。');
      const items=Array.isArray(d.items)?d.items:[];
      const detail=child(area,'section','ghp-details');
      detail.appendChild(sectionTitle('逐日工時與薪資項目'));
      if(!items.length){child(detail,'p','ghp-muted','此月份沒有可列示的薪資明細項目。');return;}
      const grouped=new Map();
      for(const i of items){
        const date= /^20\d{2}-\d{2}-\d{2}$/.test(String(i.workDate||'')) ? i.workDate:'';
        if(!grouped.has(date))grouped.set(date,[]); grouped.get(date).push(i);
      }
      const days=[...grouped.keys()].sort((a,b)=>(a&&b?a.localeCompare(b):a?-1:b?1:0));
      for(const date of days)detail.appendChild(cardForDate(date,grouped.get(date)));
      if(grouped.has(''))child(detail,'p','ghp-footnote','舊版已封存資料若未儲存加班起迄時間，會列在「未記錄逐日日期」，金額及工時仍以原封存資料為準。');
    }
    async function loadSlip(month){
      const seq=++requestNo;selected=month;message('正在載入已封存薪資…');
      try{
        const result=await options.api('getMyPayrollSlip',{yearMonth:month});
        if(!stopped&&seq===requestNo)showSlip(result);
      }catch(error){
        if(!stopped&&seq===requestNo)message('薪資明細讀取失敗，請稍後重新整理。','error');
      }
    }
    async function loadMonths(){
      const seq=++requestNo;reload.disabled=true;select.disabled=true;message('正在確認已封存月份…');
      try{
        const result=await options.api('getMyPayrollMonths',{});
        if(stopped||seq!==requestNo)return;
        months=(result&&Array.isArray(result.months)?result.months:[]).filter(x=>/^20\d\d-(0[1-9]|1[0-2])$/.test(x));
        select.replaceChildren();
        if(!months.length){message('目前尚無可供查看的已封存薪資。');return;}
        months.forEach(month=>{const opt=element('option','',month);opt.value=month;select.appendChild(opt);});
        if(!months.includes(selected))selected=months[0];select.value=selected;
        await loadSlip(selected);
      }catch(error){if(!stopped&&seq===requestNo)message('無法取得薪資月份，請檢查網路後重試。','error');}
      finally{if(!stopped){reload.disabled=false;select.disabled=months.length===0;}}
    }
    select.addEventListener('change',()=>loadSlip(select.value));
    reload.addEventListener('click',loadMonths);
    loadMonths();
    return {refresh:loadMonths,destroy(){stopped=true;requestNo++;root.replaceChildren();root.classList.remove('ghp-root');}};
  }
  global.GuppyPayrollUI=Object.freeze({mount:main});
})(window);
