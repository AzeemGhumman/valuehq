// Loads the Comena sample data (company, two offerings, three accounts, sources) into the first workspace.
//
//   npm run seed                 local (default)
//   npm run seed -- --env dev    the deployed dev stack
//   npm run seed -- --force      add the sample data even if offerings or accounts already exist
//
// Add the first user before seeding: npm run users -- add you@company.com --name "You" --role admin
import { options, useEnv } from './_env';

const { env, args } = useEnv(process.argv.slice(2));
const { opts } = options(args, ['force']);

type Source = import('../src/server/types').Source;

async function main() {
const { accounts, company, newId, offerings, sources, workspaces } = await import('../src/server/repo');

const ws = (await workspaces.list())[0];
if (!ws) {
  console.error('No workspace yet. Add the first user with: npm run users -- add you@company.com --name "You" --role admin');
  process.exit(1);
}
const [existingOfferings, existingAccounts] = await Promise.all([offerings.list(ws.id), accounts.list(ws.id)]);
if ((existingOfferings.length || existingAccounts.length) && !opts.force) {
  console.log(`${ws.name} (${env}) already has data. Nothing changed. Use --force to add the sample data anyway.`);
  process.exit(0);
}

const now = new Date().toISOString();
const src = (ownerType: Source['ownerType'], ownerId: string, s: Partial<Source> & Pick<Source, 'kind' | 'label'>): Source => ({
  id: newId(), ownerType, ownerId, mode: 'one-time', status: 'ready', createdAt: now, ...s,
});

await company.put(ws.id, {
  name: 'Comena', website: 'comena.ai', tagline: 'AI software for industrial distribution', founded: '2025', location: 'Munich',
  stage: 'YC Summer 2025', headcount: '8 people',
  whatWeDo: 'AI agents that automate order entry for industrial distributors and manufacturers.',
  whoWeSellTo: 'Customer service, inside sales and sales ops leaders at MRO, fastener and parts distributors.',
  problem: 'Reps retype POs and quote requests from emails and PDFs into the ERP, up to half their time.',
  howItWorks: 'Reads each order, matches part numbers to SKUs, and creates it in the ERP, with optional review.',
  whyUs: 'Handles messy orders, works with the existing inbox and ERP, live in weeks.',
  proof: '75–99% less time on order processing (vendor claim).',
});
for (const s of [
  src('company', ws.id, { kind: 'website', label: 'comena.ai', url: 'https://comena.ai', mode: 'live' }),
  src('company', ws.id, { kind: 'drive', label: 'Google Drive › Comena › Sales', mode: 'live' }),
  src('company', ws.id, { kind: 'file', label: 'pitch-deck.pdf' }),
  src('company', ws.id, { kind: 'file', label: 'security-overview.pdf' }),
]) await sources.put(ws.id, s);

const orderAgent = newId();
await offerings.put(ws.id, {
  id: orderAgent, name: 'Order Agent', createdAt: now, updatedAt: now,
  summary: 'Reads purchase orders from email, PDF or fax, matches customer part numbers to your SKUs, and creates the sales order in the ERP. A rep can review before it posts.',
  whoBuys: 'VP Customer Service, Head of Inside Sales, Sales Operations, CFO',
  valueRows: [
    { id: newId(), capability: 'Reads POs from email, PDF and fax', outcome: 'Inside sales spends time selling, not retyping', metric: 'Rep hours per order', proof: 'YC launch post (vendor claim)', status: 'reviewed' },
    { id: newId(), capability: 'Matches customer part numbers to SKUs', outcome: 'Fewer wrong items shipped', metric: 'Order accuracy, credit memos', status: 'drafted' },
    { id: newId(), capability: 'Creates the sales order in the ERP', outcome: 'Orders ship sooner', metric: 'Order-to-ship time', proof: 'comena.ai', status: 'reviewed' },
    { id: newId(), capability: 'Optional review before posting', outcome: 'Safe rollout, reps stay in control', metric: 'Share of orders with no touch', proof: 'pitch-deck.pdf p. 7', status: 'drafted' },
    { id: newId(), capability: 'Handles volume spikes without new hires', outcome: 'Growth without adding headcount', metric: 'Cost per order', proof: 'order-agent-pilot-summary.pdf', status: 'drafted' },
  ],
});
for (const s of [
  src('offering', orderAgent, { kind: 'drive', label: 'Google Drive › Comena › Order Agent', mode: 'live' }),
  src('offering', orderAgent, { kind: 'link', label: 'comena.ai/order-agent', url: 'https://comena.ai/order-agent', mode: 'live' }),
  src('offering', orderAgent, { kind: 'file', label: 'order-agent-pilot-summary.pdf' }),
]) await sources.put(ws.id, s);

const quoteAgent = newId();
await offerings.put(ws.id, {
  id: quoteAgent, name: 'Quote Agent', createdAt: now, updatedAt: now,
  summary: 'Reads RFQs from email and PDF, matches parts to your SKUs and price rules, and drafts a priced quote. A rep approves it before it goes out.',
  whoBuys: 'Head of Inside Sales, Sales Operations',
  valueRows: [
    { id: newId(), capability: 'Turns RFQs into draft quotes', outcome: 'Faster quote turnaround', metric: 'Hours to quote', status: 'drafted' },
    { id: newId(), capability: 'Applies price rules and contracts', outcome: 'Fewer pricing errors', metric: 'Quote error rate', status: 'drafted' },
    { id: newId(), capability: 'Rep approval before sending', outcome: 'Control stays with sales', metric: 'Quotes sent per rep per day', status: 'drafted' },
  ],
});
await sources.put(ws.id, src('offering', quoteAgent, { kind: 'file', label: 'quote-agent-one-pager.pdf' }));

const grainger = newId();
await accounts.put(ws.id, {
  id: grainger, name: 'W.W. Grainger', domain: 'grainger.com', unit: 'High-Touch Solutions – North America', industry: 'Industrial distribution (MRO)',
  ownership: 'public', ticker: 'GWW', priority: 'P1', stage: 'contacted', createdAt: now, updatedAt: now,
  notes: 'High-Touch sales up 13.8% in Q3 on double-digit volume. Interim CFO named labor as a cost headwind.',
});
for (const s of [
  src('account', grainger, { kind: 'sec', label: '10-K and 10-Q filings', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000277135', mode: 'live' }),
  src('account', grainger, { kind: 'calls', label: 'Earnings calls and IR page', url: 'https://invest.grainger.com', mode: 'live' }),
  src('account', grainger, { kind: 'website', label: 'grainger.com', url: 'https://www.grainger.com', mode: 'live' }),
  src('account', grainger, { kind: 'news', label: 'News: Grainger, High-Touch', mode: 'live' }),
]) await sources.put(ws.id, s);

const fastenal = newId();
await accounts.put(ws.id, { id: fastenal, name: 'Fastenal', domain: 'fastenal.com', industry: 'Industrial distribution (fasteners)', ownership: 'public', ticker: 'FAST', priority: 'P2', stage: 'researching', createdAt: now, updatedAt: now });
for (const s of [
  src('account', fastenal, { kind: 'calls', label: 'Investor relations', url: 'https://investor.fastenal.com', mode: 'live' }),
  src('account', fastenal, { kind: 'website', label: 'fastenal.com', url: 'https://www.fastenal.com', mode: 'live' }),
]) await sources.put(ws.id, s);

await accounts.put(ws.id, { id: newId(), name: 'MSC Industrial Supply', domain: 'mscdirect.com', industry: 'Metalworking and MRO', ownership: 'public', ticker: 'MSM', priority: 'P3', stage: 'researching', createdAt: now, updatedAt: now });

console.log(`Loaded the Comena sample data into ${ws.name} (${env}).`);
}

void main();
