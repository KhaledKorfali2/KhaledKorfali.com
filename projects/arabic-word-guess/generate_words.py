import json
import time
import re
import requests
from pyquran import get_unique_words
from pyquran import strip_tashkeel

# Helper: Remove diacritics and normalize Arabic
def normalize_arabic(text):
    return strip_tashkeel(text).strip()

# Translate word to English using LibreTranslate API
def translate_word(word):
    try:
        response = requests.post(
            "https://libretranslate.de/translate",
            headers={"Content-Type": "application/json"},
            json={
                "q": word,
                "source": "ar",
                "target": "en",
                "format": "text"
            }
        )
        if response.status_code == 200:
            return response.json().get("translatedText", "")
        else:
            print(f"⚠️ Failed to translate {word} (HTTP {response.status_code})")
            return ""
    except Exception as e:
        print(f"❌ Error translating {word}: {e}")
        return ""

# Main script
def main():
    print("🔎 Extracting unique Quran words...")
    raw_words = get_unique_words()
    print(f"✅ Found {len(raw_words)} raw unique words")

    normalized_words = sorted(set(normalize_arabic(word) for word in raw_words if word.strip()))
    print(f"✅ Normalized to {len(normalized_words)} unique words after cleaning")

    results = []
    for i, word in enumerate(normalized_words):
        meaning = translate_word(word)
        results.append({"word": word, "meaning": meaning})
        print(f"{i + 1}/{len(normalized_words)}: {word} -> {meaning}")
        time.sleep(1.1)  # Be kind to the API

    # Save to JSON
    with open("quran_words.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("✅ All done! Saved to quran_words.json")

if __name__ == "__main__":
    main()
