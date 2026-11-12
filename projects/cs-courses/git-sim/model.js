/* ============================== git-sim/model.js ==============================
   The repo data model: a commit DAG, branch refs, HEAD, a small simulated
   staging area, and a stash. This is the piece a filesystem simulator or
   bash quiz would NOT reuse — they'd write their own model.js instead.
================================================================================== */
window.GitModel = (function () {
  const WORKSPACE_FILES = ["app.js", "styles.css", "README.md", "index.html"];

  function genHash(seed) {
    let s = (seed * 2654435761) % 4294967296;
    if (s < 0) s += 4294967296;
    return s.toString(16).padStart(8, "0").slice(0, 7);
  }

  function fakeDate(order) {
    const base = new Date(2026, 5, 1); // Jun 1
    const d = new Date(base.getTime() + order * 86400000);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
  }

  function makeRepo() {
    return {
      commits: {},
      branches: {},
      branchLanes: {},
      head: { type: "branch", name: "main" },
      workspace: Object.fromEntries(WORKSPACE_FILES.map((f) => [f, "clean"])),
      stash: [],
      orderCounter: 0,
      conflict: null
    };
  }

  // Branch names come straight from the learner, so every lookup has to be an
  // own-property check: "constructor" / "toString" exist on any plain object.
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const hasBranch = (repo, name) => typeof name === "string" && hasOwn(repo.branches, name);

  function laneFor(repo, branchName) {
    if (!hasOwn(repo.branchLanes, branchName)) repo.branchLanes[branchName] = Object.keys(repo.branchLanes).length;
    return repo.branchLanes[branchName];
  }

  function addCommit(repo, { message, parents, lane, filesChanged, rebasedFrom, author }) {
    const order = repo.orderCounter++;
    const hash = genHash(order + 1000);
    const commit = {
      hash, message, parents: parents || [], lane,
      author: author || "khaled", date: fakeDate(order),
      filesChanged: filesChanged || [], order, rebasedFrom: rebasedFrom || null
    };
    repo.commits[hash] = commit;
    return commit;
  }

  function buildInitialRepo() {
    const repo = makeRepo();
    const mainLane = laneFor(repo, "main");
    const a = addCommit(repo, { message: "Initial commit", parents: [], lane: mainLane, filesChanged: ["README.md"] });
    const b = addCommit(repo, { message: "Add app skeleton", parents: [a.hash], lane: mainLane, filesChanged: ["app.js", "index.html"] });
    const c = addCommit(repo, { message: "Style the homepage", parents: [b.hash], lane: mainLane, filesChanged: ["styles.css"] });
    repo.branches.main = c.hash;

    const featureLane = laneFor(repo, "feature");
    const d = addCommit(repo, { message: "Start signup flow", parents: [b.hash], lane: featureLane, filesChanged: ["app.js"] });
    const e = addCommit(repo, { message: "Finish signup form", parents: [d.hash], lane: featureLane, filesChanged: ["index.html"] });
    repo.branches.feature = e.hash;

    repo.head = { type: "branch", name: "main" };
    return repo;
  }

  /* ------------------------------ ref / graph helpers ------------------------------ */
  function findByPrefix(repo, prefix) {
    if (!prefix) return null;
    const hashes = Object.keys(repo.commits);
    const exact = hashes.find((h) => h === prefix);
    if (exact) return repo.commits[exact];
    const matches = hashes.filter((h) => h.startsWith(prefix));
    return matches.length === 1 ? repo.commits[matches[0]] : (matches.length > 1 ? "ambiguous" : null);
  }

  // Supports NAME, HASH-PREFIX, HEAD, and any chain of ~N / ~ / ^ / ^N
  // suffixes (HEAD~2, main^, HEAD^^, feature~1^2), same as git rev-parse.
  function resolveRef(repo, ref) {
    if (typeof ref !== "string" || !ref) return null;
    const m = ref.match(/^(.*?)([~^]\d*)$/);
    if (m && m[1] !== undefined && (m[1] || ref[0] === "~" || ref[0] === "^")) {
      let hash = resolveRef(repo, m[1] || "HEAD");
      if (!hash || hash === "ambiguous") return hash;
      const n = m[2].length > 1 ? parseInt(m[2].slice(1), 10) : 1;
      if (m[2][0] === "~") {
        for (let i = 0; i < n; i++) {
          const c = repo.commits[hash];
          if (!c || !c.parents.length) return null;
          hash = c.parents[0];
        }
        return hash;
      }
      if (n === 0) return hash;
      const c = repo.commits[hash];
      return c && c.parents[n - 1] ? c.parents[n - 1] : null;
    }
    if (ref === "HEAD") return headHash(repo);
    if (hasBranch(repo, ref)) return repo.branches[ref];
    const found = findByPrefix(repo, ref);
    if (found === "ambiguous") return "ambiguous";
    return found ? found.hash : null;
  }

  function headHash(repo) {
    return repo.head.type === "branch" ? repo.branches[repo.head.name] : repo.head.hash;
  }

  function currentBranchName(repo) {
    return repo.head.type === "branch" ? repo.head.name : null;
  }

  function ancestors(repo, hash) {
    const seen = new Set();
    const stack = [hash];
    while (stack.length) {
      const h = stack.pop();
      if (!h || seen.has(h)) continue;
      seen.add(h);
      const c = repo.commits[h];
      if (c) c.parents.forEach((p) => stack.push(p));
    }
    return seen;
  }

  function isAncestor(repo, maybeAncestorHash, hash) {
    return ancestors(repo, hash).has(maybeAncestorHash);
  }

  // simple LCA: walk ancestors of `a`, then walk ancestors of `b` until hitting one already seen
  function commonAncestor(repo, aHash, bHash) {
    const aSet = ancestors(repo, aHash);
    if (aSet.has(bHash)) return bHash;
    const bSeen = new Set();
    const stack = [bHash];
    while (stack.length) {
      const h = stack.pop();
      if (!h || bSeen.has(h)) continue;
      bSeen.add(h);
      if (aSet.has(h)) return h;
      const c = repo.commits[h];
      if (c) c.parents.forEach((p) => stack.push(p));
    }
    return null;
  }

  // commits reachable from `tip` but NOT reachable from `base`, oldest first
  function commitsSince(repo, base, tip) {
    const baseSet = ancestors(repo, base);
    const result = [];
    const seen = new Set();
    const stack = [tip];
    while (stack.length) {
      const h = stack.pop();
      if (!h || seen.has(h) || baseSet.has(h)) continue;
      seen.add(h);
      result.push(repo.commits[h]);
      repo.commits[h].parents.forEach((p) => stack.push(p));
    }
    return result.sort((x, y) => x.order - y.order);
  }

  function logFrom(repo, hash) {
    const list = Array.from(ancestors(repo, hash)).map((h) => repo.commits[h]);
    return list.sort((a, b) => b.order - a.order);
  }

  function filesTouchedBy(commits) {
    const set = new Set();
    commits.forEach((c) => c.filesChanged.forEach((f) => set.add(f)));
    return set;
  }

  return {
    WORKSPACE_FILES, makeRepo, addCommit, laneFor, hasBranch, buildInitialRepo,
    findByPrefix, resolveRef, headHash, currentBranchName,
    ancestors, isAncestor, commonAncestor, commitsSince, logFrom, filesTouchedBy
  };
})();