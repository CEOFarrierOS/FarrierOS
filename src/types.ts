export type Foot = "LF" | "RF" | "LH" | "RH";
export type Screen = "today" | "calendar" | "clients" | "horses" | "prep" | "finish" | "addClient" | "account";
export type ServiceType = "trim" | "fronts" | "hinds" | "full_set" | "therapeutic";

export interface FarrierBusinessProfile {
  id: string;
  businessName: string;
  farrierName: string;
  phone: string;
  email: string;
  baseLocation: string;
  defaultServiceIntervalWeeks: number;
}

export interface Client {
  id: string;
  intakeDraft?: boolean;
  firstName?: string;
  lastName?: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  locationSource?: "manual" | "browser" | "barn" | "none";
  notes: string;
  horseIds: string[];
  barnIds: string[];
}

export interface BarnProperty {
  id: string;
  name: string;
  clientIds: string[];
  address: string;
  latitude?: number;
  longitude?: number;
  gateCode: string;
  parkingNotes: string;
  barnManagerName: string;
  barnManagerPhone: string;
  accessInstructions: string;
  horseIds: string[];
}

export interface ShoeSetup {
  id: string;
  horseId: string;
  foot: Foot;
  serviceRecordId: string;
  shoeBrand: string;
  shoeModel: string;
  shoeSize: string;
  clips: string;
  pads: string;
  wedges: string;
  borium: string;
  modifications: string;
  fitNotes: string;
  verified: boolean;
  verifiedAt: string;
  changedThisCycle: string;
}

export interface FootRecord {
  id: string;
  horseId: string;
  foot: Foot;
  currentSetupId: string;
  historySetupIds: string[];
  trimmedPhotoIds: string[];
  finishedShoePhotoIds: string[];
  notes: string[];
}

export interface Horse {
  id: string;
  name: string;
  breed?: string;
  color?: string;
  age?: string;
  ownerClientId: string;
  barnPropertyId: string;
  temperament: string;
  safetyNotes: string;
  serviceIntervalWeeks: number;
  lastServiceDate: string;
  nextDueDate: string;
  footRecordIds: Record<Foot, string>;
  verifiedSetupId: string;
  notes: string[];
  photoDocumentIds: string[];
}

export interface PhotoDocument {
  id: string;
  horseId: string;
  foot?: Foot;
  serviceRecordId?: string;
  type: "trimmed_foot" | "finished_shoe" | "xray" | "document" | "general";
  title: string;
  placeholderColor: string;
  capturedAt: string;
  notes: string;
}

export interface ServiceRecord {
  id: string;
  horseId: string;
  appointmentId?: string;
  serviceDate: string;
  serviceType: ServiceType;
  footSetupIds: string[];
  writtenNotes: string;
  voiceNotePlaceholderIds: string[];
  photoDocumentIds: string[];
  verifiedSetup: boolean;
  nextDueDate: string;
  ownerSummaryPreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  barnPropertyId: string;
  clientId: string;
  horseIds: string[];
  status: "scheduled" | "en_route" | "in_progress" | "complete" | "cancelled";
  routeOrder: number;
  notes: string;
  recurringIntervalWeeks: number;
  shoesPrepped: boolean;
  prepNote: string;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  earningsCents?: number;
}

export type ThemePreference = "system" | "light" | "dark";

export interface BusinessExpense {
  id: string;
  date: string;
  amountCents: number;
  category: string;
  notes: string;
  createdAt: string;
}

export interface AppPreferences {
  theme: ThemePreference;
  currency: string;
}

export interface CollaborationMember {
  id: string;
  name: string;
  role: "owner" | "business_partner" | "apprentice";
  notificationsEnabled: boolean;
}

export interface ActivityPing {
  id: string;
  actorName: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export type MembershipStatus =
  "development" | "trialing" | "active" | "grace_period" | "past_due" | "cancelled" | "expired";

export interface Membership {
  planId: "farrieros_full_monthly";
  planName: "FarrierOS Full Access";
  priceMonthlyCents: 799;
  currency: "usd";
  status: MembershipStatus;
  entitlements: string[];
  billingProvider: "development" | "stripe";
  customerId?: string;
  subscriptionId?: string;
  currentPeriodEnd?: string;
  lastVerifiedAt?: string;
}

export interface AppData {
  business: FarrierBusinessProfile;
  membership: Membership;
  collaborationMembers: CollaborationMember[];
  activityPings: ActivityPing[];
  clients: Client[];
  barns: BarnProperty[];
  horses: Horse[];
  footRecords: FootRecord[];
  shoeSetups: ShoeSetup[];
  serviceRecords: ServiceRecord[];
  appointments: Appointment[];
  photos: PhotoDocument[];
  preferences?: AppPreferences;
  expenses?: BusinessExpense[];
}
