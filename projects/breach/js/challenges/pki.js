// Track: Keys, Certificates & PKI. Applied cryptography — symmetric vs asymmetric,
// AES modes, RSA key roles, digital signatures, certificates, and key exchange.
import { norm } from "../flags.js";

const doc = (name, note, text, kind = "text") => ({ files: [{ name, kind, note, data: text }] });
// modular exponentiation for small Diffie–Hellman
const modexp = (base, exp, mod) => { let r = 1; base %= mod; while (exp > 0) { if (exp & 1) r = (r * base) % mod; exp >>= 1; base = (base * base) % mod; } return r; };

export default [
  {
    id: "pki-sym-asym",
    title: "Which Kind of Key?",
    level: 2,
    slug: "symmetric_vs_asymmetric",
    time: 8,
    certs: ["Security+", "ISC2 CC", "CISSP"],
    objective: "Read the situation and say whether it calls for symmetric or asymmetric cryptography.",
    answerLabel: "Symmetric or asymmetric",
    answerPlaceholder: "symmetric / asymmetric",
    lesson: `There are two families of encryption, and knowing which fits a job is fundamental:

- **Symmetric** — **one shared key** encrypts and decrypts (AES, ChaCha20). It's **fast**, ideal for bulk data, but both sides need the *same* key, which raises the question: how do you share it safely?
- **Asymmetric** (public-key) — a **key pair**: a **public** key anyone can have, and a **private** key you keep secret. What one encrypts, only the other decrypts (RSA, ECC). It's **slow**, but it solves key distribution and enables signatures — no shared secret needed in advance.

In practice they team up (**hybrid**): asymmetric crypto to safely exchange a random symmetric key, then fast symmetric crypto for the actual data. That's exactly how TLS/HTTPS works.

### Your task
Read the scenario and answer with the family that fits best: **symmetric** or **asymmetric**.`,
    hints: ["Bulk speed with a key both sides already share → one family. No shared key yet, or you need a public/private pair → the other.", "Encrypting a huge file fast is symmetric. Letting strangers send you secrets with no pre-shared key is asymmetric."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "symmetric", keys: ["symmetric"], text: "A backup system must encrypt 2 TB of data every night as fast as possible. Both the backup and restore services run on the same trusted host and already share a key." },
        { a: "asymmetric", keys: ["asymmetric", "public", "public-key", "public key"], text: "A journalist publishes a key so that anonymous sources, whom they have never met and share no secret with, can send them encrypted tips." },
        { a: "symmetric", keys: ["symmetric"], text: "Two microservices inside the same datacentre, provisioned with the same pre-shared key, need high-throughput encrypted messaging between them." },
        { a: "asymmetric", keys: ["asymmetric", "public", "public-key", "public key"], text: "A software vendor needs users worldwide to verify that an update genuinely came from the vendor, without ever sharing a secret with each user." },
      ];
      const pick = cases[ctx.int(0, cases.length - 1)];
      return { _keys: pick.keys, ...doc("scenario.txt", "Symmetric or asymmetric — which fits?", pick.text + "\n\nAnswer: symmetric or asymmetric?") };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return env._keys.some((k) => v.includes(k));
    },
    debrief: `You matched the job to the family: symmetric for **speed** when a shared key already exists, asymmetric to solve **key distribution** and enable signatures. Real systems use both — asymmetric to set up a symmetric session key, then symmetric for the data.

### In practice
- Symmetric: AES-256, ChaCha20 — bulk encryption, disk/database encryption.
- Asymmetric: RSA, ECC (Elliptic Curve) — key exchange, signatures, certificates.
- Hybrid: TLS, PGP, Signal — the best of both.

**On the exam:** the symmetric/asymmetric distinction, their speed/key-distribution trade-offs and hybrid use are guaranteed on Security+, ISC2 CC and CISSP.`,
  },

  {
    id: "pki-rsa-roles",
    title: "Whose Key Do I Use?",
    level: 2,
    slug: "public_private_key_roles",
    time: 9,
    certs: ["Security+", "CEH", "CISSP"],
    objective: "In the scenario, name exactly which key performs the operation (whose key, and public or private).",
    answerLabel: "Whose key",
    answerPlaceholder: "e.g. Bob's public key",
    lesson: `Public-key crypto trips people up because each goal uses a *different* key. The rule follows from one fact: **what one key of a pair locks, only the other unlocks.**

- **Confidentiality** (send a secret to someone): encrypt with the **recipient's public** key. Only their matching **private** key can decrypt it.
- **Authenticity / signing** (prove *you* sent it): sign with **your own private** key. Anyone can verify with your **public** key — and only you have the private key, so only you could have signed.

So: *encrypt for* someone → **their public**. *Sign as* yourself → **your private**. Verifying flips it: *decrypt* → your private; *verify a signature* → the sender's public.

### Your task
Read the scenario and name **whose** key and **which** key (public or private) is used — for example, "Bob's public key".`,
    hints: ["Sending a secret TO someone uses THEIR public key (only their private key can open it).", "Proving YOU sent something uses YOUR private key (anyone verifies with your public key).", "Answer with both the owner and the type, e.g. 'Alice's private key'."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { owner: "bob", type: "public", text: "Alice wants to send Bob a confidential message that only Bob can read. Which key does Alice encrypt it with?" },
        { owner: "alice", type: "private", text: "Alice wants to sign a document so everyone can prove it really came from her. Which key does Alice sign with?" },
        { owner: "bob", type: "private", text: "Bob receives a message that was encrypted for him. Which key does Bob use to decrypt and read it?" },
        { owner: "alice", type: "public", text: "Bob receives a document signed by Alice and wants to verify it genuinely came from her. Which key does Bob verify with?" },
      ];
      const pick = cases[ctx.int(0, cases.length - 1)];
      return { _owner: pick.owner, _type: pick.type, ...doc("scenario.txt", "Name whose key and which key (public/private).", pick.text) };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return v.includes(env._owner) && v.includes(env._type);
    },
    debrief: `You applied the rule: **encrypt for** a person with **their public** key; **sign as** yourself with **your private** key; and verifying flips each. The private key never leaves its owner — that's what makes decryption and signing meaningful.

### How defenders apply it
- Protect private keys above all (hardware tokens, HSMs, OS keystores); a leaked private key breaks everything it protected.
- Distribute public keys through trusted channels — which is exactly what certificates do.

**On the exam:** choosing the correct key for confidentiality vs authenticity is a classic Security+, CEH and CISSP question.`,
  },

  {
    id: "pki-ecb",
    title: "The Pattern in the Ciphertext",
    level: 3,
    slug: "aes_ecb_leaks_patterns",
    time: 11,
    certs: ["Security+", "CySA+", "CEH"],
    objective: "One ciphertext was encrypted with AES in insecure ECB mode. Identify it by its repeating blocks and submit its sample number.",
    answerLabel: "Sample number",
    answerPlaceholder: "1, 2, 3 or 4",
    lesson: `A strong cipher like AES still needs a **mode of operation** to encrypt data longer than one 16-byte block — and the mode matters enormously.

**ECB** (Electronic Codebook) is the naive mode: it encrypts each 16-byte block **independently**. The fatal flaw: **identical plaintext blocks produce identical ciphertext blocks.** So patterns in the data survive encryption — the famous "ECB penguin" image is still clearly a penguin after ECB encryption. An attacker sees structure, and can even cut-and-paste blocks.

You spot ECB without any key: look for **repeated 16-byte (32 hex-character) blocks** in the ciphertext. Random-looking modes (CBC, CTR, GCM) never repeat blocks like that.

### Your task
The file has four hex ciphertexts. Exactly one was encrypted with **ECB** and contains a **repeated 16-byte block**. Find it and submit its **sample number**.`,
    hints: ["Split each ciphertext into 16-byte (32 hex-char) blocks and look for two that are identical.", "Three samples have all-unique blocks (secure modes). One repeats a block — that's ECB.", "Submit the number (1–4) of the sample with the duplicate block."],
    workspace: { type: "files" },
    setup(ctx) {
      const block = () => ctx.hex(32); // 16 bytes
      const ecbIdx = ctx.int(1, 4);
      const samples = [];
      for (let n = 1; n <= 4; n++) {
        let blocks = [block(), block(), block(), block()];
        if (n === ecbIdx) { blocks[3] = blocks[1]; } // a repeated block → ECB tell
        samples.push(`Sample ${n}: ${blocks.join("")}`);
      }
      return { _answer: ecbIdx, ...doc("ciphertexts.txt", "Four AES ciphertexts (hex). One used ECB. Find the repeated block.", samples.join("\n\n")) };
    },
    check(input, ctx, env) {
      return norm.num(input) === env._answer;
    },
    debrief: `One ciphertext repeated a 16-byte block — proof it was encrypted with **ECB**, where identical plaintext blocks map to identical ciphertext. That leak lets an attacker see structure and shuffle blocks, all without the key.

### How defenders stop it
- **Never use ECB.** Use an authenticated mode: **AES-GCM** (or ChaCha20-Poly1305), which adds both confidentiality and integrity.
- Authenticated encryption also detects tampering; unauthenticated modes (even CBC) don't on their own.
- Let vetted libraries pick modes and nonces — don't hand-roll crypto.

**On the exam:** ECB's pattern leak and preferring authenticated modes (GCM) are tested in Security+, CySA+ and CEH.`,
  },

  {
    id: "pki-signature",
    title: "You Can't Deny It",
    level: 3,
    slug: "digital_signatures_properties",
    time: 9,
    certs: ["Security+", "CISSP", "ISC2 CC"],
    objective: "Read the scenario and name the single security property a digital signature provides that plain encryption does not.",
    answerLabel: "Property",
    answerPlaceholder: "integrity, authenticity or non-repudiation",
    lesson: `A **digital signature** is made by signing a message's hash with the signer's **private key**. Anyone can verify it with the signer's **public key**. It delivers three properties at once:

- **Integrity** — if the message changed, the signature fails to verify.
- **Authenticity** — only the holder of the private key could have produced it, proving *who* signed.
- **Non-repudiation** — because only the signer has that private key, they **cannot later deny** having signed. (A shared-secret HMAC can't give this: *either* party could have made it.)

Signing is not encryption — a signed message isn't secret, it's *verifiable*. The two are often combined, but they solve different problems.

### Your task
Read the scenario and name the property at issue: **integrity**, **authenticity**, or **non-repudiation**.`,
    hints: ["Is the question about whether the message changed (integrity), who sent it (authenticity), or whether the sender can later deny it (non-repudiation)?", "A signer trying to deny they ever signed is defeated by non-repudiation — only they hold the private key."],
    workspace: { type: "files" },
    setup(ctx) {
      const cases = [
        { a: "non-repudiation", keys: ["non-repudiation", "nonrepudiation", "non repudiation", "repudiation"], text: "A vendor digitally signed a contract with their private key, then three months later claimed they never agreed to it. The signature proves otherwise. Which property defeats their denial?" },
        { a: "integrity", keys: ["integrity"], text: "A signed firmware update is modified by an attacker in transit. The device checks the signature, finds it no longer verifies, and refuses the update. Which property caught the change?" },
        { a: "authenticity", keys: ["authenticity", "authentic"], text: "A user receives an email signed with a certificate and confirms it genuinely came from their bank and not an impersonator. Which property does the signature establish here?" },
      ];
      const pick = cases[ctx.int(0, cases.length - 1)];
      return { _keys: pick.keys, ...doc("scenario.txt", "Which property does the signature provide here?", pick.text) };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return env._keys.some((k) => v.includes(k));
    },
    debrief: `You named the property. All three come from signing a hash with a **private key only the signer holds** — which is also why a signature gives **non-repudiation** where a shared-key HMAC cannot: with HMAC, either key-holder could have produced it, so neither can be uniquely bound to it.

### How defenders apply it
- Sign software, documents, emails (code signing, S/MIME, PGP) so recipients verify origin and integrity.
- Protect signing keys in HSMs; a stolen signing key lets an attacker forge trusted content.

**On the exam:** the three signature properties and the HMAC-vs-signature (non-repudiation) distinction are tested in Security+, ISC2 CC and CISSP.`,
  },

  {
    id: "pki-cert",
    title: "Why Won't It Trust This Site?",
    level: 3,
    slug: "x509_certificate_validation",
    time: 11,
    certs: ["Security+", "Network+", "CySA+"],
    objective: "A browser rejected this site's certificate. Read the certificate details and submit the reason it's invalid.",
    answerLabel: "Reason",
    answerPlaceholder: "e.g. expired / self-signed / name mismatch",
    lesson: `HTTPS works because a **certificate** binds a website's identity to its public key, and a trusted **Certificate Authority (CA)** vouches for that binding by signing it. Your browser trusts a built-in list of CAs, and checks several things before trusting a site's cert:

- **Validity dates** — is *now* between "Not Before" and "Not After"? An **expired** cert is rejected.
- **Name match** — does the cert's subject (CN / Subject Alternative Name) match the hostname you visited? A **mismatch** is rejected.
- **Trust chain** — is it signed by a trusted CA, chaining up to a trusted root? A **self-signed** cert (issuer = subject, no real CA) isn't trusted.
- **Revocation** — has the CA revoked it (CRL/OCSP)?

### Your task
Read the certificate on the right and the hostname that was visited. Identify the single reason the browser rejects it (expired, name mismatch, or self-signed) and submit it.`,
    hints: ["Compare the Not After date with the current date; compare the Subject CN/SAN with the visited hostname; and check whether Issuer equals Subject (self-signed).", "Only one thing is wrong here. Expired = past Not After. Mismatch = CN doesn't match the host. Self-signed = Issuer equals Subject.", "Answer with the reason: expired, name mismatch, or self-signed."],
    workspace: { type: "files" },
    setup(ctx) {
      const host = `${ctx.word()}bank.com`;
      const caName = "DigiTrust Global CA";
      const problems = [
        { a: "expired", keys: ["expired", "expire", "not after", "out of date", "validity"],
          subjectCN: host, issuer: caName, notBefore: "2023-01-10", notAfter: "2024-02-01", visited: host },
        { a: "name mismatch", keys: ["mismatch", "name", "hostname", "cn", "subject", "wrong"],
          subjectCN: `${ctx.word()}shop.com`, issuer: caName, notBefore: "2026-01-10", notAfter: "2027-06-01", visited: host },
        { a: "self-signed", keys: ["self-signed", "self signed", "selfsigned", "issuer", "untrusted", "not trusted", "no ca"],
          subjectCN: host, issuer: host, notBefore: "2026-01-10", notAfter: "2027-06-01", visited: host },
      ];
      const p = problems[ctx.int(0, problems.length - 1)];
      const cert = [
        `=== Certificate presented by ${p.visited} (today: 2026-11-11) ===`,
        ``,
        `Subject:    CN = ${p.subjectCN}`,
        `Issuer:     CN = ${p.issuer}`,
        `Not Before: ${p.notBefore}`,
        `Not After:  ${p.notAfter}`,
        `Subject Alternative Name: DNS:${p.subjectCN}`,
        `Public Key: RSA 2048-bit`,
        `Signature:  SHA-256 with RSA`,
        ``,
        `Browser visited: https://${p.visited}/`,
      ].join("\n");
      return { _keys: p.keys, ...doc("certificate.txt", "The TLS certificate the browser refused. Why?", cert) };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      return env._keys.some((k) => v.includes(k));
    },
    debrief: `One check failed — an **expired** validity window, a **name mismatch** between the certificate and the visited host, or a **self-signed** certificate (issuer = subject, vouched for by no trusted CA). Any one breaks the chain of trust, so the browser warns.

### How defenders apply it
- Automate certificate issuance and **renewal** (ACME / Let's Encrypt) so certs never expire unnoticed.
- Match certs to every hostname (SAN entries, wildcards) and use certs from trusted CAs in production.
- Monitor expiry and use HSTS; treat certificate warnings as a stop sign, not a click-through.

**On the exam:** X.509 validation (dates, name match, chain of trust, revocation) is tested in Security+, Network+ and CySA+.`,
  },

  {
    id: "pki-dh",
    title: "A Secret in the Open",
    level: 4,
    slug: "diffie_hellman_key_exchange",
    time: 13,
    certs: ["Security+", "CISSP", "GSEC"],
    objective: "Using the Diffie–Hellman values provided, compute the shared secret key and submit it.",
    answerLabel: "Shared secret",
    answerPlaceholder: "a number",
    lesson: `**Diffie–Hellman** lets two people agree on a shared secret key over a **public** channel — even if everyone is listening — without ever transmitting the key itself. It's the magic that bootstraps symmetric encryption in TLS.

It works with modular arithmetic. Public parameters: a prime **p** and a base **g**. Then:
- Alice picks a secret **a**, sends **A = g^a mod p**.
- Bob picks a secret **b**, sends **B = g^b mod p**.
- Alice computes **B^a mod p**; Bob computes **A^b mod p**. Both equal **g^(ab) mod p** — the **shared secret**.

An eavesdropper sees p, g, A and B but not a or b, and recovering them (the discrete-log problem) is infeasible for large numbers.

### Your task
You are **Alice**. Using your secret and **Bob's public value**, compute the shared secret **B^a mod p** and submit the number. (The numbers are small — work it out step by step, reducing mod p as you go, or with any calculator.)`,
    hints: ["You are Alice. The shared secret is Bob's public value raised to YOUR secret, mod p: B^a mod p.", "Compute step by step and take mod p after each multiplication to keep the numbers small.", "Bob would get the same answer with A^b mod p — that's the point. Submit the resulting number."],
    workspace: { type: "files" },
    setup(ctx) {
      const p = 23, g = 5;
      const a = ctx.int(4, 12), b = ctx.int(4, 12);
      const A = modexp(g, a, p), B = modexp(g, b, p);
      const secret = modexp(B, a, p);
      const text = [
        `Diffie–Hellman key exchange`,
        ``,
        `Public parameters:`,
        `  prime  p = ${p}`,
        `  base   g = ${g}`,
        ``,
        `You are ALICE. Your secret:  a = ${a}`,
        `Bob sent his public value:   B = ${B}`,
        ``,
        `(For reference, your public value A = ${A} was sent to Bob.)`,
        ``,
        `Compute the shared secret:  B^a mod p`,
      ].join("\n");
      return { _secret: secret, ...doc("dh-exchange.txt", "Compute the Diffie–Hellman shared secret.", text) };
    },
    check(input, ctx, env) {
      return norm.num(input) === env._secret;
    },
    debrief: `You computed **B^a mod p** = the shared secret. Bob independently got the same value from **A^b mod p**, yet the secret itself never crossed the wire — an eavesdropper saw only p, g, A and B. That's the breakthrough: a shared key established in the open.

### How defenders apply it
- TLS uses **ephemeral** Diffie–Hellman (DHE/ECDHE) to give **forward secrecy**: a new key per session, so stealing the server's long-term key can't decrypt past traffic.
- Use large, vetted parameters (or elliptic-curve DH); tiny textbook numbers like these are only for learning.

**On the exam:** Diffie–Hellman, key exchange and forward secrecy are tested in Security+, CISSP and GSEC.`,
  },
];
