To jest bardzo dobry moment na taki etap. Po domknięciu MVP **nie dokładałbym teraz kolejnych dużych funkcji**. Najpierw zrobiłbym z działającego MVP przewidywalny, odporny i łatwy do rozwijania fundament.

Twoja obecna architektura już jest sensowna:

```text
domain
application
infrastructure
composition
```

To nie wygląda jak projekt wymagający przepisywania. Potrzebuje raczej **kontrolowanego utwardzenia**, uporządkowania kilku dużych plików i zabezpieczenia granic systemu.

# Główny cel

Zamiast abstrakcyjnego „pełna stabilność”, ustaliłbym konkretną definicję:

Projekt jest stabilny, gdy:

- ten sam input daje deterministyczny rezultat;
- przerwany model lub tool nie pozostawia niepoprawnego stanu;
- edycja pliku nie może przypadkowo uszkodzić pliku;
- uszkodzona sesja nie wywraca całej aplikacji bez zrozumiałego komunikatu;
- wszystkie błędy są obsłużone i zapisane w przewidywalny sposób;
- `main` zawsze przechodzi testy, typecheck i build;
- artefakty Linux i Windows są faktycznie sprawdzone;
- zmiany architektoniczne nie zmieniają zachowania bez testu regresyjnego.

Docelowo nazwałbym ten etap:

```text
MVP Stabilization / 1.0 Hardening
```

---

# Etap 0 — zamrożenie stabilnego punktu bazowego

Zanim zaczniesz refaktorować, warto ustanowić jeden twardy punkt odniesienia.

## 0.1. Wszystkie testy muszą być deterministyczne

Dodane przez Ciebie sortowanie `ripgrep` jest dokładnie właściwym typem poprawki.

Sprawdź kilka pełnych uruchomień:

```bash
bun test
bun test
bun test
```

Nie chodzi tylko o jedno zielone wykonanie. Test nie powinien przechodzić losowo.

Wszystkie operacje, które zwracają kolekcje, powinny mieć ustaloną kolejność:

- `search_file`;
- `list_files`;
- lista sesji;
- lista tooli;
- rezultaty łączone z kilku źródeł.

## 0.2. Jeden główny skrypt kontrolny

W `package.json` brakuje obecnie czytelnych skryptów jakościowych. Dodałbym:

```json
{
  "scripts": {
    "start": "bun run index.tsx",
    "test": "bun test",
    "typecheck": "bunx tsc --noEmit",
    "build": "bun run scripts/build.ts",
    "check": "bun run typecheck && bun run test"
  }
}
```

Po rozdzieleniu buildów:

```json
{
  "scripts": {
    "build:linux": "bun run scripts/build-linux.ts",
    "build:windows": "bun run scripts/build-windows.ts",
    "check": "bun run typecheck && bun run test && bun run build:linux"
  }
}
```

Codzienny kontrakt projektu powinien być prosty:

```bash
bun run check
```

## 0.3. Przenieś TypeScript do `devDependencies`

Projekt jest prywatną aplikacją, a nie biblioteką publikowaną w npm. Dlatego:

```json
"peerDependencies": {
  "typescript": "^6.0.3"
}
```

nie jest najlepszym miejscem.

Lepiej:

```json
"devDependencies": {
  "typescript": "6.0.3"
}
```

Dzięki temu świeży checkout ma gwarantowaną wersję kompilatora.

Dodałbym również:

```json
"packageManager": "bun@1.3.14"
```

To ograniczy różnice między środowiskami.

## 0.4. CI na każdym pushu i pull requeście

Obecnie nie widzę workflow CI. To powinien być jeden z pierwszych kroków.

Minimalny CI:

```text
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build:linux
```

Windows powinien być sprawdzany osobno na natywnym runnerze Windows. Nie opierałbym całej weryfikacji Windows na cross-compilacji uruchamianej lokalnie z Linuksa.

### Koniec etapu 0

Etap jest zamknięty, gdy:

```text
fresh clone
→ bun install --frozen-lockfile
→ bun run check
→ wszystko przechodzi
```

---

# Etap 1 — stabilność granic systemu

To jest najważniejsza część roadmapy.

Najwięcej problemów produkcyjnych zwykle nie powstaje w czystej logice domenowej, ale na granicach:

