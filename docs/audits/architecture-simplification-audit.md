# Local_Agentic_cli — architecture and simplification audit

Audited commit: `5aa8ffd`

Status: audyt bazowy przed uproszczeniami i refaktoryzacją.

Największy potencjał uproszczenia widzę w warstwach przekazujących wywołania oraz w kilku miejscach, które niezależnie zarządzają tą samą rozmową. Granice modelu, narzędzi i bezpiecznych operacji plikowych mają obecnie wyraźną wartość.

Audyt dotyczy stanu `5aa8ffd`. Sprawdziłem 75 modułów kodu uruchomieniowego, 6 skryptów infrastruktury budowania, 8 modułów pomocniczych testów i 36 plików testowych. **Stare materiały `.md` nie stanowią podstawy rekomendacji. Żadne pliki nie zostały zmienione.**

## A. Current architecture

CLI jest lokalnym agentem do pracy z kodem, wykorzystującym Ollamę, terminalowy interfejs Ink i pięć narzędzi operujących na bieżącym workspace.

Główna ścieżka wykonania:

1. [index.tsx](/home/karoljaron/Projects/Local_Agentic_CLI/index.tsx:1) rozpoznaje tryb startowy i uruchamia Ink.
2. [App.tsx](/home/karoljaron/Projects/Local_Agentic_CLI/src/App.tsx:21) tworzy runtime i kontroler prezentacji. `usePresentation` zarządza ekranami, modelem i zatwierdzeniami; `useComposer` edycją wejścia; `useChatSession` rozmową i aktywną odpowiedzią.
3. [createRuntime.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/composition/createRuntime.ts:45) odczytuje konfigurację, składa adaptery i udostępnia API dla UI.
4. [RunAgentTurn.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/application/use-cases/RunAgentTurn.ts:57) zapisuje prompt, buduje kontekst i wykonuje maksymalnie 12 rund modelowych.
5. `OllamaModelRuntime` przechowuje aktywny model i cache katalogu modeli. `OllamaModelAdapter`, `OllamaHttpClient`, mapper i parser streamu obsługują komunikację z Ollamą.
6. [ToolRunner.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/application/services/ToolRunner.ts:47) przygotowuje kompletny batch narzędzi, obsługuje approval, wykonuje wywołania kolejno i zapisuje ich zdarzenia.
7. `LocalToolRegistry` łączy schemat Zod, definicję dla modelu, wykonanie i metadane narzędzia. Operacje trafiają do `NodeWorkspaceFileSystem`, `RipgrepSearch` albo polityki `EditWorkspaceFile`.

**Streaming:** bajty HTTP → dekodowanie NDJSON → `ModelStreamChunk` → delta agenta → `StreamBuffer` z interwałem 32 ms → `LiveTurn`. Pętla agenta zbiera również treść odpowiedzi, aby zapisać ukończoną wiadomość. To uzasadnione rozdzielenie treści trwałej i aktualnie renderowanej.

**Sesje:** JSONL w `.agent/sessions/<id>/events.jsonl` jest źródłem trwałym. `SessionStateCache` przechowuje zdarzenia i przyrostowo odbudowany kontekst modelu. `PublishingSessionStore` powiadamia UI po udanym zapisie. Prezentacja ma osobny reducer historii i aktywnych narzędzi.

**Zależności:** domena zawiera czyste typy; aplikacja korzysta z portów; infrastruktura implementuje IO; composition tworzy konkretne implementacje. Nie znalazłem importów infrastruktury w logice aplikacyjnej.

**Narzędzia i zasoby:** odczyty są automatyczne, tworzenie i edycja wymagają approval. Odmowa kończy turę. Deduplikacja listowania i wyszukiwania działa w obrębie jednej tury, a mutacja ją unieważnia. Anulowanie dociera do modelowego `fetch`, lecz nie obejmuje wykonania narzędzi. Nie ma automatycznych retries.

**Testy i tooling:** testy obejmują pętlę agenta, odtwarzanie sesji, protokół Ollamy, filesystem, ripgrep i renderowanie terminala. Build kompiluje samodzielne programy Linux/Windows i dołącza `rg`. TypeScript ma ścisłe sprawdzanie typów; Biome służy do formatowania.

## B. Highest-value simplifications

### 1. Usunąć warstwy przekazujące wywołania między UI a runtime

**Pliki/symbole:** [PresentationController.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/presentation/adapters/PresentationController.ts:32), `RuntimePresentationController`, `ListSessions`, `ListSessionEvents`, `Runtime`.

