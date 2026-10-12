import base64
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class LocalConfigurationTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.service = root / 'ai-service'
        (self.service / 'scripts').mkdir(parents=True)
        self.backend = root / 'ruoyi-vue-pro'
        self.backend.mkdir()
        original = Path(__file__).resolve().parents[1] / 'scripts/configure-local.py'
        self.script = self.service / 'scripts/configure-local.py'
        shutil.copyfile(original, self.script)

    @staticmethod
    def read(path):
        return dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line and not line.startswith('#'))

    def run_setup(self, *arguments):
        subprocess.run([sys.executable, str(self.script), *arguments], check=True, capture_output=True)

    def test_fresh_setup_only_requires_the_model_key(self):
        self.run_setup()
        values = self.read(self.service / '.env.local')
        self.assertEqual('https://api.deepseek.com', values['AI_MODEL_BASE_URL'])
        self.assertEqual('deepseek-flash', values['AI_MODEL_NAME'])
        self.assertEqual('/chat/completions', values['AI_MODEL_COMPLETIONS_PATH'])
        self.assertEqual('disabled', values['AI_MODEL_THINKING'])
        self.assertEqual('', values['AI_MODEL_API_KEY'])
        self.assertEqual(32, len(base64.b64decode(values['AI_STORAGE_KEY'])))
        self.assertEqual(values['AI_INTERNAL_TOKEN'], self.read(self.backend / '.env.local')['AI_INTERNAL_TOKEN'])
        if os.name != 'nt':
            self.assertEqual(0o600, (self.service / '.env.local').stat().st_mode & 0o777)

    def test_selecting_deepseek_keeps_existing_secrets_and_repeated_setup_keeps_preferences(self):
        self.run_setup()
        path = self.service / '.env.local'
        initial = self.read(path)
        path.write_text(path.read_text().replace('AI_MODEL_API_KEY=', 'AI_MODEL_API_KEY=unit-test-only-key')
                        .replace('https://api.deepseek.com', 'https://custom.example'))
        self.run_setup('--provider', 'deepseek')
        selected = self.read(path)
        for key in ('AI_INTERNAL_TOKEN', 'AI_STORAGE_KEY', 'AI_DATABASE_PASSWORD'):
            self.assertEqual(initial[key], selected[key])
        self.assertEqual('unit-test-only-key', selected['AI_MODEL_API_KEY'])
        self.assertEqual('https://api.deepseek.com', selected['AI_MODEL_BASE_URL'])
        path.write_text(path.read_text().replace('https://api.deepseek.com', 'https://custom.example'))
        self.run_setup()
        self.assertEqual('https://custom.example', self.read(path)['AI_MODEL_BASE_URL'])


if __name__ == '__main__':
    unittest.main()
