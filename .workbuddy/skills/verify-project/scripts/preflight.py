# -*- coding: utf-8 -*-
"""verify-project：法律小科普轻站 发布前检查

每一项检查都来自本项目**真实踩过的坑**（出处见 references/pitfalls.md）。
每项写明：怎么算通过（PASS）/ 怎么算不通过（FAIL）/ 证据（实际命令输出）。

用法：
    python scripts/preflight.py                 # 只跑离线检查（不需要网络/密钥）
    python scripts/preflight.py --online        # 追加公网检查（需要 --base 或自动读 store.js）
    python scripts/preflight.py --online --base https://xxx.app.tcloudbase.com

退出码：0 = 全部 PASS；1 = 有 FAIL。
"""
import os
import re
import subprocess
import sys
import json
import argparse
import glob as globmod

# Windows 控制台编码兜底
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

def _find_root():
    """从脚本位置向上找仓库根（含 .git 的目录）。

    脚本在 <root>/.workbuddy/skills/verify-project/scripts/preflight.py，
    固定层数容易算错（第一次跑就踩了这个坑），改为按 .git 标记探测。
    """
    cur = os.path.dirname(os.path.abspath(__file__))
    for _ in range(8):
        if os.path.isdir(os.path.join(cur, '.git')) or os.path.exists(os.path.join(cur, '.git')):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            break
        cur = parent
    # 兜底：退回固定层数
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


ROOT = _find_root()

# 特殊字符 / emoji 在 Windows 控制台可能炸，统一降级
def safe(s):
    try:
        s.encode(sys.stdout.encoding or 'utf-8')
        return s
    except Exception:
        return s.encode('ascii', 'replace').decode('ascii')


RESULTS = []   # (id, name, status, evidence)


def record(cid, name, ok, evidence):
    RESULTS.append((cid, name, 'PASS' if ok else 'FAIL', evidence))
    tag = 'PASS' if ok else 'FAIL'
    print('[%s] %-4s %s' % (tag, cid, safe(name)))
    for line in str(evidence).splitlines():
        print('         ' + safe(line))


def run(cmd, shell=False):
    """跑命令，返回 (rc, stdout+stderr)。"""
    try:
        p = subprocess.run(cmd, shell=shell, cwd=ROOT, capture_output=True, timeout=120)
        out = (p.stdout or b'') + (p.stderr or b'')
        try:
            txt = out.decode('utf-8')
        except Exception:
            txt = out.decode('gbk', 'replace')
        return p.returncode, txt.strip()
    except Exception as e:
        return -1, 'COMMAND_ERROR: %s' % e


def git_lines(args):
    rc, out = run(['git'] + args)
    if rc != 0:
        return None, out
    return [l for l in out.splitlines() if l.strip()], out


# ─────────────────────────────────────────────────────────────
# 一、密钥与敏感信息（出处：Day 23 安全审计 / DEPLOY.md §17）
# ─────────────────────────────────────────────────────────────