**Obecnie:** pobranie zdarzeń przechodzi przez kontroler, obiekt runtime, klasę use case i store. Klasy listujące opakowują tablice w `{ sessions }` lub `{ events }`, po czym kontroler natychmiast je rozpakowuje. Większość metod kontrolera deleguje wywołania.

**Złożoność:** kilka kontraktów i klas opisuje prawie tę samą powierzchnię API. Rzeczywista polityka kontrolera sprowadza się głównie do unload przed zmianą modelu.

**Prostszy kształt:** `createRuntime` zwraca bezpośrednio małe API wymagane przez prezentację. Zachować wstrzykiwanie tego API do `App`; operację unload-and-switch umieścić przy właścicielu aktywnego modelu. Ewentualne sprawdzanie przynależności zdarzeń do sesji pozostawić w warstwie sesji.

**Korzyść:** usunięcie trzech klas i zbędnych opakowań wyników, krótsze ścieżki wywołań, zachowana możliwość testowania UI.

**Ryzyko: low.**

### 2. Budować kontekst modelu w jednym miejscu

**Pliki/symbole:** [RunAgentTurn.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/application/use-cases/RunAgentTurn.ts:206), [SessionReducer.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/application/services/SessionReducer.ts:116), `ToolRunner.executeToolCalls`.

**Obecnie:** reducer odbudowuje wiadomości assistant/tool ze zdarzeń. Równocześnie `ToolRunner` produkuje `toolMessages`, a pętla agenta ręcznie dokleja je do `currentMessages`.

**Złożoność:** istnieją dwie implementacje składania rozmowy oraz powielona serializacja wyników narzędzi. Testy muszą pilnować zgodności obu ścieżek.

**Prostszy kształt:** po zakończonym batchu pobierać aktualny stan z przyrostowego reducera i przepuszczać go przez `ContextBuilder`. `ToolRunner` zapisuje zdarzenia i zwraca informację o zakończeniu tury, bez budowania drugiej reprezentacji historii.

**Korzyść:** jedno źródło zasad tworzenia kontekstu dla pracy bieżącej i wznowienia; mniej mapowania oraz mniejsze ryzyko rozjechania formatów błędów i wyników.

**Ryzyko: medium.** Zachować atomowość batcha, kolejność wyników i wykluczanie niedokończonych wywołań.

### 3. Uporządkować własność sesji i oddzielić preview od cache agenta

**Pliki/symbole:** [SessionStateCache.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/application/services/SessionStateCache.ts:13), `PublishingSessionStore`, konstruktor `AgentLoop`, [usePresentation.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/presentation/hooks/usePresentation.ts:86).

**Obecnie:**

- Cache i publikowanie są osobnymi dekoratorami tego samego store.
- Pętla agenta rozpoznaje konkretną klasę przez `instanceof` i warunkowo tworzy kolejny cache.
- Resume odczytuje wszystkie sesje przez cache agenta.
- Każda odczytana sesja zachowuje pełne zdarzenia i zredukowany stan w mapie bez usuwania wpisów.

**Złożoność:** ukryta inicjalizacja w konstruktorze zaciera własność cache. Samo wyświetlenie krótkich podglądów tworzy i zatrzymuje kontekst modelowy wszystkich sesji.

**Prostszy kształt:** jedna usługa sesji odpowiada za zapis, aktualizację cache i powiadomienia. Powstaje jawnie w composition. Odczyt podglądów nie aktywuje pełnego cache modelowego; pełny stan ładuje wybrana sesja.

**Korzyść:** czytelniejsza kolejność commitów, mniej delegacji i mniejsza pamięć zajmowana przez przeglądanie historii.

**Ryzyko: medium.** Zachować serializację zapisów, izolację błędów obserwatorów oraz zasadę aktualizacji pamięci po udanym zapisie.

### 4. Ujednolicić zakończenie rundy w prezentacji

**Pliki/symbole:** [useChatSession.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/presentation/hooks/useChatSession.ts:58), `chatReducer`, `LiveTurn`.

**Obecnie:** końcowa wiadomość i błąd są przechwytywane w refach, a później zamieniane na lokalne wpisy. Wiadomość pośrednia jest obsługiwana bezpośrednio przez reducer. Status odpowiedzi zależy dodatkowo od lokalnego `receivedFirstDelta`.

**Potwierdzony problem:** po tekście pierwszej rundy zdarzenie `assistant.tool_calls.completed` ustawia `waiting`. Następna delta nie ustawia ponownie `streaming`, ponieważ `receivedFirstDelta` nadal wynosi `true`.

