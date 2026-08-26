import { ReactNode, useEffect, useMemo, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { shiftDate, TOMORROW, TODAY } from "./dateUtils";
import { completeJob } from "./jobCompletion";
import { formatMonthlyPrice, hasFullAccess } from "./membership";
import { buildOnMyWayMessage, createSmsHref } from "./messaging";
import { createBackup, hydrateData, loadInitialData, parseBackup, resetData, saveData } from "./storage";
import { ActivityPing, AppData, Appointment, BusinessExpense, BusinessIncome, Foot, Horse, Screen, ServiceType, ShoeSetup, ThemePreference } from "./types";
import {
  getCurrentSession,
  getCurrentWorkspace,
  registerFarrier,
  sendPasswordReset,
  signInFarrier,
  signOutFarrier,
} from "./cloud/auth";
import { getSupabaseClient } from "./cloud/supabase";
import { integrationStatus } from "./config";
import { CoifLinkRecord, CoifSubmissionRecord, coifOwnerName, createCoifLink, listCoifLinks, listCoifSubmissions, markCoifImported, revokeCoifLink } from "./cloud/coif";
import BrandMark from "./BrandMark";

const feet: Foot[] = ["LF", "RF", "LH", "RH"];

const screenLabels: Record<Screen, string> = {
  today: "Today",
  calendar: "Calendar",
  clients: "Clients, Barns & Horses",
  horses: "Horses",
  prep: "Prep Tomorrow",
  finish: "Current Stop",
  finances: "Finances",
  addClient: "Add Client",
  account: "Account & Membership",
};

const primaryScreens: Screen[] = ["today", "calendar", "clients", "prep", "finish", "finances"];

type AppIconName = "today" | "calendar" | "clients" | "prep" | "finish" | "finances" | "add" | "account";

function AppIcon({ name }: { name: AppIconName }) {
  const paths: Record<AppIconName, ReactNode> = {
    today: <><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
    clients: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.2 2.4-5 5.5-5s4.9 1.8 5.5 5M16 7.5a2.5 2.5 0 0 1 0 5M17 14c2.2.4 3.4 2 3.7 4.5"/></>,
    prep: <><path d="M6 3h12v18H6zM9 8l1.5 1.5L14 6M9 14l1.5 1.5L14 12M16 8h.01M16 14h.01"/></>,
    finish: <><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5v8l4 2"/></>,
    finances: <><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.8-.7-1.9-1-3.2-1-1.8 0-3 .8-3 2s1 1.9 3.1 2.4c2.1.5 3.1 1.2 3.1 2.5s-1.3 2.2-3.3 2.2c-1.5 0-2.8-.5-3.7-1.4M12 5.5v13"/></>,
    add: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.2 2.4-5 5.5-5 1.2 0 2.2.3 3 .8M18 13v8M14 17h8"/></>,
    account: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.7 3.4-7 8-7s7.2 2.3 8 7"/></>,
  };
  return <svg aria-hidden="true" className="app-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[name]}</svg>;
}

const serviceLabels: Record<ServiceType, string> = {
  trim: "Trim",
  fronts: "Fronts",
  hinds: "Hinds",
  full_set: "Full Set",
  therapeutic: "Therapeutic",
};

function formatDate(date: string) {
  if (!date) return "Not set";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

function dayName(date: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
}

function shortMonthDay(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function addMinutesToTime(time: string, minutes: number) {
  const [hours = "0", mins = "0"] = time.split(":");
  const date = new Date("2026-01-01T00:00:00");
  date.setHours(Number(hours), Number(mins) + minutes, 0, 0);
  return date.toTimeString().slice(0, 5);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRouteOrders(appointments: Appointment[]) {
  const activeByDate = new Map<string, Appointment[]>();

  appointments.forEach((appt) => {
    if (appt.status === "cancelled") return;
    activeByDate.set(appt.date, [...(activeByDate.get(appt.date) ?? []), appt]);
  });

  const routeOrderById = new Map<string, number>();
  activeByDate.forEach((dayAppointments) => {
    [...dayAppointments]
      .sort((a, b) => a.routeOrder - b.routeOrder || a.startTime.localeCompare(b.startTime))
      .forEach((appt, index) => routeOrderById.set(appt.id, index + 1));
  });

  return appointments.map((appt) => ({
    ...appt,
    routeOrder: routeOrderById.get(appt.id) ?? appt.routeOrder,
  }));
}

const unassignedBarn: AppData["barns"][number] = {
  id: "",
  name: "No barn assigned",
  clientIds: [],
  address: "",
  gateCode: "",
  parkingNotes: "",
  barnManagerName: "",
  barnManagerPhone: "",
  accessInstructions: "",
  horseIds: [],
};

const unassignedClient: AppData["clients"][number] = {
  id: "",
  firstName: "",
  lastName: "",
  name: "No owner assigned",
  phone: "",
  email: "",
  address: "",
  locationSource: "none",
  notes: "",
  horseIds: [],
  barnIds: [],
};

function App() {
  const [data, setData] = useState<AppData>(() => loadInitialData());
  const [storageReady, setStorageReady] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspace, setWorkspace] = useState<{ id: string; name: string; role: string } | null>(null);
  const [screen, setScreen] = useState<Screen>("today");
  const [selectedHorseId, setSelectedHorseId] = useState("");
  const [selectedFoot, setSelectedFoot] = useState<Foot | null>(null);
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("day");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(TODAY);
  const [mockPreview, setMockPreview] = useState("");
  const [locationStatus, setLocationStatus] = useState("Manual address ready.");
  const [finishType, setFinishType] = useState<ServiceType>("full_set");
  const [finishNote, setFinishNote] = useState("");
  const [cycleChange, setCycleChange] = useState("");
  const [verified, setVerified] = useState(true);
  const [activeAppointmentId, setActiveAppointmentId] = useState<string | null>(null);
  const [finishSetups, setFinishSetups] = useState<Partial<Record<Foot, ShoeSetup>>>({});
  const [search, setSearch] = useState("");
  const [selectedIntakeClientId, setSelectedIntakeClientId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState<{ clientId: string; step: "resume" | "delete" } | null>(null);
  const [clientPendingDeleteId, setClientPendingDeleteId] = useState<string | null>(null);
  const [horsePendingDeleteId, setHorsePendingDeleteId] = useState<string | null>(null);
  const [collapsedClientIds, setCollapsedClientIds] = useState<string[]>([]);
  const [calendarScheduleOpen, setCalendarScheduleOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [coifLinks, setCoifLinks] = useState<CoifLinkRecord[]>([]);
  const [coifSubmissions, setCoifSubmissions] = useState<CoifSubmissionRecord[]>([]);
  const [coifRefreshKey, setCoifRefreshKey] = useState(0);
  const [latestCoifUrl, setLatestCoifUrl] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"existing" | "new">("existing");
  const [scheduleClientSearch, setScheduleClientSearch] = useState("");
  const [scheduleClientId, setScheduleClientId] = useState("");
  const [scheduleHorseIds, setScheduleHorseIds] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState(TODAY);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [sendConfirmationSms, setSendConfirmationSms] = useState(false);
  const [scheduleNewClient, setScheduleNewClient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    address: "",
    barnId: "",
    horseNames: "",
  });

  useEffect(() => {
    hydrateData().then((saved) => {
      setData(saved);
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    getCurrentSession()
      .then(setSession)
      .catch((error) => setMockPreview(error instanceof Error ? error.message : "Could not check account session."))
      .finally(() => setAuthReady(true));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setWorkspace(null);
      return;
    }
    getCurrentWorkspace()
      .then(setWorkspace)
      .catch((error) => setMockPreview(error instanceof Error ? error.message : "Could not load workspace."));
  }, [session]);

  useEffect(() => {
    if (!workspace) { setCoifLinks([]); setCoifSubmissions([]); return; }
    Promise.all([listCoifLinks(workspace.id), listCoifSubmissions(workspace.id)])
      .then(([links, submissions]) => { setCoifLinks(links); setCoifSubmissions(submissions); })
      .catch((error) => setMockPreview(error instanceof Error ? error.message : "Could not load COIF records."));
  }, [workspace, coifRefreshKey]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") setCoifRefreshKey((current) => current + 1);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (storageReady)
      saveData(data).catch(() => setMockPreview("Could not save locally. Export a backup before closing."));
  }, [data, storageReady]);

  useEffect(() => {
    const preference = data.preferences?.theme ?? "system";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [data.preferences?.theme]);

  function downloadBackup() {
    const blob = new Blob([createBackup(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `farrieros-backup-${TODAY}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMockPreview("FarrierOS backup exported.");
  }

  async function importBackup(file: File | undefined) {
    if (!file) return;
    try {
      const restored = parseBackup(await file.text());
      setData(restored);
      await saveData(restored);
      setMockPreview("Backup restored successfully.");
    } catch (error) {
      setMockPreview(error instanceof Error ? error.message : "Could not restore that backup.");
    }
  }

  const horse = data.horses.find((item) => item.id === selectedHorseId) ?? data.horses[0] ?? null;
  const client = horse
    ? (data.clients.find((item) => item.id === horse.ownerClientId) ?? unassignedClient)
    : unassignedClient;
  const barn = horse ? (data.barns.find((item) => item.id === horse.barnPropertyId) ?? unassignedBarn) : unassignedBarn;
  const fullAccess = hasFullAccess(data.membership);

  const todayAppointments = data.appointments
    .filter((appt) => appt.date === TODAY && appt.status !== "cancelled")
    .sort((a, b) => a.routeOrder - b.routeOrder);
  const tomorrowAppointments = data.appointments
    .filter((appt) => appt.date === TOMORROW && appt.status !== "cancelled")
    .sort((a, b) => a.routeOrder - b.routeOrder);

  const currentSetups = useMemo(() => {
    if (!horse) return [];
    return feet
      .map((foot) => {
        const record = data.footRecords.find((item) => item.id === horse.footRecordIds[foot]);
        const setup = record ? data.shoeSetups.find((item) => item.id === record.currentSetupId) : null;
        if (!record || !setup) return null;
        return { foot, record, setup };
      })
      .filter(Boolean) as { foot: Foot; record: AppData["footRecords"][number]; setup: ShoeSetup }[];
  }, [data, horse]);

  function patchData(next: AppData) {
    setData({ ...next });
  }

  function startClientIntake(initialPatch: Partial<AppData["clients"][number]> = {}) {
    const clientId = makeId("client");
    const newClient = {
      id: clientId,
      intakeDraft: true,
      firstName: "",
      lastName: "",
      name: "New Client",
      phone: "",
      email: "",
      address: "",
      locationSource: "none" as const,
      notes: "",
      horseIds: [],
      barnIds: [],
      ...initialPatch,
    };
    patchData({
      ...data,
      clients: [...data.clients, newClient],
    });
    setSelectedIntakeClientId(clientId);
    setScreen("addClient");
    setMockPreview("Client draft saved.");
    return clientId;
  }

  function openAddClient() {
    const unfinished = data.clients.find((item) => item.intakeDraft);
    setSelectedIntakeClientId(null);
    setScreen("addClient");
    if (unfinished) setDraftPrompt({ clientId: unfinished.id, step: "resume" });
  }

  function navigateFromMenu(nextScreen: Screen) {
    const activeDraft = data.clients.find((item) => item.id === selectedIntakeClientId && item.intakeDraft);
    setScreen(nextScreen);
    if (nextScreen !== "addClient" && activeDraft) setDraftPrompt({ clientId: activeDraft.id, step: "resume" });
  }

  function openMobileScreen(nextScreen: Screen) {
    setMobileMenuOpen(false);
    navigateFromMenu(nextScreen);
  }

  function updateClient(clientId: string, patch: Partial<AppData["clients"][number]>) {
    patchData({
      ...data,
      clients: data.clients.map((clientItem) => {
        if (clientItem.id !== clientId) return clientItem;
        const nextClient = { ...clientItem, ...patch };
        const first = nextClient.firstName?.trim() ?? "";
        const last = nextClient.lastName?.trim() ?? "";
        return {
          ...nextClient,
          name: `${first} ${last}`.trim() || nextClient.name || "New Client",
        };
      }),
    });
  }

  function assignClientBarn(clientId: string, mode: "none" | "existing" | "new", barnId?: string) {
    const newBarnId = mode === "new" ? makeId("barn") : barnId;
    const selectedBarn = mode === "existing" ? data.barns.find((barnItem) => barnItem.id === newBarnId) : null;
    const newBarn =
      mode === "new"
        ? {
            id: newBarnId!,
            name: "New Barn",
            clientIds: [clientId],
            address: "",
            gateCode: "",
            parkingNotes: "",
            barnManagerName: "",
            barnManagerPhone: "",
            accessInstructions: "",
            horseIds: [],
          }
        : null;

    patchData({
      ...data,
      barns: [
        ...data.barns.map((barnItem) => {
          const shouldHaveClient = mode === "existing" && barnItem.id === newBarnId;
          return {
            ...barnItem,
            clientIds: shouldHaveClient
              ? Array.from(new Set([...barnItem.clientIds, clientId]))
              : barnItem.clientIds.filter((id) => id !== clientId),
          };
        }),
        ...(newBarn ? [newBarn] : []),
      ],
      clients: data.clients.map((clientItem) => {
        if (clientItem.id !== clientId) return clientItem;
        const hasManualAddress = clientItem.locationSource === "manual" && Boolean(clientItem.address?.trim());
        const inheritedAddress = !hasManualAddress && selectedBarn?.address ? selectedBarn.address : clientItem.address;
        return {
          ...clientItem,
          address: inheritedAddress,
          locationSource:
            inheritedAddress && inheritedAddress === selectedBarn?.address
              ? ("barn" as const)
              : clientItem.locationSource,
          barnIds: mode === "none" ? [] : [newBarnId!],
        };
      }),
      horses: data.horses.map((horseItem) =>
        horseItem.ownerClientId === clientId
          ? { ...horseItem, barnPropertyId: mode === "none" ? "" : newBarnId! }
          : horseItem,
      ),
    });
  }

  function updateBarn(barnId: string, patch: Partial<AppData["barns"][number]>) {
    const nextBarnAddress = patch.address;
    patchData({
      ...data,
      barns: data.barns.map((barnItem) => (barnItem.id === barnId ? { ...barnItem, ...patch } : barnItem)),
      clients:
        nextBarnAddress !== undefined
          ? data.clients.map((clientItem) => {
              if (!clientItem.barnIds.includes(barnId)) return clientItem;
              const hasManualAddress = clientItem.locationSource === "manual" && Boolean(clientItem.address?.trim());
              if (hasManualAddress) return clientItem;
              return {
                ...clientItem,
                address: nextBarnAddress,
                locationSource: nextBarnAddress ? "barn" : clientItem.locationSource,
              };
            })
          : data.clients,
    });
  }

  function addHorseForClient(clientId: string) {
    const clientItem = data.clients.find((item) => item.id === clientId);
    const barnId = clientItem?.barnIds[0] ?? "";
    const horseId = makeId("horse");
    const serviceRecordId = makeId("service-draft");
    const footRecordIds = feet.reduce(
      (acc, foot) => ({ ...acc, [foot]: makeId(`foot-${foot.toLowerCase()}`) }),
      {} as Record<Foot, string>,
    );
    const setups = feet.map((foot) => ({
      id: makeId(`setup-${foot.toLowerCase()}`),
      horseId,
      foot,
      serviceRecordId,
      shoeBrand: "TBD",
      shoeModel: "TBD",
      shoeSize: "TBD",
      clips: "TBD",
      pads: "TBD",
      wedges: "TBD",
      borium: "TBD",
      modifications: "TBD",
      fitNotes: "New horse intake. Setup not verified yet.",
      verified: false,
      verifiedAt: "",
      changedThisCycle: "",
    }));
    const footRecords = feet.map((foot) => ({
      id: footRecordIds[foot],
      horseId,
      foot,
      currentSetupId: setups.find((setup) => setup.foot === foot)!.id,
      historySetupIds: [],
      trimmedPhotoIds: [],
      finishedShoePhotoIds: [],
      notes: [],
    }));
    const newHorse: Horse = {
      id: horseId,
      name: "",
      breed: "",
      color: "",
      age: "",
      ownerClientId: clientId,
      barnPropertyId: barnId,
      temperament: "",
      safetyNotes: "",
      serviceIntervalWeeks: 6,
      lastServiceDate: "",
      nextDueDate: "",
      footRecordIds,
      verifiedSetupId: "",
      notes: [],
      photoDocumentIds: [],
    };

    patchData({
      ...data,
      clients: data.clients.map((client) =>
        client.id === clientId ? { ...client, horseIds: [...client.horseIds, horseId] } : client,
      ),
      barns: data.barns.map((barnItem) =>
        barnItem.id === barnId ? { ...barnItem, horseIds: [...barnItem.horseIds, horseId] } : barnItem,
      ),
      horses: [...data.horses, newHorse],
      footRecords: [...data.footRecords, ...footRecords],
      shoeSetups: [...data.shoeSetups, ...setups],
    });
    setMockPreview("Horse draft saved.");
  }

  function updateHorse(horseId: string, patch: Partial<Horse>) {
    patchData({
      ...data,
      horses: data.horses.map((horseItem) => (horseItem.id === horseId ? { ...horseItem, ...patch } : horseItem)),
    });
  }

  function updateBusiness(patch: Partial<AppData["business"]>) {
    patchData({ ...data, business: { ...data.business, ...patch } });
  }

  function buildHorseDraft(clientId: string, barnId: string, name = "") {
    const horseId = makeId("horse");
    const serviceRecordId = makeId("service-draft");
    const footRecordIds = feet.reduce(
      (acc, foot) => ({ ...acc, [foot]: makeId(`foot-${foot.toLowerCase()}`) }),
      {} as Record<Foot, string>,
    );
    const setups = feet.map((foot) => ({
      id: makeId(`setup-${foot.toLowerCase()}`),
      horseId,
      foot,
      serviceRecordId,
      shoeBrand: "TBD",
      shoeModel: "TBD",
      shoeSize: "TBD",
      clips: "TBD",
      pads: "TBD",
      wedges: "TBD",
      borium: "TBD",
      modifications: "TBD",
      fitNotes: "New scheduled horse. Setup not verified yet.",
      verified: false,
      verifiedAt: "",
      changedThisCycle: "",
    }));
    const footRecords = feet.map((foot) => ({
      id: footRecordIds[foot],
      horseId,
      foot,
      currentSetupId: setups.find((setup) => setup.foot === foot)!.id,
      historySetupIds: [],
      trimmedPhotoIds: [],
      finishedShoePhotoIds: [],
      notes: [],
    }));
    const horseDraft: Horse = {
      id: horseId,
      name,
      breed: "",
      color: "",
      age: "",
      ownerClientId: clientId,
      barnPropertyId: barnId,
      temperament: "",
      safetyNotes: "",
      serviceIntervalWeeks: 6,
      lastServiceDate: "",
      nextDueDate: "",
      footRecordIds,
      verifiedSetupId: "",
      notes: [],
      photoDocumentIds: [],
    };

    return { horse: horseDraft, footRecords, setups };
  }

  async function generateCoif(ownerName: string, ownerPhone: string) {
    if (!workspace) { setMockPreview("Sign in and wait for your workspace before creating a COIF link."); return; }
    try {
      const created = await createCoifLink(workspace.id, ownerName, ownerPhone);
      setLatestCoifUrl(created.url);
      setCoifLinks(await listCoifLinks(workspace.id));
      await navigator.clipboard?.writeText(created.url).catch(() => undefined);
      setMockPreview("Secure 30-day COIF link created and copied when permitted.");
    } catch (error) { setMockPreview(error instanceof Error ? error.message : "Could not create COIF link."); }
  }

  async function importCoifSubmission(submission: CoifSubmissionRecord) {
    const phoneKey = submission.owner_contact.phone.replace(/\D/g, "");
    if (phoneKey && data.clients.some((client) => client.phone.replace(/\D/g, "") === phoneKey)) {
      setMockPreview("A client with this phone number already exists. Review that portfolio before importing a duplicate.");
      return;
    }
    const clientId = makeId("client");
    const barnId = makeId("barn");
    const horseDrafts = submission.horse_intakes.map((intake) => {
      const draft = buildHorseDraft(clientId, barnId, intake.name);
      return { ...draft, horse: { ...draft.horse, breed: intake.breed, color: intake.color, age: intake.age, temperament: intake.temperament, safetyNotes: intake.safetyNotes, serviceIntervalWeeks: intake.serviceIntervalWeeks || 6, notes: [intake.lamenessIssues, intake.medicalNotes, intake.currentService ? `Current service: ${intake.currentService}` : "", intake.use ? `Use: ${intake.use}` : ""].filter(Boolean) } };
    });
    const ownerName = coifOwnerName(submission.owner_contact);
    const firstName = submission.owner_contact.firstName?.trim() || ownerName.split(/\s+/)[0] || "";
    const lastName = submission.owner_contact.lastName?.trim() || ownerName.split(/\s+/).slice(1).join(" ");
    patchData({
      ...data,
      clients: [...data.clients, { id: clientId, firstName, lastName, name: ownerName, phone: submission.owner_contact.phone, email: submission.owner_contact.email, address: submission.property_and_access.serviceAddress, locationSource: "manual", notes: "", horseIds: horseDrafts.map((draft) => draft.horse.id), barnIds: [barnId] }],
      barns: [...data.barns, { id: barnId, name: submission.property_and_access.name || `${ownerName} Property`, clientIds: [clientId], address: submission.property_and_access.serviceAddress, gateCode: submission.property_and_access.gateCode, parkingNotes: "", barnManagerName: "", barnManagerPhone: "", accessInstructions: submission.property_and_access.otherInstructions || submission.property_and_access.accessInstructions || "", horseIds: horseDrafts.map((draft) => draft.horse.id) }],
      horses: [...data.horses, ...horseDrafts.map((draft) => draft.horse)],
      footRecords: [...data.footRecords, ...horseDrafts.flatMap((draft) => draft.footRecords)],
      shoeSetups: [...data.shoeSetups, ...horseDrafts.flatMap((draft) => draft.setups)],
    });
    await markCoifImported(submission.id, submission.link_id, [clientId, barnId, ...horseDrafts.map((draft) => draft.horse.id)]);
    if (workspace) setCoifSubmissions(await listCoifSubmissions(workspace.id));
    setSelectedIntakeClientId(clientId);
    setMockPreview(`${ownerName} and ${horseDrafts.length} horse${horseDrafts.length === 1 ? "" : "s"} imported.`);
  }

  async function revokeCoif(id: string) {
    try {
      await revokeCoifLink(id);
      if (workspace) setCoifLinks(await listCoifLinks(workspace.id));
      setMockPreview("COIF link revoked.");
    } catch (error) { setMockPreview(error instanceof Error ? error.message : "Could not revoke COIF link."); }
  }

  function editClient(clientId: string) {
    setSelectedIntakeClientId(clientId);
    setHorsePendingDeleteId(null);
    setScreen("addClient");
  }

  function toggleClientCard(clientId: string) {
    setCollapsedClientIds((current) =>
      current.includes(clientId) ? current.filter((id) => id !== clientId) : [...current, clientId],
    );
  }

  function removeHorse(horseId: string) {
    const horseToRemove = data.horses.find((horseItem) => horseItem.id === horseId);
    if (!horseToRemove) return;

    const footRecordIds = new Set(
      data.footRecords.filter((record) => record.horseId === horseId).map((record) => record.id),
    );
    const setupIds = new Set(data.shoeSetups.filter((setup) => setup.horseId === horseId).map((setup) => setup.id));
    const serviceIds = new Set(
      data.serviceRecords.filter((service) => service.horseId === horseId).map((service) => service.id),
    );
    const photoIds = new Set(data.photos.filter((photo) => photo.horseId === horseId).map((photo) => photo.id));
    const remainingHorses = data.horses.filter((horseItem) => horseItem.id !== horseId);

    patchData({
      ...data,
      clients: data.clients.map((clientItem) => ({
        ...clientItem,
        horseIds: clientItem.horseIds.filter((id) => id !== horseId),
      })),
      barns: data.barns.map((barnItem) => ({
        ...barnItem,
        horseIds: barnItem.horseIds.filter((id) => id !== horseId),
      })),
      horses: remainingHorses,
      footRecords: data.footRecords.filter((record) => !footRecordIds.has(record.id)),
      shoeSetups: data.shoeSetups.filter((setup) => !setupIds.has(setup.id)),
      serviceRecords: data.serviceRecords.filter((service) => !serviceIds.has(service.id)),
      appointments: normalizeRouteOrders(
        data.appointments
          .map((appointment) => ({
            ...appointment,
            horseIds: appointment.horseIds.filter((id) => id !== horseId),
          }))
          .filter((appointment) => appointment.horseIds.length > 0),
      ),
      photos: data.photos.filter((photo) => !photoIds.has(photo.id)),
    });

    setHorsePendingDeleteId(null);
    setSelectedHorseId((current) => (current === horseId ? (remainingHorses[0]?.id ?? "") : current));
    setMockPreview(`${horseToRemove.name || "Horse"} removed.`);
  }

  function deleteClient(clientId: string) {
    const clientToDelete = data.clients.find((clientItem) => clientItem.id === clientId);
    if (!clientToDelete) return;

    const horseIds = new Set(clientToDelete.horseIds);
    const footRecordIds = new Set(
      data.footRecords.filter((record) => horseIds.has(record.horseId)).map((record) => record.id),
    );
    const setupIds = new Set(data.shoeSetups.filter((setup) => horseIds.has(setup.horseId)).map((setup) => setup.id));
    const serviceIds = new Set(
      data.serviceRecords.filter((service) => horseIds.has(service.horseId)).map((service) => service.id),
    );
    const photoIds = new Set(data.photos.filter((photo) => horseIds.has(photo.horseId)).map((photo) => photo.id));

    const remainingHorses = data.horses.filter((horseItem) => !horseIds.has(horseItem.id));
    const nextSelectedHorse = remainingHorses[0]?.id ?? "";

    patchData({
      ...data,
      clients: data.clients.filter((clientItem) => clientItem.id !== clientId),
      barns: data.barns.map((barnItem) => ({
        ...barnItem,
        clientIds: barnItem.clientIds.filter((id) => id !== clientId),
        horseIds: barnItem.horseIds.filter((id) => !horseIds.has(id)),
      })),
      horses: remainingHorses,
      footRecords: data.footRecords.filter((record) => !footRecordIds.has(record.id)),
      shoeSetups: data.shoeSetups.filter((setup) => !setupIds.has(setup.id)),
      serviceRecords: data.serviceRecords.filter((service) => !serviceIds.has(service.id)),
      appointments: normalizeRouteOrders(
        data.appointments
          .map((appointment) => ({
            ...appointment,
            horseIds: appointment.horseIds.filter((id) => !horseIds.has(id)),
          }))
          .filter((appointment) => appointment.clientId !== clientId && appointment.horseIds.length > 0),
      ),
      photos: data.photos.filter((photo) => !photoIds.has(photo.id)),
    });

    setClientPendingDeleteId(null);
    setSelectedIntakeClientId((current) => (current === clientId ? null : current));
    setSelectedHorseId(nextSelectedHorse);
    setMockPreview(`${clientToDelete.name || "Client"} deleted.`);
  }

  function updateAppointment(id: string, patch: Partial<Appointment>, pingMessage?: string) {
    const ping: ActivityPing | null = pingMessage
      ? {
          id: makeId("ping"),
          actorName: "Demo Farrier",
          message: pingMessage,
          createdAt: new Date().toISOString(),
          read: false,
        }
      : null;
    patchData({
      ...data,
      appointments: normalizeRouteOrders(
        data.appointments.map((appt) => (appt.id === id ? { ...appt, ...patch } : appt)),
      ),
      activityPings: ping ? [ping, ...data.activityPings] : data.activityPings,
    });
    if (ping) setMockPreview(`System notification: ${ping.message}`);
  }

  function updatePreferences(patch: Partial<NonNullable<AppData["preferences"]>>) {
    patchData({
      ...data,
      preferences: { theme: "system", currency: "USD", ...(data.preferences ?? {}), ...patch },
    });
  }

  function addExpense(expense: BusinessExpense) {
    patchData({ ...data, expenses: [expense, ...(data.expenses ?? [])] });
    setMockPreview("Business expense saved.");
  }

  function addIncome(income: BusinessIncome) {
    patchData({ ...data, incomeEntries: [income, ...(data.incomeEntries ?? [])] });
    setMockPreview("Income saved to the selected date.");
  }

  function updateIncome(id: string, patch: Partial<BusinessIncome>) {
    patchData({ ...data, incomeEntries: (data.incomeEntries ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) });
    setMockPreview("Income entry updated.");
  }

  function updateExpense(id: string, patch: Partial<BusinessExpense>) {
    patchData({ ...data, expenses: (data.expenses ?? []).map((item) => item.id === id ? { ...item, ...patch } : item) });
    setMockPreview("Expense entry updated.");
  }

  function openScheduleAppointment(date: string) {
    const firstClient = data.clients[0];
    setSelectedCalendarDate(date);
    setScheduleDate(date);
    setScheduleTime("09:00");
    setSendConfirmationSms(false);
    setScheduleMode(firstClient ? "existing" : "new");
    setScheduleClientId(firstClient?.id ?? "");
    setScheduleHorseIds(firstClient?.horseIds ?? []);
    setCalendarScheduleOpen(true);
  }

  function scheduleExistingClient(date: string, time: string, sendSms: boolean) {
    const selectedClient = data.clients.find((clientItem) => clientItem.id === scheduleClientId);
    if (!selectedClient) return;
    const selectedHorses = scheduleHorseIds.length > 0 ? scheduleHorseIds : selectedClient.horseIds;
    if (selectedHorses.length === 0) {
      setMockPreview("Add or select at least one horse before scheduling.");
      return;
    }
    const barnId =
      data.horses.find((horseItem) => selectedHorses.includes(horseItem.id) && horseItem.barnPropertyId)
        ?.barnPropertyId ??
      selectedClient.barnIds[0] ??
      "";
    const appointment: Appointment = {
      id: makeId("appt"),
      date,
      startTime: time,
      endTime: addMinutesToTime(time, 60),
      barnPropertyId: barnId,
      clientId: selectedClient.id,
      horseIds: selectedHorses,
      status: "scheduled",
      routeOrder: getAppointmentsForDate(data, date).length + 1,
      notes: "Scheduled from month view.",
      recurringIntervalWeeks: 6,
      shoesPrepped: false,
      prepNote: "",
    };
    const message = `Scheduled ${selectedClient.name || "client"} for ${formatDate(date)} at ${time}.`;
    const smsMessage = sendSms ? ` Mock SMS confirmation queued for ${selectedClient.name || "client"}.` : "";

    patchData({
      ...data,
      appointments: normalizeRouteOrders([...data.appointments, appointment]),
      activityPings: [
        {
          id: makeId("ping"),
          actorName: "System",
          message: `${message}${smsMessage}`,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...data.activityPings,
      ],
    });
    setCalendarScheduleOpen(false);
    setMockPreview(`System notification: ${message}${smsMessage}`);
  }

  function scheduleNewClientFromCalendar(date: string, time: string, sendSms: boolean) {
    const clientId = makeId("client");
    const first = scheduleNewClient.firstName.trim();
    const last = scheduleNewClient.lastName.trim();
    const clientName = `${first} ${last}`.trim() || "New Client";
    const barnId = scheduleNewClient.barnId;
    const horseNames = scheduleNewClient.horseNames
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (horseNames.length === 0) horseNames.push("");
    const horseDrafts = horseNames.map((name) => buildHorseDraft(clientId, barnId, name));
    const horseIds = horseDrafts.map((draft) => draft.horse.id);
    const newClient = {
      id: clientId,
      firstName: first,
      lastName: last,
      name: clientName,
      phone: scheduleNewClient.phone,
      email: "",
      address: scheduleNewClient.address,
      locationSource: scheduleNewClient.address ? ("manual" as const) : ("none" as const),
      notes: "",
      horseIds,
      barnIds: barnId ? [barnId] : [],
    };
    const appointment: Appointment = {
      id: makeId("appt"),
      date,
      startTime: time,
      endTime: addMinutesToTime(time, 60),
      barnPropertyId: barnId,
      clientId,
      horseIds,
      status: "scheduled",
      routeOrder: getAppointmentsForDate(data, date).length + 1,
      notes: "New client scheduled from month view.",
      recurringIntervalWeeks: 6,
      shoesPrepped: false,
      prepNote: "",
    };
    const message = `Added and scheduled ${clientName} for ${formatDate(date)} at ${time}.`;
    const smsMessage = sendSms ? ` Mock SMS confirmation queued for ${clientName}.` : "";

    patchData({
      ...data,
      clients: [...data.clients, newClient],
      barns: data.barns.map((barnItem) =>
        barnItem.id === barnId
          ? {
              ...barnItem,
              clientIds: Array.from(new Set([...barnItem.clientIds, clientId])),
              horseIds: [...barnItem.horseIds, ...horseIds],
            }
          : barnItem,
      ),
      horses: [...data.horses, ...horseDrafts.map((draft) => draft.horse)],
      footRecords: [...data.footRecords, ...horseDrafts.flatMap((draft) => draft.footRecords)],
      shoeSetups: [...data.shoeSetups, ...horseDrafts.flatMap((draft) => draft.setups)],
      appointments: normalizeRouteOrders([...data.appointments, appointment]),
      activityPings: [
        {
          id: makeId("ping"),
          actorName: "System",
          message: `${message}${smsMessage}`,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...data.activityPings,
      ],
    });
    setScheduleClientId(clientId);
    setScheduleHorseIds(horseIds);
    setCalendarScheduleOpen(false);
    setScheduleNewClient({ firstName: "", lastName: "", phone: "", address: "", barnId: "", horseNames: "" });
    setMockPreview(`System notification: ${message}${smsMessage}`);
  }

  function openHorse(nextHorse: Horse) {
    setSelectedHorseId(nextHorse.id);
    setSelectedFoot(null);
    setScreen("horses");
  }

  function openFinish(horseId: string, appointmentId: string | null = null) {
    const nextHorse = data.horses.find((item) => item.id === horseId);
    if (!nextHorse) return;
    const drafts = feet.reduce(
      (result, foot) => {
        const record = data.footRecords.find((item) => item.id === nextHorse.footRecordIds[foot]);
        const setup = record ? data.shoeSetups.find((item) => item.id === record.currentSetupId) : undefined;
        if (setup) result[foot] = { ...setup };
        return result;
      },
      {} as Partial<Record<Foot, ShoeSetup>>,
    );
    setSelectedHorseId(horseId);
    setActiveAppointmentId(appointmentId);
    setFinishSetups(drafts);
    setFinishNote("");
    setCycleChange("");
    setVerified(true);
    setScreen("finish");
  }

  function openMaps() {
    if (!barn.address) {
      setMockPreview("No barn address is saved yet. Add an address before opening maps.");
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(barn.address)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function captureCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("This browser does not expose location. Use manual address or map pin.");
      return;
    }
    setLocationStatus("Asking browser for location permission...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationStatus(
          `Current location captured: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}.`,
        );
      },
      () => setLocationStatus("Location permission was not granted. Manual address and map pin still work."),
    );
  }

  function saveVerifiedSetup() {
    if (!horse || currentSetups.length === 0) {
      setMockPreview("Add a horse and foot setup before saving a verified setup.");
      return;
    }
    const setupDrafts = currentSetups.reduce(
      (drafts, { foot, setup }) => {
        drafts[foot] = finishSetups[foot] ?? setup;
        return drafts;
      },
      {} as Partial<Record<Foot, ShoeSetup>>,
    );
    const result = completeJob({
      data,
      horseId: horse.id,
      appointmentId: activeAppointmentId,
      serviceDate: TODAY,
      serviceType: finishType,
      setupDrafts,
      writtenNotes: finishNote,
      cycleChange,
      verified,
      markAppointmentComplete: false,
    });
    patchData({ ...result.data, appointments: normalizeRouteOrders(result.data.appointments) });
    const nextDueDate = result.nextDueDate;
    setMockPreview(
      `${verified ? "Saved verified setup" : "Saved unverified service record"} for ${horse.name}. Next due: ${formatDate(nextDueDate)}.`,
    );
    setSelectedFoot("RF");
    setScreen("horses");
  }

  return (
    <div className="app-shell">
      <aside className="nav-rail">
        <div className="brand-block">
          <BrandMark />
          <div>
            <strong>FarrierOS</strong>
            <span>Field Operations</span>
          </div>
        </div>
        <nav>
          {primaryScreens.map((key) => (
            <button
              className={screen === key ? "active" : ""}
              key={key}
              onClick={() => navigateFromMenu(key)}
            >
              <AppIcon name={key as AppIconName} />
              <span>{screenLabels[key]}</span>
            </button>
          ))}
        </nav>
        <button className="add-client-button" onClick={openAddClient}>
          <AppIcon name="add" />
          <span>Add Client</span>
        </button>
        <button className="ghost-button" onClick={downloadBackup}>
          Export Backup
        </button>
        <label className="ghost-button import-backup">
          Restore Backup
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => importBackup(event.target.files?.[0])}
          />
        </label>
        <button
          className="ghost-button"
          onClick={async () => {
            setData(await resetData());
            setSelectedHorseId("");
            setScheduleClientId("");
            setScheduleHorseIds([]);
            setMockPreview("Workspace cleared.");
          }}
        >
          Clear Local Workspace
        </button>
      </aside>

      {mobileMenuOpen && (
        <div className="mobile-menu-layer">
          <button
            aria-label="Close navigation menu"
            className="mobile-menu-scrim"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside aria-label="Mobile navigation" className="mobile-nav-drawer">
            <div className="mobile-drawer-heading">
              <div className="brand-block">
                <BrandMark />
                <div>
                  <strong>FarrierOS</strong>
                  <span>Field Operations</span>
                </div>
              </div>
              <button aria-label="Close navigation menu" className="icon-close" onClick={() => setMobileMenuOpen(false)}>
                ×
              </button>
            </div>
            <nav>
              {primaryScreens.map((key) => (
                <button className={screen === key ? "active" : ""} key={key} onClick={() => openMobileScreen(key)}>
                  <AppIcon name={key as AppIconName} />
                  <span>{screenLabels[key]}</span>
                </button>
              ))}
            </nav>
            <button
              className="add-client-button"
              onClick={() => {
                setMobileMenuOpen(false);
                openAddClient();
              }}
            >
              <AppIcon name="add" />
              <span>Add Client</span>
            </button>
            <button className={screen === "account" ? "active" : ""} onClick={() => openMobileScreen("account")}>
              <AppIcon name="account" />
              <span>Account & Membership</span>
            </button>
          </aside>
        </div>
      )}

      <main>
        <header className="topbar">
          <div className="topbar-title">
            <button
              aria-expanded={mobileMenuOpen}
              aria-label="Open navigation menu"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
            >
              <span aria-hidden="true" className="mobile-menu-icon">☰</span>
              <span>Menu</span>
            </button>
            <div>
            <p className="eyebrow">{data.business.businessName}</p>
            <h1>{screenLabels[screen]}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <div className={online ? "offline-pill" : "offline-pill offline"}>
              {online ? "Local data ready" : "Offline - changes stay on this device"}
            </div>
            <button
              className={screen === "account" ? "account-button active" : "account-button"}
              onClick={() => setScreen("account")}
            >
              <AppIcon name="account" />
              <span>Account</span>
            </button>
          </div>
        </header>

        {!fullAccess && screen !== "account" && <MembershipGate onAccount={() => setScreen("account")} />}

        {fullAccess && screen === "today" && (
          <TodayScreen
            appointments={todayAppointments}
            data={data}
            onHorse={openHorse}
            onMaps={openMaps}
            onPrep={() => setScreen("prep")}
            onStart={(appointment) => {
              const firstHorseId = appointment.horseIds[0];
              if (firstHorseId) openFinish(firstHorseId, appointment.id);
              else setMockPreview("No horse is attached to this stop yet.");
            }}
            onStatus={(id, patch, message) =>
              updateAppointment(id, patch, message ?? "Today board updated: appointment status changed.")
            }
          />
        )}

        {fullAccess && screen === "calendar" && (
          <CalendarScreen
            calendarView={calendarView}
            data={data}
            selectedDate={selectedCalendarDate}
            setCalendarView={setCalendarView}
            setSelectedDate={setSelectedCalendarDate}
            onHorse={openHorse}
            onReschedule={(appointmentId, date) =>
              updateAppointment(appointmentId, { date }, `Moved appointment to ${formatDate(date)}.`)
            }
            onAddAppointment={openScheduleAppointment}
            scheduleOpen={calendarScheduleOpen}
            setScheduleOpen={setCalendarScheduleOpen}
            scheduleMode={scheduleMode}
            setScheduleMode={setScheduleMode}
            clientSearch={scheduleClientSearch}
            setClientSearch={setScheduleClientSearch}
            scheduleClientId={scheduleClientId}
            setScheduleClientId={(clientId) => {
              const nextClient = data.clients.find((clientItem) => clientItem.id === clientId);
              setScheduleClientId(clientId);
              setScheduleHorseIds(nextClient?.horseIds ?? []);
            }}
            scheduleHorseIds={scheduleHorseIds}
            setScheduleHorseIds={setScheduleHorseIds}
            scheduleDate={scheduleDate}
            setScheduleDate={(date) => {
              setScheduleDate(date);
              setSelectedCalendarDate(date);
            }}
            scheduleTime={scheduleTime}
            setScheduleTime={setScheduleTime}
            sendConfirmationSms={sendConfirmationSms}
            setSendConfirmationSms={setSendConfirmationSms}
            scheduleNewClient={scheduleNewClient}
            setScheduleNewClient={setScheduleNewClient}
            onScheduleExisting={scheduleExistingClient}
            onScheduleNew={scheduleNewClientFromCalendar}
          />
        )}

        {fullAccess && screen === "clients" && (
          <ClientsScreen
            data={data}
            locationStatus={locationStatus}
            onLocation={captureCurrentLocation}
            onHorse={openHorse}
            onEditClient={editClient}
            collapsedClientIds={collapsedClientIds}
            onToggleClientCard={toggleClientCard}
            pendingDeleteClientId={clientPendingDeleteId}
            onRequestDeleteClient={setClientPendingDeleteId}
            onCancelDeleteClient={() => setClientPendingDeleteId(null)}
            onConfirmDeleteClient={deleteClient}
          />
        )}

        {fullAccess && screen === "addClient" && (
          <AddClientScreen
            data={data}
            selectedClientId={selectedIntakeClientId}
            setSelectedClientId={setSelectedIntakeClientId}
            onStartManualClient={startClientIntake}
            onFinishManualClient={(clientId) => updateClient(clientId, { intakeDraft: false })}
            onUpdateClient={updateClient}
            onAssignBarn={assignClientBarn}
            onUpdateBarn={updateBarn}
            onAddHorse={addHorseForClient}
            onUpdateHorse={updateHorse}
            horsePendingDeleteId={horsePendingDeleteId}
            onRequestRemoveHorse={setHorsePendingDeleteId}
            onCancelRemoveHorse={() => setHorsePendingDeleteId(null)}
            onConfirmRemoveHorse={removeHorse}
            onUseLocation={(clientId) => {
              updateClient(clientId, { locationSource: "browser" });
              captureCurrentLocation();
            }}
            workspaceReady={Boolean(workspace)}
            coifLinks={coifLinks}
            coifSubmissions={coifSubmissions}
            latestCoifUrl={latestCoifUrl}
            onGenerateCoif={generateCoif}
            onImportCoif={importCoifSubmission}
            onRevokeCoif={revokeCoif}
            onRefreshCoif={() => setCoifRefreshKey((current) => current + 1)}
          />
        )}

        {fullAccess &&
          screen === "horses" &&
          (horse ? (
            <HorsesScreen
              data={data}
              horse={horse}
              search={search}
              selectedFoot={selectedFoot}
              setSearch={setSearch}
              setSelectedFoot={setSelectedFoot}
              setSelectedHorseId={setSelectedHorseId}
              onFinish={() => {
                const appointment = todayAppointments.find((appt) => appt.horseIds.includes(horse.id));
                openFinish(horse.id, appointment?.id ?? null);
              }}
              onPrep={() => setScreen("prep")}
            />
          ) : (
            <EmptyHorsePanel onAddClient={openAddClient} />
          ))}

        {fullAccess && screen === "prep" && (
          <PrepScreen
            data={data}
            appointments={tomorrowAppointments}
            onHorse={openHorse}
            onFinish={(appointment, prepHorse) => openFinish(prepHorse.id, appointment.id)}
            onTogglePrep={(id, shoesPrepped) =>
              updateAppointment(
                id,
                { shoesPrepped },
                shoesPrepped ? "Shoes marked prepped for tomorrow." : "Prep mark removed.",
              )
            }
            onPrepNote={(id, prepNote) =>
              updateAppointment(id, { prepNote }, "Prep note updated for tomorrow's route.")
            }
          />
        )}

        {fullAccess && screen === "finish" && (
          <CurrentStopScreen
            appointments={todayAppointments}
            activeAppointmentId={activeAppointmentId}
            data={data}
            onSelect={(appointment) => {
              const firstHorseId = appointment.horseIds[0];
              if (firstHorseId) openFinish(firstHorseId, appointment.id);
              else setActiveAppointmentId(appointment.id);
            }}
            onStart={(appointment) =>
              updateAppointment(appointment.id, { startedAt: new Date().toISOString(), status: "in_progress" }, "Stop timer started.")
            }
            onComplete={(appointment, earningsCents, durationSeconds) => {
              updateAppointment(
                appointment.id,
                { status: "complete", completedAt: new Date().toISOString(), durationSeconds, earningsCents },
                "Stop completed and earnings logged.",
              );
              setMockPreview("Stop completed and earnings saved.");
            }}
            details={horse && activeAppointmentId ? (
              <FinishScreen
              horse={horse}
              client={client}
              barn={barn}
              currentSetups={feet.map((foot) => finishSetups[foot]).filter(Boolean) as ShoeSetup[]}
              onSetupChange={(foot, patch) =>
                setFinishSetups((current) => ({
                  ...current,
                  [foot]: current[foot] ? { ...current[foot]!, ...patch } : current[foot],
                }))
              }
              finishType={finishType}
              setFinishType={setFinishType}
              finishNote={finishNote}
              setFinishNote={setFinishNote}
              cycleChange={cycleChange}
              setCycleChange={setCycleChange}
              verified={verified}
              setVerified={setVerified}
              onSave={saveVerifiedSetup}
              />
            ) : null}
          />
        )}

        {fullAccess && screen === "finances" && (
          <section className="account-layout finance-screen-layout">
            <FinanceScreen
              data={data}
              onAddExpense={addExpense}
              onAddIncome={addIncome}
              onUpdateAppointment={(id, patch) => updateAppointment(id, patch)}
              onUpdateExpense={updateExpense}
              onUpdateIncome={updateIncome}
              onCurrency={(currency) => updatePreferences({ currency })}
            />
          </section>
        )}

        {screen === "account" && (
          <AccountScreen
            business={data.business}
            membership={data.membership}
            configured={integrationStatus.supabase}
            authReady={authReady}
            session={session}
            workspace={workspace}
            data={data}
            onPreferences={updatePreferences}
            onUpdateBusiness={updateBusiness}
            onMessage={setMockPreview}
            onBilling={() =>
              setMockPreview("Live Stripe Checkout will be connected when hosting and billing credentials are ready.")
            }
          />
        )}
      </main>

      {draftPrompt && (
        <div className="modal-scrim" role="presentation">
          <div aria-modal="true" className="schedule-modal" role="dialog">
            <div className="modal-heading"><div><p className="eyebrow">Manual client intake</p><h2>{draftPrompt.step === "resume" ? "Intake form in progress" : "Delete unfinished intake?"}</h2></div></div>
            <p>{draftPrompt.step === "resume" ? "Manual Client Intake Form in Progress — would you like to continue adding this client?" : "Would you like to delete the current Client Intake Form in Progress?"}</p>
            <div className="modal-actions">
              {draftPrompt.step === "resume" ? <>
                <button className="primary" onClick={() => { setSelectedIntakeClientId(draftPrompt.clientId); setScreen("addClient"); setDraftPrompt(null); }}>Yes, Continue</button>
                <button onClick={() => setDraftPrompt({ ...draftPrompt, step: "delete" })}>No</button>
              </> : <>
                <button className="danger-button" onClick={() => { deleteClient(draftPrompt.clientId); setDraftPrompt(null); }}>Yes, Delete</button>
                <button onClick={() => setDraftPrompt(null)}>No, Keep It</button>
              </>}
            </div>
          </div>
        </div>
      )}

      {mockPreview && (
        <div className="toast" role="status">
          <button aria-label="Close preview" onClick={() => setMockPreview("")}>
            ×
          </button>
          {mockPreview}
        </div>
      )}
    </div>
  );
}

function MembershipGate(props: { onAccount: () => void }) {
  return (
    <section className="membership-gate work-panel">
      <p className="eyebrow">Membership required</p>
      <h2>FarrierOS Full Access</h2>
      <p>Your field records remain stored on this device. Restore membership to continue using app services.</p>
      <button className="primary" onClick={props.onAccount}>
        View Membership
      </button>
    </section>
  );
}

function AccountScreen(props: {
  data: AppData;
  business: AppData["business"];
  membership: AppData["membership"];
  configured: boolean;
  authReady: boolean;
  session: Session | null;
  workspace: { id: string; name: string; role: string } | null;
  onUpdateBusiness: (patch: Partial<AppData["business"]>) => void;
  onMessage: (message: string) => void;
  onBilling: () => void;
  onPreferences: (patch: Partial<NonNullable<AppData["preferences"]>>) => void;
}) {
  const [authMode, setAuthMode] = useState<"signin" | "register">("signin");
  const [fullName, setFullName] = useState(props.business.farrierName);
  const [email, setEmail] = useState(props.business.email);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const statusLabel =
    props.membership.status === "development" ? "Development access" : props.membership.status.replace("_", " ");

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (authMode === "register") {
        const result = await registerFarrier(email.trim(), password, fullName.trim());
        props.onMessage(
          result.session
            ? "FarrierOS account created and signed in."
            : "Account created. Check your email to confirm your FarrierOS account.",
        );
      } else {
        await signInFarrier(email.trim(), password);
        props.onMessage("Signed in to FarrierOS.");
      }
      setPassword("");
    } catch (error) {
      props.onMessage(error instanceof Error ? error.message : "Account request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="account-layout">
      <div className="work-panel account-auth-card">
        <p className="eyebrow">FarrierOS account</p>
        {!props.configured ? (
          <div className="billing-notice">
            <strong>Cloud accounts are not configured on this device.</strong>
            <p>Local records remain available and unchanged.</p>
          </div>
        ) : !props.authReady ? (
          <p className="helper-text">Checking your account…</p>
        ) : props.session ? (
          <div className="signed-in-summary">
            <span className="status good">Signed in</span>
            <h2>{props.workspace?.name ?? "Preparing your workspace…"}</h2>
            <p>{props.session.user.email}</p>
            <dl className="detail-list compact-details">
              <div>
                <dt>Workspace role</dt>
                <dd>{props.workspace?.role?.replace("_", " ") ?? "Loading"}</dd>
              </div>
              <div>
                <dt>Cloud records</dt>
                <dd>Ready for reviewed import</dd>
              </div>
            </dl>
            <button
              className="ghost-button"
              onClick={async () => {
                try {
                  await signOutFarrier();
                  props.onMessage("Signed out. Local records remain on this device.");
                } catch (error) {
                  props.onMessage(error instanceof Error ? error.message : "Could not sign out.");
                }
              }}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <>
            <div className="segmented auth-segmented">
              <button className={authMode === "signin" ? "active" : ""} onClick={() => setAuthMode("signin")}>
                Sign In
              </button>
              <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>
                Create Account
              </button>
            </div>
            <form className="auth-form" onSubmit={submitAuth}>
              {authMode === "register" && (
                <label className="search-label">
                  Farrier name
                  <input
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </label>
              )}
              <label className="search-label">
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="search-label">
                Password
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <button className="primary save-button" disabled={submitting} type="submit">
                {submitting ? "Please wait…" : authMode === "register" ? "Create FarrierOS Account" : "Sign In"}
              </button>
            </form>
            {authMode === "signin" && (
              <button
                className="text-action"
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    props.onMessage("Enter your email address first.");
                    return;
                  }
                  try {
                    await sendPasswordReset(email.trim());
                    props.onMessage("Password reset email sent.");
                  } catch (error) {
                    props.onMessage(error instanceof Error ? error.message : "Could not send password reset.");
                  }
                }}
              >
                Forgot password?
              </button>
            )}
            <p className="helper-text">Signing in does not upload this device’s local records automatically.</p>
          </>
        )}
      </div>

      <div className="work-panel membership-card">
        <p className="eyebrow">Membership</p>
        <div className="section-heading">
          <div>
            <h2>{props.membership.planName}</h2>
            <p className="membership-price">
              {formatMonthlyPrice(props.membership)}
              <span>/month</span>
            </p>
          </div>
          <span className="status good">{statusLabel}</span>
        </div>
        <ul className="plain-list membership-features">
          <li>Complete Today, Calendar, Clients, Horses, Prep, and Current Stop access</li>
          <li>Four-foot verified setup history</li>
          <li>Offline local records and JSON backups</li>
          <li>All current FarrierOS services—no feature restrictions</li>
        </ul>
        {props.membership.billingProvider === "development" && (
          <div className="billing-notice">
            <strong>Development membership is active.</strong>
            <p>No charge has been made. Live checkout requires the hosted backend and Stripe credentials.</p>
          </div>
        )}
        <button className="primary save-button" onClick={props.onBilling}>
          {props.membership.billingProvider === "development" ? "Preview Billing Setup" : "Manage Billing"}
        </button>
      </div>

      <div className="work-panel">
        <p className="eyebrow">Appearance</p>
        <h2>Theme</h2>
        <p className="helper-text">System follows the current light or dark setting on this device.</p>
        <div className="segmented wrap">
          {(["system", "light", "dark"] as ThemePreference[]).map((theme) => (
            <button
              className={(props.data.preferences?.theme ?? "system") === theme ? "active" : ""}
              key={theme}
              onClick={() => props.onPreferences({ theme })}
            >
              {theme[0].toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="work-panel">
        <p className="eyebrow">Farrier profile</p>
        <h2>Business details</h2>
        <div className="form-grid">
          <label className="search-label">
            Business name
            <input
              value={props.business.businessName}
              onChange={(event) => props.onUpdateBusiness({ businessName: event.target.value })}
            />
          </label>
          <label className="search-label">
            Farrier name
            <input
              value={props.business.farrierName}
              onChange={(event) => props.onUpdateBusiness({ farrierName: event.target.value })}
            />
          </label>
          <label className="search-label">
            Email
            <input
              type="email"
              value={props.business.email}
              onChange={(event) => props.onUpdateBusiness({ email: event.target.value })}
            />
          </label>
          <label className="search-label">
            Phone
            <input
              type="tel"
              value={props.business.phone}
              onChange={(event) => props.onUpdateBusiness({ phone: event.target.value })}
            />
          </label>
          <label className="search-label">
            Base location
            <input
              value={props.business.baseLocation}
              onChange={(event) => props.onUpdateBusiness({ baseLocation: event.target.value })}
            />
          </label>
          <label className="search-label">
            Default interval
            <input
              type="number"
              min="1"
              max="16"
              value={props.business.defaultServiceIntervalWeeks}
              onChange={(event) =>
                props.onUpdateBusiness({ defaultServiceIntervalWeeks: Number(event.target.value) || 1 })
              }
            />
          </label>
        </div>
        <p className="helper-text">Profile edits remain local until you review and approve the first cloud import.</p>
      </div>
    </section>
  );
}

function TodayScreen(props: {
  appointments: Appointment[];
  data: AppData;
  onHorse: (horse: Horse) => void;
  onMaps: () => void;
  onPrep: () => void;
  onStart: (appointment: Appointment) => void;
  onStatus: (id: string, patch: Partial<Appointment>, message?: string) => void;
}) {
  const [manageAppointmentId, setManageAppointmentId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(TODAY);
  const [rescheduleTime, setRescheduleTime] = useState("09:00");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const manageAppointment = props.appointments.find((appt) => appt.id === manageAppointmentId) ?? null;
  const quickDates = Array.from({ length: 30 }, (_, index) => addDays(TODAY, index));
  const tomorrowHorseIds = new Set(
    props.data.appointments
      .filter((appointment) => appointment.date === TOMORROW && appointment.status !== "cancelled")
      .flatMap((appointment) => appointment.horseIds),
  );
  const inventoryCounts = new Map<string, number>();

  props.data.horses
    .filter((horse) => tomorrowHorseIds.has(horse.id))
    .forEach((horse) => {
      feet.forEach((foot) => {
        const record = props.data.footRecords.find((item) => item.id === horse.footRecordIds[foot]);
        const setup = record
          ? props.data.shoeSetups.find((item) => item.id === record.currentSetupId)
          : undefined;
        if (!setup) return;

        const shoeParts = [setup.shoeBrand, setup.shoeModel]
          .map((part) => part.trim())
          .filter((part) => part && part.toUpperCase() !== "TBD");
        const size = setup.shoeSize.trim();
        if (shoeParts.length) {
          const item = `${shoeParts.join(" ")}${size && size.toUpperCase() !== "TBD" ? `, size ${size}` : ""}`;
          inventoryCounts.set(item, (inventoryCounts.get(item) ?? 0) + 1);
        }
        [
          ["Pads", setup.pads],
          ["Wedges", setup.wedges],
          ["Borium", setup.borium],
        ].forEach(([label, value]) => {
          const detail = value.trim();
          if (!detail || detail.toLowerCase() === "none" || detail.toUpperCase() === "TBD") return;
          const item = `${label}: ${detail}`;
          inventoryCounts.set(item, (inventoryCounts.get(item) ?? 0) + 1);
        });
      });
    });

  const requiredInventory = Array.from(inventoryCounts.entries()).map(([item, quantity]) =>
    quantity > 1 ? `${quantity} × ${item}` : item,
  );
  const completedStops = props.appointments.filter((appointment) => appointment.status === "complete").length;
  const scheduledHorses = new Set(props.appointments.flatMap((appointment) => appointment.horseIds)).size;
  const todayEarnings = props.appointments.reduce((sum, appointment) => sum + (appointment.earningsCents ?? 0), 0);
  const currency = props.data.preferences?.currency ?? "USD";
  const earningsLabel = new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(todayEarnings / 100);
  const nextStop = props.appointments.find((appointment) => appointment.status !== "complete" && appointment.status !== "cancelled");
  const nextBarn = nextStop ? props.data.barns.find((item) => item.id === nextStop.barnPropertyId) : null;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  function openManageStop(appt: Appointment) {
    setManageAppointmentId(appt.id);
    setRescheduleDate(appt.date);
    setRescheduleTime(appt.startTime);
    setConfirmCancel(false);
  }

  function closeManageStop() {
    setManageAppointmentId(null);
    setConfirmCancel(false);
  }

  return (
    <section className="screen-grid today-dashboard">
      <div className="today-command">
        <div className="today-welcome"><p className="eyebrow">Daily command center</p><h2>{greeting}{props.data.business.farrierName ? `, ${props.data.business.farrierName.split(" ")[0]}` : ""}.</h2><p>{nextStop ? <>Next up at <strong>{nextStop.startTime}</strong> — {nextBarn?.name || "unnamed property"}.</> : "Your route is clear. Add a stop from the calendar when you are ready."}</p></div>
        <div className="today-summary-grid">
          <div><span>Today’s stops</span><strong>{props.appointments.length}</strong><small>{completedStops} completed</small></div>
          <div><span>Horses</span><strong>{scheduledHorses}</strong><small>on today’s route</small></div>
          <div><span>Logged revenue</span><strong>{earningsLabel}</strong><small>completed stops</small></div>
          <div><span>Tomorrow</span><strong>{tomorrowHorseIds.size}</strong><small>horses to prep</small></div>
        </div>
      </div>
      <div className="work-panel route-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Route order</p>
            <h2>{formatDate(TODAY)}</h2>
          </div>
          <button onClick={props.onPrep}>Prep Tomorrow</button>
        </div>
        {props.appointments.length === 0 && <div className="empty-state premium-empty"><span className="empty-state-icon">◇</span><div><strong>No stops scheduled today</strong><p>Your day is clear. Use Calendar to schedule a client and their horses.</p></div></div>}
        {props.appointments.map((appt) => {
          const barn = props.data.barns.find((item) => item.id === appt.barnPropertyId) ?? unassignedBarn;
          const client = props.data.clients.find((item) => item.id === appt.clientId) ?? unassignedClient;
          const smsHref = createSmsHref(
            client.phone,
            buildOnMyWayMessage(props.data.business.businessName, barn.name, appt.startTime),
          );
          const horses = appt.horseIds
            .map((id) => props.data.horses.find((horse) => horse.id === id))
            .filter(Boolean) as Horse[];
          return (
            <article className="appointment-row" key={appt.id}>
              <div className="route-number">{appt.routeOrder}</div>
              <div className="appointment-body">
                <p className="eyebrow">
                  {appt.startTime} - {appt.status.replace("_", " ")}
                </p>
                <h3>{barn.name}</h3>
                <p>{barn.address || "No address saved"}</p>
                <div className="horse-chip-row">
                  {horses.length === 0 && <span className="empty-inline">No horses attached</span>}
                  {horses.map((horse) => (
                    <button className="horse-chip" key={horse.id} onClick={() => props.onHorse(horse)}>
                      {horse.name || "Unnamed Horse"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="button-stack">
                <button className="primary" onClick={() => props.onStart(appt)}>
                  Start Job
                </button>
                <button onClick={props.onMaps}>Navigate</button>
                {smsHref ? (
                  <a className="button-link" href={smsHref}>
                    On My Way
                  </a>
                ) : (
                  <button disabled title="Add a client phone number first">
                    On My Way
                  </button>
                )}
                <button onClick={() => openManageStop(appt)}>Cancel/Reschedule</button>
                <button onClick={() => props.onStatus(appt.id, { status: "complete" })}>Mark Complete</button>
              </div>
            </article>
          );
        })}
      </div>
      <div className="work-panel">
        <p className="eyebrow">Field inventory</p>
        <h2>Tomorrow's Required Inventory</h2>
        <p className="helper-text">Calculated from tomorrow's scheduled horses and their saved setups.</p>
        {requiredInventory.length ? (
          <ul className="plain-list">
            {requiredInventory.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No inventory requirements yet. Schedule tomorrow's stops and save horse setups to build this list.</p>
        )}
      </div>
      {manageAppointment && (
        <div className="modal-scrim" role="presentation" onMouseDown={closeManageStop}>
          <div
            aria-modal="true"
            className="schedule-modal today-stop-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Cancel or reschedule</p>
                <h2>Stop {manageAppointment.routeOrder}</h2>
              </div>
              <button className="icon-close" aria-label="Close cancel or reschedule" onClick={closeManageStop}>
                X
              </button>
            </div>

            <div className="mini-calendar">
              {quickDates.map((date) => (
                <button
                  className={rescheduleDate === date ? "mini-day active" : "mini-day"}
                  key={date}
                  onClick={() => setRescheduleDate(date)}
                >
                  <span>{dayName(date)}</span>
                  <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
                  <small>{shortMonthDay(date).split(" ")[0]}</small>
                </button>
              ))}
            </div>

            <div className="form-grid">
              <label className="search-label">
                Date
                <input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} />
              </label>
              <label className="search-label">
                Time
                <input type="time" value={rescheduleTime} onChange={(event) => setRescheduleTime(event.target.value)} />
              </label>
            </div>

            {confirmCancel && (
              <div className="confirm-cancel-box">
                <strong>Confirm cancellation</strong>
                <p className="helper-text">This will mark the stop cancelled and notify the shared board.</p>
              </div>
            )}

            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => {
                  props.onStatus(
                    manageAppointment.id,
                    {
                      date: rescheduleDate,
                      startTime: rescheduleTime,
                      endTime: addMinutesToTime(rescheduleTime, 60),
                      routeOrder:
                        rescheduleDate === manageAppointment.date
                          ? manageAppointment.routeOrder
                          : props.data.appointments.filter(
                              (appt) =>
                                appt.id !== manageAppointment.id &&
                                appt.date === rescheduleDate &&
                                appt.status !== "cancelled",
                            ).length + 1,
                      status: "scheduled",
                    },
                    `Rescheduled stop ${manageAppointment.routeOrder} to ${formatDate(rescheduleDate)} at ${rescheduleTime}.`,
                  );
                  closeManageStop();
                }}
              >
                Reschedule
              </button>
              {confirmCancel ? (
                <button
                  className="danger-button"
                  onClick={() => {
                    props.onStatus(
                      manageAppointment.id,
                      { status: "cancelled" },
                      `Cancelled stop ${manageAppointment.routeOrder} on ${formatDate(manageAppointment.date)}.`,
                    );
                    closeManageStop();
                  }}
                >
                  Confirm Cancellation
                </button>
              ) : (
                <button className="danger-button" onClick={() => setConfirmCancel(true)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyHorsePanel(props: { onAddClient: () => void }) {
  return (
    <section className="work-panel full-width">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Horse record needed</p>
          <h2>No horse is selected</h2>
        </div>
      </div>
      <p className="helper-text">Add a client and horse to begin building your records.</p>
      <button className="primary" onClick={props.onAddClient}>
        Add Client
      </button>
    </section>
  );
}

function CalendarScreen(props: {
  calendarView: "day" | "week" | "month";
  data: AppData;
  selectedDate: string;
  setCalendarView: (view: "day" | "week" | "month") => void;
  setSelectedDate: (date: string) => void;
  onHorse: (horse: Horse) => void;
  onReschedule: (id: string, date: string) => void;
  onAddAppointment: (date: string) => void;
  scheduleOpen: boolean;
  setScheduleOpen: (open: boolean) => void;
  scheduleMode: "existing" | "new";
  setScheduleMode: (mode: "existing" | "new") => void;
  clientSearch: string;
  setClientSearch: (search: string) => void;
  scheduleClientId: string;
  setScheduleClientId: (clientId: string) => void;
  scheduleHorseIds: string[];
  setScheduleHorseIds: (horseIds: string[]) => void;
  scheduleDate: string;
  setScheduleDate: (date: string) => void;
  scheduleTime: string;
  setScheduleTime: (time: string) => void;
  sendConfirmationSms: boolean;
  setSendConfirmationSms: (send: boolean) => void;
  scheduleNewClient: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    barnId: string;
    horseNames: string;
  };
  setScheduleNewClient: (client: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    barnId: string;
    horseNames: string;
  }) => void;
  onScheduleExisting: (date: string, time: string, sendSms: boolean) => void;
  onScheduleNew: (date: string, time: string, sendSms: boolean) => void;
}) {
  const [weekAnchor, setWeekAnchor] = useState(TODAY);
  const [monthAnchor, setMonthAnchor] = useState(TODAY);
  const weekDays = Array.from({ length: 7 }, (_, index) => shiftDate(weekAnchor, index));
  const monthDays = Array.from({ length: 31 }, (_, index) => shiftDate(monthAnchor, index));
  const rangeLabel = (start: string, end: string) => {
    const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${format.format(new Date(`${start}T12:00:00`))} – ${format.format(new Date(`${end}T12:00:00`))}`;
  };
  const selectedAppointments = getAppointmentsForDate(props.data, props.selectedDate);

  return (
    <section className="screen-grid calendar-screen">
      <div className="work-panel wide">
        <div className="segmented">
          {(["day", "week", "month"] as const).map((view) => (
            <button
              className={props.calendarView === view ? "active" : ""}
              key={view}
              onClick={() => props.setCalendarView(view)}
            >
              {view === "month" ? "monthly" : view}
            </button>
          ))}
        </div>
        <div className="sync-panel">
          <div>
            <p className="eyebrow">Shared board</p>
            <strong>Schedule changes notify the team automatically.</strong>
          </div>
          <button
            className="primary compact-action"
            type="button"
            onClick={() => props.onAddAppointment(props.selectedDate)}
          >
            Add Stop
          </button>
        </div>

        {props.calendarView === "day" && (
          <>
            <div className="day-header">
              <div>
                <p className="eyebrow">Day schedule</p>
                <h2>{formatDate(props.selectedDate)}</h2>
              </div>
              <input
                aria-label="Choose calendar day"
                type="date"
                value={props.selectedDate}
                onChange={(event) => props.setSelectedDate(event.target.value)}
              />
            </div>
            <DaySchedule
              appointments={selectedAppointments}
              data={props.data}
              onHorse={props.onHorse}
              onReschedule={props.onReschedule}
            />
          </>
        )}

        {props.calendarView === "week" && (
          <>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Upcoming 7 days</p>
                <h2>Horses By Day</h2>
              </div>
              <div className="calendar-window-controls"><button aria-label="Previous seven days" onClick={() => setWeekAnchor((date) => shiftDate(date, -7))}>‹</button><button onClick={() => { setWeekAnchor(TODAY); props.setSelectedDate(TODAY); }}>Today</button><button aria-label="Next seven days" onClick={() => setWeekAnchor((date) => shiftDate(date, 7))}>›</button></div>
            </div>
            <p className="rolling-range-label">{rangeLabel(weekDays[0], weekDays[6])}</p>
            <div className="week-grid">
              {weekDays.map((date) => (
                <button
                  className={props.selectedDate === date ? "calendar-block active" : "calendar-block"}
                  key={date}
                  onClick={() => props.setSelectedDate(date)}
                >
                  <span>{dayName(date)}</span>
                  <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
                  <small>{getHorseCount(props.data, date)} horses</small>
                </button>
              ))}
            </div>
            <DayBreakdown
              appointments={selectedAppointments}
              data={props.data}
              selectedDate={props.selectedDate}
              onHorse={props.onHorse}
              onReschedule={props.onReschedule}
            />
          </>
        )}

        {props.calendarView === "month" && (
          <>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Rolling 31-day schedule</p>
                <h2>{rangeLabel(monthDays[0], monthDays[30])}</h2>
              </div>
              <div className="calendar-window-controls"><button aria-label="Previous thirty-one days" onClick={() => setMonthAnchor((date) => shiftDate(date, -31))}>‹</button><button onClick={() => { setMonthAnchor(TODAY); props.setSelectedDate(TODAY); }}>Today</button><button aria-label="Next thirty-one days" onClick={() => setMonthAnchor((date) => shiftDate(date, 31))}>›</button></div>
            </div>
            <div className="month-grid">
              {(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const).map((day) => (
                <span className="month-weekday" key={day}>
                  {day}
                </span>
              ))}
              {monthDays.map((date, index) => {
                const dateValue = new Date(`${date}T12:00:00`);
                const startsMonth = dateValue.getDate() === 1;
                return (
                <button
                  className={`${props.selectedDate === date ? "month-cell active" : "month-cell"}${startsMonth ? " month-boundary" : ""}`}
                  key={date}
                  style={index === 0 ? { gridColumnStart: dateValue.getDay() + 1 } : undefined}
                  onClick={() => {
                    props.setSelectedDate(date);
                    props.setScheduleOpen(false);
                  }}
                >
                  {startsMonth && <em>{new Intl.DateTimeFormat("en-US", { month: "short" }).format(dateValue)}</em>}
                  <span>{dateValue.getDate()}</span>
                  <strong>{getHorseCount(props.data, date)}</strong>
                  <small>horses</small>
                </button>
              )})}
            </div>
            <div className="calendar-schedule-entry">
              <div>
                <p className="eyebrow">Selected day</p>
                <h3>{formatDate(props.selectedDate)}</h3>
              </div>
              <button className="primary compact-action wide-action" onClick={() => props.setScheduleOpen(true)}>
                Schedule Client
              </button>
            </div>
            <DayBreakdown
              appointments={selectedAppointments}
              data={props.data}
              selectedDate={props.selectedDate}
              onHorse={props.onHorse}
              onReschedule={props.onReschedule}
            />
          </>
        )}
      </div>
      <div className="work-panel">
        <TeamSharePanel data={props.data} />
      </div>
      {props.scheduleOpen && (
        <div className="modal-scrim" role="presentation" onMouseDown={() => props.setScheduleOpen(false)}>
          <div
            aria-modal="true"
            className="schedule-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ScheduleClientPanel
              data={props.data}
              selectedDate={props.selectedDate}
              mode={props.scheduleMode}
              setMode={props.setScheduleMode}
              clientSearch={props.clientSearch}
              setClientSearch={props.setClientSearch}
              scheduleClientId={props.scheduleClientId}
              setScheduleClientId={props.setScheduleClientId}
              scheduleHorseIds={props.scheduleHorseIds}
              setScheduleHorseIds={props.setScheduleHorseIds}
              scheduleDate={props.scheduleDate}
              setScheduleDate={props.setScheduleDate}
              scheduleTime={props.scheduleTime}
              setScheduleTime={props.setScheduleTime}
              sendConfirmationSms={props.sendConfirmationSms}
              setSendConfirmationSms={props.setSendConfirmationSms}
              scheduleNewClient={props.scheduleNewClient}
              setScheduleNewClient={props.setScheduleNewClient}
              onClose={() => props.setScheduleOpen(false)}
              onScheduleExisting={props.onScheduleExisting}
              onScheduleNew={props.onScheduleNew}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ScheduleClientPanel(props: {
  data: AppData;
  selectedDate: string;
  mode: "existing" | "new";
  setMode: (mode: "existing" | "new") => void;
  clientSearch: string;
  setClientSearch: (search: string) => void;
  scheduleClientId: string;
  setScheduleClientId: (clientId: string) => void;
  scheduleHorseIds: string[];
  setScheduleHorseIds: (horseIds: string[]) => void;
  scheduleDate: string;
  setScheduleDate: (date: string) => void;
  scheduleTime: string;
  setScheduleTime: (time: string) => void;
  sendConfirmationSms: boolean;
  setSendConfirmationSms: (send: boolean) => void;
  scheduleNewClient: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    barnId: string;
    horseNames: string;
  };
  setScheduleNewClient: (client: {
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    barnId: string;
    horseNames: string;
  }) => void;
  onClose: () => void;
  onScheduleExisting: (date: string, time: string, sendSms: boolean) => void;
  onScheduleNew: (date: string, time: string, sendSms: boolean) => void;
}) {
  const filteredClients = props.data.clients.filter((client) =>
    client.name.toLowerCase().includes(props.clientSearch.toLowerCase()),
  );
  const selectedClient =
    props.data.clients.find((client) => client.id === props.scheduleClientId) ?? filteredClients[0];
  const selectedClientHorses = selectedClient
    ? (selectedClient.horseIds
        .map((horseId) => props.data.horses.find((horse) => horse.id === horseId))
        .filter(Boolean) as Horse[])
    : [];
  const scheduleDates = Array.from({ length: 30 }, (_, index) => addDays(TODAY, index));

  function toggleHorse(horseId: string) {
    props.setScheduleHorseIds(
      props.scheduleHorseIds.includes(horseId)
        ? props.scheduleHorseIds.filter((id) => id !== horseId)
        : [...props.scheduleHorseIds, horseId],
    );
  }

  return (
    <div className="schedule-client-panel">
      <div className="modal-heading">
        <div>
          <p className="eyebrow">Add stop</p>
          <h2>{formatDate(props.scheduleDate)}</h2>
        </div>
        <button className="icon-close" aria-label="Close add stop" onClick={props.onClose}>
          X
        </button>
      </div>

      <div className="mini-calendar">
        {scheduleDates.map((date) => (
          <button
            className={props.scheduleDate === date ? "mini-day active" : "mini-day"}
            key={date}
            onClick={() => props.setScheduleDate(date)}
          >
            <span>{dayName(date)}</span>
            <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
            <small>{shortMonthDay(date).split(" ")[0]}</small>
          </button>
        ))}
      </div>

      <div className="form-grid">
        <label className="search-label">
          Date
          <input
            type="date"
            value={props.scheduleDate}
            onChange={(event) => props.setScheduleDate(event.target.value)}
          />
        </label>
        <label className="search-label">
          Time
          <input
            type="time"
            value={props.scheduleTime}
            onChange={(event) => props.setScheduleTime(event.target.value)}
          />
        </label>
      </div>

      <label className="check-row sms-confirm-row">
        <input
          type="checkbox"
          checked={props.sendConfirmationSms}
          onChange={(event) => props.setSendConfirmationSms(event.target.checked)}
        />
        <span>Send confirmation SMS to client</span>
      </label>

      <div className="segmented wrap">
        <button className={props.mode === "existing" ? "active" : ""} onClick={() => props.setMode("existing")}>
          Add Existing Client
        </button>
        <button className={props.mode === "new" ? "active" : ""} onClick={() => props.setMode("new")}>
          Add New Client
        </button>
      </div>

      {props.mode === "existing" ? (
        <div>
          <div className="form-grid">
            <label className="search-label">
              Search clients
              <input
                value={props.clientSearch}
                onChange={(event) => props.setClientSearch(event.target.value)}
                placeholder="Client name"
              />
            </label>
            <label className="search-label">
              Choose client
              <select
                value={selectedClient?.id ?? ""}
                onChange={(event) => props.setScheduleClientId(event.target.value)}
              >
                {filteredClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name || "New Client"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="subsection-header">
            <div>
              <p className="eyebrow">Horses</p>
              <h4>Select horses to schedule</h4>
            </div>
            <span>{props.scheduleHorseIds.length} selected</span>
          </div>
          <div className="check-list">
            {selectedClientHorses.length === 0 && <div className="empty-state">This client has no horses yet.</div>}
            {selectedClientHorses.map((horse) => (
              <label className="check-row" key={horse.id}>
                <input
                  type="checkbox"
                  checked={props.scheduleHorseIds.includes(horse.id)}
                  onChange={() => toggleHorse(horse.id)}
                />
                <span>{horse.name || "Unnamed Horse"}</span>
              </label>
            ))}
          </div>
          <button
            className="primary save-button"
            onClick={() => props.onScheduleExisting(props.scheduleDate, props.scheduleTime, props.sendConfirmationSms)}
          >
            Schedule Selected
          </button>
        </div>
      ) : (
        <div>
          <div className="form-grid">
            <label className="search-label">
              First name
              <input
                value={props.scheduleNewClient.firstName}
                onChange={(event) =>
                  props.setScheduleNewClient({ ...props.scheduleNewClient, firstName: event.target.value })
                }
                placeholder="First name"
              />
            </label>
            <label className="search-label">
              Last name
              <input
                value={props.scheduleNewClient.lastName}
                onChange={(event) =>
                  props.setScheduleNewClient({ ...props.scheduleNewClient, lastName: event.target.value })
                }
                placeholder="Last name"
              />
            </label>
            <label className="search-label">
              Phone
              <input
                value={props.scheduleNewClient.phone}
                onChange={(event) =>
                  props.setScheduleNewClient({ ...props.scheduleNewClient, phone: event.target.value })
                }
                placeholder="Phone"
              />
            </label>
            <label className="search-label">
              Barn
              <select
                value={props.scheduleNewClient.barnId}
                onChange={(event) =>
                  props.setScheduleNewClient({ ...props.scheduleNewClient, barnId: event.target.value })
                }
              >
                <option value="">No barn</option>
                {props.data.barns.map((barn) => (
                  <option key={barn.id} value={barn.id}>
                    {barn.name || "New Barn"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="search-label">
            Address
            <input
              value={props.scheduleNewClient.address}
              onChange={(event) =>
                props.setScheduleNewClient({ ...props.scheduleNewClient, address: event.target.value })
              }
              placeholder="Client address"
            />
          </label>
          <label className="search-label">
            Horse names
            <input
              value={props.scheduleNewClient.horseNames}
              onChange={(event) =>
                props.setScheduleNewClient({ ...props.scheduleNewClient, horseNames: event.target.value })
              }
              placeholder="Example: Fluffy, Duke, Blue"
            />
          </label>
          <button
            className="primary save-button"
            onClick={() => props.onScheduleNew(props.scheduleDate, props.scheduleTime, props.sendConfirmationSms)}
          >
            Add Client And Schedule
          </button>
        </div>
      )}
    </div>
  );
}

function getAppointmentsForDate(data: AppData, date: string) {
  return data.appointments
    .filter((appt) => appt.date === date && appt.status !== "cancelled")
    .sort((a, b) => a.routeOrder - b.routeOrder || a.startTime.localeCompare(b.startTime));
}

function getHorseCount(data: AppData, date: string) {
  return getAppointmentsForDate(data, date).reduce((total, appt) => total + appt.horseIds.length, 0);
}

function DaySchedule(props: {
  appointments: Appointment[];
  data: AppData;
  onHorse: (horse: Horse) => void;
  onReschedule: (id: string, date: string) => void;
}) {
  if (props.appointments.length === 0) {
    return <div className="empty-state">No horses scheduled for this day.</div>;
  }

  return (
    <div className="calendar-list">
      {props.appointments.map((appt) => (
        <ScheduleStop
          appointment={appt}
          data={props.data}
          key={appt.id}
          onHorse={props.onHorse}
          onReschedule={props.onReschedule}
        />
      ))}
    </div>
  );
}

function DayBreakdown(props: {
  appointments: Appointment[];
  data: AppData;
  selectedDate: string;
  onHorse: (horse: Horse) => void;
  onReschedule: (id: string, date: string) => void;
}) {
  return (
    <div className="day-breakdown">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Day details</p>
          <h2>{formatDate(props.selectedDate)}</h2>
        </div>
        <span className="status">{getHorseCount(props.data, props.selectedDate)} horses</span>
      </div>
      <DaySchedule
        appointments={props.appointments}
        data={props.data}
        onHorse={props.onHorse}
        onReschedule={props.onReschedule}
      />
    </div>
  );
}

function ScheduleStop(props: {
  appointment: Appointment;
  data: AppData;
  onHorse: (horse: Horse) => void;
  onReschedule: (id: string, date: string) => void;
}) {
  const barn = props.data.barns.find((item) => item.id === props.appointment.barnPropertyId) ?? unassignedBarn;
  const client = props.data.clients.find((item) => item.id === props.appointment.clientId) ?? unassignedClient;
  const horses = props.appointment.horseIds
    .map((id) => props.data.horses.find((horse) => horse.id === id))
    .filter(Boolean) as Horse[];

  return (
    <article className="stop-card">
      <div className="stop-main">
        <div className="stop-kicker">
          <span>Stop {props.appointment.routeOrder}</span>
          <span>{props.appointment.status.replace("_", " ")}</span>
        </div>
        <div className="stop-title-row">
          <div>
            <p className="eyebrow">Barn</p>
            <h3>{barn.name}</h3>
          </div>
          <div className="time-badge">
            <strong>{props.appointment.startTime}</strong>
            <span>{props.appointment.endTime}</span>
          </div>
        </div>
        <div className="stop-meta-grid">
          <div>
            <p className="eyebrow">Owner</p>
            <strong>{client.name}</strong>
          </div>
          <div>
            <p className="eyebrow">Horses</p>
            <strong>{horses.length} scheduled</strong>
          </div>
        </div>
        <div className="horse-chip-row stop-horses">
          {horses.length === 0 && <span className="empty-inline">No horses attached</span>}
          {horses.map((horse) => (
            <button className="horse-chip" key={horse.id} onClick={() => props.onHorse(horse)}>
              {horse.name || "Unnamed Horse"}
            </button>
          ))}
        </div>
        {props.appointment.notes && <p className="stop-note">{props.appointment.notes}</p>}
      </div>
      <div className="stop-actions">
        <label>
          <span className="eyebrow">Move stop</span>
          <input
            type="date"
            value={props.appointment.date}
            onChange={(event) => props.onReschedule(props.appointment.id, event.target.value)}
          />
        </label>
      </div>
    </article>
  );
}

function TeamSharePanel(props: { data: AppData }) {
  return (
    <>
      <p className="eyebrow">Shared schedule</p>
      <h2>Team Pings</h2>
      <p className="helper-text">Adds, moves, prep notes, and job status changes post here automatically.</p>
      <div className="team-list">
        {props.data.collaborationMembers.map((member) => (
          <div className="team-row" key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <span>{member.role.replace("_", " ")}</span>
            </div>
            <span className={member.notificationsEnabled ? "status good" : "status"}>
              {member.notificationsEnabled ? "Pings on" : "Off"}
            </span>
          </div>
        ))}
      </div>
      <div className="activity-feed">
        {props.data.activityPings.slice(0, 5).map((ping) => (
          <div className={ping.read ? "activity-row" : "activity-row unread"} key={ping.id}>
            <p className="eyebrow">{ping.actorName}</p>
            <strong>{ping.message}</strong>
            <span>{new Date(ping.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function CoifManager(props: { workspaceReady: boolean; links: CoifLinkRecord[]; submissions: CoifSubmissionRecord[]; latestUrl: string; onGenerate: (name: string, phone: string) => void; onImport: (submission: CoifSubmissionRecord) => void; onRevoke: (id: string) => void; onRefresh: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const review = props.submissions.find((item) => item.id === reviewId) ?? null;
  return <section className="coif-manager">
    <div className="coif-manager-hero"><div><p className="eyebrow">Client onboarding</p><h2>COIF Links</h2><p>Create a private 30-day form for an owner to enter their property and every horse.</p></div><div className="button-row"><button onClick={props.onRefresh}>Refresh Inbox</button><span className="status good">Workspace isolated</span></div></div>
    {!props.workspaceReady ? <div className="billing-notice">Sign in to create secure COIF links and receive submissions.</div> : <div className="coif-create-grid"><label>Owner name hint<input placeholder="Optional" value={name} onChange={(event) => setName(event.target.value)} /></label><label>Owner phone hint<input placeholder="Optional" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><button className="primary" onClick={() => props.onGenerate(name, phone)}>Create & Copy COIF Link</button></div>}
    {props.latestUrl && <div className="coif-share-box"><strong>New link—save or send it now</strong><input readOnly value={props.latestUrl} /><div className="button-row"><button onClick={() => navigator.clipboard?.writeText(props.latestUrl)}>Copy Link</button><a className="button-link" href={`sms:?&body=${encodeURIComponent(`Please complete your secure FarrierOS client onboarding form: ${props.latestUrl}`)}`}>Send by Text</a></div><small>For security, the plain link token is shown only when it is created.</small></div>}
    <div className="coif-metrics"><div><strong>{props.links.filter((link) => ["sent", "opened"].includes(link.status)).length}</strong><span>Active links</span></div><div><strong>{props.submissions.filter((item) => !item.reviewed_at).length}</strong><span>Awaiting review</span></div><div><strong>{props.submissions.filter((item) => item.reviewed_at).length}</strong><span>Imported</span></div></div>
    {props.links.some((link) => ["sent", "opened"].includes(link.status)) && <div className="coif-inbox"><h3>Active Links</h3>{props.links.filter((link) => ["sent", "opened"].includes(link.status)).map((link) => <div className="coif-inbox-row" key={link.id}><span><strong>{link.owner_name_hint || "Unnamed owner"}</strong><small>{link.status} · expires {new Date(link.expires_at).toLocaleDateString()}</small></span><button className="danger-button" onClick={() => props.onRevoke(link.id)}>Revoke</button></div>)}</div>}
    {props.submissions.length > 0 && <div className="coif-inbox"><h3>Submission Inbox</h3>{props.submissions.map((submission) => <button className={reviewId === submission.id ? "active coif-inbox-row" : "coif-inbox-row"} key={submission.id} onClick={() => setReviewId(submission.id)}><span><strong>{coifOwnerName(submission.owner_contact)}</strong><small>{submission.horse_intakes.length} horse{submission.horse_intakes.length === 1 ? "" : "s"} · {new Date(submission.submitted_at).toLocaleDateString()}</small></span><span className={submission.reviewed_at ? "status good" : "status"}>{submission.reviewed_at ? "Imported" : "Review"}</span></button>)}</div>}
    {review && <div className="coif-review"><div className="section-heading"><div><p className="eyebrow">Submission review</p><h3>{coifOwnerName(review.owner_contact)}</h3></div><button className="icon-close" onClick={() => setReviewId(null)}>×</button></div><div className="detail-grid"><div><span>Phone</span><strong>{review.owner_contact.phone}</strong></div><div><span>Email</span><strong>{review.owner_contact.email || "Not provided"}</strong></div><div><span>Service address</span><strong>{review.property_and_access.serviceAddress}</strong></div><div><span>Property</span><strong>{review.property_and_access.name || "Not named"}</strong></div></div>{(review.property_and_access.otherInstructions || review.property_and_access.accessInstructions) && <p><b>Other instructions:</b> {review.property_and_access.otherInstructions || review.property_and_access.accessInstructions}</p>}<div className="coif-review-horses">{review.horse_intakes.map((horse, index) => <article key={index}><strong>{horse.name}</strong><span>{[horse.breed, horse.age, horse.color].filter(Boolean).join(" · ") || "Details not provided"}</span>{horse.lamenessIssues && <p><b>Hoof care / handling:</b> {horse.lamenessIssues}</p>}{horse.safetyNotes && <p><b>Safety:</b> {horse.safetyNotes}</p>}</article>)}</div>{review.reviewed_at ? <p className="status good">Already imported into this portfolio.</p> : <button className="primary save-button" onClick={() => props.onImport(review)}>Approve & Import Portfolio</button>}</div>}
  </section>;
}

function AddClientScreen(props: {
  data: AppData;
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  onStartManualClient: (initialPatch?: Partial<AppData["clients"][number]>) => string;
  onFinishManualClient: (clientId: string) => void;
  onUpdateClient: (clientId: string, patch: Partial<AppData["clients"][number]>) => void;
  onAssignBarn: (clientId: string, mode: "none" | "existing" | "new", barnId?: string) => void;
  onUpdateBarn: (barnId: string, patch: Partial<AppData["barns"][number]>) => void;
  onAddHorse: (clientId: string) => void;
  onUpdateHorse: (horseId: string, patch: Partial<Horse>) => void;
  horsePendingDeleteId: string | null;
  onRequestRemoveHorse: (horseId: string) => void;
  onCancelRemoveHorse: () => void;
  onConfirmRemoveHorse: (horseId: string) => void;
  onUseLocation: (clientId: string) => void;
  workspaceReady: boolean;
  coifLinks: CoifLinkRecord[];
  coifSubmissions: CoifSubmissionRecord[];
  latestCoifUrl: string;
  onGenerateCoif: (name: string, phone: string) => void;
  onImportCoif: (submission: CoifSubmissionRecord) => void;
  onRevokeCoif: (id: string) => void;
  onRefreshCoif: () => void;
}) {
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const selectedClient = props.data.clients.find((client) => client.id === props.selectedClientId) ?? null;
  const assignedBarn = selectedClient?.barnIds[0]
    ? props.data.barns.find((barn) => barn.id === selectedClient.barnIds[0])
    : null;
  const clientHorses = selectedClient
    ? (selectedClient.horseIds
        .map((horseId) => props.data.horses.find((horse) => horse.id === horseId))
        .filter(Boolean) as Horse[])
    : [];

  if (!selectedClient) {
    return (
      <section className="work-panel full-width">
        <CoifManager workspaceReady={props.workspaceReady} links={props.coifLinks} submissions={props.coifSubmissions} latestUrl={props.latestCoifUrl} onGenerate={props.onGenerateCoif} onImport={props.onImportCoif} onRevoke={props.onRevokeCoif} onRefresh={props.onRefreshCoif} />
        <div className="section-heading"><div><p className="eyebrow">Manual entry</p><h2>Add New Client Manually</h2><p className="helper-text">A draft is created only after you type the first piece of information.</p></div>{!manualEntryOpen && <button className="primary" onClick={() => setManualEntryOpen(true)}>Add New Client Manually</button>}</div>
        {manualEntryOpen && <div className="form-grid manual-intake-starter">
          <label>First name<input autoFocus placeholder="Begin typing to save a draft" onChange={(event) => { if (event.target.value) props.onStartManualClient({ firstName: event.target.value, name: event.target.value }); }} /></label>
          <label>Last name<input placeholder="Begin typing to save a draft" onChange={(event) => { if (event.target.value) props.onStartManualClient({ lastName: event.target.value, name: event.target.value }); }} /></label>
          <label>Phone<input placeholder="Begin typing to save a draft" onChange={(event) => { if (event.target.value) props.onStartManualClient({ phone: event.target.value }); }} /></label>
          <label>Email<input type="email" placeholder="Begin typing to save a draft" onChange={(event) => { if (event.target.value) props.onStartManualClient({ email: event.target.value }); }} /></label>
          <label className="editor-wide">Address<input placeholder="Begin typing to save a draft" onChange={(event) => { if (event.target.value) props.onStartManualClient({ address: event.target.value, locationSource: "manual" }); }} /></label>
        </div>}
      </section>
    );
  }

  const barnValue = assignedBarn ? `existing:${assignedBarn.id}` : "none";

  return (
    <section className="intake-layout">
      <div className="work-panel intake-main">
        <CoifManager workspaceReady={props.workspaceReady} links={props.coifLinks} submissions={props.coifSubmissions} latestUrl={props.latestCoifUrl} onGenerate={props.onGenerateCoif} onImport={props.onImportCoif} onRevoke={props.onRevokeCoif} onRefresh={props.onRefreshCoif} />
        <div className="section-heading">
          <div>
            <p className="eyebrow">Client intake</p>
            <h2>Client Portfolio</h2>
            <p className="helper-text">Every field autosaves, even when partially filled.</p>
          </div>
          <button onClick={() => props.setSelectedClientId(null)}>Add Another Client</button>
        </div>

        <label className="search-label">
          Select client
          <select value={selectedClient.id} onChange={(event) => props.setSelectedClientId(event.target.value)}>
            {props.data.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name || "New Client"}
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid">
          <label className="search-label">
            First name
            <input
              value={selectedClient.firstName ?? ""}
              onChange={(event) => props.onUpdateClient(selectedClient.id, { firstName: event.target.value })}
              placeholder="First name"
            />
          </label>
          <label className="search-label">
            Last name
            <input
              value={selectedClient.lastName ?? ""}
              onChange={(event) => props.onUpdateClient(selectedClient.id, { lastName: event.target.value })}
              placeholder="Last name"
            />
          </label>
          <label className="search-label">
            Phone
            <input
              value={selectedClient.phone}
              onChange={(event) => props.onUpdateClient(selectedClient.id, { phone: event.target.value })}
              placeholder="Phone number"
            />
          </label>
          <label className="search-label">
            Address
            <input
              value={selectedClient.address ?? ""}
              onChange={(event) =>
                props.onUpdateClient(selectedClient.id, { address: event.target.value, locationSource: "manual" })
              }
              placeholder="Manual address"
            />
          </label>
        </div>

        <div className="button-row intake-actions">
          <button onClick={() => props.onUseLocation(selectedClient.id)}>Use Current Location</button>
          {selectedClient.intakeDraft && <button className="primary" onClick={() => props.onFinishManualClient(selectedClient.id)}>Finish Manual Intake</button>}
          <span className="status">
            {selectedClient.locationSource === "browser" ? "Browser location selected" : "Manual input ready"}
          </span>
        </div>

        <div className="barn-assignment">
          <label className="search-label">
            Barn assignment
            <select
              value={barnValue}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "none") props.onAssignBarn(selectedClient.id, "none");
                if (value === "new") props.onAssignBarn(selectedClient.id, "new");
                if (value.startsWith("existing:"))
                  props.onAssignBarn(selectedClient.id, "existing", value.replace("existing:", ""));
              }}
            >
              <option value="none">No barn</option>
              {props.data.barns.map((barn) => (
                <option key={barn.id} value={`existing:${barn.id}`}>
                  {barn.name}
                </option>
              ))}
              <option value="new">Add new barn</option>
            </select>
          </label>

          {assignedBarn && (
            <div className="form-grid">
              <label className="search-label">
                Barn name
                <input
                  value={assignedBarn.name}
                  onChange={(event) => props.onUpdateBarn(assignedBarn.id, { name: event.target.value })}
                  placeholder="Barn name"
                />
              </label>
              <label className="search-label">
                Barn address
                <input
                  value={assignedBarn.address}
                  onChange={(event) => props.onUpdateBarn(assignedBarn.id, { address: event.target.value })}
                  placeholder="Barn address"
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="work-panel intake-side">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Horse portfolio</p>
            <h2>Horses</h2>
          </div>
          <button className="primary compact-action" onClick={() => props.onAddHorse(selectedClient.id)}>
            Add Horse
          </button>
        </div>

        {clientHorses.length === 0 && <div className="empty-state">No horses added yet.</div>}

        <div className="horse-intake-list">
          {clientHorses.map((horseItem, index) => (
            <div className="horse-intake-card" key={horseItem.id}>
              <p className="eyebrow">Horse {index + 1}</p>
              <label className="search-label">
                Horse name
                <input
                  value={horseItem.name}
                  onChange={(event) => props.onUpdateHorse(horseItem.id, { name: event.target.value })}
                  placeholder="Horse name"
                />
              </label>
              <div className="form-grid compact">
                <label className="search-label">
                  Breed
                  <input
                    value={horseItem.breed ?? ""}
                    onChange={(event) => props.onUpdateHorse(horseItem.id, { breed: event.target.value })}
                    placeholder="Breed"
                  />
                </label>
                <label className="search-label">
                  Color
                  <input
                    value={horseItem.color ?? ""}
                    onChange={(event) => props.onUpdateHorse(horseItem.id, { color: event.target.value })}
                    placeholder="Color"
                  />
                </label>
              </div>
              <label className="search-label">
                Safety notes
                <textarea
                  value={horseItem.safetyNotes}
                  onChange={(event) => props.onUpdateHorse(horseItem.id, { safetyNotes: event.target.value })}
                  placeholder="Handling notes, safety concerns, or partial notes"
                />
              </label>
              <label className="search-label">
                Temperament
                <input
                  value={horseItem.temperament}
                  onChange={(event) => props.onUpdateHorse(horseItem.id, { temperament: event.target.value })}
                  placeholder="Temperament"
                />
              </label>
              {props.horsePendingDeleteId === horseItem.id ? (
                <div className="confirm-delete-panel">
                  <p>This will remove this horse and its saved schedule, setup, and foot history.</p>
                  <div className="button-row">
                    <button className="danger-button" onClick={() => props.onConfirmRemoveHorse(horseItem.id)}>
                      Confirm Remove
                    </button>
                    <button onClick={props.onCancelRemoveHorse}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="delete-link-button" onClick={() => props.onRequestRemoveHorse(horseItem.id)}>
                  Remove Horse
                </button>
              )}
            </div>
          ))}
        </div>

        {clientHorses.length > 0 && (
          <button className="save-button" onClick={() => props.onAddHorse(selectedClient.id)}>
            Add Additional Horse
          </button>
        )}
      </div>
    </section>
  );
}

function ClientsScreen(props: {
  data: AppData;
  locationStatus: string;
  onLocation: () => void;
  onHorse: (horse: Horse) => void;
  onEditClient: (clientId: string) => void;
  collapsedClientIds: string[];
  onToggleClientCard: (clientId: string) => void;
  pendingDeleteClientId: string | null;
  onRequestDeleteClient: (clientId: string) => void;
  onCancelDeleteClient: () => void;
  onConfirmDeleteClient: (clientId: string) => void;
}) {
  return (
    <section className="portfolio-layout">
      <div className="work-panel portfolio-list">
        <p className="eyebrow">Portfolio</p>
        <h2>Clients</h2>
        <div className="portfolio-stack">
          {props.data.clients.map((client) => {
            const clientHorses = client.horseIds
              .map((id) => props.data.horses.find((horse) => horse.id === id))
              .filter(Boolean) as Horse[];
            const affiliatedBarns = client.barnIds
              .map((id) => props.data.barns.find((barn) => barn.id === id))
              .filter(Boolean) as AppData["barns"];
            const isCollapsed = props.collapsedClientIds.includes(client.id);
            return (
              <div className={isCollapsed ? "portfolio-card collapsed-card" : "portfolio-card"} key={client.id}>
                <div className="section-heading compact-heading">
                  <div>
                    <p className="eyebrow">Client</p>
                    <h3>{client.name || "New Client"}</h3>
                  </div>
                  <div className="client-card-controls">
                    <span className="status">{clientHorses.length} horses</span>
                    <button
                      className={isCollapsed ? "arrow-toggle" : "arrow-toggle expanded"}
                      aria-label={isCollapsed ? "Expand client card" : "Collapse client card"}
                      aria-expanded={!isCollapsed}
                      onClick={() => props.onToggleClientCard(client.id)}
                    >
                      ›
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="client-card-body">
                    <dl className="mini-details">
                      <div>
                        <dt>Phone</dt>
                        <dd>{client.phone || "Not added"}</dd>
                      </div>
                      <div>
                        <dt>Client address</dt>
                        <dd>{client.address || "Not added"}</dd>
                      </div>
                      {affiliatedBarns.map((barn) => (
                        <div key={barn.id}>
                          <dt>Barn address</dt>
                          <dd>
                            {barn.name || "Barn"}: {barn.address || "Not added"}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <div className="subsection-header">
                      <div>
                        <p className="eyebrow">Horses</p>
                        <h4>Client Horses</h4>
                      </div>
                      <span>{clientHorses.length} total</span>
                    </div>
                    <div className="horse-chip-row">
                      {clientHorses.length === 0 && <span className="empty-inline">No horses yet</span>}
                      {clientHorses.map((horse) => (
                        <button className="horse-chip" key={horse.id} onClick={() => props.onHorse(horse)}>
                          {horse.name || "Unnamed Horse"}
                        </button>
                      ))}
                    </div>

                    <div className="portfolio-actions">
                      <button className="primary" onClick={() => props.onEditClient(client.id)}>
                        Edit Client
                      </button>
                    </div>
                    {props.pendingDeleteClientId === client.id ? (
                      <div className="confirm-delete-panel">
                        <p>This will delete the client and all saved horse, schedule, and setup information.</p>
                        <div className="button-row">
                          <button className="danger-button" onClick={() => props.onConfirmDeleteClient(client.id)}>
                            Confirm Delete
                          </button>
                          <button onClick={props.onCancelDeleteClient}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button className="delete-link-button" onClick={() => props.onRequestDeleteClient(client.id)}>
                        Delete Client
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="work-panel portfolio-detail">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Barns and properties</p>
            <h2>Saved Locations</h2>
          </div>
          <button onClick={props.onLocation}>Use Current Location</button>
        </div>
        <div className="portfolio-stack">
          {props.data.barns.map((barn) => {
            const barnClients = barn.clientIds
              .map((id) => props.data.clients.find((client) => client.id === id))
              .filter(Boolean);
            const barnHorses = barn.horseIds
              .map((id) => props.data.horses.find((horse) => horse.id === id))
              .filter(Boolean) as Horse[];
            return (
              <div className="portfolio-card" key={barn.id}>
                <p className="eyebrow">Barn / property</p>
                <h3>{barn.name || "New Barn"}</h3>
                <dl className="detail-grid">
                  <div>
                    <dt>Address</dt>
                    <dd>{barn.address || "Not added"}</dd>
                  </div>
                  <div>
                    <dt>Clients</dt>
                    <dd>{barnClients.map((client) => client?.name).join(", ") || "None assigned"}</dd>
                  </div>
                  <div>
                    <dt>Gate</dt>
                    <dd>{barn.gateCode || "Not added"}</dd>
                  </div>
                  <div>
                    <dt>Parking</dt>
                    <dd>{barn.parkingNotes || "Not added"}</dd>
                  </div>
                  <div>
                    <dt>Manager</dt>
                    <dd>
                      {barn.barnManagerName || "Not added"}
                      {barn.barnManagerPhone ? ` - ${barn.barnManagerPhone}` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Access</dt>
                    <dd>{barn.accessInstructions || "Not added"}</dd>
                  </div>
                  <div>
                    <dt>Location fallback</dt>
                    <dd>{props.locationStatus}</dd>
                  </div>
                </dl>
                <div className="horse-chip-row">
                  {barnHorses.length === 0 && <span className="empty-inline">No horses assigned</span>}
                  {barnHorses.map((horse) => (
                    <button className="horse-chip" key={horse.id} onClick={() => props.onHorse(horse)}>
                      {horse.name || "Unnamed Horse"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HorsesScreen(props: {
  data: AppData;
  horse: Horse;
  search: string;
  selectedFoot: Foot | null;
  setSearch: (search: string) => void;
  setSelectedFoot: (foot: Foot | null) => void;
  setSelectedHorseId: (id: string) => void;
  onFinish: () => void;
  onPrep: () => void;
}) {
  const client = props.data.clients.find((item) => item.id === props.horse.ownerClientId) ?? unassignedClient;
  const barn = props.data.barns.find((item) => item.id === props.horse.barnPropertyId);
  const filtered = props.data.horses.filter((horse) => horse.name.toLowerCase().includes(props.search.toLowerCase()));
  const selectedFoot = props.selectedFoot;
  const selectedFootRecord = selectedFoot
    ? props.data.footRecords.find((record) => record.id === props.horse.footRecordIds[selectedFoot])
    : null;
  const selectedSetup = selectedFootRecord
    ? props.data.shoeSetups.find((setup) => setup.id === selectedFootRecord.currentSetupId)
    : null;

  return (
    <section className="screen-grid">
      <div className="work-panel">
        <label className="search-label">
          Search horses
          <input
            value={props.search}
            onChange={(event) => props.setSearch(event.target.value)}
            placeholder="Horse name"
          />
        </label>
        {filtered.map((horse) => (
          <button
            className={horse.id === props.horse.id ? "due-card active" : "due-card"}
            key={horse.id}
            onClick={() => {
              props.setSelectedHorseId(horse.id);
              props.setSelectedFoot(null);
            }}
          >
            <strong>{horse.name || "Unnamed Horse"}</strong>
            <span>Due {formatDate(horse.nextDueDate)}</span>
          </button>
        ))}
      </div>
      <div className="work-panel wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {client.name} - {barn?.name ?? "No barn assigned"}
            </p>
            <h2>{props.horse.name}</h2>
          </div>
          <div className="button-row">
            <button onClick={props.onPrep}>Prep</button>
            <button className="primary" onClick={props.onFinish}>
              Open Current Stop
            </button>
          </div>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Temperament</dt>
            <dd>{props.horse.temperament}</dd>
          </div>
          <div>
            <dt>Safety</dt>
            <dd>{props.horse.safetyNotes}</dd>
          </div>
          <div>
            <dt>Interval</dt>
            <dd>{props.horse.serviceIntervalWeeks} weeks</dd>
          </div>
          <div>
            <dt>Last / next</dt>
            <dd>
              {formatDate(props.horse.lastServiceDate)} {"->"} {formatDate(props.horse.nextDueDate)}
            </dd>
          </div>
        </dl>
        <div className="foot-grid">
          {feet.map((foot) => (
            <button
              className={props.selectedFoot === foot ? "foot-button active" : "foot-button"}
              key={foot}
              onClick={() => props.setSelectedFoot(foot)}
            >
              <span>{foot}</span>
              <small>Open history</small>
            </button>
          ))}
        </div>

        {selectedFootRecord && selectedSetup ? (
          <FootHistory data={props.data} record={selectedFootRecord} setup={selectedSetup} />
        ) : (
          <div className="setup-summary">
            <p className="eyebrow">Last verified setup</p>
            <div className="setup-grid">
              {feet.map((foot) => {
                const record = props.data.footRecords.find((item) => item.id === props.horse.footRecordIds[foot]);
                const setup = record ? props.data.shoeSetups.find((item) => item.id === record.currentSetupId) : null;
                return (
                  <div className="setup-tile" key={foot}>
                    <strong>{foot}</strong>
                    <span>{setup?.shoeBrand ?? "TBD"}</span>
                    <span>
                      {setup?.shoeModel ?? "No setup"}, {setup?.shoeSize ?? "TBD"}
                    </span>
                    <small>{setup?.verified ? "Verified" : "Unverified"}</small>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function FootHistory(props: { data: AppData; record: AppData["footRecords"][number]; setup: ShoeSetup }) {
  const photos = [...props.record.trimmedPhotoIds, ...props.record.finishedShoePhotoIds]
    .map((id) => props.data.photos.find((photo) => photo.id === id))
    .filter(Boolean) as AppData["photos"];
  return (
    <div className="foot-history">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{props.record.foot} foot history</p>
          <h2>
            {props.setup.shoeModel} - size {props.setup.shoeSize}
          </h2>
        </div>
        <span className={props.setup.verified ? "status good" : "status"}>
          {props.setup.verified ? "Verified" : "Review"}
        </span>
      </div>
      <div className="photo-strip">
        {photos.map((photo) => (
          <div className="photo-placeholder" key={photo.id} style={{ background: photo.placeholderColor }}>
            <span>{photo.type.replace("_", " ")}</span>
            <strong>{photo.title}</strong>
          </div>
        ))}
      </div>
      <dl className="detail-grid">
        <div>
          <dt>Clips / pads</dt>
          <dd>
            {props.setup.clips} - {props.setup.pads}
          </dd>
        </div>
        <div>
          <dt>Wedges / borium</dt>
          <dd>
            {props.setup.wedges} - {props.setup.borium}
          </dd>
        </div>
        <div>
          <dt>Modifications</dt>
          <dd>{props.setup.modifications}</dd>
        </div>
        <div>
          <dt>Fit notes</dt>
          <dd>{props.setup.fitNotes}</dd>
        </div>
        <div>
          <dt>What changed</dt>
          <dd>{props.setup.changedThisCycle}</dd>
        </div>
      </dl>
      <ul className="plain-list">
        {props.record.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function PrepScreen(props: {
  data: AppData;
  appointments: Appointment[];
  onHorse: (horse: Horse) => void;
  onFinish: (appointment: Appointment, horse: Horse) => void;
  onTogglePrep: (id: string, shoesPrepped: boolean) => void;
  onPrepNote: (id: string, prepNote: string) => void;
}) {
  return (
    <section className="work-panel full-width">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Tomorrow's route</p>
          <h2>{formatDate(TOMORROW)}</h2>
        </div>
        <span className="offline-pill">Verified history</span>
      </div>
      <div className="prep-list">
        {props.appointments.map((appt) => {
          const barn = props.data.barns.find((item) => item.id === appt.barnPropertyId) ?? unassignedBarn;
          const horse = props.data.horses.find((item) => item.id === appt.horseIds[0]);
          const setups = horse
            ? (feet
                .map((foot) => {
                  const record = props.data.footRecords.find((item) => item.id === horse.footRecordIds[foot]);
                  return record ? props.data.shoeSetups.find((setup) => setup.id === record.currentSetupId) : null;
                })
                .filter(Boolean) as ShoeSetup[])
            : [];
          return (
            <article className="prep-card" key={appt.id}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">
                    Stop {appt.routeOrder} - {appt.startTime} - {barn.name}
                  </p>
                  <h2>{horse?.name || "No horse attached"}</h2>
                </div>
                <button
                  className={appt.shoesPrepped ? "success-button" : "primary"}
                  onClick={() => props.onTogglePrep(appt.id, !appt.shoesPrepped)}
                >
                  {appt.shoesPrepped ? "Shoes Prepped" : "Mark Prepped"}
                </button>
              </div>
              <div className="prep-setup-grid">
                {setups.map((setup) => (
                  <div className="setup-tile" key={setup.id}>
                    <strong>{setup.foot}</strong>
                    <span>
                      {setup.shoeModel} - {setup.shoeSize}
                    </span>
                    <small>{setup.modifications}</small>
                  </div>
                ))}
              </div>
              <div className="photo-strip">
                {(horse?.photoDocumentIds ?? []).slice(0, 2).map((id) => {
                  const photo = props.data.photos.find((item) => item.id === id);
                  if (!photo) return null;
                  return (
                    <div className="photo-placeholder small" key={id} style={{ background: photo.placeholderColor }}>
                      <span>{photo.type.replace("_", " ")}</span>
                      <strong>{photo.title}</strong>
                    </div>
                  );
                })}
              </div>
              <label className="search-label">
                Prep note
                <textarea value={appt.prepNote} onChange={(event) => props.onPrepNote(appt.id, event.target.value)} />
              </label>
              <div className="button-row">
                <button disabled={!horse} onClick={() => horse && props.onHorse(horse)}>
                  Open Horse
                </button>
                <button className="primary" disabled={!horse} onClick={() => horse && props.onFinish(appt, horse)}>
                  Open Current Stop
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return [hours, minutes, remaining].map((value) => String(value).padStart(2, "0")).join(":");
}

function CurrentStopScreen(props: {
  appointments: Appointment[];
  activeAppointmentId: string | null;
  data: AppData;
  onSelect: (appointment: Appointment) => void;
  onStart: (appointment: Appointment) => void;
  onComplete: (appointment: Appointment, earningsCents: number, durationSeconds: number) => void;
  details: React.ReactNode;
}) {
  const [, setClockTick] = useState(0);
  const [earningsOpen, setEarningsOpen] = useState(false);
  const [earnings, setEarnings] = useState("");
  const selected = props.appointments.find((appointment) => appointment.id === props.activeAppointmentId) ?? null;
  const elapsed = selected?.durationSeconds ?? (selected?.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(selected.startedAt).getTime()) / 1000)) : 0);

  useEffect(() => {
    if (!selected?.startedAt || selected.status === "complete") return;
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [selected?.startedAt, selected?.status]);

  return (
    <section className="current-stop-layout">
      <div className="work-panel">
        <p className="eyebrow">Today's route</p>
        <h2>Select Current Stop</h2>
        {props.appointments.length === 0 ? (
          <p className="empty-state">No stops are scheduled for today. Add one from Calendar.</p>
        ) : (
          <div className="stop-selector-list">
            {props.appointments.map((appointment) => {
              const client = props.data.clients.find((item) => item.id === appointment.clientId);
              const barn = props.data.barns.find((item) => item.id === appointment.barnPropertyId);
              return (
                <button className={selected?.id === appointment.id ? "active stop-selector" : "stop-selector"} key={appointment.id} onClick={() => props.onSelect(appointment)}>
                  <strong>Stop {appointment.routeOrder} · {appointment.startTime}</strong>
                  <span>{client?.name ?? "Unassigned client"} · {barn?.name ?? "Unassigned barn"}</span>
                  <small>{appointment.status.replace("_", " ")}</small>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selected && (
        <div className="work-panel stop-timer-panel">
          <p className="eyebrow">Stopwatch</p>
          <div className="stopwatch" aria-live="polite">{formatElapsed(elapsed)}</div>
          {!selected.startedAt ? (
            <button className="primary save-button" onClick={() => props.onStart(selected)}>Start Stop</button>
          ) : selected.status !== "complete" ? (
            <button className="success-button save-button" onClick={() => setEarningsOpen(true)}>Complete Stop</button>
          ) : (
            <p className="status good">Completed · {formatElapsed(selected.durationSeconds ?? elapsed)}</p>
          )}
        </div>
      )}
      {selected && props.details}
      {earningsOpen && selected && (
        <div className="modal-scrim" role="presentation" onMouseDown={() => setEarningsOpen(false)}>
          <div aria-modal="true" className="schedule-modal earnings-modal" role="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <p className="eyebrow">Complete stop</p>
            <h2>Log Stop Earnings</h2>
            <label className="search-label">Earnings (USD)<input autoFocus min="0" step="0.01" type="number" value={earnings} onChange={(event) => setEarnings(event.target.value)} /></label>
            <div className="modal-actions">
              <button onClick={() => setEarningsOpen(false)}>Cancel</button>
              <button className="primary" disabled={!earnings || Number(earnings) < 0} onClick={() => {
                props.onComplete(selected, Math.round(Number(earnings) * 100), elapsed);
                setEarningsOpen(false);
                setEarnings("");
              }}>Save Earnings & Complete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const majorCurrencies = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "JPY", "CHF", "CNY", "HKD", "SGD", "INR", "BRL", "MXN", "ZAR", "SEK", "NOK", "DKK", "AED"];

function FinanceScreen(props: { data: AppData; onCurrency: (currency: string) => void; onAddExpense: (expense: BusinessExpense) => void; onAddIncome: (income: BusinessIncome) => void; onUpdateAppointment: (id: string, patch: Partial<Appointment>) => void; onUpdateExpense: (id: string, patch: Partial<BusinessExpense>) => void; onUpdateIncome: (id: string, patch: Partial<BusinessIncome>) => void }) {
  const [range, setRange] = useState<"day" | "week" | "month" | "year">("month");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [expenseDate, setExpenseDate] = useState(TODAY);
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeSource, setIncomeSource] = useState("");
  const [incomeNotes, setIncomeNotes] = useState("");
  const [incomeDate, setIncomeDate] = useState(TODAY);
  const currency = props.data.preferences?.currency ?? "USD";
  const days = { day: 1, week: 7, month: 30, year: 365 }[range];
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days + 1); cutoff.setHours(0, 0, 0, 0);
  const stopEarnings = props.data.appointments.filter((item) => (item.earningsCents ?? 0) > 0);
  const manualIncome = props.data.incomeEntries ?? [];
  const earnings = [...stopEarnings.map((item) => ({ date: item.date, amountCents: item.earningsCents ?? 0 })), ...manualIncome.map((item) => ({ date: item.date, amountCents: item.amountCents }))].filter((item) => new Date(`${item.date}T12:00:00`) >= cutoff);
  const expenses = (props.data.expenses ?? []).filter((item) => new Date(`${item.date}T12:00:00`) >= cutoff);
  const earningsTotal = earnings.reduce((sum, item) => sum + item.amountCents, 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amountCents, 0);
  const money = (cents: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  const daily = new Map<string, { earning: number; expense: number }>();
  earnings.forEach((item) => { const current = daily.get(item.date) ?? { earning: 0, expense: 0 }; current.earning += item.amountCents; daily.set(item.date, current); });
  expenses.forEach((item) => { const current = daily.get(item.date) ?? { earning: 0, expense: 0 }; current.expense += item.amountCents; daily.set(item.date, current); });
  const chartDays = Array.from(daily.entries()).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(1, ...chartDays.flatMap(([, values]) => [values.earning, values.expense]));
  const chartPoints = (type: "earning" | "expense") => chartDays.map(([date, values], index) => ({ date, amount: values[type], x: chartDays.length === 1 ? 300 : 50 + index * 500 / (chartDays.length - 1), y: 215 - values[type] * 165 / max }));
  const earningPoints = chartPoints("earning");
  const expensePoints = chartPoints("expense");
  const recentRecords = [
    ...stopEarnings.map((item) => ({ id: item.id, kind: "stop" as const, date: item.date, amountCents: item.earningsCents ?? 0, label: `Completed stop · ${props.data.clients.find((client) => client.id === item.clientId)?.name || "Client"}` })),
    ...manualIncome.map((item) => ({ id: item.id, kind: "income" as const, date: item.date, amountCents: item.amountCents, label: item.source || "Manual income" })),
    ...(props.data.expenses ?? []).map((item) => ({ id: item.id, kind: "expense" as const, date: item.date, amountCents: item.amountCents, label: item.category || "Expense" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  return (
    <>
      <div className="work-panel finance-summary">
        <div><span>Earnings</span><strong className="money-positive">{money(earningsTotal)}</strong></div>
        <div><span>Expenses</span><strong className="money-negative">{money(expenseTotal)}</strong></div>
        <div><span>Net</span><strong>{money(earningsTotal - expenseTotal)}</strong></div>
      </div>
      <div className="work-panel finance-chart-panel">
        <div className="section-heading"><div><p className="eyebrow">Financial trend</p><h2>Earnings & Expenses</h2></div><select aria-label="Currency" value={currency} onChange={(event) => props.onCurrency(event.target.value)}>{majorCurrencies.map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="segmented wrap">{(["day", "week", "month", "year"] as const).map((item) => <button className={range === item ? "active" : ""} key={item} onClick={() => setRange(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
        <svg aria-label="Financial line graph with time on the horizontal axis and currency on the vertical axis" className="finance-chart" role="img" viewBox="0 0 600 260">
          <line x1="40" x2="560" y1="220" y2="220" /><line x1="40" x2="40" y1="40" y2="220" />
          <polyline className="earnings-line" fill="none" points={earningPoints.map((point) => `${point.x},${point.y}`).join(" ")} /><polyline className="expenses-line" fill="none" points={expensePoints.map((point) => `${point.x},${point.y}`).join(" ")} />
          {earningPoints.filter((point) => point.amount > 0).map((point) => <circle className="earning-point" cx={point.x} cy={point.y} key={`earning-${point.date}`} r="6"><title>{point.date}: {money(point.amount)}</title></circle>)}
          {expensePoints.filter((point) => point.amount > 0).map((point) => <circle className="expense-point" cx={point.x} cy={point.y} key={`expense-${point.date}`} r="6"><title>{point.date}: {money(point.amount)}</title></circle>)}
          <text x="270" y="252">Time ({range})</text><text transform="rotate(-90 14 140)" x="14" y="140">{currency}</text>
        </svg>
        {chartDays.length === 0 && <p className="empty-state">Complete stops, add income, or add expenses to begin this graph.</p>}
        <div className="chart-legend"><span className="money-positive">● Earnings</span><span className="money-negative">● Expenses</span></div>
      </div>
      <form className="work-panel finance-entry-form" onSubmit={(event) => { event.preventDefault(); props.onAddIncome({ id: makeId("income"), date: incomeDate, amountCents: Math.round(Number(incomeAmount) * 100), source: incomeSource.trim() || "Manual income", notes: incomeNotes.trim(), createdAt: new Date().toISOString() }); setIncomeAmount(""); setIncomeSource(""); setIncomeNotes(""); }}>
        <p className="eyebrow">Payments received</p><h2>Add Income</h2><p className="helper-text">Choose the date the payment belongs to—even when a client pays later.</p>
        <div className="form-grid"><label>Date received<input type="date" value={incomeDate} onChange={(event) => setIncomeDate(event.target.value)} /></label><label>Amount ({currency})<input min="0.01" required step="0.01" type="number" value={incomeAmount} onChange={(event) => setIncomeAmount(event.target.value)} /></label><label>Source<input placeholder="Client, stop, other income…" value={incomeSource} onChange={(event) => setIncomeSource(event.target.value)} /></label><label>Notes<input value={incomeNotes} onChange={(event) => setIncomeNotes(event.target.value)} /></label></div><button className="primary" type="submit">Save Income</button>
      </form>
      <form className="work-panel finance-entry-form" onSubmit={(event) => { event.preventDefault(); props.onAddExpense({ id: makeId("expense"), date: expenseDate, amountCents: Math.round(Number(expenseAmount) * 100), category: expenseCategory.trim() || "General", notes: expenseNotes.trim(), createdAt: new Date().toISOString() }); setExpenseAmount(""); setExpenseCategory(""); setExpenseNotes(""); }}>
        <p className="eyebrow">Business spending</p><h2>Add Expense</h2>
        <div className="form-grid"><label>Date<input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></label><label>Amount ({currency})<input min="0.01" required step="0.01" type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} /></label><label>Category<input placeholder="Fuel, supplies, insurance…" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)} /></label><label>Notes<input value={expenseNotes} onChange={(event) => setExpenseNotes(event.target.value)} /></label></div>
        <button className="primary" type="submit">Save Expense</button>
        <p className="helper-text">Tax and accounting export will be added in a later phase.</p>
      </form>
      <div className="work-panel finance-records"><p className="eyebrow">Editable ledger</p><h2>Recent Entries</h2><p className="helper-text">Correct a date or amount at any time. Saving immediately recalculates totals and the graph.</p>{recentRecords.length === 0 ? <p className="empty-state">No financial entries yet.</p> : recentRecords.map((record) => <FinanceRecordEditor key={`${record.kind}-${record.id}`} record={record} onSave={(date, amountCents) => { if (record.kind === "stop") props.onUpdateAppointment(record.id, { date, completedAt: `${date}T12:00:00`, earningsCents: amountCents }); else if (record.kind === "income") props.onUpdateIncome(record.id, { date, amountCents }); else props.onUpdateExpense(record.id, { date, amountCents }); }} />)}</div>
    </>
  );
}

function FinanceRecordEditor({ record, onSave }: { record: { kind: "stop" | "income" | "expense"; date: string; amountCents: number; label: string }; onSave: (date: string, amountCents: number) => void }) {
  const [date, setDate] = useState(record.date);
  const [amount, setAmount] = useState((record.amountCents / 100).toFixed(2));
  useEffect(() => { setDate(record.date); setAmount((record.amountCents / 100).toFixed(2)); }, [record.date, record.amountCents]);
  return <div className="finance-record-row"><div><span className={record.kind === "expense" ? "record-kind expense" : "record-kind income"}>{record.kind === "expense" ? "Expense" : "Income"}</span><strong>{record.label}</strong></div><label>Date<input value={date} type="date" onChange={(event) => setDate(event.target.value)} /></label><label>Amount<input value={amount} min="0" step="0.01" type="number" onChange={(event) => setAmount(event.target.value)} /></label><button disabled={!date || Number(amount) < 0} onClick={() => onSave(date, Math.round(Number(amount) * 100))}>Save Changes</button></div>;
}

function FinishScreen(props: {
  horse: Horse;
  client: { name: string };
  barn: { name: string };
  currentSetups: ShoeSetup[];
  onSetupChange: (foot: Foot, patch: Partial<ShoeSetup>) => void;
  finishType: ServiceType;
  setFinishType: (type: ServiceType) => void;
  finishNote: string;
  setFinishNote: (note: string) => void;
  cycleChange: string;
  setCycleChange: (note: string) => void;
  verified: boolean;
  setVerified: (verified: boolean) => void;
  onSave: () => void;
}) {
  const [showSetupDetails, setShowSetupDetails] = useState(false);
  return (
    <section className="screen-grid">
      <div className="work-panel wide">
        <p className="eyebrow">
          {props.client.name} - {props.barn.name}
        </p>
        <h2>Service Record · {props.horse.name}</h2>
        <div className="segmented wrap">
          {(Object.keys(serviceLabels) as ServiceType[]).map((type) => (
            <button
              className={props.finishType === type ? "active" : ""}
              key={type}
              onClick={() => props.setFinishType(type)}
            >
              {serviceLabels[type]}
            </button>
          ))}
        </div>
        <div className="finish-summary-strip">
          {props.currentSetups.map((setup) => (
            <div key={setup.foot}>
              <strong>{setup.foot}</strong>
              <span>
                {setup.shoeModel} · {setup.shoeSize}
              </span>
            </div>
          ))}
        </div>
        <button
          className="setup-disclosure"
          aria-expanded={showSetupDetails}
          onClick={() => setShowSetupDetails((open) => !open)}
        >
          <span>Review or change shoe setup</span>
          <strong>{showSetupDetails ? "Hide" : "Optional"}</strong>
        </button>
        {showSetupDetails && (
          <div className="prep-setup-grid setup-editor-grid">
            {props.currentSetups.map((setup) => (
              <div className="setup-tile setup-editor" key={setup.foot}>
                <strong>{setup.foot}</strong>
                <label>
                  Brand
                  <input
                    value={setup.shoeBrand}
                    onChange={(event) => props.onSetupChange(setup.foot, { shoeBrand: event.target.value })}
                  />
                </label>
                <label>
                  Model
                  <input
                    value={setup.shoeModel}
                    onChange={(event) => props.onSetupChange(setup.foot, { shoeModel: event.target.value })}
                  />
                </label>
                <label>
                  Size
                  <input
                    value={setup.shoeSize}
                    onChange={(event) => props.onSetupChange(setup.foot, { shoeSize: event.target.value })}
                  />
                </label>
                <label>
                  Clips
                  <input
                    value={setup.clips}
                    onChange={(event) => props.onSetupChange(setup.foot, { clips: event.target.value })}
                  />
                </label>
                <label>
                  Pads
                  <input
                    value={setup.pads}
                    onChange={(event) => props.onSetupChange(setup.foot, { pads: event.target.value })}
                  />
                </label>
                <label>
                  Wedges
                  <input
                    value={setup.wedges}
                    onChange={(event) => props.onSetupChange(setup.foot, { wedges: event.target.value })}
                  />
                </label>
                <label>
                  Borium
                  <input
                    value={setup.borium}
                    onChange={(event) => props.onSetupChange(setup.foot, { borium: event.target.value })}
                  />
                </label>
                <label className="editor-wide">
                  Modifications
                  <textarea
                    value={setup.modifications}
                    onChange={(event) => props.onSetupChange(setup.foot, { modifications: event.target.value })}
                  />
                </label>
                <label className="editor-wide">
                  Fit notes
                  <textarea
                    value={setup.fitNotes}
                    onChange={(event) => props.onSetupChange(setup.foot, { fitNotes: event.target.value })}
                  />
                </label>
              </div>
            ))}
          </div>
        )}
        <div className="finish-controls">
          <button>Add Photo</button>
          <button>Voice Note</button>
          <button>Owner Preview</button>
        </div>
        <label className="search-label">
          Written notes
          <textarea value={props.finishNote} onChange={(event) => props.setFinishNote(event.target.value)} />
        </label>
        {showSetupDetails && (
          <label className="search-label">
            What changed this cycle
            <textarea value={props.cycleChange} onChange={(event) => props.setCycleChange(event.target.value)} />
          </label>
        )}
      </div>
      <div className="work-panel sticky-save">
        <p className="eyebrow">Horse record</p>
        <h2>Save service details</h2>
        <p>Records this service and calculates the next due date from {props.horse.serviceIntervalWeeks} weeks.</p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={props.verified}
            onChange={(event) => props.setVerified(event.target.checked)}
          />
          <span>Use this setup for next prep</span>
        </label>
        <button className="primary save-button" onClick={props.onSave}>
          Save Service Record
        </button>
      </div>
    </section>
  );
}

export default App;
