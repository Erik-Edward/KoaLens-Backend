# **Skillnaden mellan JavaScript SDK:erna @google/genai och @google/generative-ai för Gemini API**

**1\. Introduktion**

Google Gemini API representerar ett kraftfullt verktyg för generativa AI-uppgifter, med förmåga att förstå och generera olika former av innehåll, inklusive text, bilder, ljud och video. För att underlätta integreringen av detta API i applikationer tillhandahåller Google Software Development Kits (SDK:er) som erbjuder språkspecifika bibliotek och verktyg. Denna rapport syftar till att ge en omfattande jämförelse mellan de två primära JavaScript SDK:erna som är tillgängliga för Gemini API: @google/genai och @google/generative-ai. Rapporten kommer att behandla deras funktioner, API-struktur, aktuell status (inklusive eventuell depreciering), Googles rekommendationer, vägledning för migrering samt kända problem för att hjälpa utvecklare att fatta välgrundade beslut. Att det finns två SDK:er kan skapa förvirring bland utvecklare, och denna rapport avser att klargöra deras respektive roller och guida användaren mot det rekommenderade alternativet.

**2\. Översikt över @google/genai**

@google/genai introduceras som det nya Google Gen AI SDK för TypeScript och JavaScript, utformat för att fungera med de senaste funktionerna i Gemini 2.0 1. Det tillhandahåller ett enhetligt gränssnitt till både Gemini Developer API (åtkomligt via Google AI Studio) och Vertex AI (Gemini Enterprise API) 1. Denna sammanslagning förenklar utvecklingsprocesser och ger utvecklare möjligheten att potentiellt skapa prototyper på en plattform och driftsätta på en annan med minimala kodändringar 2.

De viktigaste funktionerna baserade på undersökningsmaterialet inkluderar:

* **Modellinteraktion (ai.models)**: Möjliggör frågor till modeller för generering av innehåll (text, bilder och potentiellt ljud/video) samt granskning av modellmetadata 3. Metoden generateContent nämns för standardinnehållsgenerering och generateContentStream för snabbare och mer responsiv interaktion genom strömning 3.  
* **Cachehantering (ai.caches)**: Tillåter skapande och hantering av cacheminnen för att minska kostnader vid upprepad användning av liknande promptprefix 3. Denna funktion kan vara särskilt värdefull för applikationer med konversationsgränssnitt eller de som frekvent använder liknande inledande prompter.  
* **Chattsessioner (ai.chats)**: Förenklar flersvängskonversationer genom att tillhandahålla lokala tillståndskänsliga chattobjekt 3.  
* **Filhantering (ai.files)**: Underlättar uppladdning av filer (bilder, ljud, video, PDF:er) till API:et och referering till dem i prompter, vilket är effektivt för stora eller frekvent använda filer 3. Snippet 3 nämner undermodulen ai.files för uppladdning av filer, och snippet 3 listar också files som en undermodul. Detta adresserar behovet av att hantera multimodala indata effektivt, vilket understryks av användarens underförstådda intresse för videoanalys 4.  
* **Livesessioner (ai.live)**: Stöder dubbelriktad ljud- och videointeraktion med låg latens med Gemini, inklusive möjligheten att avbryta modellens svar 3. Snippet 6 ger exempel på hur man använder Live API för att skicka/ta emot text och ta emot ljud. Det nämner också ett "Live API \- Quickstart"-exempel för strömning av ljud och video i kokboksförvaret. Denna funktion är avgörande för realtidsapplikationer som röstassistenter eller interaktiva verktyg för videoanalys.  
* **Funktionsanrop**: Gör det möjligt för Gemini att interagera med externa system genom att tillhandahålla functionDeclaration-objekt som tools. Stöder att skicka funktionsresultat tillbaka till modellen 3. Både 3 och 3 nämner funktionsanrop som en nyckelfunktion och beskriver processen. Detta utökar Geminis förmåga genom att tillåta den att orkestrera komplexa uppgifter som involverar extern data eller tjänster.

SDK:et är tillgängligt på npm som @google/genai, och dess dokumentation finns på https://googleapis.github.io/js-genai/ 2. Den officiella dokumentationen tillhandahåller omfattande information om installation, initialisering och användning av alla funktioner.

**3\. Översikt över @google/generative-ai**