Sprawdzenie w pamięci dało:

```text
turnStatus: waiting
bufferedLiveText: Next round live text.
```

`LiveTurn` pokazuje tę treść wyłącznie przy `streaming`.

**Prostszy kształt:** jeden sposób zatwierdzania ukończonej wiadomości ze zdarzenia trwałego; osobna obsługa wyłącznie nietrwałego fragmentu po przerwaniu. Przejście do `streaming` powinno dotyczyć każdej rundy i korzystać z idempotentnej akcji reducera.

**Korzyść:** mniej rekoncyliacji między refami, streamem i historią oraz usunięcie potwierdzonej niespójności statusu.

**Ryzyko: medium.** Zachować pojedynczy wpis końcowy, częściową odpowiedź po anulowaniu i flush na granicy rundy.

### 5. Przygotowywać narzędzie raz

**Pliki/symbole:** [LocalToolExecutor.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/infrastructure/tools/LocalToolExecutor.ts:31), `ToolRunner.prepareToolCalls`, `getToolDefinition`.

**Obecnie:** cały batch jest parsowany przez `prepare`. Podczas wykonania `LocalToolRegistry.execute` ponownie wywołuje `prepare`. Metadane są dodatkowo wyszukiwane przez `ToolRunner` w osobnej tablicy definicji.

**Potwierdzenie:** pojedyncze wywołanie narzędzia uruchomiło walidację schematu dwa razy.

**Prostszy kształt:** przygotowanie zwraca znormalizowane wywołanie wraz z potrzebnymi metadanymi; wykonanie korzysta z przygotowanego wyniku. Walidację wszystkich elementów nadal zakończyć przed pierwszą operacją IO.

**Korzyść:** jedna walidacja i jedna decyzja o wyborze narzędzia; mniej powtarzanego dispatchu. Można również wygenerować niezmienne definicje modelowe raz przy tworzeniu registry.

**Ryzyko: medium.** Bezpośrednie publiczne wywołanie executora musi nadal mieć bezpieczną granicę walidacji.

### 6. Rozdzielić wykonanie narzędzia, zapis wyniku i anulowanie

**Pliki/symbole:** [ToolRunner.ts](/home/karoljaron/Projects/Local_Agentic_CLI/src/application/services/ToolRunner.ts:127), `executeToolCalls`, `requestToolApproval`, `RunAgentTurn`.

**Obecnie:** jeden `try/catch` obejmuje wykonanie, pomiary, serializację i zapis `tool.call.completed`. `ToolRunner` nie otrzymuje sygnału anulowania. Wyjątek handlera approval jest zamieniany na odmowę.

**Potwierdzone problemy w sprawdzeniach pamięciowych:**

- Po anulowaniu sygnału podczas approval executor nadal został wywołany.
- Narzędzie zakończyło się sukcesem, ale błąd zapisu wyniku został zapisany jako `TOOL_FAILED` i przekazany modelowi jako błąd narzędzia.

**Prostszy kształt:** osobna granica przechwytywania błędu wykonania; zapis trwały poza nią. Awaria persistence przerywa turę z prawdziwą przyczyną. Ten sam sygnał anulowania przechodzi przez rundy, oczekiwanie na approval i wykonanie, ze sprawdzeniem przed kolejnymi operacjami.

**Korzyść:** mniej zależności między niezwiązanymi etapami i prostsze znaczenie błędów. Model otrzymuje informację odpowiadającą rzeczywistemu wynikowi operacji.

**Ryzyko: high.** Trzeba poprawnie zachować przypadek mutacji już wykonanej przed błędem zapisu lub anulowaniem.

## C. Smaller simplifications

