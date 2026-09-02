const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('public/assets/js/app.js', 'utf8');
const projectionSource = source.match(/function loanProjection\(loan\)\{[\s\S]*?\n  \}/)?.[0];
const breakdownSource = source.match(/function loanPaymentBreakdown\(loan, amount\)\{[\s\S]*?\n  \}/)?.[0];
const monthKeySource = source.match(/function monthKey\(y,m\)\{[^\n]+\}/)?.[0];
const activeMonthSource = source.match(/function isLoanActiveInMonth\(loan, year, month\)\{[\s\S]*?\n  \}/)?.[0];
const paymentForMonthSource = source.match(/function loanPaymentForMonth\(loan, year, month\)\{[\s\S]*?\n  \}/)?.[0];
const parseScheduleSource = source.match(/function parsePaymentSchedule\(text\)\{[\s\S]*?\n  \}/)?.[0];
const simulationSource = source.match(/function simulateDebtPayoff\(sourceLoans,extraMonthly,windfall\)\{[\s\S]*?\n  \}/)?.[0];

assert.ok(projectionSource, 'loanProjection must exist');
assert.ok(breakdownSource, 'loanPaymentBreakdown must exist');
assert.ok(monthKeySource, 'monthKey must exist');
assert.ok(activeMonthSource, 'isLoanActiveInMonth must exist');
assert.ok(paymentForMonthSource, 'loanPaymentForMonth must exist');
assert.ok(parseScheduleSource, 'parsePaymentSchedule must exist');
assert.ok(simulationSource, 'simulateDebtPayoff must exist');
eval(`${projectionSource}\n${breakdownSource}\n${monthKeySource}\n${activeMonthSource}\n${paymentForMonthSource}\n${parseScheduleSource}\n${simulationSource}`);

const noInterest = loanProjection({remaining: 12000, monthlyPayment: 1000, interestRate: 0});
assert.equal(noInterest.months, 12);
assert.equal(noInterest.totalInterest, 0);

const amortized = loanProjection({remaining: 100000, monthlyPayment: 8885, interestRate: 12});
assert.equal(amortized.months, 12);
assert.ok(amortized.totalInterest > 6000 && amortized.totalInterest < 7000);

const negativeAmortization = loanProjection({remaining: 100000, monthlyPayment: 500, interestRate: 12});
assert.equal(negativeAmortization.payable, false);

const payment = loanPaymentBreakdown({remaining: 100000, interestRate: 12}, 8885);
assert.equal(Math.round(payment.interest), 1000);
assert.equal(Math.round(payment.principal), 7885);

const finalPayment = loanPaymentBreakdown({remaining: 500, interestRate: 12}, 1000);
assert.equal(finalPayment.principal, 500);
assert.equal(finalPayment.interest, 5);

assert.equal(isLoanActiveInMonth({startMonth: '2026-10'}, 2026, 8), false);
assert.equal(isLoanActiveInMonth({startMonth: '2026-10'}, 2026, 9), true);
assert.equal(isLoanActiveInMonth({startMonth: '2026-10'}, 2027, 0), true);
assert.equal(isLoanActiveInMonth({}, 2020, 0), true, 'legacy loans remain visible');
assert.equal(loanPaymentForMonth({monthlyPayment: 5000, paymentOverrides: {'2026-10': 7500}}, 2026, 9), 7500);
assert.equal(loanPaymentForMonth({monthlyPayment: 5000, paymentOverrides: {'2026-10': 7500}}, 2026, 10), 5000);
assert.deepEqual(parsePaymentSchedule('2026-10 = 7,500\ninvalid\n2026-11=9000'), {'2026-10':7500,'2026-11':9000});

const baselinePlan = simulateDebtPayoff([{remaining:100000,monthlyPayment:5000,interestRate:12}],0,0);
const extraPlan = simulateDebtPayoff([{remaining:100000,monthlyPayment:5000,interestRate:12}],2000,10000);
assert.equal(baselinePlan.complete,true);
assert.equal(extraPlan.complete,true);
assert.ok(extraPlan.months < baselinePlan.months);
assert.ok(extraPlan.totalInterest < baselinePlan.totalInterest);

console.log('loan interest calculations: passed');