def check_secrets():
    # C1: .env 本体绝不能入库（PRD §8.5 验收：/contents/.env 返回 404）
    rc, out = run(['git', 'ls-files', '.env'])
    files = [l for l in out.splitlines() if l.strip()]
    record('C1', '.env 未被 git 跟踪（PRD §8.5 硬验收）', len(files) == 0,
           'git ls-files .env → %s' % ('无输出（PASS）' if not files else '!! 已入库: %s' % files))

    # C2: 密钥类文件扩展名不得入库（Day 23 加固 .gitignore）
    rc, out = run('git ls-files | grep -iE "\\.(key|pem|p12|pfx)$|credentials|serviceaccount"', shell=True)
    hits = [l for l in out.splitlines() if l.strip()]
    record('C2', '无密钥类文件被跟踪（*.key/*.pem/credentials.json）', len(hits) == 0,
           'git ls-files | grep 密钥后缀 → %s' % ('无输出（PASS）' if not hits else '!! 命中: %s' % hits))

    # C3: .env 被忽略规则命中 + .env.example 被例外放行（两个方向都要验）
    # 注意：git check-ignore -v 对「例外规则」也会输出（形如 .gitignore:5:!.env.example）。
    #       必须先判断规则文本是否以 '!' 开头，否则会把「正确放行」误判成「被忽略」。
    def ignore_rule(path):
        """返回 (是否被忽略, 规则行原文)。例外规则（!开头）算「未被忽略」。"""
        rc, out = run(['git', 'check-ignore', '-v', path])
        line = out.splitlines()[0] if out.splitlines() else ''
        m = re.search(r':(\d+):(.*?)\t', line)
        rule = m.group(2) if m else ''
        ignored = (rc == 0 and bool(rule) and not rule.startswith('!'))
        return ignored, line

    env_ignored, env_line = ignore_rule('.env')
    ex_ignored, ex_line = ignore_rule('.env.example')
    example_tracked, _ = git_lines(['ls-files', '.env.example'])
    example_ok = bool(example_tracked) and not ex_ignored
    record('C3', '.env 被 .gitignore 命中 且 .env.example 被放行并入库', env_ignored and example_ok,
           '.env → %s（期望：被忽略）\n.env.example → %s（期望：未被忽略）\ngit ls-files .env.example → %s（期望：有输出）'
           % (env_line or '(未命中=错误)', ex_line or '(未命中=错误)', example_tracked or '(空=错误)'))

    # C4: 源码无硬编码密钥特征词（Day 23 全历史扫描的日常版）
    pattern = r'eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}'
    rc, out = run('git grep -nIE "%s" -- . ":(exclude)docs" ":(exclude)*.md"' % pattern, shell=True)
    hits = [l for l in out.splitlines() if l.strip()]
    # 排除文档中的「检查命令字样」误报：只报代码文件
    code_hits = [h for h in hits if not h.endswith('.md')]
    record('C4', '代码文件中无硬编码密钥特征词（eyJ/sk-/AKID/ghp_）', len(code_hits) == 0,
           'git grep 密钥特征词（排除 .md）→ %s' % ('0 命中（PASS）' if not code_hits else '!! 命中:\n' + '\n'.join(code_hits)))

    # C5: cloudbaserc.json 的 envVariables 必须全空（密钥注入即还原纪律，DEPLOY.md §12/§17/§18）
    try:
        with open(os.path.join(ROOT, 'cloudbaserc.json'), encoding='utf-8') as f:
            cfg = json.load(f)
        funcs = cfg.get('functions') or []
        dirty = [fn.get('name') for fn in funcs if fn.get('envVariables')]
        record('C5', 'cloudbaserc.json 四函数 envVariables 全为空（密钥已还原）', len(dirty) == 0,
               '检查 %d 个函数 → %s' % (len(funcs), '全部为空（PASS）' if not dirty else '!! 仍有密钥: %s' % dirty))
    except Exception as e:
        record('C5', 'cloudbaserc.json 四函数 envVariables 全为空（密钥已还原）', False,
               '读取失败: %s' % e)

    # C6: 临时文件不得入库
    tracked, _ = git_lines(['ls-files'])
    tmp = [f for f in (tracked or []) if re.search(r'\.tmp[-.]', f) or f.startswith('.tmp')]
    record('C6', '无 .tmp-* 临时文件被跟踪', len(tmp) == 0,
           'git ls-files | 匹配 .tmp → %s' % ('无（PASS）' if not tmp else '!! %s' % tmp))


def _grep_py(files, pattern, skip_comment_lines=True):
    """纯 Python 实现 grep，不依赖 shell（Windows 上 shell=True 走 cmd，
    会因 `2>/dev/null` 与路径解析报「系统找不到指定的路径」——第一次跑就踩了）。

    返回 [(显示路径, 行号, 行内容)]。
    """
    rx = re.compile(pattern)
    out = []
    for f in files:
        if not os.path.exists(f):
            continue
        rel = os.path.relpath(f, ROOT).replace('\\', '/')
        try:
            with open(f, encoding='utf-8', errors='replace') as fh:
                for i, line in enumerate(fh, 1):
                    s = line.rstrip('\n')
                    if skip_comment_lines:
                        t = s.strip()
                        # 跳过纯注释行（避免把错误模块的说明文档当违规）
                        if t.startswith('*') or t.startswith('//') or t.startswith('/*'):
                            continue
                    if rx.search(s):
                        out.append((rel, i, s.strip()))
        except Exception as e:
            out.append((rel, 0, 'READ_ERROR: %s' % e))
    return out


