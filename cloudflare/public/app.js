/* Guppy HR Phase 1.0.0 | LINE LIFF mobile-first interface */
(() => {
  'use strict';
  const root=document.querySelector('#app'),nav=document.querySelector('#nav'),role=document.querySelector('#role');
  let token='',state=null,page='home',busy=false,toastTimer;
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tDate=v=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const tTime=v=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
  const dateKey=v=>{const f=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(v));const p=Object.fromEntries(f.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;};
  const nowKey=()=>dateKey(new Date());
  const localISO=v=>v?new Date(v+':00+08:00').toISOString():'';
  const text=(v)=>safe(v||'—');
  const showToast=(s)=>{let n=document.querySelector('#toast');n.textContent=s;n.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove('show'),4800);};
  const errMap={NOT_REGISTERED:'您的 LINE 帳號尚未建立員工資料。',NO_PERMISSION:'您沒有執行此操作的權限。',WORKSITE_NOT_CALIBRATED:'管理者尚未完成工作室 GPS 校準。',LOW_GPS_ACCURACY:'目前 GPS 誤差過大，請走到開闊處重新定位。',OUTSIDE_WORKSITE:'定位顯示您不在工作室允許打卡的範圍內。',STALE_GPS:'定位資料已逾時，請重新定位。',ALREADY_CLOCKED_IN:'您目前已經上班打卡，請使用下班打卡。',NOT_CLOCKED_IN:'目前沒有尚未結束的上班打卡。',SERVER_BUSY:'目前伺服器忙碌，請稍後再試。',EXPIRED_REQUEST:'連線逾時，請重試。',BAD_SIGNATURE:'後端驗證設定有誤，請聯絡管理者。',LINE_TOKEN_INVALID:'LINE 登入已失效，請重新開啟系統。',INVALID_CALIBRATION:'GPS 誤差過高，無法完成校準。',SHIFT_OVERLAP:'員工已有時間重疊的班表。',CORRECTION_SEQUENCE_CONFLICT:'此補卡會造成上下班事件順序衝突，請檢查補卡時間及既有紀錄。',EMPLOYEE_EXISTS:'此 LINE 帳號已經有員工資料。',BAD_CORRECTION:'請完整填寫補卡類別、時間與至少 5 個字的原因。',BAD_CORRECTION_DATE:'補卡日期超出可申請範圍（過去 30 天）。'};
  async function api(action,data={}){
    const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),30000);
    try{const r=await fetch('/api/exec',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({action,data}),signal:ctrl.signal});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'NETWORK_ERROR');return j.result;}
    finally{clearTimeout(timer);}
  }
  async function mutate(action,data,ok){if(busy)return;busy=true;try{const result=await api(action,data);showToast(ok||'操作成功');state=await api('bootstrap');render();return result;}catch(e){showToast(errMap[e.message]||`操作失敗：${e.message}`);}finally{busy=false;}}
  async function reload(){state=await api('bootstrap');render();}
  const isAdmin=()=>state&&state.registered&&state.me.role==='ADMIN';
  const myEvents=()=>((state&&state.events)||[]).filter(e=>e.employeeId===state.me.employeeId).sort((a,b)=>new Date(a.effectiveAt)-new Date(b.effectiveAt));
  const currentlyClockedIn=()=>{const es=myEvents();return es.length&&es[es.length-1].kind==='IN';};
  const todayShift=()=>{const shifts=(state.shifts||[]).filter(s=>s.employeeId===state.me.employeeId && s.status!=='CANCELLED');const today=nowKey();return shifts.find(s=>dateKey(s.startAt)===today)||null;};
  const asItem=(a,b,right='')=>`<div class="list-item"><div><div class="title">${a}</div><small>${b}</small></div>${right}</div>`;
  function render(){
    if(!state){return;}
    if(!state.registered){nav.classList.add('hidden');role.textContent='待開通';root.innerHTML=`<div class="heading"><div><span class="overline">FIRST TIME LOGIN</span><h1>等待管理者開通</h1><p>LINE 已登入，尚未建立員工帳號。</p></div></div><section class="card stack"><h3>請將您的 LINE User ID 傳給管理者</h3><p>管理者需在 Google Sheets 的 Employees 分頁建立您的資料，或由已開通的管理者在 Guppy HR 加入。</p><code class="mono">${safe(state.uid)}</code><button class="btn primary" id="copy-uid">複製我的 LINE UID</button><button class="btn outline" id="refresh">重新檢查是否已開通</button></section>`;
      document.querySelector('#copy-uid').onclick=()=>navigator.clipboard.writeText(state.uid).then(()=>showToast('已複製 LINE UID'));
      document.querySelector('#refresh').onclick=()=>reload().catch(e=>showToast(e.message));return;
    }
    role.textContent=isAdmin()?'管理者':'員工';role.classList.remove('muted');nav.classList.remove('hidden');
    if(page==='admin'&&!isAdmin())page='home';
    const tabs=[['home','⌂','首頁'],['schedule','▦','班表'],['attendance','◷','出勤'],...(isAdmin()?[['admin','⚙','管理']]:[])];
    nav.innerHTML=tabs.map(([key,ico,label])=>`<button class="nav-item ${page===key?'active':''}" data-page="${key}"><span class="nav-icon">${ico}</span><span>${label}</span></button>`).join('');
    nav.querySelectorAll('[data-page]').forEach(x=>x.onclick=()=>{page=x.dataset.page;render();window.scrollTo({top:0,behavior:'smooth'});});
    root.innerHTML=page==='home'?home():page==='schedule'?schedule():page==='attendance'?attendance():admin();
    bind();
  }
  function header(title,sub){return `<div class="heading"><div><span class="overline">GUPPY HR · ${page.toUpperCase()}</span><h1>${title}</h1><p>${sub}</p></div></div>`;}
  function home(){const sh=todayShift(),open=currentlyClockedIn(),site=state.worksite,es=myEvents().filter(e=>dateKey(e.effectiveAt)===nowKey());
    const shift=sh?`${tTime(sh.startAt)} – ${tTime(sh.endAt)}`:'今日未安排班表';
    return `${header('今天也辛苦了，'+safe(state.me.name)+'！','小小水族日常，由每一次用心開始。')}
      <section class="hero"><span class="overline" style="color:#acd9ec">TODAY · ${tDate(new Date())}</span><h2>${open?'您目前正在上班':'準備好開始今天的工作嗎？'}</h2><div class="shift"><span>今日班別</span><b>${shift}</b></div><div class="hero-actions"><button class="btn ${open?'white':'primary'}" data-clock="${open?'OUT':'IN'}">${open?'◷ 下班打卡':'◎ GPS 上班打卡'}</button>${open?'':'<button class="btn white" data-pagego="schedule">查看本週班表</button>'}</div></section>
      ${!site.enabled||site.latitude===null?'<div class="notice warn">⚠ 工作室 GPS 中心尚未完成校準，目前不能正式打卡。請通知管理者。</div>':`<div class="notice">📍 GPS 打卡地點：${safe(site.address)} · 半徑 ${site.radius}m · 定位誤差須 ≤ ${site.maxAccuracy}m</div>`}
      <div class="grid" style="margin-top:16px"><div class="card stat"><div><span>今天打卡次數</span><br><strong>${es.length}</strong></div><span>次</span></div><div class="card stat"><div><span>我的本月排班</span><br><strong>${state.shifts.filter(x=>x.employeeId===state.me.employeeId && x.status!=='CANCELLED' && dateKey(x.startAt).slice(0,7)===nowKey().slice(0,7)).length}</strong></div><span>班</span></div></div>
      <div class="section-title"><h2>本週排班</h2><span class="subtitle">台灣時間</span></div>${week()}
      <div class="section-title"><h2>今日打卡紀錄</h2><button class="btn small outline" data-pagego="attendance">全部紀錄 →</button></div><section class="card">${es.length?es.slice().reverse().map(e=>asItem(e.kind==='IN'?'上班打卡':'下班打卡',e.source==='GPS_LIFF'?'GPS 定位成功':'主管核准補卡',`<strong>${tTime(e.effectiveAt)}</strong>`)).join(''):'<p class="subtle">今天尚無打卡紀錄。</p>'}</section>`;
  }
  function week(){const today=nowKey(),dt=new Date(today+'T00:00:00+08:00'),dow=(new Date(today+'T12:00:00+08:00').getUTCDay()+6)%7,monday=new Date(dt.getTime()-dow*86400000);const own=state.shifts.filter(s=>s.employeeId===state.me.employeeId&&s.status!=='CANCELLED');
    return `<div class="week">${Array.from({length:7},(_,i)=>{const day=new Date(monday.getTime()+i*86400000),key=dateKey(day),sh=own.find(s=>dateKey(s.startAt)===key);return `<div class="day ${today===key?'today':''} ${!sh?'off':''}"><small>${['一','二','三','四','五','六','日'][i]}</small><b>${Number(key.slice(-2))}</b><em>${sh?tTime(sh.startAt):'休'}</em></div>`;}).join('')}</div>`;
  }
  function schedule(){const list=state.shifts.filter(s=>s.employeeId===state.me.employeeId&&s.status!=='CANCELLED').sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));
    return `${header('我的班表','查看已安排的班別與未來工作時間。')}${week()}<div class="section-title"><h2>班表明細</h2></div><section class="card">${list.length?list.map(s=>asItem(`${tDate(s.startAt)} ${tTime(s.startAt)} – ${tTime(s.endAt)}`,s.status==='DRAFT'?'草稿（尚未正式發布）':'已發布',`<span class="tag">${s.status==='PUBLISHED'?'正式':'草稿'}</span>`)).join(''):'<p class="subtle">目前沒有近期班表。</p>'}</section><div class="notice">所有班表與時間皆以台灣時間顯示。發布後的班表才視為正式班表。</div>`;
  }
  function attendance(){const items=myEvents().slice().reverse().slice(0,80),cs=state.corrections.filter(c=>c.employeeId===state.me.employeeId).slice().reverse();
    return `${header('出勤與補卡','每一筆正式出勤與調整紀錄，都有完整歷程。')}<div class="grid"><button class="btn primary" data-clock="IN">◎ GPS 上班打卡</button><button class="btn outline" data-clock="OUT">◷ GPS 下班打卡</button></div>
    <div class="section-title"><h2>近期出勤</h2><span class="subtitle">最近 32 天</span></div><section class="card">${items.length?items.map(e=>asItem(e.kind==='IN'?'● 上班':'○ 下班',`${tDate(e.effectiveAt)} · ${e.source==='GPS_LIFF'?'GPS':'補卡核准'}`,`<strong>${tTime(e.effectiveAt)}</strong>`)).join(''):'<p class="subtle">尚無出勤紀錄。</p>'}</section>
    <div class="section-title"><h2>忘記打卡申請</h2></div><section class="card stack"><div class="notice">若遇到 GPS 定位失敗，請先重新定位；確實無法打卡時才提出補卡申請。</div><form id="correction" class="stack"><div class="form-grid"><div class="field"><label for="corr-kind">補卡種類</label><select id="corr-kind"><option value="IN">上班</option><option value="OUT">下班</option></select></div><div class="field"><label for="corr-time">實際出勤時間（台灣時間）</label><input required id="corr-time" type="datetime-local"></div></div><div class="field"><label for="corr-reason">補卡原因</label><textarea required minlength="5" maxlength="300" id="corr-reason" placeholder="請描述為何無法正常打卡"></textarea></div><button class="btn primary" type="submit">送出補卡申請</button></form>${cs.length?'<h3>我的申請紀錄</h3>'+cs.map(c=>asItem(`${c.kind==='IN'?'上班':'下班'} · ${tDate(c.requestedAt)} ${tTime(c.requestedAt)}`,text(c.reason),`<span class="tag">${({PENDING:'待審核',APPROVED:'已核准',REJECTED:'已退回'})[c.status]||c.status}</span>`)).join(''):''}</section>`;
  }
  function admin(){const site=state.worksite,staff=state.employees||[],pending=state.corrections.filter(c=>c.status==='PENDING'),all=state.shifts.slice().sort((a,b)=>new Date(a.startAt)-new Date(b.startAt)),name=id=>(staff.find(x=>x.employeeId===id)||{}).name||id;
    return `${header('管理工作台','員工 · 排班 · 補卡審核 · 據點管理')}
      <div class="grid three"><div class="card stat"><div><span>啟用員工</span><br><strong>${staff.filter(x=>x.enabled).length}</strong></div></div><div class="card stat"><div><span>待審補卡</span><br><strong>${pending.length}</strong></div></div><div class="card stat"><div><span>近期班表</span><br><strong>${all.length}</strong></div></div></div>
      <div class="section-title"><h2>GPS 工作據點</h2></div><section class="card stack"><div><strong>${safe(site.name)}</strong><p class="subtle">${safe(site.address)}</p><span class="pill ${site.latitude===null?'warn':'good'}">${site.latitude===null?'尚未校準 GPS':'已完成 GPS 校準'}</span></div>${site.latitude!==null?`<p class="mono">座標 ${site.latitude.toFixed(6)}, ${site.longitude.toFixed(6)}</p>`:''}<div class="notice">請管理者親自在工作室中心點操作。定位誤差須 ≤ 60 公尺。第一次校準後，員工才能打卡。</div><div class="form-grid"><div class="field"><label>允許打卡半徑（公尺）</label><input type="number" id="site-radius" min="50" max="300" value="${site.radius}"></div><div class="field"><label>最大定位誤差（公尺）</label><input type="number" id="site-accuracy" min="20" max="150" value="${site.maxAccuracy}"></div></div><button class="btn primary" id="calibrate">📍 用我現在的位置校準工作室</button></section>
      <div class="section-title"><h2>新增員工</h2></div><section class="card"><form id="employee-form" class="stack"><div class="form-grid"><div class="field"><label>員工姓名</label><input required id="emp-name" maxlength="80" placeholder="員工名稱"></div><div class="field"><label>身分權限</label><select id="emp-role"><option value="STAFF">一般員工</option><option value="ADMIN">管理者</option></select></div></div><div class="field"><label>LINE User ID（員工首次登入畫面可複製）</label><input required id="emp-uid" pattern="U[0-9a-fA-F]{32}" placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"></div><button class="btn primary" type="submit">新增員工</button></form></section>
      <div class="section-title"><h2>建立班表</h2></div><section class="card"><form id="shift-form" class="stack"><div class="field"><label>員工</label><select id="shift-emp">${staff.filter(x=>x.enabled).map(x=>`<option value="${safe(x.employeeId)}">${safe(x.name)}</option>`).join('')}</select></div><div class="form-grid"><div class="field"><label>開始（台灣時間）</label><input required id="shift-start" type="datetime-local"></div><div class="field"><label>結束（台灣時間）</label><input required id="shift-end" type="datetime-local"></div></div><button class="btn primary" type="submit">新增班表草稿</button></form><p class="help">可建立跨日班；同一員工班表不得重疊。草稿發布後才正式通知。</p><button class="btn outline full" id="publish">發布未來 35 天的所有班表草稿</button></section>
      <div class="section-title"><h2>近期全員班表</h2></div><section class="card">${all.length?all.map(s=>asItem(`${safe(name(s.employeeId))} · ${tDate(s.startAt)}`,`${tTime(s.startAt)} – ${tTime(s.endAt)} · ${s.status}`,`<button class="btn small danger" data-cancel="${safe(s.id)}">取消</button>`)).join(''):'<p class="subtle">尚無排班資料。</p>'}</section>
      <div class="section-title"><h2>待審補卡</h2></div><section class="card">${pending.length?pending.map(c=>`<div class="list-item"><div><div class="title">${safe(name(c.employeeId))} · ${c.kind==='IN'?'上班':'下班'} · ${tDate(c.requestedAt)} ${tTime(c.requestedAt)}</div><small>${safe(c.reason)}</small></div><div class="actions"><button class="btn small primary" data-review="${safe(c.id)}" data-approve="true">核准</button><button class="btn small outline" data-review="${safe(c.id)}" data-approve="false">退回</button></div></div>`).join(''):'<p class="subtle">目前沒有待審核的補卡申請。</p>'}</section>
      <div class="section-title"><h2>匯出出勤紀錄</h2></div><section class="card stack"><div class="form-grid"><div class="field"><label>開始日期</label><input id="export-from" type="date" value="${nowKey().slice(0,7)}-01"></div><div class="field"><label>結束日期</label><input id="export-to" type="date" value="${nowKey()}"></div></div><button class="btn outline" id="export">下載出勤 CSV（Excel 可開啟）</button><p class="help">匯出員工、上/下班、時間及來源。尚未包含薪資與加班核算。</p></section>`;
  }
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
      showToast((kind==='IN'?'上班':'下班')+'打卡成功！');state=await api('bootstrap');render();
    }catch(e){
      if(['STALE_GPS','LOW_GPS_ACCURACY','OUTSIDE_WORKSITE','BAD_GPS','ALREADY_CLOCKED_IN','NOT_CLOCKED_IN'].includes(e.message)){try{sessionStorage.removeItem('guppyPendingClock');}catch{}}
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
  function bind(){
    root.querySelectorAll('[data-clock]').forEach(el=>el.onclick=()=>clock(el.dataset.clock));
    root.querySelectorAll('[data-pagego]').forEach(el=>el.onclick=()=>{page=el.dataset.pagego;render();});
    const correction=document.querySelector('#correction');if(correction)correction.onsubmit=e=>{e.preventDefault();mutate('requestCorrection',{kind:document.querySelector('#corr-kind').value,requestedAt:localISO(document.querySelector('#corr-time').value),reason:document.querySelector('#corr-reason').value},'補卡申請已送出');};
    const employee=document.querySelector('#employee-form');if(employee)employee.onsubmit=e=>{e.preventDefault();mutate('addEmployee',{uid:document.querySelector('#emp-uid').value.trim(),name:document.querySelector('#emp-name').value.trim(),role:document.querySelector('#emp-role').value},'員工已建立');};
    const shift=document.querySelector('#shift-form');if(shift)shift.onsubmit=e=>{e.preventDefault();mutate('createShift',{employeeId:document.querySelector('#shift-emp').value,startAt:localISO(document.querySelector('#shift-start').value),endAt:localISO(document.querySelector('#shift-end').value)},'班表草稿已建立');};
    const cal=document.querySelector('#calibrate');if(cal)cal.onclick=calibrate;
    const publish=document.querySelector('#publish');if(publish)publish.onclick=()=>confirm('確定發布未來 35 天的所有班表草稿嗎？')&&mutate('publishShifts',{},'班表已發布');
    root.querySelectorAll('[data-cancel]').forEach(el=>el.onclick=()=>confirm('確定取消此班別嗎？')&&mutate('cancelShift',{id:el.dataset.cancel},'班別已取消'));
    root.querySelectorAll('[data-review]').forEach(el=>el.onclick=()=>{const yes=el.dataset.approve==='true';if(confirm(yes?'確認核准補卡並新增人工打卡事件？':'確認退回此補卡申請？'))mutate('reviewCorrection',{id:el.dataset.review,approve:yes,note:''},yes?'已核准補卡':'已退回申請');});
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
