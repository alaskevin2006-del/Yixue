"""Publish the static acceptance preview; preserve production app and data.

Requires Python + paramiko. Password is read interactively, never saved.
Usage: python scripts/deploy-preview.py --host HOST --user USER
Rollback: use the existing compose.yaml + compose.ip.yaml without compose.preview.yaml.
"""
import argparse
import getpass
import hashlib
import json
import pathlib
import shlex
import time

import paramiko

parser = argparse.ArgumentParser()
parser.add_argument('--host', required=True)
parser.add_argument('--user', default='ubuntu')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
dist = root / 'dist'
version = json.loads((dist / 'version.json').read_text(encoding='utf-8'))
release = version['revision'] + '-' + time.strftime('%Y%m%d%H%M%S', time.gmtime())
remote = '/opt/yixue/preview/releases/' + release
allowed = ['index.html', 'app.js', 'styles.css', 'version.json']
allowed += ['client/' + name for name in ['main.js', 'model.js', 'storage.js', 'views.js', 'fixtures.js']]
client = paramiko.SSHClient()
client.load_system_host_keys()
client.connect(args.host, username=args.user, password=getpass.getpass('SSH password: '), timeout=20)

def run(command):
    _, out, err = client.exec_command(command, timeout=90)
    result = out.read().decode()
    error = err.read().decode()
    if out.channel.recv_exit_status():
        raise RuntimeError(command + '\n' + result + error)
    return result

def upload_text(sftp, path, body):
    with sftp.open(path, 'w') as target:
        target.write(body)

try:
    # Verify exact deployment context before touching the web container.
    config_files = run("docker inspect yixue-web-1 --format '{{ index .Config.Labels \"com.docker.compose.project.config_files\" }}'").strip()
    if config_files not in ['/opt/yixue/compose.yaml,/opt/yixue/compose.ip.yaml', '/opt/yixue/compose.yaml,/opt/yixue/compose.ip.yaml,/opt/yixue/compose.preview.yaml']:
        raise RuntimeError('Unexpected compose configuration: ' + config_files)
    app_before = run("docker inspect yixue-app-1 --format '{{.Id}}'").strip()
    before = run('curl --fail --silent --show-error https://' + shlex.quote(args.host) + '/api/health')
    run('mkdir -p ' + shlex.quote(remote + '/client'))
    sftp = client.open_sftp()
    for file in allowed:
        sftp.put(str(dist / file), remote + '/' + file)
        actual = run('sha256sum ' + shlex.quote(remote + '/' + file)).split()[0]
        expected = hashlib.sha256((dist / file).read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError('Upload checksum mismatch: ' + file)
    with sftp.open('/opt/yixue/deploy/Caddyfile.ip') as source:
        original = source.read().decode()
    marker = '    reverse_proxy app:3000'
    if original.count(marker) != 1:
        raise RuntimeError('Unexpected Caddyfile shape; production was not changed')
    preview = original.replace(marker, '''    redir /preview /preview/ 308
    handle_path /preview/* {
        root * /preview/current
        header Cache-Control "no-store"
        header X-Content-Type-Options "nosniff"
        file_server
    }
    handle {
        reverse_proxy app:3000
    }''')
    upload_text(sftp, '/opt/yixue/deploy/Caddyfile.preview', preview)
    upload_text(sftp, '/opt/yixue/compose.preview.yaml', '''services:
  web:
    volumes:
      - ./deploy/Caddyfile.preview:/etc/caddy/Caddyfile:ro
      - ./preview:/preview:ro
''')
    run('docker cp /opt/yixue/deploy/Caddyfile.preview yixue-web-1:/tmp/yixue-preview-Caddyfile')
    run('docker exec yixue-web-1 caddy validate --config /tmp/yixue-preview-Caddyfile --adapter caddyfile')
    # Keep previous preview release for rollback. No production config or data is overwritten.
    previous = run('readlink /opt/yixue/preview/current || true').strip()
    run('ln -sfn ' + shlex.quote('releases/' + release) + ' /opt/yixue/preview/next && mv -Tf /opt/yixue/preview/next /opt/yixue/preview/current')
    compose = 'cd /opt/yixue && docker compose -f compose.yaml -f compose.ip.yaml'
    try:
        run(compose + ' -f compose.preview.yaml up -d --no-deps web')
        run('curl --retry 5 --retry-connrefused --retry-delay 2 --fail --silent --show-error https://' + shlex.quote(args.host) + '/preview/version.json')
        app_after = run("docker inspect yixue-app-1 --format '{{.Id}}'").strip()
        if app_before != app_after:
            raise RuntimeError('Production app container changed unexpectedly')
        after = run('curl --fail --silent --show-error https://' + shlex.quote(args.host) + '/api/health')
        if json.loads(after).get('status') != 'ok':
            raise RuntimeError('Production health check failed')
    except Exception:
        if previous:
            run('ln -sfn ' + shlex.quote(previous) + ' /opt/yixue/preview/next && mv -Tf /opt/yixue/preview/next /opt/yixue/preview/current')
        run(compose + ' up -d --no-deps web')
        raise
    print(json.dumps({'url': 'https://' + args.host + '/preview/', 'release': release, 'version': version, 'productionContainerUnchanged': True, 'healthBefore': json.loads(before), 'healthAfter': json.loads(after)}, ensure_ascii=False))
finally:
    client.close()
