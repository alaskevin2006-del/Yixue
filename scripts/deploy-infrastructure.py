"""Two-phase deployment. Stage test, perform browser acceptance, then explicitly promote.

python scripts/deploy-infrastructure.py --stage-test
python scripts/deploy-infrastructure.py --promote
Requires paramiko and an already trusted SSH host key. Password is prompted, never saved.
No private production content is queried. Test data never comes from production.
"""
import argparse
import datetime
import getpass
import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import time

import paramiko

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = '/opt/yixue'
BASE_FILES = ['compose.yaml', 'compose.ip.yaml', 'compose.preview.yaml']
q = shlex.quote


def compose(files):
    return 'cd ' + q(BASE) + ' && docker compose ' + ' '.join('-f ' + q(f) for f in files)


def add_test_route(original):
    """Only transform the known deployment shape; fail closed on unfamiliar routing."""
    if 'handle_path /test/*' in original:
        if original.count('handle_path /test/*') != 1 or not re.search(r'handle_path /test/\*\s*\{\s*reverse_proxy test:3000\s*\}', original):
            raise RuntimeError('Ambiguous existing test routing')
        return original
    marker = '    handle {\n        reverse_proxy app:3000\n    }'
    original = original.replace('\r\n', '\n')
    if original.count(marker) != 1 or 'handle_path /preview/*' not in original:
        raise RuntimeError('Unrecognized Caddy routing; refusing automatic replacement')
    snippet = '    redir /test /test/ 308\n    handle_path /test/* {\n        reverse_proxy test:3000\n    }\n'
    return original.replace(marker, snippet + marker)


class Remote:
    def __init__(self, host, user):
        self.client = paramiko.SSHClient()
        self.client.load_system_host_keys()
        self.client.connect(host, username=user, password=getpass.getpass('SSH password: '), timeout=20)
        self.client.get_transport().set_keepalive(30)
        self.sftp = self.client.open_sftp()
        self.lock = None

    def run(self, command):
        _, out, _ = self.client.exec_command(command)
        channel = out.channel
        output = bytearray()
        # Always drain both streams. Never expose remote errors containing environment values.
        while not channel.exit_status_ready() or channel.recv_ready() or channel.recv_stderr_ready():
            if channel.recv_ready():
                output.extend(channel.recv(65536))
            if channel.recv_stderr_ready():
                channel.recv_stderr(65536)
            time.sleep(.03)
        status = channel.recv_exit_status()
        if status:
            raise RuntimeError(f'Remote operation failed ({status}): {command}')
        return output.decode()

    def read(self, path):
        with self.sftp.open(path, 'rb') as file:
            return file.read()

    def put(self, path, data, mode=0o600):
        if isinstance(data, str):
            data = data.encode()
        self.run('mkdir -p ' + q(str(pathlib.PurePosixPath(path).parent)))
        with self.sftp.open(path, 'wb') as file:
            file.write(data)
        self.sftp.chmod(path, mode)

    def exists(self, path):
        try:
            self.sftp.stat(path)
            return True
        except FileNotFoundError:
            return False

    def acquire(self):
        self.lock, output, _ = self.client.exec_command(
            'sudo -n flock -n ' + q(BASE + '/.operations.lock') + " sh -c 'echo LOCKED; cat >/dev/null'")
        output.channel.settimeout(10)
        if output.readline().strip() != 'LOCKED':
            raise RuntimeError('Another deployment or maintenance job holds the operations lock')

    def unlock(self):
        if self.lock:
            self.lock.channel.shutdown_write()
            self.lock.channel.recv_exit_status()
            self.lock = None

    def close(self):
        self.unlock()
        self.sftp.close()
        self.client.close()