def _all_files(*rel_dirs):
    res = []
    for d in rel_dirs:
        res.extend(sorted(globmod.glob(os.path.join(ROOT, d, '**', '*.js'), recursive=True)))
    return res


# ─────────────────────────────────────────────────────────────
# 二、错误提示与异常兜底（出处：Day 23 审计 / Day 24 Bug）
# ─────────────────────────────────────────────────────────────

def check_errors():
    # C7: 后端不得把 e.message / parsed.message 直出到「响应体」
    #     注意：写日志（log(...)）里带 e.message 是 Day 23 要求的正确做法，不算违规。
    files = _all_files('functions/api/cards', 'functions/api/categories',
                       'functions/api/favorites', 'functions/api/health')
    hits = []
    rx = re.compile(r'message\s*:\s*(e|err|parsed|error)\.message')
    for f in files:
        rel = os.path.relpath(f, ROOT).replace('\\', '/')
        try:
            with open(f, encoding='utf-8', errors='replace') as fh:
                for i, line in enumerate(fh, 1):
                    s = line.rstrip('\n')
                    t = s.strip()
                    if t.startswith('*') or t.startswith('//') or t.startswith('/*'):
                        continue          # 注释不算
                    if 'log(' in t or 'console.log' in t:
                        continue          # 写日志不算（英文原文就该进日志）
                    if rx.search(s):
                        hits.append('%s:%d %s' % (rel, i, t[:90]))
        except Exception:
            pass
    record('C7', '后端无裸报错直出（e.message 不得进响应体；进日志不算）', len(hits) == 0,
           '扫描 %d 个后端文件（排除注释与日志行）→ %s'
           % (len(files), '0 命中（PASS）' if not hits else '!! 命中:\n' + '\n'.join(hits)))

    # C8: 「面向用户」的前端不得有裸报错（Day 23）
    #     范围界定（第一次跑误报后修正）：check.html / page-check.js 是**开发者诊断工具**，
    #     它的职责就是把 HTTP 状态码与原始响应体显示出来供排障，属设计意图，不算违规。
    #     真正要防的是「最终用户看到的页面」吐英文技术细节 → 只扫面向用户的模块。
    user_fe = [os.path.join(ROOT, 'js', 'store.js'),
               os.path.join(ROOT, 'js', 'page-card.js'),
               os.path.join(ROOT, 'js', 'page-bookmarks.js'),
               os.path.join(ROOT, 'js', 'page-history.js')]
    user_fe = [p for p in user_fe if os.path.exists(p)]
    hits8 = _grep_py(user_fe, r'HTTP\s*"\s*\+\s*(res|r)\.status|请求失败：|JSON\.stringify\(b\)|API error')
    # 另单独检查 page-check.js 里「面向操作者的提示文案」是否还有 Day 23 修掉的那两处
    pc = os.path.join(ROOT, 'js', 'page-check.js')
    hits8b = _grep_py([pc], r'"请求失败：|请求没能完成|网络不太顺') if os.path.exists(pc) else []
    record('C8', '面向用户的页面/模块无裸报错（检查台作为诊断工具除外）', len(hits8) == 0,
           '扫描 %d 个面向用户模块: %s → %s\n检查台（诊断工具，允许显示状态码/响应体）属于例外，不参与判定'
           % (len(user_fe), [os.path.basename(p) for p in user_fe],
              '0 命中（PASS）' if not hits8 else '!! 命中:\n' + '\n'.join('%s:%d %s' % h for h in hits8)))

    # C9: 四函数都引用了 errors.js 统一映射（Day 23 母版 + 四副本约定）
    missing = []
    for fn in ('cards', 'categories', 'favorites', 'health'):
        p = os.path.join(ROOT, 'functions', 'api', fn, 'index.js')
        try:
            with open(p, encoding='utf-8') as f:
                src = f.read()
            if 'toErrorResponse' not in src:
                missing.append(fn + '（未引用 toErrorResponse）')
            ep = os.path.join(ROOT, 'functions', 'api', fn, 'errors.js')
            if not os.path.exists(ep):
                missing.append(fn + '（缺 errors.js 副本）')
        except Exception as e:
            missing.append('%s（读取失败 %s）' % (fn, e))
    record('C9', '四函数均引用 errors.js 统一错误映射（母版+副本约定）', len(missing) == 0,
           '逐函数检查 → %s' % ('全部合规（PASS）' if not missing else '!! ' + '; '.join(missing)))

    # C10: errors.js 母版与四份副本「逻辑部分」必须一致
    #      母版顶部多一段「本文件是母版…同步命令」的说明注释，属设计如此，
    #      比对前必须先剥掉母版开头连续的上方注释块，否则永远报漂移（第一次跑就误报了）。
    master = os.path.join(ROOT, 'functions', 'api', 'common', 'errors.js')

    def strip_lead_comment_block(text):
        """剥掉文件开头连续的 /* ... */ 注释块。"""
        t = text.lstrip()
        while t.startswith('/*'):
            end = t.find('*/')
            if end == -1:
                break
            t = t[end + 2:].lstrip()
        return t

    try:
        with open(master, encoding='utf-8') as f:
            base = strip_lead_comment_block(f.read())
        copies = {}
        for fn in ('cards', 'categories', 'favorites', 'health'):
            with open(os.path.join(ROOT, 'functions', 'api', fn, 'errors.js'), encoding='utf-8') as f:
                copies[fn] = strip_lead_comment_block(f.read())
        distinct = set(copies.values())
        drift = (len(distinct) != 1) or (next(iter(distinct)) != base)
        detail = '四副本彼此一致=%s；与母版（剥离说明注释后）一致=%s' % (
            len(distinct) == 1, (len(distinct) == 1 and next(iter(distinct)) == base))
        record('C10', 'errors.js 四副本内容一致，且与母版（剥离说明注释后）一致', not drift,
               detail + ('（PASS）' if not drift else '  !! 有漂移，跑同步命令: '
                         'for d in cards categories favorites health; do '
                         'cp functions/api/common/errors.js functions/api/$d/errors.js; done'))
    except Exception as e:
        record('C10', 'errors.js 四副本内容一致，且与母版（剥离说明注释后）一致', False, '比对失败: %s' % e)

    # C11: favorites 的 parseBody 必须挡「合法 JSON 但非对象」（Day 24 Bug 1）
    try:
        with open(os.path.join(ROOT, 'functions', 'api', 'favorites', 'index.js'), encoding='utf-8') as f:
            src = f.read()
        has_guard = 'Array.isArray(parsed)' in src and 'typeof parsed' in src
        record('C11', 'favorites parseBody 拒非对象 body（Day 24 Bug 1 回归防线）', has_guard,
               '检查 index.js 是否含 typeof/Array.isArray 守卫 → %s' % ('存在（PASS）' if has_guard else '!! 缺失，body:null 会 500'))
    except Exception as e:
        record('C11', 'favorites parseBody 拒非对象 body（Day 24 Bug 1 回归防线）', False, '读取失败: %s' % e)

    # C12: favorites 的 parseId 必须用白名单正则（Day 24 Bug 2）
    try:
        with open(os.path.join(ROOT, 'functions', 'api', 'favorites', 'index.js'), encoding='utf-8') as f:
            src = f.read()
        has_re = bool(re.search(r'/\^\[1-9\]\[0-9\]\{0,15\}\$/', src))
        record('C12', 'favorites parseId 用白名单正则（Day 24 Bug 2 回归防线）', has_re,
               '检查是否含 /^[1-9][0-9]{0,15}$/ → %s' % ('存在（PASS）' if has_re else '!! 缺失，1e2/+1/0x10 会被静默接受'))
    except Exception as e:
        record('C12', 'favorites parseId 用白名单正则（Day 24 Bug 2 回归防线）', False, '读取失败: %s' % e)

    # C13: note 长度按码点计（Day 24 Bug 3）
    try:
        with open(os.path.join(ROOT, 'functions', 'api', 'favorites', 'index.js'), encoding='utf-8') as f:
            src = f.read()
        has_cp = 'Array.from' in src
        record('C13', 'favorites note 长度按码点计（Day 24 Bug 3 回归防线）', has_cp,
               '检查是否含 Array.from(...).length → %s' % ('存在（PASS）' if has_cp else '!! 缺失，200 个 emoji 会被误拒'))
    except Exception as e:
        record('C13', 'favorites note 长度按码点计（Day 24 Bug 3 回归防线）', False, '读取失败: %s' % e)


