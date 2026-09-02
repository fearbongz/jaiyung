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
  var activeTab = 'bills'; // 'bills' | 'loans'

  var MONTH_NAMES = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

  function monthKey(y,m){ return y + '-' + String(m+1).padStart(2,'0'); }
  function isLoanActiveInMonth(loan, year, month){
    return !loan.startMonth || loan.startMonth <= monthKey(year, month);
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
    document.getElementById('billsHero').style.display = tab==='bills' ? 'flex' : 'none';
    document.getElementById('loansHero').style.display = tab==='loans' ? 'flex' : 'none';
    render();
  }
  document.getElementById('tabBills').addEventListener('click', function(){ setTab('bills'); });
  document.getElementById('tabLoans').addEventListener('click', function(){ setTab('loans'); });

  /* ---------- RENDER ---------- */
  function render(){
    document.getElementById('monthLabel').textContent = MONTH_NAMES[viewMonth] + ' ' + (viewYear+543);
    if(activeTab==='bills') renderBills(); else renderLoans();
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

    var loansMonthlyTotal = state.loans.filter(function(l){return isLoanActiveInMonth(l,viewYear,viewMonth);}).reduce(function(s,l){return s+Number(l.monthlyPayment||0);},0);

    if(state.budget){
      document.getElementById('budgetRow').style.display='flex';
      document.getElementById('budgetDiv').style.display='block';
      var left = Number(state.budget) - (paidTotal + remainTotal) - loansMonthlyTotal;
      var leftEl = document.getElementById('leftVal');
      leftEl.textContent = fmtBaht(left);
      leftEl.style.color = left < 0 ? 'var(--coral)' : 'var(--sky)';
    } else {
      document.getElementById('budgetRow').style.display='none';
      document.getElementById('budgetDiv').style.display='none';
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
          '<div class="bdue">'+dueText(r)+(bill.note? ' · '+escapeHtml(bill.note):'')+'</div>'+
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
      return computeRow(l, l.dueDay, getPayment(state.loanPayments, l.id));
    });

    var unpaidRows = rows.filter(function(r){return !r.paid;}).sort(function(a,b){return a.due-b.due;});
    var paidRows = rows.filter(function(r){return r.paid;}).sort(function(a,b){return a.due-b.due;});

    var totalDebt = loans.reduce(function(s,l){return s+Number(l.remaining||0);},0);
    var paidThisMonth = paidRows.reduce(function(s,r){return s + Number((r.pay && r.pay.amount) || r.item.monthlyPayment || 0);},0);
    var remainThisMonth = unpaidRows.reduce(function(s,r){return s + Number(r.item.monthlyPayment||0);},0);
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
          '<div class="bdue">งวดนี้ '+dueText(r)+(loan.note? ' · '+escapeHtml(loan.note):'')+'</div>'+
          progressHtml+
        '</div>'+
        '<div class="bactions">'+
          '<div class="bamt">'+fmtBaht(loan.remaining)+'</div>'+
          '<div class="bamt sub">คงเหลือ</div>'+
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

    var sortedUnpaid = unpaidRows.filter(function(r){return r.status==='overdue';}).concat(
                        unpaidRows.filter(function(r){return r.status!=='overdue';}));
    makeSection('ยังไม่จ่ายงวดนี้', sortedUnpaid);
    makeSection('จ่ายงวดแล้ว', paidRows);
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
        var amt = Number((r.pay && r.pay.amount) || loan.monthlyPayment || 0);
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
      '<input type="number" value="'+loan.monthlyPayment+'" min="0" step="1">'+
      '<button class="ok">ยืนยันจ่ายงวดแล้ว</button>'+
      '<button class="cancel">ยกเลิก</button>'+
      '<div class="hint">ระบบจะหักดอกเบี้ยของงวดก่อน แล้วนำส่วนที่เหลือไปลดเงินต้น</div>';
    container.appendChild(row);
    row.querySelector('input').focus();
    row.querySelector('.ok').addEventListener('click', function(ev){
      ev.stopPropagation();
      var amt = Number(row.querySelector('input').value) || loan.monthlyPayment;
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
    document.getElementById('detailMonthly').textContent = fmtBaht(loan.monthlyPayment);
    document.getElementById('detailInterestRate').textContent = Number(loan.interestRate||0).toLocaleString('th-TH',{maximumFractionDigits:2}) + '% ต่อปี';
    if(loan.startMonth){
      var startParts = loan.startMonth.split('-');
      document.getElementById('detailStartMonth').textContent = MONTH_NAMES[Number(startParts[1])-1] + ' ' + (Number(startParts[0])+543);
    } else {
      document.getElementById('detailStartMonth').textContent = 'ไม่ระบุ';
    }
    document.getElementById('detailNextInterest').textContent = fmtBaht(projection.nextInterest);
    document.getElementById('detailEstimatedInterest').textContent = projection.totalInterest===null ? 'คำนวณไม่ได้' : fmtBaht(projection.totalInterest);
    document.getElementById('detailDue').textContent = 'วันที่ '+loan.dueDay+' · '+dueText(r);

    var noteRow = document.getElementById('detailNoteRow');
    if(loan.note){ noteRow.style.display='flex'; document.getElementById('detailNote').textContent = loan.note; }
    else { noteRow.style.display='none'; }

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
    document.getElementById('lTotal').value = '';
    document.getElementById('lRemaining').value = '';
    document.getElementById('lMonthly').value = '';
    document.getElementById('lInterestRate').value = '';
    document.getElementById('lStartMonth').value = monthKey(today.getFullYear(),today.getMonth());
    document.getElementById('lDueDay').value = '';
    document.getElementById('lNote').value = '';
    document.getElementById('deleteLoanBtn').style.display = 'none';
    loanOverlay.classList.add('show');
  }

  function openEditLoanSheet(loan){
    editingLoanId = loan.id;
    document.getElementById('loanSheetTitle').textContent = 'แก้ไขสินเชื่อ';
    document.getElementById('lName').value = loan.name;
    document.getElementById('lTotal').value = loan.totalAmount || '';
    document.getElementById('lRemaining').value = loan.remaining;
    document.getElementById('lMonthly').value = loan.monthlyPayment;
    document.getElementById('lInterestRate').value = Number(loan.interestRate)||0;
    document.getElementById('lStartMonth').value = loan.startMonth || '';
    document.getElementById('lDueDay').value = loan.dueDay;
    document.getElementById('lNote').value = loan.note||'';
    document.getElementById('deleteLoanBtn').style.display = 'block';
    loanOverlay.classList.add('show');
  }

  document.getElementById('closeLoanSheet').addEventListener('click', function(){ loanOverlay.classList.remove('show'); });
  loanOverlay.addEventListener('click', function(e){ if(e.target===loanOverlay) loanOverlay.classList.remove('show'); });

  document.getElementById('saveLoanBtn').addEventListener('click', function(){
    var name = document.getElementById('lName').value.trim();
    var totalAmount = Number(document.getElementById('lTotal').value) || 0;
    var remaining = Number(document.getElementById('lRemaining').value) || 0;
    var monthlyPayment = Number(document.getElementById('lMonthly').value) || 0;
    var interestRate = Math.min(100, Math.max(0, Number(document.getElementById('lInterestRate').value) || 0));
    var enteredStartMonth = document.getElementById('lStartMonth').value;
    var dueDay = Math.min(31, Math.max(1, Number(document.getElementById('lDueDay').value) || 1));
    var note = document.getElementById('lNote').value.trim();
    if(!name){ alert('ใส่ชื่อสินเชื่อก่อนนะ'); return; }

    if(editingLoanId){
      var l = state.loans.find(function(x){return x.id===editingLoanId;});
      if(l){ l.name=name; l.totalAmount=totalAmount; l.remaining=remaining; l.monthlyPayment=monthlyPayment; l.interestRate=interestRate; l.startMonth=enteredStartMonth || l.addedMonth || null; l.dueDay=dueDay; l.note=note; }
    } else {
      var addedMonth = monthKey(today.getFullYear(),today.getMonth());
      state.loans.push({id:uid(), name:name, totalAmount:totalAmount, remaining:remaining, monthlyPayment:monthlyPayment, interestRate:interestRate, addedMonth:addedMonth, startMonth:enteredStartMonth || addedMonth, dueDay:dueDay, note:note});
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

  /* ---------- FAB routes to the right sheet ---------- */
  document.getElementById('addBtn').addEventListener('click', function(){
    if(activeTab==='bills') openAddBillSheet(); else openAddLoanSheet();
  });

  /* ---------- settings ---------- */
  var settingsOverlay = document.getElementById('settingsOverlay');
  document.getElementById('settingsBtn').addEventListener('click', function(){
    document.getElementById('fBudget').value = state.budget || '';
    renderSecuritySection();
    settingsOverlay.classList.add('show');
  });
  document.getElementById('closeSettingsSheet').addEventListener('click', function(){ settingsOverlay.classList.remove('show'); });
  settingsOverlay.addEventListener('click', function(e){ if(e.target===settingsOverlay) settingsOverlay.classList.remove('show'); });
  document.getElementById('saveBudgetBtn').addEventListener('click', function(){
    var v = document.getElementById('fBudget').value;
    state.budget = v ? Number(v) : null;
    saveState();
    settingsOverlay.classList.remove('show');
    render();
  });

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
      render();
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