- model;
- filesystem;
- proces `ripgrep`;
- persistence;
- terminal;
- przerwanie działania.

## 1.1. Utwardzenie kontraktu Ollamy

Obecne zmiany są dobrym fundamentem:

- wymagane `done: true`;
- błędny JSON zatrzymuje rundę;
- tool nie wykonuje się przed zakończeniem streamu;
- argumenty są walidowane;
- wynik toola jest atomowy.

Dodałbym jeszcze testy kontraktowe dla:

### Pusta odpowiedź zakończona poprawnie

```text
content: ""
tool_calls: []
done: true
```

Aplikacja powinna zakończyć rundę deterministycznie.

### Błąd Ollamy po wcześniejszych deltach

```text
content delta
content delta
error frame
```

Nie powinno powstać `assistant.message.completed`.

### Tool call i błąd przed `done: true`

```text
tool_call
stream error
```

Tool nie może się wykonać.

### Kilka tool calli w jednym response

Sprawdź:

- kolejność;
- pojedyncze wykonanie każdego calla;
- zachowanie, gdy drugi tool się nie powiedzie;
- zachowanie, gdy drugi wymaga approval.

### Powtórzony tool call w kolejnych ramkach

Nie implementowałbym od razu zaawansowanej deduplikacji, ale dodałbym test dokumentujący obecny kontrakt Ollamy.

Założenie powinno być jawne:

```text
jeden kompletny tool_call pojawia się dokładnie raz
w jednej ramce NDJSON
```

Dopóki realny model tego nie łamie, nie ma sensu budować składania fragmentów.

## 1.2. Obsługa anulowania

Obecnie masz cleanup czytnika streamu, ale brakuje pełnego kontraktu anulowania od UI do `fetch`.

Docelowy przepływ:

```text
UI
→ AbortController
→ RunAgentTurn
→ ModelPort
→ OllamaModelAdapter
→ fetch(signal)
```

Minimalna zmiana:

```ts
export type RunAgentTurnInput = {
  sessionId: SessionId;
  prompt: string;
  modelName?: string;
  signal?: AbortSignal;
};
```

oraz:

```ts
export type ModelChatInput = {
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  signal?: AbortSignal;
};
```

Adapter:

```ts
await fetch(url, {
  method: 'POST',
  signal: input.signal,
  // ...
});
```

Nie dodawałbym jeszcze rozbudowanego systemu timeoutów. Lokalny model może legalnie odpowiadać długo. Ważniejsze jest świadome anulowanie przez aplikację.

## 1.3. Odporność sesji JSONL

`JsonlSessionStore` obecnie:

```ts
JSON.parse(line) as AgentEvent
```

To oznacza, że:

- JSON jest parsowany;
- struktura zdarzenia nie jest walidowana runtime;
- jedna uszkodzona linia blokuje całą sesję;
- częściowo zapisana ostatnia linia po awarii może uniemożliwić odczyt.

To jest jeden z najważniejszych punktów stabilności.

### Minimalna poprawa

Rozróżnij:

1. uszkodzoną linię w środku pliku;
2. niekompletną ostatnią linię bez końcowego `\n`.

Niekompletna ostatnia linia może być skutkiem przerwania procesu podczas zapisu. W takim przypadku aplikacja może:

- odczytać wszystkie wcześniejsze poprawne zdarzenia;
- zgłosić ostrzeżenie;
- nie udawać, że fragment jest poprawnym eventem.

Natomiast uszkodzona linia w środku powinna nadal dawać wyraźny błąd.

Testy:

```text
poprawny event
poprawny event
niekompletny fragment na końcu
```

oraz:

```text
poprawny event
uszkodzony JSON
poprawny event
```

Drugi przypadek nie powinien być cicho ignorowany.

### Walidacja runtime

Masz już Zod. Możesz wykorzystać go na granicy persistence.

Nie musisz od razu tworzyć systemu migracji. Wystarczy walidacja podstawowych pól:

- `id`;
- `sessionId`;
- `timestamp`;
- `type`;
- pola wymagane dla danego typu.

Najlepszym miejscem walidacji jest odczyt z dysku, nie reducer.

## 1.4. Bezpieczne zapisywanie edycji

Aktualnie edycja wygląda logicznie dobrze:

```text
read
→ znajdź dokładnie jedno oldText
→ replace
→ writeFile
```

