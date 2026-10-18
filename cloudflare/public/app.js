/* Guppy HR Phase 1.1.3 · Admin Roster Calendar | LINE LIFF mobile-first interface */
(() => {
  'use strict';
  const root=document.querySelector('#app'),nav=document.querySelector('#nav'),role=document.querySelector('#role');
  let token='',state=null,page='home',busy=false,toastTimer,payroll=null,payrollMonth=nowMonth();
  let scheduleMonth=nowMonth(),scheduleView='calendar',scheduleDay='',scheduleError='';
  let rosterMonth=nowMonth(),rosterDay='',rosterView='calendar',rosterEmployee='ALL',rosterError='',rosterEditing='';
  const rosterCache=new Map(),rosterRequests=new Map(),rosterGenerations=new Map(),ROSTER_TTL_MS=90000;
  const monthCache=new Map(),monthRequests=new Map(),monthGenerations=new Map(),MONTH_TTL_MS=120000;
  function nowMonth(){const f=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).formatToParts(new Date());const p=Object.fromEntries(f.map(x=>[x.type,x.value]));return `${p.year}-${p.month}`;}
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tDate=v=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const tTime=v=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
  const dateKey=v=>{const f=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(v));const p=Object.fromEntries(f.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
  const nowKey=()=>dateKey(new Date());
  scheduleDay=nowKey();rosterDay=nowKey();
  const localISO=v=>v?new Date(v+':00+08:00').toISOString():'';
  const text=(v)=>safe(v||'—');
  const showToast=(s)=>{let n=document.querySelector('#toast');n.textContent=s;n.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove('show'),4800);};
  const errMap={INVALID_CLOCK_SEQUENCE:'目前打卡順序不正確，請先結束休息或完成上班。',EVENT_SEQUENCE_CONFLICT:'打卡紀錄順序異常，請由管理員覆核。',CORRECTION_SEQUENCE_CONFLICT:'補卡可能讓出勤順序出錯，請檢查時間。',PAYROLL_UNRESOLVED_EXCEPTIONS:'有未解決的出勤、薪資或法規異常，暫時不能封存。',PAYROLL_PREVIEW_CHANGED:'薪資資料已變動，請重新試算。',PAYROLL_SNAPSHOT_TOO_LARGE:'本月薪資明細超過 Google Sheets 單格容量，請聯絡管理者處理後再封存。',CLOSED_PAYROLL_COMPENSATION_HISTORY:'生效月份已封存，不可追溯變更薪資。',PAYROLL_PERIOD_CLOSED:'此月份已完成薪資封存，不可直接修改原始紀錄。',BELOW_MINIMUM_HOURLY_WAGE:'設定時薪低於生效日期的法定最低工資。',COMPENSATION_DATE_MUST_INCREASE:'新薪資生效日必須晚於上一筆設定。',SELF_APPROVAL_NOT_ALLOWED:'不可簽核自己的申請。',INVALID_SCHEDULE_MONTH:'年月格式不正確，請重新選擇。',NOT_REGISTERED:'您的 LINE 帳號尚未建立員工資料。',NO_PERMISSION:'您沒有執行此操作的權限。',WORKSITE_NOT_CALIBRATED:'管理者尚未完成工作室 GPS 校準。',LOW_GPS_ACCURACY:'目前 GPS 誤差過大，請走到開闊處重新定位。',OUTSIDE_WORKSITE:'定位顯示您不在工作室允許打卡的範圍內。',STALE_GPS:'定位資料已逾時，請重新定位。',ALREADY_CLOCKED_IN:'您目前已經上班打卡，請使用下班打卡。',NOT_CLOCKED_IN:'目前沒有尚未結束的上班打卡。',SERVER_BUSY:'目前伺服器忙碌，請稍後再試。',EXPIRED_REQUEST:'連線逾時，請重試。',BAD_SIGNATURE:'後端驗證設定有誤，請聯絡管理者。',LINE_TOKEN_INVALID:'LINE 登入已失效，請重新開啟系統。',INVALID_CALIBRATION:'GPS 誤差過高，無法完成校準。',SHIFT_OVERLAP:'員工已有時間重疊的班表。',CORRECTION_SEQUENCE_CONFLICT:'此補卡會造成上下班事件順序衝突，請檢查補卡時間及既有紀錄。',EMPLOYEE_EXISTS:'此 LINE 帳號已經有員工資料。',BAD_CORRECTION:'請完整填寫補卡類別、時間與至少 5 個字的原因。',BAD_CORRECTION_DATE:'補卡日期超出可申請範圍（過去 30 天）。',ROSTER_CHANGED_REFRESH:'班表已被其他管理者修改，請重新整理後操作。',PUBLISHED_SHIFT_LOCKED:'已發布班表開始後或已存在請假／加班關聯，無法直接編輯。',SHIFT_NOT_EDITABLE:'此班別已取消，不能編輯。',ROSTER_COPY_SAME_WEEK:'來源週與目標週不能相同。',ROSTER_COPY_EMPTY:'來源週沒有可複製的班表。',ROSTER_COPY_CONFLICT:'目標週有重疊班表；本次複製完全未寫入，請先確認。',ROSTER_COPY_TO_PAST:'不能複製班表到已過去的日期。',INVALID_ROSTER_WEEK:'週起始日期不正確。',ROSTER_WEEK_MUST_START_MONDAY:'請選擇星期一作為週起始日期。',ROSTER_COPY_TOO_MANY:'一次最多複製 150 個班別。',ROSTER_PUBLISH_PAST:'此月份包含過去的草稿，請先處理，不能整批發布。',ROSTER_INACTIVE_EMPLOYEE:'草稿包含已停用員工，請先確認，不能直接發布。'};
  async function api(action,data={}){
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),30000);
    try{const r=await fetch('/api/exec',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action,data}),signal:ctrl.signal});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'NETWORK_ERROR');return j.result;}
    finally{clearTimeout(timer);}
  }
  async function mutate(action,data,ok){if(busy)return;busy=true;try{const result=await api(action,data);showToast(ok||'操作成功');state=await api('bootstrap');monthCache.clear();rosterCache.clear();payroll=null;render();if(page==='schedule')loadScheduleMonth(scheduleMonth,true);if(page==='roster')loadRosterMonth(rosterMonth,true);return result;}catch(e){showToast(errMap[e.message]||`操作失敗：${e.message}`);}finally{busy=false;}}
  async function reload(){state=await api('bootstrap');render();}
  const isAdmin=()=>state&&state.registered&&state.me.role==='ADMIN';
  const myEvents=()=>((state&&state.events)||[]).filter(e=>e.employeeId===state.me.employeeId).sort((a,b)=>new Date(a.effectiveAt)-new Date(b.effectiveAt));
  const currentShiftState=()=>{const es=myEvents();const k=es.length?es[es.length-1].kind:'OUT';return k==='IN'||k==='BREAK_END'?'WORK':k==='BREAK_START'?'BREAK':'OFF';};
  const eventLabels={IN:'上班打卡',BREAK_START:'休息開始',BREAK_END:'休息結束',OUT:'下班打卡'};
  const todayShift=()=>{const shifts=(state.shifts||[]).filter(s=>s.employeeId===state.me.employeeId && s.status==='PUBLISHED');const today=nowKey();return shifts.find(s=>dateKey(s.startAt)===today)||null;};
  const asItem=(a,b,right='')=>`<div class="list-item"><div><div class="title">${a}</div><small>${b}</small></div>${right}</div>`;
  function render(){
    if(!state){return;}
    if(!state.registered){nav.classList.add('hidden');role.textContent='待開通';root.innerHTML=`<div class="heading"><div><span class="overline">FIRST TIME LOGIN</span><h1>等待管理者開通</h1><p>LINE 已登入，尚未建立員工帳號。</p></div></div><section class="card stack"><h3>請將您的 LINE User ID 傳給管理者</h3><p>管理者需在 Google Sheets 的 Employees 分頁建立您的資料，或由已開通的管理者在 Guppy HR 加入。</p><code class="mono">${safe(state.uid)}</code><button class="btn primary" id="copy-uid">複製我的 LINE UID</button><button class="btn outline" id="refresh">重新檢查是否已開通</button></section>`;
      document.querySelector('#copy-uid').onclick=()=>navigator.clipboard.writeText(state.uid).then(()=>showToast('已複製 LINE UID'));
      document.querySelector('#refresh').onclick=()=>reload().catch(e=>showToast(e.message));return;
    }
    role.textContent=isAdmin()?'管理者':'員工';role.classList.remove('muted');nav.classList.remove('hidden');
    if(['admin','roster','approvals','payroll'].includes(page)&&!isAdmin())page='home';
    const tabs=[['home','⌂','首頁'],['schedule','▦','班表'],['attendance','◷','出勤'],...(isAdmin()?[['approvals','☑','簽核'],['payroll','＄','薪資'],['admin','⚙','管理']]:[])];
    nav.innerHTML=tabs.map(([key,ico,label])=>`<button class="nav-item ${page===key?'active':''}" data-page="${key}"><span class="nav-icon">${ico}</span><span>${label}</span></button>`).join('');
    nav.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>openPage(x.dataset.page));
    root.innerHTML=page==='home'?home():page==='schedule'?schedule():page==='attendance'?attendance():page==='approvals'?approvals():page==='payroll'?payrollView():page==='roster'?adminRoster():admin();
    bind();
  }
  function header(title,sub){return `<div class="heading"><div><span class="overline">GUPPY HR · ${page.toUpperCase()}</span><h1>${title}</h1><p>${sub}</p></div></div>`;}
  function home(){const sh=todayShift(),current=currentShiftState(),site=state.worksite,es=myEvents().filter(e=>dateKey(e.effectiveAt)===nowKey());
    const shift=sh?`${tTime(sh.startAt)} – ${tTime(sh.endAt)}`:'今日尚無已發布班別';
    return `${header('今天也辛苦了，'+safe(state.me.name)+'！','小小水族日常，由每一次用心開始。')}
      <section class="hero"><span class="overline" style="color:#acd9ec">TODAY · ${tDate(new Date())}</span><h2>${current==='OFF'?'準備好開始今天的工作嗎？':current==='BREAK'?'休息中，回到工作室再打卡':'您目前正在上班'}</h2><div class="shift"><span>今日班別</span><b>${shift}</b></div><div class="hero-actions">${current==='OFF'?'<button class="btn primary" data-clock="IN">◎ GPS 上班打卡</button>':current==='WORK'?'<button class="btn white" data-clock="BREAK_START">☕ GPS 休息開始</button><button class="btn outline-light" data-clock="OUT">◷ GPS 下班打卡</button>':'<button class="btn white" data-clock="BREAK_END">◎ GPS 休息結束</button>'}</div></section>
      ${!site.enabled||site.latitude===null?'<div class="notice warn">⚠ 工作室 GPS 中心尚未完成校準，目前不能正式打卡。請通知管理者。</div>':`<div class="notice">📍 GPS 打卡地點：${safe(site.address)} · 半徑 ${site.radius}m · 定位誤差須 ≤ ${site.maxAccuracy}m</div>`}
      <div class="grid" style="margin-top:16px"><div class="card stat"><div><span>今天打卡次數</span><br><strong>${es.length}</strong></div><span>次</span></div><div class="card stat"><div><span>我的本月排班</span><br><strong>${state.shifts.filter(x=>x.employeeId===state.me.employeeId && x.status==='PUBLISHED' && dateKey(x.startAt).slice(0,7)===nowKey().slice(0,7)).length}</strong></div><span>班</span></div></div>
      <div class="section-title"><h2>本週排班</h2><button class="btn small outline" data-pagego="schedule">查看年月班表 →</button></div>${week()}
      <div class="section-title"><h2>今日打卡紀錄</h2><button class="btn small outline" data-pagego="attendance">全部紀錄 →</button></div><section class="card">${es.length?es.slice().reverse().map(e=>asItem(eventLabels[e.kind]||e.kind,e.source==='GPS_LIFF'?'GPS 定位成功':'主管核准補卡',`<strong>${tTime(e.effectiveAt)}</strong>`)).join(''):'<p class="subtle">今天尚無打卡紀錄。</p>'}</section>`;
  }
  // Current week is already part of the authenticated bootstrap window. Drafts
  // are deliberately NOT displayed as committed shifts for an employee.
  function week(){
    const today=nowKey(),dt=new Date(today+'T00:00:00+08:00'),dow=(new Date(today+'T12:00:00+08:00').getUTCDay()+6)%7,monday=new Date(dt.getTime()-dow*86400000);
    const own=state.shifts.filter(s=>s.employeeId===state.me.employeeId&&s.status==='PUBLISHED');
    return `<div class="week">${Array.from({length:7},(_,i)=>{const day=new Date(monday.getTime()+i*86400000),key=dateKey(day),sh=own.filter(s=>dateKey(s.startAt)===key).sort((x,y)=>new Date(x.startAt)-new Date(y.startAt));return `<div class="day ${today===key?'today':''} ${!sh.length?'off':''}"><small>${['一','二','三','四','五','六','日'][i]}</small><b>${Number(key.slice(-2))}</b><em>${sh.length?(tTime(sh[0].startAt)+(sh.length>1?' +'+(sh.length-1):'')):'—'}</em></div>`;}).join('')}</div><p class="schedule-week-hint">「—」代表目前無已發布班別，不代表已核定休假。</p>`;
  }
  // Taiwan year/month logic does not depend on the device's local timezone.
  function monthShift(month,delta){const [y,m]=month.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0');}
  const monthValid=m=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(m);
  function dayInMonth(month){const today=nowKey();return today.slice(0,7)===month?today:month+'-01';}
  function setScheduleMonth(next){
    if(!monthValid(next)||next<'2020-01'||next>'2099-12')return showToast('可查詢 2020 至 2099 年的年月。');
    if(scheduleMonth===next)return;
    scheduleMonth=next;scheduleDay=dayInMonth(next);scheduleError='';
    render();loadScheduleMonth(next);
  }
  function openPage(next){page=next;render();window.scrollTo({top:0,behavior:'smooth'});if(next==='schedule')loadScheduleMonth(scheduleMonth);if(next==='roster')loadRosterMonth(rosterMonth);}
  function cachedMonth(month){const entry=monthCache.get(month);return entry&&Date.now()-entry.at<MONTH_TTL_MS?entry:null;}
  async function loadScheduleMonth(month,force=false){
    if(!state||!state.registered)return;
    if(!force&&cachedMonth(month)){if(page==='schedule'&&scheduleMonth===month)render();return;}
    if(!force&&monthRequests.has(month))return monthRequests.get(month);
    if(force)monthCache.delete(month);
    const generation=(monthGenerations.get(month)||0)+1;monthGenerations.set(month,generation);
    scheduleError='';if(page==='schedule'&&scheduleMonth===month)render();
    const request=api('getMyShiftsMonth',{yearMonth:month}).then(r=>{
      if(!r||r.yearMonth!==month||!Array.isArray(r.shifts))throw Error('班表資料格式錯誤');
      if(monthGenerations.get(month)!==generation)return; // Ignore superseded refresh responses.
      monthCache.set(month,{at:Date.now(),shifts:r.shifts});
      // Prevent an unbounded memory cache when browsing many years.
      while(monthCache.size>9)monthCache.delete(monthCache.keys().next().value);
      if(page==='schedule'&&scheduleMonth===month){scheduleError='';render();}
    }).catch(e=>{if(monthGenerations.get(month)===generation&&page==='schedule'&&scheduleMonth===month){scheduleError=errMap[e.message]||e.message||'班表讀取失敗';render();}}).finally(()=>{if(monthRequests.get(month)===request)monthRequests.delete(month);});
    monthRequests.set(month,request);
    return request;
  }
  function shiftSummary(s){const start=dateKey(s.startAt),end=dateKey(s.endAt);return `${tTime(s.startAt)} – ${tTime(s.endAt)}${start!==end?'（隔日）':''}`;}
  function schedule(){
    const [year,mo]=scheduleMonth.split('-').map(Number),last=new Date(Date.UTC(year,mo,0)).getUTCDate();
    // Monday-first calendar, always a complete number of seven-day weeks.
    const first=(new Date(Date.UTC(year,mo-1,1)).getUTCDay()+6)%7;
    const cells=Math.ceil((first+last)/7)*7,entry=cachedMonth(scheduleMonth),items=entry?entry.shifts:[];
    const perDay=new Map();for(const s of items){const day=dateKey(s.startAt);if(!perDay.has(day))perDay.set(day,[]);perDay.get(day).push(s);}
    const countedDays=perDay.size;const selectedItems=perDay.get(scheduleDay)||[];
    const years=Array.from({length:80},(_,i)=>2020+i);
    const selectYear=`<select id="schedule-year" aria-label="選擇年份">${years.map(y=>`<option value="${y}" ${year===y?'selected':''}>${y} 年</option>`).join('')}</select>`;
    const selectMonth=`<select id="schedule-month" aria-label="選擇月份">${Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${mo===i+1?'selected':''}>${i+1} 月</option>`).join('')}</select>`;
    const content=!entry ? `<div class="schedule-loading" role="status">${scheduleError?`<strong>無法讀取班表</strong><p>${safe(scheduleError)}</p><button class="btn outline" id="schedule-retry">重新查詢</button>`:'<div class="loader"></div><p>正在讀取 '+year+' 年 '+mo+' 月已發布班表…</p>'}</div>` :
     `<div class="schedule-tally"><div><span>本月已發布班別</span><strong>${items.length} <small>班</small></strong></div><div><span>有排班日期</span><strong>${countedDays} <small>天</small></strong></div></div>
      ${scheduleView==='calendar'?`<div class="schedule-month-grid" role="group" aria-label="${year} 年 ${mo} 月班表">
        ${['一','二','三','四','五','六','日'].map(w=>`<div class="schedule-week-label">${w}</div>`).join('')}
        ${Array.from({length:cells},(_,i)=>{const d=i-first+1;if(d<1||d>last)return '<div class="schedule-blank" aria-hidden="true"></div>';const key=scheduleMonth+'-'+String(d).padStart(2,'0'),on=perDay.get(key)||[];return `<button type="button" data-schedule-day="${key}" aria-label="${mo}月${d}日，${on.length?'已發布'+on.length+'個班別':'無已發布班別'}" aria-pressed="${scheduleDay===key}" class="schedule-date ${scheduleDay===key?'selected':''} ${key===nowKey()?'current':''} ${on.length?'has-shift':''}"><span class="schedule-date-number">${d}</span>${on.length?`<span class="schedule-date-time">${tTime(on[0].startAt)}</span>${on.length>1?`<span class="schedule-count">+${on.length-1}</span>`:'<span class="schedule-dot"></span>'}`:'<span class="schedule-date-empty">—</span>'}</button>`;}).join('')}</div>
        <div class="schedule-selected" role="region" aria-label="選取日期班表"><div class="schedule-selected-head"><strong>${scheduleDay.slice(5).replace('-','/')} 班表</strong><span>${selectedItems.length?selectedItems.length+' 班':'未列入已發布班表'}</span></div>${selectedItems.length?selectedItems.map(s=>`<div class="schedule-shift-line"><span class="schedule-shift-icon">◷</span><div><strong>${shiftSummary(s)}</strong><small>嘎比嘎比水族工作室 · 已發布</small></div></div>`).join(''):'<p class="schedule-empty-day">目前沒有這一天的已發布班別，並不代表已核定休假。</p>'}</div>`:
        `<div class="schedule-list">${items.length?Array.from(perDay.entries()).sort((x,y)=>x[0].localeCompare(y[0])).map(([date,arr])=>`<div class="schedule-list-group"><div class="schedule-list-day">${date.slice(5).replace('-','/')} <small>週${['日','一','二','三','四','五','六'][new Date(date+'T12:00:00+08:00').getUTCDay()]}</small></div>${arr.map(s=>`<div class="schedule-shift-line"><span class="schedule-shift-icon">◷</span><div><strong>${shiftSummary(s)}</strong><small>已發布 · 嘎比嘎比水族工作室</small></div></div>`).join('')}</div>`).join(''):'<div class="schedule-no-published"><span aria-hidden="true">▦</span><strong>本月尚無已發布班表</strong><p>可能尚未安排或尚未發布，請以管理者公告為準。</p></div>'}</div>`}
      ${items.length===0&&scheduleView==='calendar'?'<div class="schedule-unpublished">本月尚無已發布班表，請勿將空白日期視為已核定休假。</div>':''}`;
    return `${header('我的班表','選擇年份、月份，查看自己的已發布班別。')}
      <section class="card schedule-panel"><div class="schedule-toolbar"><div class="schedule-nav"><button class="schedule-arrow" id="schedule-prev" type="button" aria-label="上一個月">‹</button><div class="schedule-pickers"><label>年份 ${selectYear}</label><label>月份 ${selectMonth}</label></div><button class="schedule-arrow" id="schedule-next" type="button" aria-label="下一個月">›</button></div><div class="schedule-tools"><button type="button" class="btn small outline" id="schedule-today">回到本月</button><button type="button" class="btn small outline" id="schedule-refresh">⟳ 更新</button></div></div>
      <div class="schedule-switch" role="group" aria-label="班表顯示模式"><button type="button" class="${scheduleView==='calendar'?'active':''}" data-schedule-view="calendar" aria-pressed="${scheduleView==='calendar'}">▦ 月曆</button><button type="button" class="${scheduleView==='list'?'active':''}" data-schedule-view="list" aria-pressed="${scheduleView==='list'}">☷ 列表</button></div>${content}</section><p class="schedule-footer">時間皆為台灣時間（UTC+8）。僅顯示您本人的已發布班表，跨日班歸屬於開始日期。想查看最新異動可點「更新」。</p>`;
  }
  function attendance(){const items=myEvents().slice().reverse().slice(0,80),cs=state.corrections.filter(c=>c.employeeId===state.me.employeeId).slice().reverse();
    return `${header('出勤與補卡','每一筆正式出勤與調整紀錄，都有完整歷程。')}<div class="grid four-clock">${[['IN','GPS 上班'],['BREAK_START','GPS 休息開始'],['BREAK_END','GPS 休息結束'],['OUT','GPS 下班']].map(([kind,label])=>`<button class="btn ${kind==='IN'?'primary':'outline'}" data-clock="${kind}" ${!(currentShiftState()==='OFF'&&kind==='IN'||currentShiftState()==='WORK'&&['BREAK_START','OUT'].includes(kind)||currentShiftState()==='BREAK'&&kind==='BREAK_END')?'disabled':''}>${label}</button>`).join('')}</div><div class="notice">四種打卡均須在工作室 GPS 範圍內。外出用餐時請先在店內打休息開始，返回店內後再打休息結束。</div>
    <div class="section-title"><h2>近期出勤</h2><span class="subtitle">最近 32 天</span></div><section class="card">${items.length?items.map(e=>asItem(eventLabels[e.kind]||e.kind,`${tDate(e.effectiveAt)} · ${e.source==='GPS_LIFF'?'GPS':'補卡核准'}`,`<strong>${tTime(e.effectiveAt)}</strong>`)).join(''):'<p class="subtle">尚無出勤紀錄。</p>'}</section>
    <div class="section-title"><h2>忘記打卡申請</h2></div><section class="card stack"><div class="notice">若遇到 GPS 定位失敗，請先重新定位；確實無法打卡時才提出補卡申請。</div><form id="correction" class="stack"><div class="form-grid"><div class="field"><label for="corr-kind">補卡種類</label><select id="corr-kind"><option value="IN">上班</option><option value="OUT">下班</option><option value="BREAK_START">休息開始</option><option value="BREAK_END">休息結束</option></select></div><div class="field"><label for="corr-time">實際出勤時間（台灣時間）</label><input required id="corr-time" type="datetime-local"></div></div><div class="field"><label for="corr-reason">補卡原因</label><textarea required minlength="5" maxlength="300" id="corr-reason" placeholder="請描述為何無法正常打卡"></textarea></div><button class="btn primary" type="submit">送出補卡申請</button></form>${cs.length?'<h3>我的申請紀錄</h3>'+cs.map(c=>asItem(`${eventLabels[c.kind]||c.kind} · ${tDate(c.requestedAt)} ${tTime(c.requestedAt)}`,text(c.reason),`<span class="tag">${({PENDING:'待審核',APPROVED:'已核准',REJECTED:'已退回'})[c.status]||c.status}</span>`)).join(''):''}</section>${requestForms()}`;
  }
  // 1.1.3 Full ADMIN roster is a separate workspace: employee-facing month API
  // remains strictly self-only; ADMIN query carries every active shift for a month.
  function rosterCached(month){const v=rosterCache.get(month);return v&&Date.now()-v.at<ROSTER_TTL_MS?v:null;}
  async function loadRosterMonth(month,force=false){
    if(!isAdmin())return;
    if(!force&&rosterCached(month)){if(page==='roster'&&rosterMonth===month)render();return;}
    if(!force&&rosterRequests.has(month))return rosterRequests.get(month);
    if(force)rosterCache.delete(month);
    const gen=(rosterGenerations.get(month)||0)+1;rosterGenerations.set(month,gen);
    rosterError='';if(page==='roster'&&rosterMonth===month)render();
    const request=api('getAdminRosterMonth',{yearMonth:month}).then(v=>{
      if(!v||v.yearMonth!==month||!Array.isArray(v.shifts))throw Error('全員班表資料格式錯誤');
      if(rosterGenerations.get(month)!==gen)return;
      rosterCache.set(month,{at:Date.now(),shifts:v.shifts});while(rosterCache.size>6)rosterCache.delete(rosterCache.keys().next().value);
      if(page==='roster'&&rosterMonth===month){rosterError='';render();}
    }).catch(e=>{if(rosterGenerations.get(month)===gen&&page==='roster'&&rosterMonth===month){rosterError=errMap[e.message]||e.message||'班表查詢失敗';render();}})
    .finally(()=>{if(rosterRequests.get(month)===request)rosterRequests.delete(month);});
    rosterRequests.set(month,request);return request;
  }
  function setRosterMonth(month){
    if(!monthValid(month)||month<'2020-01'||month>'2099-12')return showToast('請選擇 2020 至 2099 年。');
    if(month===rosterMonth)return;
    rosterMonth=month;rosterDay=dayInMonth(month);rosterEditing='';rosterError='';render();loadRosterMonth(month);
  }
  function rosterStartMonday(day){
    const d=new Date(day+'T12:00:00+08:00'),wd=(d.getUTCDay()+6)%7;
    const monday=new Date(Date.parse(day+'T00:00:00+08:00')-wd*86400000);
    return dateKey(monday);
  }
  function localInput(t){return t?dateKey(t)+'T'+tTime(t):'';}
  function addDaysKey(key,n){return dateKey(new Date(Date.parse(key+'T12:00:00+08:00')+n*86400000));}
  function adminRoster(){
    const entry=rosterCached(rosterMonth),all=entry?entry.shifts:[],staff=(state.employees||[]),selected=rosterEmployee;
    const visible=selected==='ALL'?all:all.filter(r=>r.employeeId===selected);
    const staffName=id=>(staff.find(e=>e.employeeId===id)||{}).name||id;
    const byDay=new Map();for(const s of visible){const k=dateKey(s.startAt);if(!byDay.has(k))byDay.set(k,[]);byDay.get(k).push(s);}
    const [year,mm]=rosterMonth.split('-').map(Number),last=new Date(Date.UTC(year,mm,0)).getUTCDate();
    const start=(new Date(Date.UTC(year,mm-1,1)).getUTCDay()+6)%7,total=Math.ceil((start+last)/7)*7;
    const counts={draft:visible.filter(x=>x.status==='DRAFT').length,published:visible.filter(x=>x.status==='PUBLISHED').length};
    const dayShifts=byDay.get(rosterDay)||[],editing=all.find(x=>x.id===rosterEditing);
    const empOpt=staff.filter(x=>x.enabled||all.some(s=>s.employeeId===x.employeeId)).map(x=>`<option value="${safe(x.employeeId)}" ${editing?editing.employeeId===x.employeeId?'selected':'':selected===x.employeeId?'selected':''}>${safe(x.name)}${x.enabled?'':'（停用）'}</option>`).join('');
    const days=Array.from({length:total},(_,i)=>i-start+1);
    const rosterItem=s=>`<div class="roster-shift-line"><span class="roster-status ${s.status==='DRAFT'?'draft':'published'}">${s.status==='DRAFT'?'草稿':'已發布'}</span><div class="roster-shift-body"><strong>${safe(staffName(s.employeeId))}</strong><small>${shiftSummary(s)}</small></div><div class="roster-row-actions"><button type="button" class="btn small outline" data-roster-edit="${safe(s.id)}">編輯</button><button type="button" class="btn small danger" data-roster-cancel="${safe(s.id)}">取消</button></div></div>`;
    const cell=d=>{if(d<1||d>last)return '<div class="roster-calendar-empty" aria-hidden="true"></div>';
      const key=rosterMonth+'-'+String(d).padStart(2,'0'),items=byDay.get(key)||[];
      const labels=items.slice(0,2).map(sh=>`<span class="roster-mini ${sh.status==='DRAFT'?'draft':'published'}" title="${safe(staffName(sh.employeeId)+' '+shiftSummary(sh))}">${safe(staffName(sh.employeeId))} ${tTime(sh.startAt)}</span>`).join('');
      return `<button type="button" class="roster-calendar-cell ${key===rosterDay?'selected':''} ${key===nowKey()?'current':''}" data-roster-day="${key}" aria-label="${key}，${items.length} 個班別"><span class="roster-date-number">${d}</span>${labels}${items.length>2?`<small>+${items.length-2} 班</small>`:items.length?'':'<span class="roster-cell-blank">—</span>'}</button>`;};
    const currentMonday=rosterStartMonday(nowKey()),nextMonday=addDaysKey(currentMonday,7);
    let startInput=rosterDay+'T16:00',endInput=rosterDay+'T20:00';
    if(editing){startInput=localInput(editing.startAt);endInput=localInput(editing.endAt);}
    return `${header('全員排班管理','月曆掌握全員班表，先建草稿、確認後再發布。')}
    <section class="card roster-workspace">
      <div class="roster-toolbar"><div class="roster-month-nav"><button class="schedule-arrow" id="roster-prev" aria-label="上一個月">‹</button><label class="roster-month-picker"><span>年月</span><input type="month" id="roster-month-input" min="2020-01" max="2099-12" value="${safe(rosterMonth)}" aria-label="選擇排班年月"></label><button class="schedule-arrow" id="roster-next" aria-label="下一個月">›</button></div><div class="roster-toolbar-tools"><select id="roster-emp-filter" aria-label="篩選員工"><option value="ALL">所有員工</option>${staff.map(x=>`<option value="${safe(x.employeeId)}" ${selected===x.employeeId?'selected':''}>${safe(x.name)}${x.enabled?'':'（停用）'}</option>`).join('')}</select><button id="roster-this-month" class="btn small outline">本月</button><button id="roster-reload" class="btn small outline">↻ 更新</button></div></div>
      <div class="roster-metrics"><div><small>已發布班別</small><strong>${counts.published}</strong></div><div><small>草稿待發布</small><strong>${counts.draft}</strong></div><div><small>有排班天數</small><strong>${byDay.size}</strong></div></div>
      <div class="schedule-switch" role="group" aria-label="排班檢視模式"><button data-roster-view="calendar" class="${rosterView==='calendar'?'active':''}">▦ 月曆</button><button data-roster-view="list" class="${rosterView==='list'?'active':''}">☷ 列表</button></div>
      ${!entry?rosterError?`<div class="schedule-loading"><strong>查詢失敗</strong><p>${safe(rosterError)}</p><button class="btn outline" id="roster-retry">重新查詢</button></div>`:'<div class="schedule-loading"><div class="loader"></div><p>正在載入全員班表…</p></div>':rosterView==='calendar'?`<div class="roster-month-grid">${['一','二','三','四','五','六','日'].map(d=>`<span class="schedule-week-label">${d}</span>`).join('')}${days.map(cell).join('')}</div>`:visible.length?`<div class="roster-month-list">${[...byDay.keys()].sort().map(day=>`<div class="roster-list-group"><button type="button" class="roster-list-day" data-roster-day="${day}">${day} · ${byDay.get(day).length} 班</button>${byDay.get(day).map(rosterItem).join('')}</div>`).join('')}</div>`:'<div class="schedule-no-published"><strong>目前沒有班表</strong><p>請在下方新增草稿並發布。</p></div>'}
      ${entry?'<p class="roster-legend"><span class="roster-key published"></span>已發布 <span class="roster-key draft"></span>草稿　·　沒有班別不代表休假</p>':''}
    </section>
    <section class="card stack roster-day-panel"><div class="roster-day-head"><div><span class="overline">SELECTED DAY</span><h3>${safe(rosterDay)} 班表</h3></div><span class="tag">${dayShifts.length} 班</span></div>${entry?(dayShifts.map(rosterItem).join('')||'<p class="subtle">當日尚無班別。可在下方立即新增。</p>'):'<p class="subtle">載入班表後可查看或編輯。</p>'}</section>
    <div class="roster-form-columns"><section class="card stack"><div class="roster-day-head"><h3>${editing?'編輯現有班別':'快速新增班表草稿'}</h3>${editing?'<button class="btn small outline" id="roster-edit-clear">取消編輯</button>':''}</div><p class="help">${editing?'已發布的未來班別可安全調整時間，變更會通知員工；已有關聯申請的班別不可直接修改。':'點選月曆日期，自動帶入日期；可用班別範本快速填入時間。'}</p><form class="stack" id="roster-shift-form"><div class="field"><label>員工</label><select id="roster-form-employee" required ${editing?'disabled':''}>${empOpt}</select></div><div class="field"><label>班別範本</label><select id="roster-template"><option value="">自訂時間</option>${(state.templates||[]).map(t=>`<option value="${safe(t.id)}">${safe(t.name)} ${safe(t.start)}–${safe(t.end)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label>開始（台灣時間）</label><input type="datetime-local" required id="roster-form-start" value="${safe(startInput)}"></div><div class="field"><label>結束（台灣時間）</label><input type="datetime-local" required id="roster-form-end" value="${safe(endInput)}"></div></div><button type="submit" class="btn primary full">${editing?'確認修改班別':'建立草稿班別'}</button></form></section>
    <section class="card stack"><h3>複製整週班表</h3><p class="help">選擇來源週與目標週的星期一，複製後一律成為草稿，不自動發布。若目標有重疊，不會部分寫入。</p><form id="roster-copy-form" class="stack"><div class="field"><label>複製員工範圍</label><select id="roster-copy-employee"><option value="">全部員工</option>${staff.filter(x=>x.enabled).map(e=>`<option value="${safe(e.employeeId)}" ${selected===e.employeeId?'selected':''}>${safe(e.name)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label>來源週（一）</label><input id="roster-copy-from" type="date" value="${currentMonday}" required></div><div class="field"><label>目標週（一）</label><input id="roster-copy-to" type="date" value="${nextMonday}" required></div></div><button type="submit" class="btn outline full">複製為新草稿</button></form><div class="roster-publish"><h3>發布本月草稿</h3><p class="help">只發布目前選定月份${selected==='ALL'?'的所有員工':'與所選員工'}的草稿。過去的草稿或已月結月份不允許發布。</p><button id="roster-publish" class="btn primary full" ${!entry||counts.draft===0?'disabled':''}>發布 ${counts.draft} 筆草稿</button></div></section></div>
    <div class="actions"><button type="button" class="btn outline" data-pagego="admin">← 返回管理工作台</button><button type="button" class="btn outline" data-pagego="schedule">查看我的班表</button></div>`;
  }
  function admin(){const site=state.worksite,staff=state.employees||[],pending=state.corrections.filter(c=>c.status==='PENDING'),all=state.shifts.slice().sort((a,b)=>new Date(a.startAt)-new Date(b.startAt)),name=id=>(staff.find(x=>x.employeeId===id)||{}).name||id;
    return `${header('管理工作台','員工 · 排班 · 補卡審核 · 據點管理')}
      <div class="grid three"><div class="card stat"><div><span>啟用員工</span><br><strong>${staff.filter(x=>x.enabled).length}</strong></div></div><div class="card stat"><div><span>待審補卡</span><br><strong>${pending.length}</strong></div></div><div class="card stat"><div><span>近期班表</span><br><strong>${all.length}</strong></div></div></div>
      <div class="section-title"><h2>GPS 工作據點</h2></div><section class="card stack"><div><strong>${safe(site.name)}</strong><p class="subtle">${safe(site.address)}</p><span class="pill ${site.latitude===null?'warn':'good'}">${site.latitude===null?'尚未校準 GPS':'已完成 GPS 校準'}</span></div>${site.latitude!==null?`<p class="mono">座標 ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}</p>`:''}<div class="notice">請管理者親自在工作室中心點操作。定位誤差須 ≤ 60 公尺。第一次校準後，員工才能打卡。</div><div class="form-grid"><div class="field"><label>允許打卡半徑（公尺）</label><input type="number" id="site-radius" min="50" max="300" value="${site.radius}"></div><div class="field"><label>最大定位誤差（公尺）</label><input type="number" id="site-accuracy" min="20" max="150" value="${site.maxAccuracy}"></div></div><button class="btn primary" id="calibrate">📍 用我現在的位置校準工作室</button></section>
      <div class="section-title"><h2>新增員工</h2></div><section class="card"><form id="employee-form" class="stack"><div class="form-grid"><div class="field"><label>員工姓名</label><input required id="emp-name" maxlength="80" placeholder="員工名稱"></div><div class="field"><label>身分權限</label><select id="emp-role"><option value="STAFF">一般員工</option><option value="ADMIN">管理者</option></select></div></div><div class="field"><label>LINE User ID（員工首次登入畫面可複製）</label><input required id="emp-uid" pattern="U[0-9a-fA-F]{32}" placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"></div><button class="btn primary" type="submit">新增員工</button></form></section>
      <div class="section-title"><h2>全員排班</h2></div><section class="card stack"><div class="admin-roster-callout"><div><span class="overline">NEW · 1.1.3</span><h3>管理者排班月曆</h3><p class="subtle">用年月月曆管理全員班表，建立／調整草稿、複製整週與選擇月份發布。</p></div><button class="btn primary" data-pagego="roster">開啟排班管理 →</button></div></section>
      <div class="section-title"><h2>待審補卡</h2></div><section class="card">${pending.length?pending.map(c=>`<div class="list-item"><div><div class="title">${safe(name(c.employeeId))} · ${c.kind==='IN'?'上班':'下班'} · ${tDate(c.requestedAt)} ${tTime(c.requestedAt)}</div><small>${safe(c.reason)}</small></div><div class="actions"><button class="btn small primary" data-review="${safe(c.id)}" data-approve="true">核准</button><button class="btn small outline" data-review="${safe(c.id)}" data-approve="false">退回</button></div></div>`).join(''):'<p class="subtle">目前沒有待審核的補卡申請。</p>'}</section>
      <div class="section-title"><h2>匯出出勤紀錄</h2></div><section class="card stack"><div class="form-grid"><div class="field"><label>開始日期</label><input id="export-from" type="date" value="${nowKey().slice(0,7)}-01"></div><div class="field"><label>結束日期</label><input id="export-to" type="date" value="${nowKey()}"></div></div><button class="btn outline" id="export">下載出勤 CSV（Excel 可開啟）</button><p class="help">匯出員工、上/下班、時間及來源。尚未包含薪資與加班核算。</p></section>`;
  }
  const opts=()=>((state.shifts||[]).filter(s=>s.employeeId===state.me.employeeId&&s.status==='PUBLISHED').map(s=>`<option value="${safe(s.id)}">${tDate(s.startAt)} ${tTime(s.startAt)}–${tTime(s.endAt)}</option>`).join(''));
  function requestForms(){return `<div class="section-title"><h2>加班與請假申請</h2></div>
    <section class="card stack"><h3>加班申請</h3><p class="help">申請單用於核對工作事實；實際工作工資仍依法律規定。班表外停留不會自動算薪。</p><form id="overtime-form" class="stack"><div class="field"><label>對應正式班表</label><select required id="ot-shift">${opts()}</select></div><div class="form-grid"><div class="field"><label>加班開始</label><input type="datetime-local" id="ot-start" required></div><div class="field"><label>加班結束</label><input type="datetime-local" id="ot-end" required></div></div><div class="field"><label>加班原因</label><textarea id="ot-reason" minlength="5" required placeholder="請寫下實際工作內容"></textarea></div><button class="btn primary" type="submit">送出加班申請</button></form></section>
    <div class="section-title"><h2>請假申請</h2></div><section class="card stack"><form id="leave-form" class="stack"><div class="field"><label>對應正式班表</label><select required id="leave-shift">${opts()}</select></div><div class="field"><label>假別</label><select id="leave-type"><option value="PERSONAL">事假</option><option value="SICK">普通病假</option><option value="ANNUAL">特休</option><option value="OTHER_LEGAL">其他法定假別（人工覆核）</option></select></div><div class="form-grid"><div class="field"><label>開始</label><input required type="datetime-local" id="leave-start"></div><div class="field"><label>結束</label><input required type="datetime-local" id="leave-end"></div></div><div class="field"><label>說明</label><textarea id="leave-reason" required minlength="5"></textarea></div><button class="btn primary" type="submit">送出請假申請</button></form></section>`;}
  function approvals(){const ot=(state.overtime||[]).filter(r=>r.status==='PENDING'),lv=(state.leave||[]).filter(r=>r.status==='PENDING'),co=state.corrections.filter(r=>r.status==='PENDING'),name=id=>safe(((state.employees||[]).find(e=>e.employeeId===id)||{}).name||id);
    const apply=(type,arr)=>arr.map(r=>`<div class="list-item"><div><div class="title">${name(r.employeeId)} · ${type==='OVERTIME'?'加班':'請假'}</div><small>${tDate(r.startAt)} ${tTime(r.startAt)}–${tTime(r.endAt)} ${type==='LEAVE'?safe(r.leaveType):''}</small></div><div class="actions">${type==='OVERTIME'?`<select class="pay-rule" data-rule="${safe(r.id)}"><option value="REGULAR_EXTRA">約定外正常工時 ×1</option><option value="WEEKDAY_OT_1">法定平日加班前2h ×4/3</option><option value="WEEKDAY_OT_2">法定平日加班後2h ×5/3</option><option value="REVIEW_REQUIRED">需人工判定</option></select>`:''}<button class="btn small primary" data-approve-request="${safe(r.id)}" data-type="${type}" data-ok="1">核准</button><button class="btn small outline" data-approve-request="${safe(r.id)}" data-type="${type}" data-ok="0">退回</button></div></div>`).join('');
    return `${header('統一簽核中心','所有申請留存歷史紀錄，原始出勤不會被覆蓋。')}<div class="grid three"><div class="card stat"><div><span>待審加班</span><br><strong>${ot.length}</strong></div></div><div class="card stat"><div><span>待審請假</span><br><strong>${lv.length}</strong></div></div><div class="card stat"><div><span>待審補卡</span><br><strong>${co.length}</strong></div></div></div><div class="section-title"><h2>加班申請</h2></div><section class="card">${apply('OVERTIME',ot)||'<p class="subtle">沒有待審加班。</p>'}</section><div class="section-title"><h2>請假申請</h2></div><section class="card">${apply('LEAVE',lv)||'<p class="subtle">沒有待審請假。</p>'}</section><div class="section-title"><h2>補卡申請</h2></div><section class="card">${co.map(c=>`<div class="list-item"><div><div class="title">${name(c.employeeId)} · ${safe(eventLabels[c.kind]||c.kind)}</div><small>${tDate(c.requestedAt)} ${tTime(c.requestedAt)} · ${safe(c.reason)}</small></div><div class="actions"><button class="btn small primary" data-review="${safe(c.id)}" data-approve="true">核准</button><button class="btn small outline" data-review="${safe(c.id)}" data-approve="false">退回</button></div></div>`).join('')||'<p class="subtle">沒有待審補卡。</p>'}</section>`;
  }
  const money=n=>new Intl.NumberFormat('zh-TW',{style:'currency',currency:'TWD',maximumFractionDigits:0}).format(Number(n)||0);
  function payrollView(){const staff=state.employees||[],p=payroll;
    const salaries=state.compensations||[];
    const current=staff.map(employee=>({employee,record:salaries.filter(r=>r.employeeId===employee.employeeId).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom))[0]}))
      .filter(x=>x.record).sort((a,b)=>a.employee.name.localeCompare(b.employee.name,'zh-TW'));
    const salaryTable=current.length?`<div class="table-wrap"><table><thead><tr><th>員工</th><th>計薪制度</th><th>目前設定</th><th>生效日期</th></tr></thead><tbody>${current.map(({employee,record})=>`<tr><td>${safe(employee.name)}${employee.enabled?'':'（已停用）'}</td><td>${record.employmentType==='PART_TIME'?'兼職':'正職'}／${record.payBasis==='HOURLY'?'時薪':'月薪'}</td><td>${money(record.payBasis==='HOURLY'?record.hourlyRate:record.monthlySalary)}${record.payBasis==='HOURLY'?'/時':''}</td><td>${safe(record.effectiveFrom)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="subtle">尚未設定任何員工的薪資。</p>';
    return `${header('月結薪資','只有 ADMIN 能查看所有員工的薪資。試算與正式封存分離。')}<div class="notice warn">薪資計算為測試版，尚不包含勞健保、勞退、所得稅；特殊假勤與工作日類型必須人工確認，請勿直接代替正式工資清冊。</div>
    <div class="section-title"><h2>員工薪資設定</h2></div><section class="card stack"><form id="pay-form" class="stack"><div class="field"><label>員工</label><select id="pay-emp">${staff.filter(x=>x.enabled).map(e=>`<option value="${safe(e.employeeId)}">${safe(e.name)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label>員工類型</label><select id="pay-employment"><option value="PART_TIME">兼職</option><option value="FULL_TIME">正職</option></select></div><div class="field"><label>計薪方式</label><select id="pay-basis"><option value="HOURLY">時薪</option><option value="MONTHLY">月薪</option></select></div></div><div class="form-grid"><div class="field"><label>時薪／月薪金額（NT$）</label><input type="number" required id="pay-rate" min="1" step="1" placeholder="例如 200"></div><div class="field"><label>生效日期</label><input id="pay-from" type="date" required value="${nowKey()}"></div></div><div class="field"><label>設定原因（留存歷程）</label><input id="pay-reason" minlength="5" required placeholder="例如 新進員工約定薪資"></div><button class="btn primary" type="submit">儲存員工薪資版本</button></form><h3>已設定的員工薪資</h3>${salaryTable}<p class="help">薪資有生效日期，歷史異動留在 Google Sheets。只有 ADMIN 能查看此頁與薪資資料。</p></section>
    <div class="section-title"><h2>工作日類別確認</h2></div><section class="card stack"><form id="calendar-form" class="stack"><div class="form-grid"><div class="field"><label>日期</label><input id="cal-day" type="date" required value="${nowKey()}"></div><div class="field"><label>實際工作日類型</label><select id="cal-type"><option value="WORKDAY">正常工作日</option><option value="REST_DAY">休息日</option><option value="REGULAR_DAY_OFF">例假</option><option value="HOLIDAY">國定假日</option></select></div></div><div class="field"><label>備註</label><input id="cal-note" placeholder="請依實際排班與法令確認"></div><button class="btn outline" type="submit">儲存此日分類</button></form></section>
    <div class="section-title"><h2>月結預覽</h2></div><section class="card stack"><div class="form-grid"><div class="field"><label>結算月份</label><input id="pay-month" type="month" value="${safe(payrollMonth)}"></div><div class="field"><label>產生試算</label><button class="btn primary" id="pay-preview">重新試算</button></div></div>${p?`<div class="payroll-overview"><div class="subtle">${safe(p.yearMonth)} 試算總額</div><strong>${money(p.gross)}</strong><span class="pill ${p.readyToClose?'good':'warn'}">${p.readyToClose?'無待審異常':'待覆核 '+p.issues.length+' 項'}</span></div><div class="table-wrap"><table><thead><tr><th>員工</th><th>正常工時</th><th>休息</th><th>計薪方式</th><th>試算總額</th></tr></thead><tbody>${p.people.map(x=>`<tr><td>${safe(x.name)}</td><td>${Math.round(x.normalMinutes)/60}h</td><td>${Math.round(x.breakMinutes)/60}h</td><td>${safe(x.payBasis)}</td><td>${money(x.gross)}</td></tr>`).join('')}</tbody></table></div><h3>異常與覆核</h3>${p.issues.length?p.issues.slice(0,70).map(x=>`<div class="list-item"><div><div class="title">${safe(((staff.find(e=>e.employeeId===x.employeeId)||{}).name)||x.employeeId)}</div><small>${safe(x.code)} · ${safe(x.shiftId||'整月')}</small></div>${['UNEXPLAINED_SHIFT_GAP','EARLY_PRESENCE_REVIEW','LATE_PRESENCE_REVIEW','LEAVE_ENTITLEMENT_REVIEW'].includes(x.code)?`<button class="btn small outline" data-review-att="${safe(x.shiftId)}" data-category="${x.code==='UNEXPLAINED_SHIFT_GAP'?'SHIFT_GAP':x.code==='EARLY_PRESENCE_REVIEW'?'EARLY_PRESENCE':x.code==='LEAVE_ENTITLEMENT_REVIEW'?'LEAVE_ENTITLEMENT':'LATE_PRESENCE'}">人工確認</button>`:''}</div>`).join(''):'<p class="subtle">目前沒有未解決的計算異常，但仍須核對薪資規則。</p>'}<button class="btn ${p.readyToClose?'primary':'outline'} full" id="pay-close" ${p.readyToClose?'':'disabled'}>確認封存本月薪資</button><button class="btn outline full" id="pay-csv">匯出薪資試算 CSV</button>`:'<p class="subtle">選擇月份後產生試算；遇到缺勤、休息未結束、假日或班表外工作等情況會阻止封存。</p>'}</section>`;
  }
  function salaryCsv(p){const quote=v=>'"'+String(v??'').replace(/^[\s]*[=+@\-]/,m=>"'"+m).replace(/"/g,'""')+'"';const rows=[['EmployeeID','Name','PayBasis','ScheduledWorkMinutes','UnpaidBreakMinutes','PreviewGrossTWD'],...p.people.map(x=>[x.employeeId,x.name,x.payBasis,x.normalMinutes,x.breakMinutes,x.gross])];const csv='\ufeff'+rows.map(r=>r.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`GuppyHR_Payroll_Preview_${p.yearMonth}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}

  function locationFix(){return new Promise((resolve,reject)=>{
    if(!navigator.geolocation)return reject(Error('此裝置不支援 GPS 定位。'));
    navigator.geolocation.getCurrentPosition(pos=>resolve(pos),e=>reject(Error(({1:'您拒絕了定位權限，請至 LINE / 手機設定允許定位。',2:'目前無法取得 GPS 位置，請移動到訊號較好的位置。',3:'GPS 定位逾時，請重新嘗試。'})[e.code]||'定位失敗')), {enableHighAccuracy:true,maximumAge:0,timeout:15000});
  });}
  async function clock(kind){if(busy)return;busy=true;showToast('正在檢查打卡狀態並取得 GPS 位置…');
    let data;
    try{
      // Reuse the original RequestID when a previous network response was ambiguous.
      try { const pending=JSON.parse(sessionStorage.getItem('guppyPendingClock')||'null');
        if(pending&&pending.kind===kind&&Date.now()-Date.parse(pending.fixTime)<120000)data=pending;
      } catch { /* disabled or unavailable sessionStorage */ }
      if(!data){const p=await locationFix();data={kind,requestId:crypto.randomUUID(),latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,fixTime:new Date(p.timestamp).toISOString()};}
      try{sessionStorage.setItem('guppyPendingClock',JSON.stringify(data));}catch{/* best effort */}
      await api('clock',data);
      try{sessionStorage.removeItem('guppyPendingClock');}catch{}
      showToast((eventLabels[kind]||kind)+'成功！');state=await api('bootstrap');render();
    }catch(e){
      if(['STALE_GPS','LOW_GPS_ACCURACY','OUTSIDE_WORKSITE','BAD_GPS','ALREADY_CLOCKED_IN','NOT_CLOCKED_IN','INVALID_CLOCK_SEQUENCE'].includes(e.message)){try{sessionStorage.removeItem('guppyPendingClock');}catch{}}
      showToast(errMap[e.message]||e.message||'打卡失敗，請稍後重試');
    }finally{busy=false;}
  }
  async function calibrate(){if(!confirm('請確認您現在位於新竹縣芎林鄉文山路159號的工作室中心位置。是否開始校準？'))return;
    try{showToast('正在取得管理者的 GPS 位置…');const p=await locationFix();const latitude=p.coords.latitude,longitude=p.coords.longitude,accuracy=p.coords.accuracy;
      if(accuracy>60)throw Error(`目前定位誤差約 ${Math.round(accuracy)} 公尺，請到門口或開闊處重新校準。`);
      if(!confirm(`即將使用目前位置作為工作室打卡中心。\n緯度：${latitude.toFixed(6)}\n經度：${longitude.toFixed(6)}\n誤差：${Math.round(accuracy)} 公尺\n\n確認設定？`))return;
      await mutate('setWorksite',{latitude,longitude,accuracy,radius:Number(document.querySelector('#site-radius').value),maxAccuracy:Number(document.querySelector('#site-accuracy').value)},'工作室 GPS 中心已更新');
    }catch(e){showToast(e.message);}
  }
  function csvDownload(entries){const headers=['EmployeeID','Name','Kind','EffectiveAtUTC','RecordedAtUTC','Source'];const dangerous=v=>{const s=String(v??'');return /^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s;};const quote=v=>'"'+dangerous(v).replace(/"/g,'""')+'"';const body=[headers,...entries.map(e=>[e.employeeId,e.name,e.kind,e.effectiveAt,e.recordedAt,e.source])].map(r=>r.map(quote).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`GuppyHR_Attendance_${nowKey()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function bindRosterActions(){
    if(page!=='roster')return;
    const on=(id,event,fn)=>{const el=root.querySelector('#'+id);if(el)el.addEventListener(event,fn);};
    on('roster-month-input','change',e=>setRosterMonth(e.target.value));
    on('roster-prev','click',()=>setRosterMonth(monthShift(rosterMonth,-1)));
    on('roster-next','click',()=>setRosterMonth(monthShift(rosterMonth,1)));
    on('roster-this-month','click',()=>setRosterMonth(nowMonth()));
    on('roster-reload','click',()=>loadRosterMonth(rosterMonth,true));
    on('roster-retry','click',()=>loadRosterMonth(rosterMonth,true));
    on('roster-emp-filter','change',e=>{rosterEmployee=e.target.value;rosterEditing='';render();});
    root.querySelectorAll('[data-roster-view]').forEach(el=>el.onclick=()=>{rosterView=el.dataset.rosterView;render();});
    root.querySelectorAll('[data-roster-day]').forEach(el=>el.onclick=()=>{rosterDay=el.dataset.rosterDay;rosterEditing='';render();});
    root.querySelectorAll('[data-roster-edit]').forEach(el=>el.onclick=()=>{rosterEditing=el.dataset.rosterEdit;rosterDay=dateKey((rosterCached(rosterMonth)||{shifts:[]}).shifts.find(s=>s.id===rosterEditing).startAt);render();document.getElementById('roster-shift-form')?.scrollIntoView({behavior:'smooth',block:'center'});});
    root.querySelectorAll('[data-roster-cancel]').forEach(el=>el.onclick=async()=>{
      const item=(rosterCached(rosterMonth)||{shifts:[]}).shifts.find(s=>s.id===el.dataset.rosterCancel);
      if(!item)return;
      if(!confirm(`確定取消 ${dateKey(item.startAt)} ${tTime(item.startAt)} 的班別？已發布的班表取消後不會顯示在員工月曆。`))return;
      await mutate('cancelShift',{id:item.id},'班表已取消');
    });
    on('roster-edit-clear','click',()=>{rosterEditing='';render();});
    on('roster-template','change',e=>{
      const template=(state.templates||[]).find(t=>t.id===e.target.value);if(!template)return;
      const startEl=root.querySelector('#roster-form-start'),endEl=root.querySelector('#roster-form-end');
      const base=(startEl.value||rosterDay+'T16:00').slice(0,10);startEl.value=base+'T'+template.start;
      endEl.value=addDaysKey(base,template.end<=template.start?1:0)+'T'+template.end;
    });
    on('roster-shift-form','submit',async e=>{
      e.preventDefault();const start=root.querySelector('#roster-form-start').value,end=root.querySelector('#roster-form-end').value;
      if(!start||!end||Date.parse(start+':00+08:00')>=Date.parse(end+':00+08:00'))return showToast('結束時間必須晚於開始時間。');
      const entry=rosterCached(rosterMonth),editing=entry&&entry.shifts.find(s=>s.id===rosterEditing);
      if(editing){if(!confirm('確定更新此班別時間？已發布班別可能通知員工。'))return;
        await mutate('updateRosterShift',{id:editing.id,startAt:localISO(start),endAt:localISO(end),expectedStartAt:editing.startAt,expectedEndAt:editing.endAt,expectedStatus:editing.status},'班別時間已更新');
        rosterEditing='';
      }else{await mutate('createShift',{employeeId:root.querySelector('#roster-form-employee').value,startAt:localISO(start),endAt:localISO(end)},'班表草稿已建立');}
    });
    on('roster-copy-form','submit',e=>{e.preventDefault();const sourceMonday=root.querySelector('#roster-copy-from').value,targetMonday=root.querySelector('#roster-copy-to').value,employeeId=root.querySelector('#roster-copy-employee').value;
      if(!confirm(`確認複製 ${sourceMonday} 當週到 ${targetMonday} 當週？複製後全部為草稿，未發布不會顯示於員工班表。`))return;
      mutate('copyRosterWeek',{sourceMonday,targetMonday,employeeId},'整週班表已複製成草稿');
    });
    on('roster-publish','click',()=>{const entry=rosterCached(rosterMonth);if(!entry)return;
      const items=entry.shifts.filter(s=>s.status==='DRAFT'&&(rosterEmployee==='ALL'||s.employeeId===rosterEmployee));
      if(!items.length)return showToast('沒有需要發布的草稿。');
      if(!confirm(`將正式發布 ${rosterMonth} 的 ${items.length} 筆草稿給${rosterEmployee==='ALL'?'所有員工':'指定員工'}？發布後員工可立即查詢。`))return;
      mutate('publishRosterMonth',{yearMonth:rosterMonth,employeeId:rosterEmployee==='ALL'?'':rosterEmployee},'本月班表已發布');
    });
  }
  function bind(){
    bindRosterActions();
    const sy=root.querySelector('#schedule-year'),sm=root.querySelector('#schedule-month');
    if(sy&&sm){sy.onchange=()=>setScheduleMonth(sy.value+'-'+sm.value);sm.onchange=()=>setScheduleMonth(sy.value+'-'+sm.value);}
    const prev=root.querySelector('#schedule-prev');if(prev)prev.onclick=()=>setScheduleMonth(monthShift(scheduleMonth,-1));
    const next=root.querySelector('#schedule-next');if(next)next.onclick=()=>setScheduleMonth(monthShift(scheduleMonth,1));
    const today=root.querySelector('#schedule-today');if(today)today.onclick=()=>{if(scheduleMonth===nowMonth()){scheduleDay=nowKey();render();}else setScheduleMonth(nowMonth());};
    const refresh=root.querySelector('#schedule-refresh');if(refresh)refresh.onclick=()=>loadScheduleMonth(scheduleMonth,true);
    const retry=root.querySelector('#schedule-retry');if(retry)retry.onclick=()=>loadScheduleMonth(scheduleMonth,true);
    root.querySelectorAll('[data-schedule-view]').forEach(el=>el.onclick=()=>{scheduleView=el.dataset.scheduleView;render();});
    root.querySelectorAll('[data-schedule-day]').forEach(el=>el.onclick=()=>{scheduleDay=el.dataset.scheduleDay;render();});
    root.querySelectorAll('[data-clock]').forEach(el=>el.onclick=()=>clock(el.dataset.clock));
    root.querySelectorAll('[data-pagego]').forEach(el=>el.onclick=()=>openPage(el.dataset.pagego));
    const correction=document.querySelector('#correction');if(correction)correction.onsubmit=e=>{e.preventDefault();mutate('requestCorrection',{kind:document.querySelector('#corr-kind').value,requestedAt:localISO(document.querySelector('#corr-time').value),reason:document.querySelector('#corr-reason').value},'補卡申請已送出');};
    const employee=document.querySelector('#employee-form');if(employee)employee.onsubmit=e=>{e.preventDefault();mutate('addEmployee',{uid:document.querySelector('#emp-uid').value.trim(),name:document.querySelector('#emp-name').value.trim(),role:document.querySelector('#emp-role').value},'員工已建立');};
    const shift=document.querySelector('#shift-form');if(shift)shift.onsubmit=e=>{e.preventDefault();mutate('createShift',{employeeId:document.querySelector('#shift-emp').value,startAt:localISO(document.querySelector('#shift-start').value),endAt:localISO(document.querySelector('#shift-end').value)},'班表草稿已建立');};
    const cal=document.querySelector('#calibrate');if(cal)cal.onclick=calibrate;
    const publish=document.querySelector('#publish');if(publish)publish.onclick=()=>confirm('確定發布未來 35 天的所有班表草稿嗎？')&&mutate('publishShifts',{},'班表已發布');
    root.querySelectorAll('[data-cancel]').forEach(el=>el.onclick=()=>confirm('確定取消此班別嗎？')&&mutate('cancelShift',{id:el.dataset.cancel},'班別已取消'));
    root.querySelectorAll('[data-review]').forEach(el=>el.onclick=()=>{const yes=el.dataset.approve==='true';if(confirm(yes?'確認核准補卡並新增人工打卡事件？':'確認退回此補卡申請？'))mutate('reviewCorrection',{id:el.dataset.review,approve:yes,note:''},yes?'已核准補卡':'已退回申請');});
    const overtime=document.querySelector('#overtime-form');if(overtime)overtime.onsubmit=e=>{e.preventDefault();mutate('createOvertimeRequest',{shiftId:document.querySelector('#ot-shift').value,startAt:localISO(document.querySelector('#ot-start').value),endAt:localISO(document.querySelector('#ot-end').value),reason:document.querySelector('#ot-reason').value},'加班申請已送出');};
    const leave=document.querySelector('#leave-form');if(leave)leave.onsubmit=e=>{e.preventDefault();mutate('createLeaveRequest',{shiftId:document.querySelector('#leave-shift').value,leaveType:document.querySelector('#leave-type').value,startAt:localISO(document.querySelector('#leave-start').value),endAt:localISO(document.querySelector('#leave-end').value),reason:document.querySelector('#leave-reason').value},'請假申請已送出');};
    root.querySelectorAll('[data-approve-request]').forEach(el=>el.onclick=()=>{const good=el.dataset.ok==='1',type=el.dataset.type,id=el.dataset.approveRequest,reason=prompt(good?'審核備註（可不填）':'請填入退回原因（至少5字）','');if(reason===null)return;
      const rule=type==='OVERTIME'?(root.querySelector('[data-rule="'+id+'"]')||{}).value:'';
      if(good&&rule==='REVIEW_REQUIRED'){showToast('此情境需人工確認工資分類，請先不要核准。');return;}
      if(confirm(good?'確定核准此申請？需確認實際工作、休息與法定薪資規則。':'確認退回這筆申請？'))mutate('reviewRequest',{type,id,approve:good,note:reason,payRule:rule},good?'審核通過':'已退回');});
    const payForm=document.querySelector('#pay-form');if(payForm)payForm.onsubmit=e=>{e.preventDefault();const basis=document.querySelector('#pay-basis').value,rate=Number(document.querySelector('#pay-rate').value);if(!confirm(`確認設定員工薪資：${basis==='HOURLY'?'時薪':'月薪'} NT$${rate}？此操作會保留歷史版本。`))return;
      mutate('setCompensation',{employeeId:document.querySelector('#pay-emp').value,employmentType:document.querySelector('#pay-employment').value,payBasis:basis,hourlyRate:basis==='HOURLY'?rate:0,monthlySalary:basis==='MONTHLY'?rate:0,effectiveFrom:document.querySelector('#pay-from').value,reason:document.querySelector('#pay-reason').value},'薪資版本已儲存');};
    const calForm=document.querySelector('#calendar-form');if(calForm)calForm.onsubmit=e=>{e.preventDefault();mutate('setWorkCalendar',{date:document.querySelector('#cal-day').value,dayType:document.querySelector('#cal-type').value,note:document.querySelector('#cal-note').value},'工作日類型已確認');};
    const previewBtn=document.querySelector('#pay-preview');if(previewBtn)previewBtn.onclick=async()=>{try{payrollMonth=document.querySelector('#pay-month').value;showToast('正在計算薪資與檢查出勤異常…');payroll=await api('getPayrollPreview',{yearMonth:payrollMonth});render();}catch(e){showToast(errMap[e.message]||e.message);}};
    const payClose=document.querySelector('#pay-close');if(payClose)payClose.onclick=()=>{if(!payroll||!payroll.readyToClose)return;if(!confirm(`即將封存 ${payroll.yearMonth}，總額 ${money(payroll.gross)}。已核對員工薪資、工作日、法定假別及額外工作工資？封存後不可直接修改。`))return;
      mutate('closePayroll',{yearMonth:payroll.yearMonth,confirmationToken:payroll.confirmationToken},'薪資已封存');};
    const payCsv=document.querySelector('#pay-csv');if(payCsv)payCsv.onclick=()=>salaryCsv(payroll);
    root.querySelectorAll('[data-review-att]').forEach(el=>el.onclick=()=>{const category=el.dataset.category,shiftId=el.dataset.reviewAtt,note=prompt('請說明實際出勤／班表外停留情況（至少6字）。此操作不會更改原始打卡，也不能隱瞞已發生的工作時間。','');if(note===null)return;
      const outcome=category==='SHIFT_GAP'?'UNPAID_GAP_CONFIRMED':category==='LEAVE_ENTITLEMENT'?'VERIFIED':'PERSONAL_PRESENCE';if(!confirm('請再次確認該時段的實際情況與法律規定相符，再進行覆核。'))return;
      mutate('reviewAttendance',{shiftId,category,outcome,note},'出勤例外已覆核，請重新試算薪資');});
    const ex=document.querySelector('#export');if(ex)ex.onclick=async()=>{try{const a=document.querySelector('#export-from').value,b=document.querySelector('#export-to').value;if(!a||!b)throw Error('請選擇日期範圍');const r=await api('exportAttendance',{startAt:new Date(a+'T00:00:00+08:00').toISOString(),endAt:new Date(b+'T23:59:59+08:00').toISOString()});csvDownload(r.entries);showToast(`已匯出 ${r.entries.length} 筆紀錄`);}catch(e){showToast(errMap[e.message]||e.message);}};
  }
  async function init(){try{
    const cr=await fetch('/api/config',{cache:'no-store'});const cfg=await cr.json();if(!cfg.liffId)throw Error('LIFF 尚未完成部署設定，請先設定 LIFF_ID。');
    if(!window.liff)throw Error('無法載入 LINE LIFF SDK，請檢查網路或重新開啟。');
    await liff.init({liffId:cfg.liffId});if(!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return;}
    token=liff.getIDToken();if(!token)throw Error('LINE 未提供 ID Token，請確認 LIFF 已啟用 openid Scope。');
    await reload();
  }catch(e){root.innerHTML=`<div class="empty"><h2>暫時無法啟動 Guppy HR</h2><p>${safe(e.message)}</p><button class="btn outline" onclick="location.reload()">重新整理</button></div>`;role.textContent='連線失敗';}}
  window.addEventListener('DOMContentLoaded',init);
})();
