import type { SeedProfile } from './types';

// Comena (YC S25) selling order-entry AI to industrial distributors. Public companies, real filings.
export const comena: SeedProfile = {
  key: 'comena',
  title: 'Comena → industrial distributors',
  description: 'AI order entry sold to MRO and fastener distributors: Grainger, Fastenal, MSC.',
  company: {
    name: 'Comena', website: 'comena.ai', tagline: 'AI software for industrial distribution', founded: '2025', location: 'Munich',
    stage: 'YC Summer 2025', headcount: '8 people',
    whatWeDo: 'AI agents that automate order entry for industrial distributors and manufacturers.',
    whoWeSellTo: 'Customer service, inside sales and sales ops leaders at MRO, fastener and parts distributors.',
    problem: 'Reps retype POs and quote requests from emails and PDFs into the ERP, up to half their time.',
    howItWorks: 'Reads each order, matches part numbers to SKUs, and creates it in the ERP, with optional review.',
    whyUs: 'Handles messy orders, works with the existing inbox and ERP, live in weeks.',
    proof: '75–99% less time on order processing (vendor claim).',
  },
  companySources: [
    { kind: 'website', label: 'comena.ai', url: 'https://comena.ai', mode: 'live' },
    { kind: 'drive', label: 'Google Drive › Comena › Sales', mode: 'live' },
    { kind: 'file', label: 'pitch-deck.pdf' },
    { kind: 'file', label: 'security-overview.pdf' },
  ],
  offerings: [
    {
      name: 'Order Agent',
      summary: 'Reads purchase orders from email, PDF or fax, matches customer part numbers to your SKUs, and creates the sales order in the ERP. A rep can review before it posts.',
      whoBuys: 'VP Customer Service, Head of Inside Sales, Sales Operations, CFO',
      valueRows: [
        { capability: 'Reads POs from email, PDF and fax', outcome: 'Inside sales spends time selling, not retyping', metric: 'Rep hours per order', proof: 'YC launch post (vendor claim)', status: 'reviewed' },
        { capability: 'Matches customer part numbers to SKUs', outcome: 'Fewer wrong items shipped', metric: 'Order accuracy, credit memos', status: 'drafted' },
        { capability: 'Creates the sales order in the ERP', outcome: 'Orders ship sooner', metric: 'Order-to-ship time', proof: 'comena.ai', status: 'reviewed' },
        { capability: 'Optional review before posting', outcome: 'Safe rollout, reps stay in control', metric: 'Share of orders with no touch', proof: 'pitch-deck.pdf p. 7', status: 'drafted' },
        { capability: 'Handles volume spikes without new hires', outcome: 'Growth without adding headcount', metric: 'Cost per order', proof: 'order-agent-pilot-summary.pdf', status: 'drafted' },
      ],
      sources: [
        { kind: 'drive', label: 'Google Drive › Comena › Order Agent', mode: 'live' },
        { kind: 'link', label: 'comena.ai/order-agent', url: 'https://comena.ai/order-agent', mode: 'live' },
        { kind: 'file', label: 'order-agent-pilot-summary.pdf' },
      ],
    },
    {
      name: 'Quote Agent',
      summary: 'Reads RFQs from email and PDF, matches parts to your SKUs and price rules, and drafts a priced quote. A rep approves it before it goes out.',
      whoBuys: 'Head of Inside Sales, Sales Operations',
      valueRows: [
        { capability: 'Turns RFQs into draft quotes', outcome: 'Faster quote turnaround', metric: 'Hours to quote', status: 'drafted' },
        { capability: 'Applies price rules and contracts', outcome: 'Fewer pricing errors', metric: 'Quote error rate', status: 'drafted' },
        { capability: 'Rep approval before sending', outcome: 'Control stays with sales', metric: 'Quotes sent per rep per day', status: 'drafted' },
      ],
      sources: [{ kind: 'file', label: 'quote-agent-one-pager.pdf' }],
    },
  ],
  accounts: [
    {
      name: 'W.W. Grainger', domain: 'grainger.com', unit: 'High-Touch Solutions – North America', industry: 'Industrial distribution (MRO)',
      ownership: 'public', ticker: 'GWW', priority: 'P1', stage: 'contacted',
      notes: 'High-Touch sales up 13.8% in Q3 on double-digit volume. Interim CFO named labor as a cost headwind.',
      sources: [
        { kind: 'sec', label: '10-K and 10-Q filings', url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000277135', mode: 'live' },
        { kind: 'calls', label: 'Earnings calls and IR page', url: 'https://invest.grainger.com', mode: 'live' },
        { kind: 'website', label: 'grainger.com', url: 'https://www.grainger.com', mode: 'live' },
        { kind: 'news', label: 'News: Grainger, High-Touch', mode: 'live' },
      ],
    },
    {
      name: 'Fastenal', domain: 'fastenal.com', industry: 'Industrial distribution (fasteners)', ownership: 'public', ticker: 'FAST', priority: 'P2', stage: 'researching',
      sources: [
        { kind: 'calls', label: 'Investor relations', url: 'https://investor.fastenal.com', mode: 'live' },
        { kind: 'website', label: 'fastenal.com', url: 'https://www.fastenal.com', mode: 'live' },
      ],
    },
    { name: 'MSC Industrial Supply', domain: 'mscdirect.com', industry: 'Metalworking and MRO', ownership: 'public', ticker: 'MSM', priority: 'P3', stage: 'researching', sources: [] },
  ],
};
