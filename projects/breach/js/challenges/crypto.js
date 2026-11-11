// Track: Encoding & Cryptography. Learners decode with the Toolkit (drawer on every challenge).
import * as C from "../tools/crypto.js";
import { norm } from "../flags.js";


export default [
  {
    id: "crypto-base64",
    title: "Base64 Isn't a Secret",
    level: 1,
    slug: "encoding_is_not_encryption",
    time: 6,
    certs: ["Security+", "CEH", "ISC2 CC"],
    objective: "The note holds a Base64 string. Decode it to reveal the flag.",
    lesson: `The single most common thing you'll decode in security work is **Base64**. It turns raw bytes into 64 safe characters (A–Z, a–z, 0–9, \`+\`, \`/\`), so binary data can travel through things built for text: email, JSON, URLs, cookies, config files.

You can spot it by eye:
- letters, digits, \`+\` and \`/\`
- often ends in one or two \`=\` (padding)
- length is a multiple of 4

\`\`\`
SGVsbG8=   →  Hello
\`\`\`

The crucial point: **Base64 is encoding, not encryption**. There's no key. Anyone can reverse it instantly. Storing a password "in Base64" protects nothing. Yet credentials, tokens and config secrets are hidden this way constantly, and reading them is step one of countless investigations.

### Do it
Open the **Toolkit** (top of the target panel, or the button in the challenge). Paste the string, click **Base64 → text**.`,
    hints: ["This is Base64. Open the Toolkit with the button at the top of the target panel.", "Paste the whole string into the Toolkit input and press *Base64 → text*."],
    workspace: { type: "files" },
    setup(ctx) {
      return { files: [{ name: "intercepted.txt", kind: "text", note: "Captured from an app's network traffic.", data: `Authorization: Basic ${C.b64encode("admin:" + ctx.flag)}` }] };
    },
    debrief: `You decoded an HTTP **Basic Auth** header. That header is *literally* \`base64(username:password)\` — no encryption at all. On an unencrypted (HTTP) connection, anyone watching the network reads the credentials directly.

### How defenders stop it
- Only ever send credentials over **HTTPS/TLS**, which encrypts the whole exchange.
- Prefer tokens with limited scope and lifetime over sending a password on every request.
- Never treat Base64 as a security control.

**On the exam:** Security+ and CEH both test that you know encoding (Base64, hex, URL) is reversible and is *not* a confidentiality control.`,
  },

  {
    id: "crypto-layers",
    title: "Peel the Onion",
    level: 2,
    slug: "decode_in_layers",
    time: 8,
    certs: ["Security+", "CEH"],
    objective: "The data has been encoded more than once. Keep decoding until you reach the flag.",
    lesson: `Real captured data is often encoded in **layers**: hex wrapping Base64, Base64 wrapping more Base64, and so on. Malware configs and obfuscated scripts do this to slow analysts down.

The method is simple: **decode one layer, look at the result, decide what it is, decode again.** The Toolkit's *Use output as input* button is built for exactly this, so you can chain steps without copy-pasting.

How to recognise each layer:
- only \`0-9 a-f\` (often in pairs) → **hex**
- \`A-Za-z0-9+/=\` → **Base64**
- \`%41%42\` → **URL encoding**
- \`01000001\` → **binary**

Keep going until the output is readable text.`,
    hints: ["Start by identifying the outermost layer. Only 0-9 and a-f? That's hex.", "After each decode, click *Use output as input* and identify the next layer.", "The order here is hex, then Base64. The final text is the flag."],
    workspace: { type: "files" },
    setup(ctx) {
      const inner = C.b64encode(ctx.flag);
      const outer = C.hexEncode(inner);
      return { files: [{ name: "payload.bin", kind: "text", note: "Extracted from a suspicious script. It's been encoded twice.", data: outer }] };
    },
    debrief: `Two layers: **hex → Base64 → text**. Nothing here was encrypted; it was obfuscated. Obfuscation raises the effort to read something, but it never makes it secret.

### How defenders stop it
- Analysts use automated "recipe" decoders (CyberChef is the famous one; the Toolkit is a small version) to peel layers quickly.
- Detection tools flag the *behaviour* of decoding and running data, not just the encoded string.

**On the exam:** recognising encoding chains by their character sets is a practical analysis skill tested across Security+, CySA+ and CEH.`,
  },

  {
    id: "crypto-caesar",
    title: "The Caesar Shift",
    level: 2,
    slug: "rotate_the_alphabet",
    time: 8,
    certs: ["Security+", "CISSP"],
    objective: "This message is shifted. Work out the shift, then read the flag. Answer with the shift number.",
    answerLabel: "Shift amount",
    answerPlaceholder: "a number 1–25",
    lesson: `The **Caesar cipher** shifts every letter along the alphabet by a fixed amount. Shift \`HELLO\` by 3 and you get \`KHOOR\`. It's 2000 years old and trivially broken, but it teaches the core idea of a **substitution cipher** and a **key** (here, the shift).

Why it's weak: there are only **25** possible shifts. You can try them all in a second. That's a **brute-force** attack, and the Toolkit's *Caesar: every shift* does exactly that, printing all 25 rows so you can eyeball the readable one.

**ROT13** is just Caesar with shift 13, popular because applying it twice returns the original.

### Your task
Decode the message, then submit **the shift that was used** (the number of positions the plaintext was moved forward to produce the ciphertext).`,
    hints: ["Use the Toolkit's *Caesar: every shift* button and read down for the line that makes sense.", "The readable row is the plaintext. The shift is how far the ORIGINAL text was moved forward to get the ciphertext.", "If the decode button labelled with shift N made it readable, the encryption shift is N."],
    workspace: { type: "files" },
    setup(ctx) {
      const shift = ctx.int(4, 22);
      return { _shift: shift, files: [{ name: "note.txt", kind: "text", note: "A shifted message. Find the shift.", data: C.caesar(`The flag is ${ctx.flag} keep rotating`, shift) }] };
    },
    check(input, ctx, env) {
      return norm.num(input) === env._shift;
    },
    debrief: `You brute-forced a Caesar cipher. With 25 keys, brute force is instant. The lesson scales up: a cipher is only as strong as the number of keys an attacker must try (its **key space**). Modern ciphers like AES use keys so large that brute force is infeasible.

### How defenders stop it
- Use vetted modern algorithms (AES, ChaCha20), never home-made or classical ciphers.
- Keep key sizes large enough that the key space can't be searched (AES-128 and up).

**On the exam:** Security+ and CISSP expect you to know substitution/rotation ciphers conceptually and why small key spaces fail. ROT13 and Caesar are the standard examples.`,
  },

  {
    id: "crypto-vigenere",
    title: "A Keyword Cipher",
    level: 3,
    slug: "the_key_is_everything",
    time: 10,
    certs: ["Security+", "CISSP"],
    objective: "This message is encrypted with a Vigenère cipher. You've recovered the key. Decrypt and submit the flag.",
    lesson: `The **Vigenère cipher** improves on Caesar by using a **keyword**. Each letter of the message is shifted by a different amount, set by the repeating keyword. If the key is \`CAT\`, the shifts cycle 2, 0, 19, 2, 0, 19, … So the same plaintext letter can encrypt to different letters, which defeats the simple "count the common letters" attack that breaks Caesar.

For centuries it was called *le chiffre indéchiffrable* (the unbreakable cipher). It isn't — if you know or can guess the **key length**, each position becomes a separate Caesar cipher. But without the key, it's much tougher than a single shift.

### Your task
Threat intel recovered the key below. Put the ciphertext and the key into the Toolkit's **Vigenère decrypt**, and read off the flag.

The key is shown in the note above the ciphertext file.`,
    hints: ["Open the file to get both the ciphertext and the recovered key.", "Toolkit → Vigenère decrypt. Enter the key when prompted, then run it on the ciphertext."],
    workspace: { type: "files" },
    setup(ctx) {
      const key = (ctx.word() + ctx.word()).slice(0, 8);
      const ct = C.vigenere(ctx.flag, key, false);
      return { files: [{ name: "cipher.txt", kind: "text", note: `Recovered key: ${key}`, data: ct }] };
    },
    debrief: `Vigenère hides letter-frequency patterns by using many shifts, but it still relies on a short, repeating key — and the **key is the whole secret**. Once intel recovered the key, the message fell instantly.

### How defenders stop it
- Modern crypto keeps the algorithm public and only the **key** secret (Kerckhoffs's principle), using keys far too long to guess.
- Keys are generated randomly, rotated, and stored in protected key stores or HSMs — never reused or embedded in code.

**On the exam:** CISSP stresses Kerckhoffs's principle and key management: the security of a cryptosystem must rest on the secrecy of the key, not the algorithm.`,
  },

  {
    id: "crypto-xor",
    title: "Single-Byte XOR",
    level: 3,
    slug: "xor_is_reversible",
    time: 10,
    certs: ["CEH", "CySA+"],
    objective: "This data was XOR'd with a single secret byte. Recover the flag.",
    lesson: `**XOR** is the workhorse operation of cryptography. XOR two bits and you get 1 only if they differ. Its magic property: applying the same value twice cancels out. \`data XOR key XOR key = data\`. So the *same* operation both encrypts and decrypts.

Malware loves **single-byte XOR** to lightly hide strings: every byte of the data is XOR'd with one secret byte (0–255). It's weak because there are only 256 possible keys, so you just try them all and look for the one that produces readable text. That's what the Toolkit's **XOR: try every 1-byte key** does, ranking results so English rises to the top.

### Your task
The file holds **hex** ciphertext. Feed it to the brute-force tool and find the flag in the output.`,
    hints: ["The file is hex. Use Toolkit → *XOR: try every 1-byte key (hex in)*.", "It prints the best-scoring keys first. The line containing BREACH{...} is your answer."],
    workspace: { type: "files" },
    setup(ctx) {
      const key = ctx.int(1, 254);
      const bytes = C.xorBytes(C.toBytes(`>> ${ctx.flag} <<`), new Uint8Array([key]));
      return { files: [{ name: "strings.hex", kind: "text", note: "Hex bytes pulled from a malware sample. Lightly obfuscated.", data: C.hexEncode(bytes, " ") }] };
    },
    debrief: `Single-byte XOR has a key space of 256, so brute force is trivial. XOR itself isn't the weakness — it's the heart of secure stream ciphers and one-time pads. The weakness is a **tiny, reused key**.

### How defenders stop it
- Real encryption uses XOR with a *keystream* as long as the data, generated from a strong cipher and key.
- Analysts treat single-byte and repeating-XOR as obfuscation, not protection, and decode it automatically.

**On the exam:** CySA+ and CEH cover XOR obfuscation in malware analysis, and the idea that reused or short keys destroy security.`,
  },

  {
    id: "crypto-hash",
    title: "Cracking a Hash",
    level: 4,
    slug: "weak_hash_weak_password",
    time: 12,
    certs: ["Security+", "CySA+", "CEH", "GSEC"],
    objective: "You've recovered a password hash. Identify it, crack it against the wordlist, and submit the plaintext password.",
    answerLabel: "Password",
    answerPlaceholder: "the cracked password",
    lesson: `A **hash** is a one-way fingerprint of data. MD5, SHA-1 and SHA-256 all turn any input into a fixed-length value, and you can't reverse the maths to get the input back. Systems store the *hash* of your password, not the password, so a database leak doesn't immediately expose everyone's password.

But "one-way" doesn't mean safe. Attackers **crack** hashes by hashing millions of guesses and comparing:
- **Wordlist/dictionary:** hash every word in a list of common passwords.
- **Brute force:** try every combination.

Fast hashes like MD5 make this cheap: a normal computer tries billions per second. So a weak password hashed with MD5 is cracked in moments.

### Your task
1. Open the file. Identify the hash type with **Toolkit → Identify hash type**.
2. The password is one of the words in the provided wordlist. Hash each candidate with the matching algorithm and compare, until one matches.
3. Submit the **plaintext password**.`,
    hints: ["Identify the hash first — its length tells you the algorithm (32 hex = MD5).", "Hash each wordlist entry with that algorithm (Toolkit → MD5) and compare to the target.", "When a word's hash matches the target exactly, that word is the password."],
    workspace: { type: "files" },
    setup(ctx) {
      const words = ctx.shuffle(["sunshine", "dragon2024", "letmein", "qwerty", "hunter2", ctx.word() + ctx.int(10, 99), "trustno1", "password1"]);
      const pw = ctx.pick(words);
      return {
        _pw: pw,
        files: [
          { name: "leaked_hash.txt", kind: "text", note: "A single password hash recovered from a breached database.", data: C.md5(pw) },
          { name: "wordlist.txt", kind: "text", note: "Candidate passwords to try.", data: words.join("\n") },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._pw);
    },
    debrief: `You ran a **dictionary attack**: hash each guess, compare to the target. Because MD5 is fast and the password was common, it fell instantly. Real tools (hashcat, John the Ripper) do this at enormous speed.

### How defenders stop it
- Use **slow, salted** password hashes designed for the job: **bcrypt, scrypt or Argon2**, never MD5/SHA-1 for passwords.
- A **salt** (random per-user value) means identical passwords get different hashes, defeating precomputed "rainbow tables".
- Enforce long, unique passwords so they aren't in any wordlist.

**On the exam:** Security+, CySA+ and CEH all test password-hash cracking, salting, and why fast general-purpose hashes are wrong for passwords.`,
  },

  {
    id: "crypto-integrity",
    title: "Has It Been Tampered With?",
    level: 3,
    slug: "hashes_detect_tampering",
    time: 11,
    certs: ["Security+", "CySA+", "GSEC"],
    objective: "Three files were downloaded with a published checksum list. One was altered in transit. Hash each file and submit the name of the tampered one.",
    answerLabel: "Tampered file",
    answerPlaceholder: "the filename that fails its checksum",
    lesson: `Hashes don't just store passwords — they prove **integrity**. Hash the same bytes and you always get the same digest; change a single byte and the digest changes completely. So software projects publish a **checksum** (often SHA-256) next to a download. You hash what you received and compare: match means intact, mismatch means it was corrupted or **tampered with**.

This is how you catch a malicious mirror or a man-in-the-middle swapping a file for a backdoored one — the attacker can change the file, but can't make its hash match the real one the publisher signed.

### Your task
You have a \`SHA256SUMS\` manifest and three files. Hash each file's contents with **Toolkit → SHA-256** and compare to the manifest. Submit the name of the file whose hash **does not match**.`,
    hints: ["Open SHA256SUMS: it lists the expected hash for each file.", "Copy each file's contents into Toolkit → SHA-256 and compare the result to the manifest.", "The file whose computed hash differs from the manifest is the tampered one."],
    workspace: { type: "files" },
    async setup(ctx) {
      const names = ["installer.sh", "notes.txt", "update.bin"];
      const contents = {
        "installer.sh": `#!/bin/sh\necho "installing ${ctx.word()} v1.${ctx.int(1, 9)}"\n`,
        "notes.txt": `Release notes for build ${ctx.hex(6)}\n- bug fixes\n- performance\n`,
        "update.bin": `BINDATA:${ctx.hex(40)}`,
      };
      const tampered = names[ctx.int(0, 2)];
      const manifest = [];
      for (const n of names) {
        // The manifest holds the ORIGINAL hash. For the tampered file, the real content differs,
        // so we store a hash of a different (original) version than what we hand over.
        const published = n === tampered ? await C.sha256(contents[n] + "ORIGINAL") : await C.sha256(contents[n]);
        manifest.push(`${published}  ${n}`);
      }
      return {
        _tampered: tampered,
        files: [
          { name: "SHA256SUMS", kind: "text", note: "Published checksums from the vendor. Trust these.", data: manifest.join("\n") },
          ...names.map((n) => ({ name: n, kind: "text", note: "Downloaded file \u2014 verify it.", data: contents[n] })),
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._tampered);
    },
    debrief: `One file's SHA-256 didn't match the published checksum \u2014 its bytes had been changed after the vendor signed them. The hash is what makes that undetectable change detectable.

### How defenders stop it
- Publish checksums over a **trusted channel** (HTTPS site, signed release notes) and verify downloads before running them.
- Go further with **digital signatures** (GPG, code signing): they prove integrity *and* authenticity \u2014 that the real publisher produced it \u2014 which a bare hash alone does not.

**On the exam:** hashing for integrity, checksums and the integrity-vs-authenticity distinction are tested in Security+, CySA+ and GSEC.`,
  },

  {
    id: "crypto-atbash",
    title: "Mirror Writing",
    level: 2,
    slug: "atbash_substitution",
    time: 7,
    certs: ["Security+", "CEH"],
    objective: "This text uses the Atbash cipher. Decode it to reveal the flag.",
    lesson: `**Atbash** is one of the oldest ciphers, originally for the Hebrew alphabet. It is a **fixed substitution**: the alphabet is reversed, so A becomes Z, B becomes Y, C becomes X, and so on. Applying it twice returns the original, like ROT13.

Because the mapping is fixed (no key), Atbash offers no real security \u2014 but it still shows up in puzzles, CTFs and lightweight obfuscation, so recognising and reversing it is a useful reflex. A tell: the text is letters only, same word-lengths as English, but unreadable, and no single Caesar shift fixes it.

### Your task
Put the message through **Toolkit \u2192 Atbash** and read the flag.`,
    hints: ["This is not a Caesar shift \u2014 try Toolkit \u2192 Atbash.", "Atbash is its own inverse: running it on the ciphertext gives the plaintext flag."],
    workspace: { type: "files" },
    setup(ctx) {
      return { files: [{ name: "mirror.txt", kind: "text", note: "A letters-only message that no single shift decodes. Try reversing the alphabet.", data: C.atbash(`the flag is ${ctx.flag}`) }] };
    },
    debrief: `Atbash just mirrors the alphabet (A\u2194Z). With no key and one fixed mapping, it is trivially reversible \u2014 a historical curiosity, not security, but a common puzzle layer.

### How defenders stop it
Nothing to defend here \u2014 the lesson is recognition: classical substitution (Atbash, Caesar, ROT13) is obfuscation, never encryption. Real confidentiality needs a keyed modern cipher.

**On the exam:** Atbash and fixed substitution ciphers appear alongside Caesar/ROT13 as examples of weak classical cryptography in Security+ and CEH.`,
  },

  {
    id: "crypto-salt",
    title: "No Salt, No Secret",
    level: 3,
    slug: "unsalted_hashes_reveal_reuse",
    time: 12,
    certs: ["Security+", "CySA+", "CISSP"],
    objective: "A leaked table stored passwords as plain unsalted MD5. Several users share a password. Crack the shared hash and submit the password.",
    answerLabel: "Shared password",
    answerPlaceholder: "the reused password",
    lesson: `Hashing a password protects it only if done right. Store it as a **plain, unsalted** hash and two problems appear:

- **Identical passwords produce identical hashes.** If three users all pick \`123456\`, their stored hashes are byte-for-byte the same \u2014 so a leak instantly reveals *who shares a password*, and cracking it once cracks all of them.
- **Rainbow tables.** Attackers precompute hashes of millions of common passwords. An unsalted hash is just a lookup away from its plaintext.

A **salt** \u2014 a unique random value added to each password before hashing \u2014 fixes both: identical passwords get different hashes, and precomputed tables become useless.

### Your task
Open the leaked table. Notice that one MD5 hash repeats across several users \u2014 that is their shared password. Crack it with the wordlist (hash each candidate with **Toolkit \u2192 MD5** and match), and submit the **password**.`,
    hints: ["Scan the hash column: one hash value appears on several rows. That is the reused password.", "Hash each wordlist entry with Toolkit \u2192 MD5 and compare to that repeated hash.", "When a candidate's MD5 matches the repeated hash, that word is the shared password."],
    workspace: { type: "files" },
    async setup(ctx) {
      const words = ctx.shuffle(["summer2024", "letmein", "iloveyou", "princess", "football", ctx.word() + ctx.int(10, 99), "monkey", "qwerty"]);
      const shared = ctx.pick(words);
      const users = ["alice", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"];
      const rows = [];
      for (let i = 0; i < users.length; i++) {
        // three specific users share `shared`; the rest get a unique password
        const pw = (i === 1 || i === 4 || i === 6) ? shared : ctx.pick(words.filter((w) => w !== shared)) + ctx.hex(1);
        rows.push(`${users[i]}:${await C.md5(pw)}`);
      }
      return {
        _pw: shared,
        files: [
          { name: "users.sql.dump", kind: "log", note: "Leaked user table: username:md5(password). No salt was used.", data: rows.join("\n") },
          { name: "wordlist.txt", kind: "text", note: "Common passwords to try.", data: words.join("\n") },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input) === norm.text(env._pw);
    },
    debrief: `Because the hashes were **unsalted**, three users with the same password shared an identical hash \u2014 visible at a glance, and crackable once for all three. A per-user **salt** would have made the three hashes different and defeated rainbow tables.

### How defenders stop it
- Add a unique random **salt** per password (modern password hashes do this automatically).
- Use a **slow** password hash (bcrypt, scrypt, Argon2), never plain MD5/SHA.
- Consider a secret **pepper** (a site-wide secret kept out of the database) on top of the salt.

**On the exam:** salting, rainbow tables and why identical unsalted hashes leak reuse are tested in Security+, CySA+ and CISSP.`,
  },

  {
    id: "crypto-hashid",
    title: "Name That Algorithm",
    level: 2,
    slug: "identify_the_hash_algorithm",
    time: 9,
    certs: ["Security+", "CEH", "CySA+"],
    objective: "You know the plaintext and have its hash. Work out which algorithm produced it and submit the algorithm name.",
    answerLabel: "Algorithm",
    answerPlaceholder: "MD5, SHA-1, SHA-256…",
    lesson: `Different hash algorithms produce different-length digests, which is the quickest way to tell them apart:

- **MD5** \u2014 128-bit, 32 hex characters. **Cryptographically broken** (collisions are easy); never use for new work.
- **SHA-1** \u2014 160-bit, 40 hex. Also **broken** (practical collisions since 2017); deprecated.
- **SHA-256** \u2014 256-bit, 64 hex. Part of SHA-2; currently strong.
- **SHA-512** \u2014 512-bit, 128 hex. Also SHA-2; strong.

When you have both a hash **and** the input that produced it, you can confirm the algorithm exactly: hash the known input with each candidate and see which output matches.

### Your task
The file gives a known plaintext and its hash. Hash the plaintext with each algorithm in the **Toolkit** until one matches, and submit the **algorithm's name**.`,
    hints: ["First narrow it down by the hash length (32 hex = MD5, 40 = SHA-1, 64 = SHA-256, 128 = SHA-512).", "Hash the given plaintext with that algorithm in the Toolkit and confirm it matches.", "Submit the matching algorithm's name, e.g. SHA-1."],
    workspace: { type: "files" },
    async setup(ctx) {
      const plain = ctx.word() + ctx.int(100, 999);
      const algos = [
        { name: "MD5", fn: (s) => C.md5(s), keys: ["md5"] },
        { name: "SHA-1", fn: (s) => C.sha1(s), keys: ["sha-1", "sha1"] },
        { name: "SHA-256", fn: (s) => C.sha256(s), keys: ["sha-256", "sha256"] },
        { name: "SHA-512", fn: (s) => C.sha512(s), keys: ["sha-512", "sha512"] },
      ];
      const pick = algos[ctx.int(0, algos.length - 1)];
      const digest = await pick.fn(plain);
      return {
        _keys: pick.keys,
        files: [{ name: "unknown-hash.txt", kind: "text", note: "A hash and the text that produced it. Which algorithm made it?",
          data: `plaintext : ${plain}\nhash      : ${digest}\n\nWhich algorithm produced this hash?` }],
      };
    },
    check(input, ctx, env) {
      const v = norm.text(input).replace(/\s+/g, "");
      return env._keys.some((k) => v === k.replace(/\s+/g, "") || v === k.replace(/-/g, ""));
    },
    debrief: `The digest length pinned the family, and hashing the known plaintext confirmed the exact algorithm. Remember the security verdict, not just the length: **MD5 and SHA-1 are broken** (collisions) and must not be used for signatures or integrity; SHA-256/512 are the current safe choices \u2014 and *none* of these fast hashes is right for passwords (that needs bcrypt/Argon2).

### How defenders stop it
- Use SHA-256 or SHA-3 for integrity and signatures; retire MD5/SHA-1.
- Use slow, salted hashes for passwords.
- Identifying an unknown hash's algorithm is step one of both cracking (offense) and incident analysis (defense).

**On the exam:** hash lengths, which algorithms are broken, and matching a hash to its algorithm are tested in Security+, CEH and CySA+.`,
  },

  {
    id: "crypto-hmac",
    title: "Signed With a Key",
    level: 4,
    slug: "hmac_integrity_and_auth",
    time: 13,
    certs: ["Security+", "CySA+", "CISSP"],
    objective: "Two API messages arrive with HMAC signatures. One was tampered with in transit. Using the shared key, find the message whose HMAC does not verify and submit its filename.",
    answerLabel: "Tampered message",
    answerPlaceholder: "the filename that fails verification",
    lesson: `A plain hash proves a message was not *accidentally* corrupted \u2014 but anyone can recompute it, so it does not prove *who* sent it. An **HMAC** (Hash-based Message Authentication Code) fixes that by mixing a **secret key** into the hash: \`HMAC(key, message)\`. Only someone who knows the key can produce or verify it, so a valid HMAC proves both **integrity** (unchanged) and **authenticity** (came from a key-holder).

This is how APIs and webhooks sign requests: the server recomputes the HMAC of the received body with the shared key and rejects the request if it does not match the signature sent. Tamper with the body and the HMAC no longer verifies \u2014 and an attacker without the key cannot forge a new one.

### Your task
You have the **shared key** and two received messages, each with the HMAC the sender attached. Recompute each message's HMAC with **Toolkit \u2192 HMAC-SHA256** (enter the key) and compare. Submit the **filename** of the message whose HMAC does **not** match (the tampered one).`,
    hints: ["Open the key file for the shared secret, and each message file for its body and attached HMAC.", "In the Toolkit, choose HMAC-SHA256, enter the shared key, and run it on each message body.", "The message whose computed HMAC differs from its attached signature was tampered with \u2014 submit that filename."],
    workspace: { type: "files" },
    async setup(ctx) {
      const key = ctx.word() + "-" + ctx.hex(8);
      const msgA = `{"action":"transfer","to":"acct-${ctx.int(1000, 9999)}","amount":${ctx.int(10, 90)}}`;
      const msgB = `{"action":"transfer","to":"acct-${ctx.int(1000, 9999)}","amount":${ctx.int(10, 90)}}`;
      const tamperedIsA = ctx.int(0, 1) === 0;
      // The attacker changed the body but can't recompute the HMAC (no key), so the attached HMAC is stale.
      const bodyA = tamperedIsA ? msgA.replace(/"amount":\d+/, '"amount":5000') : msgA;
      const bodyB = tamperedIsA ? msgB : msgB.replace(/"amount":\d+/, '"amount":5000');
      const hmacA = await C.hmacSha256(tamperedIsA ? msgA : bodyA, key); // original (pre-tamper) HMAC
      const hmacB = await C.hmacSha256(tamperedIsA ? bodyB : msgB, key);
      return {
        _tampered: tamperedIsA ? "message_A.json" : "message_B.json",
        files: [
          { name: "shared.key", kind: "text", note: "The secret key shared between client and server.", data: key },
          { name: "message_A.json", kind: "text", note: `Received body + attached HMAC-SHA256.\nHMAC: ${hmacA}`, data: bodyA },
          { name: "message_B.json", kind: "text", note: `Received body + attached HMAC-SHA256.\nHMAC: ${hmacB}`, data: bodyB },
        ],
      };
    },
    check(input, ctx, env) {
      return norm.text(input).replace(/\.json$/, "") === norm.text(env._tampered).replace(/\.json$/, "");
    },
    debrief: `One message body had been altered in transit, but the attacker could not regenerate its HMAC without the **secret key** \u2014 so the attached signature no longer matched the recomputed one, and the tampering was caught. A bare hash would not have helped: the attacker would simply recompute it. The key is what provides **authenticity**.

### How defenders stop it
- Authenticate API requests and webhooks with **HMAC** (or digital signatures), and reject on mismatch.
- Compare HMACs in **constant time** to avoid timing side channels.
- Protect the shared key; rotate it; never ship it to clients that shouldn't forge messages.

**On the exam:** HMAC, the integrity-vs-authenticity distinction, and message authentication are tested in Security+, CySA+ and CISSP.`,
  },
];
