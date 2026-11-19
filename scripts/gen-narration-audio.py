# SPDX-License-Identifier: Apache-2.0

# 用 edge-tts 生成每镜旁白音频（中/英各一套）
import asyncio, json, os, subprocess, sys, tempfile
import edge_tts

# KEELBASE_NARRATION_DIR overrides the temp directory holding keelbase-narration.json and the audio.
# KEELBASE_NARRATION_DIR 覆盖存放 keelbase-narration.json 与音频的临时目录。
BASE = os.environ.get('KEELBASE_NARRATION_DIR') or tempfile.gettempdir()
with open(os.path.join(BASE, 'keelbase-narration.json'), encoding='utf-8') as f:
    narration = json.load(f)
VOICES = {'zh': 'zh-CN-XiaoxiaoNeural', 'en': 'en-US-GuyNeural'}

async def gen(lang):
    out_dir = os.path.join(BASE, 'keelbase-audio', lang)
    os.makedirs(out_dir, exist_ok=True)
    for shot in narration['shots']:
        out = os.path.join(out_dir, f'{shot["id"]:02d}.mp3')
        communicate = edge_tts.Communicate(shot[lang], VOICES[lang])
        await communicate.save(out)
    print(f'{lang}: {len(narration["shots"])} files')

async def main():
    for lang in sys.argv[1:] or ['zh', 'en']:
        await gen(lang)

asyncio.run(main())