Ale sam `writeFile` zapisuje bezpośrednio do istniejącego pliku. Awaria procesu podczas zapisu może teoretycznie pozostawić plik częściowo zapisany.

Dla toola modyfikującego kod jest to ważniejsze niż większość ulepszeń UX.

Docelowo:

```text
odczyt oryginalnego pliku
→ przygotowanie nowej treści
→ zapis do pliku tymczasowego w tym samym katalogu
→ atomowe rename
```

Dodałbym również prostą ochronę przed równoczesną zmianą pliku:

```text
agent odczytał plik
→ użytkownik zmienił plik ręcznie
→ agent próbuje zapisać starą wersję
→ operacja powinna się zatrzymać
```

Nie budowałbym systemu locków. Wystarczy optimistic concurrency:

```text
zapisz tylko wtedy, gdy aktualna treść nadal odpowiada tej odczytanej
```

Może to wymagać rozszerzenia portu filesystemu, ale jest to uzasadniona zmiana architektoniczna, ponieważ chroni dane użytkownika.

## 1.5. Stabilność `ripgrep`

Po dodaniu sortowania sprawdziłbym jeszcze:

- brak binarki;
- timeout;
- exit code `1` oznaczający brak wyników;
- inny exit code;
- pusty stderr;
- bardzo długi stderr;
- bardzo dużo wyników;
- kilka alternatyw rozdzielonych `|`;
- deterministyczną kolejność po połączeniu zwykłych plików i bezpiecznych `.env`.

Nie dodawałbym własnego silnika wyszukiwania. `ripgrep` jest właściwym wyborem.

## 1.6. Build i dystrybucja

Aktualny `build.ts` buduje Linux i Windows w jednej operacji. To oznacza, że:

- poprawny build Linuksa może być oznaczony jako nieudany przez problem pobierania komponentu Windows;
- lokalne środowisko musi mieć dostęp sieciowy podczas builda;
- trudniej odróżnić problem aplikacji od problemu toolchainu.

Rozdzieliłbym:

```text
build:linux
build:windows
build:all
```

Do tego smoke test zbudowanego artefaktu:

```text
utwórz tymczasowy workspace
→ uruchom codesh
→ sprawdź, czy znajduje dołączone rg
→ sprawdź podstawowy start
```

Nie musi w CI uruchamiać prawdziwego modelu.

---

# Etap 2 — uporządkowanie testów

Testów jest dużo i pokrywają ważne zachowania. Problemem nie jest ich liczba, tylko koszt dalszego utrzymania.

`RunAgentTurn.test.ts` ma około 1400 linii i wiele osobnych klas:

```text
FakeModel
FailingModel
ToolCallingModel
ContentThenToolCallingModel
SearchCallingModel
InterruptedToolCallingModel
InvalidToolArgumentsModel
SearchThenReadModel
...
```

To działa, ale każdy nowy przypadek wymaga kolejnej klasy.

## 2.1. Jeden skryptowany model testowy

Zamiast kilkunastu klas można wprowadzić jednego prostego fake'a:

```ts
class ScriptedModel implements ModelPort {
  constructor(
    private readonly responses: Array<
      ModelStreamChunk[] | Error
    >,
  ) {}

  async *streamChat(
    input: ModelChatInput,
  ): AsyncIterable<ModelStreamChunk> {
    // zapisz input
    // pobierz kolejny response
    // wyemituj chunki albo rzuć błąd
  }
}
```

Przykład testu:

```ts
const model = new ScriptedModel([
  [
    {
      contentDelta: '',
      toolCalls: [
        {
          name: 'search_file',
          arguments: { query: 'UserRepository' },
        },
      ],
    },
  ],
  [
    { contentDelta: 'Znalazłem ' },
    { contentDelta: 'dwa użycia.' },
  ],
]);
```

To znacznie skróci testy bez budowania frameworka.

## 2.2. Jeden rejestrujący executor

Podobnie:

```ts
class RecordingToolExecutor implements ToolExecutorPort {
  readonly requests: ToolExecutionRequest[] = [];

  constructor(
    private readonly tools: ToolDefinition[],
    private readonly handler: (
      request: ToolExecutionRequest,
    ) => Promise<ToolExecutionResult>,
  ) {}
}
```

Nie twórz generycznej biblioteki mockingowej. Wystarczą 3–4 małe helpery testowe:

