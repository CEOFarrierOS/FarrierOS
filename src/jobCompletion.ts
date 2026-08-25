import { AppData, Foot, ServiceType, ShoeSetup } from "./types";

const feet: Foot[] = ["LF", "RF", "LH", "RH"];

function addWeeks(date: string, weeks: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + weeks * 7);
  return next.toISOString().slice(0, 10);
}

export interface CompleteJobInput {
  data: AppData;
  horseId: string;
  appointmentId: string | null;
  serviceDate: string;
  serviceType: ServiceType;
  setupDrafts: Partial<Record<Foot, ShoeSetup>>;
  writtenNotes: string;
  cycleChange: string;
  verified: boolean;
  markAppointmentComplete?: boolean;
  now?: string;
  makeId?: (prefix: string) => string;
}

export function completeJob(input: CompleteJobInput) {
  const horse = input.data.horses.find((item) => item.id === input.horseId);
  if (!horse) throw new Error("Horse not found.");
  const createId =
    input.makeId ?? ((prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const serviceId = createId("service");
  const now = input.now ?? new Date().toISOString();
  const nextDueDate = addWeeks(input.serviceDate, horse.serviceIntervalWeeks);
  const newSetups = feet.map((foot) => {
    const draft = input.setupDrafts[foot];
    if (!draft) throw new Error(`Missing ${foot} setup.`);
    return {
      ...draft,
      id: createId(`setup-${foot.toLowerCase()}`),
      serviceRecordId: serviceId,
      verified: input.verified,
      verifiedAt: input.verified ? now : "",
      changedThisCycle: input.cycleChange,
    };
  });
  const setupByFoot = new Map(newSetups.map((setup) => [setup.foot, setup.id]));
  const serviceLabel = input.serviceType.replace("_", " ");

  const data: AppData = {
    ...input.data,
    horses: input.data.horses.map((item) =>
      item.id === horse.id
        ? {
            ...item,
            lastServiceDate: input.serviceDate,
            nextDueDate,
            verifiedSetupId: input.verified ? serviceId : item.verifiedSetupId,
            notes: input.writtenNotes ? [input.writtenNotes, ...item.notes] : item.notes,
          }
        : item,
    ),
    footRecords: input.data.footRecords.map((record) => {
      if (record.horseId !== horse.id) return record;
      const nextSetupId = setupByFoot.get(record.foot);
      if (!nextSetupId) return record;
      return {
        ...record,
        currentSetupId: input.verified ? nextSetupId : record.currentSetupId,
        historySetupIds: [nextSetupId, ...record.historySetupIds],
        notes: input.cycleChange ? [input.cycleChange, ...record.notes] : record.notes,
      };
    }),
    shoeSetups: [...newSetups, ...input.data.shoeSetups],
    serviceRecords: [
      {
        id: serviceId,
        horseId: horse.id,
        appointmentId: input.appointmentId ?? undefined,
        serviceDate: input.serviceDate,
        serviceType: input.serviceType,
        footSetupIds: newSetups.map((setup) => setup.id),
        writtenNotes: input.writtenNotes,
        voiceNotePlaceholderIds: [],
        photoDocumentIds: horse.photoDocumentIds,
        verifiedSetup: input.verified,
        nextDueDate,
        ownerSummaryPreview: `${horse.name} received ${serviceLabel} service. Next due ${nextDueDate}. Preview only.`,
        createdAt: now,
        updatedAt: now,
      },
      ...input.data.serviceRecords,
    ],
    appointments: input.data.appointments.map((appointment) =>
      appointment.id === input.appointmentId && input.markAppointmentComplete !== false
        ? { ...appointment, status: "complete" }
        : appointment,
    ),
  };

  return { data, nextDueDate, serviceId };
}
