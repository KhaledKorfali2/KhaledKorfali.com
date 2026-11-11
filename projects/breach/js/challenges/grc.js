// Track: Governance & Risk. Concept and risk-math challenges with value answers.
// The "target" is a short scenario document; the answer is a computed value or term.
import { norm } from "../flags.js";

const doc = (name, note, text) => ({ files: [{ name, kind: "text", note, data: text }] });

export default [
  {
    id: "grc-cia",
    title: "The CIA Triad",
    level: 1,
    slug: "confidentiality_integrity_availability",
    time: 7,
    certs: ["Security+", "CISSP", "ISC2 CC"],
    objective: "Read the incident report and name which part of the CIA triad was primarily harmed.",
    answerLabel: "C, I or A",
    answerPlaceholder: "confidentiality, integrity or availability",
    lesson: `All of security rests on three goals — the **CIA triad**:

- **Confidentiality** — only authorised people can read the data. (Broken by: a leak, eavesdropping, theft.)
- **Integrity** — data is accurate and unaltered. (Broken by: tampering, unauthorised changes.)
- **Availability** — systems and data are there when needed. (Broken by: outages, ransomware, denial-of-service.)

Every threat and control maps back to these. When you analyse an incident, the first question is: *which of the three did it hurt?* A **DDoS** attack floods a site offline → **availability**. A **database leak** → **confidentiality**. An attacker **changing** bank balances → **integrity**.

### Your task
Read the report on the right and answer with the single principle **most** directly violated.`,
    hints: ["Ask what the attacker actually achieved: reading data, changing data, or stopping access?", "A flood of traffic that knocks a service offline harms one specific principle."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "availability", text: "At 02:14 a botnet directed 480 Gbps of traffic at the public storefront. Web servers became unreachable and customers could not place orders for 3 hours. No data was accessed or altered." },
        { a: "confidentiality", text: "A misconfigured cloud storage bucket was left open to the internet. A researcher downloaded 1.2 million customer records. The data was not modified and all services stayed online, but the records are now exposed." },
        { a: "integrity", text: "An attacker with database access quietly altered shipping addresses on pending orders so goods were redirected. Systems stayed up and no bulk data was exfiltrated, but the records can no longer be trusted." },
      ];
      const pick = cases[ctx.int(0, 2)];
      return { _a: pick.a, ...doc("incident-report.txt", "A short incident summary. Which CIA principle took the hit?", pick.text) };
    },
    check(input, ctx, env) {
      return norm.text(input).startsWith(env._a.slice(0, 5));
    },
    debrief: `You mapped a real event onto the triad — the habit every analyst and exam builds on. Note how each case deliberately left the other two principles intact, so the "primary" impact was clear.

### In practice
- Controls are chosen to protect specific principles: encryption → confidentiality; hashing and signing → integrity; backups and redundancy → availability.
- Risk assessments rate impact on each principle separately.

**On the exam:** the CIA triad is the first thing Security+ and CISSP teach, and classification questions like this one are common.`,
  },

  {
    id: "grc-ale",
    title: "Doing the Risk Math",
    level: 2,
    slug: "annualised_loss_expectancy",
    time: 10,
    certs: ["Security+", "CISSP"],
    objective: "Use the figures in the brief to calculate the Annualised Loss Expectancy (ALE). Submit the number in dollars.",
    answerLabel: "ALE (USD)",
    answerPlaceholder: "e.g. 25000",
    lesson: `Risk decisions need numbers. The standard quantitative model:

- **SLE** (Single Loss Expectancy) — the cost of **one** incident = Asset Value × Exposure Factor.
- **ARO** (Annualised Rate of Occurrence) — how many times per year you expect it.
- **ALE** (Annualised Loss Expectancy) — expected yearly loss = **SLE × ARO**.

ALE is what justifies a control: if a safeguard costs less per year than the ALE it removes, it's worth buying. Example: SLE \$10,000, ARO 2 → **ALE \$20,000**. A \$5,000/year control that prevents it is a clear win.

### Your task
Read the brief, compute **ALE = SLE × ARO**, and submit the dollar amount (digits only, e.g. \`20000\`). If the brief gives Asset Value and Exposure Factor instead of SLE, compute SLE first.`,
    hints: ["First find SLE. If you're given Asset Value and Exposure Factor, SLE = Asset Value × Exposure Factor.", "Then ALE = SLE × ARO. Enter just the number of dollars."],
    workspace: { type: "files" },
    setup(ctx) {
      const asset = ctx.int(20, 80) * 10000;
      const ef = ctx.pick([0.1, 0.25, 0.4, 0.5]);
      const aro = ctx.pick([0.5, 1, 2, 4]);
      const sle = asset * ef;
      const ale = sle * aro;
      return {
        _ale: ale,
        ...doc("risk-brief.txt", "Figures for a quantitative risk assessment.",
          `Asset: customer database server\nAsset Value (AV): $${asset.toLocaleString()}\nExposure Factor (EF): ${ef * 100}%  (fraction of value lost in one incident)\nAnnualised Rate of Occurrence (ARO): ${aro} per year\n\nQuestion: what is the Annualised Loss Expectancy (ALE)?`),
      };
    },
    check(input, ctx, env) {
      return norm.num(input) === env._ale;
    },
    debrief: `ALE = SLE × ARO = (AV × EF) × ARO. This single calculation drives cost-benefit decisions: compare the ALE a control removes against the control's annual cost.

### In practice
- Quantitative analysis needs real data and is used for big-ticket decisions; **qualitative** (high/medium/low) analysis is faster and common day-to-day.
- Beyond mitigation, risk can be **transferred** (insurance), **avoided** (stop the activity) or **accepted** (document and move on).

**On the exam:** SLE/ARO/ALE calculations are guaranteed Security+ questions and appear in CISSP.`,
  },

  {
    id: "grc-access",
    title: "Which Access Model?",
    level: 3,
    slug: "access_control_models",
    time: 10,
    certs: ["Security+", "CISSP"],
    objective: "Read how the system grants access and name the access-control model it uses.",
    answerLabel: "Model",
    answerPlaceholder: "DAC, MAC, RBAC or ABAC",
    lesson: `How a system decides *who can do what* follows one of a few **access-control models**:

- **DAC** (Discretionary) — the **owner** of a resource grants access at their discretion. (Your personal files: you share them.)
- **MAC** (Mandatory) — a central policy and **security labels** decide; users can't override. (Military "Top Secret" clearances.)
- **RBAC** (Role-Based) — permissions attach to **roles**; users get a role. (Everyone in "Nurse" can read charts.)
- **ABAC** (Attribute-Based) — access depends on **attributes/conditions** evaluated at request time (user department, time of day, device, location).

### Your task
Read the access policy on the right and name the model (DAC, MAC, RBAC or ABAC).`,
    hints: ["Who makes the decision — the resource owner, a central label system, a role, or a set of conditions?", "If access is 'anyone in the Finance role', that's role-based. If it depends on time/location/department attributes, that's attribute-based."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "RBAC", text: "Permissions are attached to job roles. A user placed in the 'Billing Clerk' role automatically gains read/write on invoices; moved to 'Auditor', they get read-only across finance. Admins manage roles, not individual grants." },
        { a: "MAC", text: "Every document carries a classification label (Confidential, Secret, Top Secret) and every user a clearance. The system enforces that a user may only read at or below their clearance. Owners cannot override these rules." },
        { a: "DAC", text: "Each file has an owner. The owner decides who else may read or write it and can share it with anyone at their own discretion, passing along rights as they see fit." },
        { a: "ABAC", text: "Access is evaluated per request against attributes: grant if user.department == resource.department AND time is 09:00-17:00 AND device is managed. No static roles; the policy engine decides from conditions." },
      ];
      const pick = cases[ctx.int(0, 3)];
      return { _a: pick.a, ...doc("access-policy.txt", "An access-control policy description. Which model is it?", pick.text) };
    },
    check(input, ctx, env) {
      return norm.text(input).replace(/[^a-z]/g, "") === env._a.toLowerCase();
    },
    debrief: `You matched a policy to its model. The tell is *who or what makes the decision*: the owner (DAC), central labels (MAC), roles (RBAC) or runtime attributes (ABAC).

### In practice
- Most enterprises run **RBAC**, often moving toward **ABAC** for fine-grained, context-aware control (a pillar of Zero Trust).
- **MAC** dominates military and high-assurance systems.

**On the exam:** distinguishing DAC/MAC/RBAC/ABAC is a classic Security+ and CISSP question.`,
  },

  {
    id: "grc-ir",
    title: "Incident Response, In Order",
    level: 2,
    slug: "nist_incident_lifecycle",
    time: 9,
    certs: ["Security+", "CySA+", "CISSP", "GSEC", "ISC2 CC"],
    objective: "Read the situation and name the incident-response phase the team should move to next.",
    answerLabel: "Next phase",
    answerPlaceholder: "a phase name",
    lesson: `When an incident hits, teams follow a repeatable **lifecycle** so nothing is missed. The NIST version has four phases:

1. **Preparation** — tools, plans and training, *before* anything happens.
2. **Detection & Analysis** — spot it and understand scope and impact.
3. **Containment, Eradication & Recovery** — stop the spread, remove the threat, restore to normal.
4. **Post-Incident Activity** — the "lessons learned" review to improve.

(CompTIA splits these further — Preparation; Detection & Analysis; Containment; Eradication; Recovery; Lessons Learned — but the order is the same.)

The key discipline: **contain before you eradicate**, and always finish with **lessons learned**. Skipping the review is the most common real-world failure.

### Your task
Read where the team is now and name the **next** phase they should carry out.`,
    hints: ["Locate the team's current activity in the lifecycle, then give the step that comes immediately after.", "Just finished detecting and scoping? The next job is to contain it. Just finished recovering? The next job is lessons learned."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "containment", keys: ["containment", "contain"], text: "The SOC has confirmed a workstation is infected and mapped which accounts and shares it touched. Analysis is complete and the scope is understood. Malware is still live on the host." },
        { a: "lessons learned", keys: ["lesson", "post-incident", "post incident", "review"], text: "The malicious host was isolated, the malware removed, systems rebuilt from clean backups, and operations are fully restored and verified. The incident is closed." },
        { a: "eradication", keys: ["eradicat", "remove"], text: "The infected host has just been isolated from the network and the threat can no longer spread. The malware files, however, are still present on the machine." },
      ];
      const pick = cases[ctx.int(0, 2)];
      return { _a: pick.a, _keys: pick.keys, ...doc("ir-status.txt", "Current status of an active incident. What phase comes next?", pick.text + `\n\nAnswer with the next phase to perform.`) };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return env._keys.some((k) => v.includes(k));
    },
    debrief: `You placed the team in the lifecycle and chose the next step. The order matters: you **contain** (stop spread) before you **eradicate** (remove), then **recover**, and always close with **lessons learned** to improve preparation for next time — the loop that makes a team better.

### In practice
- A written incident-response **plan** and regular tabletop exercises are what make this work under pressure.
- Communication, legal and evidence-preservation requirements run throughout.

**On the exam:** the incident-response lifecycle and its ordering are core to Security+, CySA+ and CISSP.`,
  },

  {
    id: "grc-control-types",
    title: "What Kind of Control?",
    level: 2,
    slug: "control_functions",
    time: 9,
    certs: ["Security+", "CISSP", "SSCP", "ISC2 CC"],
    objective: "Read the safeguard described and name its control function: preventive, detective or corrective.",
    answerLabel: "Control function",
    answerPlaceholder: "preventive, detective or corrective",
    lesson: `Security **controls** are the safeguards that reduce risk. One key way to classify them is by **function** \u2014 *when* they act relative to an incident:

- **Preventive** \u2014 stops it happening (a firewall, a lock, MFA, input validation).
- **Detective** \u2014 notices it happening or after the fact (logs, IDS, CCTV, a SIEM alert).
- **Corrective** \u2014 fixes or limits damage after (restoring from backup, patching, isolating a host).

(Controls are also grouped by **type**: technical, administrative/managerial, physical \u2014 a separate axis from function.)

Matching a safeguard to its function is how you reason about **defence in depth**: you want controls across all three, because prevention eventually fails and you need to detect and recover.

### Your task
Read the control on the right and name its **function** (preventive, detective or corrective).`,
    hints: ["Ask when the control acts: before (stop it), during/after (notice it), or after (fix it)?", "A backup restoration is corrective. An IDS alert is detective. MFA is preventive."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "preventive", keys: ["prevent"], text: "The company requires multi-factor authentication on every remote login, blocking access unless a second factor is provided." },
        { a: "detective", keys: ["detect"], text: "A SIEM continuously analyses logs and raises an alert when it sees many failed logins followed by a success." },
        { a: "corrective", keys: ["correct"], text: "After a ransomware incident, the team restores affected servers from clean offline backups to return to normal operation." },
        { a: "preventive", keys: ["prevent"], text: "All web form input is validated against an allow-list before processing, so malformed data never reaches the application logic." },
        { a: "detective", keys: ["detect"], text: "Security cameras and motion sensors record activity in the server room and flag after-hours entry." },
      ];
      const pick = cases[ctx.int(0, cases.length - 1)];
      return { _keys: pick.keys, files: [{ name: "control.txt", kind: "text", note: "A security control. Which function is it?", data: pick.text + "\n\nAnswer: preventive, detective or corrective?" }] };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return env._keys.some((k) => v.includes(k));
    },
    debrief: `You classified the safeguard by **function**. Good programs layer all three: preventive controls fail eventually, detective controls catch what slips through, and corrective controls limit and repair the damage \u2014 defence in depth.

### In practice
- The same goal often needs all three: prevent (MFA), detect (login alerts), correct (revoke and reset).
- Don't confuse **function** (preventive/detective/corrective) with **type** (technical/administrative/physical) \u2014 exams test both axes.

**On the exam:** control functions and types are guaranteed Security+, SSCP and CISSP questions.`,
  },
];
