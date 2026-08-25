import { fullAccessPlan } from "./membership";
import { AppData } from "./types";

export const emptyData: AppData = {
  business: {
    id: "biz-local",
    businessName: "My Farrier Business",
    farrierName: "",
    phone: "",
    email: "",
    baseLocation: "",
    defaultServiceIntervalWeeks: 6,
  },
  membership: fullAccessPlan,
  collaborationMembers: [],
  activityPings: [],
  clients: [],
  barns: [],
  horses: [],
  footRecords: [],
  shoeSetups: [],
  serviceRecords: [],
  appointments: [],
  photos: [],
  preferences: { theme: "system", currency: "USD" },
  expenses: [],
};
