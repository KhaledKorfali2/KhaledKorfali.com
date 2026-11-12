// Track: Assembly & Reverse Engineering. Read what the compiler actually produced.
// Listings follow real gcc/objdump output (x86-64, Intel and AT&T syntax, plus a
// taste of AArch64). Analysis only: learners read disassembly and predict behaviour.
import { norm } from "../flags.js";

const asm = (name, note, data) => ({ name, kind: "code", label: "ASM", note, data });
const csrc = (name, note, data) => ({ name, kind: "code", label: "C", note, data });
const hx = (n) => "0x" + n.toString(16);

export default [
  {
    id: "asm-registers",
    title: "Registers and mov",
    level: 2,
    slug: "reading_x86_registers",
    time: 11,
    certs: ["PenTest+", "CEH", "GSEC"],
    objective: "Trace the short x86-64 function and submit the value left in eax when it returns.",
    answerLabel: "Value in eax",
    answerPlaceholder: "decimal or 0x hex",
    lesson: `Source code is for people. The CPU runs **machine code**: raw bytes. **Assembly** is those bytes written as readable text, one line per instruction. Analysts read it constantly, because malware, firmware and closed-source software arrive without source, and because the final truth about any C bug is in what the compiler emitted.

### Registers
The CPU has a handful of tiny, very fast storage slots called **registers**. On x86-64 each holds 64 bits:

| Register | Usual job |
|---|---|
| \`rax\` | scratch; holds a function's **return value** |
| \`rcx\`, \`rdx\`, \`rsi\`, \`rdi\`, \`r8\`–\`r15\` | general purpose; several carry arguments |
| \`rsp\` | **stack pointer**: top of the stack |
| \`rbp\` | **frame pointer**: base of the current stack frame |
| \`rip\` | **instruction pointer**: address of the next instruction |

Each register has smaller views of its low bits: \`rax\` (64) → \`eax\` (low 32) → \`ax\` (16) → \`al\` (8). C \`int\` values are 32-bit, so compiled code is full of \`eax\`, \`ecx\`, \`edx\`.

### Instructions (Intel syntax)
Intel syntax puts the **destination first**: \`op destination, source\`.

| Instruction | Meaning |
|---|---|
| \`mov eax, 5\` | eax = 5 |
| \`mov eax, ecx\` | eax = ecx (copy; ecx is unchanged) |
| \`add eax, ecx\` | eax = eax + ecx |
| \`sub eax, 3\` | eax = eax − 3 |
| \`shl eax, 2\` | shift left 2 bits: eax = eax × 4 |
| \`xor ecx, ecx\` | ecx = 0 (anything XOR itself is zero; a very common idiom) |
| \`ret\` | return to the caller; the result is whatever is in \`eax\` |

Numbers starting with \`0x\` are hexadecimal.

### Your task
Open \`calc.s\`. Keep a little table of \`eax\` and \`ecx\`, update it one instruction at a time, and submit the value in \`eax\` at the \`ret\`.`,
    hints: ["Write two columns, eax and ecx. The first two instructions fill them in.", "Convert the hex constants to decimal first (the Toolkit's number converter does this).", "shl by 2 multiplies by 4. The final xor only changes ecx, not eax."],
    workspace: { type: "files" },
    setup(ctx) {
      const a = ctx.int(0x10, 0x3f), b = ctx.int(3, 12), c = ctx.int(2, 15);
      const listing = `0000000000401106 <calc>:
  401106:	mov    eax,${hx(a)}
  40110b:	mov    ecx,${hx(b)}
  401110:	add    eax,ecx
  401112:	shl    eax,0x2
  401115:	sub    eax,${hx(c)}
  401118:	xor    ecx,ecx
  40111a:	ret
`;
      return { _v: (a + b) * 4 - c, files: [asm("calc.s", "objdump output, Intel syntax. Left column: the address of each instruction.", listing)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._v; },
    debrief: `You executed the function in your head: load two constants, add, multiply by four with a shift, subtract. The C it came from was a single line, something like \`return (a + b) * 4 - c;\`.

Two things worth keeping:
- The left column is each instruction's **address**. They aren't evenly spaced because x86 instructions vary in length (1 to 15 bytes).
- The return value travels in \`eax\`/\`rax\`. Whenever you want to know what a function returns, look at what's in \`eax\` just before \`ret\`.

### Why defenders read assembly
- **Malware analysis**: there is no source; the disassembly is all you get.
- **Vulnerability research and patch review**: confirming what a fix really changed.
- **Verifying mitigations**: checking that the compiler really emitted the protections you asked for.

**On the exam:** PenTest+, CEH and GSEC expect familiarity with disassemblers and debuggers (objdump, Ghidra, IDA, gdb) and what registers are for.`,
  },

  {
    id: "asm-att",
    title: "Two Dialects: Intel and AT&T",
    level: 2,
    slug: "att_syntax_decoded",
    time: 11,
    certs: ["PenTest+", "CEH", "GSEC"],
    objective: "This listing uses AT&T syntax. Trace it and submit the value left in eax.",
    answerLabel: "Value in eax",
    answerPlaceholder: "decimal or 0x hex",
    lesson: `x86 assembly is written in two notations. The **instructions are identical**; only the spelling differs. Windows tools, IDA and Ghidra default to **Intel**. Linux tools (\`objdump\`, \`gdb\`, gcc output) default to **AT&T**. You need to read both.

| | Intel | AT&T |
|---|---|---|
| Operand order | \`mov dst, src\` | \`mov src, dst\` (**reversed**) |
| Registers | \`eax\` | \`%eax\` |
| Constants | \`5\`, \`0x1f\` | \`$5\`, \`$0x1f\` |
| Memory | \`[rbp-0x4]\` | \`-0x4(%rbp)\` |
| Size | \`DWORD PTR [rbp-0x4]\` | suffix on the instruction: \`movl\` |

AT&T size suffixes: \`b\` = byte (8 bits), \`w\` = word (16), \`l\` = long (32), \`q\` = quad (64).

The same four instructions in both:

\`\`\`
Intel                         AT&T
mov  eax, 0x5                 movl  $0x5, %eax
add  eax, ecx                 addl  %ecx, %eax
sub  eax, ecx                 subl  %ecx, %eax       # eax = eax - ecx
mov  DWORD PTR [rbp-0x4], eax movl  %eax, -0x4(%rbp)
\`\`\`

### Memory operands
Square brackets (Intel) or parentheses (AT&T) mean "the memory **at** this address". \`[rbp-0x4]\` is the 4 bytes located 4 below the frame pointer: a local variable. So \`movl %eax, -0x4(%rbp)\` stores eax into a local, and \`addl $3, -0x4(%rbp)\` adds 3 to that local in place.

### The trap
In AT&T the destination is **last**. \`subl %ecx, %eax\` computes eax − ecx and stores it in eax. Read every line as "do this *to the last operand*".

### Your task
Trace \`mix.s\` and submit the final value of \`eax\`.`,
    hints: ["In AT&T the LAST operand is the destination. $ marks a constant, % marks a register.", "subl %ecx, %eax means eax = eax - ecx. addl %eax, %eax doubles eax.", "-0x4(%rbp) is a local variable: follow the value stored into it, the add applied to it, and the load back into eax."],
    workspace: { type: "files" },
    setup(ctx) {
      const b = ctx.int(3, 20), a = b + ctx.int(5, 40), c = ctx.int(2, 30);
      const listing = `0000000000401106 <mix>:
  401106:	push   %rbp
  401107:	mov    %rsp,%rbp
  40110a:	movl   $${hx(a)},%eax
  40110f:	movl   $${hx(b)},%ecx
  401114:	subl   %ecx,%eax
  401116:	addl   %eax,%eax
  401118:	movl   %eax,-0x4(%rbp)
  40111b:	addl   $${hx(c)},-0x4(%rbp)
  40111f:	movl   -0x4(%rbp),%eax
  401122:	pop    %rbp
  401123:	ret
`;
      return { _v: (a - b) * 2 + c, files: [asm("mix.s", "objdump output in its default AT&T syntax.", listing)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._v; },
    debrief: `Same machine code as the previous challenge would produce, different notation. The subtraction went *into* the last operand, the doubled result was stored into a local at \`-0x4(%rbp)\`, bumped in memory, and loaded back into \`eax\` for the return.

You can ask the tools for whichever dialect you prefer:
- \`objdump -d -M intel prog\`
- in gdb: \`set disassembly-flavor intel\`

The first two and last two lines (\`push %rbp\` / \`mov %rsp,%rbp\` … \`pop %rbp\` / \`ret\`) appear in nearly every function. They build and tear down the stack frame, which is the subject of the next challenge.

**On the exam:** you won't be asked to write assembly, but PenTest+/CEH/GSEC scenarios show debugger and disassembler output in both syntaxes.`,
  },

  {
    id: "asm-frame",
    title: "From C to Assembly",
    level: 3,
    slug: "locals_live_below_rbp",
    time: 13,
    certs: ["PenTest+", "CEH", "GSEC"],
    objective: "The source for a function is lost, but its disassembly shows an unbounded read into a stack buffer. Submit how many bytes lie between the start of that buffer and the saved rbp, in decimal.",
    answerLabel: "Bytes from buffer start to saved rbp",
    answerPlaceholder: "a decimal number",
    lesson: `In the Memory Safety track you saw the stack frame as a diagram. Here is the code that builds it. Almost every compiled function starts and ends the same way:

\`\`\`
push   rbp            ; save the caller's frame pointer on the stack
mov    rbp, rsp       ; this function's frame starts here
sub    rsp, 0x20      ; reserve 0x20 (32) bytes for local variables
...                   ; the body
leave                 ; undo: rsp = rbp, then pop rbp
ret                   ; pop the return address into rip
\`\`\`

The opening three lines are the **prologue**; \`leave\` / \`ret\` are the **epilogue**. \`call\` pushed the return address just before the prologue ran, so above \`rbp\` you find: saved rbp at \`[rbp+0]\`, return address at \`[rbp+8]\`.

### Finding the locals
Locals are addressed relative to \`rbp\`, at negative offsets:
- \`mov DWORD PTR [rbp-0x4], 0\` writes a 4-byte int local (\`DWORD\` = 4 bytes, \`QWORD\` = 8, \`BYTE\` = 1).
- \`lea rax, [rbp-0x40]\` is different: **lea** ("load effective address") computes the *address* \`rbp-0x40\` without reading memory. It is how the compiler takes \`&buf\` or passes an array to a function.

So when you see \`lea rax, [rbp-0x40]\` followed by a call to a copy or read function, a buffer starts at \`rbp-0x40\`, and there are exactly 0x40 bytes from its first byte up to the saved rbp.

\`compare.c\` and \`compare.s\` in the workspace show a small function next to its real compiler output so you can match each C line to its instructions.

### Your task
\`mystery.s\` is the disassembly of a function whose source is gone. It calls \`gets\`, which reads without a limit. Find where its buffer starts and submit the number of bytes between the buffer's first byte and the saved rbp, **in decimal**.`,
    hints: ["Find the call to gets. The argument is set up just before it.", "The lea instruction computes the buffer's address as rbp minus some hex offset.", "Convert that hex offset to decimal: that is the distance from the buffer's start to the saved rbp."],
    workspace: { type: "files" },
    setup(ctx) {
      const B = ctx.pick([32, 48, 64, 80, 96, 112]);
      const mystery = `0000000000401176 <read_name>:
  401176:	push   rbp
  401177:	mov    rbp,rsp
  40117a:	sub    rsp,${hx(B)}
  40117e:	lea    rax,[rbp-${hx(B)}]
  401182:	mov    rdi,rax
  401185:	mov    eax,0x0
  40118a:	call   401060 <gets@plt>
  40118f:	lea    rax,[rbp-${hx(B)}]
  401193:	mov    rdi,rax
  401196:	call   401030 <puts@plt>
  40119b:	nop
  40119c:	leave
  40119d:	ret
`;
      const c = String.raw`int add3(int a, int b, int c) {
    return a + b * c;
}
`;
      const s = `0000000000401106 <add3>:
  401106:	push   rbp                          ; prologue
  401107:	mov    rbp,rsp
  40110a:	mov    DWORD PTR [rbp-0x4],edi      ; a  (1st argument arrives in edi)
  40110d:	mov    DWORD PTR [rbp-0x8],esi      ; b  (2nd argument: esi)
  401110:	mov    DWORD PTR [rbp-0xc],edx      ; c  (3rd argument: edx)
  401113:	mov    eax,DWORD PTR [rbp-0x8]      ; eax = b
  401116:	imul   eax,DWORD PTR [rbp-0xc]      ; eax = b * c
  40111a:	mov    edx,eax
  40111c:	mov    eax,DWORD PTR [rbp-0x4]      ; eax = a
  40111f:	add    eax,edx                      ; eax = a + b * c   (the return value)
  401121:	pop    rbp                          ; epilogue
  401122:	ret
`;
      return { _n: B, files: [
        asm("mystery.s", "Disassembly of a function from a stripped binary. No source available.", mystery),
        csrc("compare.c", "Reference: a small C function…", c),
        asm("compare.s", "…and exactly what gcc -O0 produced for it (comments added).", s),
      ] };
    },
    check(input, ctx, env) { return norm.num(input) === env._n; },
    debrief: `\`lea rax,[rbp-N]\` gave it away: the buffer begins N bytes below the saved frame pointer, and that address is handed straight to \`gets\`. Any input longer than N bytes runs over the saved rbp, and 8 bytes later, the return address. You found a stack buffer overflow, and measured it, **without any source code**.

That is everyday reverse engineering: recognise the prologue, locate the locals, see what gets passed to dangerous functions.

### How defenders use this
- **Binary auditing**: third-party and legacy binaries are checked for calls to \`gets\`, \`strcpy\`, \`sprintf\` exactly this way (tools like Ghidra and \`objdump -d | grep\` make it fast).
- **Patch verification**: after a fix, the call should be \`fgets\`, with a size loaded as an argument.
- **Crash triage**: mapping a faulting address back to a frame offset tells you which buffer overflowed.

**On the exam:** stack frames, prologue/epilogue and unsafe functions in disassembly underpin PenTest+ and CEH exploit-analysis questions.`,
  },

  {
    id: "asm-calls",
    title: "Who Gets Which Argument?",
    level: 3,
    slug: "sysv_calling_convention",
    time: 12,
    certs: ["PenTest+", "CEH", "GSEC"],
    objective: "A function calls read() into a stack buffer. From the disassembly alone, work out how many bytes read() may write past the space available below the saved rbp. Submit that number in decimal.",
    answerLabel: "Bytes of overflow possible",
    answerPlaceholder: "a decimal number",
    lesson: `When one function calls another, where do the arguments go? Both sides follow a fixed agreement called the **calling convention**. On 64-bit Linux and macOS (the *System V AMD64* convention):

| Argument | 1st | 2nd | 3rd | 4th | 5th | 6th |
|---|---|---|---|---|---|---|
| Register | \`rdi\` | \`rsi\` | \`rdx\` | \`rcx\` | \`r8\` | \`r9\` |

- Further arguments go on the stack.
- The **return value** comes back in \`rax\`.
- The 32-bit names (\`edi\`, \`esi\`, \`edx\`…) are used when the argument is an \`int\`.
- 64-bit Windows uses a different order: \`rcx\`, \`rdx\`, \`r8\`, \`r9\`.

So to understand any \`call\`, look at the instructions just **before** it and see what was loaded into \`rdi\`, \`rsi\` and \`rdx\`. Then match them against the function's signature:

\`\`\`c
ssize_t read(int fd, void *buf, size_t count);
//            rdi      rsi        rdx
\`\`\`

\`read\` copies up to \`count\` bytes from file descriptor \`fd\` (0 is standard input) into \`buf\`. It is *bounded*, but only as safe as the number the programmer passed.

### Your task
In \`greet.s\`, find the \`call\` to \`read\`. Identify the buffer (second argument) and the count (third argument). The buffer starts some distance below the saved rbp, as in the previous challenge. Submit **count minus that distance**: the number of bytes the call can write beyond the frame's local space. Convert hex to decimal.`,
    hints: ["Before the call: edx holds the count, rsi the buffer address, edi the file descriptor.", "The buffer address came from lea rax,[rbp-0x..]. That hex offset is the space available.", "Convert both hex numbers to decimal and subtract: count - space."],
    workspace: { type: "files" },
    setup(ctx) {
      const B = ctx.pick([32, 48, 64, 80, 96]);
      const N = ctx.pick([0x100, 0x12c, 0x190, 0x200, 0x400]);
      const listing = `0000000000401196 <greet>:
  401196:	push   rbp
  401197:	mov    rbp,rsp
  40119a:	sub    rsp,${hx(B)}
  40119e:	lea    rax,[rbp-${hx(B)}]
  4011a2:	mov    edx,${hx(N)}
  4011a7:	mov    rsi,rax
  4011aa:	mov    edi,0x0
  4011af:	call   401050 <read@plt>
  4011b4:	lea    rax,[rbp-${hx(B)}]
  4011b8:	mov    rsi,rax
  4011bb:	lea    rax,[rip+0xe42]        # 402004 <_IO_stdin_used+0x4>
  4011c2:	mov    rdi,rax
  4011c5:	mov    eax,0x0
  4011ca:	call   401040 <printf@plt>
  4011cf:	nop
  4011d0:	leave
  4011d1:	ret
`;
      return { _n: N - B, files: [asm("greet.s", "Disassembly of greet(), Intel syntax. The @plt names are calls into the C library.", listing)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._n; },
    debrief: `Reading the three argument registers before the call reconstructs the source line: \`read(0, name, COUNT)\` with a buffer much smaller than COUNT. The programmer used a bounded function and still overflowed, because the bound was wrong. The second call is \`printf("...", name)\`: format string in \`rdi\`, the buffer in \`rsi\`.

A "safe" function with the wrong size is one of the most common real findings: \`read\`, \`fgets\`, \`memcpy\`, \`strncpy\` and \`snprintf\` all trust the length they're given.

### How defenders stop it
- Never hand-type sizes: \`read(0, name, sizeof(name) - 1)\`.
- Turn on compiler diagnostics: modern gcc warns here (\`-Wstringop-overflow\`) because it can see both sizes.
- In binary audits, check the size argument of every bounded copy against the destination's frame space, exactly as you just did.

**On the exam:** calling conventions and argument registers are assumed knowledge for PenTest+/CEH debugger questions and essential for any reverse-engineering work.`,
  },

  {
    id: "asm-branch",
    title: "The Check Behind the Jump",
    level: 3,
    slug: "cmp_and_conditional_jump",
    time: 12,
    certs: ["PenTest+", "CEH", "GSEC"],
    objective: "A program checks a PIN inside the binary. Read the comparison and work out which PIN makes the function return 1. Submit it in decimal.",
    answerLabel: "PIN",
    answerPlaceholder: "a decimal number",
    lesson: `C has \`if\`, \`while\` and \`for\`. The CPU has only two things: **compare**, then **jump or don't**.

### Flags
\`cmp a, b\` computes \`a − b\`, throws the result away, and records facts about it in the **flags** register: was it zero (**ZF**)? negative (**SF**)? did it borrow (**CF**)? The next instruction is usually a conditional jump that reads those flags:

| Jump | Taken when (after \`cmp a, b\`) |
|---|---|
| \`je\` / \`jz\` | a == b |
| \`jne\` / \`jnz\` | a != b |
| \`jl\`, \`jle\`, \`jg\`, \`jge\` | a <, <=, >, >= b, treating them as **signed** |
| \`jb\`, \`jbe\`, \`ja\`, \`jae\` | the same comparisons, **unsigned** |
| \`jmp\` | always |

\`test eax, eax\` followed by \`je\` is the idiom for "if eax is zero".

### How an if looks
\`\`\`c
if (x != 10) return 0;
return 1;
\`\`\`
\`\`\`
cmp    DWORD PTR [rbp-0x4], 0xa
je     ok            ; equal? skip the failure code
mov    eax, 0x0      ; return 0
jmp    done
ok:
mov    eax, 0x1      ; return 1
done:
\`\`\`

In a listing the jump target is an address, like \`je 401126 <check_pin+0x20>\`. Follow it by finding that address in the left column.

Signed versus unsigned jumps matter for security: a length checked with \`jl\` (signed) treats a huge unsigned value as negative and lets it pass.

### Your task
\`check_pin.s\` is a PIN check found in a binary. The argument (the PIN you enter) arrives in \`edi\`. Work out the PIN for which the function returns 1 and submit it in decimal.`,
    hints: ["Follow the PIN: edi is stored to a local, loaded into eax, and then something is added to it.", "The cmp compares that sum with a constant. je jumps to the code that sets eax to 1.", "PIN + (added constant) must equal the compared constant. Subtract, then convert to decimal."],
    workspace: { type: "files" },
    setup(ctx) {
      const add = ctx.int(0x11, 0x7f), k = ctx.int(0x400, 0xfff0);
      const listing = `0000000000401106 <check_pin>:
  401106:	push   rbp
  401107:	mov    rbp,rsp
  40110a:	mov    DWORD PTR [rbp-0x14],edi
  40110d:	mov    eax,DWORD PTR [rbp-0x14]
  401110:	add    eax,${hx(add)}
  401113:	mov    DWORD PTR [rbp-0x4],eax
  401116:	cmp    DWORD PTR [rbp-0x4],${hx(k)}
  40111d:	je     401126 <check_pin+0x20>
  40111f:	mov    eax,0x0
  401124:	jmp    40112b <check_pin+0x25>
  401126:	mov    eax,0x1
  40112b:	pop    rbp
  40112c:	ret
`;
      return { _v: k - add, files: [asm("check_pin.s", "A PIN check extracted from a vendor's desktop tool. Intel syntax.", listing)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._v; },
    debrief: `The function added a constant to your input, compared the sum with another constant, and jumped to "return 1" only when they matched. Working backwards from the \`cmp\` gave the PIN. The original C was roughly:

\`\`\`c
int check_pin(int pin) {
    int v = pin + OFFSET;
    if (v != MAGIC) return 0;
    return 1;
}
\`\`\`

The security lesson is the same one as the web track's "trusting the browser": **any check that ships to the user can be read by the user**. A secret compiled into a binary is not secret, and adding arithmetic or obfuscation only slows a reader down.

### How defenders handle it
- Never embed passwords, licence keys or API secrets in client software; verify on a server you control.
- Treat anything in a distributed binary as public: scan your own releases with \`strings\` and a disassembler before attackers do.
- Where a local check is unavoidable, store a salted hash of the secret, not the secret.

**On the exam:** PenTest+ and CEH cover reverse engineering and hardcoded credentials in binaries; GSEC covers why client-side secrets fail.`,
  },

  {
    id: "asm-loop",
    title: "A Loop That Hides a String",
    level: 4,
    slug: "xor_decoder_unrolled",
    time: 15,
    certs: ["CySA+", "PenTest+", "CEH", "GSEC"],
    objective: "A suspicious binary hides a string and decodes it at run time. Read the decoding loop, find the key, and decode the data to recover the flag.",
    lesson: `Running \`strings\` on a binary reveals URLs, file paths and messages, so malware authors hide theirs: the data is stored scrambled, and a small loop unscrambles it just before use. Analysts meet this loop constantly. Being able to read it means you can recover the hidden configuration (command-and-control address, mutex name, ransom note) without ever running the sample.

### How a for loop looks in assembly
\`\`\`c
for (int i = 0; i < n; i++) p[i] ^= KEY;
\`\`\`

The compiler lays it out as: initialise, jump down to the test, body, increment, test, **jump backwards** while the condition holds.

\`\`\`
      mov  DWORD PTR [rbp-0x4], 0x0   ; i = 0
      jmp  test
body: ...                             ; p[i] ^= KEY
      add  DWORD PTR [rbp-0x4], 0x1   ; i++
test: mov  eax, DWORD PTR [rbp-0x4]
      cmp  eax, DWORD PTR [rbp-0x1c]  ; i < n ?
      jl   body                       ; a jump to a LOWER address = a loop
\`\`\`

A conditional jump to an earlier address is the signature of a loop.

### New instructions in the body
- \`movzx edx, BYTE PTR [rax]\`: load **one byte** from the address in rax, zero-extended to 32 bits. This is \`p[i]\` being read.
- \`xor edx, 0x..\`: XOR that byte with a constant: the **key**.
- \`mov BYTE PTR [rax], dl\`: store the low byte (\`dl\` is the low 8 bits of \`edx\`) back.
- \`movsxd rdx, eax\`: widen a 32-bit int to 64 bits so it can be added to a pointer.

XOR is its own inverse: applying the same key again restores the original, so the decoder and the encoder are the same loop.

### Your task
\`decode.s\` is the decoding function. \`data.txt\` holds the scrambled bytes it is called on. Find the key in the loop body, then use the Toolkit's **XOR with key (hex in)** to decode the bytes (enter the key as \`0x..\`).`,
    hints: ["Look in the loop body for an xor with a constant. That constant is the single-byte key.", "Copy the hex bytes from data.txt into the Toolkit input.", "Run 'XOR with key (hex in)' and type the key in the form 0x5a (using the value from the listing)."],
    workspace: { type: "files" },
    setup(ctx) {
      const key = ctx.pick([0x17, 0x2a, 0x3c, 0x4d, 0x5a, 0x66, 0x71, 0x9d, 0xa7, 0xc3]);
      const enc = [...ctx.flag].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, "0"));
      const rows = [];
      for (let i = 0; i < enc.length; i += 16) rows.push(` ${(0x404040 + i).toString(16)}  ${enc.slice(i, i + 16).join(" ")}`);
      const listing = `0000000000401136 <decode>:
  401136:	push   rbp
  401137:	mov    rbp,rsp
  40113a:	mov    QWORD PTR [rbp-0x18],rdi
  40113e:	mov    DWORD PTR [rbp-0x1c],esi
  401141:	mov    DWORD PTR [rbp-0x4],0x0
  401148:	jmp    401170 <decode+0x3a>
  40114a:	mov    eax,DWORD PTR [rbp-0x4]
  40114d:	movsxd rdx,eax
  401150:	mov    rax,QWORD PTR [rbp-0x18]
  401154:	add    rax,rdx
  401157:	movzx  edx,BYTE PTR [rax]
  40115a:	mov    eax,DWORD PTR [rbp-0x4]
  40115d:	movsxd rcx,eax
  401160:	mov    rax,QWORD PTR [rbp-0x18]
  401164:	add    rax,rcx
  401167:	xor    edx,${hx(key)}
  40116a:	mov    BYTE PTR [rax],dl
  40116c:	add    DWORD PTR [rbp-0x4],0x1
  401170:	mov    eax,DWORD PTR [rbp-0x4]
  401173:	cmp    eax,DWORD PTR [rbp-0x1c]
  401176:	jl     40114a <decode+0x14>
  401178:	nop
  401179:	nop
  40117a:	pop    rbp
  40117b:	ret
`;
      const data = `Caller:   decode(blob, ${ctx.flag.length});      // rdi = address of blob, esi = length

Contents of blob (${ctx.flag.length} bytes at 0x404040), in hex:

${rows.join("\n")}
`;
      return { files: [
        asm("decode.s", "The decoding routine from the sample. Intel syntax, real gcc -O0 output.", listing),
        { name: "data.txt", kind: "text", note: "The scrambled bytes the routine is called on.", data },
      ] };
    },
    debrief: `The loop walked a pointer (\`rdi\`, saved at \`[rbp-0x18]\`) across \`esi\` bytes, XORing each with one constant. Reading the constant out of the \`xor\` instruction and applying it yourself recovered the string **statically**: you never had to run untrusted code.

This is real malware-analysis workflow. Single-byte XOR is the most common string obfuscation in commodity malware precisely because it is so cheap; stronger samples use multi-byte keys or RC4, but the approach is the same: find the decode routine, extract the key, decode offline.

### How defenders use this
- Decoded strings become **indicators of compromise**: domains, IPs, file names, registry keys to hunt for.
- Tools automate the common cases (FLOSS, CyberChef, XOR brute-forcers), and YARA rules can match the decoder's byte pattern itself.
- Obfuscation is not encryption: with the binary in hand, the key is always in there somewhere.

**On the exam:** obfuscation/encoding, static analysis and IoC extraction are CySA+ and CEH objectives (and MITRE ATT&CK T1027, Obfuscated Files or Information).`,
  },

  {
    id: "asm-canary",
    title: "Spot the Guard",
    level: 3,
    slug: "mitigations_in_the_binary",
    time: 12,
    certs: ["Security+", "PenTest+", "CySA+", "CISSP"],
    objective: "Five production binaries were audited for exploit mitigations. Submit the name of the one built without stack protection.",
    answerLabel: "Binary name",
    answerPlaceholder: "e.g. authd",
    lesson: `Memory bugs keep happening, so compilers and operating systems add **mitigations** that make a bug much harder to turn into a compromise. They don't fix anything; they raise the cost. You can see each one in the binary.

### Stack canary
The compiler stores a random value between the locals and the saved return address when a function starts, and checks it before returning. An overflow that reaches the return address must overwrite the canary first, and the check aborts the program. In disassembly it is unmistakable:

\`\`\`
mov    rax, QWORD PTR fs:0x28        ; fetch the secret canary
mov    QWORD PTR [rbp-0x8], rax      ; place it just below saved rbp
...
mov    rax, QWORD PTR [rbp-0x8]      ; before returning: read it back
sub    rax, QWORD PTR fs:0x28        ; unchanged?
je     ok
call   __stack_chk_fail              ; no: abort immediately
\`\`\`

\`guarded.s\` in the workspace is the earlier \`greet\` function rebuilt with \`-fstack-protector\`; compare it with what you read before.

### The other standard mitigations
| Mitigation | What it does |
|---|---|
| **NX / DEP** | stack and heap memory are not executable, so injected bytes can't run as code |
| **ASLR + PIE** | the stack, heap, libraries and (with PIE) the program itself load at random addresses each run |
| **RELRO** | makes the table of library function addresses read-only after startup |
| **FORTIFY_SOURCE** | swaps in length-checked versions of \`strcpy\`, \`memcpy\`, \`sprintf\`… where sizes are known |

The \`checksec\` tool reads a binary's headers and symbols and reports which of these it was built with. It is a standard step in hardening reviews.

### Your task
\`checksec.txt\` is the audit of five services. Several have minor gaps. Exactly one was built with **no stack canary**. Submit its file name.`,
    hints: ["Find the STACK CANARY column in checksec.txt.", "Four rows say 'Canary found'. One says 'No canary found'.", "Submit just the file name at the end of that row."],
    workspace: { type: "files" },
    setup(ctx) {
      const names = ctx.shuffle(["authd", "billingd", "reportd", "syncd", "queued", "mailerd", "indexd", "gatewayd"]).slice(0, 5);
      const bad = names[ctx.int(0, 4)];
      const row = (r, c, n, p, f) => `${r.padEnd(16)}${c.padEnd(18)}${n.padEnd(14)}${p.padEnd(16)}${f}`;
      const variants = ctx.shuffle([
        ["Full RELRO", "Canary found", "NX enabled", "PIE enabled"],
        ["Partial RELRO", "Canary found", "NX enabled", "PIE enabled"],
        ["Full RELRO", "Canary found", "NX enabled", "No PIE"],
        ["Full RELRO", "Canary found", "NX enabled", "PIE enabled"],
      ]);
      let k = 0;
      const rows = names.map((n) => (n === bad
        ? row("Partial RELRO", "No canary found", "NX disabled", "No PIE", `/opt/services/${n}`)
        : row(...variants[k++], `/opt/services/${n}`)));
      const table = `$ checksec --dir=/opt/services\n\n${row("RELRO", "STACK CANARY", "NX", "PIE", "FILE")}\n${rows.join("\n")}\n`;
      const guarded = `0000000000401196 <greet>:
  401196:	push   rbp
  401197:	mov    rbp,rsp
  40119a:	sub    rsp,0x50
  40119e:	mov    rax,QWORD PTR fs:0x28          ; load the canary
  4011a7:	mov    QWORD PTR [rbp-0x8],rax        ; store it above the buffer
  4011ab:	xor    eax,eax
  4011ad:	lea    rax,[rbp-0x50]                 ; the buffer now sits BELOW the canary
  4011b1:	mov    edx,0x200
  4011b6:	mov    rsi,rax
  4011b9:	mov    edi,0x0
  4011be:	call   401060 <read@plt>
  4011c3:	lea    rax,[rbp-0x50]
  4011c7:	mov    rsi,rax
  4011ca:	lea    rax,[rip+0xe33]        # 402004
  4011d1:	mov    rdi,rax
  4011d4:	mov    eax,0x0
  4011d9:	call   401050 <printf@plt>
  4011de:	nop
  4011df:	mov    rax,QWORD PTR [rbp-0x8]        ; read the canary back
  4011e3:	sub    rax,QWORD PTR fs:0x28          ; compare with the original
  4011ec:	je     4011f3 <greet+0x5d>
  4011ee:	call   401040 <__stack_chk_fail@plt>  ; mismatch: abort
  4011f3:	leave
  4011f4:	ret
`;
      return { _bad: bad, files: [
        { name: "checksec.txt", kind: "text", note: "Mitigation audit of the services directory.", data: table },
        asm("guarded.s", "greet() rebuilt with -fstack-protector: real gcc output, comments added.", guarded),
      ] };
    },
    check(input, ctx, env) { return norm.text(input).split("/").pop() === env._bad; },
    debrief: `One service had no canary, an executable stack and fixed load addresses: every mitigation that stands between a stack overflow and code execution was missing. The others had small gaps (partial RELRO, no PIE) worth fixing but far less urgent.

In \`guarded.s\` the overflow is **still there** (\`read\` of 0x200 bytes into a 0x48-byte space). The canary doesn't prevent the write; it turns silent control-flow hijack into a detected crash. Mitigations buy time and reduce impact. The fix is still correct code.

### How defenders apply this
- Make hardened flags the build default: \`-fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIE -pie -Wl,-z,relro,-z,now\`.
- Run \`checksec\` (or equivalent) in CI and fail builds that regress.
- Prioritise: internet-facing, privileged or legacy binaries with missing mitigations go first.
- Remember the layers: mitigations, then sandboxing and least privilege, then patching.

**On the exam:** ASLR, DEP/NX and stack canaries are tested by name in Security+, CySA+, PenTest+ and CISSP.`,
  },

  {
    id: "asm-arm",
    title: "The Same Ideas on ARM",
    level: 3,
    slug: "aarch64_is_readable_too",
    time: 12,
    certs: ["PenTest+", "CEH", "GSEC"],
    objective: "This function was compiled for a 64-bit ARM device. Trace the call and submit the value returned in w0.",
    answerLabel: "Value in w0",
    answerPlaceholder: "decimal or 0x hex",
    lesson: `Phones, tablets, routers, cameras, smart devices and Apple-silicon Macs don't run x86. They run **ARM**, and firmware analysis means reading it. The good news: every concept carries over. Only the names change.

| Concept | x86-64 | AArch64 (64-bit ARM) |
|---|---|---|
| General registers | \`rax\`, \`rdi\`, \`rsi\`… | \`x0\`–\`x30\` (64-bit); \`w0\`–\`w30\` are their low 32 bits |
| Arguments | \`rdi\`, \`rsi\`, \`rdx\`, \`rcx\`… | \`x0\`–\`x7\` |
| Return value | \`rax\` | \`x0\` |
| Stack pointer | \`rsp\` | \`sp\` |
| Call / return | \`call\` pushes the return address | \`bl\` puts it in register \`x30\` (the *link register*); \`ret\` jumps there |
| Compare / branch | \`cmp\` + \`je\`, \`jne\` | \`cmp\` + \`b.eq\`, \`b.ne\` |

### What looks different
- **Three operands**: \`add w0, w1, w2\` means w0 = w1 + w2. Destination first, and the sources are untouched.
- **Load/store only**: arithmetic never touches memory directly. \`ldr\` loads from memory into a register, \`str\` stores a register to memory: \`str w0, [sp, #12]\` writes w0 to the stack at sp + 12.
- Constants are written with \`#\`. \`lsl w1, w0, #1\` is "shift left 1" (multiply by 2).
- Every instruction is exactly 4 bytes, so addresses go up in steps of 4.

Because the return address lives in a register, a leaf function doesn't need to touch the stack to return. Functions that call others save \`x30\` on the stack, where an overflow can reach it just as on x86. The same bug classes apply, and ARM adds its own mitigations (pointer authentication signs that saved return address).

### Your task
\`score.s\` shows \`main\` calling \`score\`. The first argument travels in \`w0\`, the second in \`w1\`, and the result comes back in \`w0\`. Trace it and submit the returned value.`,
    hints: ["In main, the two mov instructions before bl set the arguments: w0 is the first, w1 the second.", "Inside score both are stored to the stack and loaded back. lsl #1 doubles a value.", "The final add puts (first × 2) + second into w0. Convert the hex constants first."],
    workspace: { type: "files" },
    setup(ctx) {
      const a = ctx.int(0x11, 0x4f), b = ctx.int(3, 0x2f);
      const listing = `0000000000400580 <score>:
  400580:	sub	sp, sp, #0x10          // reserve 16 bytes of stack
  400584:	str	w0, [sp, #12]          // save 1st argument
  400588:	str	w1, [sp, #8]           // save 2nd argument
  40058c:	ldr	w0, [sp, #12]
  400590:	lsl	w1, w0, #1
  400594:	ldr	w0, [sp, #8]
  400598:	add	w0, w1, w0
  40059c:	add	sp, sp, #0x10          // release the stack space
  4005a0:	ret

00000000004005a4 <main>:
  4005a4:	stp	x29, x30, [sp, #-16]!  // save frame pointer and link register
  4005a8:	mov	x29, sp
  4005ac:	mov	w1, #${hx(b)}
  4005b0:	mov	w0, #${hx(a)}
  4005b4:	bl	400580 <score>
  4005b8:	ldp	x29, x30, [sp], #16    // restore them
  4005bc:	ret
`;
      return { _v: a * 2 + b, files: [asm("score.s", "AArch64 disassembly from a router firmware image.", listing)] };
    },
    check(input, ctx, env) { return norm.num(input) === env._v; },
    debrief: `\`main\` loaded the two arguments into \`w0\` and \`w1\` and branched with \`bl\`. \`score\` spilled them to its stack frame, reloaded the first, doubled it with a shift, reloaded the second and added: \`return a * 2 + b;\`.

Notice \`main\`'s first and last lines: \`stp x29, x30, [sp, #-16]!\` saves the frame pointer and the **link register** (the return address) on the stack, and \`ldp\` restores them. That saved \`x30\` is ARM's equivalent of x86's on-stack return address, and what a stack overflow in \`main\` would reach.

### Why this matters
- **IoT and mobile** are overwhelmingly ARM; firmware audits, router CVE analysis and mobile malware reversing all need it.
- The methodology never changes: find the prologue, the arguments, the calls to dangerous functions, the compares.
- Other architectures you may meet (MIPS in older routers, RISC-V in newer embedded devices) follow the same load/store, three-operand style, so ARM reading skills transfer directly.

**On the exam:** PenTest+ and CEH include IoT/embedded and mobile targets; recognising the architecture and reading basic disassembly is the entry skill.`,
  },
];
