import requests
from pyquran import Quran
import re
import json
import time

# Remove Arabic diacratics (harakat)
def normalize_arabic(text):
    return re.sub(r'[\u064B-\u0652]', '', text)

# Use LibreTranslate to translate an jarabic word to English
def translate_word(word):
    try:
        res = requests.post("https://libretranslate.de/translate", json={
            "q": word,
            "source": "ar",
            "target": "en",
            "format": "text"
        }, headers={"Content-Type": "application/json"})

        if res.status_code == 200:
            return res.json().get("translatedText", "")
        else:
            return ""
    except Exception as e:
        print(f"Error translating {word}: {e}")
        return ""

# Step 1: Extract unique words
quran = Quran()
unique_words = set()

for surah in range(1, 115):
    for ayah in range(1, quran.count_verses(surah) + 1):
        verse = quran.get_verse(surah, ayah)
        normalized = normalize_arabic(verse)
        words = normalized.split()
        unique_words.update(words)

# Clean and Sort
unique_words = sorted(unique_words)

# Step 2:Translate and store results
output = []
print(f"Translating {len(unique_words)} unique words...")

for i, word in enumerate(unique_words):
    english = translate_word(word)
    output.append({
        "word": word,
        "meaning": english
    })
    print(f"{i + 1}/{len(unique_words)}: {word} -> {english}")
    time.sleep(1.1) # Delay to avoid rate-limiting (LibreTranslate is free but slow)

# Step 3: Write to quran_words.json
with open("quran_words.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print("✅ Finished! Saved to quran_words.json")