```text
ScriptedModel
RecordingToolExecutor
InMemorySessionStore
SequenceIdGenerator
```

Można je umieścić w:

```text
test/support/
```

## 2.3. Podział typów testów

Ustaliłbym cztery kategorie:

### Unit

Czyste funkcje i polityki:

- reducer;
- walidacja tool calli;
- parser komend;
- mapper Ollamy;
- alokacja szerokości Markdown.

### Integration

Prawdziwe komponenty infrastruktury:

- `JsonlSessionStore` na katalogu tymczasowym;
- `NodeWorkspaceFileSystem`;
- `RipgrepSearch`;
- `LocalToolExecutor`.

### Contract

Granice z zewnętrznym formatem:

- ramki Ollamy;
- tool calling;
- zakończenie `done: true`;
- JSON arguments.

### Smoke

- produkcyjny build;
- odnajdywanie `rg`;
- uruchomienie w pustym workspace.

Nie potrzebujesz teraz pogoni za procentem coverage. Ważniejsze jest pokrycie ryzyk.

---

# Etap 3 — czystość kodu

Dopiero po zamknięciu stabilności funkcjonalnej zrobiłbym czyszczenie.

## 3.1. Jeden formatter

Kod ma obecnie trochę mieszanego stylu:

- pojedyncze i podwójne cudzysłowy;
- różne formatowanie importów;
- różne układy nawiasów.

Wybrałbym **jeden formatter**, nie cały zestaw narzędzi.

Na tym etapie wystarczy Prettier albo Biome. Nie dodawałbym jednocześnie:

```text
Prettier
ESLint
Biome
dprint
lint-staged
Husky
```

To byłoby niepotrzebne.

Formatowanie całego projektu zrób jako osobny commit:

```text
style: format project
```

Bez zmian zachowania. Dzięki temu późniejsze diffy będą czytelniejsze.

## 3.2. Nie dodawaj lintera bez konkretnego celu

Masz już bardzo ścisły TypeScript:

- `strict`;
- `noUncheckedIndexedAccess`;
- `exactOptionalPropertyTypes`;
- `noPropertyAccessFromIndexSignature`;
- `noUnusedLocals`;
- `noUnusedParameters`;
- `noImplicitReturns`.

To już eliminuje dużą część typowych błędów.

Linter warto dodać dopiero, gdy masz konkretną klasę problemów, np.:

- nieobsłużone Promise;
- przypadkowe zależności między warstwami;
- niebezpieczne typy.

Nie dodawałbym 150 reguł stylistycznych.

## 3.3. Usuń lub wyjaśnij martwe kontrakty

W domenie masz:

```text
assistant.message.started
assistant.message.delta
```

ale obecny system nie zapisuje delt.

Tutaj trzeba podjąć świadomą decyzję:

- albo typy zostają jako kompatybilność ze starszym event logiem;
- albo są usuwane jako niewykorzystywane.

Nie zostawiałbym ich bez komentarza, ponieważ sugerują funkcję, której system obecnie nie używa.

Podobnie:

```ts
durationMs?: number;
```

w `ToolCallCompleted` jest obecne, ale nie jest ustawiane. Albo zacznij je mierzyć, albo usuń do czasu realnej potrzeby.

## 3.4. Aktualizacja README

README nie jest już w pełni zgodne z projektem.

W kodzie masz również:

- `list_files`;
- `create_file`;

a README nadal opisuje głównie:

- `search_file`;
- `read_file`;
- `edit_file`.

Dokumentacja powinna być traktowana jak część stabilności. Nieaktualna dokumentacja prowadzi do błędnych decyzji podczas późniejszych refaktorów.

Dodałbym:

```text
docs/ARCHITECTURE.md
docs/ROADMAP.md
```

`ARCHITECTURE.md` powinien być krótki, maksymalnie kilka ekranów.

---

# Etap 4 — uporządkowanie folderów i odpowiedzialności

Aktualny podział clean architecture jest dobry. Nie zmieniałbym jego podstaw.

Największą niespójnością jest warstwa prezentacji znajdująca się bezpośrednio w `src`:

```text
src/App.tsx
src/Markdown.tsx
```

## Proponowana struktura

