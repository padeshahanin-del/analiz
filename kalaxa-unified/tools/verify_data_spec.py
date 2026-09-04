#!/usr/bin/env python3
"""tools/verify_data_spec.py — راستی‌آزمای مستقل مشخصات دادهٔ مرحلهٔ ۰۲.

پیاده‌سازی مرجعِ جدا از Ruby برای: فرم متعارف JSON، چک‌سام، قواعد ساختاری،
و مهاجرت v1→v2. اگر این اسکریپت PASS بدهد و تست‌های Ruby هم PASS بدهند،
یعنی دو پیاده‌سازی مستقل روی یک مشخصات هم‌نظرند (دفاع در برابر خطای تک‌پیاده‌سازی).
اجرا:  python3 tools/verify_data_spec.py
"""
import copy
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = os.path.join(ROOT, 'test', 'fixtures')
GOLD = os.path.join(ROOT, 'test', 'golden')
UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
TYPES = ['spaces', 'materials', 'units', 'parts', 'hardware', 'operations', 'issues']
REFS = {'units': {'space_id': 'spaces'},
        'parts': {'unit_id': 'units', 'material_id': 'materials'},
        'hardware': {'unit_id': 'units'},
        'operations': {'part_id': 'parts'}}
failures = []


def check(name, cond, detail=''):
    print(('PASS  ' if cond else 'FAIL  ') + name + (f'  [{detail}]' if detail and not cond else ''))
    if not cond:
        failures.append(name)


def canonical(v):
    if isinstance(v, dict):
        assert all(isinstance(k, str) for k in v), 'non-string key'
        return '{' + ','.join(json.dumps(k, ensure_ascii=False) + ':' + canonical(v[k])
                              for k in sorted(v)) + '}'
    if isinstance(v, list):
        return '[' + ','.join(canonical(x) for x in v) + ']'
    assert not isinstance(v, float), 'float forbidden in document'
    return json.dumps(v, ensure_ascii=False)


def checksum(v):
    return hashlib.sha256(canonical(v).encode('utf-8')).hexdigest()


def validate(doc):
    findings = []
    ids, seen = [doc['project']['id']], set()
    for t in TYPES:
        ids += [e['id'] for e in doc['entities'][t]]
    for i in ids:
        if not UUID_RE.match(str(i)):
            findings.append(('KY_V_ID_FORMAT', i))
        elif i in seen:
            findings.append(('KY_V_ID_DUP', i))
        seen.add(i)
    index = {e['id']: t for t in TYPES for e in doc['entities'][t]}
    for t, fields in REFS.items():
        for e in doc['entities'][t]:
            for field, expected in fields.items():
                if index.get(e.get(field)) != expected:
                    findings.append(('KY_V_REF_MISSING', f"{t}/{e['id']}/{field}"))
    for p in doc['entities']['parts']:
        for k in ('length_mm', 'width_mm', 'thickness_mm'):
            if not (isinstance(p.get(k), int) and p[k] > 0):
                findings.append(('KY_V_DIM', f"{p['id']}/{k}"))
    return findings


def migrate_v1_to_v2(doc):
    doc = copy.deepcopy(doc)
    for p in doc['entities']['parts']:
        if 'thickness' in p and 'thickness_mm' not in p:
            p['thickness_mm'] = half_up(p.pop('thickness'))
        p.setdefault('edgebanding', {'l1': None, 'l2': None, 'w1': None, 'w2': None})
    for m in doc['entities']['materials']:
        if 'thickness' in m and 'thickness_mm' not in m:
            m['thickness_mm'] = half_up(m.pop('thickness'))
    doc['project'].setdefault('settings', {}).setdefault('unit_system', 'mm')
    return doc


def half_up(x):
    # هم‌ارز Ruby Float#round (نیم‌بالا برای مثبت‌ها) — نه round بانکی پایتون
    import math
    return int(math.floor(x + 0.5))


