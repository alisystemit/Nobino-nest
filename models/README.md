# models/ — مدل‌های محلی گفتار

این پوشه عمداً در git نیست (حجم زیاد). فایل‌ها **خودکار** در بوت اپ آماده می‌شوند:

- `npm run dev` یا `npm start` (بدون داکر)
- اولین بوت کانتینر (volume `asr_models`)

اگر خواستید دستی/از قبل دانلود کنید:

```bash
npm run asr:setup     # مدل + ffmpeg
npm run asr:model     # فقط مدل (با لاگ کامل)
```

ساختار مورد انتظار:

```
models/
└── shenava-koochik-v1.0-sherpa-onnx/
    ├── model.onnx        # ~۴۵۹ مگابایت (FastConformer CTC FP32)
    ├── tokens.txt
    ├── persian_itn.py
    └── hotwords_fa.txt
```

مدل: [Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx](https://huggingface.co/Reza2kn/Shenava-Koochik-v1.0-sherpa-onnx)
(۱۱۴M پارامتر، فارسی، ۱۶kHz مونو، Apache-2.0)

جزئیات راه‌اندازی و تنظیمات: [docs/asr-local.md](../docs/asr-local.md)
