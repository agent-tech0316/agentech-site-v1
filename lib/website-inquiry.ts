export type WebsiteInquiry = {
  name: string; email: string; company: string; audience: string; website: string;
  goal: string; timeline: string; readiness: string; acceptsPackage: boolean;
};

export function prepareWebsiteInquiry(input: WebsiteInquiry):
  | { ok: false; error: string }
  | { ok: true; subject: string; body: string; mailto: string } {
  const name = input.name.trim();
  const email = input.email.trim();
  const company = input.company.trim();
  if (!name || !company || !input.goal.trim()) return { ok: false, error: "Please add your name, company, and website goal." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!["business", "agency"].includes(input.audience)) return { ok: false, error: "Choose a business or agency inquiry." };
  if (!input.acceptsPackage) return { ok: false, error: "Please acknowledge the package price before preparing your inquiry." };
  if (name.length > 100 || email.length > 254 || company.length > 120 || input.goal.length > 2000 || input.website.length > 300 || input.timeline.length > 120 || input.readiness.length > 120) {
    return { ok: false, error: "Please shorten your answers to fit the form limits." };
  }
  if (/[\r\n]/.test(company + name + email)) return { ok: false, error: "Use one line for your contact details." };
  const subject = `Website Launch inquiry — ${company}`;
  const body = [
    "Hello Agentech,", "", "I'd like to discuss the $2,000 Website Launch Package.", "",
    `Name: ${name}`, `Email: ${email}`, `Company: ${company}`,
    `Inquiry: ${input.audience === "agency" ? "Agency partner" : "My business"}`,
    `Current website: ${input.website.trim() || "No website yet"}`,
    `Target timing: ${input.timeline.trim() || "To discuss"}`,
    `Materials: ${input.readiness || "To discuss"}`, "", "Website goal:", input.goal.trim(), "",
    "I understand scope and scheduling need to be confirmed before the project starts."
  ].join("\n");
  return { ok: true, subject, body, mailto: `mailto:info@agent-tech.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
