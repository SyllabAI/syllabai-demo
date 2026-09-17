#!/usr/bin/env python3
"""Phase 0 recon: probe SyllabAI repos for demo-relevant architecture."""
import json
import os
import urllib.request

TOKEN = open("/home/z/my-project/scripts/.gh_token").read().strip()
API = "https://api.github.com"
OUT = "/home/z/my-project/scripts/recon"
os.makedirs(OUT, exist_ok=True)

def api_get(url, raw=False):
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
        "User-Agent": "demo-recon",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        return f"__error__: {e}"

def save(name, content):
    with open(f"{OUT}/{name}", "w", encoding="utf-8") as f:
        f.write(content)
    print(f"saved {name} ({len(content)} bytes)")

# ---- 1. syllabai-web: tree of src/ ----
tree = api_get(f"{API}/repos/SyllabAI/syllabai-web/git/trees/main?recursive=1")
try:
    t = json.loads(tree)
    paths = [i["path"] for i in t.get("tree", [])]
    truncated = t.get("truncated", False)
    save("web_tree.txt", "\n".join(paths) + f"\n\nTRUNCATED={truncated}\nTOTAL={len(paths)}")
except Exception as e:
    print("web tree error", e)

# ---- 2. syllabai-web: package.json ----
save("web_package.json", api_get(f"{API}/repos/SyllabAI/syllabai-web/contents/package.json?ref=main", raw=True))

# ---- 3. syllabai-resources: top-level tree (non-recursive + selective recursive) ----
tree2 = api_get(f"{API}/repos/SyllabAI/syllabai-resources/git/trees/main?recursive=1")
try:
    t2 = json.loads(tree2)
    paths2 = [i["path"] for i in t2.get("tree", [])]
    save("resources_tree.txt", "\n".join(paths2) + f"\n\nTRUNCATED={t2.get('truncated', False)}\nTOTAL={len(paths2)}")
except Exception as e:
    print("resources tree error", e)

# ---- 4. syllabai-core: controller listing ----
tree3 = api_get(f"{API}/repos/SyllabAI/syllabai-core/git/trees/main?recursive=1")
try:
    t3 = json.loads(tree3)
    paths3 = [i["path"] for i in t3.get("tree", [])]
    ctrl = [p for p in paths3 if "Controller" in p or p.endswith("application.yml") or "openapi" in p.lower()]
    save("core_tree.txt", "\n".join(paths3) + f"\n\nTRUNCATED={t3.get('truncated', False)}\nTOTAL={len(paths3)}")
    save("core_controllers.txt", "\n".join(ctrl))
except Exception as e:
    print("core tree error", e)

print("DONE")