@google/generative-ai introduceras som det äldre Google AI JavaScript SDK, primärt utformat för den första versionen av Gemini API 7. Dess funktionalitet inkluderar stöd för att generera text från endast textinmatning eller från text- och bildinmatning (multimodal) 8. Det möjliggör även skapande av flersvängskonversationer (chatt) 8 och inkluderar (för Node.js) inbäddningsfunktioner 8. Detta SDK är tillgängligt på npm som @google/generative-ai, och dess GitHub-förvar är https://github.com/google-gemini/generative-ai-js 7. Det noteras en varning i 7 och 7 angående användning av detta SDK direkt från klientapplikationer på grund av säkerhetsrisker med API-nycklar. Server-side-implementering rekommenderas starkt för produktion om fakturering är aktiverad. Även om det är funktionellt kan detta SDK sakna de avancerade funktioner och optimeringar som finns tillgängliga i det nyare @google/genai SDK:et, särskilt för de senaste Gemini-modellerna.

**4\. Jämförande analys av funktioner och API-struktur**

Nedan presenteras en jämförelse av de viktigaste funktionerna i båda SDK:erna i tabellform:

**Tabell 1: Jämförelse av funktioner**

| Funktion | @google/genai (Nytt SDK) | @google/generative-ai (Gammalt SDK) |
| :---- | :---- | :---- |
| Målgrupp Gemini-version | Primärt Gemini 2.0, stöder även 1.5 | Primärt initiala Gemini 1.0/1.5-versioner |
| Enhetligt API | Ja (Gemini Developer API och Vertex AI) | Troligen fokuserat på det initiala Gemini API:et |
| Modellinteraktion | generateContent, generateContentStream, metadataåtkomst | getGenerativeModel, generateContent |
| Cachehantering | Ja (ai.caches) | Inget explicit omnämnande |
| Chattsessioner | Ja (ai.chats) | Ja |
| Filhantering | Ja (ai.files) för olika medietyper | Begränsat till bilder i den första versionen, bredare stöd kan ha lagts till senare |
| Livesessioner | Ja (ai.live) för ljud-/videointeraktion i realtid | Inget explicit omnämnande |
| Funktionsanrop | Ja, med detaljerat stöd | Kan ha lagts till senare, men mindre betonat |
| Inbäddning | Ja (ai.embeddings) | Ja 8 |
| Språkstöd | TypeScript och JavaScript | JavaScript (med TypeScript-stöd) |
| Förhandsgranskningsstatus | Ja (Förhandsgranskningslansering) | Stabilt, men nu föråldrat |

När det gäller API-initialisering använder @google/genai klassen GoogleGenAI, vilket kräver en API-nyckel (eller Vertex AI-projekt/plats) 1. Å andra sidan använder @google/generative-ai klassen GoogleGenerativeAI för initialisering med en API-nyckel 7. Vidare finns det skillnader i hur vanliga uppgifter utförs, som att generera innehåll. I @google/genai görs detta via ai.models.generateContent(...) 1, medan i @google/generative-ai krävs först att en modellinstans skapas med genAI.getGenerativeModel(...) innan model.generateContent(...) anropas 7. Det nya SDK:et verkar ha en mer modulär struktur med undermoduler för olika funktioner (modeller, chattar, filer etc.), vilket kan erbjuda bättre organisation och skalbarhet.

**5\. Status för depreciering och Googles rekommendation**

Det är tydligt fastställt att @google/generative-ai är **föråldrat** 7. Snippet 7 anger detta explicit och hänvisar till det nya SDK:et. Snippet 14 nämner också att @google-ai/generativelanguage (troligen relaterat eller samma) inte vidareutvecklas. Googles officiella rekommendation är att använda det **nya @google/genai SDK:et för alla nya projekt** som använder Gemini API i JavaScript/Node.js 7. Denna rekommendation baseras på flera faktorer, inklusive stöd för de senaste funktionerna och modellerna i Gemini 2.0, ett enhetligt gränssnitt för både Gemini Developer API och Vertex AI, inkludering av nyare funktioner som cachehantering och livesessioner, samt sannolikt pågående utveckling och support för det nya SDK:et. Utvecklare som startar nya projekt bör definitivt välja @google/genai SDK:et för att dra nytta av de senaste funktionerna och säkerställa långsiktig kompatibilitet och support.

**6\. Vägledning för migrering från @google/generative-ai till @google/genai**

