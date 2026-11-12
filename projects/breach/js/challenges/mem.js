// Track: Memory Safety & C. Each challenge teaches one class of memory bug and,
// along the way, enough C to read the code that causes it. Analysis and defense:
// learners read source, memory dumps and sanitizer reports; nothing is exploited.
import { norm } from "../flags.js";

const csrc = (name, note, data) => ({ name, kind: "code", label: "C", note, data });
const lineOf = (text, needle) => text.split("\n").findIndex((l) => l.includes(needle)) + 1;
const bin = (s) => s; // binary strings map 1:1 to bytes in the hex viewer

export default [
  {
    id: "mem-read-c",
    title: "Reading Your First C",
    level: 1,
    slug: "c_does_exactly_what_it_says",
    time: 8,
    certs: ["Security+", "GSEC"],
    objective: "Read the short C program and work out exactly what it prints. Submit that number.",
    answerLabel: "Program output",
    answerPlaceholder: "a number",
    lesson: `Operating systems, browsers, databases, routers and almost every piece of firmware are written in **C** (or its sibling C++). C is fast because it does *exactly* what the code says and nothing more: no bounds checks, no garbage collector, no safety net. That is also why a whole family of vulnerabilities, **memory-safety bugs**, lives here. To understand them you have to be able to read the code, so this track teaches C as it goes.

### The shape of a C program
\`\`\`c
#include <stdio.h>          // pull in declarations (here: printf)

int main(void) {            // execution starts in main; it returns an int
    int count = 3;          // a variable has a TYPE and a name
    count = count + 1;      // statements end with a semicolon
    if (count > 3) {        // braces group a block
        printf("%d\\n", count);
    }
    return 0;               // 0 means "success" to the operating system
}
\`\`\`

### The types you'll meet constantly
| Type | Typical size | Holds |
|---|---|---|
| \`char\` | 1 byte | one character, or just a small number |
| \`int\` | 4 bytes | a whole number, roughly ±2 billion |
| \`long\` | 8 bytes | a bigger whole number |
| \`char name[16]\` | 16 bytes | an **array**: 16 chars side by side |

Sizes are fixed. That detail becomes a vulnerability in a later challenge.

### printf
\`printf\` prints a **format string**, replacing each \`%\` placeholder with the next argument: \`%d\` an int in decimal, \`%x\` in hex, \`%s\` a string, \`%c\` one character. \`\\n\` is a newline.

### Your task
Open \`lockout.c\`. Trace it line by line like the CPU would, keeping track of each variable, and submit the number it prints.`,
    hints: ["Write down attempts, limit and locked, then update them one line at a time.", "The if only runs its block when the condition is true. Did attempts end up greater than limit?", "The printed value is attempts * 2 + locked, using the final values."],
    workspace: { type: "files" },
    setup(ctx) {
      const a = ctx.int(2, 6), limit = ctx.int(5, 9), add = ctx.int(1, 5);
      const final = a + add, locked = final > limit ? 1 : 0;
      const src = String.raw`#include <stdio.h>

int main(void) {
    int attempts = ${a};
    int limit    = ${limit};
    int locked   = 0;

    attempts = attempts + ${add};

    if (attempts > limit) {
        locked = 1;
    }

    printf("%d\n", attempts * 2 + locked);
    return 0;
}
`;
      return { _out: final * 2 + locked, files: [csrc("lockout.c", "A tiny account-lockout check. Trace it by hand.", src)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._out; },
    debrief: `You just did what a debugger does: stepped through the program holding each variable's value in your head. Every later challenge in this track is the same skill pointed at a bug.

Notice what C did **not** do. It didn't check that \`attempts\` stayed in a sensible range, and it would not have complained if the arithmetic overflowed. C trusts the programmer completely.

### Why this matters for security
- Memory-safety bugs are consistently reported as the majority of serious vulnerabilities in large C/C++ codebases.
- Reading C lets you review the code where those bugs live, read advisories and patches, and understand what a crash is telling you.
- Memory-safe languages (Rust, Go, Java, Python) remove whole bug classes by adding the checks C leaves out.

**On the exam:** Security+ and GSEC expect you to recognise memory-safety bug classes; you don't need to write C, but reading it makes every one of them concrete.`,
  },

  {
    id: "mem-strings",
    title: "Strings End With Zero",
    level: 2,
    slug: "missing_null_terminator",
    time: 10,
    certs: ["Security+", "PenTest+", "GSEC"],
    objective: "A greeting printed more than a name. Read the memory dump, work out what printf actually printed, and submit the flag it leaked.",
    lesson: `C has no real string type. A "string" is just an **array of \`char\`** with a convention: the text ends at the first byte with value **0** (written \`'\\0'\`, the *NUL terminator*).

\`\`\`c
char name[8] = "bob";
// memory: 'b' 'o' 'b' 00 ?? ?? ?? ??
//  index:  0   1   2   3  4  5  6  7
\`\`\`

- Indexes start at **0**, so \`name[8]\` has valid slots 0 to 7.
- \`sizeof(name)\` is the size of the box (8). \`strlen(name)\` counts characters *until the first 0* (3).
- An 8-byte array holds at most **7** characters plus the terminator.

Functions like \`printf("%s")\`, \`strlen\` and \`strcpy\` don't know how big the array is. They just walk forward through memory **until they hit a 0 byte**. If the terminator is missing, they keep going into whatever happens to sit next to the array. Reading past the end like this is an **out-of-bounds read**, and it leaks neighbouring memory.

### The bug in this program
\`strncpy(dst, src, n)\` copies at most \`n\` bytes, but if the source is \`n\` characters or longer it **does not add a terminator**. A classic trap.

### Your task
\`greet.c\` copies a username into an 8-byte array. The user supplied a name exactly 8 characters long. \`stack.bin\` is the program's memory at that moment: the \`name\` array starts at offset 0 and other variables follow it. Work out what \`printf("%s")\` printed and submit the flag inside it.`,
    hints: ["In the hex view, the name array is the first 8 bytes. Is there a 00 byte inside it?", "printf keeps printing byte after byte until the FIRST 00. Everything before that 00 was printed.", "There are two flag-shaped strings in the dump. Only the one before the first 00 byte was printed."],
    workspace: { type: "files" },
    setup(ctx) {
      const user = (ctx.word() + ctx.word()).slice(0, 8).toUpperCase();
      const decoy = `BREACH{never_printed_${ctx.hex(6)}}`;
      const src = String.raw`#include <stdio.h>
#include <string.h>

void greet(const char *input) {
    char name[8];
    char api_key[48] = "<redacted>";       // sits right after name in memory

    strncpy(name, input, sizeof(name));    // copies 8 bytes. No room left for '\0'!
    printf("Hello, %s\n", name);           // prints until the first 0 byte
}
`;
      const head = user + ctx.flag + "\x00";
      const mem = head + "\x00".repeat((16 - (head.length % 16)) % 16)
        + "\x10\x40\x00\x00\x00\x00\x00\x00" + decoy + "\x00" + "\xf0\x7f\xfe\xff\x7f\x00\x00";
      return { files: [
        csrc("greet.c", "The greeting function. Note the sizes.", src),
        { name: "stack.bin", kind: "hex", note: "Memory starting at name[0]. Offsets on the left are in hex.", data: bin(mem) },
      ] };
    },
    debrief: `\`name\` was filled edge to edge with 8 characters and no terminator, so \`printf("%s")\` ran straight off the end of the array and printed the adjacent \`api_key\` until it finally met a 0 byte. The second flag-shaped string was beyond that 0, so it never appeared.

This is an **out-of-bounds read** (an *over-read*). Heartbleed, one of the most damaging bugs in internet history, was the same class: a read that went past the intended buffer and returned neighbouring secrets.

### How defenders stop it
- Always leave room for, and write, the terminator: \`strncpy(name, input, sizeof(name) - 1); name[sizeof(name) - 1] = '\\0';\` or use \`snprintf\`, which always terminates.
- Compile with warnings (\`-Wall -Wextra\`) and run tests under **AddressSanitizer**, which aborts on the first out-of-bounds read.
- Keep secrets out of memory next to attacker-influenced buffers, and wipe them when done.

**On the exam:** out-of-bounds read/over-read and improper string termination are named weaknesses (CWE-125, CWE-170) behind Security+ and PenTest+ memory questions.`,
  },

  {
    id: "mem-unsafe-call",
    title: "The Function That Can't Count",
    level: 2,
    slug: "unbounded_copy_spotted",
    time: 10,
    certs: ["Security+", "PenTest+", "CEH", "GSEC"],
    objective: "One call in this function copies without any size limit. Submit its line number.",
    answerLabel: "Line number",
    answerPlaceholder: "a line number",
    lesson: `When you pass an array to a C function, the function receives only a **pointer**: the memory address of the first element. The size is not passed along.

\`\`\`c
void copy(char *dst, const char *src);   // dst is an address. How big is it? Unknown.
\`\`\`

- \`char *p\` means "p holds the address of a char". \`const\` means the function promises not to modify what it points to.
- \`sizeof(buf)\` gives the array's size, but only in the function where the array was declared.

So the older string functions have no way to stop at the end of the destination. They copy until the *source* ends:

| Unbounded (dangerous) | Bounded replacement |
|---|---|
| \`gets(buf)\` | \`fgets(buf, sizeof(buf), stdin)\` |
| \`strcpy(dst, src)\` | \`snprintf(dst, sizeof(dst), "%s", src)\` |
| \`strcat(dst, src)\` | \`strncat\` / \`snprintf\` |
| \`sprintf(dst, fmt, ...)\` | \`snprintf(dst, sizeof(dst), fmt, ...)\` |
| \`scanf("%s", buf)\` | \`scanf("%31s", buf)\` |

If the source is longer than the destination, the extra bytes are written past the end of the array into whatever is next in memory. That is a **buffer overflow**, the oldest and most famous memory bug.

### Your task
\`profile.c\` copies three user-supplied fields. Two copies are bounded. One is not. Submit the line number of the unbounded copy (the viewer numbers lines for you).`,
    hints: ["For each copy, ask: does this call know the size of its destination?", "Calls that take sizeof(...) as an argument are bounded. One call takes only a destination and a source.", "The strcpy line is the answer."],
    workspace: { type: "files" },
    setup(ctx) {
      const bad = ctx.int(0, 2);
      const fields = [["name", "name_buf"], ["city", "city_buf"], ["bio", "bio_buf"]];
      const copies = fields.map(([src, dst], k) => (k === bad
        ? [`    strcpy(${dst}, ${src});`]
        : k % 2 === 0
          ? [`    strncpy(${dst}, ${src}, sizeof(${dst}) - 1);`, `    ${dst}[sizeof(${dst}) - 1] = '\\0';`]
          : [`    snprintf(${dst}, sizeof(${dst}), "%s", ${src});`])).flat();
      const src = [
        "#include <stdio.h>",
        "#include <string.h>",
        "",
        "#define FIELD_MAX 32",
        "",
        "/* name, city and bio all come straight from a web form. */",
        "void save_profile(const char *name, const char *city, const char *bio) {",
        "    char name_buf[FIELD_MAX];",
        "    char city_buf[FIELD_MAX];",
        "    char bio_buf[128];",
        "    char line[256];",
        "",
        ...copies,
        "",
        '    snprintf(line, sizeof(line), "%s|%s|%s", name_buf, city_buf, bio_buf);',
        "    puts(line);",
        "}",
      ].join("\n");
      return { _line: lineOf(src, "strcpy("), files: [csrc("profile.c", "Profile-saving code from a web backend. Every argument is attacker-controlled.", src)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._line; },
    debrief: `\`strcpy\` copies until the source's terminator, with no idea how large the destination is. A form field longer than the buffer writes past its end: a **stack buffer overflow**.

The bounded calls beside it show the fix: every one of them is told the destination size with \`sizeof\`.

### How defenders stop it
- Ban the unbounded functions outright (many codebases fail the build on \`gets\`/\`strcpy\`/\`sprintf\`); \`gets\` was removed from the C standard entirely.
- Compile with \`-D_FORTIFY_SOURCE=2\`, which swaps in checked versions where the compiler knows the buffer size.
- Use static analysis (SAST) to flag unbounded copies, and fuzz inputs under AddressSanitizer.
- Prefer memory-safe languages for code that parses untrusted input.

**On the exam:** buffer overflow (CWE-120/121) and unsafe C functions are core Security+, PenTest+ and CEH material.`,
  },

  {
    id: "mem-stack",
    title: "What Lives Next to the Buffer",
    level: 3,
    slug: "the_stack_frame_layout",
    time: 13,
    certs: ["Security+", "PenTest+", "CEH", "CISSP"],
    objective: "A crash report says how many bytes were written into a local buffer. Using the stack layout, name the furthest thing those bytes reached.",
    answerLabel: "Furthest item overwritten",
    answerPlaceholder: "authorised / saved rbp / return address",
    lesson: `Why is writing past a buffer so serious? Because of what sits beside it.

Every function call gets a **stack frame**: a slab of memory holding its local variables plus the bookkeeping needed to return to the caller. On x86-64 the frame looks like this (higher addresses at the top):

\`\`\`
  higher addresses
  +--------------------------+
  | return address           |  where to continue in the caller
  +--------------------------+
  | saved rbp                |  the caller's frame pointer
  +--------------------------+  <- rbp points here
  | local variables          |
  | ...                      |
  | char buf[N]              |  buf[0] is at the LOWEST address
  +--------------------------+  <- rsp (top of stack)
  lower addresses
\`\`\`

Two facts collide:
- The stack **grows downward**: each new frame is placed at a lower address.
- Arrays are **written upward**: \`buf[1]\` is at a higher address than \`buf[0]\`.

So bytes that overflow a local buffer run upward through the other locals, then the saved frame pointer, then the **return address**. Corrupting a neighbouring variable changes program logic (imagine a flag like \`authorised\`). Corrupting the return address changes where the CPU goes when the function finishes, which is why stack overflows have historically led to full takeover rather than just a crash.

### Reading addresses
Locals are named by their distance from \`rbp\`, in hex: \`rbp-0x30\` is 0x30 = 48 bytes below it. The Toolkit's number converter turns hex into decimal.

### Your task
\`frame.txt\` shows the layout of \`login()\`, and \`crash.txt\` says how many bytes were written starting at \`name[0]\`. Work out where the **last** byte landed and submit the name of that item: \`authorised\`, \`saved rbp\` or \`return address\`.`,
    hints: ["Convert the buffer's offset from hex to decimal. That is how many bytes lie between name[0] and rbp.", "Byte number k (counting from 1) lands at offset rbp - start + (k - 1). Anything at or above rbp+0 is past all the locals.", "Fewer than or equal to the distance to rbp: still in locals. Up to 8 more: saved rbp. Beyond that: the return address."],
    workspace: { type: "files" },
    setup(ctx) {
      const B = ctx.pick([16, 32, 48, 64]);
      const start = B + 16;
      const target = ctx.pick(["authorised", "saved rbp", "return address"]);
      const L = target === "authorised" ? ctx.int(B + 13, B + 16) : target === "saved rbp" ? ctx.int(B + 17, B + 24) : ctx.int(B + 25, B + 32);
      const hx = (n) => "0x" + n.toString(16).padStart(2, "0");
      const frame = `Stack frame of login()                (higher addresses at the top)

  location     size   contents
  ---------    ----   ------------------------------------------
  rbp+0x08       8    return address   (back into main)
  rbp+0x00       8    saved rbp        (caller's frame pointer)
  rbp-0x04       4    int  authorised
  rbp-0x10      12    (alignment padding, unused)
  rbp-${hx(start)}      ${String(B).padStart(2)}    char name[${B}]   <- writes begin here and move UP

Each row starts at the location shown and extends upward by its size.
`;
      const src = String.raw`#include <stdio.h>

int login(void) {
    int  authorised = 0;
    char name[${B}];

    gets(name);                 /* no length limit at all */

    if (check_password(name)) {
        authorised = 1;
    }
    return authorised;
}
`;
      const crash = `Program received signal SIGSEGV, Segmentation fault.

Diagnostic from the input logger:
  bytes written starting at name[0] (including the final NUL): ${L}
  declared size of name:                                       ${B}
  bytes past the end of the buffer:                            ${L - B}
`;
      return { _t: target, files: [
        { name: "frame.txt", kind: "text", note: "Layout of the function's stack frame, as a debugger would show it.", data: frame },
        csrc("login.c", "The function that owns this frame.", src),
        { name: "crash.txt", kind: "text", note: "What happened at run time.", data: crash },
      ] };
    },
    check(input, ctx, env) {
      const v = norm.text(input);
      const got = /authori[sz]ed/.test(v) ? "authorised" : /rbp|frame pointer|base pointer/.test(v) ? "saved rbp" : /ret/.test(v) ? "return address" : "";
      return got === env._t;
    },
    debrief: `Starting at \`name[0]\` and moving up, the written bytes crossed the rest of the buffer, the padding, then each item above it in turn. The layout is the whole story: a local buffer's neighbours are the function's other variables, the saved frame pointer and the return address.

That is why an overflow is not "just a crash":
- reaching \`authorised\` flips a security decision without knowing any password,
- reaching **saved rbp** or the **return address** corrupts control flow when the function returns.

### How defenders stop it
- **Stack canaries**: the compiler places a random value between the locals and the saved registers and checks it before returning; an overflow that reaches the return address must trample the canary first, and the program aborts.
- **ASLR** randomises where the stack, heap and libraries live; **NX/DEP** marks the stack non-executable. Together they make a corrupted return address far harder to abuse.
- Compilers also reorder locals so buffers sit above flags like \`authorised\`.
- None of these fix the bug. The fix is a bounded read: \`fgets(name, sizeof(name), stdin)\`.

**On the exam:** stack layout, buffer overflow and the mitigations (canaries, ASLR, DEP/NX) are tested in Security+, PenTest+, CEH and CISSP.`,
  },

  {
    id: "mem-off-by-one",
    title: "One Byte Too Far",
    level: 3,
    slug: "fencepost_error_found",
    time: 10,
    certs: ["Security+", "PenTest+", "GSEC"],
    objective: "Four loops fill four arrays. Exactly one writes a single element past the end. Submit the line number of that loop's for statement.",
    answerLabel: "Line number",
    answerPlaceholder: "a line number",
    lesson: `Not every overflow is hundreds of bytes. The most common one in real code is a single element: the **off-by-one**.

### Reading a for loop
\`\`\`c
for (int i = 0; i < 16; i++) {
    buf[i] = 0;
}
\`\`\`
Three parts, separated by semicolons: **start** (\`i = 0\`), **keep going while** (\`i < 16\`), **step** (\`i++\` means add 1). This loop runs with i = 0, 1, … 15: sixteen times, exactly the valid indexes of a 16-element array.

Change \`<\` to \`<=\` and it runs a seventeenth time with \`i = 16\`, writing to \`buf[16]\`, which does not exist. C performs the write anyway, onto whatever is next in memory.

### It isn't as simple as "<= is bad"
What matters is the set of indexes actually used:
- \`for (i = 1; i <= 16; i++) buf[i - 1] = 0;\` is correct: indexes 0 to 15.
- \`for (i = 15; i >= 0; i--) buf[i] = 0;\` is correct, counting down.
- \`buf[strlen(s)] = '\\0'\` is fine only if the array has room for that extra byte.

Work out the **first and last index** each loop touches and compare with the array's valid range, 0 to size − 1.

### Your task
In \`slots.c\` every array has \`SLOTS\` elements. Find the loop whose last write is out of bounds and submit the line number of its \`for\` line.`,
    hints: ["For each loop, write down the first and last value of i, then the index used inside the brackets.", "Valid indexes are 0 to SLOTS - 1. One loop reaches index SLOTS.", "One loop uses <= but subtracts 1 inside the brackets. That one is fine. The other <= is the bug."],
    workspace: { type: "files" },
    setup(ctx) {
      const bad = ctx.int(0, 1);
      const loops = ctx.shuffle([
        [`    for (int i = 0; i ${bad === 0 ? "<=" : "<"} SLOTS; i++) {`, "        counts[i] = 0;", "    }"],
        [`    for (int i = 0; i ${bad === 1 ? "<=" : "<"} SLOTS; i++) {`, "        state[i] = 'N';", "    }"],
        ["    for (int i = SLOTS - 1; i >= 0; i--) {", "        label[i] = ' ';", "    }"],
        ["    for (int i = 1; i <= SLOTS; i++) {", "        owner[i - 1] = -1;", "    }"],
      ]);
      const src = [
        "#define SLOTS 16",
        "",
        "void reset_all(void) {",
        "    int  counts[SLOTS];",
        "    char state[SLOTS];",
        "    char label[SLOTS];",
        "    int  owner[SLOTS];",
        "",
        ...loops.flatMap((l) => [...l, ""]),
        "    publish(counts, state, label, owner);",
        "}",
      ].join("\n");
      return { _line: lineOf(src, "i = 0; i <= SLOTS"), files: [csrc("slots.c", "Each array has SLOTS (16) elements: valid indexes 0 to 15.", src)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._line; },
    debrief: `The buggy loop starts at 0 and continues while \`i <= SLOTS\`, so its final pass uses index 16 on a 16-element array: one element past the end. The other \`<=\` loop was safe because it indexes with \`i - 1\`.

One stray element sounds harmless, but off-by-ones have been turned into full compromises more than once: a single overwritten byte of an adjacent length field, pointer or saved frame pointer is enough to redirect what the program does next.

### How defenders stop it
- Prefer the idiom \`for (i = 0; i < n; i++)\` and derive \`n\` from the array: \`sizeof(arr) / sizeof(arr[0])\`.
- Test the **boundaries**: empty, exactly full, and one more than full.
- AddressSanitizer and fuzzing catch off-by-ones that code review misses.
- Bounds-checked languages turn this silent corruption into an immediate, safe error.

**On the exam:** off-by-one (CWE-193) appears alongside buffer overflows in Security+ and PenTest+ objectives.`,
  },

  {
    id: "mem-int-overflow",
    title: "When Numbers Wrap Around",
    level: 3,
    slug: "integer_overflow_shrinks_malloc",
    time: 12,
    certs: ["Security+", "PenTest+", "CEH", "GSEC"],
    objective: "A size calculation overflows a 16-bit integer. Work out how many bytes the program actually allocates and submit that number.",
    answerLabel: "Bytes allocated",
    answerPlaceholder: "a number",
    lesson: `C integers have a **fixed width**. When a result doesn't fit, the extra high bits are simply thrown away and the value **wraps around**.

| Type | Bits | Range |
|---|---|---|
| \`uint8_t\` | 8 | 0 to 255 |
| \`uint16_t\` | 16 | 0 to 65,535 |
| \`uint32_t\` | 32 | 0 to 4,294,967,295 |
| \`int\` (signed) | 32 | −2,147,483,648 to 2,147,483,647 |

Think of a car odometer: a \`uint8_t\` holding 255, plus 1, becomes **0**. In general an unsigned N-bit result is the true value **modulo 2^N**.

\`\`\`c
uint8_t a = 200, b = 100;
uint8_t sum = a + b;      // true answer 300; stored: 300 - 256 = 44
\`\`\`

### Why this is a security bug
Sizes are often computed from attacker-supplied numbers:

\`\`\`c
buf = malloc(count * item_size);   // "allocate room for count items"
\`\`\`

If the multiplication wraps, \`malloc\` is asked for a **tiny** buffer, but the code that follows still copies the full \`count\` items into it. A small arithmetic slip becomes a huge **heap buffer overflow**. This exact pattern has produced critical bugs in image parsers, network stacks and browsers.

(\`malloc(n)\` asks the system for n bytes on the **heap**, memory that lives until you \`free\` it. More on that soon.)

### Your task
\`upload.c\` stores its size in a \`uint16_t\`. \`request.log\` shows the values one request sent. Compute what \`total\` really holds, which is the number of bytes allocated. The Toolkit's number converter can help.`,
    hints: ["Multiply count by item_size to get the true size.", "A uint16_t keeps only the result modulo 65,536. Subtract 65,536 until the value is below 65,536.", "That remainder is what malloc receives."],
    workspace: { type: "files" },
    setup(ctx) {
      const count = ctx.int(700, 1200), size = ctx.int(100, 180);
      const src = String.raw`#include <stdint.h>
#include <stdlib.h>
#include <string.h>

/* count and item_size are read directly from the request header. */
char *store_items(uint32_t count, uint32_t item_size, char **items) {
    uint16_t total = count * item_size;      /* 16 bits: can only hold 0..65535 */

    char *buf = malloc(total);
    if (buf == NULL) return NULL;

    for (uint32_t i = 0; i < count; i++) {
        memcpy(buf + i * item_size, items[i], item_size);   /* copies ALL items */
    }
    return buf;
}
`;
      const log = `POST /api/batch-upload HTTP/1.1
X-Item-Count: ${count}
X-Item-Size: ${size}

[debug] store_items(count=${count}, item_size=${size})
[debug] bytes the loop will copy: ${count * size}
[debug] malloc(total) ... total = ?
`;
      return { _n: (count * size) % 65536, files: [
        csrc("upload.c", "The allocation and the copy loop.", src),
        { name: "request.log", kind: "text", note: "One request's header values.", data: log },
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._n; },
    debrief: `The true size didn't fit in 16 bits, so \`total\` kept only the remainder modulo 65,536 and \`malloc\` returned a buffer far smaller than needed. The loop then copied every item anyway, writing tens of thousands of bytes past the end of the allocation: a heap overflow created by arithmetic alone.

### How defenders stop it
- Do size arithmetic in a wide type (\`size_t\`) and **check before multiplying**: \`if (item_size != 0 && count > SIZE_MAX / item_size) reject;\`
- Use helpers that check for you: \`calloc(count, item_size)\`, \`reallocarray\`, or compiler builtins like \`__builtin_mul_overflow\`.
- Enforce sane upper limits on every length that comes from input.
- Build tests with UBSan (\`-fsanitize=undefined,integer\`) to catch overflow at run time.

**On the exam:** integer overflow (CWE-190) is listed with buffer overflows in Security+, PenTest+ and CEH application-attack objectives.`,
  },

  {
    id: "mem-format",
    title: "printf Trusts Its First Argument",
    level: 4,
    slug: "format_string_leak",
    time: 14,
    certs: ["PenTest+", "CEH", "GSEC"],
    objective: "A request tricked the server's printf into dumping memory. Find the leaked 8-character API token in the output and submit it.",
    answerLabel: "Leaked token",
    answerPlaceholder: "8 characters",
    lesson: `\`printf\` decides how many arguments to read by scanning its **format string**. It has no other way to know how many you passed.

\`\`\`c
printf("%s has %d points\\n", name, score);   // 2 placeholders, 2 arguments
\`\`\`

Now look at this common shortcut:

\`\`\`c
printf(user_input);          // WRONG: the user's text IS the format string
printf("%s", user_input);    // right: the user's text is only data
\`\`\`

If the user's text contains placeholders such as \`%lx\`, \`printf\` obediently fetches "arguments" that were never passed. It reads whatever is in the argument registers and then walks up the **stack**, printing each 8-byte value in hex. The program leaks its own memory: addresses (defeating ASLR), canaries, and any secret that happens to be in a local variable. This is a **format string vulnerability**.

### Little-endian: why the leak looks backwards
x86 stores multi-byte numbers **least significant byte first**. The four characters \`ABCD\` in memory are the bytes \`41 42 43 44\`, but read as one number and printed in hex they come out as \`44434241\`: reversed.

So to turn a leaked hex word back into text: decode the hex to characters, then **reverse** them. The Toolkit has both steps (*Hex → text*, then *Reverse*).

### Your task
\`motd.c\` prints a user-supplied name. \`server.log\` shows normal requests and one that sent format specifiers. One of the leaked 8-byte words is the API token stored in a local variable: it is the word made entirely of printable ASCII (hex pairs between 20 and 7e). Decode it and submit the token.`,
    hints: ["Find the request whose name is full of %lx and look at the dotted hex values it produced.", "Addresses look like 7ffe… or 55…. The token is the 16-hex-digit word where every pair is a letter or digit (30–7a).", "Paste that word into the Toolkit, run Hex → text, then Reverse."],
    workspace: { type: "files" },
    setup(ctx) {
      const token = (ctx.word().slice(0, 4) + ctx.int(1000, 9999)).replace(/^./, (c) => c.toUpperCase());
      const le = [...token].reverse().map((c) => c.charCodeAt(0).toString(16)).join("");
      const a = (p) => p + ctx.hex(8);
      const words = [a("7ffe"), "0", a("7f1d"), "1c", "0", a("7ffe"), le, a("5581"), "ffffffff" + ctx.hex(8), a("7ffe")];
      const src = String.raw`#include <stdio.h>
#include <string.h>

void motd(const char *name) {
    char token[9];
    load_api_token(token);          /* 8 characters + terminator, kept on the stack */

    printf("Hello, ");
    printf(name);                   /* BUG: user input used as the format string */
    printf("\n");

    send_metrics(token);
}
`;
      const u = [ctx.word(), ctx.word(), ctx.word()];
      const log = [
        `[10:41:07] GET /motd?name=${u[0]}      -> Hello, ${u[0]}`,
        `[10:41:19] GET /motd?name=${u[1]}      -> Hello, ${u[1]}`,
        `[10:42:02] GET /motd?name=%25lx.%25lx.%25lx.%25lx.%25lx.%25lx.%25lx.%25lx.%25lx.%25lx`,
        `           -> Hello, ${words.join(".")}`,
        `[10:42:30] GET /motd?name=${u[2]}      -> Hello, ${u[2]}`,
      ].join("\n");
      return { _tok: token, files: [
        csrc("motd.c", "The handler. Compare the two ways printf is called.", src),
        { name: "server.log", kind: "log", note: "Request log with the response each request produced (%25 is a URL-encoded % sign).", data: log },
      ] };
    },
    check(input, ctx, env) { return String(input ?? "").trim() === env._tok; },
    debrief: `Because the name was passed as the format string, each \`%lx\` made \`printf\` print the next 8 bytes it believed were arguments: first register contents, then the function's own stack, including the \`token\` local. Decoding that word and reversing it (little-endian) recovered the secret. The neighbouring values are stack and code **addresses**, which is exactly what an attacker needs to defeat ASLR.

Format string bugs can do worse than leak: the \`%n\` specifier *writes* to memory. That makes this bug class as serious as a buffer overflow.

### How defenders stop it
- Never pass input as the format: always \`printf("%s", input)\` (same for \`fprintf\`, \`syslog\`, \`snprintf\`).
- Compile with \`-Wformat -Wformat-security -Werror=format-security\`: the compiler flags non-literal format strings.
- \`_FORTIFY_SOURCE\` blocks \`%n\` in writable format strings.
- Review every logging call: this bug hides most often in \`syslog(priority, user_text)\`.

**On the exam:** format string vulnerabilities (CWE-134) appear in PenTest+ and CEH; endianness comes up again in reverse engineering and packet analysis.`,
  },

  {
    id: "mem-uaf",
    title: "Use After Free",
    level: 4,
    slug: "dangling_pointer_traced",
    time: 13,
    certs: ["PenTest+", "CEH", "GSEC", "CISSP"],
    objective: "AddressSanitizer caught the program using memory it had already released. Read the report and submit the source line number where that memory was freed.",
    answerLabel: "Line number of the free",
    answerPlaceholder: "a line number",
    lesson: `Locals live on the stack and vanish when the function returns. For data that must outlive a function, C programs request memory from the **heap**:

\`\`\`c
struct session *s = malloc(sizeof(struct session));  // ask for memory; get its address
s->is_admin = 0;                                     // use it through the pointer
free(s);                                             // hand it back
\`\`\`

- A \`struct\` groups several variables into one object. \`s->is_admin\` means "the \`is_admin\` field of the struct that \`s\` points to".
- \`free(s)\` returns the memory to the allocator, but **\`s\` still holds the old address**. It is now a *dangling pointer*.

Using a dangling pointer is a **use-after-free (UAF)**. The allocator is free to hand that same memory to the next \`malloc\`, so the old pointer now aliases someone else's data. If an attacker controls what gets allocated there, reads through the stale pointer leak it and writes corrupt it. Freeing the same pointer twice (a **double free**) corrupts the allocator's own bookkeeping. UAFs are the dominant bug class in modern browser exploits.

### Reading an AddressSanitizer report
ASan is a compiler feature (\`-fsanitize=address\`) that stops the program at the first bad memory access and prints three stack traces:
1. **where the bad access happened** (top, under \`READ\`/\`WRITE of size …\`)
2. **\`freed by thread … here\`**: where the memory was released
3. **\`previously allocated by … here\`**: where it came from

Each trace reads innermost call first; \`#1 … in end_session session.c:27\` means function \`end_session\`, file \`session.c\`, line 27. Frames inside ASan's own runtime (\`__interceptor_free\`) can be skipped.

### Your task
Read \`asan.txt\` alongside \`session.c\`. Submit the line number in \`session.c\` of the statement that freed the memory.`,
    hints: ["The report has three stack traces. You want the middle one, under 'freed by thread T0 here'.", "Skip the #0 frame (that is ASan's own free wrapper). The next frame names a function and session.c:LINE.", "Check that line in session.c: it should be the call to free()."],
    workspace: { type: "files" },
    setup(ctx) {
      const pad = ["/* session.c: per-connection session handling */", "/* reviewed: never */", "", "/* TODO(ops): rotate session ids */"].slice(0, ctx.int(0, 4));
      const src = [
        ...pad,
        "#include <stdio.h>",
        "#include <stdlib.h>",
        "#include <string.h>",
        "",
        "struct session {",
        "    char user[32];",
        "    int  is_admin;",
        "};",
        "",
        "void end_session(struct session *s) {",
        "    audit(\"logout\", s->user);",
        "    free(s);",
        "}",
        "",
        "int main(void) {",
        "    struct session *s = malloc(sizeof(struct session));",
        "    strcpy(s->user, \"guest\");",
        "    s->is_admin = 0;",
        "",
        "    end_session(s);",
        "",
        "    printf(\"goodbye %s\\n\", s->user);",
        "    return 0;",
        "}",
      ].join("\n");
      const freeL = lineOf(src, "free(s);"), callL = lineOf(src, "    end_session(s);"), useL = lineOf(src, "goodbye"), allocL = lineOf(src, "malloc(sizeof");
      const pid = ctx.int(3000, 9000), addr = "0x6040000000" + ctx.pick(["10", "50", "90"]);
      const asan = `=================================================================
==${pid}==ERROR: AddressSanitizer: heap-use-after-free on address ${addr} at pc 0x7f3a2c45df89 bp 0x7ffd8c70ced0 sp 0x7ffd8c70c648
READ of size 6 at ${addr} thread T0
    #0 0x7f3a2c45df88 in printf_common sanitizer_common_interceptors_format.inc:553
    #1 0x7f3a2c45e7c6 in __interceptor_printf sanitizer_common_interceptors.inc:1718
    #2 0x55e2682bf309 in main /srv/app/session.c:${useL}
    #3 0x7f3a2c029d8f in __libc_start_call_main (/lib/x86_64-linux-gnu/libc.so.6+0x29d8f)

${addr} is located 0 bytes inside of 36-byte region [${addr},${addr.slice(0, -2)}${(parseInt(addr.slice(-2), 16) + 36).toString(16)})
freed by thread T0 here:
    #0 0x7f3a2c4b4537 in __interceptor_free asan_malloc_linux.cpp:127
    #1 0x55e2682bf264 in end_session /srv/app/session.c:${freeL}
    #2 0x55e2682bf2ee in main /srv/app/session.c:${callL}
    #3 0x7f3a2c029d8f in __libc_start_call_main (/lib/x86_64-linux-gnu/libc.so.6+0x29d8f)

previously allocated by thread T0 here:
    #0 0x7f3a2c4b4887 in __interceptor_malloc asan_malloc_linux.cpp:145
    #1 0x55e2682bf27d in main /srv/app/session.c:${allocL}
    #2 0x7f3a2c029d8f in __libc_start_call_main (/lib/x86_64-linux-gnu/libc.so.6+0x29d8f)

SUMMARY: AddressSanitizer: heap-use-after-free sanitizer_common_interceptors_format.inc:553 in printf_common
==${pid}==ABORTING
`;
      return { _line: freeL, files: [
        { name: "asan.txt", kind: "text", note: "What the program printed when it crashed under AddressSanitizer.", data: asan },
        csrc("session.c", "The source the report refers to.", src),
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._line; },
    debrief: `The report told the whole story in three traces: \`main\` allocated the session, \`end_session\` freed it, and then \`main\` read \`s->user\` through the now-dangling pointer. The 36-byte region is the struct: 32 bytes of \`user\` plus a 4-byte \`int\`.

In a real service, another request's \`malloc\` could be handed that same 36 bytes between the free and the use. Whoever fills it controls what the stale pointer sees, including the \`is_admin\` field.

### How defenders stop it
- Set pointers to \`NULL\` immediately after freeing, and give every allocation one clear **owner** responsible for freeing it.
- Run tests and fuzzers under **AddressSanitizer**; use hardened allocators in production (delayed reuse, quarantine).
- In C++, use smart pointers (\`unique_ptr\`, \`shared_ptr\`); in new code, prefer languages whose compilers enforce ownership (Rust) or use garbage collection.

**On the exam:** use-after-free (CWE-416) and double free (CWE-415) are named in PenTest+, CEH and CISSP software-security objectives.`,
  },

  {
    id: "mem-leak",
    title: "Memory That Never Comes Back",
    level: 3,
    slug: "leak_on_the_error_path",
    time: 12,
    certs: ["Security+", "CySA+", "GSEC"],
    objective: "A server slowly runs out of memory. Valgrind shows where the leaked blocks were allocated; find the return statement that leaks them and submit its line number.",
    answerLabel: "Line number",
    answerPlaceholder: "a line number",
    lesson: `Every \`malloc\` needs exactly one matching \`free\`. Free twice, or use after freeing, and you saw what happens. Never free at all and you get a **memory leak**: the block stays reserved until the process exits.

One leak is harmless. A leak on a path an attacker can trigger **repeatedly** is a denial-of-service: each bad request strands a little more memory until the server slows, swaps, and is killed by the operating system. That is an attack on **availability**.

### Where leaks hide: early returns
\`\`\`c
char *buf = malloc(1024);
if (something_failed) {
    return -1;          // leaves without free(buf): leaked
}
...
free(buf);
return 0;
\`\`\`

The happy path frees correctly. The bug is on an **error path** that returns early. To review a function for leaks, find each allocation and then follow *every* route out of the function, checking that each one releases it.

A new piece of syntax: \`if (body == NULL)\` checks whether \`malloc\` failed. \`NULL\` is the "points to nothing" address, and there is nothing to free in that case.

### Reading Valgrind
Valgrind's memcheck runs a program and reports blocks that were still allocated, unreachable, at exit:

\`\`\`
4,096 bytes in 1 blocks are definitely lost
   at malloc
   by handle_request (server.c:14)     <- where it was ALLOCATED
\`\`\`

It tells you where leaked memory was allocated, not which exit forgot to free it. That part is your job.

### Your task
Use \`valgrind.txt\` to find the leaking allocation in \`server.c\`, then trace each \`return\` in that function. Submit the line number of the \`return\` that exits without freeing.`,
    hints: ["Valgrind points at the malloc in handle_request. Now list every return statement after it.", "The return taken when malloc itself failed is fine: nothing was allocated.", "One return sits in an if block with no free(body) before it. That is the leak."],
    workspace: { type: "files" },
    setup(ctx) {
      const blocks = ctx.int(12, 90);
      const pad = ["/* server.c: request handling */", "", "/* build: gcc -g -O0 server.c */"].slice(0, ctx.int(0, 3));
      const src = [
        ...pad,
        "#include <stdlib.h>",
        "#include <unistd.h>",
        "",
        "#define BODY_MAX 4096",
        "",
        "int handle_request(int fd) {",
        "    char *body = malloc(BODY_MAX);",
        "    if (body == NULL) {",
        "        return -1;",
        "    }",
        "",
        "    ssize_t n = read(fd, body, BODY_MAX - 1);",
        "    if (n <= 0) {",
        "        return -2;",
        "    }",
        "    body[n] = '\\0';",
        "",
        "    if (!is_valid(body)) {",
        "        free(body);",
        "        return -3;",
        "    }",
        "",
        "    process(body);",
        "    free(body);",
        "    return 0;",
        "}",
      ].join("\n");
      const allocL = lineOf(src, "malloc(BODY_MAX)");
      const bytes = (blocks * 4096).toLocaleString("en-US");
      const pid = ctx.int(2000, 9000);
      const vg = `==${pid}== Memcheck, a memory error detector
==${pid}== Command: ./server --port 8080
==${pid}==
==${pid}== HEAP SUMMARY:
==${pid}==     in use at exit: ${bytes} bytes in ${blocks} blocks
==${pid}==   total heap usage: ${(blocks * 37 + 12).toLocaleString("en-US")} allocs, ${(blocks * 36 + 12).toLocaleString("en-US")} frees
==${pid}==
==${pid}== ${bytes} bytes in ${blocks} blocks are definitely lost in loss record 1 of 1
==${pid}==    at 0x4848899: malloc (vg_replace_malloc.c:381)
==${pid}==    by 0x109256: handle_request (server.c:${allocL})
==${pid}==    by 0x1093A1: main (server.c:${allocL + 40})
==${pid}==
==${pid}== LEAK SUMMARY:
==${pid}==    definitely lost: ${bytes} bytes in ${blocks} blocks
==${pid}==    indirectly lost: 0 bytes in 0 blocks
==${pid}==      possibly lost: 0 bytes in 0 blocks
==${pid}== ERROR SUMMARY: 1 errors from 1 contexts
`;
      return { _line: lineOf(src, "return -2;"), files: [
        { name: "valgrind.txt", kind: "text", note: `Leak report after a test run in which ${blocks} clients connected and then sent nothing.`, data: vg },
        csrc("server.c", "The request handler. Follow every way out of it.", src),
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._line; },
    debrief: `When a client connected and sent nothing, \`read\` returned 0 and the function left through \`return -2\` without freeing \`body\`. Each such connection stranded 4,096 bytes. Anyone who can open connections can repeat that until the server dies: a cheap **denial of service**.

The other early returns were fine: the first runs only when nothing was allocated, and the third frees before returning.

### How defenders stop it
- Use a single cleanup path: in C, the \`goto cleanup;\` pattern, where every exit jumps to one block that frees everything.
- Run test suites under **Valgrind** or **LeakSanitizer** (\`-fsanitize=leak\`, included in ASan).
- Monitor memory per process in production and alert on steady growth; set resource limits so one leaky service can't take the host down.
- Languages with automatic cleanup (RAII in C++/Rust, garbage collection elsewhere) remove most of this class.

**On the exam:** memory leaks and resource exhaustion are covered under availability and application attacks in Security+ and CySA+.`,
  },
];