```text
src/
  domain/
    AgentEvent.ts
    AgentState.ts
    Ids.ts
    ModelMessage.ts
    Tool.ts

  application/
    ports/
    services/
    use-cases/

  infrastructure/
    file-system/
    model/
    persistence/
    runtime/
    tools/

  presentation/
    App.tsx
    InteractiveApp.tsx
    SessionPicker.tsx
    TranscriptView.tsx
    Composer.tsx
    Markdown.tsx

  composition/
    config.ts
    createRuntime.ts
    factories/
```

Nie tworzyłbym na raz:

```text
controllers/
presenters/
view-models/
gateways/
repositories/
interactors/
entities/
shared/
common/
core/
```

To byłoby sztuczne.

## 4.1. Podział `App.tsx`

`App.tsx` ma około 930 linii i zawiera:

- wybór sesji;
- ładowanie transkryptu;
- uruchamianie turnu;
- obsługę approval;
- edycję inputu;
- komendy `/model`;
- renderowanie nagłówka;
- renderowanie wiadomości;
- composer.

Rozdzieliłbym go na kilka naturalnych fragmentów:

```text
App.tsx
SessionPicker.tsx
InteractiveApp.tsx
TranscriptView.tsx
Composer.tsx
```

`InteractiveApp` może nadal trzymać główny stan. Nie trzeba od razu budować:

- globalnego store;
- context providera;
- reducera UI;
- custom event busa.

Najpierw tylko przenieś spójne fragmenty do osobnych plików.

## 4.2. `Markdown.tsx`

`Markdown.tsx` jest duży, ale jest dość spójny tematycznie.

Nie rozdzielałbym go wyłącznie dlatego, że ma ponad 600 linii.

Można ewentualnie wydzielić czyste algorytmy:

```text
markdownLayout.ts
```

np.:

- `allocateColumnWidths`;
- `displayLength`;
- tekstowe helpery tokenów.

Renderery mogą zostać razem, dopóki ich rozwój nie staje się uciążliwy.

## 4.3. `RunAgentTurn.ts`

`RunAgentTurn` ma około 600 linii i wykonuje kilka odpowiedzialności:

- zapis promptu;
- budowanie kontekstu;
- model loop;
- streaming;
- walidację tool calli;
- cache;
- approval;
- wykonanie tooli;
- tworzenie eventów;
- obsługę błędów.

Nie rozbijałbym go od razu na sześć serwisów.

### Pierwsza sensowna ekstrakcja

Wydziel czystą walidację:

```text
application/services/ToolCallValidator.ts
```

Przenieś tam:

```ts
validateToolCalls
validateToolArguments
matchesSchemaType
describeSchemaType
isRecord
```

To dobra granica, ponieważ:

- walidacja jest czysta;
- nie potrzebuje IO;
- ma jasne testy;
- nie jest specyficzna dla UI;
- nie musi znać sesji.

### Czego jeszcze nie wydzielać

Na razie zostawiłbym w `RunAgentTurn`:

- model loop;
- cache tooli;
- approval;
- wykonywanie tooli;
- zapis eventów.

Dopiero gdy dodasz kolejny niezależny typ wykonania tooli albo drugi agent loop, będzie sens tworzyć osobny `ToolCallRunner`.

Nie wydzielałbym klasy tylko po to, aby zmniejszyć liczbę linii.

---

# Etap 5 — zasady architektury

W `ARCHITECTURE.md` zapisałbym kilka prostych reguł.

## Reguła zależności

```text
domain
↑
application
↑
infrastructure / presentation
↑
composition
```

Dokładniej:

- `domain` nie importuje niczego z aplikacji ani infrastruktury;
- `application` może importować domenę;
- `infrastructure` implementuje porty aplikacji;
- `presentation` korzysta z runtime/use case’ów, ale nie z adapterów Ollamy czy filesystemu;
- `composition` jest jedynym miejscem tworzącym konkretne implementacje.

## Reguła IO

IO powinno być na obrzeżach:

- `fetch` w infrastructure;
- filesystem w infrastructure;
- `Bun.spawn` w infrastructure;
- terminal w presentation;
- logika decyzji w application/domain.

## Reguła refaktoru

Każdy większy refaktor:

```text
najpierw test charakteryzujący zachowanie
→ potem przeniesienie kodu
→ brak zmian funkcjonalnych w tym samym commicie
```

