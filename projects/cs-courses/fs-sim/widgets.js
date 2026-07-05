/* ============================== fs-sim/widgets.js ==============================
   Every renderable "tool": the tree explorer, terminal panel, permissions
   lab, inode explorer, links lab, process/FD lab, mounts lab, storage lab,
   and the challenges panel. Also registers all of their click/change/input
   handlers with the shared Actions dispatcher.

   registerActions(engine) must be called once, before Engine.render().
==================================================================================== */
window.FsWidgets = (function () {
  const M = window.FsModel;
  const icon = window.Icons.icon;
  const esc = window.Utils.esc;
  let ENGINE = null;

  /* --------------------------------- Explorer (tree + detail) --------------------------------- */
  function renderTreeRow(node, path, connector) {
    const state = ENGINE.state;
    const isDir = node.type === "dir";
    const isOpen = !!state.expanded[path];
    const selected = state.selectedPath === path;
    const iconName = isDir ? (isOpen ? "folderOpen" : "folder") : node.type === "symlink" ? "fileSymlink" : "fileText";
    const iconClass = isDir ? "dir" : node.type === "symlink" ? "sym" : "file";
    return `<div class="tree-row ${selected ? "selected" : ""}" data-select="${esc(path)}" draggable="true" data-drag-path="${esc(path)}" ${isDir ? `data-dropzone="${esc(path)}"` : ""}>
      <span class="connector mono">${connector}</span>
      ${isDir ? `<span class="caret" data-toggle="${esc(path)}">${icon(isOpen ? "chevronDown" : "chevronRight", 12)}</span>` : `<span class="caret spacer"></span>`}
      <span class="${iconClass}">${icon(iconName, 14)}</span>
      <span class="name mono ${node.name.startsWith(".") ? "hidden-file" : ""}">${esc(node.name || "/")}</span>
      ${node.type === "symlink" ? `<span class="arrow-target mono">&rarr; ${esc(node.target)}</span>` : ""}
      ${node.links > 1 ? `<span class="pill teal">hardlink &times;${node.links}</span>` : ""}
    </div>`;
  }

  function renderTree(root) {
    const state = ENGINE.state;
    let html = renderTreeRow(root, "/", "");
    const walk = (node, path, ancestorsLast) => {
      if (!node.children || !state.expanded[path]) return "";
      let out = "";
      node.children.forEach((child, i) => {
        const last = i === node.children.length - 1;
        const childPath = M.joinPath(path, child.name);
        const connector = ancestorsLast.map((l) => (l ? "   " : "\u2502  ")).join("") + (last ? "\u2514\u2500\u2500 " : "\u251c\u2500\u2500 ");
        out += renderTreeRow(child, childPath, connector);
        out += walk(child, childPath, ancestorsLast.concat(last));
      });
      return out;
    };
    html += walk(root, "/", []);
    return html;
  }

  function renderDetailPanel(path) {
    const state = ENGINE.state;
    const node = M.getNode(state.fs, path);
    if (!node) return `<div class="panel"><div class="empty-hint">select a node to inspect</div></div>`;
    const brokenLink = node.type === "symlink" && !M.resolveTarget(state.fs, path, node.target);
    return `<div class="panel">
      <div class="panel-header">
        <span class="title mono">${icon(node.type === "dir" ? "folder" : node.type === "symlink" ? "fileSymlink" : "fileText", 15)} ${esc(path)}</span>
        ${node.type === "symlink" ? (brokenLink ? `<span class="pill coral">broken link</span>` : `<span class="pill teal">resolves ok</span>`) : ""}
      </div>
      <div class="panel-body">
        <div class="permline">${esc(M.fullPermString(node))} ${node.links} ${esc(node.owner)} ${esc(node.group)} ${M.fmtSize(node.size)} ${esc(node.mtime)} ${esc(node.name)}</div>
        <div class="info-grid">
          <div><span class="k">owner</span><span class="v">${esc(node.owner)}</span></div>
          <div><span class="k">group</span><span class="v">${esc(node.group)}</span></div>
          <div><span class="k">inode</span><span class="v">${node.inode}</span></div>
          <div><span class="k">hard links</span><span class="v">${node.links}</span></div>
          <div><span class="k">size</span><span class="v">${M.fmtSize(node.size)}</span></div>
          <div><span class="k">modified</span><span class="v">${esc(node.mtime)}</span></div>
        </div>
        ${node.type === "symlink" ? `<div class="symlink-row mono" style="background:${brokenLink ? "var(--coral-soft)" : "var(--teal-soft)"};color:${brokenLink ? "var(--coral)" : "var(--teal)"}">${icon(brokenLink ? "alertTriangle" : "link2", 13)} &rarr; ${esc(node.target)} ${brokenLink ? "(target not found)" : ""}</div>` : ""}
      </div>
    </div>`;
  }

  function renderExplorerFull() {
    const state = ENGINE.state;
    return `<div class="explorer-grid">
      <div class="panel">
        <div class="panel-header"><span class="title mono">${icon("compass", 15)} / — visual filesystem explorer</span><span class="mono" style="font-size:11px;color:var(--text-dim)">drag a node onto a folder to move it</span></div>
        <div class="tree-scroll">${renderTree(state.fs)}</div>
      </div>
      <div>${renderDetailPanel(state.selectedPath)}</div>
    </div>`;
  }

  function renderExplorerEmbed() {
    const state = ENGINE.state;
    return `<div class="panel"><div class="panel-header"><span class="title mono">${icon("compass", 15)} filesystem tree</span></div><div class="tree-scroll" style="max-height:260px">${renderTree(state.fs)}</div></div><div style="margin-top:10px">${renderDetailPanel(state.selectedPath)}</div>`;
  }

  /* --------------------------------- Terminal --------------------------------- */
  function renderTerminalAndDetail() {
    const state = ENGINE.state;
    return `<div class="explorer-grid"><div>${renderTerminal()}</div><div>${renderDetailPanel(state.selectedPath)}</div></div>`;
  }

  function renderTerminal() {
    const state = ENGINE.state;
    const quick = ["ls -l", "mv notes.txt docs/", "chmod 700 secret.key", "ln -s notes.txt shortcut"];
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("terminal", 15)} terminal</span><span class="pill accent mono">${esc(state.cwd)}</span></div>
      <div id="term-history" class="terminal-body">
        ${state.termHistory.map((h) => `<div class="term-line ${h.type} mono">${esc(h.text)}</div>`).join("")}
        <div class="term-prompt-row">
          <span class="prompt mono">khaled@sim:${esc(state.cwd)}$</span>
          <input id="term-input" type="text" autocomplete="off" spellcheck="false" />
          <span class="blink mono" style="color:var(--accent)">&#9608;</span>
        </div>
      </div>
      <div class="term-quick">${quick.map((q) => `<button data-quickcmd="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    </div>`;
  }

  /* ----------------------------- Permissions lab ----------------------------- */
  function renderPermBits(perm9, editable) {
    const groups = [{ label: "Owner", off: 0 }, { label: "Group", off: 3 }, { label: "Others", off: 6 }];
    const bits = ["r", "w", "x"];
    const bitLabel = { r: "Read", w: "Write", x: "Execute" };
    return `<div class="perm-groups">${groups.map((g) => `
      <div class="perm-group"><div class="glabel">${g.label}</div>
        ${bits.map((b, bi) => {
          const idx = g.off + bi;
          const on = perm9[idx] !== "-";
          return `<div class="perm-bit" ${editable ? `data-permtoggle="${idx}"` : ""}>
            <span class="box ${on ? "on" : ""}">${on ? icon("check", 11) : ""}</span>
            <span style="color:${on ? "var(--text-primary)" : "var(--text-dim)"}">${bitLabel[b]}</span>
          </div>`;
        }).join("")}
      </div>`).join("")}</div>`;
  }

  function renderPermissionsLab() {
    const state = ENGINE.state;
    const files = M.flatten(state.fs).filter((f) => f.path !== "/");
    const path = (state.permDraft && M.getNode(state.fs, state.permDraft.path)) ? state.permDraft.path
      : (state.selectedPath && M.getNode(state.fs, state.selectedPath) ? state.selectedPath : files[0].path);
    const node = M.getNode(state.fs, path);
    if (!state.permDraft || state.permDraft.path !== path) state.permDraft = { path, perm: node.perms };
    const draft = state.permDraft.perm;
    const dirty = draft !== node.perms;
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("lock", 15)} permissions visualizer</span></div>
      <div class="panel-body">
        <select data-permpath>${files.map((f) => `<option value="${esc(f.path)}" ${f.path === path ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
        <div style="height:14px"></div>
        ${renderPermBits(draft, true)}
        <div class="perm-apply-row">
          <div class="permline" style="margin:0">${M.typeChar(node)}${draft} <span style="color:var(--text-dim)">(${M.permToOctal(draft)})</span></div>
          <button class="btn accent" data-apply-chmod ${dirty ? "" : "disabled"}>Apply chmod ${M.permToOctal(draft)}</button>
        </div>
        <p class="perm-note">Toggle a bit to see the permission string and octal mode update live, exactly like editing the mode with <span class="mono">chmod</span>.</p>
      </div>
    </div>`;
  }

  /* ------------------------------- Inode explorer ------------------------------- */
  function computeAllocatedBlocks(node) {
    const blockSize = 4096, totalBlocks = 24;
    const usedBlocks = node.type === "dir" ? 1 : Math.max(1, Math.min(totalBlocks - 2, Math.ceil(node.size / blockSize)));
    const allocated = new Set();
    let s = node.inode;
    while (allocated.size < usedBlocks) {
      s = (s * 1103515245 + 12345) % 2147483648;
      allocated.add(s % totalBlocks);
    }
    return { allocated, totalBlocks, usedBlocks, blockSize };
  }

  function renderInodeDiagram(node) {
    const { allocated, totalBlocks, usedBlocks, blockSize } = computeAllocatedBlocks(node);
    let blocks = "";
    for (let i = 0; i < totalBlocks; i++) {
      const on = allocated.has(i);
      blocks += `<div class="block" title="${on ? "allocated block" : "free block"}" style="background:${on ? "var(--teal)" : "var(--bg-raised)"};border:1px solid ${on ? "var(--teal)" : "var(--border)"};opacity:${on ? 0.9 : 0.5}"></div>`;
    }
    return `<div class="inode-diagram">
      <div class="inode-badge mono">inode ${node.inode}</div>
      <div style="width:1px;height:20px;background:var(--border)"></div>
      <div class="inode-blocks">${blocks}</div>
      <div class="inode-caption">${usedBlocks} block${usedBlocks !== 1 ? "s" : ""} &times; ${blockSize}B on disk</div>
    </div>`;
  }

  function renderInodeExplorer() {
    const state = ENGINE.state;
    const files = M.flatten(state.fs).filter((f) => f.path !== "/");
    const path = state.selectedPath && M.getNode(state.fs, state.selectedPath) ? state.selectedPath : files[0].path;
    const node = M.getNode(state.fs, path);
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("database", 15)} inode explorer</span></div>
      <div class="panel-body inode-grid">
        <div>
          <select data-inodepath>${files.map((f) => `<option value="${esc(f.path)}" ${f.path === path ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
          <div class="info-grid" style="margin-top:14px">
            <div><span class="k">inode number</span><span class="v">${node.inode}</span></div>
            <div><span class="k">hard links</span><span class="v">${node.links}</span></div>
            <div><span class="k">permissions</span><span class="v">${esc(M.fullPermString(node))}</span></div>
            <div><span class="k">owner:group</span><span class="v">${esc(node.owner)}:${esc(node.group)}</span></div>
            <div><span class="k">size</span><span class="v">${M.fmtSize(node.size)}</span></div>
            <div><span class="k">modified</span><span class="v">${esc(node.mtime)}</span></div>
          </div>
          <p class="perm-note">The filename <span class="mono">${esc(node.name)}</span> is just a directory entry pointing at inode ${node.inode}. The inode holds the real metadata and pointers to the data blocks on disk.</p>
        </div>
        <div class="inode-diagram-box">${renderInodeDiagram(node)}</div>
      </div>
    </div>`;
  }

  /* --------------------------------- Links lab --------------------------------- */
  function renderLinksLab() {
    const state = ENGINE.state;
    const files = M.flatten(state.fs).filter((f) => f.path !== "/");
    const dirs = M.flatten(state.fs).filter((f) => f.node.type === "dir");
    if (!state.links.target) state.links.target = files[0].path;
    const { target, dir, name, mode, msg } = state.links;
    const targetNode = M.getNode(state.fs, target);
    const visual = mode === "symbolic" ? `
      <div class="link-flow">
        <div class="link-box mono" style="border-color:var(--accent);color:var(--accent)">${esc(name || "shortcut")}</div>
        <div class="caption mono">points to path ${icon("chevronDown", 16)}</div>
        <div class="link-box mono" style="border-color:var(--teal);color:var(--teal)">${esc(target || "target")}</div>
        <div class="desc">A symlink stores a path string. Delete the target and the link breaks.</div>
      </div>` : `
      <div class="link-flow">
        <div class="hardlink-pair">
          <div class="link-box mono" style="border-color:var(--teal);color:var(--teal)">${esc(targetNode ? targetNode.name : "")}</div>
          <div class="link-box mono" style="border-color:var(--teal);color:var(--teal)">${esc(name || "link")}</div>
        </div>
        ${icon("chevronDown", 16)}
        <div class="inode-badge mono">inode ${targetNode ? targetNode.inode : "?"}</div>
        <div class="desc">Two directory entries, one inode. Data is only freed once every hard link is removed.</div>
      </div>`;
    return `<div class="links-grid">
      <div class="panel">
        <div class="panel-header"><span class="title mono">${icon("link2", 15)} links lab — create a link</span></div>
        <div class="panel-body">
          <div class="mode-toggle">
            <button data-linkmode="symbolic" class="${mode === "symbolic" ? "active" : ""}">Symbolic link</button>
            <button data-linkmode="hard" class="${mode === "hard" ? "active" : ""}">Hard link</button>
          </div>
          <label class="field-label mono">target</label>
          <select data-linktarget>${files.map((f) => `<option value="${esc(f.path)}" ${f.path === target ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
          <label class="field-label mono">create in directory</label>
          <select data-linkdir>${dirs.map((f) => `<option value="${esc(f.path)}" ${f.path === dir ? "selected" : ""}>${esc(f.path)}</option>`).join("")}</select>
          <label class="field-label mono">link name</label>
          <input type="text" id="link-name-input" value="${esc(name)}" />
          <div style="height:14px"></div>
          <button class="btn accent block" data-createlink>Create ${mode} link</button>
          ${msg ? `<div class="links-msg mono" style="background:${msg.ok ? "var(--teal-soft)" : "var(--coral-soft)"};color:${msg.ok ? "var(--teal)" : "var(--coral)"}">${esc(msg.text)}</div>` : ""}
        </div>
      </div>
      <div class="panel"><div class="links-visual">${visual}</div></div>
    </div>`;
  }

  /* --------------------------------- Process / FD lab --------------------------------- */
  function renderProcessLab() {
    const state = ENGINE.state;
    const files = M.flatten(state.fs).filter((f) => f.node.type !== "dir");
    const selPid = state.selectedProcess || state.processes[0].pid;
    const proc = state.processes.find((p) => p.pid === selPid) || state.processes[0];
    const orphanSet = new Set(state.processes.filter((p) => p.ppid !== null && !state.processes.some((q) => q.pid === p.ppid)).map((p) => p.pid));
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("cpu", 15)} process &amp; file descriptor lab</span></div>
      <div class="panel-body fd-grid">
        <div class="proc-list">
          ${state.processes.map((p) => `<div class="proc-card ${p.pid === selPid ? "selected" : ""} ${orphanSet.has(p.pid) ? "orphan" : ""}" data-selectproc="${p.pid}">
            <div><span class="pid">pid ${p.pid}</span></div>
            <div>${esc(p.name)}</div>
            <div style="color:var(--text-dim)">ppid: ${p.ppid === null ? "—" : p.ppid}${orphanSet.has(p.pid) ? " ⚠" : ""}</div>
          </div>`).join("")}
        </div>
        <div>
          <table class="fd-table">
            <thead><tr><th>fd</th><th>points to</th><th></th></tr></thead>
            <tbody>
              ${proc.fds.length ? proc.fds.map((f) => `<tr><td>${f.fd}</td><td>${esc(f.target)}</td><td><button data-dupfd="${f.fd}">duplicate</button><button data-closefd="${f.fd}">close</button></td></tr>`).join("") : `<tr><td colspan="3" style="color:var(--text-dim)">no open descriptors</td></tr>`}
            </tbody>
          </table>
          <div class="fd-controls">
            <select data-fdopenpath>${files.map((f) => `<option value="${esc(f.path)}">${esc(f.path)}</option>`).join("")}</select>
            <button class="btn accent" data-openfd>Open file &rarr; new fd</button>
          </div>
          <p class="perm-note">Every open file gets a small integer handle (a file descriptor) that belongs to this process. fd 0, 1, and 2 are reserved by convention for input, output, and errors.</p>
        </div>
      </div>
    </div>`;
  }

  /* --------------------------------- Mounts lab --------------------------------- */
  function renderMountsLab() {
    const state = ENGINE.state;
    const mounted = state.mounts.filter((d) => d.point);
    const unmounted = state.mounts.filter((d) => !d.point);
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("server", 15)} mounts lab</span></div>
      <div class="panel-body">
        <div class="mount-list">
          ${mounted.map((m) => `<div class="mount-card">
            <div class="mount-card-top">
              <span class="point">${esc(m.point)}</span>
              <span class="mono" style="color:var(--text-dim)">${esc(m.device)} &middot; ${esc(m.fstype)}${m.virtual ? " &middot; virtual" : ""}</span>
              ${(!m.virtual && m.point !== "/") ? `<button class="btn" data-unmount="${esc(m.point)}">unmount</button>` : ""}
            </div>
            ${!m.virtual ? `<div class="mount-usage-bar"><div style="width:${Math.round((m.used / m.total) * 100)}%"></div></div>
              <div class="mono" style="font-size:11px;color:var(--text-dim);margin-top:4px">${M.fmtSize(m.used)} used of ${M.fmtSize(m.total)}</div>`
              : `<div class="mono" style="font-size:11px;color:var(--text-dim)">generated by the kernel, not stored on disk</div>`}
          </div>`).join("")}
        </div>
        <div style="height:16px"></div>
        <div class="panel-header" style="border:none;padding:0 0 10px"><span class="title mono">${icon("hardDrive", 13)} available devices</span></div>
        ${unmounted.length ? unmounted.map((d) => `<div class="device-card">
          <span>${esc(d.label)} — ${esc(d.device)} (${esc(d.fstype)}, ${M.fmtSize(d.total)})</span>
          <span style="display:flex;gap:6px;align-items:center">
            <input type="text" id="mount-point-${esc(d.id)}" placeholder="/mnt/usb" style="width:140px" />
            <button class="btn accent" data-mountdevice="${esc(d.id)}">mount</button>
          </span>
        </div>`).join("") : `<p class="perm-note">No unmounted devices right now — unmount one above to make it available again.</p>`}
        <p class="perm-note">Mounting attaches a filesystem to a directory. Until then, that device isn't reachable through the tree at all.</p>
      </div>
    </div>`;
  }

  /* --------------------------------- Storage lab --------------------------------- */
  function renderStorageLab() {
    const state = ENGINE.state;
    const root = state.fs;
    const topDirs = root.children.filter((c) => c.type === "dir").map((c) => ({ name: c.name, size: M.computeDirSize(c) }));
    const totalUsed = topDirs.reduce((a, b) => a + b.size, 0);
    const files = M.flatten(state.fs).filter((f) => f.node.type === "file").sort((a, b) => b.node.size - a.node.size).slice(0, 5);
    const palette = ["#E8A33D", "#4FB8A6", "#D1616B", "#7B9EE8", "#C792E8", "#E8D34F"];
    const heat = topDirs.map((d, i) => `<div class="heatmap-tile" style="flex:${Math.max(d.size, 1)};background:${palette[i % palette.length]}" title="${esc(d.name)} — ${M.fmtSize(d.size)}">${esc(d.name)}<br>${M.fmtSize(d.size)}</div>`).join("");
    const totalDisk = 200 * 1024 * 1024;
    const usedPct = Math.min(100, Math.round((totalUsed / totalDisk) * 100));
    const totalTiles = 48;
    const usedTiles = Math.round((usedPct / 100) * totalTiles);
    const order = state.storageDefrag ? [...Array(totalTiles).keys()] : window.Utils.seededShuffle(totalTiles, 4242);
    const usedSet = new Set(order.slice(0, usedTiles));
    const frag = Array.from({ length: totalTiles }, (_, i) => `<div class="frag-block" style="background:${usedSet.has(i) ? "var(--teal)" : "var(--bg-raised-2)"};border:1px solid ${usedSet.has(i) ? "var(--teal)" : "var(--border)"}"></div>`).join("");
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("barChart2", 15)} storage visualization</span></div>
      <div class="panel-body">
        <div class="glabel mono" style="color:var(--text-dim);font-size:11px;margin-bottom:6px">usage by top-level directory</div>
        <div class="heatmap">${heat}</div>
        <div style="height:18px"></div>
        <div class="glabel mono" style="color:var(--text-dim);font-size:11px">disk usage</div>
        <div class="usage-bar-lg"><div style="width:${usedPct}%"></div></div>
        <div class="mono" style="font-size:11px;color:var(--text-dim)">${M.fmtSize(totalUsed)} used of ${M.fmtSize(totalDisk)} (${usedPct}%)</div>
        <div style="height:18px"></div>
        <div class="glabel mono" style="color:var(--text-dim);font-size:11px;margin-bottom:6px">largest files</div>
        <div class="largest-list">${files.map((f) => `<div class="largest-row"><span>${esc(f.path)}</span><span style="color:var(--accent)">${M.fmtSize(f.node.size)}</span></div>`).join("")}</div>
        <div style="height:18px"></div>
        <div class="glabel mono" style="color:var(--text-dim);font-size:11px;margin-bottom:6px">block fragmentation (simulated)</div>
        <div class="frag-blocks">${frag}</div>
        <div style="margin-top:10px"><button class="btn" data-defrag>${state.storageDefrag ? "Scatter blocks" : "Defragment"}</button></div>
      </div>
    </div>`;
  }

  /* --------------------------------- Challenges lab --------------------------------- */
  function challengeItems() {
    const state = ENGINE.state;
    const files = M.flatten(state.fs).filter((f) => f.path !== "/");
    const largest = files.reduce((a, b) => (b.node.size > a.node.size ? b : a), files[0]);
    const broken = files.find((f) => f.node.type === "symlink" && !M.resolveTarget(state.fs, f.path, f.node.target));
    const hidden = files.find((f) => f.node.name.startsWith("."));
    const worldWritable = files.find((f) => f.node.type === "file" && f.node.perms[7] === "w");
    const orphan = state.processes.find((p) => p.ppid !== null && !state.processes.some((q) => q.pid === p.ppid));
    return [
      { key: "largest", title: "Find the largest file", hint: "Compare sizes across every directory.", answer: largest ? largest.path : null, type: "path" },
      { key: "broken", title: "Find the broken symbolic link", hint: "A symlink whose target no longer resolves.", answer: broken ? broken.path : null, type: "path" },
      { key: "hidden", title: "Find the hidden file", hint: "Dotfiles don't show up in a plain ls.", answer: hidden ? hidden.path : null, type: "path" },
      { key: "worldwritable", title: "Find the world-writable file", hint: "Anyone — not just the owner or group — can write to it.", answer: worldWritable ? worldWritable.path : null, type: "path" },
      { key: "orphan", title: "Find the orphaned process", hint: "Its parent process no longer exists.", answer: orphan ? String(orphan.pid) : null, type: "process" }
    ];
  }

  function renderChallengesLab() {
    const state = ENGINE.state;
    const items = challengeItems();
    const files = M.flatten(state.fs).filter((f) => f.path !== "/");
    return `<div class="panel">
      <div class="panel-header"><span class="title mono">${icon("trophy", 15)} challenges</span></div>
      <div class="panel-body"><div class="challenge-grid">
        ${items.map((item) => {
          const currentAns = state.challengeAnswers[item.key] || "";
          const result = state.challengeResult[item.key];
          const options = item.type === "path"
            ? files.map((f) => `<option value="${esc(f.path)}" ${f.path === currentAns ? "selected" : ""}>${esc(f.path)}</option>`).join("")
            : state.processes.map((p) => `<option value="${p.pid}" ${String(p.pid) === currentAns ? "selected" : ""}>pid ${p.pid} — ${esc(p.name)}</option>`).join("");
          return `<div class="panel challenge-card">
            <div class="challenge-title">${icon("trophy", 14)} ${esc(item.title)}</div>
            <div class="challenge-hint">${esc(item.hint)}</div>
            <select data-challengesel="${item.key}"><option value="">choose…</option>${options}</select>
            <button class="btn" data-challengecheck="${item.key}">Check answer</button>
            ${result !== undefined ? `<div class="challenge-result mono" style="background:${result ? "var(--teal-soft)" : "var(--coral-soft)"};color:${result ? "var(--teal)" : "var(--coral)"}">${icon(result ? "check" : "x", 12)} ${result ? "Correct." : "Not quite — try again."}</div>` : ""}
          </div>`;
        }).join("")}
      </div></div>
    </div>`;
  }

  /* --------------------------------- widget dispatcher --------------------------------- */
  // used for widgets embedded inline inside lesson subsections
  function renderLessonWidget(key) {
    switch (key) {
      case "terminal": return renderTerminal();
      case "explorer": return renderExplorerEmbed();
      case "perm": return renderPermissionsLab();
      case "permissions": return renderPermissionsLab();
      case "inode": return renderInodeExplorer();
      case "links": return renderLinksLab();
      case "fd": return renderProcessLab();
      case "mounts": return renderMountsLab();
      case "storage": return renderStorageLab();
      case "challenges": return renderChallengesLab();
      default: return "";
    }
  }

  // used for the Sandbox tab bar, where explorer/terminal get their full two-column layout
  function renderSandboxWidget(key) {
    if (key === "explorer") return renderExplorerFull();
    if (key === "terminal") return renderTerminalAndDetail();
    return renderLessonWidget(key);
  }

  /* --------------------------------- action wiring --------------------------------- */
  function registerActions(engine) {
    ENGINE = engine;
    window.FsTerminal.init(engine);
    const Actions = window.Actions;
    const state = () => ENGINE.state;
    const selectedProc = () => state().processes.find((p) => p.pid === (state().selectedProcess || state().processes[0].pid));

    Actions.register("click", "[data-toggle]", (el) => { const p = el.getAttribute("data-toggle"); state().expanded[p] = !state().expanded[p]; ENGINE.render(); });
    Actions.register("click", "[data-select]", (el) => { state().selectedPath = el.getAttribute("data-select"); ENGINE.render(); });

    Actions.register("click", "[data-quickcmd]", (el) => {
      window.FsTerminal.runCommand(el.getAttribute("data-quickcmd"));
      state()._stickToBottomSelectors = ["#term-history"];
      state()._focusSelector = "#term-input";
      ENGINE.render();
    });
    Actions.register("keydown", (target, e) => (target.id === "term-input" && e.key === "Enter" ? target : null), (el) => {
      window.FsTerminal.runCommand(el.value);
      el.value = "";
      state()._stickToBottomSelectors = ["#term-history"];
      state()._focusSelector = "#term-input";
      ENGINE.render();
    });
    Actions.register("click", "#term-history", () => {
      const inp = document.getElementById("term-input");
      if (inp) inp.focus();
    });

    Actions.register("click", "[data-permtoggle]", (el) => {
      const idx = parseInt(el.getAttribute("data-permtoggle"), 10);
      const bits = ["r", "w", "x"];
      const arr = state().permDraft.perm.split("");
      arr[idx] = arr[idx] === "-" ? bits[idx % 3] : "-";
      state().permDraft.perm = arr.join("");
      ENGINE.render();
    });
    Actions.register("click", "[data-apply-chmod]", () => {
      state().fs = M.updateAtPath(state().fs, state().permDraft.path, (n) => ({ ...n, perms: state().permDraft.perm }));
      ENGINE.render();
    });
    Actions.register("change", "[data-permpath]", (el) => { state().permDraft = null; state().selectedPath = el.value; ENGINE.render(); });
    Actions.register("change", "[data-inodepath]", (el) => { state().selectedPath = el.value; ENGINE.render(); });

    Actions.register("click", "[data-linkmode]", (el) => { state().links.mode = el.getAttribute("data-linkmode"); state().links.msg = null; ENGINE.render(); });
    Actions.register("change", "[data-linktarget]", (el) => { state().links.target = el.value; ENGINE.render(); });
    Actions.register("change", "[data-linkdir]", (el) => { state().links.dir = el.value; ENGINE.render(); });
    Actions.register("input", "#link-name-input", (el) => { state().links.name = el.value; });
    Actions.register("click", "[data-createlink]", () => {
      const s = state();
      const { target, dir, name, mode } = s.links;
      const targetNode = M.getNode(s.fs, target);
      const destPath = M.joinPath(dir, name);
      if (!name) { s.links.msg = { ok: false, text: "Give the link a name." }; ENGINE.render(); return; }
      if (M.getNode(s.fs, destPath)) { s.links.msg = { ok: false, text: `'${name}' already exists there.` }; ENGINE.render(); return; }
      if (mode === "symbolic") {
        const linkNode = M.mk(name, { type: "symlink", perms: "rwxrwxrwx", size: target.length, target });
        s.fs = M.updateAtPath(s.fs, dir, (p) => ({ ...p, children: [...p.children, linkNode] }));
        s.links.msg = { ok: true, text: `Created symlink ${destPath} → ${target}` };
      } else {
        if (targetNode.type === "dir") { s.links.msg = { ok: false, text: "Hard links can't point at directories." }; ENGINE.render(); return; }
        let nf = M.updateAtPath(s.fs, target, (n) => ({ ...n, links: n.links + 1 }));
        const linkNode = { ...targetNode, name, links: targetNode.links + 1 };
        nf = M.updateAtPath(nf, dir, (p) => ({ ...p, children: [...p.children, linkNode] }));
        s.fs = nf;
        s.links.msg = { ok: true, text: `Created hard link ${destPath}, sharing inode ${targetNode.inode}` };
      }
      ENGINE.render();
    });

    Actions.register("click", "[data-selectproc]", (el) => { state().selectedProcess = parseInt(el.getAttribute("data-selectproc"), 10); ENGINE.render(); });
    Actions.register("click", "[data-openfd]", () => {
      const sel = document.querySelector("[data-fdopenpath]");
      const proc = selectedProc();
      if (sel && proc) { const maxFd = proc.fds.length ? Math.max(...proc.fds.map((f) => f.fd)) : -1; proc.fds.push({ fd: maxFd + 1, target: sel.value }); }
      ENGINE.render();
    });
    Actions.register("click", "[data-dupfd]", (el) => {
      const fd = parseInt(el.getAttribute("data-dupfd"), 10);
      const proc = selectedProc();
      const entry = proc.fds.find((f) => f.fd === fd);
      if (entry) { const maxFd = Math.max(...proc.fds.map((f) => f.fd)); proc.fds.push({ fd: maxFd + 1, target: entry.target }); }
      ENGINE.render();
    });
    Actions.register("click", "[data-closefd]", (el) => {
      const fd = parseInt(el.getAttribute("data-closefd"), 10);
      const proc = selectedProc();
      proc.fds = proc.fds.filter((f) => f.fd !== fd);
      ENGINE.render();
    });

    Actions.register("click", "[data-mountdevice]", (el) => {
      const id = el.getAttribute("data-mountdevice");
      const input = document.getElementById(`mount-point-${id}`);
      const val = input ? input.value.trim() : "";
      if (!val || !val.startsWith("/")) return;
      if (state().mounts.some((d) => d.point === val)) return;
      const dev = state().mounts.find((d) => d.id === id);
      if (dev) dev.point = val;
      ENGINE.render();
    });
    Actions.register("click", "[data-unmount]", (el) => {
      const point = el.getAttribute("data-unmount");
      const dev = state().mounts.find((d) => d.point === point);
      if (dev && !dev.virtual && dev.point !== "/") dev.point = null;
      ENGINE.render();
    });

    Actions.register("click", "[data-defrag]", () => { state().storageDefrag = !state().storageDefrag; ENGINE.render(); });

    Actions.register("change", "[data-challengesel]", (el) => { state().challengeAnswers[el.getAttribute("data-challengesel")] = el.value; });
    Actions.register("click", "[data-challengecheck]", (el) => {
      const key = el.getAttribute("data-challengecheck");
      const item = challengeItems().find((i) => i.key === key);
      const ans = state().challengeAnswers[key];
      state().challengeResult[key] = ans !== undefined && ans !== "" && ans === item.answer;
      ENGINE.render();
    });

    /* drag-and-drop for the explorer tree */
    let dragSrcPath = null;
    document.addEventListener("dragstart", (e) => {
      const row = e.target.closest("[data-drag-path]");
      if (row) { dragSrcPath = row.getAttribute("data-drag-path"); e.dataTransfer.setData("text/plain", dragSrcPath); }
    });
    document.addEventListener("dragover", (e) => {
      const zone = e.target.closest("[data-dropzone]");
      if (zone) { e.preventDefault(); zone.classList.add("dragover"); }
    });
    document.addEventListener("dragleave", (e) => {
      const zone = e.target.closest("[data-dropzone]");
      if (zone) zone.classList.remove("dragover");
    });
    document.addEventListener("drop", (e) => {
      const zone = e.target.closest("[data-dropzone]");
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove("dragover");
      const destDir = zone.getAttribute("data-dropzone");
      const srcPath = dragSrcPath || e.dataTransfer.getData("text/plain");
      if (!srcPath || srcPath === "/" || destDir.startsWith(srcPath + "/") || destDir === srcPath) return;
      const s = state();
      const srcNode = M.getNode(s.fs, srcPath);
      if (!srcNode) return;
      const oldParent = M.parentPath(srcPath);
      if (oldParent === destDir) return;
      let nf = M.updateAtPath(s.fs, oldParent, (p) => ({ ...p, children: p.children.filter((c) => c.name !== srcNode.name) }));
      nf = M.updateAtPath(nf, destDir, (p) => ({ ...p, children: [...p.children.filter((c) => c.name !== srcNode.name), srcNode] }));
      s.fs = nf;
      s.expanded[destDir] = true;
      s.selectedPath = M.joinPath(destDir, srcNode.name);
      ENGINE.render();
    });
  }

  return { registerActions, renderSandboxWidget, renderLessonWidget };
})();