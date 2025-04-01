# Implementation Plan: Robust Ingrediensanalys med Gemini API

**Övergripande Mål:** Uppnå en robust pipeline som konsekvent returnerar korrekt klassificerade ingredienser i ett pålitligt JSON-format från Gemini API.

**Nyckelresurser:**
*   Rapport från Gemini 2.5 Pro (se `docs/svar_gemini_2.5_pro.md`)
*   Dokumentation för Function Calling (se `docs/Function Calling with the Gemini API.md`)

---

## Fas 1: Förbättra JSON-Pålitlighet och Grundläggande Klassificering (Högst Prioritet)

**Mål:** Få Gemini API att returnera förutsägbar, giltig JSON och förbättra hanteringen av kända klassificeringsproblem som "Arom".

**Steg:**

1.  **Implementera Function Calling / Tool Use (Primär Metod):**
    *   **Åtgärd:** Definiera ett "verktyg" (Function Declaration) i backend-koden (`src/services/videoAnalysisService.ts` eller liknande).
        *   Namn: T.ex. `recordIngredientAnalysis`.
        *   Beskrivning: Tydlig beskrivning av syftet.
        *   Parametrar (`parameters`): Definiera ett JSON-schema som matchar den önskade output-strukturen (med `product_status`, `overall_confidence`, `ingredients`-array med `name`, `status`, `reasoning`, `confidence` per ingrediens). Använd typer från `@google/genai` (Type.OBJECT, Type.ARRAY, Type.STRING, Type.NUMBER etc.). Ange `required` fält.
    *   **Åtgärd:** Modifiera API-anropet till Gemini för att inkludera denna funktionsdefinition under `config.tools`.
    *   **Åtgärd:** Anpassa koden som hanterar API-svaret för att extrahera den strukturerade datan från `response.functionCalls[0].args`.
    *   **Referens:** Se JavaScript-exemplen i `Function Calling with the Gemini API.md`.

2.  **Alternativ Metod (Fallback om Function Calling ej går):**
    *   **Åtgärd:** Om Function Calling visar sig vara problematiskt att implementera direkt:
        *   Använd `response_mime_type='application/json'` i API-anropet (om parametern finns).
        *   Sätt `temperature` till ett lågt värde (`0.0` eller `0.1`).
        *   Förstärk prompten avsevärt med:
            *   Explicita instruktioner om "endast JSON".
            *   Definition av JSON-schemat direkt i prompten.
            *   Few-shot exempel (input text -> output JSON).

3.  **Förbättra Prompt för Klassificering:**
    *   **Åtgärd:** Oavsett metod (Function Calling eller vanlig prompt), uppdatera prompt-texten:
        *   Inkludera specifika regler för problemingredienser (t.ex. "Arom ska klassificeras som 'osäker' om källa ej specificeras.").
        *   Se till att JSON-schemat (antingen i Function Declaration eller prompten) kräver ett `reasoning`-fält, och instruera modellen att motivera 'icke-vegansk'/'osäker'.

4.  **Implementera Grundläggande Felhantering & Schema Validering:**
    *   **Åtgärd:** I backend-koden som hanterar svaret:
        *   Om Function Calling: Verifiera att `response.functionCalls` finns och innehåller förväntad data. Extrahera `args`.
        *   Om vanlig JSON: Använd `try-catch` för att parsa JSON. Logga rå-svar vid fel.
        *   **Efter extrahering/parsning:** Validera det resulterande JavaScript-objektet mot ert definierade schema (t.ex. med `zod` eller liknande bibliotek). Logga schema-valideringsfel.

---

## Fas 2: Djupare Integration och Noggrannhetsförbättring

**Mål:** Ytterligare förbättra klassificeringsnoggrannheten och utforska alternativa arkitekturer.

**Potentiella Steg:**

*   **Integrera Nyckel-Databaser i Prompten:** Om klassificeringsfel kvarstår, inkludera listor över de viktigaste icke-veganska/osäkra ingredienserna i prompten. Överväg RAG (Retrieval-Augmented Generation) som ett mer skalbart alternativ.
*   **Utvärdera Flerstegsmetod:** Överväg att separera OCR och klassificering. Prioritera en metod där klassificeringen primärt sker mot intern databas/regler, med LLM som fallback för okända fall.

---

## Fas 3: Kontinuerlig Förbättring och Robusthet

**Mål:** Skapa ett långsiktigt stabilt och underhållbart system.

**Potentiella Steg:**

*   **Förfina Felhantering:** Implementera mer avancerade tekniker vid behov (JSON-reparation, LLM-självkorrigering).
*   **Iterativ Förbättring:** Analysera loggar och prestanda kontinuerligt. Justera prompter, funktionsdefinitioner och strategier baserat på observationer.

---