# ─────────────────────────────────────────────────────────────
# 三、前端与部署静态一致性（出处：Day 7 相对路径 / Day 20 dist 同步）
# ─────────────────────────────────────────────────────────────

def check_static():
    # C14: 全站内部链接/资源引用必须相对路径（Day 7 坑 1，TECH_DESIGN §11.3）
    abs_pat = re.compile(r'''(href|src)\s*=\s*["']/''')
    abs_hits = []
    for pg in ('index.html', 'card.html', 'bookmarks.html', 'history.html', 'check.html'):
        p = os.path.join(ROOT, pg)
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8', errors='replace') as f:
            for i, line in enumerate(f, 1):
                if abs_pat.search(line):
                    abs_hits.append('%s:%d %s' % (pg, i, line.strip()[:80]))
    for pg in globmod.glob(os.path.join(ROOT, 'dist', '*.html')):
        with open(pg, encoding='utf-8', errors='replace') as f:
            for i, line in enumerate(f, 1):
                if abs_pat.search(line):
                    abs_hits.append('dist/%s:%d %s' % (os.path.basename(pg), i, line.strip()[:80]))
    record('C14', '全站链接/资源均为相对路径（无 href="/" src="/"）', len(abs_hits) == 0,
           '扫描 5 页面 + dist/*.html → %s' % ('0 命中（PASS）' if not abs_hits else '!! 命中:\n' + '\n'.join(abs_hits)))

    # C15: .nojekyll 必须存在且在库（Day 7 坑 2，GitHub Pages）
    exists = os.path.exists(os.path.join(ROOT, '.nojekyll'))
    tracked, _ = git_lines(['ls-files', '.nojekyll'])
    ok = exists and bool(tracked)
    record('C15', '.nojekyll 存在且已被 git 跟踪（GitHub Pages 必需）', ok,
           '文件存在=%s ｜ git ls-files .nojekyll → %s' % (exists, tracked or '(空=未跟踪)'))

    # C16: 根目录与 dist/ 的页面文件必须一致（Day 20 坑 2：手工同步容易漏）
    pages = ['index.html', 'card.html', 'bookmarks.html', 'history.html', 'check.html', '404.html']
    drift = []
    checked = []
    missing = []
    for pg in pages:
        a = os.path.join(ROOT, pg)
        b = os.path.join(ROOT, 'dist', pg)
        if os.path.exists(a) and os.path.exists(b):
            checked.append(pg)
            with open(a, 'rb') as f1, open(b, 'rb') as f2:
                if f1.read() != f2.read():
                    drift.append(pg)
        elif os.path.exists(a):
            missing.append(pg)
    # 空集不算通过：一个都没比对上说明路径或 dist 有问题
    ok16 = (len(drift) == 0) and (len(checked) > 0)
    record('C16', '根目录与 dist/ 页面文件内容一致（防止手工同步漏拷）', ok16,
           '逐文件比对 %d 个: %s → %s%s' % (
               len(checked), checked,
               '全部一致（PASS）' if not drift else '!! 不一致: %s' % drift,
               '' if checked else '  !! 一个都没比对上（dist 不存在或路径错误）= 漏报'))
    if missing:
        print('         （提示：dist/ 缺这些页面：%s）' % missing)

    # C17: dist 里的 js/css 也要同步（页面本身一致但 js 落后同样会出问题）
    pairs = [('js/store.js', 'dist/js/store.js'), ('js/page-check.js', 'dist/js/page-check.js'),
             ('js/ui.js', 'dist/js/ui.js'), ('css/global.css', 'dist/css/global.css')]
    drift2 = []
    checked2 = []
    for a, b in pairs:
        pa, pb = os.path.join(ROOT, a), os.path.join(ROOT, b)
        if os.path.exists(pa) and os.path.exists(pb):
            checked2.append(a)
            with open(pa, 'rb') as f1, open(pb, 'rb') as f2:
                if f1.read() != f2.read():
                    drift2.append(a)
    ok17 = (len(drift2) == 0) and (len(checked2) > 0)
    record('C17', '根目录与 dist/ 的 js/css 内容一致', ok17,
           '比对 %d 项: %s → %s%s' % (
               len(checked2), checked2,
               '全部一致（PASS）' if not drift2 else '!! 不一致: %s' % drift2,
               '' if checked2 else '  !! 一项都没比对上（dist/js 或 dist/css 不存在）= 漏报'))

    # C18: 云函数不得自设 CORS 头（Day 17 坑 1：会被网关拼成 origin,* 双值）
    fn_files = _all_files('functions')
    hits18 = _grep_py(fn_files, r'Access-Control-Allow-Origin')
    record('C18', '云函数未自设 CORS 头（否则网关拼成双值致 Failed to fetch）', len(hits18) == 0,
           '扫描 %d 个云函数文件 → %s'
           % (len(fn_files), '0 命中（PASS）' if not hits18 else '!! 命中:\n' + '\n'.join('%s:%d %s' % h for h in hits18)))

    # C19: 云函数运行时必须是 Nodejs16.13（Day 15 坑 3：20.19 有服务端 bug）
    try:
        with open(os.path.join(ROOT, 'cloudbaserc.json'), encoding='utf-8') as f:
            cfg = json.load(f)
        funcs = cfg.get('functions') or []
        bad = [(fn.get('name'), (fn.get('runtime') or {}).get('type') if isinstance(fn.get('runtime'), dict) else fn.get('runtime'))
               for fn in funcs
               if '16.13' not in json.dumps(fn.get('runtime') or '')]
        record('C19', '云函数运行时均为 Nodejs16.13（20.19 有服务端 bug）', len(bad) == 0,
               '检查 %d 函数 → %s' % (len(funcs), '全部 16.13（PASS）' if not bad else '!! 异常: %s' % bad))
    except Exception as e:
        record('C19', '云函数运行时均为 Nodejs16.13（20.19 有服务端 bug）', False, '读取失败: %s' % e)

    # C20: SQL 必须参数化，不得模板串拼接（防注入）
    sql_files = globmod.glob(os.path.join(ROOT, 'functions', 'api', '*', '*Repository.js'))
    bad_sql = []
    for p in sql_files:
        try:
            with open(p, encoding='utf-8') as f:
                for i, line in enumerate(f, 1):
                    s = line.strip()
                    if s.startswith('//'):
                        continue
                    # SQL 语句中禁止 ${ 插值（参数必须是 $1/$2 占位）
                    if '${' in line and re.search(r'(SELECT|INSERT|UPDATE|DELETE|WHERE|VALUES)', line, re.I):
                        bad_sql.append('%s:%d %s' % (os.path.basename(p), i, s[:80]))
        except Exception:
            pass
    ok20 = (len(bad_sql) == 0) and (len(sql_files) > 0)
    record('C20', 'SQL 全参数化（$1/$2 占位，语句内无 ${} 插值）', ok20,
           '扫描 %d 个 Repository → %s%s' % (
               len(sql_files),
               '0 命中（PASS）' if not bad_sql else '!! ' + '; '.join(bad_sql),
               '' if sql_files else '  !! 一个 Repository 都没扫到（路径错误）= 漏报'))


