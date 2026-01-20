from __future__ import annotations

import google.generativeai as genai

from app.core.config import settings


def summarize_with_llm(query: str, context: str) -> str | None:
    if not settings.gemini_api_key:
        return None

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(settings.gemini_model)

    prompt = (
        "Kisa, net ve Turkce bir ozet yaz. 2-4 cumle. "
        "Soruya odaklan ve gereksiz ayrinti verme.\n\n"
        f"Soru: {query}\n\n"
        f"Kaynak:\n{context}"
    )

    try:
        response = model.generate_content(
            prompt,
            generation_config={"temperature": 0.2},
        )
    except Exception:
        return None

    text = getattr(response, "text", None)
    return text.strip() if text else None


def check_gemini() -> dict[str, str]:
    if not settings.gemini_api_key:
        return {"status": "error", "detail": "GEMINI_API_KEY tanimli degil."}

    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel(settings.gemini_model)
    try:
        response = model.generate_content(
            "Saglik kontrolu icin kisa cevap ver.",
            generation_config={"temperature": 0.1},
        )
    except Exception as exc:
        return {"status": "error", "detail": str(exc), "model": settings.gemini_model}

    text = getattr(response, "text", None)
    if not text:
        return {"status": "error", "detail": "Bos yanit alindi."}
    return {"status": "ok", "detail": text.strip()[:200], "model": settings.gemini_model}


def get_llm_config() -> dict[str, str | int | bool]:
    key = settings.gemini_api_key or ""
    return {
        "provider": "gemini",
        "model": settings.gemini_model,
        "key_present": bool(key),
        "key_length": len(key),
    }