To jest ważniejsze niż idealna struktura folderów.

---

# Etap 6 — release gate dla stabilnego MVP

Przed uznaniem projektu za stabilny ustaliłbym checklistę.

## Automatycznie

```text
[ ] bun install --frozen-lockfile
[ ] bun run typecheck
[ ] bun test
[ ] bun run build:linux
[ ] bun run build:windows
[ ] packaged rg smoke test
```

## Scenariusze ręczne

```text
[ ] zwykła odpowiedź bez toola
[ ] search_file → final
[ ] search_file → read_file → final
[ ] list_files → read_file → final
[ ] edit_file zatwierdzony
[ ] edit_file odrzucony
[ ] błędne argumenty toola
[ ] zatrzymanie Ollamy podczas streamu
[ ] restart CLI i odtworzenie sesji
[ ] pusty workspace
[ ] duże repozytorium
[ ] plik zbyt duży
[ ] próba dostępu poza workspace
[ ] symlink prowadzący poza workspace
[ ] brak binarki rg
```

Dla Ollamy warto ręcznie przetestować przynajmniej dwa modele:

- główny model używany przez Ciebie;
- drugi model wspierający tool calling.

Nie budowałbym automatycznego CI zależnego od działającej Ollamy.

---

# Czego teraz nie robić

W najbliższym etapie odłożyłbym:

- `run_command`;
- plugin system dla tooli;
- event bus;
- CQRS;
- generyczne bazowe klasy repozytoriów;
- własny kontener dependency injection;
- pełny silnik JSON Schema;
- zapisywanie każdego tokena jako event;
- system migracji z wieloma wersjami;
- rozbudowany settings screen;
- diff viewer;
- obsługę wielu providerów modeli;
- równoległe wykonywanie tooli;
- automatyczny rollback całego tool batcha;
- pełny logging framework;
- telemetrykę.

Nie dlatego, że te funkcje są złe. Po prostu nie zwiększają teraz stabilności proporcjonalnie do kosztu.

---

# Proponowana kolejność konkretnych zadań

Ułożyłbym backlog dokładnie w tej kolejności:

1. Dokończyć deterministyczne sortowanie i potwierdzić wielokrotne zielone testy.
2. Dodać `test`, `typecheck`, `check`, `build:linux`, `build:windows`.
3. Przenieść TypeScript do `devDependencies` i przypiąć wersję Bun.
4. Dodać CI dla testów, typechecku i buildów.
5. Rozdzielić build Linux i Windows.
6. Dodać test smoke dla dołączonego `rg`.
7. Utwardzić odczyt JSONL i obsłużyć niedokończoną ostatnią linię.
8. Dodać runtime validation eventów odczytywanych z dysku.
9. Zrobić bezpieczny, atomowy zapis `edit_file`.
10. Dodać ochronę przed nadpisaniem pliku zmienionego po odczycie.
11. Dodać `AbortSignal` do modelowego streamu.
12. Uzupełnić testy kontraktu Ollamy.
13. Uprościć `RunAgentTurn.test.ts` przez `ScriptedModel`.
14. Przenieść UI do `src/presentation`.
15. Rozdzielić `App.tsx` na kilka naturalnych komponentów.
16. Wydzielić czystą walidację tool calli z `RunAgentTurn`.
17. Ujednolicić formatowanie w osobnym commicie.
18. Zaktualizować README i dodać krótki `ARCHITECTURE.md`.
19. Wykonać pełną checklistę release.
20. Dopiero potem wrócić do nowych funkcji.

# Moja końcowa rekomendacja

Nie robiłbym „refaktoru clean architecture” jako jednego dużego zadania. Obecna architektura jest już wystarczająco dobra.

Najważniejsza kolejność to:

```text
deterministyczne testy
→ CI i powtarzalny build
→ bezpieczeństwo sesji i plików
→ obsługa przerwań
→ uproszczenie testów
→ uporządkowanie UI i dużych plików
→ dopiero nowe funkcje
```

Największą wartość dla projektu dadzą teraz nie nowe abstrakcje, lecz:

- odporna persistence;
- bezpieczne edycje;
- powtarzalne buildy;
- stabilne testy;
- małe, czytelne granice odpowiedzialności.

To doprowadzi projekt do stanu **stabilnego MVP 1.0**, bez zamieniania go w framework.
