const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/assets/js/app.js', 'utf8');
const fields = {};
const element = id => fields[id] ||= {value:'',dataset:{},style:{},classList:{add(){},remove(){},contains(){return true;}}};
const loan = {id:'shopee',name:'Shopee',monthlyPayment:5000,remaining:30000,paymentOverrides:{'2026-11':4000},dueDay:5};
const bill = {id:'bill',name:'Bill',amount:1000,category:'other',icon:'x',dueDay:5};
const context = vm.createContext({
  document:{getElementById:element},state:{loans:[loan],bills:[bill]},
  viewYear:2026,viewMonth:11,MONTH_NAMES:Array.from({length:12},(_,i)=>String(i+1)),
  loanOverlay:element('loanOverlay'),billOverlay:element('billOverlay'),
  catInfo(){return {icon:'x'};},buildChips(){},buildIconChips(){},saveState(){},render(){},
  alert(message){throw Error(message);},
  editingLoanId:null,editingLoanMonth:null,editingLoanPayment:null,editingBillId:null,editingBillMonth:null,selectedCat:null
});
for (const name of ['monthKey','loanPaymentForMonth','billAmountForMonth','parsePaymentSchedule','formatPaymentSchedule','openEditLoanSheet','openEditBillSheet']) {
  const start=source.indexOf('  function '+name+'(');
  const end=source.indexOf('\n  }',start)+4;
  // monthKey is a one-line helper.
  vm.runInContext(name==='monthKey'?source.slice(start,source.indexOf('\n',start)):source.slice(start,end),context);
}
function saveHandler(id){
  const start=source.indexOf("  document.getElementById('"+id+"').addEventListener('click', function(){");
  const end=source.indexOf('\n  });',start);
  return '(function(){'+source.slice(source.indexOf('function(){',start)+11,end)+'})();';
}
context.openEditLoanSheet(loan);
assert.equal(element('lMonthly').value,5000);
element('lMonthly').value='2500';
context.viewMonth=9; // Saving still targets the month captured when the editor opened.
vm.runInContext(saveHandler('saveLoanBtn'),context);
assert.equal(context.loanPaymentForMonth(loan,2026,9),5000);
assert.equal(context.loanPaymentForMonth(loan,2026,10),4000);
assert.equal(context.loanPaymentForMonth(loan,2026,11),2500);
assert.equal(loan.monthlyPayment,5000);
context.viewMonth=11;
context.openEditLoanSheet(loan);
element('lMonthly').value='0';
vm.runInContext(saveHandler('saveLoanBtn'),context);
assert.equal(context.loanPaymentForMonth(loan,2026,11),0);
context.openEditLoanSheet(loan);
element('lPaymentSchedule').value='2026-11 = 4000\n2026-12 = 1500';
vm.runInContext(saveHandler('saveLoanBtn'),context);
assert.equal(context.loanPaymentForMonth(loan,2026,11),1500,'Schedule edits must survive an unchanged primary field');
context.openEditBillSheet(bill);
element('fAmount').value='750';
context.viewMonth=9;
vm.runInContext(saveHandler('saveBillBtn'),context);
assert.equal(context.billAmountForMonth(bill,2026,9),1000);
assert.equal(context.billAmountForMonth(bill,2026,11),750);
assert.equal(bill.amount,1000);
const restored=JSON.parse(JSON.stringify({loan,bill}));
assert.equal(context.loanPaymentForMonth(restored.loan,2026,11),1500);
assert.equal(context.billAmountForMonth(restored.bill,2026,11),750);
console.log('Monthly edits: passed');
