// Fixed nightly question set. Sent as one message (not one-by-one) so the founder
// can reply free-form in one go, matching how he's actually been answering so far.
const NIGHTLY_QUESTIONS = `De Markt - Daily Update (reply in one message, skip anything that didn't happen today):

Sales: product x qty @ sell price cod, ...
Purchase: product from supplier @ buy price, paid cash/bank/due
Expense: what + amount
Salary: staff name + amount
My draw: amount from cash/bkash/bank
Supplier payment: supplier + amount
Ad spend: platform + amount
Ad deposit: amount
Courier parcels sent: qty + product
ATM/bKash withdrawal: amount + purpose
Bank/bKash transfer: from -> to, amount, amount received after fee
Cash in hand now: amount

Send photos separately (memos, ad spend screenshots) - just attach and caption what it is.`;

module.exports = { NIGHTLY_QUESTIONS };
