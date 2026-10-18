import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from voice_service.character import character_context, character_voice

class Character(unittest.TestCase):
    def test_published_persona_skills_and_voice_are_selected_together(self):
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {'VOICE_CHARACTER_ROOT': root}):
            folder = Path(root) / 'elf-1'
            folder.mkdir()
            (folder/'manifest.json').write_text(json.dumps({'persona':'persona.md', 'skills':'skills.md'}))
            (folder/'persona.md').write_text('开朗精灵')
            (folder/'skills.md').write_text('需要确认时先询问')
            (folder/'voice.json').write_text(json.dumps({'mode':'clone','audio':'reference.wav','text':'reference.txt'}))
            (folder/'reference.wav').write_bytes(b'test')
            (folder/'reference.txt').write_text('合成测试参考')
            context = character_context({'character':'elf-1'})
            self.assertIn('开朗精灵', context)
            self.assertIn('需要确认时先询问', context)
            self.assertEqual(character_voice('elf-1')['ref_audio'], str((folder/'reference.wav').resolve()))
            self.assertEqual(character_context({}), '')
            for key in ('../elf-1', '/tmp/elf-1', 'elf', 'elf-0'):
                with self.assertRaises(ValueError): character_context({'character':key})
                with self.assertRaises(ValueError): character_voice(key)
            (folder/'manifest.json').write_text(json.dumps({'persona':'../outside.md', 'skills':'skills.md'}))
            with self.assertRaises(ValueError): character_context({'character':'elf-1'})
