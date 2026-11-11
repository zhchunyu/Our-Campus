"""Offline documentation/fixture checks. Does not test the actual application.

Uses Python 3.10+ standard library. Implements only the schema keyword subset
used by this package and rejects unknown keywords; it is not a general JSON
Schema implementation. No installs, network, database calls or file writes.
"""
from pathlib import Path, PurePosixPath
from datetime import date, datetime, timedelta, timezone
from copy import deepcopy
from io import BytesIO
from urllib.parse import urlparse, unquote
from uuid import UUID
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent
COUNTS = {}
SECRET = re.compile(r'\b(?:sk-[A-Za-z0-9]{24,}|sb_secret_[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{15,})\b')


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def read_json(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


def stamp(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    require(parsed.tzinfo is not None, 'Timestamp requires a timezone')
    require(re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', value), 'Invalid date-time format')
    return parsed


def json_equal(left, right):
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    return left == right


SUPPORTED = {'$schema', 'title', 'description', 'type', 'properties', 'required',
             'additionalProperties', 'items', 'minItems', 'maxItems', 'minLength',
             'maxLength', 'pattern', 'const', 'enum', 'format', 'allOf', 'if', 'then', 'minimum'}


def check_schema(node):
    require(set(node) <= SUPPORTED, f'Unsupported schema keywords: {set(node) - SUPPORTED}')
    for sub in node.get('properties', {}).values():
        check_schema(sub)
    if 'items' in node:
        check_schema(node['items'])
    for sub in node.get('allOf', []):
        check_schema(sub)
    for key in ('if', 'then'):
        if key in node:
            check_schema(node[key])


def validate(value, schema, path='$'):
    kinds = {'object': lambda x: isinstance(x, dict), 'array': lambda x: isinstance(x, list),
             'string': lambda x: isinstance(x, str), 'null': lambda x: x is None,
             'boolean': lambda x: isinstance(x, bool),
             'integer': lambda x: isinstance(x, int) and not isinstance(x, bool)}
    if 'type' in schema:
        allowed = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
        require(all(kind in kinds for kind in allowed), 'Unsupported schema type')
        require(any(kinds[kind](value) for kind in allowed), f'{path}: wrong type')
    if 'const' in schema:
        require(json_equal(value, schema['const']), f'{path}: wrong constant')
    if 'enum' in schema:
        require(any(json_equal(value, option) for option in schema['enum']), f'{path}: invalid enum')
    if isinstance(value, dict):
        require(set(schema.get('required', [])) <= set(value), f'{path}: missing field')
        if schema.get('additionalProperties') is False:
            require(set(value) <= set(schema.get('properties', {})), f'{path}: extra field')
        for key, sub in schema.get('properties', {}).items():
            if key in value:
                validate(value[key], sub, f'{path}.{key}')
    if isinstance(value, list):
        require(schema.get('minItems', 0) <= len(value) <= schema.get('maxItems', float('inf')), f'{path}: invalid item count')
        if 'items' in schema:
            for index, item in enumerate(value):
                validate(item, schema['items'], f'{path}[{index}]')
    if isinstance(value, str):
        require(schema.get('minLength', 0) <= len(value) <= schema.get('maxLength', float('inf')), f'{path}: invalid string length')
        if 'pattern' in schema:
            require(re.search(schema['pattern'], value), f'{path}: invalid pattern')
        if schema.get('format') == 'date-time':
            stamp(value)
        elif schema.get('format') == 'uuid':
            UUID(value)
        elif schema.get('format') == 'uri':
            require(bool(urlparse(value).scheme), f'{path}: invalid URI')
    for sub in schema.get('allOf', []):
        validate(value, sub, path)
    if 'if' in schema:
        try:
            validate(value, schema['if'], path)
        except (AssertionError, ValueError):
            pass
        else:
            if 'then' in schema:
                validate(value, schema['then'], path)


def check_plan_semantics(plan):
    require(len({x['draft_item_id'] for x in plan['items']}) == len(plan['items']), 'Duplicate draft item')
    citations = {x['source_id'] for x in plan['citations']}
    for item in plan['items']:
        require((item['start_at'] is None) == (item['end_at'] is None), 'Unpaired times')
        if item['start_at'] is not None:
            require(stamp(item['start_at']) < stamp(item['end_at']), 'Reversed time interval')
            if item['due_at']:
                require(stamp(item['end_at']) <= stamp(item['due_at']), 'Task ends after due time')
        if item['source_ref']['type'] != 'user_request':
            require(item['source_ref']['id'] and item['source_ref']['version'], 'Missing source version')
        for reason in item['reasons']:
            if reason['source_id']:
                require(reason['source_id'] in citations, 'Reason lacks citation')
    if plan['expires_at']:
        ttl = stamp(plan['expires_at']) - stamp(plan['context_fetched_at'])
        require(timedelta(0) < ttl <= timedelta(hours=24), 'Invalid draft expiry')


def inspect_zip(data, depth=0):
    require(depth < 3, 'Unexpected nested archive depth')
    with zipfile.ZipFile(BytesIO(data)) as archive:
        require(archive.testzip() is None, 'Archive CRC check failed')
        for info in archive.infolist():
            name = info.filename.replace('\\', '/')
            parts = PurePosixPath(name).parts
            require(not name.startswith('/') and '..' not in parts and ':' not in name, 'Unsafe archive path')
            require(not any(part.lower() in {'.git', 'node_modules', '.env', '.env.local', '.env.production'} for part in parts), 'Unexpected private/dependency file')
            if name.endswith('.zip'):
                inspect_zip(archive.read(info), depth + 1)
            elif PurePosixPath(name).suffix in {'.md', '.json', '.js', '.toml', '.sql'}:
                require(not SECRET.search(archive.read(info).decode('utf-8-sig')), 'Possible credential in attachment')
        COUNTS['existing_attachment_entries'] = len(archive.infolist())


def main():
    all_files = sorted(p for p in ROOT.rglob('*') if p.is_file())
    require(all_files, 'Empty package')
    require((ROOT / 'SHA256SUMS.txt').is_file(), 'Missing checksum manifest')
    sums = {}
    for line in (ROOT / 'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines():
        digest, relative = line.split('  ', 1)
        require(relative not in sums, 'Duplicate checksum entry')
        require(not PurePosixPath(relative).is_absolute() and '..' not in PurePosixPath(relative).parts and ':' not in relative, 'Unsafe checksum path')
        require(re.fullmatch('[0-9a-f]{64}', digest), 'Malformed checksum')
        sums[relative] = digest
    expected_files = {p.relative_to(ROOT).as_posix() for p in all_files if p.name != 'SHA256SUMS.txt'}
    require(set(sums) == expected_files, 'Checksum file list mismatch')
    for relative, digest in sums.items():
        require(hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() == digest, f'Hash mismatch: {relative}')
    COUNTS['checksummed_files'] = len(sums)

    json_files = list(ROOT.rglob('*.json'))
    for path in json_files:
        json.loads(path.read_text(encoding='utf-8'))
    COUNTS['json_files'] = len(json_files)
    schema = read_json('contracts/ai-plan-result.schema.json')
    check_schema(schema)
    plans = [read_json('examples/ai-plan-ready.json'), read_json('examples/ai-plan-clarification.json')]
    for plan in plans:
        validate(plan, schema)
        check_plan_semantics(plan)
    COUNTS['valid_plan_fixtures'] = len(plans)

    mutations = []
    for field, value in [('saved', True), ('requires_confirmation', False), ('plan_id', 'not-a-uuid'),
                         ('items', []), ('questions', ['This ready plan cannot require clarification.']),
                         ('context_fetched_at', '2026-10-15T04:00:00')]:
        candidate = deepcopy(plans[0]); candidate[field] = value; mutations.append(candidate)
    candidate = deepcopy(plans[0]); candidate['extra'] = True; mutations.append(candidate)
    candidate = deepcopy(plans[0]); candidate['items'][0]['end_at'] = candidate['items'][0]['start_at']; mutations.append(candidate)
    candidate = deepcopy(plans[1]); candidate['plan_id'] = plans[0]['plan_id']; mutations.append(candidate)
    for candidate in mutations:
        try:
            validate(candidate, schema)
            check_plan_semantics(candidate)
        except (AssertionError, ValueError):
            continue
        raise AssertionError('Invalid fixture mutation unexpectedly accepted')
    COUNTS['invalid_plan_mutations_rejected'] = len(mutations)

    context = read_json('examples/timetable-and-preferences.json')
    anchor = date.fromisoformat(context['timetable']['termStart'])
    require(anchor.weekday() == 0, 'Term start not Monday')
    china = timezone(timedelta(hours=8))
    for item in plans[0]['items']:
        start, end = stamp(item['start_at']).astimezone(china), stamp(item['end_at']).astimezone(china)
        week = (start.date() - anchor).days // 7 + 1
        for course in context['timetable']['courses']:
            if course['weekday'] == start.isoweekday() and week in course['weeks']:
                require(not (start.strftime('%H:%M') < course['endTime'] and course['startTime'] < end.strftime('%H:%M')), 'Fixture conflicts with fixture timetable')
    COUNTS['timetable_fixture_consistency'] = True

    contracts = read_json('contracts/rpc-contracts.json')
    names = [r['name'] for r in contracts['rpcs']]
    require(len(names) == len(set(names)) == 10, 'RPC names missing/duplicated')
    require(contracts['status'] == 'not_implemented', 'Draft contract status missing')
    for rpc in contracts['rpcs']:
        require('user_id' not in rpc['parameters'] and 'p_user_id' not in rpc['parameters'], 'Client-supplied owner')
        if rpc['name'] != 'campus_butler_snapshot':
            require('p_client_request_id' in rpc['parameters'], 'Missing write idempotency')
    require(set().union(*(set(r['feature_ids']) for r in contracts['rpcs'])) == {f'F{i}' for i in range(1, 7)}, 'Feature coverage missing')
    COUNTS['proposed_rpc_contracts'] = len(names)

    cases = read_json('examples/notification-cases.json')['cases']
    for case in cases:
        if not case['confirmed'] or not case['active']:
            require(case['expected_send'] is False, 'Unconfirmed/expired fixture sends')
        require(case['expected_send'] == (case['expected_priority'] is not None), 'Fixture priority mismatch')
    require(cases[0]['expected_priority'] == 3 and cases[0]['expected_send'], 'Important road closure fixture missing')
    COUNTS['notification_target_fixtures'] = len(cases)

    linked = 0
    for path in ROOT.glob('*.md'):
        content = path.read_text(encoding='utf-8')
        require(not re.search(r'\b(?:TODO|TBD)\b|待补充', content), f'Unfinished placeholder: {path.name}')
        for match in re.finditer(r'\[[^\]]*\]\(([^)]+)\)', content):
            target = unquote(match.group(1)).split('#')[0]
            if target and not urlparse(target).scheme:
                require((path.parent / target).is_file(), f'Broken document link: {target}')
                linked += 1
    COUNTS['local_document_links'] = linked

    manifest = read_json('reference/source-manifest.json')
    for entry in manifest['files']:
        copied = ROOT / 'reference' / 'current' / entry['repository_path']
        require(hashlib.sha256(copied.read_bytes()).hexdigest() == entry['sha256'], 'Source snapshot mismatch')
    old = (ROOT / 'reference' / '通知基础实现-2026-10-15.zip').read_bytes()
    require(hashlib.sha256(old).hexdigest() == manifest['previous_package_sha256'], 'Old package changed')
    inspect_zip(old)

    for path in all_files:
        if path.suffix in {'.md', '.json', '.js', '.toml'}:
            require(not SECRET.search(path.read_text(encoding='utf-8')), f'Possible credential: {path.name}')
    COUNTS['attachment_integrity_and_basic_secret_scan'] = True
    print(json.dumps({'passed': True, 'scope': 'documentation_and_fixture_checks_only', 'checks': COUNTS}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
