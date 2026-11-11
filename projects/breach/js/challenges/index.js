// The course: tracks in recommended order, each a list of challenges (easy → hard).
// Scope: analysis and defense. Every target is simulated and read-only; learners
// extract information rather than compromise systems.
import basics from "./basics.js";
import crypto from "./crypto.js";
import web from "./web.js";
import iam from "./iam.js";
import appsec from "./appsec.js";
import cloud from "./cloud.js";
import osint from "./osint.js";
import net from "./net.js";
import threats from "./threats.js";
import blue from "./blue.js";
import grc from "./grc.js";

export const TRACKS = [
  { id: "basics", title: "First Steps", icon: "flag", blurb: "How a capture-the-flag works, and the first thing every analyst checks: what a page is already telling you.", list: basics },
  { id: "crypto", title: "Encoding & Cryptography", icon: "lock", blurb: "Encoding isn't encryption. Decode data, break classical ciphers, and see why weak password hashing matters.", list: crypto },
  { id: "web", title: "Web Recon & Client Trust", icon: "globe", blurb: "Read what a website really sends you: source, cookies, tokens and the mistake of trusting the browser.", list: web },
  { id: "iam", title: "Identity & Access", icon: "lock", blurb: "How systems prove who you are and limit what you can do: factors and MFA, password storage, least privilege, sessions.", list: iam },
  { id: "appsec", title: "Secure Coding & Review", icon: "file", blurb: "Read code and config like a reviewer: find the hardcoded secret, the vulnerable dependency, the missing validation.", list: appsec },
  { id: "cloud", title: "Cloud & Hardening", icon: "shield", blurb: "The cloud's own failure modes: open buckets, over-broad IAM policies, posture findings and leaked-key abuse in audit logs.", list: cloud },
  { id: "osint", title: "Recon & Social Engineering", icon: "map", blurb: "The human and open-source attack surface: metadata leaks, lookalike domains, reused passwords and the social-engineering playbook.", list: osint },
  { id: "net", title: "Networks & Packet Analysis", icon: "wave", blurb: "Read packet captures like an analyst: follow a conversation, spot cleartext credentials, trace what happened.", list: net },
  { id: "threats", title: "Threats & Detection", icon: "chip", blurb: "Spot the attacker in the noise: decode payloads, match indicators, catch C2 beaconing and map it to ATT&CK.", list: threats },
  { id: "blue", title: "Forensics & Defense", icon: "shield", blurb: "Investigate logs, phishing emails and hidden data to reconstruct an incident, the way a SOC analyst does.", list: blue },
  { id: "grc", title: "Governance & Risk", icon: "map", blurb: "The management side the big certifications test: risk maths, access-control models, policy and incident response.", list: grc },
];

for (const t of TRACKS) for (const c of t.list) c.track = t.id;
export const ALL = TRACKS.flatMap((t) => t.list);
export const byId = (id) => ALL.find((c) => c.id === id);
export const trackOf = (c) => TRACKS.find((t) => t.id === c.track);

export const CERTS = [
  { id: "ISC2 CC", org: "ISC2", level: "Entry", about: "Certified in Cybersecurity: a free, beginner certification covering the five core domains — security principles, access control, network security, operations and incident response." },
  { id: "Security+", org: "CompTIA", level: "Entry", about: "The baseline security certification: threats, cryptography, architecture, operations and governance. Widely required for government security roles." },
  { id: "Network+", org: "CompTIA", level: "Entry", about: "Networking foundations: protocols, addressing, the OSI model, and reading traffic — the groundwork security builds on." },
  { id: "CySA+", org: "CompTIA", level: "Intermediate", about: "Blue-team analysis: log and packet investigation, threat hunting, vulnerability management and incident response." },
  { id: "SSCP", org: "ISC2", level: "Intermediate", about: "Systems Security Certified Practitioner: the hands-on operational counterpart to CISSP — access control, monitoring, cryptography and incident response." },
  { id: "PenTest+", org: "CompTIA", level: "Intermediate", about: "The offensive counterpart to CySA+: planning engagements, reconnaissance, web and network testing, and reporting. Breach covers its recon and analysis groundwork, not live exploitation." },
  { id: "CEH", org: "EC-Council", level: "Intermediate", about: "Ethical-hacking methodology and the reconnaissance, analysis and reporting phases, with a broad survey of concepts." },
  { id: "GSEC", org: "GIAC", level: "Intermediate", about: "GIAC Security Essentials: a broad, hands-on validation of defensive security across crypto, networking, incident handling and more." },
  { id: "GCIH", org: "GIAC", level: "Intermediate", about: "GIAC Certified Incident Handler: detecting, responding to and recovering from attacks — log analysis, correlation, containment and common attack techniques." },
  { id: "CISSP", org: "ISC2", level: "Advanced", about: "Management-level breadth across 8 domains: risk, cryptography, architecture, identity and operations. Needs experience to certify." },
];

/** Linear within a track: a challenge unlocks once the previous one in its track is solved. */
export function isUnlocked(c, isSolved) {
  const t = trackOf(c);
  const i = t.list.indexOf(c);
  return i === 0 || isSolved(t.list[i - 1].id);
}
