# 用 edge-tts 生成每镜旁白音频（中/英各一套）
import asyncio, json, os, subprocess, sys
import edge_tts

BASE = r'C:\Users\pc\AppData\Local\Temp'
narration = json.load(open(os.path.join(BASE, 'keelbase-narration.json'), encoding='utf-8'))
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
