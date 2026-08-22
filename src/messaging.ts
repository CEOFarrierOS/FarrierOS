export function buildOnMyWayMessage(businessName: string, barnName: string, startTime: string) {
  return `${businessName}: I'm on my way to ${barnName} for our ${startTime} appointment.`;
}

export function createSmsHref(phone: string, message: string) {
  const destination = phone.trim().replace(/[^\d+]/g, "");
  if (!destination) return null;
  return `sms:${destination}?body=${encodeURIComponent(message)}`;
}