| Obszar | Uproszczenie | Ryzyko |
|---|---|---|
| `RunAgentTurn.readModelResponse` | Usunąć `streamContent`: obaj wywołujący przekazują `true`. | low |
| Ścieżka bez narzędzi | Połączyć `runStreamingModelTurn` ze wspólną obsługą rund; brak narzędzi jest wariantem wejścia. | medium |
| `TemporalClock` | Rozważyć `new Date().toISOString()`. Obecne użycie Temporal ogranicza się do timestampu UTC. Zachować `ClockPort`; sprawdzić potrzebę dokładności poniżej milisekundy. | low |
| `BunUuidV7IdGenerator` | Usunąć odtworzony `BunWithUuidV7` i cast — zainstalowane typy Bun już deklarują tę funkcję. | low |
| Typy | Usunąć aliasy bez dodatkowej semantyki, np. `ListedSessionEvent`; uprościć `OllamaModelAdapter & ModelMemoryPort`, bo klasa już implementuje ten port. | low |
| `RipgrepSearch` | Metoda `search` deleguje do funkcji z pełną implementacją. Można umieścić implementację bezpośrednio w metodzie. | low |
| Polityka workspace | Współdzielić listę chronionych katalogów i dozwolonych plików `.env` między filesystemem i ripgrep. Zachować kontrole obu adapterów. | medium |
| Konfiguracja | Ustalić jedno źródło produkcyjnych defaultów modelu i budżetu kontekstu; obecnie występują w config oraz konstruktorach usług. | low |
| `ContextBuilder.fit` | Zamiast wielokrotnie serializować narastający kontekst, obliczać rozmiary tur raz. Obecna implementacja powtarza pracę dla kolejnych kandydatów. | medium |
| Build | Wspólny fragment kompilacji Linux/Windows można sprowadzić do jednej małej funkcji z parametrami target/outfile. Zachować osobne komendy platformowe. | low |
| Testy | Ograniczyć powtarzanie pełnych zdarzeń i konkretnych numerów ID w `RunAgentTurn.test.ts`. Zachować pełne testy kolejności i zgodności live/resume; pozostałe asercje skupić na zachowaniu. | low |

`EditWorkspaceFile` ma też mały problem semantyczny: `replace(oldText, newText)` interpretuje specjalne sekwencje replacement, np. `$&`. Callback replacement albo składanie tekstu wokół znalezionego indeksu lepiej wyraża literalną edycję. To zmiana poprawności, którą należy rozpatrywać osobno od czystego porządkowania kodu.

## D. Dead / suspicious code

### Confirmed unused

- [CompletedAssistant](/home/karoljaron/Projects/Local_Agentic_CLI/src/presentation/types.ts:51) — brak użyć poza deklaracją.
- `session.load-started` w `ChatAction` — istnieje deklaracja i gałąź reducera, lecz brak dispatchu, także w testach.
- Wariant `streamContent = false` — żaden caller go nie wykorzystuje.
- Wykluczenie `src/ui_old` w `tsconfig.json` — wskazany katalog nie istnieje w obecnym drzewie.

Nie znalazłem całego nieużywanego modułu kodu uruchomieniowego: **wszystkie 75 są osiągalne z entrypointu**.

### Probably unused

- `forceRefresh` katalogu modeli — używany w testach, bez produkcyjnego callera; kontroler prezentacji go nie udostępnia.
- `ListedModel.modifiedAt` i `sizeBytes` — parser je tworzy, testy sprawdzają, lecz UI ich nie konsumuje.
- Eksporty stałych `*_TOOL_NAME` — same stałe są używane, ale wyłącznie we własnych plikach. Wystarczy ograniczyć ich widoczność.

### Requires verification

- **Legacy replay** w `SessionReducer`: bieżący producent zapisuje batche, ale starsze sesje mogą wymagać istniejącej ścieżki kompatybilności. Nie usuwać jej na podstawie samego grafu użyć.
- **`react-devtools-core`:** brak bezpośrednich użyć projektu, ale Ink korzysta z niego opcjonalnie przy `DEV=true`. To zależność opcjonalnej funkcji, a nie potwierdzona martwa paczka.
- **`getAgentMetrics`:** brak konsumenta w UI; istnieje API diagnostyczne i aktywne zbieranie danych. Jego przydatność wymaga decyzji produktowej.
- **Kontynuacja `read_file`:** limit znaków może uciąć środek linii. Potwierdziłem, że odczyt `abcde` z linii `abcdefghij` raportuje `endLine: 1`; kontynuacja od linii 2 pomija `fghij`. Obecny kontrakt zakresów nie zapewnia pełnej kontynuacji takiego odczytu.
- **Smoke test:** uruchamia CLI z `stdin: 'ignore'`, więc kończy na guardzie terminala. Osobno sprawdza binarkę `rg`; nie dowodzi pełnego interaktywnego przepływu ani wyszukiwania przez narzędzie agenta.

## E. Things that should NOT be simplified

