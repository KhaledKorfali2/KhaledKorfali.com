// Track: Cloud & Hardening. Cloud-specific misconfigurations and baseline review.
import { esc } from "../engines/browser.js";
import { norm } from "../flags.js";

export default [
  {
    id: "cloud-bucket",
    title: "The Open Bucket",
    level: 2,
    slug: "public_storage_bucket",
    time: 9,
    certs: ["Security+", "CySA+", "PenTest+"],
    objective: "A cloud storage bucket was left open to the world. List its contents and read the file that shouldn't be there.",
    lesson: `Cloud **object storage** (Amazon S3, Azure Blob, Google Cloud Storage) holds much of the internet's data in **buckets**. By default they're private — but a single wrong setting makes a bucket **public**, and then anyone who knows or guesses its address can list and download everything in it.

Public buckets are behind countless breaches: backups, databases and customer data sitting at a predictable URL with no authentication. Attackers and researchers scan for them constantly.

A public bucket often returns an **XML listing** of its objects when you visit its root. From there you just request the file you want.

### Your task
Open the bucket URL in the browser. Read the listing, find the object that clearly shouldn't be public, and open it.`,
    hints: ["Visit the bucket root — it returns an XML list of objects (look for <Key> entries).", "One object name stands out as sensitive. Put its path after the bucket URL in the address bar.", "Request that object to read the flag."],
    workspace: { type: "browser" },
    setup(ctx) {
      const bucket = `${ctx.word()}-prod-assets`;
      const host = `${bucket}.s3.amazonaws.example`;
      const secret = `backups/db_dump_${ctx.hex(4)}.sql`;
      const listing = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>${bucket}</Name>
  <Contents><Key>index.html</Key><Size>512</Size></Contents>
  <Contents><Key>css/style.css</Key><Size>2048</Size></Contents>
  <Contents><Key>img/logo.png</Key><Size>8192</Size></Contents>
  <Contents><Key>${esc(secret)}</Key><Size>4194304</Size></Contents>
</ListBucketResult>`;
      return {
        devtools: true,
        start: `http://${host}/`,
        sites: { [host]: { routes: [
          ["GET", "/", (req, res) => res.html(`<pre>${esc(listing)}</pre>`)],
          ["GET", "/" + secret, (req, res) => res.text(`-- MySQL dump\n-- host: prod-db\n\n-- NOTE for QA: canary value ${ctx.flag}\nINSERT INTO users VALUES (1,'admin','...');`)],
          ["GET", "/*", (req, res) => res.text("That key exists but isn't the interesting one.")],
        ] } },
      };
    },
    debrief: `The bucket was world-readable, so its object listing exposed a **database backup** sitting next to the website's static files. No exploit was needed — just a request.

### How defenders stop it
- **Block public access** at the account level; make buckets private by default and grant access with scoped, temporary credentials.
- Separate public assets from private data into different buckets.
- Use cloud posture tools (CSPM) to continuously flag public buckets, and enable access logging.

**On the exam:** cloud storage misconfiguration is a core Security+ and PenTest+ topic, and a top real-world cloud breach cause.`,
  },

  {
    id: "cloud-iam-policy",
    title: "A Policy Too Wide",
    level: 3,
    slug: "overpermissive_iam_policy",
    time: 11,
    certs: ["Security+", "CISSP", "SSCP"],
    objective: "Review the cloud IAM policy. One statement grants far too much. Submit that statement's Sid (its id).",
    answerLabel: "Statement Sid",
    answerPlaceholder: "the dangerous statement's Sid",
    lesson: `In the cloud, who-can-do-what is written as **IAM policies** — JSON documents listing \`Effect\` (Allow/Deny), \`Action\` (what), and \`Resource\` (on what). Least privilege means each is as narrow as possible.

The cardinal sin is the **wildcard**:

\`\`\`json
{ "Effect": "Allow", "Action": "*", "Resource": "*" }
\`\`\`

That grants **every action on every resource** — full administrative control. Attached to an app or user that only needs to read one bucket, it's a catastrophe waiting to happen: compromise that identity and the attacker owns the whole account.

### Your task
Read the policy. Each statement has a \`Sid\` (statement id). Find the one that grants dangerously broad access and submit its **Sid**.`,
    hints: ["Scan each statement's Action and Resource. Look for \"*\" (wildcard) where a specific value should be.", "The statement allowing Action \"*\" on Resource \"*\" is admin-level — far more than any app needs.", "Submit the Sid (the statement's id string) of that statement."],
    workspace: { type: "files" },
    setup(ctx) {
      const badSid = `Allow${ctx.word().replace(/^./, (c) => c.toUpperCase())}${ctx.int(10, 99)}`;
      const sids = ctx.shuffle([
        { Sid: "ReadAppConfig", Effect: "Allow", Action: ["s3:GetObject"], Resource: "arn:aws:s3:::app-config/*" },
        { Sid: "WriteLogs", Effect: "Allow", Action: ["logs:PutLogEvents"], Resource: "arn:aws:logs:*:*:log-group:/app/*" },
        { Sid: badSid, Effect: "Allow", Action: "*", Resource: "*" },
        { Sid: "ReadQueue", Effect: "Allow", Action: ["sqs:ReceiveMessage", "sqs:DeleteMessage"], Resource: "arn:aws:sqs:*:*:jobs" },
      ]);
      const policy = JSON.stringify({ Version: "2012-10-17", Statement: sids }, null, 2);
      return { _sid: badSid, files: [{ name: "role-policy.json", kind: "text", note: "The IAM policy attached to a background-worker role. Review it for least privilege.", data: policy }] };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._sid);
    },
    debrief: `One statement allowed \`"Action": "*"\` on \`"Resource": "*"\` — full admin — on a role that only needed to read config, write logs and poll a queue. If that worker were compromised, the attacker would inherit control of the entire cloud account.

### How defenders stop it
- Write **least-privilege** policies: name specific actions and specific resource ARNs.
- Use access analyzers and policy linters that flag wildcards automatically.
- Prefer short-lived, scoped credentials (roles) over long-lived keys, and review permissions regularly.

**On the exam:** IAM policy review, wildcards and least privilege in the cloud appear in Security+, SSCP and CISSP.`,
  },

  {
    id: "cloud-posture",
    title: "Reading the Posture Report",
    level: 2,
    slug: "cloud_security_posture",
    time: 8,
    certs: ["Security+", "CySA+", "GSEC"],
    objective: "A posture scan flagged several findings. Open the one CRITICAL finding's detail to recover the exposed flag.",
    lesson: `Cloud environments are big and change fast, so teams run **Cloud Security Posture Management (CSPM)** tools that continuously check the account against a **baseline** of best practices (the CIS Benchmarks are the common standard). The output is a report of **findings**, each with a severity: a storage bucket is public, encryption is off, a security group allows the world in on port 22, logging is disabled.

Analysts **triage** by severity — CRITICAL and HIGH first — and fix or risk-accept each one.

### Your task
Read the scan report. Find the single **CRITICAL** finding and read its detail; the exposure it describes includes the flag.`,
    hints: ["Scan the report for the severity column. Focus on the CRITICAL line.", "The CRITICAL finding's detail quotes the exposed value — that's the flag."],
    workspace: { type: "files" },
    setup(ctx) {
      const rows = [
        `[MEDIUM]  S3 bucket 'logs-archive' has no lifecycle policy`,
        `[LOW]     IAM user 'devops' last rotated key 88 days ago`,
        `[HIGH]    Security group sg-${ctx.hex(6)} allows 0.0.0.0/0 on port 22 (SSH)`,
        `[CRITICAL] Secrets Manager secret 'prod/api' is logged in plaintext to CloudWatch`,
        `           -> exposed value observed in logs: ${ctx.flag}`,
        `[MEDIUM]  RDS instance 'analytics' not encrypted at rest`,
        `[LOW]     CloudTrail multi-region logging enabled (ok)`,
      ];
      return { files: [{ name: "cspm-report.txt", kind: "text", note: "Cloud Security Posture Management scan output. Triage by severity.", data: rows.join("\n") }] };
    },
    debrief: `The CRITICAL finding was a secret written to logs in **plaintext** — a common and nasty leak, because logs are widely readable and long-retained. Everything that secret protects should now be considered compromised and rotated.

### How defenders stop it
- Never log secrets; scrub sensitive values before logging, and scan logs for secret patterns.
- Fix CSPM findings by severity, and encode critical baseline checks as **guardrails** that prevent the misconfig rather than just reporting it.
- Rotate anything that lands in a log.

**On the exam:** CSPM, baselines/benchmarks and severity-based triage are tested in Security+, CySA+ and GSEC.`,
  },

  {
    id: "cloud-trail",
    title: "Follow the Keys",
    level: 3,
    slug: "cloud_audit_log_analysis",
    time: 12,
    certs: ["CySA+", "CEH"],
    objective: "A leaked access key is being abused. Read the cloud audit log and submit the access key ID making suspicious calls from a new location.",
    answerLabel: "Access key ID",
    answerPlaceholder: "e.g. AKIA...",
    lesson: `Cloud providers log every API call to an **audit trail** (AWS CloudTrail, Azure Activity Log). Each entry records *who* (the access key/identity), *what* (the API action), *when*, and *from where* (source IP and often geolocation). This is the single most important data source for investigating cloud incidents.

When a long-lived **access key** leaks (committed to GitHub, pasted in a ticket), attackers use it. The tell in the trail: the same key suddenly making **sensitive** calls (listing buckets, creating users, changing policies) from an **unfamiliar IP or country**, often right after normal activity from its usual location.

### Your task
Read the audit log. One access key is being used from a new location to make sensitive calls it never made before. Submit that **access key ID**.`,
    hints: ["Each entry shows an access key, an action, and a source location.", "Find the key whose location suddenly changes and that starts making sensitive calls (CreateUser, PutUserPolicy, ListBuckets).", "Submit that AKIA... key ID."],
    workspace: { type: "files" },
    setup(ctx) {
      const goodKey = `AKIA${ctx.hex(16).toUpperCase().slice(0, 16)}`;
      const badKey = `AKIA${ctx.hex(16).toUpperCase().slice(0, 16)}`;
      const usCity = "us-east-1 (198.51.100." + ctx.int(2, 250) + ")";
      const badCity = "unknown (" + `${ctx.int(80, 200)}.${ctx.int(1, 254)}.${ctx.int(1, 254)}.${ctx.int(1, 254)}` + ", RU)";
      const log = [
        `08:01  ${goodKey}  s3:GetObject         ${usCity}`,
        `08:03  ${badKey}   s3:GetObject         ${usCity}`,
        `08:04  ${goodKey}  logs:PutLogEvents    ${usCity}`,
        `09:42  ${badKey}   sts:GetCallerIdentity ${badCity}`,
        `09:43  ${badKey}   iam:ListUsers        ${badCity}`,
        `09:44  ${badKey}   s3:ListAllMyBuckets  ${badCity}`,
        `09:45  ${badKey}   iam:CreateUser       ${badCity}`,
        `09:46  ${badKey}   iam:PutUserPolicy    ${badCity}`,
        `09:50  ${goodKey}  s3:GetObject         ${usCity}`,
      ];
      return { _key: badKey, files: [{ name: "cloudtrail.log", kind: "log", note: "Cloud API audit log. One key has been stolen — find it.", data: log.join("\n") }] };
    },
    check(input, ctx, env) {
      return norm.text(input).toUpperCase() === env._key.toUpperCase();
    },
    debrief: `One access key kept working from its normal region, then the **same key** appeared from a foreign IP and immediately ran reconnaissance and privilege-building calls (\`ListUsers\`, \`CreateUser\`, \`PutUserPolicy\`) — the signature of a leaked key being abused.

### How defenders stop it
- Prefer short-lived role credentials over long-lived access keys; rotate and scope keys tightly.
- Alert on **impossible travel**, first-time regions, and sensitive IAM calls in the audit trail.
- Scan code and tickets for leaked keys, and disable a key the instant it's exposed.

**On the exam:** cloud audit-log analysis and credential-abuse detection are CySA+ and CEH topics.`,
  },
];