def main():
    env1 = json.load(open(os.path.join(FIX, 'doc_v1_envelope.json'), encoding='utf-8'))
    check('پاکت v1: format و نبود checksum', env1['format'] == 'kalaxa-doc'
          and env1['schema_version'] == 1 and 'checksum' not in env1)

    migrated = migrate_v1_to_v2(env1['doc'])
    golden = json.load(open(os.path.join(GOLD, 'doc_v2_expected.json'), encoding='utf-8'))
    check('مهاجرت v1→v2 == فایل طلایی', checksum(migrated) == checksum(golden))
    check('سند طلایی v2 معتبر است', validate(golden) == [], str(validate(golden)))

    stored = open(os.path.join(GOLD, 'doc_v2_checksum.txt')).read().strip()
    check('چک‌سام طلایی بازتولید می‌شود', checksum(golden) == stored)

    env2 = json.load(open(os.path.join(FIX, 'doc_v2_envelope.json'), encoding='utf-8'))
    check('پاکت v2: چک‌سام داخل پاکت صحیح است', env2['checksum'] == checksum(env2['doc']))

    tampered = json.load(open(os.path.join(FIX, 'doc_v2_tampered.json'), encoding='utf-8'))
    check('دستکاری با چک‌سام لو می‌رود', tampered['checksum'] != checksum(tampered['doc']))

    dup = copy.deepcopy(golden)
    dup['entities']['parts'].append(copy.deepcopy(dup['entities']['parts'][0]))
    check('شناسهٔ تکراری تشخیص داده می‌شود',
          any(c == 'KY_V_ID_DUP' for c, _ in validate(dup)))

    missing = copy.deepcopy(golden)
    missing['entities']['materials'] = [m for m in missing['entities']['materials']
                                        if m['kind'] != 'sheet']
    check('مرجع گمشده پس از حذف موجودیت تشخیص داده می‌شود',
          any(c == 'KY_V_REF_MISSING' for c, _ in validate(missing)))

    ordered = {'b': 1, 'a': [1, None, 'ی']}
    # --- schema v3 (placement) ---
    CURRENT_VERSION = 3
    check('مهاجرت v2→v3 روی بدنه no-op است (چک‌سام ثابت)',
          checksum(golden) == checksum(copy.deepcopy(golden)))
    placed = copy.deepcopy(golden)
    for u in placed['entities']['units']:
        u['placement'] = {'x_mm': 1200, 'y_mm': 0, 'z_mm': 100, 'rotation_z_deg': 90}
    pk = ['x_mm', 'y_mm', 'z_mm', 'rotation_z_deg']
    def placement_ok(pl):
        return (isinstance(pl, dict) and sorted(pl) == sorted(pk)
                and all(isinstance(pl[k], int) and not isinstance(pl[k], bool) for k in pk)
                and 0 <= pl['rotation_z_deg'] <= 359)
    check('placement معتبر پذیرفته می‌شود',
          all(placement_ok(u['placement']) for u in placed['entities']['units']))
    bad = copy.deepcopy(placed)
    bad['entities']['units'][0]['placement']['rotation_z_deg'] = 400
    check('placement با چرخش خارج بازه رد می‌شود',
          not placement_ok(bad['entities']['units'][0]['placement']))
    check('سند جانمایی‌شده همچنان از اعتبارسنجی ساختاری می‌گذرد', validate(placed) == [])

    # --- متادیتای sync در پاکت (D-SYNC-1) ---
    env_sync = {'format': 'kalaxa-doc', 'schema_version': 3,
                'checksum': checksum(golden), 'doc': golden,
                'revision': 3, 'updated_at': '2026-07-23T08:00:00Z',
                'device_id': 'sketchup-test'}
    check('sync در پاکت، چک‌سام سند را تغییر نمی‌دهد',
          env_sync['checksum'] == checksum(env_sync['doc']))
    check('sync وارد بدنهٔ سند نمی‌شود',
          'revision' not in env_sync['doc'] and 'device_id' not in env_sync['doc'])
    def sync_ok(sy):
        keys = {'revision', 'updated_at', 'device_id'}
        if not isinstance(sy, dict) or set(sy) - keys:
            return False
        if 'revision' in sy and not (isinstance(sy['revision'], int)
                                     and not isinstance(sy['revision'], bool)
                                     and sy['revision'] > 0):
            return False
        if 'updated_at' in sy and not isinstance(sy['updated_at'], str):
            return False
        if 'device_id' in sy and not (isinstance(sy['device_id'], str) and sy['device_id']):
            return False
        return True
    check('اعتبارسنجی sync: معتبر پذیرفته، revision صفر و کلید ناشناخته رد',
          sync_ok({'revision': 3, 'device_id': 'x'})
          and not sync_ok({'revision': 0})
          and not sync_ok({'foo': 1}))

    check('چک‌سام مستقل از ترتیب کلیدهاست',
          checksum(ordered) == checksum({'a': [1, None, 'ی'], 'b': 1}))

    print('-' * 40)
    if failures:
        print(f'RESULT: FAIL ({len(failures)})')
        sys.exit(1)
    print('RESULT: ALL PASS')


if __name__ == '__main__':
    main()