- **`ModelPort` i adapter Ollamy.** `ScriptedModel` pokazuje rzeczywistą korzyść testową. Mapper, HTTP i parser izolują protokół od pętli agenta.
- **Podział pętla agenta / `ToolRunner`.** Druga klasa ma własną odpowiedzialność i stan deduplikacji ograniczony do tury.
- **Registry oparty na Zod.** Jeden schemat obsługuje walidację i generowanie definicji modelowej. Generyk w `defineLocalTool` wiąże schemat z typem wejścia executora.
- **Atomowe odtwarzanie batchy.** Mapy oczekujących wywołań chronią kontekst przed częściowymi wynikami.
- **Bezpieczeństwo filesystemu.** `realpath`, symlinki, limity, zapis przez plik tymczasowy, `wx` i porównanie oczekiwanej treści realizują konkretne wymagania.
- **`EditWorkspaceFile`.** Zawiera realną politykę dokładnie jednego dopasowania i ochrony przed nadpisaniem zmienionej treści.
- **`StreamBuffer` oraz osobny `LiveTurn`.** Ograniczają częstotliwość renderowania bez kopiowania historii przy każdej delcie.
- **Dwa reducery: modelowy i prezentacyjny.** Produkują różne widoki danych. Współdzielić należy zasady składania kontekstu modelowego, nie oba reducery.
- **`SelectionScreen` i małe komponenty interaktywne.** Mają kilku rzeczywistych konsumentów i usuwają powtarzaną obsługę klawiatury.
- **Zegary i generator ID jako wstrzykiwane zależności.** Testy rzeczywiście korzystają z deterministycznych implementacji.
- **Cleanup czytników, procesów, timerów i subskrypcji.** Ta złożoność zapewnia kontrolę zasobów.

## F. Proposed target architecture

Najprostszy sensowny układ zachowuje obecne główne granice, z wyraźną własnością:

| Moduł | Odpowiedzialność |
|---|---|
| Runtime/composition | Konfiguracja, tworzenie zależności, małe API dla UI. |
| Agent loop | Rundy modelu, budżet kontekstu, limity, anulowanie i zakończenie tury. |
| Tool runner + registry | Jednorazowe przygotowanie batcha, approval, wykonanie, deduplikacja i lifecycle. |
| Session service + reducer | Zapis JSONL przez adapter, cache wybranych sesji, publikowanie commitów i jedyne składanie wiadomości modelowych. |
| Ollama integration | Aktywny model, katalog, unload, HTTP, mapowanie i NDJSON. |
| Workspace adapters | Bezpieczne operacje plikowe i ograniczone wyszukiwanie ripgrep. |
| Presentation | Ekrany, draft, historia użytkownika, aktywny stream i decyzje approval. |

Docelowo UI wywołuje runtime bez klas przekazujących te same operacje. Agent pobiera kontekst z usługi sesji zamiast równolegle budować własną historię. Preview sesji pozostaje lekkim odczytem. JSONL, aktualne narzędzia i interfejs terminalowy wystarczają dla obecnego zakresu funkcjonalnego.

Zmiana nazw folderów ani przenoszenie plików nie jest potrzebne do osiągnięcia tych korzyści.

## G. Refactor boundaries

| Niezależny obszar | Zakres | Co musi pozostać prawdziwe |
|---|---|---|
| API runtime | Kontroler, klasy listujące, opakowania wyników. | UI nadal można testować przez wstrzyknięte API; zmiana modelu zachowuje unload. |
| Kontekst modelu | Ręczne `currentMessages`, `toolMessages`, serializacja. | Live i replay dają równoważną rozmowę; batche pozostają atomowe. |
| Usługa sesji | Cache, publikowanie, preview i inicjalizacja. | Nieudany zapis nie aktualizuje pamięci; restart odbudowuje stan z JSONL. |
| Streaming UI | Status rundy, finalizacja wiadomości, refy. | Kolejne rundy streamują; historia nie zawiera duplikatów; partial output jest zachowany. |
| Przygotowanie narzędzi | Powtórna walidacja i lookup metadanych. | Cały batch jest poprawny przed pierwszą operacją IO. |
| Lifecycle i błędy | Anulowanie, approval, wykonanie i persistence. | Anulowanie zatrzymuje kolejne operacje; błędy zapisów nie udają błędów narzędzia. |
| Małe porządki | Typy, defaulty, zegar, build i powtarzalne testy. | Zmiany są lokalne i zachowują istniejące kontrakty. |

Weryfikacja audytu: typecheck bez emisji i cache przyrostowego przeszedł; pięć sprawdzeń w pamięci potwierdziło opisane zachowania. Pełnej suite ani buildów nie uruchamiałem, ponieważ tworzą pliki. Końcowy worktree pozostaje czysty.
