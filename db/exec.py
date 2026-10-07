# -*- coding: utf-8 -*-
"""db/exec.py — Day 16 云端执行器（PostgreSQL · CloudBase）
用法：
  python db/exec.py schema   # 执行 db/schema.sql（建表，可重复）
  python db/exec.py seed     # 执行 db/seed.sql（先删后插，可重复）
  python db/exec.py verify   # select 验证：每张核心表行数 + 5 行样例 + JOIN
"""
import subprocess, sys, os, glob

ENV = "rqj-2006-d0gl1ael531a243a1"
BASE = os.path.dirname(os.path.abspath(__file__))


def _find_tcb():
    """探测 tcb.cmd 位置（Day 22 改：原来写死版本号，Node 目录升级后会失效）。
    顺序：环境变量 TCB_CLI → PATH（shutil.which）→ 各 node versions 目录通配。
    """
    env = os.environ.get("TCB_CLI")
    if env and os.path.isfile(env):
        return env
    import shutil
    found = shutil.which("tcb") or shutil.which("tcb.cmd")
    if found:
        return found
    patterns = [
        r"C:\Users\Administrator\.workbuddy\binaries\node\versions\*\tcb.cmd",
        r"C:\Users\Administrator\.workbuddy\binaries\node\versions\*\node_modules\.bin\tcb.cmd",
        r"C:\Users\Administrator\AppData\Roaming\npm\tcb.cmd",
    ]
    for p in patterns:
        hits = glob.glob(p)
        if hits:
            return hits[-1]  # 版本目录多个时取最后（通常最新）
    return "tcb"  # 兜底：交给系统 PATH，失败时报错更直观


TCB = _find_tcb()

def _flatten(sql):
    """去掉 -- 注释、换行压成空格。
    原因：Windows 下经 .cmd shim 传参，换行符会截断命令行（只剩第一行 → 假成功）。"""
    lines = []
    for l in sql.splitlines():
        # 去行内注释（本仓库 SQL 字符串字面量中不含 --，安全）
        idx = l.find("--")
        if idx >= 0:
            l = l[:idx]
        lines.append(l)
    return " ".join(x.strip() for x in lines if x.strip())

def tcb_sql(sql):
    """执行 SQL，返回 (ok, stdout)。多语句按 ; 拆分逐条执行
    （tcb db execute 的多语句 blob 是假成功——只跑最后一条且无副作用，实测坑）"""
    stmts = [s.strip() for s in sql.split(";") if s.strip()]
    last_out = ""
    for s in stmts:
        flat = _flatten(s)
        if not flat:
            continue
        r = subprocess.run(
            [TCB, "db", "execute", "-e", ENV, "--sql", flat, "--json"],
            capture_output=True, text=True, encoding="utf-8", timeout=60)
        out = (r.stdout or "") + (r.stderr or "")
        last_out = out.strip()
        if '"error"' in out or r.returncode != 0:
            return False, ("STMT>>>" + flat[:120] + "\n" + out.strip())
    return True, last_out

def read(name):
    with open(os.path.join(BASE, name), encoding="utf-8") as f:
        return f.read()

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "verify"
    if mode == "schema":
        ok, out = tcb_sql(read("schema.sql"))
        print("schema.sql ->", "OK" if ok else "FAIL")
        print(out[-800:] if not ok else out[:200])
        sys.exit(0 if ok else 1)
    if mode == "seed":
        ok, out = tcb_sql(read("seed.sql"))
        print("seed.sql ->", "OK" if ok else "FAIL")
        print(out[-800:] if not ok else out[:200])
        sys.exit(0 if ok else 1)
    if mode == "verify":
        queries = [
            ("cards 行数", "SELECT COUNT(*) AS cards FROM cards"),
            ("laws 行数", "SELECT COUNT(*) AS laws FROM laws"),
            ("cards 前 5 行", "SELECT slug, title, category_id, status FROM cards ORDER BY slug LIMIT 5"),
            ("laws 前 5 行", "SELECT id, card_slug, name FROM laws ORDER BY id LIMIT 5"),
            ("JOIN 关联（每卡法条数）",
             "SELECT c.slug, COUNT(l.id) AS law_count FROM cards c "
             "LEFT JOIN laws l ON l.card_slug = c.slug GROUP BY c.slug ORDER BY c.slug"),
            ("分类聚合（= /api/categories 的 count）",
             "SELECT category_id, COUNT(*) AS count FROM cards WHERE status='published' "
             "GROUP BY category_id ORDER BY category_id"),
        ]
        all_ok = True
        for label, sql in queries:
            ok, out = tcb_sql(sql)
            all_ok = all_ok and ok
            print("\n== %s ==" % label)
            print(out if ok else "FAIL: " + out)
        # 约束验证（预期失败才算通过）
        ok1, _ = tcb_sql("INSERT INTO laws (card_slug, name, text) VALUES ('no-such-card','t','t')")
        ok2, _ = tcb_sql("INSERT INTO cards (slug,title,summary,category,category_id,scenario,"
                         "published_at,updated_at,last_verified_at,reviewed_by,status) "
                         "VALUES ('x','t','t','t','t','t','2026-01-01','2026-01-01','2026-01-01','r','bogus')")
        print("\n外键约束拦截:", "PASS" if not ok1 else "FAIL(居然插进去了)")
        print("status CHECK 拦截:", "PASS" if not ok2 else "FAIL(居然插进去了)")
        print("\nVERIFY:", "ALL PASS" if all_ok and not ok1 and not ok2 else "SOMETHING FAILED")
        sys.exit(0 if all_ok else 1)
    print("unknown mode:", mode)

if __name__ == "__main__":
    main()
