(function(){
  "use strict";

  var CATS = [
    {id:'elec', name:'ค่าไฟ', icon:'⚡'},
    {id:'water', name:'ค่าน้ำ', icon:'💧'},
    {id:'card', name:'ค่าบัตรเครดิต', icon:'💳'},
    {id:'rent', name:'ค่าคอนโด/ค่าเช่า', icon:'🏠'},
    {id:'net', name:'อินเทอร์เน็ต/มือถือ', icon:'📶'},
    {id:'ins', name:'ประกัน', icon:'🛡️'},
    {id:'other', name:'อื่นๆ', icon:'✨'}
  ];
  function catInfo(id){ return CATS.find(function(c){return c.id===id;}) || CATS[CATS.length-1]; }

  var ICON_PRESETS = ['⚡','💧','💳','🏠','📶','🛡️','🚗','⛽','🎓','🏥','💊','🛒','👕','🐾','🎮','📺','🎵','☕','🍔','🧾','✨'];

  function uid(){ return 'b' + Math.random().toString(36).slice(2,10); }

  function defaultState(){
    return {
      bills: [
        {id:uid(), category:'elec', name:'ค่าไฟ', amount:1200, dueDay:5, recurring:true, note:''},
        {id:uid(), category:'water', name:'ค่าน้ำ', amount:250, dueDay:5, recurring:true, note:''},
        {id:uid(), category:'card', name:'ค่าบัตรเครดิต', amount:3000, dueDay:20, recurring:true, note:''},
        {id:uid(), category:'rent', name:'ค่าคอนโด', amount:8000, dueDay:1, recurring:true, note:''}
      ],
      loans: [
        {id:uid(), name:'สินเชื่อตัวอย่าง', totalAmount:0, remaining:4500, monthlyPayment:4500, interestRate:0, dueDay:15, note:''}
      ],
      payments: {},
      loanPayments: {},
      savingsGoals: [],
      allocation: {debt:50,savings:30,spending:20},
      budget: null
    };
  }

  var supabaseClient = null;
  function getSupabaseClient(){
    if(supabaseClient) return supabaseClient;
    var config = window.SUPABASE_CONFIG || {};
    if(!config.url || !config.publishableKey || !window.supabase){
      throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ Supabase');
    }
    supabaseClient = window.supabase.createClient(config.url, config.publishableKey);
    return supabaseClient;
  }

  async function loadState(){
    var client = getSupabaseClient();
    var userResult = await client.auth.getUser();
    if(userResult.error || !userResult.data.user) throw userResult.error || new Error('กรุณาเข้าสู่ระบบ');
    var result = await client.from('jaiyung_user_state').select('data').eq('user_id', userResult.data.user.id).maybeSingle();
    if(result.error) throw result.error;
    var loaded = result.data ? result.data.data : null;
    if(!loaded || !Array.isArray(loaded.bills)){
      loaded = defaultState();
      state = loaded;
      await saveState();
    }
    if(!Array.isArray(loaded.loans)) loaded.loans = [];
    if(!loaded.payments) loaded.payments = {};
    if(!loaded.loanPayments) loaded.loanPayments = {};
    if(!Array.isArray(loaded.savingsGoals)) loaded.savingsGoals = [];
    if(!loaded.allocation) loaded.allocation = {debt:50,savings:30,spending:20};
    if(typeof loaded.budget === 'undefined') loaded.budget = null;
    return loaded;
  }

  var saveTimer = null;
  function saveState(){
    clearTimeout(saveTimer);
    return new Promise(function(resolve){
      saveTimer = setTimeout(async function(){
        try{
          var client = getSupabaseClient();
          var userResult = await client.auth.getUser();
          if(userResult.error || !userResult.data.user) throw userResult.error || new Error('กรุณาเข้าสู่ระบบ');
          var result = await client.from('jaiyung_user_state').upsert({
            user_id:userResult.data.user.id,
            data:state,
            updated_at:new Date().toISOString()
          });
          if(result.error) throw result.error;
        }catch(error){ alert('บันทึกข้อมูลไม่สำเร็จ: ' + error.message); }
        resolve();
      }, 120);
    });
  }

  var state = defaultState();

  var today = new Date();
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth(); // 0-11
  var activeTab = 'bills';

  var MONTH_NAMES = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  function monthKey(y,m){ return y + '-' + String(m+1).padStart(2,'0'); }
  function isLoanActiveInMonth(loan, year, month){
    return !loan.startMonth || loan.startMonth <= monthKey(year, month);
  }
  function loanPaymentForMonth(loan, year, month){
    var overrides = loan.paymentOverrides || {};
    var override = Number(overrides[monthKey(year,month)]);
    return Number.isFinite(override) && override>0 ? override : Number(loan.monthlyPayment||0);
  }
  function parsePaymentSchedule(text){
    var result={};
    String(text||'').split(/\r?\n/).forEach(function(line){
      var match=line.trim().match(/^(\d{4}-(?:0[1-9]|1[0-2]))\s*=\s*([\d,.]+)$/);
      if(match){ var amount=Number(match[2].replace(/,/g,'')); if(amount>0) result[match[1]]=amount; }
    });
    return result;
  }
  function formatPaymentSchedule(overrides){
    return Object.keys(overrides||{}).sort().map(function(key){return key+' = '+Number(overrides[key]);}).join('\n');
  }
  function simulateDebtPayoff(sourceLoans,extraMonthly,windfall){
    var debts=sourceLoans.filter(function(l){return Number(l.remaining||0)>0;}).map(function(l){return {remaining:Number(l.remaining||0),payment:Number(l.monthlyPayment||0),rate:Number(l.interestRate||0),fee:Number(l.prepaymentFee||0)};});
    debts.sort(function(a,b){return b.rate-a.rate||a.remaining-b.remaining;});
    var initialMinimum=debts.reduce(function(s,d){return s+d.payment;},0);
    var cash=Math.max(0,Number(windfall)||0), totalInterest=0, months=0;
    while(cash>0&&debts.some(function(d){return d.remaining>0;})){
      var target=debts.find(function(d){return d.remaining>0;});
      var applied=Math.min(cash,target.remaining); target.remaining-=applied; cash-=applied;
    }
    while(debts.some(function(d){return d.remaining>.01;})&&months<1200){
      months++;
      var available=initialMinimum+Math.max(0,Number(extraMonthly)||0);
      debts.forEach(function(d){
        if(d.remaining<=.01)return;
        var interest=d.remaining*d.rate/1200; totalInterest+=interest;
        var due=Math.min(d.payment,d.remaining+interest,available);
        d.remaining=Math.max(0,d.remaining-Math.max(0,due-interest)); available-=due;
      });
      debts.sort(function(a,b){return (b.remaining>0?b.rate:-1)-(a.remaining>0?a.rate:-1)||a.remaining-b.remaining;});
      while(available>.01){
        var focus=debts.find(function(d){return d.remaining>.01;}); if(!focus)break;
        var extra=Math.min(available,focus.remaining); focus.remaining-=extra; available-=extra;
      }
      if(initialMinimum+Number(extraMonthly||0)<=0)break;
    }
    return {months:months,totalInterest:totalInterest,complete:!debts.some(function(d){return d.remaining>.01;})};
  }
  function debtTimeline(sourceLoans,extraMonthly,windfall){
    var debts=sourceLoans.filter(function(l){return Number(l.remaining||0)>0;}).map(function(l){return {remaining:Number(l.remaining||0),payment:Number(l.monthlyPayment||0),rate:Number(l.interestRate||0)};}).sort(function(a,b){return b.rate-a.rate;});
    var monthlyBudget=debts.reduce(function(s,d){return s+d.payment;},0)+Math.max(0,Number(extraMonthly)||0),cash=Math.max(0,Number(windfall)||0);
    while(cash>0){var first=debts.find(function(d){return d.remaining>0;});if(!first)break;var used=Math.min(cash,first.remaining);first.remaining-=used;cash-=used;}
    var values=[debts.reduce(function(s,d){return s+d.remaining;},0)];
    for(var month=0;month<360&&values[values.length-1]>.01;month++){
      var available=monthlyBudget;
      debts.forEach(function(d){if(d.remaining<=0)return;var interest=d.remaining*d.rate/1200,due=Math.min(d.payment,d.remaining+interest,available);d.remaining=Math.max(0,d.remaining-Math.max(0,due-interest));available-=due;});
      debts.sort(function(a,b){return (b.remaining>0?b.rate:-1)-(a.remaining>0?a.rate:-1);});
      while(available>.01){var target=debts.find(function(d){return d.remaining>.01;});if(!target)break;var extra=Math.min(available,target.remaining);target.remaining-=extra;available-=extra;}
      values.push(debts.reduce(function(s,d){return s+d.remaining;},0));
      if(monthlyBudget<=0)break;
    }
    return values;
  }
  function debtLineChartHtml(loans,extra,windfall){
    var all=debtTimeline(loans,extra,windfall),step=Math.max(1,Math.ceil((all.length-1)/24)),values=all.filter(function(_,index){return index%step===0||index===all.length-1;}),width=320,height=145,pad=12,max=Math.max(1,values[0]),last=values.length-1;
    var points=values.map(function(value,index){return {x:pad+(width-pad*2)*(last?index/last:0),y:pad+(height-pad*2)*(1-value/max)};});
    var line=points.map(function(p){return p.x.toFixed(1)+','+p.y.toFixed(1);}).join(' '),area=pad+','+(height-pad)+' '+line+' '+(width-pad)+','+(height-pad);
    return '<div class="debt-line-chart"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="กราฟยอดหนี้คงเหลือตามเดือน"><line class="chart-grid" x1="12" y1="12" x2="308" y2="12"/><line class="chart-grid" x1="12" y1="72" x2="308" y2="72"/><line class="chart-grid" x1="12" y1="133" x2="308" y2="133"/><polygon class="chart-area" points="'+area+'"/><polyline class="chart-line" points="'+line+'"/><circle class="chart-dot" cx="'+points[points.length-1].x+'" cy="'+points[points.length-1].y+'" r="4"/></svg><div class="chart-labels"><span>วันนี้ · '+fmtBaht(all[0])+'</span><span>'+(all.length-1)+' เดือน · '+fmtBaht(all[all.length-1])+'</span></div></div>';
  }
  function monthsUntil(dateValue){
    if(!dateValue)return null; var target=new Date(dateValue+'T00:00:00');
    return Math.max(1,(target.getFullYear()-today.getFullYear())*12+target.getMonth()-today.getMonth());
  }
  function daysInMonth(y,m){ return new Date(y, m+1, 0).getDate(); }
  function fmtBaht(n){
    n = Math.round(n||0);
    return '฿' + n.toLocaleString('th-TH');
  }

  function loanProjection(loan){
    var principal = Math.max(0, Number(loan.remaining)||0);
    var payment = Math.max(0, Number(loan.monthlyPayment)||0);
    var annualRate = Math.max(0, Number(loan.interestRate)||0);
    var monthlyRate = annualRate / 1200;
    var nextInterest = principal * monthlyRate;
    if(principal<=0) return {months:0, nextInterest:0, totalInterest:0, payable:true};
    if(payment<=0) return {months:null, nextInterest:nextInterest, totalInterest:null, payable:false};
    if(monthlyRate<=0){
      var zeroMonths = Math.ceil(principal/payment);
      return {months:zeroMonths, nextInterest:0, totalInterest:0, payable:true};
    }
    if(payment<=nextInterest) return {months:null, nextInterest:nextInterest, totalInterest:null, payable:false};
    var months = Math.ceil(-Math.log(1-(monthlyRate*principal/payment))/Math.log(1+monthlyRate));
    var balance = principal;
    var totalInterest = 0;
    for(var i=0;i<months && balance>0;i++){
      var interest = balance*monthlyRate;
      var actualPayment = Math.min(payment, balance+interest);
      totalInterest += interest;
      balance = Math.max(0, balance-(actualPayment-interest));
    }
    return {months:months, nextInterest:nextInterest, totalInterest:totalInterest, payable:true};
  }

  function loanPaymentBreakdown(loan, amount){
    var remaining = Math.max(0, Number(loan.remaining)||0);
    var interest = remaining * (Math.max(0, Number(loan.interestRate)||0) / 1200);
    var paid = Math.max(0, Number(amount)||0);
    return {interest:Math.min(paid, interest), principal:Math.min(remaining, Math.max(0, paid-interest))};
  }

  function isCurrentMonth(){
    return viewYear===today.getFullYear() && viewMonth===today.getMonth();
  }
  function isPastMonth(){
    return (viewYear<today.getFullYear()) || (viewYear===today.getFullYear() && viewMonth<today.getMonth());
  }

  function getPayment(store, billId){
    var mk = monthKey(viewYear, viewMonth);
    var m = store[mk];
    return m ? m[billId] : null;
  }
  function setPayment(store, billId, data){
    var mk = monthKey(viewYear, viewMonth);
    if(!store[mk]) store[mk] = {};
    if(data === null){
      delete store[mk][billId];
    } else {
      store[mk][billId] = data;
    }
    saveState();
  }

  function dueDateFor(dueDay){
    var dim = daysInMonth(viewYear, viewMonth);
    var day = Math.min(dueDay, dim);
    return new Date(viewYear, viewMonth, day);
  }

  function dueText(r){
    if(r.paid) return 'ครบกำหนดวันที่ ' + r.due.getDate() + ' ' + MONTH_NAMES[r.due.getMonth()];
    if(r.diffDays === 0) return 'ครบกำหนดวันนี้';
    if(r.diffDays > 0) return 'อีก ' + r.diffDays + ' วัน · วันที่ ' + r.due.getDate() + ' ' + MONTH_NAMES[r.due.getMonth()];
    return 'เลยกำหนดมา ' + Math.abs(r.diffDays) + ' วัน';
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function computeRow(item, dueDay, pay){
    var todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var paid = !!(pay && pay.paid);
    var due = dueDateFor(dueDay);
    var diffDays = Math.round((due - todayMid) / 86400000);
    var status = 'upcoming';
    if(!paid){
      if(isCurrentMonth()){
        if(diffDays < 0) status = 'overdue';
        else if(diffDays <= 3) status = 'soon';
      } else if(isPastMonth()){
        status = 'overdue';
      }
    }
    return {item:item, pay:pay, paid:paid, due:due, diffDays:diffDays, status:status};
  }

  /* ---------- TABS ---------- */
  function setTab(tab){
    activeTab = tab;
    document.getElementById('tabBills').classList.toggle('active', tab==='bills');
    document.getElementById('tabLoans').classList.toggle('active', tab==='loans');
    document.getElementById('tabCalendar').classList.toggle('active', tab==='calendar');
    document.getElementById('tabSavings').classList.toggle('active', tab==='savings');
    document.getElementById('tabSummary').classList.toggle('active', tab==='summary');
    document.getElementById('billsHero').style.display = tab==='bills' ? 'flex' : 'none';
    document.getElementById('loansHero').style.display = tab==='loans' ? 'flex' : 'none';
    document.getElementById('monthNav').style.display = (tab==='bills'||tab==='loans'||tab==='calendar'||tab==='summary') ? 'flex' : 'none';
    document.getElementById('addBtn').style.display = (tab==='bills'||tab==='loans'||tab==='savings') ? '' : 'none';
    render();
  }
  document.getElementById('tabBills').addEventListener('click', function(){ setTab('bills'); });
  document.getElementById('tabLoans').addEventListener('click', function(){ setTab('loans'); });
  document.getElementById('tabCalendar').addEventListener('click', function(){ setTab('calendar'); });
  document.getElementById('tabSavings').addEventListener('click', function(){ setTab('savings'); });
  document.getElementById('tabSummary').addEventListener('click', function(){ setTab('summary'); });

  /* ---------- RENDER ---------- */
  function render(){
    document.getElementById('monthLabel').textContent = MONTH_NAMES[viewMonth] + ' ' + (viewYear+543);
    renderOverallStatus();
    if(activeTab==='bills') renderBills();
    else if(activeTab==='loans') renderLoans();
    else if(activeTab==='calendar') renderCalendar();
    else if(activeTab==='savings') renderSavings();
    else renderDebtSummary();
  }

  function renderOverallStatus(){
    var rows=[];
    state.bills.forEach(function(item){rows.push(computeRow(item,item.dueDay,getPayment(state.payments,item.id)));});
    state.loans.filter(function(item){return isLoanActiveInMonth(item,viewYear,viewMonth);}).forEach(function(item){rows.push(computeRow(item,item.dueDay,getPayment(state.loanPayments,item.id)));});
    var paid=rows.filter(function(row){return row.paid;}).length;
    var overdue=rows.filter(function(row){return row.status==='overdue';}).length;
    var waiting=Math.max(0,rows.length-paid-overdue),total=Math.max(1,rows.length);
    document.getElementById('overallStatus').innerHTML='<div class="overall-status-head"><strong>สถานะรวม '+rows.length+' รายการ</strong><span>จ่ายแล้ว '+paid+' · รอจ่าย '+waiting+' · เลยกำหนด '+overdue+'</span></div><div class="status-track" aria-label="จ่ายแล้ว '+paid+' รอจ่าย '+waiting+' เลยกำหนด '+overdue+'"><i class="status-paid" style="width:'+(paid/total*100)+'%"></i><i class="status-wait" style="width:'+(waiting/total*100)+'%"></i><i class="status-overdue" style="width:'+(overdue/total*100)+'%"></i></div>';
  }

  function renderDashboard(){
    var listArea=document.getElementById('listArea'),now=new Date(),year=now.getFullYear(),month=now.getMonth(),todayMid=new Date(year,month,now.getDate()),items=[];
    state.bills.forEach(function(bill){var pay=(state.payments[monthKey(year,month)]||{})[bill.id];if(pay&&pay.paid)return;var due=new Date(year,month,Math.min(bill.dueDay,daysInMonth(year,month)));items.push({type:'bill',name:bill.name,due:due,diff:Math.round((due-todayMid)/86400000),amount:bill.amount});});
    state.loans.filter(function(loan){return isLoanActiveInMonth(loan,year,month);}).forEach(function(loan){var pay=(state.loanPayments[monthKey(year,month)]||{})[loan.id];if(pay&&pay.paid)return;var due=new Date(year,month,Math.min(loan.dueDay,daysInMonth(year,month)));items.push({type:'loan',name:loan.name,due:due,diff:Math.round((due-todayMid)/86400000),amount:loanPaymentForMonth(loan,year,month)});});
    items.sort(function(a,b){return a.diff-b.diff;});
    var urgent=items.filter(function(item){return item.diff<=7;}).slice(0,3),focus=state.loans.filter(function(l){return Number(l.remaining||0)>0;}).sort(function(a,b){return Number(b.interestRate||0)-Number(a.interestRate||0);})[0];
    var alerts=urgent.length?urgent.map(function(item){var when=item.diff<0?'เลยกำหนด '+Math.abs(item.diff)+' วัน':item.diff===0?'ครบกำหนดวันนี้':'อีก '+item.diff+' วัน';return '<div class="today-alert"><div class="alert-icon">'+(item.type==='loan'?'🏦':'🧾')+'</div><div class="alert-main"><strong>'+escapeHtml(item.name)+'</strong><small>'+when+' · วันที่ '+item.due.getDate()+'</small></div><div class="alert-amount">'+fmtBaht(item.amount)+'</div></div>';}).join(''):'<div class="empty" style="padding:18px">ไม่มีรายการใกล้ครบกำหนดใน 7 วัน 🎉</div>';
    var focusHtml=focus?'<div class="focus-debt"><div class="section-kicker">เป้าหมายโปะอันดับ 1</div><h3>'+escapeHtml(focus.name)+(focus.bank?' · '+escapeHtml(focus.bank):'')+'</h3><div class="rate">'+Number(focus.interestRate||0).toLocaleString('th-TH',{maximumFractionDigits:2})+'% <small style="font-size:11px">ต่อปี</small></div><div class="reason">คงเหลือ '+fmtBaht(focus.remaining)+' · ดอกประมาณ '+fmtBaht(Number(focus.remaining||0)*Number(focus.interestRate||0)/1200)+'/เดือน</div></div>':'<div class="empty" style="padding:18px">ไม่มีหนี้คงเหลือ 🎉</div>';
    var billsPlanned=state.bills.reduce(function(sum,b){return sum+Number(b.amount||0);},0),loansPlanned=state.loans.filter(function(l){return isLoanActiveInMonth(l,year,month);}).reduce(function(sum,l){return sum+loanPaymentForMonth(l,year,month);},0),left=state.budget===null?null:Math.max(0,Number(state.budget)-billsPlanned-loansPlanned),allocation=state.allocation||{debt:50,savings:30,spending:20};
    var allocationHtml=left===null?'<div class="empty" style="padding:18px">ตั้งรายรับต่อเดือนใน ⚙️ เพื่อให้ระบบจัดสรรเงินอัตโนมัติ</div>':'<div class="allocation-wrap"><div class="allocation-donut" style="background:conic-gradient(var(--coral) 0 '+allocation.debt+'%,var(--mint) '+allocation.debt+'% '+(allocation.debt+allocation.savings)+'%,var(--mustard) '+(allocation.debt+allocation.savings)+'% 100%)"></div><div class="allocation-list"><div class="allocation-row"><span><i style="background:var(--coral)"></i>โปะหนี้ '+allocation.debt+'%</span><strong>'+fmtBaht(left*allocation.debt/100)+'</strong></div><div class="allocation-row"><span><i style="background:var(--mint)"></i>ออม '+allocation.savings+'%</span><strong>'+fmtBaht(left*allocation.savings/100)+'</strong></div><div class="allocation-row"><span><i style="background:var(--mustard)"></i>ใช้จ่าย '+allocation.spending+'%</span><strong>'+fmtBaht(left*allocation.spending/100)+'</strong></div><div class="reason">เงินเหลือหลังบิลและค่างวด '+fmtBaht(left)+'</div></div></div>';
    listArea.innerHTML='<div class="dashboard-welcome"><h2>วันนี้ต้องรู้อะไรบ้าง 👋</h2><p>'+now.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</p></div><div class="debt-summary-card"><div class="section-title-row"><h3>ใกล้ครบกำหนด</h3><span class="recommended-pill">'+urgent.length+' รายการ</span></div>'+alerts+'</div><div class="debt-summary-card"><h3>จัดสรรเงินเดือนนี้</h3>'+allocationHtml+'</div><div class="debt-summary-card"><h3>ควรโปะก้อนไหนก่อน</h3>'+focusHtml+'</div>';
  }

  function renderSavings(){
    var listArea=document.getElementById('listArea'),goals=state.savingsGoals||[];
    if(!goals.length){listArea.innerHTML='<div class="dashboard-welcome"><h2>เป้าหมายการออม 💰</h2><p>สร้างเงินฉุกเฉิน เงินดาวน์ หรือเป้าหมายสำคัญ</p></div><div class="empty"><span class="em-emoji">🌱</span>ยังไม่มีเป้าหมาย กด + เพื่อเริ่มออม</div>';return;}
    listArea.innerHTML='<div class="dashboard-welcome"><h2>เป้าหมายการออม 💰</h2><p>'+goals.length+' เป้าหมาย · ออมแล้ว '+fmtBaht(goals.reduce(function(s,g){return s+Number(g.current||0);},0))+'</p></div>'+goals.map(function(goal){var pct=Math.min(100,Math.round(Number(goal.current||0)/Math.max(1,Number(goal.target||0))*100)),remaining=Math.max(0,Number(goal.target||0)-Number(goal.current||0)),months=monthsUntil(goal.targetDate),perMonth=months?Math.ceil(remaining/months):null;return '<div class="saving-card" data-saving-id="'+goal.id+'"><div class="saving-head"><div class="saving-icon">🎯</div><div class="saving-main"><h3>'+escapeHtml(goal.name)+'</h3><div class="reason">'+fmtBaht(goal.current)+' จาก '+fmtBaht(goal.target)+' · '+pct+'%</div></div><strong>'+fmtBaht(remaining)+'</strong></div><div class="loan-progress"><div class="fill" style="width:'+pct+'%;background:var(--mint)"></div></div><div class="loan-progress-label">'+(perMonth?'ควรออม '+fmtBaht(perMonth)+'/เดือน เพื่อให้ทัน '+goal.targetDate:'เหลืออีก '+fmtBaht(remaining))+'</div><div class="saving-actions"><button class="saving-deposit" data-saving-deposit="'+goal.id+'">+ บันทึกเงินออม</button><button class="saving-edit" data-saving-edit="'+goal.id+'">แก้ไข</button></div></div>';}).join('');
    listArea.querySelectorAll('[data-saving-deposit]').forEach(function(button){button.addEventListener('click',function(){var goal=state.savingsGoals.find(function(g){return g.id===button.dataset.savingDeposit;});var amount=Number(prompt('เดือนนี้ออมเพิ่มเท่าไร?',0));if(!goal||!amount||amount<0)return;goal.current=Math.min(Number(goal.target||0),Number(goal.current||0)+amount);goal.deposits=goal.deposits||[];goal.deposits.push({amount:amount,at:new Date().toISOString()});saveState();renderSavings();});});
    listArea.querySelectorAll('[data-saving-edit]').forEach(function(button){button.addEventListener('click',function(){var goal=state.savingsGoals.find(function(g){return g.id===button.dataset.savingEdit;});if(goal)openEditSavingSheet(goal);});});
  }

  function renderCalendar(){
    var listArea=document.getElementById('listArea'),firstDay=new Date(viewYear,viewMonth,1).getDay(),count=daysInMonth(viewYear,viewMonth),events={};
    function addEvent(day,event){if(!events[day])events[day]=[];events[day].push(event);}
    state.bills.forEach(function(b){addEvent(Math.min(b.dueDay,count),{name:b.name,type:'bill'});});
    state.loans.filter(function(l){return isLoanActiveInMonth(l,viewYear,viewMonth);}).forEach(function(l){addEvent(Math.min(l.dueDay,count),{name:l.name,type:'loan'});});
    var cells='';for(var blank=0;blank<firstDay;blank++)cells+='<div class="calendar-day muted"></div>';
    for(var day=1;day<=count;day++){var isToday=isCurrentMonth()&&today.getDate()===day;cells+='<div class="calendar-day'+(isToday?' today':'')+'" data-calendar-day="'+day+'" role="button" tabindex="0"><div class="calendar-number">'+day+'</div>'+((events[day]||[]).map(function(event){return '<div class="calendar-event is-'+event.type+'" title="'+escapeHtml(event.name)+'">'+escapeHtml(event.name)+'</div>';}).join(''))+'</div>';}
    var labels=['อา','จ','อ','พ','พฤ','ศ','ส'].map(function(label){return '<div class="calendar-weekday">'+label+'</div>';}).join('');
    listArea.innerHTML='<div class="debt-summary-card"><div class="section-title-row"><div><div class="section-kicker">CALENDAR</div><h3>วันครบกำหนดทั้งหมด</h3></div></div><div class="calendar-legend"><span><i class="legend-dot"></i>บิล</span><span><i class="legend-dot loan"></i>สินเชื่อ</span></div><div class="calendar-grid">'+labels+cells+'</div></div>';
    listArea.querySelectorAll('[data-calendar-day]').forEach(function(cell){
      function open(){openCalendarDay(Number(cell.dataset.calendarDay));}
      cell.addEventListener('click',open);
      cell.addEventListener('keydown',function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
  }

  function openCalendarDay(day){
    var items=[];
    state.bills.forEach(function(bill){if(Math.min(bill.dueDay,daysInMonth(viewYear,viewMonth))!==day)return;var row=computeRow(bill,bill.dueDay,getPayment(state.payments,bill.id));items.push({type:'bill',item:bill,row:row,amount:row.paid?Number(row.pay.amount||bill.amount):Number(bill.amount||0)});});
    state.loans.filter(function(loan){return isLoanActiveInMonth(loan,viewYear,viewMonth);}).forEach(function(loan){if(Math.min(loan.dueDay,daysInMonth(viewYear,viewMonth))!==day)return;var row=computeRow(loan,loan.dueDay,getPayment(state.loanPayments,loan.id));items.push({type:'loan',item:loan,row:row,amount:row.paid?Number(row.pay.amount||0):loanPaymentForMonth(loan,viewYear,viewMonth)});});
    document.getElementById('calendarDayTitle').textContent=day+' '+MONTH_NAMES[viewMonth]+' '+(viewYear+543);
    document.getElementById('calendarDayContent').innerHTML=items.length?items.map(function(entry){var item=entry.item,row=entry.row,status=row.paid?'จ่ายแล้ว':row.status==='overdue'?'เลยกำหนด':row.status==='soon'?'ใกล้ครบกำหนด':'รอจ่าย';return '<button class="calendar-detail-item '+entry.type+'" data-calendar-type="'+entry.type+'" data-calendar-id="'+item.id+'"><span class="calendar-detail-icon">'+(entry.type==='loan'?'🏦':(item.icon||catInfo(item.category).icon))+'</span><span class="calendar-detail-main"><strong>'+escapeHtml(item.name)+'</strong><small>'+status+(entry.type==='loan'&&item.bank?' · '+escapeHtml(item.bank):'')+(item.note?' · '+escapeHtml(item.note):'')+'</small></span><span class="calendar-detail-money">'+fmtBaht(entry.amount)+'</span></button>';}).join(''):'<div class="empty"><span class="em-emoji">📭</span>วันนี้ไม่มีรายการครบกำหนด</div>';
    document.getElementById('calendarDayContent').querySelectorAll('[data-calendar-id]').forEach(function(button){button.addEventListener('click',function(){var type=button.dataset.calendarType,id=button.dataset.calendarId;document.getElementById('calendarDayOverlay').classList.remove('show');if(type==='loan'){var loan=state.loans.find(function(item){return item.id===id;});if(loan)openLoanDetailSheet(loan);}else{var bill=state.bills.find(function(item){return item.id===id;});if(bill)openEditBillSheet(bill);}});});
    document.getElementById('calendarDayOverlay').classList.add('show');
  }

  document.getElementById('closeCalendarDay').addEventListener('click',function(){document.getElementById('calendarDayOverlay').classList.remove('show');});
  document.getElementById('calendarDayOverlay').addEventListener('click',function(event){if(event.target===this)this.classList.remove('show');});

  function billSparklineHtml(bill){
    var values=[];
    for(var offset=5;offset>=0;offset--){
      var date=new Date(viewYear,viewMonth-offset,1),pay=(state.payments[monthKey(date.getFullYear(),date.getMonth())]||{})[bill.id];
      values.push(pay&&pay.paid?Number(pay.amount||0):null);
    }
    var known=values.filter(function(value){return value!==null;});
    if(known.length<2)return '<div class="bill-spark-empty">ยังไม่มีประวัติพอสำหรับกราฟ</div>';
    var min=Math.min.apply(null,known),max=Math.max.apply(null,known),range=Math.max(1,max-min),points=[];
    values.forEach(function(value,index){if(value!==null)points.push((index*20)+','+(24-(value-min)/range*20));});
    return '<div class="bill-spark"><svg viewBox="0 0 100 28" role="img" aria-label="ยอดย้อนหลัง 6 เดือน"><polyline points="'+points.join(' ')+'"/></svg><span>6 เดือน</span></div>';
  }

  function renderBills(){
    var bills = state.bills;
    var rows = bills.map(function(b){
      return computeRow(b, b.dueDay, getPayment(state.payments, b.id));
    });

    var unpaidRows = rows.filter(function(r){return !r.paid;}).sort(function(a,b){return a.due-b.due;});
    var paidRows = rows.filter(function(r){return r.paid;}).sort(function(a,b){return a.due-b.due;});

    var paidTotal = paidRows.reduce(function(s,r){return s + Number((r.pay && r.pay.amount) || r.item.amount || 0);},0);
    var remainTotal = unpaidRows.reduce(function(s,r){return s + Number(r.item.amount||0);},0);
    var pct = (paidTotal+remainTotal)>0 ? Math.round((paidTotal/(paidTotal+remainTotal))*100) : 0;

    document.getElementById('paidVal').textContent = fmtBaht(paidTotal);
    document.getElementById('remainVal').textContent = fmtBaht(remainTotal);
    document.getElementById('pctText').textContent = pct + '%';

    var circumference = 2*Math.PI*44;
    var ring = document.getElementById('ringProgress');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - (circumference * Math.min(pct,100)/100);

    var loansMonthlyTotal = state.loans.filter(function(l){return isLoanActiveInMonth(l,viewYear,viewMonth);}).reduce(function(s,l){return s+loanPaymentForMonth(l,viewYear,viewMonth);},0);

    if(state.budget){
      document.getElementById('budgetRow').style.display='flex';
      document.getElementById('budgetDiv').style.display='block';
      var left = Number(state.budget) - (paidTotal + remainTotal) - loansMonthlyTotal;
      var leftEl = document.getElementById('leftVal');
      leftEl.textContent = fmtBaht(left);
      leftEl.style.color = left < 0 ? 'var(--coral)' : 'var(--sky)';
      var daysLeft=isCurrentMonth()?daysInMonth(viewYear,viewMonth)-today.getDate()+1:(isPastMonth()?0:daysInMonth(viewYear,viewMonth));
      document.getElementById('dailyRow').style.display=daysLeft?'flex':'none';
      document.getElementById('dailySpendVal').textContent=daysLeft?fmtBaht(left/daysLeft):'—';
    } else {
      document.getElementById('budgetRow').style.display='none';
      document.getElementById('budgetDiv').style.display='none';
      document.getElementById('dailyRow').style.display='none';
    }

    var listArea = document.getElementById('listArea');
    listArea.innerHTML = '';

    if(bills.length===0){
      listArea.innerHTML = '<div class="empty"><span class="em-emoji">🧾</span>ยังไม่มีบิลเลย กดปุ่ม + เพื่อเพิ่มบิลแรกของคุณ</div>';
      return;
    }

    function makeBillEl(r){
      var bill = r.item;
      var ci = catInfo(bill.category);
      var icon = bill.icon || ci.icon;
      var el = document.createElement('div');
      el.className = 'bill' + (r.paid ? ' paid' : '');

      var badgeHtml = '';
      if(r.status==='overdue') badgeHtml = '<span class="badge overdue">เลยกำหนด</span>';
      else if(r.status==='soon') badgeHtml = '<span class="badge soon">ใกล้ครบกำหนด</span>';

      el.innerHTML =
        '<div class="bicon">'+icon+'</div>'+
        '<div class="binfo">'+
          '<div class="bname"><span class="'+(r.paid?'strike':'')+'">'+escapeHtml(bill.name)+'</span>'+badgeHtml+'</div>'+
          '<div class="bdue">'+dueText(r)+(bill.note? ' · '+escapeHtml(bill.note):'')+'</div>'+billSparklineHtml(bill)+
        '</div>'+
        '<div class="bactions">'+
          '<div class="bamt">'+fmtBaht(r.paid ? ((r.pay&&r.pay.amount)||bill.amount) : bill.amount)+'</div>'+
          '<button class="paybtn '+(r.paid?'paid':'unpaid')+'" data-action="toggle">'+(r.paid?'จ่ายแล้ว ✓':'จ่ายยัง?')+'</button>'+
        '</div>';

      el.addEventListener('click', function(e){
        if(e.target.closest('[data-action="toggle"]')){
          e.stopPropagation();
          handleBillToggle(bill, r, el);
          return;
        }
        if(e.target.closest('.confirm-row')) return;
        openEditBillSheet(bill);
      });
      return el;
    }

    function makeSection(title, list){
      if(list.length===0) return;
      var sec = document.createElement('div');
      sec.className = 'sec-title';
      sec.innerHTML = title + ' <span class="count">' + list.length + '</span>';
      listArea.appendChild(sec);
      list.forEach(function(r){ listArea.appendChild(makeBillEl(r)); });
    }

    var sortedUnpaid = unpaidRows.filter(function(r){return r.status==='overdue';}).concat(
                        unpaidRows.filter(function(r){return r.status!=='overdue';}));
    makeSection('ยังไม่จ่าย', sortedUnpaid);
    makeSection('จ่ายแล้ว', paidRows);
  }

  function handleBillToggle(bill, r, el){
    if(r.paid){
      if(confirm('ยกเลิกสถานะ "จ่ายแล้ว" ของ '+bill.name+' ใช่ไหม?')){
        setPayment(state.payments, bill.id, null);
        render();
      }
      return;
    }
    if(el.querySelector('.confirm-row')) return;
    var row = document.createElement('div');
    row.className = 'confirm-row';
    row.innerHTML =
      '<input type="number" value="'+bill.amount+'" min="0" step="1">'+
      '<button class="ok">ยืนยันจ่ายแล้ว</button>'+
      '<button class="cancel">ยกเลิก</button>';
    el.querySelector('.binfo').appendChild(row);
    row.querySelector('input').focus();
    row.querySelector('.ok').addEventListener('click', function(ev){
      ev.stopPropagation();
      var amt = Number(row.querySelector('input').value) || bill.amount;
      setPayment(state.payments, bill.id, {paid:true, amount:amt, paidAt: new Date().toISOString()});
      render();
    });
    row.querySelector('.cancel').addEventListener('click', function(ev){
      ev.stopPropagation();
      row.remove();
    });
  }

  /* ---------- LOANS ---------- */
  function renderLoans(){
    var loans = state.loans.filter(function(loan){ return isLoanActiveInMonth(loan,viewYear,viewMonth); });
    var rows = loans.map(function(l){
      var row = computeRow(l, l.dueDay, getPayment(state.loanPayments, l.id));
      row.monthlyPayment = loanPaymentForMonth(l,viewYear,viewMonth);
      row.loanOrder = state.loans.indexOf(l);
      return row;
    });

    var unpaidRows = rows.filter(function(r){return !r.paid;}).sort(function(a,b){return a.loanOrder-b.loanOrder;});
    var paidRows = rows.filter(function(r){return r.paid;}).sort(function(a,b){return a.loanOrder-b.loanOrder;});

    var totalDebt = loans.reduce(function(s,l){return s+Number(l.remaining||0);},0);
    var paidThisMonth = paidRows.reduce(function(s,r){return s + Number((r.pay && r.pay.amount) || r.monthlyPayment || 0);},0);
    var remainThisMonth = unpaidRows.reduce(function(s,r){return s + Number(r.monthlyPayment||0);},0);
    var pct = (paidThisMonth+remainThisMonth)>0 ? Math.round((paidThisMonth/(paidThisMonth+remainThisMonth))*100) : 0;

    document.getElementById('debtVal').textContent = fmtBaht(totalDebt);
    document.getElementById('loanRemainVal').textContent = fmtBaht(remainThisMonth);
    document.getElementById('loanPaidVal').textContent = fmtBaht(paidThisMonth);
    document.getElementById('loanPctText').textContent = pct + '%';

    var circumference = 2*Math.PI*44;
    var ring = document.getElementById('loanRingProgress');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - (circumference * Math.min(pct,100)/100);

    var listArea = document.getElementById('listArea');
    listArea.innerHTML = '';

    if(loans.length===0){
      listArea.innerHTML = '<div class="empty"><span class="em-emoji">🏦</span>ยังไม่มีสินเชื่อในรายการ กดปุ่ม + เพื่อเพิ่มสินเชื่อตัวแรก</div>';
      return;
    }

    function makeLoanEl(r){
      var loan = r.item;
      var currentPayment = r.monthlyPayment;
      var el = document.createElement('div');
      el.className = 'bill' + (r.paid ? ' paid' : '');

      var badgeHtml = '';
      if(r.status==='overdue') badgeHtml = '<span class="badge overdue">เลยกำหนด</span>';
      else if(r.status==='soon') badgeHtml = '<span class="badge soon">ใกล้ครบกำหนด</span>';

      var progressHtml = '';
      if(loan.totalAmount && loan.totalAmount>0){
        var paidOff = Math.max(0, loan.totalAmount - loan.remaining);
        var offPct = Math.min(100, Math.round((paidOff/loan.totalAmount)*100));
        progressHtml =
          '<div class="loan-progress"><div class="fill" style="width:'+offPct+'%;"></div></div>'+
          '<div class="loan-progress-label">ผ่อนไปแล้ว '+offPct+'% ของยอดกู้ '+fmtBaht(loan.totalAmount)+'</div>';
      }
      if(loan.remaining>0 && loan.monthlyPayment>0){
        var projection = loanProjection(loan);
        if(projection.payable){
          var monthsLeft = projection.months;
          var payoff = new Date(viewYear, viewMonth + monthsLeft, 1);
          progressHtml += '<div class="loan-progress-label">ดอกเบี้ย '+Number(loan.interestRate||0).toLocaleString('th-TH',{maximumFractionDigits:2})+'%/ปี · เหลือประมาณ '+monthsLeft+' งวด · จ่ายครบราวเดือน'+MONTH_NAMES[payoff.getMonth()]+' '+(payoff.getFullYear()+543)+'</div>';
        } else {
          progressHtml += '<div class="loan-progress-label" style="color:var(--coral)">⚠️ ค่างวดไม่สูงกว่าดอกเบี้ยต่อเดือน หนี้จะไม่ลด</div>';
        }
      } else if(loan.remaining<=0){
        progressHtml += '<div class="loan-progress-label">ผ่อนครบแล้ว 🎉</div>';
      }

      el.innerHTML =
        '<div class="bicon">🏦</div>'+
        '<div class="binfo" style="width:100%;">'+
          '<div class="bname"><span>'+escapeHtml(loan.name)+'</span>'+badgeHtml+'</div>'+
          '<div class="bdue">'+(loan.bank?escapeHtml(loan.bank)+' · ':'')+'งวดนี้ '+dueText(r)+(loan.note? ' · '+escapeHtml(loan.note):'')+'</div>'+
          progressHtml+
          '<div class="loan-progress-label"><strong>คงเหลือ '+fmtBaht(loan.remaining)+'</strong> · <strong style="color:var(--coral)">ดอกเบี้ยงวดนี้ประมาณ '+fmtBaht(Number(loan.remaining||0)*(Number(loan.interestRate||0)/1200))+'</strong></div>'+
        '</div>'+
        '<div class="bactions">'+
          '<div class="bamt">'+fmtBaht(currentPayment)+'</div>'+
          '<div class="bamt sub">ต้องจ่ายเดือนนี้</div>'+
          '<button class="paybtn '+(r.paid?'paid':'unpaid')+'" data-action="toggle">'+(r.paid?'จ่ายงวดแล้ว ✓':'จ่ายงวดยัง?')+'</button>'+
        '</div>';

      el.addEventListener('click', function(e){
        if(e.target.closest('[data-action="toggle"]')){
          e.stopPropagation();
          handleLoanToggle(loan, r, el.querySelector('.binfo'));
          return;
        }
        if(e.target.closest('.confirm-row')) return;
        openLoanDetailSheet(loan);
      });
      return el;
    }

    function makeSection(title, list){
      if(list.length===0) return;
      var sec = document.createElement('div');
      sec.className = 'sec-title';
      sec.innerHTML = title + ' <span class="count">' + list.length + '</span>';
      listArea.appendChild(sec);
      list.forEach(function(r){ listArea.appendChild(makeLoanEl(r)); });
    }

    makeSection('สินเชื่อเก่าสุด → ใหม่สุด', rows.slice().sort(function(a,b){return a.loanOrder-b.loanOrder;}));
  }

  function monthPaidTotal(year,month){
    var key=monthKey(year,month),sum=0;
    Object.keys(state.payments[key]||{}).forEach(function(id){var p=state.payments[key][id];if(p&&p.paid)sum+=Number(p.amount||0);});
    Object.keys(state.loanPayments[key]||{}).forEach(function(id){var p=state.loanPayments[key][id];if(p&&p.paid)sum+=Number(p.amount||0);});
    return sum;
  }

  function comparisonHtml(current,previous){
    if(!previous)return '<span class="trend neutral">ยังไม่มีข้อมูลเดือนก่อน</span>';
    var pct=Math.round((current-previous)/previous*100),down=pct<0;
    return '<span class="trend '+(down?'down':'up')+'">'+(down?'▼':'▲')+Math.abs(pct)+'% จากเดือนก่อน</span>';
  }

  function expenseDonutHtml(){
    var key=monthKey(viewYear,viewMonth),groups={},total=0,colors=['var(--coral)','var(--sky)','var(--mustard)','var(--plum)','var(--mint)','#9b7653','#7d8b91'];
    function reportCategory(bill){
      var name=String(bill.name||'').toLowerCase();
      if(/ไฟ/.test(name))return 'elec';
      if(/น้ำ/.test(name))return 'water';
      if(/บัตร|เครดิต|card|shopee|lazada|spay|kkp/.test(name))return 'card';
      if(/คอนโด|ค่าเช่า|ห้อง/.test(name))return 'rent';
      if(/เน็ต|อินเทอร์เน็ต|มือถือ|โทรศัพท์/.test(name))return 'net';
      if(/ประกัน/.test(name))return 'ins';
      return bill.category||'other';
    }
    state.bills.forEach(function(bill){var pay=(state.payments[key]||{})[bill.id];if(!pay||!pay.paid)return;var amount=Number(pay.amount||0),category=reportCategory(bill);groups[category]=(groups[category]||0)+amount;total+=amount;});
    var entries=Object.keys(groups).sort(function(a,b){return groups[b]-groups[a];}),cursor=0,stops=[];
    entries.forEach(function(id,index){var end=cursor+(total?groups[id]/total*100:0);stops.push(colors[index%colors.length]+' '+cursor+'% '+end+'%');cursor=end;});
    var legend=entries.map(function(id,index){return '<div class="donut-row"><span><i style="background:'+colors[index%colors.length]+'"></i>'+escapeHtml(catInfo(id).name)+'</span><strong>'+fmtBaht(groups[id])+'</strong></div>';}).join('');
    return '<div class="expense-donut-wrap"><div class="expense-donut" style="background:conic-gradient('+(stops.join(',')||'var(--card-2) 0 100%')+')"><div><strong>'+fmtBaht(total)+'</strong><small>รายจ่ายเดือนนี้</small></div></div><div class="donut-legend">'+legend+'</div></div>';
  }

  function reportOverviewHtml(loans){
    var current=monthPaidTotal(viewYear,viewMonth),prevDate=new Date(viewYear,viewMonth-1,1),previous=monthPaidTotal(prevDate.getFullYear(),prevDate.getMonth());
    var original=state.loans.reduce(function(sum,l){return sum+Math.max(Number(l.totalAmount||0),Number(l.remaining||0));},0),remaining=state.loans.reduce(function(sum,l){return sum+Number(l.remaining||0);},0),pct=original?Math.max(0,Math.min(100,Math.round((original-remaining)/original*100))):0;
    return '<div class="report-grid"><div class="debt-summary-card report-wide"><div class="section-kicker">MONTHLY SPENDING</div><h3>รายจ่ายไปไหนบ้าง</h3>'+expenseDonutHtml()+'</div><div class="debt-summary-card"><div class="section-kicker">MONTH ON MONTH</div><h3>จ่ายรวมเดือนนี้</h3><div class="report-number">'+fmtBaht(current)+'</div>'+comparisonHtml(current,previous)+'</div><div class="debt-summary-card lifetime-card"><div class="lifetime-ring" style="--progress:'+(pct*3.6)+'deg"><div><strong>'+pct+'%</strong><small>ปลดหนี้แล้ว</small></div></div><p>จากหนี้ทั้งหมดที่เคยมี '+fmtBaht(original)+'</p></div></div>';
  }

  function renderDebtSummary(){
    var listArea = document.getElementById('listArea');
    var loans = state.loans.filter(function(loan){return Number(loan.remaining||0)>0;});
    if(!loans.length){
      listArea.innerHTML = '<div class="summary-hero"><div class="summary-eyebrow">รายงานการเงินของคุณ</div><div class="summary-total">฿0</div><div class="summary-caption">ไม่มีหนี้คงเหลือแล้ว 🎉</div></div>'+reportOverviewHtml([]);
      return;
    }
    var totalDebt = loans.reduce(function(sum,loan){return sum+Number(loan.remaining||0);},0);
    var totalPayment = loans.filter(function(loan){return isLoanActiveInMonth(loan,viewYear,viewMonth);}).reduce(function(sum,loan){return sum+loanPaymentForMonth(loan,viewYear,viewMonth);},0);
    var monthlyInterest = loans.reduce(function(sum,loan){return sum+(Number(loan.remaining||0)*Number(loan.interestRate||0)/1200);},0);
    var closingFees = loans.reduce(function(sum,loan){return sum+Number(loan.prepaymentFee||0);},0);
    var avalanche = loans.slice().sort(function(a,b){return Number(b.interestRate||0)-Number(a.interestRate||0) || Number(a.remaining||0)-Number(b.remaining||0);});
    var snowball = loans.slice().sort(function(a,b){return Number(a.remaining||0)-Number(b.remaining||0);});
    var expensive = avalanche[0];
    var smallest = snowball[0];
    var maxDebt = Math.max.apply(null,loans.map(function(loan){return Number(loan.remaining||0);}));

    function priorityRows(items){
      return items.map(function(loan,index){
        var interest = Number(loan.remaining||0)*Number(loan.interestRate||0)/1200;
        return '<div class="priority-item"><div class="priority-rank">'+(index+1)+'</div><div class="priority-main"><strong>'+escapeHtml(loan.name)+'</strong>'+
          (loan.bank?' <span class="bank-pill">'+escapeHtml(loan.bank)+'</span>':'')+
          '<div class="reason">ดอก '+Number(loan.interestRate||0).toLocaleString('th-TH',{maximumFractionDigits:2})+'%/ปี · '+fmtBaht(interest)+'/เดือน</div></div>'+
          '<div class="priority-money"><strong>'+fmtBaht(loan.remaining)+'</strong><span>คงเหลือ</span></div></div>';
      }).join('');
    }

    var debtBars = loans.slice().sort(function(a,b){return Number(b.remaining||0)-Number(a.remaining||0);}).map(function(loan,index){
      var width = maxDebt ? Math.max(5,Math.round(Number(loan.remaining||0)/maxDebt*100)) : 0;
      return '<div class="debt-bar-row"><div class="debt-bar-head"><span>'+escapeHtml(loan.name)+'</span><strong>'+fmtBaht(loan.remaining)+'</strong></div><div class="debt-bar-track"><div class="debt-bar-fill color-'+(index%5)+'" style="width:'+width+'%"></div></div><div class="debt-bar-meta">'+Math.round(Number(loan.remaining||0)/totalDebt*100)+'% ของหนี้ทั้งหมด · ดอก '+Number(loan.interestRate||0).toLocaleString('th-TH',{maximumFractionDigits:2})+'%</div></div>';
    }).join('');

    listArea.innerHTML =
      '<div class="summary-hero"><div class="summary-eyebrow">รายงานการเงินของคุณ</div><div class="summary-total">'+fmtBaht(totalDebt)+'</div><div class="summary-caption">ยอดหนี้คงเหลือทั้งหมด</div><div class="summary-chips"><span>จ่ายเดือนนี้ <strong>'+fmtBaht(totalPayment)+'</strong></span><span>ดอก/เดือน <strong>'+fmtBaht(monthlyInterest)+'</strong></span></div></div>'+reportOverviewHtml(loans)+
      '<div class="debt-summary-card"><div class="section-kicker">DEBT MAP</div><h3>หนี้อยู่ตรงไหนบ้าง</h3><div class="debt-bars">'+debtBars+'</div></div>'+
      '<div class="debt-summary-card"><h3>ตัวเลขสำคัญ</h3><div class="debt-summary-grid">'+
        '<div class="debt-metric"><span class="lab">หนี้คงเหลือรวม</span><span class="val">'+fmtBaht(totalDebt)+'</span></div>'+
        '<div class="debt-metric"><span class="lab">ต้องจ่ายเดือนนี้</span><span class="val">'+fmtBaht(totalPayment)+'</span></div>'+
        '<div class="debt-metric"><span class="lab">ดอกเบี้ยประมาณ/เดือน</span><span class="val">'+fmtBaht(monthlyInterest)+'</span></div>'+
        '<div class="debt-metric"><span class="lab">จำนวนหนี้</span><span class="val">'+loans.length+' รายการ</span></div>'+
        '<div class="debt-metric"><span class="lab">ค่าปิดก่อนกำหนดรวม</span><span class="val">'+fmtBaht(closingFees)+'</span></div>'+
      '</div></div>'+
      '<div class="debt-summary-card"><div class="section-kicker">DECLINING BALANCE</div><h3>ยอดหนี้จะลดลงอย่างไร</h3><p class="reason">ประมาณการจากค่างวดปกติและดอกเบี้ยที่บันทึกไว้</p><div id="debtTimelineChart">'+debtLineChartHtml(loans,0,0)+'</div></div>'+
      '<div class="debt-summary-card"><div class="section-kicker">SIMULATOR</div><h3>ลองแผนปลดหนี้</h3><div class="planner-controls">'+
        '<div class="field"><label>เงินโปะเพิ่ม/เดือน</label><input type="number" id="simExtra" min="0" placeholder="เช่น 2000"></div>'+
        '<div class="field"><label>เงินก้อนพิเศษ</label><input type="number" id="simWindfall" min="0" placeholder="เช่น 10000"></div>'+
        '<div class="field wide"><label>อยากปลดหนี้ภายใน</label><input type="month" id="simTarget"></div></div>'+
        '<button class="btn primary loanbtn" id="runSimulator" style="width:100%;margin-top:12px">คำนวณแผน</button><div id="simResult"></div></div>'+
      '<div class="debt-summary-card"><div class="section-title-row"><div><div class="section-kicker">AVALANCHE</div><h3>ลำดับที่ควรโปะ</h3></div><span class="recommended-pill">ประหยัดดอกสุด</span></div><p class="reason">จ่ายขั้นต่ำทุกก้อน แล้วนำเงินที่เหลือไปโปะตามลำดับนี้</p>'+
        '<div class="priority-list">'+priorityRows(avalanche)+'</div><p class="reason">ตัวเลขเป็นประมาณการแบบลดต้นลดดอก ควรตรวจค่าปรับปิดก่อนกำหนดและเงื่อนไขจริงกับธนาคารก่อนโปะ</p></div>'+
      '<div class="quick-answer-grid"><div class="quick-card danger"><span>🔥 แพงสุด</span><strong>'+escapeHtml(expensive.name)+'</strong><small>ดอก '+Number(expensive.interestRate||0).toLocaleString('th-TH',{maximumFractionDigits:2})+'% ต่อปี</small></div><div class="quick-card success"><span>⚡ ปิดง่ายสุด</span><strong>'+escapeHtml(smallest.name)+'</strong><small>เหลือ '+fmtBaht(smallest.remaining)+'</small></div></div>';

    document.getElementById('runSimulator').addEventListener('click',function(){
      var extra=Number(document.getElementById('simExtra').value)||0;
      var windfall=Number(document.getElementById('simWindfall').value)||0;
      var baseline=simulateDebtPayoff(loans,0,0);
      var plan=simulateDebtPayoff(loans,extra,windfall);
      document.getElementById('debtTimelineChart').innerHTML=debtLineChartHtml(loans,extra,windfall);
      var targetMonths=monthsUntil(document.getElementById('simTarget').value);
      var targetText='';
      if(targetMonths){
        var low=0,high=Math.max(1000,totalDebt),candidate=high;
        for(var i=0;i<30;i++){var mid=(low+high)/2;if(simulateDebtPayoff(loans,mid,windfall).months<=targetMonths){candidate=mid;high=mid;}else low=mid;}
        targetText='<div class="reason" style="margin-top:9px">เพื่อให้ทันเป้าหมาย ควรโปะเพิ่มประมาณ <strong>'+fmtBaht(Math.ceil(candidate/100)*100)+'/เดือน</strong></div>';
      }
      var saved=Math.max(0,baseline.totalInterest-plan.totalInterest);
      document.getElementById('simResult').innerHTML='<div class="sim-result"><strong>'+(plan.complete?'แผนนี้ปลดหนี้ได้ประมาณ '+plan.months+' เดือน':'ค่างวดไม่พอให้หนี้หมด')+'</strong><div class="sim-result-grid"><div><small>เร็วขึ้น</small><strong>'+Math.max(0,baseline.months-plan.months)+' เดือน</strong></div><div><small>ประหยัดดอก</small><strong>'+fmtBaht(saved)+'</strong></div><div><small>เงินก้อน</small><strong>'+fmtBaht(windfall)+'</strong></div></div>'+targetText+'</div>';
    });
  }

  var currentDetailLoanId = null;

  function refreshAfterLoanChange(loan){
    saveState();
    render();
    if(currentDetailLoanId === loan.id) renderLoanDetail(loan);
  }

  function handleLoanToggle(loan, r, container){
    if(r.paid){
      if(confirm('ยกเลิกสถานะ "จ่ายงวดแล้ว" ของ '+loan.name+' ใช่ไหม? ยอดคงเหลือจะถูกบวกกลับคืน')){
        var amt = Number((r.pay && r.pay.amount) || r.monthlyPayment || loan.monthlyPayment || 0);
        var principalPaid = Number(r.pay && r.pay.principalAmount);
        loan.remaining = Number(loan.remaining||0) + (Number.isFinite(principalPaid) ? principalPaid : amt);
        setPayment(state.loanPayments, loan.id, null);
        refreshAfterLoanChange(loan);
      }
      return;
    }
    if(container.querySelector('.confirm-row')) return;
    var row = document.createElement('div');
    row.className = 'confirm-row';
    row.innerHTML =
      '<input type="number" value="'+(r.monthlyPayment||loanPaymentForMonth(loan,viewYear,viewMonth))+'" min="0" step="1">'+
      '<button class="ok">ยืนยันจ่ายงวดแล้ว</button>'+
      '<button class="cancel">ยกเลิก</button>'+
      '<div class="hint">ระบบจะหักดอกเบี้ยของงวดก่อน แล้วนำส่วนที่เหลือไปลดเงินต้น</div>';
    container.appendChild(row);
    row.querySelector('input').focus();
    row.querySelector('.ok').addEventListener('click', function(ev){
      ev.stopPropagation();
      var amt = Number(row.querySelector('input').value) || r.monthlyPayment || loanPaymentForMonth(loan,viewYear,viewMonth);
      var breakdown = loanPaymentBreakdown(loan, amt);
      if(Number(loan.remaining||0)>0 && breakdown.principal<=0){
        alert('ยอดชำระต้องสูงกว่าดอกเบี้ยงวดนี้ ('+fmtBaht(breakdown.interest)+') เพื่อให้เงินต้นลดลง');
        return;
      }
      loan.remaining = Math.max(0, Number(loan.remaining||0) - breakdown.principal);
      setPayment(state.loanPayments, loan.id, {paid:true, amount:amt, principalAmount:breakdown.principal, interestAmount:breakdown.interest, paidAt: new Date().toISOString()});
      refreshAfterLoanChange(loan);
    });
    row.querySelector('.cancel').addEventListener('click', function(ev){
      ev.stopPropagation();
      row.remove();
    });
  }

  /* ---------- LOAN DETAIL sheet ---------- */
  var loanDetailOverlay = document.getElementById('loanDetailOverlay');

  function openLoanDetailSheet(loan){
    currentDetailLoanId = loan.id;
    renderLoanDetail(loan);
    loanDetailOverlay.classList.add('show');
  }

  function renderLoanDetail(loan){
    var r = computeRow(loan, loan.dueDay, getPayment(state.loanPayments, loan.id));

    document.getElementById('detailName').textContent = loan.name;
    document.getElementById('detailRemainBig').textContent = fmtBaht(loan.remaining);

    var badgeEl = document.getElementById('detailBadge');
    if(r.status==='overdue'){ badgeEl.textContent='เลยกำหนดชำระงวดนี้'; badgeEl.className='detail-badge overdue'; }
    else if(r.status==='soon'){ badgeEl.textContent='ใกล้ครบกำหนดชำระ'; badgeEl.className='detail-badge soon'; }
    else if(r.paid){ badgeEl.textContent='จ่ายงวดนี้แล้ว ✓'; badgeEl.className='detail-badge ok'; }
    else { badgeEl.textContent=''; badgeEl.className='detail-badge'; }

    var pct;
    if(loan.totalAmount && loan.totalAmount>0){
      pct = Math.round(Math.max(0, Math.min(1,(loan.totalAmount-loan.remaining)/loan.totalAmount))*100);
      document.getElementById('detailRingLabel').innerHTML = 'ผ่อนไปแล้ว<br>'+pct+'%';
    } else {
      pct = r.paid ? 100 : 0;
      document.getElementById('detailRingLabel').innerHTML = r.paid ? 'จ่ายงวดนี้แล้ว' : 'งวดนี้ยังไม่จ่าย';
    }
    var circumference = 2*Math.PI*44;
    var ring = document.getElementById('detailRing');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - (circumference * Math.min(pct,100)/100);

    var projection = loanProjection(loan);
    if(loan.remaining>0 && loan.monthlyPayment>0 && projection.payable){
      var monthsLeft = projection.months;
      var payoff = new Date(viewYear, viewMonth + monthsLeft, 1);
      document.getElementById('detailMonthsLeft').textContent = monthsLeft + ' งวด';
      document.getElementById('detailPayoff').textContent = MONTH_NAMES[payoff.getMonth()] + ' ' + (payoff.getFullYear()+543);
    } else if(loan.remaining<=0){
      document.getElementById('detailMonthsLeft').textContent = 'ผ่อนครบแล้ว 🎉';
      document.getElementById('detailPayoff').textContent = '-';
    } else {
      document.getElementById('detailMonthsLeft').textContent = projection.payable ? '-' : 'ค่างวดต่ำเกินไป';
      document.getElementById('detailPayoff').textContent = '-';
    }

    document.getElementById('detailTotal').textContent = (loan.totalAmount && loan.totalAmount>0) ? fmtBaht(loan.totalAmount) : 'ไม่ระบุ';
    document.getElementById('detailPaidOffPct').textContent = (loan.totalAmount && loan.totalAmount>0) ? pct+'%' : 'ไม่ระบุ';
    document.getElementById('detailMonthly').textContent = fmtBaht(loanPaymentForMonth(loan,viewYear,viewMonth));
    document.getElementById('detailInterestRate').textContent = Number(loan.interestRate||0).toLocaleString('th-TH',{maximumFractionDigits:2}) + '% ต่อปี';
    if(loan.startMonth){
      var startParts = loan.startMonth.split('-');
      document.getElementById('detailStartMonth').textContent = MONTH_NAMES[Number(startParts[1])-1] + ' ' + (Number(startParts[0])+543);
    } else {
      document.getElementById('detailStartMonth').textContent = 'ไม่ระบุ';
    }
    document.getElementById('detailNextInterest').textContent = fmtBaht(projection.nextInterest);
    document.getElementById('detailEstimatedInterest').textContent = projection.totalInterest===null ? 'คำนวณไม่ได้' : fmtBaht(projection.totalInterest);
    document.getElementById('detailPrepaymentFee').textContent = fmtBaht(loan.prepaymentFee||0);
    var feeNoteRow=document.getElementById('detailPrepaymentNoteRow');
    if(loan.prepaymentNote){feeNoteRow.style.display='flex';document.getElementById('detailPrepaymentNote').textContent=loan.prepaymentNote;}else feeNoteRow.style.display='none';
    document.getElementById('detailDue').textContent = 'วันที่ '+loan.dueDay+' · '+dueText(r);

    var noteRow = document.getElementById('detailNoteRow');
    if(loan.note){ noteRow.style.display='flex'; document.getElementById('detailNote').textContent = loan.note; }
    else { noteRow.style.display='none'; }

    var history=[];
    Object.keys(state.loanPayments||{}).forEach(function(key){
      var payment=state.loanPayments[key]&&state.loanPayments[key][loan.id];
      if(payment&&payment.paid) history.push({month:key,payment:payment});
    });
    history.sort(function(a,b){return b.month.localeCompare(a.month);});
    var historyBox=document.getElementById('detailPaymentHistory');
    historyBox.innerHTML='<h3>ประวัติการชำระ</h3>'+(history.length?history.map(function(entry){
      var principal=Number(entry.payment.principalAmount||entry.payment.amount||0),interest=Number(entry.payment.interestAmount||0),total=Math.max(1,principal+interest),principalPct=principal/total*100;
      return '<div class="history-item"><div class="history-main"><strong>'+entry.month+'</strong><div class="reason">จ่าย '+fmtBaht(entry.payment.amount)+' · เงินต้น '+fmtBaht(principal)+' · ดอก '+fmtBaht(interest)+'</div><div class="payment-split" title="เงินต้น '+Math.round(principalPct)+'% · ดอก '+Math.round(100-principalPct)+'%"><i class="split-principal" style="width:'+principalPct+'%"></i><i class="split-interest" style="width:'+(100-principalPct)+'%"></i></div></div><div class="history-actions"><button data-history-edit="'+entry.month+'">แก้</button><button data-history-delete="'+entry.month+'">ลบ</button></div></div>';
    }).join(''):'<div class="reason">ยังไม่มีประวัติการชำระ</div>');
    historyBox.querySelectorAll('[data-history-edit]').forEach(function(button){button.addEventListener('click',function(){
      var key=button.dataset.historyEdit,old=state.loanPayments[key][loan.id];
      var amount=Number(prompt('แก้ยอดชำระเดือน '+key,old.amount)); if(!amount||amount<0)return;
      loan.remaining=Number(loan.remaining||0)+Number(old.principalAmount||old.amount||0);
      var split=loanPaymentBreakdown(loan,amount); loan.remaining=Math.max(0,loan.remaining-split.principal);
      state.loanPayments[key][loan.id]={paid:true,amount:amount,principalAmount:split.principal,interestAmount:split.interest,paidAt:old.paidAt||new Date().toISOString()};
      refreshAfterLoanChange(loan);
    });});
    historyBox.querySelectorAll('[data-history-delete]').forEach(function(button){button.addEventListener('click',function(){
      var key=button.dataset.historyDelete,old=state.loanPayments[key][loan.id];
      if(!confirm('ลบประวัติการชำระเดือน '+key+' ใช่ไหม?'))return;
      loan.remaining=Number(loan.remaining||0)+Number(old.principalAmount||old.amount||0); delete state.loanPayments[key][loan.id];
      refreshAfterLoanChange(loan);
    });});

    document.getElementById('detailConfirmArea').innerHTML = '';
    var payBtn = document.getElementById('detailPayBtn');
    payBtn.textContent = r.paid ? 'ยกเลิกสถานะจ่ายงวดนี้' : 'จ่ายงวดยัง?';
  }

  document.getElementById('closeLoanDetail').addEventListener('click', function(){ loanDetailOverlay.classList.remove('show'); });
  loanDetailOverlay.addEventListener('click', function(e){ if(e.target===loanDetailOverlay) loanDetailOverlay.classList.remove('show'); });

  document.getElementById('detailPayBtn').addEventListener('click', function(){
    var loan = state.loans.find(function(l){return l.id===currentDetailLoanId;});
    if(!loan) return;
    var r = computeRow(loan, loan.dueDay, getPayment(state.loanPayments, loan.id));
    handleLoanToggle(loan, r, document.getElementById('detailConfirmArea'));
  });

  document.getElementById('detailEditBtn').addEventListener('click', function(){
    var loan = state.loans.find(function(l){return l.id===currentDetailLoanId;});
    if(!loan) return;
    loanDetailOverlay.classList.remove('show');
    openEditLoanSheet(loan);
  });

  /* ---------- month nav ---------- */
  document.getElementById('prevMonth').addEventListener('click', function(){
    viewMonth--; if(viewMonth<0){viewMonth=11; viewYear--;}
    render();
  });
  document.getElementById('nextMonth').addEventListener('click', function(){
    viewMonth++; if(viewMonth>11){viewMonth=0; viewYear++;}
    render();
  });

  /* ---------- BILL sheet ---------- */
  var billOverlay = document.getElementById('billOverlay');
  var editingBillId = null;
  var selectedCat = 'elec';

  function buildChips(){
    var wrap = document.getElementById('catChips');
    wrap.innerHTML = '';
    CATS.forEach(function(c){
      var chip = document.createElement('div');
      chip.className = 'chip' + (c.id===selectedCat?' active':'');
      chip.innerHTML = c.icon + ' ' + c.name;
      chip.addEventListener('click', function(){
        selectedCat = c.id;
        if(document.getElementById('fName').dataset.auto==='1'){
          document.getElementById('fName').value = c.name;
        }
        var iconField = document.getElementById('fIcon');
        if(iconField.dataset.auto==='1'){
          iconField.value = (c.id==='other') ? '' : c.icon;
        }
        buildChips();
        buildIconChips();
      });
      wrap.appendChild(chip);
    });
  }

  function buildIconChips(){
    var wrap = document.getElementById('iconChips');
    var current = document.getElementById('fIcon').value;
    wrap.innerHTML = '';
    ICON_PRESETS.forEach(function(ic){
      var chip = document.createElement('div');
      chip.className = 'chip icon-chip' + (ic===current?' active':'');
      chip.textContent = ic;
      chip.addEventListener('click', function(){
        var iconField = document.getElementById('fIcon');
        iconField.value = ic;
        iconField.dataset.auto = '0';
        buildIconChips();
      });
      wrap.appendChild(chip);
    });
  }

  document.getElementById('fIcon').addEventListener('input', function(){
    this.dataset.auto = '0';
    buildIconChips();
  });

  function openAddBillSheet(){
    editingBillId = null;
    selectedCat = 'elec';
    document.getElementById('sheetTitle').textContent = 'เพิ่มบิลใหม่';
    document.getElementById('fName').value = 'ค่าไฟ';
    document.getElementById('fName').dataset.auto = '1';
    document.getElementById('fAmount').value = '';
    document.getElementById('fDueDay').value = '';
    document.getElementById('fNote').value = '';
    document.getElementById('fIcon').value = catInfo('elec').icon;
    document.getElementById('fIcon').dataset.auto = '1';
    document.getElementById('recurringSwitch').classList.add('on');
    document.getElementById('deleteBillBtn').style.display = 'none';
    buildChips();
    buildIconChips();
    billOverlay.classList.add('show');
  }

  function openEditBillSheet(bill){
    editingBillId = bill.id;
    selectedCat = bill.category;
    document.getElementById('sheetTitle').textContent = 'แก้ไขบิล';
    document.getElementById('fName').value = bill.name;
    document.getElementById('fName').dataset.auto = '0';
    document.getElementById('fAmount').value = bill.amount;
    document.getElementById('fDueDay').value = bill.dueDay;
    document.getElementById('fNote').value = bill.note||'';
    document.getElementById('fIcon').value = bill.icon || catInfo(bill.category).icon;
    document.getElementById('fIcon').dataset.auto = '0';
    if(bill.recurring) document.getElementById('recurringSwitch').classList.add('on');
    else document.getElementById('recurringSwitch').classList.remove('on');
    document.getElementById('deleteBillBtn').style.display = 'block';
    buildChips();
    buildIconChips();
    billOverlay.classList.add('show');
  }

  document.getElementById('closeBillSheet').addEventListener('click', function(){ billOverlay.classList.remove('show'); });
  billOverlay.addEventListener('click', function(e){ if(e.target===billOverlay) billOverlay.classList.remove('show'); });
  document.getElementById('recurringSwitch').addEventListener('click', function(){ this.classList.toggle('on'); });

  document.getElementById('saveBillBtn').addEventListener('click', function(){
    var name = document.getElementById('fName').value.trim();
    var amount = Number(document.getElementById('fAmount').value) || 0;
    var dueDay = Math.min(31, Math.max(1, Number(document.getElementById('fDueDay').value) || 1));
    var note = document.getElementById('fNote').value.trim();
    var recurring = document.getElementById('recurringSwitch').classList.contains('on');
    var icon = document.getElementById('fIcon').value.trim();
    if(!name){ alert('ใส่ชื่อบิลก่อนนะ'); return; }
    if(!icon){
      if(selectedCat==='other'){ alert('เลือกหรือพิมพ์ไอคอนก่อนนะ'); return; }
      icon = catInfo(selectedCat).icon;
    }

    if(editingBillId){
      var b = state.bills.find(function(x){return x.id===editingBillId;});
      if(b){ b.name=name; b.amount=amount; b.dueDay=dueDay; b.note=note; b.recurring=recurring; b.category=selectedCat; b.icon=icon; }
    } else {
      state.bills.push({id:uid(), category:selectedCat, name:name, amount:amount, dueDay:dueDay, recurring:recurring, note:note, icon:icon});
    }
    saveState();
    billOverlay.classList.remove('show');
    render();
  });

  document.getElementById('deleteBillBtn').addEventListener('click', function(){
    if(!editingBillId) return;
    if(!confirm('ลบบิลนี้เลยไหม? ประวัติการจ่ายที่ผ่านมาจะหายไปด้วย')) return;
    state.bills = state.bills.filter(function(b){return b.id!==editingBillId;});
    Object.keys(state.payments).forEach(function(mk){ delete state.payments[mk][editingBillId]; });
    saveState();
    billOverlay.classList.remove('show');
    render();
  });

  /* ---------- LOAN sheet ---------- */
  var loanOverlay = document.getElementById('loanOverlay');
  var editingLoanId = null;

  function openAddLoanSheet(){
    editingLoanId = null;
    document.getElementById('loanSheetTitle').textContent = 'เพิ่มสินเชื่อใหม่';
    document.getElementById('lName').value = '';
    document.getElementById('lBank').value = '';
    document.getElementById('lTotal').value = '';
    document.getElementById('lRemaining').value = '';
    document.getElementById('lMonthly').value = '';
    document.getElementById('lMonthOverride').value = '';
    document.getElementById('lPaymentSchedule').value = '';
    document.getElementById('lMonthOverrideNote').textContent = 'กำหนดค่างวดเฉพาะ'+MONTH_NAMES[viewMonth]+' '+(viewYear+543)+' หากเดือนนี้ต่างจากค่างวดปกติ';
    document.getElementById('lInterestRate').value = '';
    document.getElementById('lStartMonth').value = monthKey(today.getFullYear(),today.getMonth());
    document.getElementById('lPrepaymentFee').value = '';
    document.getElementById('lPrepaymentNote').value = '';
    document.getElementById('lDueDay').value = '';
    document.getElementById('lNote').value = '';
    document.getElementById('deleteLoanBtn').style.display = 'none';
    loanOverlay.classList.add('show');
  }

  function openEditLoanSheet(loan){
    editingLoanId = loan.id;
    document.getElementById('loanSheetTitle').textContent = 'แก้ไขสินเชื่อ';
    document.getElementById('lName').value = loan.name;
    document.getElementById('lBank').value = loan.bank || '';
    document.getElementById('lTotal').value = loan.totalAmount || '';
    document.getElementById('lRemaining').value = loan.remaining;
    document.getElementById('lMonthly').value = loan.monthlyPayment;
    document.getElementById('lMonthOverride').value = (loan.paymentOverrides||{})[monthKey(viewYear,viewMonth)] || '';
    document.getElementById('lPaymentSchedule').value = formatPaymentSchedule(loan.paymentOverrides||{});
    document.getElementById('lMonthOverrideNote').textContent = 'กำหนดค่างวดเฉพาะ'+MONTH_NAMES[viewMonth]+' '+(viewYear+543)+' หากเดือนนี้ต่างจากค่างวดปกติ';
    document.getElementById('lInterestRate').value = Number(loan.interestRate)||0;
    document.getElementById('lStartMonth').value = loan.startMonth || '';
    document.getElementById('lPrepaymentFee').value = Number(loan.prepaymentFee)||'';
    document.getElementById('lPrepaymentNote').value = loan.prepaymentNote||'';
    document.getElementById('lDueDay').value = loan.dueDay;
    document.getElementById('lNote').value = loan.note||'';
    document.getElementById('deleteLoanBtn').style.display = 'block';
    loanOverlay.classList.add('show');
  }

  document.getElementById('closeLoanSheet').addEventListener('click', function(){ loanOverlay.classList.remove('show'); });
  loanOverlay.addEventListener('click', function(e){ if(e.target===loanOverlay) loanOverlay.classList.remove('show'); });

  document.getElementById('saveLoanBtn').addEventListener('click', function(){
    var name = document.getElementById('lName').value.trim();
    var bank = document.getElementById('lBank').value;
    var totalAmount = Number(document.getElementById('lTotal').value) || 0;
    var remaining = Number(document.getElementById('lRemaining').value) || 0;
    var monthlyPayment = Number(document.getElementById('lMonthly').value) || 0;
    var monthOverride = Number(document.getElementById('lMonthOverride').value) || 0;
    var paymentOverrides = parsePaymentSchedule(document.getElementById('lPaymentSchedule').value);
    var interestRate = Math.min(100, Math.max(0, Number(document.getElementById('lInterestRate').value) || 0));
    var enteredStartMonth = document.getElementById('lStartMonth').value;
    var prepaymentFee = Number(document.getElementById('lPrepaymentFee').value)||0;
    var prepaymentNote = document.getElementById('lPrepaymentNote').value.trim();
    var dueDay = Math.min(31, Math.max(1, Number(document.getElementById('lDueDay').value) || 1));
    var note = document.getElementById('lNote').value.trim();
    if(!name){ alert('ใส่ชื่อสินเชื่อก่อนนะ'); return; }

    if(editingLoanId){
      var l = state.loans.find(function(x){return x.id===editingLoanId;});
      if(l){
        l.name=name; l.bank=bank; l.totalAmount=totalAmount; l.remaining=remaining; l.monthlyPayment=monthlyPayment; l.interestRate=interestRate; l.startMonth=enteredStartMonth || l.addedMonth || null; l.dueDay=dueDay; l.note=note;
        l.paymentOverrides=paymentOverrides; l.prepaymentFee=prepaymentFee; l.prepaymentNote=prepaymentNote;
        if(monthOverride>0) l.paymentOverrides[monthKey(viewYear,viewMonth)]=monthOverride;
      }
    } else {
      var addedMonth = monthKey(today.getFullYear(),today.getMonth());
      var overrides=paymentOverrides;
      if(monthOverride>0) overrides[monthKey(viewYear,viewMonth)]=monthOverride;
      state.loans.push({id:uid(), name:name, bank:bank, totalAmount:totalAmount, remaining:remaining, monthlyPayment:monthlyPayment, paymentOverrides:overrides, interestRate:interestRate, prepaymentFee:prepaymentFee, prepaymentNote:prepaymentNote, addedMonth:addedMonth, createdAt:new Date().toISOString(), startMonth:enteredStartMonth || addedMonth, dueDay:dueDay, note:note});
    }
    saveState();
    loanOverlay.classList.remove('show');
    render();
  });

  document.getElementById('deleteLoanBtn').addEventListener('click', function(){
    if(!editingLoanId) return;
    if(!confirm('ลบสินเชื่อนี้เลยไหม? ประวัติการจ่ายที่ผ่านมาจะหายไปด้วย')) return;
    state.loans = state.loans.filter(function(l){return l.id!==editingLoanId;});
    Object.keys(state.loanPayments).forEach(function(mk){ delete state.loanPayments[mk][editingLoanId]; });
    saveState();
    loanOverlay.classList.remove('show');
    render();
  });

  /* ---------- savings goals ---------- */
  var savingOverlay=document.getElementById('savingOverlay'),editingSavingId=null;
  function openAddSavingSheet(){editingSavingId=null;document.getElementById('savingSheetTitle').textContent='เพิ่มเป้าหมายการออม';['sName','sTarget','sCurrent','sTargetDate','sNote'].forEach(function(id){document.getElementById(id).value='';});document.getElementById('deleteSavingBtn').style.display='none';savingOverlay.classList.add('show');}
  function openEditSavingSheet(goal){editingSavingId=goal.id;document.getElementById('savingSheetTitle').textContent='แก้ไขเป้าหมาย';document.getElementById('sName').value=goal.name;document.getElementById('sTarget').value=goal.target;document.getElementById('sCurrent').value=goal.current||0;document.getElementById('sTargetDate').value=goal.targetDate||'';document.getElementById('sNote').value=goal.note||'';document.getElementById('deleteSavingBtn').style.display='';savingOverlay.classList.add('show');}
  document.getElementById('closeSavingSheet').addEventListener('click',function(){savingOverlay.classList.remove('show');});
  savingOverlay.addEventListener('click',function(event){if(event.target===savingOverlay)savingOverlay.classList.remove('show');});
  document.getElementById('saveSavingBtn').addEventListener('click',function(){var name=document.getElementById('sName').value.trim(),target=Number(document.getElementById('sTarget').value)||0,current=Math.max(0,Number(document.getElementById('sCurrent').value)||0);if(!name||target<=0){alert('ใส่ชื่อและยอดเป้าหมายก่อนนะ');return;}var values={name:name,target:target,current:Math.min(current,target),targetDate:document.getElementById('sTargetDate').value,note:document.getElementById('sNote').value.trim()};if(editingSavingId){var goal=state.savingsGoals.find(function(g){return g.id===editingSavingId;});if(goal)Object.assign(goal,values);}else state.savingsGoals.push(Object.assign({id:'s'+uid(),createdAt:new Date().toISOString(),deposits:[]},values));saveState();savingOverlay.classList.remove('show');render();});
  document.getElementById('deleteSavingBtn').addEventListener('click',function(){if(!editingSavingId||!confirm('ลบเป้าหมายการออมนี้ใช่ไหม?'))return;state.savingsGoals=state.savingsGoals.filter(function(g){return g.id!==editingSavingId;});saveState();savingOverlay.classList.remove('show');render();});

  /* ---------- FAB routes to the right sheet ---------- */
  document.getElementById('addBtn').addEventListener('click', function(){
    if(activeTab==='bills') openAddBillSheet(); else if(activeTab==='loans') openAddLoanSheet(); else openAddSavingSheet();
  });

  /* ---------- settings ---------- */
  var settingsOverlay = document.getElementById('settingsOverlay');
  document.getElementById('settingsBtn').addEventListener('click', function(){
    document.getElementById('fBudget').value = state.budget || '';
    document.getElementById('fReminderDays').value = typeof state.reminderDays==='number' ? state.reminderDays : 3;
    var allocation=state.allocation||{debt:50,savings:30,spending:20};
    document.getElementById('fAllocDebt').value=allocation.debt;document.getElementById('fAllocSavings').value=allocation.savings;document.getElementById('fAllocSpending').value=allocation.spending;document.getElementById('allocationError').textContent='';
    renderSecuritySection();
    settingsOverlay.classList.add('show');
  });
  document.getElementById('closeSettingsSheet').addEventListener('click', function(){ settingsOverlay.classList.remove('show'); });
  settingsOverlay.addEventListener('click', function(e){ if(e.target===settingsOverlay) settingsOverlay.classList.remove('show'); });
  document.getElementById('saveBudgetBtn').addEventListener('click', function(){
    var allocDebt=Math.max(0,Number(document.getElementById('fAllocDebt').value)||0),allocSavings=Math.max(0,Number(document.getElementById('fAllocSavings').value)||0),allocSpending=Math.max(0,Number(document.getElementById('fAllocSpending').value)||0);
    if(allocDebt+allocSavings+allocSpending!==100){document.getElementById('allocationError').textContent='สัดส่วนรวมต้องเท่ากับ 100% (ตอนนี้ '+(allocDebt+allocSavings+allocSpending)+'%)';return;}
    var v = document.getElementById('fBudget').value;
    state.budget = v ? Number(v) : null;
    state.reminderDays = Math.min(30,Math.max(0,Number(document.getElementById('fReminderDays').value)||0));
    state.allocation={debt:allocDebt,savings:allocSavings,spending:allocSpending};
    saveState();
    settingsOverlay.classList.remove('show');
    render();
  });

  function downloadFile(name,content,type){
    var blob=new Blob([content],{type:type}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},500);
  }
  document.getElementById('enableNotificationsBtn').addEventListener('click',async function(){
    if(!('Notification' in window)){alert('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');return;}
    var permission=await Notification.requestPermission();
    alert(permission==='granted'?'เปิดการแจ้งเตือนแล้ว ระบบจะแจ้งเมื่อเปิดแอปใกล้วันครบกำหนด':'ยังไม่ได้รับอนุญาตแจ้งเตือน');
  });
  function checkDueNotifications(){
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    var days=typeof state.reminderDays==='number'?state.reminderDays:3,now=new Date(),todayKey=now.toISOString().slice(0,10);
    if(!state.notificationLog)state.notificationLog={};
    state.bills.concat(state.loans).forEach(function(item){
      if(state.loans.indexOf(item)>=0&&!isLoanActiveInMonth(item,now.getFullYear(),now.getMonth()))return;
      var store=state.loans.indexOf(item)>=0?state.loanPayments:state.payments,key=monthKey(now.getFullYear(),now.getMonth());
      if(store[key]&&store[key][item.id]&&store[key][item.id].paid)return;
      var due=new Date(now.getFullYear(),now.getMonth(),Math.min(Number(item.dueDay)||1,daysInMonth(now.getFullYear(),now.getMonth()))),diff=Math.ceil((due-new Date(now.getFullYear(),now.getMonth(),now.getDate()))/86400000),logKey=todayKey+':'+item.id;
      if(diff>=0&&diff<=days&&!state.notificationLog[logKey]){new Notification('ใกล้ถึงกำหนด: '+item.name,{body:'ครบกำหนดใน '+diff+' วัน · '+fmtBaht(state.loans.indexOf(item)>=0?loanPaymentForMonth(item,now.getFullYear(),now.getMonth()):item.amount)});state.notificationLog[logKey]=true;saveState();}
    });
  }
  document.getElementById('exportJsonBtn').addEventListener('click',function(){downloadFile('jaiyung-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json');});
  document.getElementById('exportCsvBtn').addEventListener('click',function(){
    var rows=[['ประเภท','ชื่อ','ธนาคาร','ยอดคงเหลือ','ค่างวด','ดอกเบี้ยต่อปี','วันครบกำหนด']];
    state.loans.forEach(function(l){rows.push(['สินเชื่อ',l.name,l.bank||'',l.remaining,l.monthlyPayment,l.interestRate||0,l.dueDay]);});
    state.bills.forEach(function(b){rows.push(['บิล',b.name,'',b.amount,b.amount,0,b.dueDay]);});
    (state.savingsGoals||[]).forEach(function(g){rows.push(['เป้าหมายออม',g.name,'',Math.max(0,g.target-g.current),g.current,0,g.targetDate||'']);});
    var csv='\uFEFF'+rows.map(function(row){return row.map(function(value){return '"'+String(value).replace(/"/g,'""')+'"';}).join(',');}).join('\r\n');downloadFile('jaiyung-'+new Date().toISOString().slice(0,10)+'.csv',csv,'text/csv;charset=utf-8');
  });
  document.getElementById('printReportBtn').addEventListener('click',function(){settingsOverlay.classList.remove('show');setTab('summary');setTimeout(function(){window.print();},100);});
  document.getElementById('importJsonBtn').addEventListener('click',function(){document.getElementById('importJsonFile').click();});
  document.getElementById('importJsonFile').addEventListener('change',function(event){var file=event.target.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(){try{var imported=JSON.parse(reader.result);if(!Array.isArray(imported.bills)||!Array.isArray(imported.loans))throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');if(confirm('นำเข้าข้อมูลนี้แทนข้อมูลปัจจุบันใช่ไหม?')){state=imported;saveState();settingsOverlay.classList.remove('show');render();}}catch(error){alert('นำเข้าไม่สำเร็จ: '+error.message);}};reader.readAsText(file);event.target.value='';});

  /* ---------- Supabase account (signup / login) ---------- */
  var lockOverlay = document.getElementById('lockOverlay');
  var lockContent = document.getElementById('lockContent');
  var currentAccount = null;

  function getAccount(){ return currentAccount; }
  function setLockError(message){
    var element = document.getElementById('lockErr');
    if(element) element.textContent = message || '';
  }

  async function showApp(){
    try{
      state = await loadState();
      document.body.classList.remove('app-locked');
      lockOverlay.classList.remove('show');
      setTab(activeTab);
      checkDueNotifications();
    }catch(error){
      currentAccount = null;
      showLoginScreen();
      setLockError(error.message);
    }
  }

  async function lockNow(){
    try{ await getSupabaseClient().auth.signOut(); }catch(error){}
    currentAccount = null;
    document.body.classList.add('app-locked');
    lockOverlay.classList.add('show');
    showLoginScreen();
  }

  function showSignupScreen(){
    document.body.classList.add('app-locked');
    lockOverlay.classList.add('show');
    lockContent.innerHTML =
      '<h2>สมัครสมาชิก</h2>'+
      '<p>ข้อมูลจะถูกบันทึกในระบบหลังบ้านและแยกตามบัญชีของคุณ</p>'+
      '<div class="lock-error" id="lockErr"></div>'+
      '<input type="email" id="suUser" placeholder="อีเมล" autocomplete="email" style="letter-spacing:normal;font-size:15px">'+
      '<input type="password" id="suPass" placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)" autocomplete="new-password" style="letter-spacing:normal;font-size:15px">'+
      '<input type="password" id="suPass2" placeholder="ยืนยันรหัสผ่าน" autocomplete="new-password" style="letter-spacing:normal;font-size:15px">'+
      '<button class="btn primary" id="suSubmitBtn" style="width:100%">สมัครและเริ่มใช้งาน</button>'+
      '<div style="margin-top:10px"><button class="lock-link" id="suGotoLoginBtn">มีบัญชีแล้ว? เข้าสู่ระบบ</button></div>';

    document.getElementById('suGotoLoginBtn').addEventListener('click', showLoginScreen);
    document.getElementById('suSubmitBtn').addEventListener('click', async function(){
      var username = document.getElementById('suUser').value.trim();
      var password = document.getElementById('suPass').value;
      var confirmation = document.getElementById('suPass2').value;
      if(!username.includes('@')){ setLockError('กรุณาใส่อีเมลให้ถูกต้อง'); return; }
      if(password.length < 8){ setLockError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'); return; }
      if(password !== confirmation){ setLockError('รหัสผ่านไม่ตรงกัน'); return; }
      try{
        var result = await getSupabaseClient().auth.signUp({email:username, password:password});
        if(result.error) throw result.error;
        if(!result.data.session){
          setLockError('สมัครเรียบร้อย กรุณายืนยันอีเมลแล้วกลับมาเข้าสู่ระบบ');
          return;
        }
        currentAccount = {username:result.data.user.email};
        await showApp();
      }catch(error){ setLockError(error.message); }
    });
  }

  function showLoginScreen(){
    document.body.classList.add('app-locked');
    lockOverlay.classList.add('show');
    lockContent.innerHTML =
      '<h2>เข้าสู่ระบบ</h2>'+
      '<p>เข้าสู่ระบบเพื่อดูบิลและสินเชื่อที่บันทึกไว้</p>'+
      '<div class="lock-error" id="lockErr"></div>'+
      '<input type="email" id="liUser" placeholder="อีเมล" autocomplete="email" style="letter-spacing:normal;font-size:15px">'+
      '<input type="password" id="liPass" placeholder="รหัสผ่าน" autocomplete="current-password" style="letter-spacing:normal;font-size:15px">'+
      '<button class="btn primary" id="liSubmitBtn" style="width:100%">เข้าสู่ระบบ</button>'+
      '<div style="margin-top:10px"><button class="lock-link" id="liGotoSignupBtn">ยังไม่มีบัญชี? สมัครสมาชิก</button></div>';

    document.getElementById('liGotoSignupBtn').addEventListener('click', showSignupScreen);
    var passwordInput = document.getElementById('liPass');
    async function tryLogin(){
      try{
        var result = await getSupabaseClient().auth.signInWithPassword({
          email:document.getElementById('liUser').value.trim(),
          password:passwordInput.value
        });
        if(result.error) throw result.error;
        currentAccount = {username:result.data.user.email};
        await showApp();
      }catch(error){
        setLockError(error.message);
        passwordInput.value = '';
        passwordInput.focus();
      }
    }
    document.getElementById('liSubmitBtn').addEventListener('click', tryLogin);
    passwordInput.addEventListener('keydown', function(event){ if(event.key === 'Enter') tryLogin(); });
  }

  async function initLock(){
    document.body.classList.add('app-locked');
    lockOverlay.classList.add('show');
    lockContent.innerHTML = '<h2>กำลังโหลด…</h2><p>กำลังเชื่อมต่อระบบหลังบ้าน</p>';
    try{
      var result = await getSupabaseClient().auth.getSession();
      if(result.error) throw result.error;
      currentAccount = result.data.session ? {username:result.data.session.user.email} : null;
      if(currentAccount) await showApp(); else showLoginScreen();
    }catch(error){
      showLoginScreen();
      setLockError('เชื่อมต่อระบบหลังบ้านไม่ได้: ' + error.message);
    }
  }

  function renderSecuritySection(){
    var box = document.getElementById('securitySection');
    box.innerHTML =
      '<h3>ความปลอดภัย 🔒 เข้าสู่ระบบเป็น @'+escapeHtml(currentAccount ? currentAccount.username : '')+'</h3>'+
      '<button class="btn ghost" id="logoutBtn" style="width:100%">ออกจากระบบ</button>'+
      '<button class="btn ghost" id="changePassBtn" style="width:100%">เปลี่ยนรหัสผ่าน</button>'+
      '<button class="btn danger" id="deleteAccBtn" style="width:100%">ลบข้อมูลการเงินทั้งหมด</button>'+
      '<div id="secForm"></div>';
    document.getElementById('logoutBtn').addEventListener('click', function(){ settingsOverlay.classList.remove('show'); lockNow(); });
    document.getElementById('changePassBtn').addEventListener('click', function(){ showSecForm('change'); });
    document.getElementById('deleteAccBtn').addEventListener('click', function(){ showSecForm('delete'); });
  }

  function showSecForm(mode){
    var form = document.getElementById('secForm');
    form.innerHTML =
      '<div class="lock-error" id="secErr" style="text-align:left"></div>'+
      '<div class="field"><label>รหัสผ่านปัจจุบัน</label><input type="password" id="secOldPass"></div>'+
      (mode === 'change' ?
        '<div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label><input type="password" id="secNewPass"></div><div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input type="password" id="secNewPass2"></div>' :
        '<p class="subnote">บิล สินเชื่อ และประวัติการจ่ายทั้งหมดจะถูกลบถาวร แต่บัญชี Supabase ยังคงอยู่</p>')+
      '<button class="btn '+(mode === 'delete' ? 'danger' : 'primary')+'" id="secSubmitBtn" style="width:100%">'+(mode === 'delete' ? 'ยืนยันลบข้อมูล' : 'บันทึกรหัสผ่านใหม่')+'</button>';

    document.getElementById('secSubmitBtn').addEventListener('click', async function(){
      var errorElement = document.getElementById('secErr');
      try{
        if(mode === 'delete'){
          if(!confirm('ลบบิล สินเชื่อ และประวัติทั้งหมดถาวรใช่ไหม?')) return;
          var loginResult = await getSupabaseClient().auth.signInWithPassword({email:currentAccount.username, password:document.getElementById('secOldPass').value});
          if(loginResult.error) throw loginResult.error;
          var deleteResult = await getSupabaseClient().from('jaiyung_user_state').delete().eq('user_id', loginResult.data.user.id);
          if(deleteResult.error) throw deleteResult.error;
          settingsOverlay.classList.remove('show');
          state = defaultState();
          await saveState();
          render();
          return;
        }
        var nextPassword = document.getElementById('secNewPass').value;
        if(nextPassword !== document.getElementById('secNewPass2').value){ throw new Error('รหัสผ่านใหม่ไม่ตรงกัน'); }
        var verifyResult = await getSupabaseClient().auth.signInWithPassword({email:currentAccount.username, password:document.getElementById('secOldPass').value});
        if(verifyResult.error) throw verifyResult.error;
        var updateResult = await getSupabaseClient().auth.updateUser({password:nextPassword});
        if(updateResult.error) throw updateResult.error;
        form.innerHTML = '<p class="subnote">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว</p>';
      }catch(error){ errorElement.textContent = error.message; }
    });
  }

  initLock();
})();
