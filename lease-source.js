// The sample documents, page by page. Written for this demo: the names,
// land, dates and figures are made up. tools/build-sample.mjs prints these
// pages to sample.pdf, and the tests read the same lines.
// Each line is either a heading ("h") or a paragraph ("p").

export const title = "Willet Creek Solar: ground lease and two amendments";

export const pages = [
  [
    { h: "SOLAR GROUND LEASE AGREEMENT" },
    { p: 'This Solar Ground Lease Agreement (this "Lease") is made as of March 4, 2024 (the "Effective Date") by and between Willet Creek Farms, LLC ("Landlord") and Willet Creek Solar, LLC ("Tenant").' },
    { h: "RECITALS" },
    { p: 'A. Landlord owns certain land in Sample County, Kansas, described in Exhibit A (the "Property").' },
    { p: 'B. Tenant wishes to lease part of the Property to develop, build and operate a solar energy facility (the "Solar Facility").' },
    { h: "1. Premises" },
    { p: '1.1 Landlord leases to Tenant approximately 412.6 acres of the Property, as shown in Exhibit A (the "Premises").' },
    { p: "1.2 Tenant may use the Premises for solar energy generation, energy storage, transmission and related purposes." },
  ],
  [
    { h: "2. Term" },
    { p: "2.1 The Development Period begins on the Effective Date and ends on the earlier of (a) the Commercial Operation Date and (b) the fifth (5th) anniversary of the Effective Date." },
    { p: "2.2 The Operations Term begins on the Commercial Operation Date and continues for twenty-five (25) years." },
    { p: "2.3 Tenant may extend the Operations Term for two (2) additional periods of five (5) years each by written notice to Landlord at least one hundred eighty (180) days before the end of the then-current term." },
    { p: '2.4 "Commercial Operation Date" means the date the Solar Facility first delivers electricity to the grid on a commercial basis, as stated in a notice from Tenant to Landlord.' },
  ],
  [
    { h: "3. Rent" },
    { p: "3.1 During the Development Period, Tenant shall pay Landlord Development Rent of $45 per acre per year, paid annually in advance." },
    { p: "3.2 During the Operations Term, Tenant shall pay Landlord Operations Rent of $900 per acre per year, paid annually in advance." },
    { p: "3.3 Operations Rent shall increase by one and one-half percent (1.5%) on each anniversary of the Commercial Operation Date." },
    { h: "4. Taxes" },
    { p: "4.1 Tenant shall pay any increase in real property taxes on the Property that results from the Solar Facility." },
    { p: "4.2 Landlord shall pay all other real property taxes on the Property." },
  ],
  [
    { h: "5. Termination by Tenant" },
    { p: "5.1 Tenant may terminate this Lease at any time upon ninety (90) days' prior written notice to Landlord." },
    { p: "5.2 On termination, rent is prorated to the termination date." },
    { h: "6. Assignment and Lender Protection" },
    { p: "6.1 Tenant may assign this Lease, in whole or in part, to an affiliate or to any Lender without Landlord's consent." },
    { p: "6.2 Any other assignment requires Landlord's consent, which Landlord shall not unreasonably withhold." },
    { p: "6.3 Landlord shall give any Lender a copy of each default notice and an additional sixty (60) days to cure." },
  ],
  [
    { h: "7. Removal of Facilities" },
    { p: "7.1 Within twelve (12) months after the end of this Lease, Tenant shall remove all above-ground parts of the Solar Facility and restore the Premises to a condition reasonably similar to its condition on the Effective Date." },
    { h: "8. Insurance" },
    { p: "8.1 Tenant shall carry commercial general liability insurance with limits of not less than $2,000,000 per occurrence." },
    { h: "9. Notices" },
    { p: "9.1 Notices must be in writing and sent to the addresses on the signature page." },
    { p: "LANDLORD: Willet Creek Farms, LLC. By: ____________________" },
    { p: "TENANT: Willet Creek Solar, LLC. By: ____________________" },
  ],
  [
    { h: "FIRST AMENDMENT TO SOLAR GROUND LEASE AGREEMENT" },
    { p: 'This First Amendment is made as of August 19, 2024 between Willet Creek Farms, LLC ("Landlord") and Willet Creek Solar, LLC ("Tenant").' },
    { p: "1. The Premises are reduced to approximately 398.2 acres, as shown in Exhibit A-1." },
    { p: "2. Operations Rent shall increase by two percent (2%) on each anniversary of the Commercial Operation Date." },
    { p: "3. During the Operations Term, Tenant shall pay Landlord Operations Rent of $1,050 per acre per year, paid annually in advance." },
    { p: "4. All other terms of the Lease remain in effect." },
  ],
  [
    { h: "SECOND AMENDMENT TO SOLAR GROUND LEASE AGREEMENT" },
    { p: "This Second Amendment is made as of May 12, 2025 between Landlord and Tenant." },
    { p: '1. Section 2 of the First Amendment is deleted and replaced with: "Operations Rent shall increase by one and three-quarters percent (1.75%) on each anniversary of the Commercial Operation Date."' },
    { p: '2. Section 2.1 of the Lease is replaced with: "The Development Period begins on the Effective Date and ends on the earlier of (a) the Commercial Operation Date and (b) the sixth (6th) anniversary of the Effective Date."' },
    { p: "3. All other terms of the Lease, as amended, remain in effect." },
  ],
];

/** Plain lines per page, the shape the extractor takes. */
export function pageLines() {
  return pages.map((blocks) => blocks.map((b) => b.h || b.p));
}
