import { useEffect, useState } from "react";
import { callPublicCoif, CoifHorseIntake, CoifPayload } from "./cloud/coif";

const blankHorse = (): CoifHorseIntake => ({ name: "", breed: "", age: "", color: "", use: "", currentService: "", serviceIntervalWeeks: 6, lamenessIssues: "", medicalNotes: "", temperament: "", safetyNotes: "" });
const initial: CoifPayload = {
  owner: { firstName: "", lastName: "", phone: "", email: "" },
  property: { name: "", serviceAddress: "", gateCode: "", otherInstructions: "" },
  horses: [blankHorse()], messagingConsent: false, signature: "",
};

export default function CoifPublicPage({ token }: { token: string }) {
  const [data, setData] = useState(initial);
  const [status, setStatus] = useState<"checking" | "ready" | "submitting" | "complete" | "invalid">("checking");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (import.meta.env.DEV && token === "preview") { setStatus("ready"); return; }
    callPublicCoif(token, "inspect").then(() => setStatus("ready")).catch((error) => { setMessage(error instanceof Error ? error.message : "This link is unavailable."); setStatus("invalid"); });
  }, [token]);
  const owner = (patch: Partial<CoifPayload["owner"]>) => setData((current) => ({ ...current, owner: { ...current.owner, ...patch } }));
  const property = (patch: Partial<CoifPayload["property"]>) => setData((current) => ({ ...current, property: { ...current.property, ...patch } }));
  const horse = (index: number, patch: Partial<CoifHorseIntake>) => setData((current) => ({ ...current, horses: current.horses.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) }));
  if (status === "checking") return <main className="coif-public-shell"><section className="coif-public-card"><p className="eyebrow">FarrierOS secure intake</p><h1>Checking your link…</h1></section></main>;
  if (status === "invalid") return <main className="coif-public-shell"><section className="coif-public-card"><p className="eyebrow">Link unavailable</p><h1>This COIF cannot be opened</h1><p>{message}</p></section></main>;
  if (status === "complete") return <main className="coif-public-shell"><section className="coif-public-card coif-success"><div className="coif-success-mark">✓</div><p className="eyebrow">Submission received</p><h1>Thank you</h1><p>Your information was securely sent to your farrier for review. You may close this page.</p></section></main>;
  return <main className="coif-public-shell"><form className="coif-public-form" onSubmit={async (event) => { event.preventDefault(); setStatus("submitting"); setMessage(""); try { await callPublicCoif(token, "submit", data); setStatus("complete"); } catch (error) { setMessage(error instanceof Error ? error.message : "Submission failed."); setStatus("ready"); } }}>
    <header className="coif-hero"><div className="brand-mark">F</div><p className="eyebrow">Client Onboarding Information Form</p><h1>Welcome to FarrierOS</h1><p>Share the essentials your farrier needs, then add every horse they may service.</p></header>
    {message && <div className="billing-notice">{message}</div>}
    <section className="coif-public-card"><span className="coif-step">01</span><h2>Contact and location</h2><div className="form-grid">
      <label>First name<input required autoComplete="given-name" value={data.owner.firstName} onChange={(event) => owner({ firstName: event.target.value })} /></label>
      <label>Last name<input required autoComplete="family-name" value={data.owner.lastName} onChange={(event) => owner({ lastName: event.target.value })} /></label>
      <label>Mobile phone<input required autoComplete="tel" type="tel" value={data.owner.phone} onChange={(event) => owner({ phone: event.target.value })} /></label>
      <label>Email<input autoComplete="email" type="email" value={data.owner.email} onChange={(event) => owner({ email: event.target.value })} /></label>
      <label className="editor-wide">Service address<input required autoComplete="street-address" value={data.property.serviceAddress} onChange={(event) => property({ serviceAddress: event.target.value })} /></label>
      <label>Barn name <span className="optional-label">(if any)</span><input value={data.property.name} onChange={(event) => property({ name: event.target.value })} /></label>
      <label>Gate code <span className="optional-label">(if any)</span><input value={data.property.gateCode} onChange={(event) => property({ gateCode: event.target.value })} /></label>
      <label className="editor-wide">Other instructions<textarea placeholder="Parking, access, scheduling, or anything else your farrier should know" value={data.property.otherInstructions} onChange={(event) => property({ otherInstructions: event.target.value })} /></label>
    </div></section>
    <section className="coif-public-card"><span className="coif-step">02</span><div className="section-heading"><div><h2>Horse information</h2><p>Add each horse your farrier may service.</p></div><button type="button" onClick={() => setData((current) => ({ ...current, horses: [...current.horses, blankHorse()] }))}>+ Add Another Horse</button></div><div className="coif-horse-list">{data.horses.map((item, index) => <article className="coif-horse-card" key={index}><div className="section-heading"><h3>Horse {index + 1}</h3>{data.horses.length > 1 && <button className="danger-button" type="button" onClick={() => setData((current) => ({ ...current, horses: current.horses.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button>}</div><div className="form-grid">
      <label>Name<input required value={item.name} onChange={(event) => horse(index, { name: event.target.value })} /></label><label>Breed<input value={item.breed} onChange={(event) => horse(index, { breed: event.target.value })} /></label><label>Age<input value={item.age} onChange={(event) => horse(index, { age: event.target.value })} /></label><label>Current service<input placeholder="Trim, fronts, full set…" value={item.currentService} onChange={(event) => horse(index, { currentService: event.target.value })} /></label><label className="editor-wide">Hoof-care, lameness, or handling notes<textarea value={item.lamenessIssues} onChange={(event) => horse(index, { lamenessIssues: event.target.value })} /></label>
    </div></article>)}</div></section>
    <section className="coif-public-card"><span className="coif-step">03</span><h2>Review and submit</h2><label className="toggle-row"><input checked={data.messagingConsent} type="checkbox" onChange={(event) => setData((current) => ({ ...current, messagingConsent: event.target.checked }))} /><span>I agree to receive appointment-related text messages from my farrier.</span></label><label>Electronic signature<input required placeholder="Type your full legal name" value={data.signature} onChange={(event) => setData((current) => ({ ...current, signature: event.target.value }))} /></label><p className="helper-text">By submitting, you confirm this information is accurate to the best of your knowledge.</p><button className="primary save-button" disabled={status === "submitting"} type="submit">{status === "submitting" ? "Sending securely…" : "Submit to My Farrier"}</button></section>
  </form></main>;
}
