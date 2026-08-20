import type { OrganisationType, VenueDiscoveryVisibility } from "@/types/courtside";

export type OrganisationCapabilities = {
  clubDiscovery: boolean;
  courtBooking: boolean;
  districtContext: boolean;
  eventHost: boolean;
  membershipPlans: boolean;
  schoolDiscovery: boolean;
  teamR: boolean;
};

const capabilitiesByType: Record<OrganisationType, OrganisationCapabilities> = {
  academy: { clubDiscovery: false, courtBooking: false, districtContext: false, eventHost: false, membershipPlans: false, schoolDiscovery: false, teamR: false },
  club: { clubDiscovery: true, courtBooking: true, districtContext: false, eventHost: true, membershipPlans: true, schoolDiscovery: false, teamR: false },
  club_academy: { clubDiscovery: true, courtBooking: true, districtContext: false, eventHost: true, membershipPlans: true, schoolDiscovery: false, teamR: false },
  district: { clubDiscovery: false, courtBooking: false, districtContext: true, eventHost: true, membershipPlans: false, schoolDiscovery: false, teamR: true },
  school: { clubDiscovery: false, courtBooking: false, districtContext: false, eventHost: true, membershipPlans: false, schoolDiscovery: true, teamR: true },
  school_district: { clubDiscovery: false, courtBooking: false, districtContext: true, eventHost: true, membershipPlans: false, schoolDiscovery: true, teamR: true }
};

export function organisationCapabilities(type: OrganisationType) {
  return capabilitiesByType[type];
}

export function defaultDiscoveryVisibility(type: OrganisationType): VenueDiscoveryVisibility {
  return organisationCapabilities(type).schoolDiscovery ? "public" : "hidden";
}