# ─────────────────────────────────────────────────────────────
# 四、公网检查（需要 --online）
# ─────────────────────────────────────────────────────────────

def http_get(url, headers=None, method='GET', body=None, timeout=25):
    """用无代理 opener 直连（本机 Steam++ 代理会劫持 127.0.0.1，Day 24 坑）。

    ⚠️ 实测发现（Day 25）：Python urllib 发出的请求，网关**不回 CORS 头**
    （curl 同样请求则有——疑似网关按客户端 TLS 指纹区别对待）。
    因此 C21/C22/C25/C26/C27（不看 CORS 头的项）可用本函数；
    CORS 相关项（C23/C24）必须走 curl_cors()，否则误报。
    """
    import urllib.request
    import urllib.error
    op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(url, method=method, data=(body.encode('utf-8') if body else None))
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        r = op.open(req, timeout=timeout)
        return r.status, dict(r.headers), r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode('utf-8', 'replace')
    except Exception as e:
        return -1, {}, 'REQUEST_ERROR: %s' % e


def curl_cors(url, origin, timeout=30):
    """用 curl 实测 CORS 回显（Day 20 的实测方法，行为可复现）。

    返回 (http_status, aco_value_or_None, full_headers_text)。
    """
    cmd = ['curl', '-s', '-D', '-', '-o', '/dev/null', '--ssl-no-revoke', '--noproxy', '*',
           '-H', 'Origin: ' + origin, url]
    rc, out = run(cmd, shell=False)
    status = None
    aco = None
    for line in out.splitlines():
        low = line.lower()
        if low.startswith('http/') and status is None:
            try:
                status = int(line.split()[1])
            except Exception:
                pass
        if low.startswith('access-control-allow-origin:'):
            aco = line.split(':', 1)[1].strip()
    return status, aco, out


