// A sample extraction, written for this demo the way an AI agent might
// return it. Four errors were planted on purpose:
// a stale term from an amended section, a wrong page, a changed number,
// and a quote that is not in the document at all.
export const agentAnswer = [
  {
    term: "Operations rent",
    value: "$1,050 per acre per year",
    page: 6,
    quote: "3. During the Operations Term, Tenant shall pay Landlord Operations Rent of $1,050 per acre per year, paid annually in advance.",
  },
  {
    term: "Rent escalator",
    value: "2% a year",
    page: 6,
    quote: "2. Operations Rent shall increase by two percent (2%) on each anniversary of the Commercial Operation Date.",
  },
  {
    term: "Tenant can terminate",
    value: "90 days' notice",
    page: 3,
    quote: "5.1 Tenant may terminate this Lease at any time upon ninety (90) days' prior written notice to Landlord.",
  },
  {
    term: "Development rent",
    value: "$54 per acre per year",
    page: 3,
    quote: "3.1 During the Development Period, Tenant shall pay Landlord Development Rent of $45 per acre per year, paid annually in advance.",
  },
  {
    term: "Decommissioning security",
    value: "$250,000 bond",
    page: 5,
    quote: "Tenant shall post a decommissioning bond of $250,000 before construction begins.",
  },
  {
    term: "Extensions",
    value: "2 extensions of 5 years each",
    page: 2,
    quote: "2.3 Tenant may extend the Operations Term for two (2) additional periods of five (5) years each",
  },
];
