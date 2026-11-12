#!/usr/bin/env python3
"""Validate the course against SQLite (the same engine family the app runs on).

Reads the JSON produced by `node test/dump.mjs <seed>` and, for every
challenge: loads the seed data and setup, confirms the challenge is NOT already
solved, runs the reference solution, and confirms it then IS solved.

    node test/dump.mjs SEED > dump.json && python3 test/validate.py dump.json
"""
import json, re, sqlite3, sys
from datetime import date, datetime


def d(s):
    if s is None:
        return None
    m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", str(s))
    return date(int(m[1]), int(m[2]), int(m[3])) if m else None


def date_format(s, f):
    x = d(s)
    if x is None:
        return None
    return f.replace("%Y", f"{x.year}").replace("%m", f"{x.month:02d}").replace("%d", f"{x.day:02d}")


def connect():
    db = sqlite3.connect(":memory:", isolation_level=None)
    fn = db.create_function
    fn("year", 1, lambda s: d(s).year if d(s) else None)
    fn("month", 1, lambda s: d(s).month if d(s) else None)
    fn("day", 1, lambda s: d(s).day if d(s) else None)
    fn("datediff", 2, lambda a, b: (d(a) - d(b)).days if d(a) and d(b) else None)
    fn("date_format", 2, date_format)
    fn("concat", -1, lambda *a: "".join("" if x is None else str(x) for x in a))
    fn("_left", 2, lambda s, n: None if s is None else str(s)[:n])
    fn("now", 0, lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    fn("curdate", 0, lambda: date.today().isoformat())
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("CREATE TABLE _users (user TEXT NOT NULL, host TEXT NOT NULL, PRIMARY KEY (user, host))")
    db.execute("CREATE TABLE _grants (user TEXT NOT NULL, host TEXT NOT NULL, priv TEXT NOT NULL, db TEXT NOT NULL, tbl TEXT NOT NULL, PRIMARY KEY (user, host, priv, db, tbl))")
    db.execute("INSERT INTO _users VALUES ('root', 'localhost')")
    db.execute("INSERT INTO _grants VALUES ('root', 'localhost', 'ALL', '*', '*')")
    return db


def norm(v):
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        r = round(v * 100) / 100
        return str(int(r)) if r == int(r) else repr(r)
    return str(v)


def rows(db, stmts):
    cur = None
    for s in stmts:
        cur = db.execute(s)
    return [tuple(norm(v) for v in r) for r in cur.fetchall()], [c[0] for c in (cur.description or [])]


def probe(db, fn):
    db.execute("SAVEPOINT _chk")
    try:
        return fn()
    except sqlite3.Error:
        return False
    finally:
        db.execute("ROLLBACK TO _chk")
        db.execute("RELEASE _chk")


def scalar(db, stmts):
    r, _ = rows(db, stmts)
    return r[0][0] if r else "NULL"


def plan(db, sql):
    return "\n".join(str(r[3]) for r in db.execute("EXPLAIN QUERY PLAN " + sql).fetchall())


def check(db, c):
    if c["stat"]:
        return None  # transaction counters live in the JS session; not checkable here
    if c["plan"]:
        return bool(re.search(c["uses"], plan(db, c["plan"]), re.I))

    def run():
        for s in c["pre"]:
            db.execute(s)
        if c["rejects"]:
            try:
                for s in c["rejects"]:
                    db.execute(s)
                return False
            except sqlite3.IntegrityError:
                return True
        if c["sql"]:
            return scalar(db, c["sql"]) == c["_is"]
        return True

    return probe(db, run)


def main(path):
    data = json.load(open(path))
    bad = 0
    for ch in data["challenges"]:
        db = connect()
        for s in data["shop"] + ch["setup"]:
            db.execute(s)
        problems, info = [], ""
        if ch["setup"] != ch["setupAgain"]:
            problems.append("setup is not repeatable")
        try:
            if ch["mode"] == "find":
                r, _ = rows(db, ch["solution"])
                hits = sum(ch["flag"] in cell for row in r for cell in row)
                info = f"{len(r)} rows, flag appears {hits}x"
                if hits != 1:
                    problems.append("flag not found exactly once")
            elif ch["mode"] == "match":
                r, cols = rows(db, ch["solution"])
                info = f"{len(r)} rows x {len(cols)} cols"
                if not r:
                    problems.append("target result is empty")
                if len(set(r)) == 1 and len(r) > 1:
                    problems.append("all target rows identical")
                starter = [s for s in ch["starter"] if s]
                if starter:
                    try:
                        sr, _ = rows(db, starter[-1])
                        same = sorted(sr) == sorted(r) and (not ch["ordered"] or sr == r)
                        if same and not ch["mustUse"]:
                            problems.append("starter query already solves it")
                        if ch["mustUse"] and not same:
                            problems.append("starter should return the target rows")
                    except sqlite3.Error as e:
                        problems.append(f"starter fails: {e}")
                if ch["mustUse"]:
                    if not re.search(ch["mustUse"], plan(db, ch["solution"][-1]), re.I):
                        problems.append("solution plan does not satisfy mustUse: " + plan(db, ch["solution"][-1]))
                    if starter and re.search(ch["mustUse"], plan(db, starter[-1][-1]), re.I):
                        problems.append("starter plan already satisfies mustUse")
                    info += " | starter plan: " + plan(db, starter[-1][-1])
            else:
                for c in ch["checks"]:
                    c["_is"] = norm(c["is"]) if c["expect"] is None else probe(db, lambda: scalar(db, c["expect"]))
                    if c["_is"] is False:
                        problems.append(f"expect failed to evaluate: {c['label']}")
                before = [check(db, c) for c in ch["checks"]]
                if all(b in (True, None) for b in before):
                    problems.append("already passes before the solution")
                for s in ch["solution"]:
                    db.execute(s)
                after = [check(db, c) for c in ch["checks"]]
                for c, ok in zip(ch["checks"], after):
                    if ok is False:
                        problems.append(f"check fails after solution: {c['label']}")
                info = "before " + "".join("?" if b is None else "Y" if b else "n" for b in before) + " after " + "".join("?" if b is None else "Y" if b else "n" for b in after)
                info += " | " + ", ".join(str(c["_is"]) for c in ch["checks"] if c["expect"])
        except sqlite3.Error as e:
            problems.append(f"SQL error: {e}")
        bad += bool(problems)
        print(f"{'FAIL' if problems else 'ok  '} {ch['id']:<14} {ch['mode']:<6} {info}")
        for p in problems:
            print("       -> " + p)
    print(f"\n{len(data['challenges'])} challenges, {bad} with problems (seed {data['seed']})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