def detect_base():
    """从 js/store.js 读 API 基址（Day 21 遗留：硬编码在源码里）。"""
    try:
        with open(os.path.join(ROOT, 'js', 'store.js'), encoding='utf-8') as f:
            m = re.search(r'https://[A-Za-z0-9.-]+\.tcloudbase\.com', f.read())
        return m.group(0) if m else None
    except Exception:
        return None


def check_online(base):
    # C21: health 必须 200 且 ok:true（Day 15/20）
    st, hd, body = http_get(base + '/api/health')
    ok = st == 200 and '"ok":true' in body.replace(' ', '')
    record('C21', 'GET /api/health 返回 200 + ok:true', ok,
           'HTTP %s\n%s' % (st, body[:160]))

    # C22: 核心读接口可用（Day 17）
    st, hd, body = http_get(base + '/api/cards?limit=1')
    ok = st == 200 and '"ok":true' in body.replace(' ', '')
    record('C22', 'GET /api/cards 返回 200 + ok:true（读接口可用）', ok,
           'HTTP %s ｜ 前 120 字符: %s' % (st, body[:120].replace('\n', ' ')))

    # C23: CORS 白名单——陌生域名必须零 CORS 头（Day 17/20 实测结论）
    #      必须用 curl_cors()：Python urllib 的请求网关不回 CORS 头（Day 25 实测发现）
    st, aco, raw = curl_cors(base + '/api/cards?limit=1', 'https://evil.example.com')
    ok = (st == 200) and (aco is None)
    record('C23', '陌生域名请求不回任何 CORS 头（无 * 通配，Day 20 结论）', ok,
           'curl 直连 Origin: https://evil.example.com → HTTP %s ｜ access-control-allow-origin: %s'
           % (st, aco or '(无，正确)'))

    # C24: 白名单域名必须被精确回显且为单值（不得是 origin,* 双值）
    #      白名单成员 = 同环境静态托管域名（DEPLOY.md §15 实测记录；从 API 基址推导同环境序列号）
    own = base.replace('.ap-shanghai.app.tcloudbase.com', '.tcloudbaseapp.com')
    st, aco, raw = curl_cors(base + '/api/cards?limit=1', own)
    ok = (st == 200) and (aco == own) and (',' not in (aco or ''))
    record('C24', '白名单域名（同环境静态托管）被精确回显且为单值', ok,
           'curl 直连 Origin: %s → HTTP %s ｜ 回显: %r（期望恰好等于该域名、无逗号）' % (own, st, aco))

    # C25: Day 24 回归——非对象 body 必须 400，不能 500
    st, hd, body = http_get(base + '/api/favorites?id=1', method='PATCH',
                            headers={'Content-Type': 'application/json'}, body='null')
    ok = st == 400
    record('C25', 'PATCH body=null 返回 400（Day 24 Bug 1 线上回归，修复前 500）', ok,
           'HTTP %s（期望 400）\n%s' % (st, body[:140]))

    # C26: Day 24 回归——「会被 Number() 变形」的 id 写法必须 400
    #      注意 URL 语义（Day 25 实测修正）：裸写 +1 会被网关按 query 规范解码成空格
    #      （' 1'.trim() → '1' 合法 → 404 查无记录），不算漏洞；字面 +1 编码为 %2B1 必须 400。
    wrong = []
    for bid, expect in [('1e2', 400), ('0x10', 400), ('1.5', 400), ('-1', 400), ('0', 400), ('01', 400),
                        ('%2B1', 400), ('+1', 404)]:
        st, hd, body = http_get(base + '/api/favorites?id=' + bid, method='PATCH',
                                headers={'Content-Type': 'application/json'}, body='{"note":"x"}')
        if st != expect:
            wrong.append('%s→%s(期望%s)' % (bid, st, expect))
    record('C26', 'PATCH 变形 id 写法被正确拦截（1e2/0x10/1.5/-1/0/01/%2B1→400；裸+1 是URL空格语义→404）',
           len(wrong) == 0,
           '逐个测 → %s' % ('全部符合预期（PASS）' if not wrong else '!! 不符合: %s' % wrong))

    # C27: 英文不得泄露进 message（Day 23 审计）
    leak_re = re.compile(r'(relation|constraint|duplicate key|syntax error|ECONNREFUSED|does not exist|undefined)', re.I)
    probes = ['/api/health', '/api/cards?limit=1', '/api/favorites?client_id=zz&limit=1']
    leaks = []
    for p in probes:
        st, hd, body = http_get(base + p)
        try:
            js = json.loads(body)
            msg = json.dumps(js.get('error', {}), ensure_ascii=False)
            if msg != '{}' and leak_re.search(msg):
                leaks.append('%s → %s' % (p, msg[:80]))
        except Exception:
            pass
    record('C27', '响应 message 无英文错误原文泄露（Day 23 审计结论）', len(leaks) == 0,
           '探测 %d 个接口 → %s' % (len(probes), '0 泄露（PASS）' if not leaks else '!! ' + '; '.join(leaks)))