def local_receipt(name, value):
    target = ROOT / 'tmp' / name
    target.parent.mkdir(exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
    return str(target)


def health(remote, host, prefix='', revision=None):
    for _ in range(30):
        try:
            status = json.loads(remote.run('curl --max-time 10 -fsS ' + q(f'https://{host}{prefix}/api/health')))
            version = json.loads(remote.run('curl --max-time 10 -fsS ' + q(f'https://{host}{prefix}/version.json')))
            if status.get('status') == 'ok' and (revision is None or version.get('revision') == revision):
                return {'health': status, 'version': version}
        except (RuntimeError, ValueError):
            pass
        time.sleep(2)
    raise RuntimeError('Health/version verification timed out: ' + (prefix or 'production'))


def preview_version(remote, host):
    return json.loads(remote.run('curl --max-time 10 -fsS ' + q(f'https://{host}/preview/version.json')))


def snapshot(remote, image, data_dir, destination):
    remote.run('mkdir -m 700 -p ' + q(destination))
    size = int(remote.run('sudo -n du -sb ' + q(data_dir)).split()[0])
    free = int(remote.run('df -PB1 ' + q(destination)).splitlines()[1].split()[3])
    if free < size * 2 + 512 * 1024 ** 2:
        raise RuntimeError('Insufficient free disk space for consistent backup and restore drill')
    code = "import {cp,rm} from 'node:fs/promises';import {createBackup} from './scripts/backup.mjs';await cp('/source','/backup/raw',{recursive:true});await createBackup({dataDir:'/backup/raw',outputDir:'/backup/data',offline:true});await rm('/backup/raw',{recursive:true});"
    remote.run('docker run --rm --user root -v ' + q(data_dir + ':/source:ro') + ' -v ' + q(destination + ':/backup') + ' ' + q(image) + ' node --input-type=module -e ' + q(code))


def restore_drill(remote, image, snapshot_dir):
    remote.run('docker run --rm --user root --mount ' + q('type=bind,source=' + snapshot_dir + ',target=/backup,readonly') + ' ' + q(image) + ' node scripts/backup.mjs restore /backup /tmp/yixue-drill --offline')


def source_names(revision):
    names = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', revision, 'production'], cwd=ROOT, text=True).splitlines()
    for name in names:
        relative = name.removeprefix('production/')
        if any(part in ['.env', '.git', 'node_modules', 'dist', 'deploy-data'] for part in pathlib.PurePosixPath(relative).parts):
            raise RuntimeError('Unsafe source path')
    return names


def upload_release(remote, revision, release):
    files = []
    for name in source_names(revision):
        relative = name.removeprefix('production/')
        data = subprocess.check_output(['git', 'show', f'{revision}:{name}'], cwd=ROOT)
        target = release + '/' + relative
        digest = hashlib.sha256(data).hexdigest()
        if remote.exists(target):
            if remote.run('sha256sum ' + q(target)).split()[0] != digest:
                raise RuntimeError('Immutable release already exists with different contents: ' + relative)
        else:
            remote.put(target, data, mode=0o644)
        if remote.run('sha256sum ' + q(target)).split()[0] != digest:
            raise RuntimeError('Upload checksum mismatch: ' + relative)
        files.append(relative)
    return files


def stage(remote, args, revision, stamp):
    release, image = BASE + '/releases/' + revision, 'yixue-app:' + revision
    backup = BASE + '/backups/infrastructure-stage-' + stamp
    remote.run('mkdir -m 700 -p ' + q(backup) + ' ' + q(BASE + '/operations'))
    before = health(remote, args.host)
    preview = preview_version(remote, args.host)
    app_id = remote.run("docker inspect yixue-app-1 --format '{{.Id}}'").strip()
    mounts = json.loads(remote.run("docker inspect yixue-web-1 --format '{{json .Mounts}}'"))
    mounted = [m['Source'] for m in mounts if m['Destination'] == '/etc/caddy/Caddyfile']
    if len(mounted) != 1 or mounted[0] not in [BASE + '/deploy/Caddyfile.preview', BASE + '/deploy/Caddyfile.infrastructure']:
        raise RuntimeError('Unexpected web configuration mount')
    original = remote.read(mounted[0]).decode()
    previous_files = remote.run("docker inspect yixue-web-1 --format '{{ index .Config.Labels \"com.docker.compose.project.config_files\" }}'").strip().split(',')
    if any(f not in [BASE + '/' + n for n in BASE_FILES + ['compose.test.yaml']] for f in previous_files):
        raise RuntimeError('Unexpected compose configuration')
    rollback_compose = compose(previous_files)
    print('Uploading immutable sources and building the isolated test image.', flush=True)
    files = upload_release(remote, revision, release)
    remote.run('docker build --build-arg YIXUE_REVISION=' + revision + ' -t ' + q(image) + ' ' + q(release))
    old_compose = remote.read(BASE + '/compose.test.yaml') if remote.exists(BASE + '/compose.test.yaml') else None
    old_candidate = remote.read(BASE + '/deploy/Caddyfile.infrastructure') if remote.exists(BASE + '/deploy/Caddyfile.infrastructure') else None
    remote.put(backup + '/Caddyfile.previous', original)
    if old_compose is not None:
        remote.put(backup + '/compose.test.previous.yaml', old_compose)
    template = remote.read(release + '/deploy/compose.test.yaml').decode().replace('${YIXUE_TEST_IMAGE:-yixue-app:latest}', image)
    template += '\n  web:\n    volumes:\n      - ./deploy/Caddyfile.infrastructure:/etc/caddy/Caddyfile:ro\n'
    candidate = add_test_route(original)
    remote.put(backup + '/Caddyfile.candidate', candidate)
    remote.run('docker cp ' + q(backup + '/Caddyfile.candidate') + ' yixue-web-1:/tmp/yixue-candidate-Caddyfile')
    remote.run('docker exec yixue-web-1 caddy validate --config /tmp/yixue-candidate-Caddyfile --adapter caddyfile')
    previous_test_image = None
    if old_compose is not None:
        previous_test_image = remote.run(compose(BASE_FILES + ['compose.test.yaml']) + ' images -q test').strip()
    stage_receipt = BASE + '/operations/staged-infrastructure.json'
    if remote.exists(stage_receipt):
        remote.put(backup + '/staged-infrastructure.previous.json', remote.read(stage_receipt))
        remote.sftp.remove(stage_receipt)
    try:
        remote.put(BASE + '/compose.test.yaml', template)
        remote.run('mkdir -p ' + q(BASE + '/deploy-data/test/uploads') + ' && sudo chown -R 1000:1000 ' + q(BASE + '/deploy-data/test') + ' && sudo chmod 700 ' + q(BASE + '/deploy-data/test'))
        cmd = compose(BASE_FILES + ['compose.test.yaml'])
        if previous_test_image:
            remote.run(cmd + ' stop test')
            try:
                snapshot(remote, image, BASE + '/deploy-data/test', backup + '/test-data')
            finally:
                # Resume even if the backup failed; no test data rollback is attempted.
                remote.run(cmd + ' start test')
        remote.run(cmd + ' run --rm --no-deps test node scripts/seed-test-user.mjs')
        remote.run(cmd + ' up -d --no-deps --no-build test')
        remote.put(BASE + '/deploy/Caddyfile.infrastructure', candidate)
        remote.run(cmd + ' up -d --no-deps --no-build web')
        remote.run('docker exec yixue-web-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile')
        tested = health(remote, args.host, '/test', revision)
        if tested['health'].get('environment') != 'test':
            raise RuntimeError('Test service environment mismatch')
        smoke = json.loads(remote.run(cmd + ' exec -T test node scripts/verify-test-deployment.mjs'))
        if remote.run("docker inspect yixue-app-1 --format '{{.Id}}'").strip() != app_id:
            raise RuntimeError('Production app container changed during test staging')
        health(remote, args.host, revision=before['version']['revision'])
        if preview_version(remote, args.host) != preview:
            raise RuntimeError('Preview version changed unexpectedly')
        # Copy a generated test credential receipt only; no production content is read.
        credential = json.loads(remote.run(cmd + " exec -T test node -e \"process.stdout.write(require('node:fs').readFileSync('/data/operations/test-account.json'))\""))
        private_path = local_receipt('test-account.json', credential)
        receipt = {'revision': revision, 'release': release, 'image': image, 'files': files, 'stagedAt': stamp, 'test': tested, 'smoke': smoke, 'productionUnchanged': True, 'preview': preview, 'routingBackup': backup, 'requiresBrowserAcceptance': True}
        remote.put(BASE + '/operations/staged-infrastructure.json', json.dumps(receipt))
        local_receipt('infrastructure-stage.json', receipt)
        print(json.dumps({'stage': 'test-ready', 'revision': revision, 'url': f'https://{args.host}/test/', 'credentialReceipt': private_path, 'productionUnchanged': True, 'next': 'Perform browser acceptance, then run --promote.'}), flush=True)
    except Exception:
        print('Test staging failed; restoring previous proxy configuration. Production data is unchanged.', flush=True)
        if old_compose is not None:
            remote.put(BASE + '/compose.test.yaml', old_compose)
        if old_candidate is not None:
            remote.put(BASE + '/deploy/Caddyfile.infrastructure', old_candidate)
        remote.run(rollback_compose + ' up -d --no-deps --no-build web')
        remote.run('docker exec yixue-web-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile')
        if old_compose is not None and previous_test_image:
            remote.run(compose(BASE_FILES + ['compose.test.yaml']) + ' up -d --no-deps --no-build test')
        raise


def promote(remote, args, revision, stamp):
    staged = json.loads(remote.read(BASE + '/operations/staged-infrastructure.json'))
    if staged['revision'] != revision:
        raise RuntimeError('Current HEAD differs from the staged revision; stage and accept this revision first')
    image, release = staged['image'], staged['release']
    health(remote, args.host, '/test', revision)
    cmd = compose(BASE_FILES + ['compose.test.yaml'])
    oldimage = remote.run("docker inspect yixue-app-1 --format '{{.Image}}'").strip()
    mounts = json.loads(remote.run("docker inspect yixue-app-1 --format '{{json .Mounts}}'"))
    if not any(m['Source'] == BASE + '/deploy-data/app' and m['Destination'] == '/data' for m in mounts):
        raise RuntimeError('Unexpected production data mount')
    preview = preview_version(remote, args.host)
    backup = BASE + '/backups/infrastructure-promote-' + stamp
    oldtag = 'yixue-app:before-infrastructure-' + stamp.lower()
    remote.run('docker tag ' + q(oldimage) + ' ' + q(oldtag))
    remote.run('mkdir -m 700 -p ' + q(backup))
    existing = [name for name in staged['files'] if remote.exists(BASE + '/' + name)]
    if existing:
        remote.run('tar -czf ' + q(backup + '/source.tar.gz') + ' -C ' + q(BASE) + ' ' + ' '.join(map(q, existing)))
    print('Creating a consistent production backup before promoting the accepted image.', flush=True)
    remote.run(cmd + ' stop app')
    try:
        snapshot(remote, image, BASE + '/deploy-data/app', backup)
        restore_drill(remote, image, backup + '/data')
        remote.run('docker tag ' + q(image) + ' yixue-app:latest')
        remote.run(cmd + ' up -d --no-deps --no-build app')
        published = health(remote, args.host, revision=revision)
        if preview_version(remote, args.host) != preview:
            raise RuntimeError('Preview changed during promotion')
    except Exception:
        print('Promotion failed; restoring the previous image without rolling back user data.', flush=True)
        remote.run('docker tag ' + q(oldtag) + ' yixue-app:latest')
        remote.run(cmd + ' up -d --no-deps --no-build app')
        raise
    for name in staged['files']:
        target = BASE + '/' + name
        remote.run('mkdir -p ' + q(str(pathlib.PurePosixPath(target).parent)) + ' && cp ' + q(release + '/' + name) + ' ' + q(target))
    receipt = {'revision': revision, 'publishedAt': stamp, 'production': published, 'backup': backup + '/data', 'restoreDrill': True, 'rollbackImage': oldtag, 'preview': preview, 'monitoringTimers': [], 'monitoringInstallPending': True}
    remote.put(backup + '/deployment.json', json.dumps(receipt))
    local_receipt('infrastructure-promotion.json', receipt)
    print('Accepted production image is live; installing and verifying scheduled monitoring.', flush=True)
    # Release the maintenance lock before the installer invokes its first health job.
    remote.unlock()
    remote.run('sudo bash ' + q(BASE + '/deploy/install-infrastructure.sh'))
    # Explicit check is independent evidence, not a claim inferred from timer installation.
    remote.run('sudo bash ' + q(BASE + '/deploy/operations.sh') + ' check')
    timers = remote.run('systemctl is-active yixue-check.timer yixue-backup.timer').splitlines()
    if timers != ['active', 'active']:
        raise RuntimeError('Scheduled monitoring not active')
    receipt.update(monitoringTimers=timers, monitoringInstallPending=False)
    remote.put(backup + '/deployment.json', json.dumps(receipt))
    local_receipt('infrastructure-promotion.json', receipt)
    print(json.dumps(receipt), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--stage-test', action='store_true')
    mode.add_argument('--promote', action='store_true', help='Explicitly promote after parent browser acceptance')
    parser.add_argument('--host', default='124.221.230.69')
    parser.add_argument('--user', default='ubuntu')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9.-]+', args.host):
        raise RuntimeError('Invalid deployment host')
    if subprocess.check_output(['git', 'status', '--porcelain', '--', 'production'], cwd=ROOT, text=True).strip():
        raise RuntimeError('Commit production changes before publishing an immutable revision')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    remote = Remote(args.host, args.user)
    try:
        remote.acquire()
        if args.stage_test:
            stage(remote, args, revision, stamp)
        else:
            promote(remote, args, revision, stamp)
    finally:
        remote.close()


if __name__ == '__main__':
    main()
