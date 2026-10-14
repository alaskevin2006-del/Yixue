import importlib.util
import pathlib
import unittest

source = pathlib.Path(__file__).resolve().parents[1] / 'deploy-infrastructure.py'
spec = importlib.util.spec_from_file_location('deploy_infrastructure', source)
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class RoutingTests(unittest.TestCase):
    original = '''{
    auto_https disable_redirects
    default_sni {$SITE_ADDRESS}
}
http://{$SITE_ADDRESS} {
    handle /.well-known/acme-challenge/* {
        root * /certs/acme
        file_server
    }
    handle {
        redir https://{host}{uri} 308
    }
}
https://{$SITE_ADDRESS} {
    tls /certs/live/yixue-ip/fullchain.pem /certs/live/yixue-ip/privkey.pem
    request_body {
        max_size 22MB
    }
    redir /preview /preview/ 308
    handle_path /preview/* {
        root * /preview/current
        file_server
    }
    handle {
        reverse_proxy app:3000
    }
}
'''

    def test_preserves_http_tls_preview_root_and_changes_https_only(self):
        result = deploy.add_test_route(self.original)
        inserted = '    redir /test /test/ 308\n    handle_path /test/* {\n        reverse_proxy test:3000\n    }\n'
        self.assertEqual(result.replace(inserted, ''), self.original)
        self.assertGreater(result.index('handle_path /test/*'), result.index('https://{$SITE_ADDRESS} {'))
        self.assertEqual(deploy.add_test_route(result), result)

    def test_unknown_or_ambiguous_shapes_fail_closed(self):
        with self.assertRaises(RuntimeError):
            deploy.add_test_route('https://example.com { reverse_proxy app:3000 }')
        with self.assertRaises(RuntimeError):
            deploy.add_test_route(self.original + '\n    handle {\n        reverse_proxy app:3000\n    }')
        with self.assertRaises(RuntimeError):
            deploy.add_test_route(self.original + '\nhandle_path /test/* { reverse_proxy app:3000 }')


if __name__ == '__main__':
    unittest.main()