Även om det inte finns en direkt, steg-för-steg migreringsguide för JavaScript i det undersökta materialet, gäller generella principer och överväganden för migrering mellan SDK-versioner. Migreringsguiden för Python SDK:et 9 kan ge insikter i de konceptuella förändringar och mönster som kan finnas även i JavaScript SDK:erna. Snippet 10 beskriver uppgraderingen av Python SDK:et, inklusive förändringar i autentisering, modellinstansiering, metodanrop (t.ex. generate\_content vs. generateContent) och hantering av valfria argument. Även om det gäller ett annat språk antyder Python-migreringsguiden att utvecklare bör förvänta sig förändringar i hur klienten initieras, hur modeller nås och strukturen på anropen för att generera innehåll.

Generella steg och överväganden för migrering inkluderar:

* **Installation**: Avinstallera det gamla SDK:et (npm uninstall @google/generative-ai) och installera det nya (npm install @google/genai).  
* **Initialisering**: Uppdatera import-deklarationerna och klientinitialiseringskoden för att använda GoogleGenAI.  
* **Modellinstansiering**: Justera hur Gemini-modellen nås. Det nya SDK:et verkar använda ai.models och specificera modellnamnet direkt i anropet till generateContent.  
* **Metodanrop**: Uppdatera metodnamnen för att generera innehåll (t.ex. generateContent). Var uppmärksam på parameterstrukturen, som kan ha ändrats för att använda ett config-objekt för valfria inställningar.  
* **Funktionsanvändning**: Om applikationen använder funktioner som inbäddning, chattsessioner eller filhantering, granska dokumentationen för @google/genai SDK:et för att förstå hur dessa implementeras i den nya versionen (t.ex. med ai.embeddings, ai.chats, ai.files).  
* **Testning**: Testa applikationen noggrant efter migreringen för att säkerställa att alla funktioner fungerar som förväntat med det nya SDK:et.

Det är också möjligt att använda miljövariabler för API-nyckeln, vilket visas i snabbstarts-exemplen för båda SDK:erna. Sammanfattningsvis kommer migreringen sannolikt att innebära uppdatering av import-deklarationer, klientinitialisering och syntaxen för att göra API-anrop. Utvecklare bör konsultera den officiella dokumentationen för det nya SDK:et för detaljerade användningsinstruktioner.

**7\. Kända problem, begränsningar och kompatibilitet**

Det är viktigt att notera att @google/genai SDK:et för närvarande befinner sig i en **förhandsgranskningslansering** 1. Flera snippets 1 anger explicit att JavaScript SDK:et är en förhandsgranskning. Snippet 3 förklarar vad "Förhandsgranskning" innebär i samband med Google Cloud-produkter, inklusive potentiell brist på fullständig funktionalitet och supportåtaganden. Att det är en förhandsgranskning innebär att SDK:et kan ha vissa begränsningar, vara föremål för förändringar och kanske inte rekommenderas för produktionsmiljöer utan noggrann övervägning och testning. Potentiella begränsningar kan inkludera ofullständig funktionalitet jämfört med den slutliga versionen, risk för icke-bakåtkompatibla ändringar i framtida uppdateringar samt begränsad support och inga serviceavtal under förhandsgranskningsfasen.

Varningen om API-nyckelsäkerhet för klientapplikationer gäller båda SDK:erna, men betonas särskilt för det äldre 7. Utöver SDK-specifika begränsningar finns det även begränsningar i själva Gemini API:et, såsom maximala gränser för inmatningstokens, restriktioner för videolängd och filformat som stöds 4. Snippets som 4, 4, 11 och 4 beskriver videobearbetningsfunktioner och begränsningar, inklusive maximal längd (90 minuter för Gemini Pro/Flash i vissa sammanhang, 1 timme i andra), filformat som stöds (mp4, mpeg, mov, avi etc.) och användningen av File API för uppladdningar. Snippet 4 noterar bildhastigheten på 1 bildruta per sekund. Utvecklare bör vara medvetna om dessa underliggande API-begränsningar när de utformar sina applikationer, särskilt de som involverar videoanalys. Vissa funktioner i Gemini 2.0 är fortfarande experimentella eller i privat förhandsgranskning, vilket kan påverka deras tillgänglighet eller stabilitet inom SDK:et 11. Snippet 11 visar att funktioner som bildgenerering och ljudgenerering i Gemini 2.0 Flash var experimentella eller på gång i februari 2025\. Snippet 13 bekräftar statusen "Offentlig förhandsgranskning" för Multimodal Live API och detektering av avgränsningsrutor för Gemini 2.0 Flash. SDK:ets kapacitet är kopplad till den underliggande Gemini API-modellen och dess funktionstillgänglighet.