# ─────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--online', action='store_true', help='追加公网检查')
    ap.add_argument('--base', default=None, help='API 基址（默认从 js/store.js 读）')
    args = ap.parse_args()

    print('=' * 72)
    print('verify-project 发布前检查 ｜ 法律小科普轻站')
    print('项目根: %s' % ROOT)
    print('=' * 72)

    print('\n── 一、密钥与敏感信息 ──')
    check_secrets()
    print('\n── 二、错误提示与异常兜底 ──')
    check_errors()
    print('\n── 三、前端与部署静态一致性 ──')
    check_static()

    if args.online:
        base = args.base or detect_base()
        if not base:
            print('\n!! --online 需要基址，请用 --base 指定')
        else:
            print('\n── 四、公网检查（base=%s）──' % base)
            check_online(base)

    print('\n' + '=' * 72)
    npass = sum(1 for r in RESULTS if r[2] == 'PASS')
    nfail = sum(1 for r in RESULTS if r[2] == 'FAIL')
    print('汇总: %d / %d 通过' % (npass, len(RESULTS)))
    if nfail:
        print('\n未通过项:')
        for cid, name, status, ev in RESULTS:
            if status == 'FAIL':
                print('  [FAIL] %s %s' % (cid, safe(name)))
    print('=' * 72)
    return 1 if nfail else 0


if __name__ == '__main__':
    sys.exit(main())
