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
    certs: ["Security+", "CEH"],
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
    certs: ["Security+", "CySA+", "CEH"],
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
];
