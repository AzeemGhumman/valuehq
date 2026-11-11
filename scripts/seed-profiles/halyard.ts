import type { SeedProfile } from './types';

// A fictional cybersecurity startup selling to fictional hospital systems.
// Used to check that ValueHQ isn't shaped around one industry. Links point to example.com placeholders.
export const halyard: SeedProfile = {
  key: 'halyard',
  title: 'Halyard Security → hospital systems (fictional)',
  description: 'Medical-device security sold to private, nonprofit hospital systems. All names are made up.',
  company: {
    name: 'Halyard Security', website: 'halyard.example', tagline: 'Security for connected medical devices', founded: '2023', location: 'Boston',
    stage: 'Series A', headcount: '40 people',
    whatWeDo: 'Finds every connected medical device on a hospital network and keeps it from being the way in for ransomware.',
    whoWeSellTo: 'CISOs, CIOs and clinical engineering leaders at health systems with three or more hospitals.',
    problem: 'Most infusion pumps, imaging systems and monitors can’t be patched or run security agents, and many aren’t on any asset list.',
    howItWorks: 'A passive network sensor builds a live device inventory, scores risk using clinical context, and pushes segmentation rules to the firewalls the hospital already has.',
    whyUs: 'No agents on devices, knows which devices are in use with patients, and connects to ServiceNow and the clinical engineering system.',
    proof: 'Pilot at a 6-hospital system found 31% more devices than its asset list (customer reference, not public).',
  },
  companySources: [
    { kind: 'website', label: 'halyard.example', url: 'https://example.com', mode: 'live' },
    { kind: 'file', label: 'halyard-overview-deck.pdf' },
    { kind: 'file', label: 'hipaa-security-whitepaper.pdf' },
  ],
  offerings: [
    {
      name: 'Device Inventory',
      summary: 'Passive discovery of every connected medical and IoT device, with risk scored by how the device is used in care.',
      whoBuys: 'CISO, VP Clinical Engineering, CIO',
      valueRows: [
        { capability: 'Discovers every connected device without agents', outcome: 'A complete, current asset list', metric: 'Devices missing from the asset list', proof: 'Pilot: 31% more devices found', status: 'reviewed' },
        { capability: 'Scores risk using clinical context', outcome: 'Patch and fix what matters to patients first', metric: 'Time to fix critical device risks', status: 'drafted' },
        { capability: 'Syncs with ServiceNow and the clinical engineering system', outcome: 'Less manual audit preparation', metric: 'Hours per Joint Commission audit', status: 'drafted' },
      ],
      sources: [{ kind: 'file', label: 'device-inventory-datasheet.pdf' }, { kind: 'link', label: 'Product page', url: 'https://example.com', mode: 'live' }],
    },
    {
      name: 'Segmentation Guard',
      summary: 'Recommends and enforces network segmentation for medical devices through the hospital’s existing firewalls.',
      whoBuys: 'CISO, Director of Network Engineering',
      valueRows: [
        { capability: 'Recommends segmentation rules per device group', outcome: 'Ransomware can’t spread to clinical devices', metric: 'Devices reachable from a compromised laptop', status: 'drafted' },
        { capability: 'Pushes rules to existing firewalls', outcome: 'No new network hardware', metric: 'Weeks to enforce', status: 'drafted' },
        { capability: 'Simulates rules before enforcing', outcome: 'No disruption to patient care', metric: 'Care disruptions caused by network changes', proof: 'Pilot: zero disruptions in 90 days', status: 'reviewed' },
      ],
      sources: [{ kind: 'file', label: 'segmentation-guard-case-study.pdf' }],
    },
  ],
  accounts: [
    {
      name: 'Cascade Health System', domain: 'cascadehealth.example', unit: 'Clinical Engineering and IT Security', industry: 'Health system (12 hospitals)',
      ownership: 'private', priority: 'P1', stage: 'contacted',
      notes: 'Board asked for a ransomware readiness plan after a nearby health system diverted ambulances for three days. New CISO started this year.',
      sources: [
        { kind: 'website', label: 'Cascade Health newsroom', url: 'https://example.com', mode: 'live' },
        { kind: 'link', label: 'Annual community benefit report', url: 'https://example.org', mode: 'one-time' },
        { kind: 'news', label: 'News: Cascade Health, cybersecurity', mode: 'live' },
      ],
    },
    {
      name: 'Riverbend Medical Group', domain: 'riverbend.example', industry: 'Health system (4 hospitals, 30 clinics)',
      ownership: 'private', priority: 'P2', stage: 'researching',
      notes: 'Moving to a new EHR next year; IT team stretched.',
      sources: [{ kind: 'website', label: 'riverbend.example', url: 'https://example.com', mode: 'live' }],
    },
    {
      name: 'Summit Children’s Hospital', domain: 'summitchildrens.example', industry: 'Academic children’s hospital',
      ownership: 'private', priority: 'P3', stage: 'researching', sources: [],
    },
  ],
};