**8\. Slutsats och rekommendation**

Sammanfattningsvis är den viktigaste skillnaden mellan @google/genai och @google/generative-ai att den förstnämnda är det nyare, rekommenderade SDK:et som är utformat för de senaste Gemini 2.0-funktionerna och erbjuder ett enhetligt gränssnitt till både Gemini Developer API och Vertex AI. @google/generative-ai är föråldrat och bör inte användas för nya projekt. Utvecklare rekommenderas starkt att starta nya projekt med @google/genai SDK:et för att dra nytta av de senaste Gemini-funktionerna, det enhetliga API:et och pågående support. Utvecklare med befintliga projekt som använder @google/generative-ai bör planera för migrering till @google/genai för att säkerställa kompatibilitet med framtida Gemini-uppdateringar och för att kunna använda nya funktioner. Det är lämpligt att konsultera den officiella dokumentationen för @google/genai för detaljerad vägledning om installation, användning och migrering. Google Gemini API och @google/genai SDK:et har stor potential att möjliggöra innovativa AI-drivna applikationer i JavaScript och Node.js, och genom att följa rekommendationen att använda det nya SDK:et kommer utvecklare att vara väl positionerade för att dra nytta av de ständigt växande möjligheterna.

#### **Works cited**

1. Google Gen AI SDK | Gemini API | Google AI for Developers, accessed March 29, 2025, [https://ai.google.dev/gemini-api/docs/sdks](https://ai.google.dev/gemini-api/docs/sdks)  
2. Google Gen AI SDK | Generative AI, accessed March 29, 2025, [https://cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview](https://cloud.google.com/vertex-ai/generative-ai/docs/sdks/overview)  
3. googleapis/js-genai: TypeScript/JavaScript SDK for Gemini and Vertex AI. \[PREVIEW\], accessed March 29, 2025, [https://github.com/googleapis/js-genai](https://github.com/googleapis/js-genai)  
4. Explore vision capabilities with the Gemini API | Google AI for Developers, accessed March 29, 2025, [https://ai.google.dev/gemini-api/docs/vision](https://ai.google.dev/gemini-api/docs/vision)  
5. Gemini API docs \- Gemini API | Google AI for Developers, accessed March 29, 2025, [https://ai.google.dev/gemini-api/docs](https://ai.google.dev/gemini-api/docs)  
6. Live API | Gemini API | Google AI for Developers, accessed March 29, 2025, [https://ai.google.dev/gemini-api/docs/live](https://ai.google.dev/gemini-api/docs/live)  
7. google-gemini/generative-ai-js: The official Node.js / Typescript library for the Google Gemini API \- GitHub, accessed March 29, 2025, [https://github.com/google-gemini/generative-ai-js](https://github.com/google-gemini/generative-ai-js)  
8. generative-ai-js \- Codesandbox, accessed March 29, 2025, [http://codesandbox.io/p/github/Reamd7/generative-ai-js](http://codesandbox.io/p/github/Reamd7/generative-ai-js)  
9. Migrate from Gemini on Google AI to Vertex AI | Generative AI \- Google Cloud, accessed March 29, 2025, [https://cloud.google.com/vertex-ai/generative-ai/docs/migrate/migrate-google-ai](https://cloud.google.com/vertex-ai/generative-ai/docs/migrate/migrate-google-ai)  
10. Upgrade the Google GenAI SDK for Python \- Gemini API, accessed March 29, 2025, [https://ai.google.dev/gemini-api/docs/migrate](https://ai.google.dev/gemini-api/docs/migrate)  
11. Gemini models | Gemini API | Google AI for Developers, accessed March 29, 2025, [https://ai.google.dev/gemini-api/docs/models](https://ai.google.dev/gemini-api/docs/models)  
12. Release notes | Gemini API | Google AI for Developers, accessed March 29, 2025, [https://ai.google.dev/gemini-api/docs/changelog](https://ai.google.dev/gemini-api/docs/changelog)  
13. Gemini 2 | Generative AI | Google Cloud, accessed March 29, 2025, [https://cloud.google.com/vertex-ai/generative-ai/docs/gemini-v2](https://cloud.google.com/vertex-ai/generative-ai/docs/gemini-v2)  
14. Google Gen AI SDK for JavaScript \- Gemini API, accessed March 29, 2025, [https://discuss.ai.google.dev/t/google-gen-ai-sdk-for-javascript/64554](https://discuss.ai.google.dev/t/google-gen-ai-sdk-for-javascript/64554)