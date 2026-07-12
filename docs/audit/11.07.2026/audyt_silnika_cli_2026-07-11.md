# Audyt silnika Local Agentic CLI

**Data:** 11 lipca 2026  
**Zakres:** engine bez UI, aktualny stan gałęzi `main`  
**Cel:** stabilizacja istniejącego MVP przed dodaniem kolejnych narzędzi i polityk działania modelu

## Werdykt

Silnik ma dobry fundament i nie wymaga przepisywania. Granice dla modelu, sesji, filesystemu i wyszukiwania są czytelne, operacje zapisu mają approval, ścieżki są chronione przed wyjściem poza workspace, a kontrakt streamu Ollamy jest dobrze przetestowany.

Największe problemy nie dotyczą obecnie brakujących warstw. Są nimi:

1. kontekst live i kontekst po wznowieniu sesji nie są równoważne;
2. historia oraz wyniki narzędzi rosną bez budżetu;
3. limity części narzędzi ograniczają tylko zwracany rezultat, a nie wykonaną pracę;
4. kontrakt narzędzia jest walidowany w kilku miejscach;
5. część klas aplikacyjnych jedynie przekazuje wywołanie dalej;
6. `RunAgentTurn` skupia zbyt wiele odpowiedzialności.

Rekomendacja ogólna: **najpierw naprawić zgodność stanu i ograniczyć zasoby, następnie uprościć rejestr narzędzi i orkiestrację**. Nie dodawać jeszcze planera, DI containera, AST indexera ani rozbudowanych polityk agenta.

## Stan bazowy

W momencie audytu:

- typecheck przechodzi;
- testy: **130 pass, 0 fail**;
- produkcyjna część `domain + application + infrastructure + composition`: **3316 linii w 47 plikach**;
- największy plik silnika: `RunAgentTurn.ts`, **546 linii**;
- trwały zapis sesji działa jako append-only JSONL;
- `read_file`, `list_files` i `search_file` są wykonywane automatycznie;
- `create_file` i `edit_file` wymagają approval;
- jedna tura ma limit 12 rund narzędziowych.

Tymczasowe `OLLAMA_KEEP_ALIVE=0` pozostaje poza zakresem tego audytu. Jest świadomym zabezpieczeniem do czasu ponownego testu na nowszej wersji Ollamy.

## Priorytety

| Priorytet | Problem | Skutek | Rekomendacja |
|---|---|---|---|
| P0 | Niewierne odtworzenie batcha tool calli | Inny kontekst po resume niż live | Zapisywać kompletną wiadomość assistant z całym batchem |
| P0 | Brak budżetu kontekstu | Rosnące opóźnienie, przekroczenie okna modelu | Ograniczone odczyty i deterministyczny context budget |
| P1 | `rg` zbiera wszystkie trafienia przed limitem | Nieograniczone stdout, RAM i czas | Parsowanie strumieniowe i przerwanie po limicie |
| P1 | Pełne wyniki tooli w każdym kolejnym promptcie | Duplikacja tokenów i duże sesje | Mniejsze wyniki, zakresy linii i deduplikacja |
| P1 | Wielokrotna walidacja tool input | Rozjazd schematu i parsera | Jeden rejestr narzędzi z jednym schema/parserem |
| P1 | Automatyczna normalizacja `\\n` w edycjach | Możliwa zmiana intencji modelu | Zachować dokładny tekst po parsowaniu JSON |
| P2 | Brak metryk zasobów | Trudna ocena limitów i regresji | Mierzyć rundy, requesty oraz czas i output tooli |
| P2 | Pełny odczyt JSONL przed każdą turą | Koszt rośnie liniowo z sesją | Wczytać stan raz i aktualizować po udanym appendzie |
| P2 | Delegujące use case'y i nieużywany stan | Boilerplate bez izolowania logiki | Usunąć martwe i czysto przekazujące elementy |
| P2 | `RunAgentTurn` ma 546 linii | Trudne zmiany i testy | Rozdzielić agent loop od tool runnera |

## P0 - trwały kontekst nie odtwarza odpowiedzi modelu

**Status: wykonane 11 lipca 2026.** Wprowadzono `assistant.tool_calls.completed`, atomowe
odtwarzanie kompletnych batchy, zachowanie treści assistant, kompatybilność starych sesji oraz
domykanie pozostałych calli po odmowie approval.

### Stan wykryty podczas audytu

W bieżącej turze cały batch narzędzi jest przekazywany jako jedna wiadomość assistant:

```ts
{
  role: 'assistant',
  content,
  toolCalls: [call1, call2]
}
```

Następnie dołączane są wiadomości wynikowe obu narzędzi. Implementacja znajduje się w [`RunAgentTurn.ts`](../../../src/application/use-cases/RunAgentTurn.ts#L174).

W zapisie trwałym nie istnieje jednak event reprezentujący tę wiadomość modelu. Zapisywane są osobne `tool.call.requested`, a reducer tworzy wiadomość assistant dopiero przy każdym `tool.call.completed` albo `tool.call.failed`. Implementacja znajduje się w [`SessionReducer.ts`](../../../src/application/services/SessionReducer.ts#L29).

Dla jednego batcha dwóch wywołań live wygląda więc tak:

```text
assistant(call1, call2)
tool(result1)
tool(result2)
```

Po resume powstaje:

```text
assistant(call1)
tool(result1)
assistant(call2)
tool(result2)
```

Dodatkowo ginie `content` wygenerowany przez model razem z tool callami.

### Zrealizowana zmiana

Dodać event opisujący kompletną odpowiedź narzędziową modelu, na przykład:

```ts
type AssistantToolCallsCompleted = {
  type: 'assistant.tool_calls.completed';
  messageId: MessageId;
  sessionId: SessionId;
  content: string;
  toolCalls: Array<{
    id: ToolCallId;
    name: string;
    arguments: unknown;
  }>;
};
```

Identyfikatory całego batcha powinny zostać nadane przed rozpoczęciem wykonywania narzędzi. Reducer odtwarza wtedy dokładnie jedną wiadomość assistant, a eventy wyniku tylko dodają odpowiadające jej wiadomości tool.

Przy odmowie approval każdy call z zapisanego batcha musi dostać wynik końcowy. Niewykonane calle powinny zostać oznaczone np. `TOOL_BATCH_CANCELLED`, aby po resume nie pozostawić wiadomości assistant bez kompletu odpowiedzi tool.

### Kryteria akceptacji

- kontekst drugiej rundy zapisany live jest identyczny z kontekstem zbudowanym z eventów;
- test obejmuje batch co najmniej dwóch tool calli;
- test obejmuje tekst assistant razem z tool callami;
- test obejmuje błąd drugiego narzędzia;
- test obejmuje odmowę approval w środku batcha;
- stare pliki JSONL pozostają czytelne albo mają jawną migrację wersji.

## P0 - brak ograniczenia kontekstu

**Status: wykonane 11 lipca 2026.** `ContextBuilder` zachowuje bieżącą turę i najnowsze
kompletne tury w limicie `MAX_CONTEXT_CHARACTERS`. Budżet jest stosowany przed każdą rundą,
przekroczenie bieżącej tury zapisuje `CONTEXT_BUDGET_EXCEEDED`, `read_file` obsługuje zakresy i
limity 400 linii oraz 20 000 znaków, a `create_file` nie zwraca pełnej zapisanej treści.

[`ContextBuilder.ts`](../../../src/application/services/ContextBuilder.ts#L15) dodaje system prompt i wszystkie wiadomości sesji. [`RunAgentTurn.ts`](../../../src/application/use-cases/RunAgentTurn.ts#L88) przed każdą turą odczytuje wszystkie eventy, odbudowuje cały stan i przekazuje go do modelu.

Jednocześnie:

- `read_file` może zwrócić do 200 KB;
- pełny output narzędzia jest zapisywany do JSONL;
- pełny output trafia ponownie do każdej następnej rundy;
- limit 12 iteracji ogranicza liczbę rund, ale nie rozmiar każdej rundy.

To jest główne ryzyko wydajnościowe dla lokalnego modelu. Koszt ponownego odczytu pliku z dysku jest mały w porównaniu z kosztem ponownego przetworzenia jego zawartości przez model.

### Zrealizowana zmiana narzędzi

Rozszerzyć `read_file` o zakres:

```ts
{
  path: string;
  startLine?: number;
  endLine?: number;
}
```

Wynik powinien zawierać metadane:

```ts
{
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  content: string;
}
```

Domyślny odczyt powinien mieć twardy limit, np. 400 linii i dodatkowy limit bajtów. Model może jawnie poprosić o kolejny fragment.

### Zrealizowana zmiana kontekstu

Zastąpić obecny prosty `ContextBuilder` deterministyczną polityką techniczną, nie plannerem modelu:

1. zawsze zachować system prompt;
2. zawsze zachować aktualny prompt;
3. nigdy nie rozdzielać wiadomości assistant z tool callami od ich wyników;
4. dodawać wcześniejsze kompletne tury od najnowszej do najstarszej;
5. zatrzymać się po osiągnięciu konfigurowalnego budżetu;
6. na tym etapie nie generować automatycznych podsumowań przez model.

Na początek wystarczy konserwatywny budżet znaków lub bajtów. Dokładny tokenizer per model można dodać później, jeśli pomiary wykażą taką potrzebę.

### Kryteria akceptacji

- żaden pojedynczy wynik `read_file` nie może zużyć całego budżetu;
- kontekst nigdy nie zawiera osieroconego tool calla lub tool result;
- wynik budowania kontekstu jest deterministyczny;
- test obejmuje długą sesję, kilka dużych odczytów i zachowanie ostatnich tur;
- finalny request ma mierzalny i testowalny maksymalny rozmiar.

## P1 - limit `search_file` nie ogranicza pracy

**Status: wykonane 11 lipca 2026.** Wyjście NDJSON jest parsowane strumieniowo, każdy proces `rg`
jest zatrzymywany po `maxMatches + 1`, a wynik raportuje `returnedMatches`, `returnedFiles` i
`truncated` bez wymuszania pełnego skanowania dla dokładnego totalu.

[`RipgrepSearch.ts`](../../../src/infrastructure/tools/ripgrep/RipgrepSearch.ts#L82) uruchamia dwa procesy `rg`, odczytuje całe stdout obu procesów, parsuje wszystkie linie, sortuje wszystkie trafienia i dopiero potem wykonuje `slice(0, maxMatches)`.

W repozytorium z dużą liczbą trafień limit 50 ogranicza tylko odpowiedź dla modelu. Nie ogranicza:

- ilości danych wypisanych przez `rg`;
- pamięci zajętej przez dwa bufory stdout;
- liczby parsowanych eventów JSON;
- czasu sortowania.

### Zrealizowana zmiana

Czytać NDJSON strumieniowo i zakończyć proces po zebraniu `maxMatches + 1` poprawnych trafień. Zwracać:

```ts
{
  matches: SearchMatch[];
  returnedMatches: number;
  truncated: boolean;
}
```

Nie obliczać dokładnego `matchCount`, ponieważ wymusza pełne przeszukanie. Dla agenta ważniejsza jest informacja, że istnieją dalsze wyniki.

Warto również dodać opcjonalne `path` lub `glob` do wejścia `search_file`. Pozwala to ograniczyć pracę bez wprowadzania AST ani osobnego indeksu.

### Kryteria akceptacji

- proces jest przerywany po przekroczeniu limitu;
- stdout nie jest buforowane w całości;
- timeout i abort kończą proces oraz zamykają strumienie;
- kolejność wyniku pozostaje deterministyczna;
- test generuje więcej trafień niż limit i potwierdza wcześniejsze zakończenie runnera.

## P1 - cache nie ogranicza głównego kosztu

**Status: wykonane 12 lipca 2026.** Deduplikacja obejmuje `list_files` i `search_file`, a
powtórzony call zapisuje krótki output z `sourceToolCallId` zamiast pełnego wyniku. `read_file` jest
zawsze wykonywany ponownie, udana mutacja czyści rejestr, a referencje zachowują parity live/resume.

Cache w [`RunAgentTurn.ts`](../../../src/application/use-cases/RunAgentTurn.ts#L290) zapobiega ponownemu wykonaniu identycznego `list_files`, `read_file` lub `search_file` w obrębie tury. Następnie jednak ponownie tworzy pełną wiadomość tool z tym samym outputem.

Oznacza to:

- mniej I/O;
- prawie taki sam koszt kontekstu;
- ponownie zapisany pełny output w eventach;
- dodatkową logikę invalidacji po mutacji.

### Zrealizowana zmiana

- pozostawić cache dla kosztownego `search_file` i ewentualnie `list_files`;
- usunąć cache `read_file` albo traktować powtórzenie jako duplikat;
- dla identycznego calla zwracać krótki wynik referencyjny, np. `Result identical to tool call <id>; reuse the previous result.`;
- po każdej mutacji nadal czyścić cache zależny od workspace;
- mierzyć liczbę powtórzonych calli, aby sprawdzić, czy mechanizm rzeczywiście pomaga.

## P1 - kontrakt narzędzia ma kilka źródeł prawdy

**Status: wykonane 12 lipca 2026.** Każde lokalne narzędzie ma jedną definicję obejmującą schemat
Zod, funkcję wykonawczą oraz metadane approval/deduplikacji/invalidacji. `LocalToolRegistry`
generuje JSON Schema dla Ollamy z tego samego schematu, normalizuje input i wykonuje dispatch po
nazwie. Usunięto ręczny walidator z `RunAgentTurn`, centralny switch oraz ręczne parsery providerów.

Obecnie walidacja wejścia jest rozłożona pomiędzy:

1. ręczny JSON Schema w providerze;
2. ogólny walidator JSON Schema w [`RunAgentTurn.ts`](../../../src/application/use-cases/RunAgentTurn.ts#L469);
3. ręczny parser w każdym providerze;
4. dodatkową walidację limitów w factory albo adapterze filesystemu.

Dodanie kolejnego narzędzia wymaga powielenia tego układu i grozi sytuacją, w której schema zaakceptuje dane odrzucane potem przez parser.

### Zrealizowany rejestr

Każde narzędzie powinno być jednym obiektem:

```ts
type LocalTool<I> = {
  name: string;
  description: string;
  requiresApproval: boolean;
  inputSchema: z.ZodType<I>;
  execute(input: I): Promise<unknown>;
};
```

`ToolRegistry` powinien:

- zwracać definicje dla modelu;
- generować lub utrzymywać JSON Schema obok jednego schematu wejścia;
- parsować input;
- wyszukiwać executor po nazwie;
- przechowywać metadane `requiresApproval`, `cacheable` i `invalidatesWorkspaceCache`.

To pozwala usunąć switch z [`LocalToolExecutor.ts`](../../../src/infrastructure/tools/LocalToolExecutor.ts#L34), ręczny walidator z `RunAgentTurn` oraz większość parserów providerów.

### Ważne ograniczenie

Limity bezpieczeństwa filesystemu nadal muszą być sprawdzane przez adapter filesystemu. Walidacja tool input nie zastępuje ochrony ścieżek, symlinków, rozmiaru pliku ani optimistic concurrency.

## P1 - normalizacja escaped newline w `edit_file`

**Status: wykonane 12 lipca 2026.** `EditWorkspaceFile` używa teraz `oldText` i `newText`
dokładnie po parsowaniu argumentów. Usunięto globalne zamiany `\\n`, `\\r` i `\\r\\n`, a testy
obejmują prawdziwy tekst wieloliniowy, literalne sekwencje oraz jednokrotne dekodowanie JSON.

### Stan wykryty podczas audytu

[`EditWorkspaceFile.ts`](../../../src/application/use-cases/file-operations/EditWorkspaceFile.ts#L24) zamieniał każde tekstowe `\\n`, `\\r` i `\\r\\n` na prawdziwe znaki końca linii.

Po poprawnym parsowaniu JSON prawdziwe escaped newline są już zdekodowane. Dodatkowa normalizacja może uszkodzić zamierzoną edycję literalnego ciągu `\\n`, na przykład w kodzie parsera, regexie, fixture albo dokumentacji.

### Zrealizowana zmiana

Automatyczna normalizacja została usunięta, a `oldText` oraz `newText` są traktowane dokładnie. Jeżeli konkretny model rzeczywiście regularnie zwraca podwójnie escaped tekst, korekta powinna nastąpić jawnie w mapperze tego providera albo jako kontrolowany retry, a nie globalna zmiana semantyki wszystkich edycji.

### Kryteria akceptacji

- edycja prawdziwego tekstu wieloliniowego działa;
- edycja literalnego `\\n` działa;
- JSON string z newline jest poprawnie dekodowany tylko raz;
- zachowana zostaje kontrola dokładnie jednego dopasowania.

## P2 - brak metryk zasobów

**Status: wykonane 12 lipca 2026.** Dodano bounded `InMemoryAgentMetrics` dla ostatnich 100
zakończonych tur. Każda tura agreguje liczbę rund modelu, łączny i maksymalny rozmiar
serializowanego inputu modelu, a także liczbę, błędy, cache hits, rozmiar outputu i monotoniczny czas
tooli globalnie oraz per nazwa. Snapshot jest dostępny przez `runtime.getAgentMetrics(sessionId?)`.

Metryki są procesowe i nie powiększają JSONL ani kontekstu. Rozmiar requestu oznacza liczbę znaków
`messages + tools` na granicy aplikacji przed mapperem Ollamy, nie liczbę tokenów ani dokładny rozmiar
HTTP. Czas toola nie obejmuje oczekiwania na approval. Awarie recordera i zegara są izolowane od
zachowania silnika.

## P2 - sesja jest w całości odczytywana przed każdą turą

**Status: wykonane 12 lipca 2026.** Współdzielony `SessionStateCache` odczytuje i waliduje JSONL
raz przy pierwszym dostępie do sesji w procesie. Kolejne eventy są najpierw trwale dopisywane, a
następnie stosowane przez przyrostowy `AgentStateReducer`; zapisy są serializowane, a restart nadal
odbudowuje stan z JSONL. Transcript i agent loop korzystają z tej samej instancji.

### Stan wykryty podczas audytu

[`JsonlSessionStore.ts`](../../../src/infrastructure/persistence/JsonlSessionStore.ts#L62) używa `readFile`, a `RunAgentTurn` robi to po każdym nowym promptcie. Koszt jest liniowy względem całej historii i dodatkowo obejmuje walidację każdego eventu przez Zod.

### Zrealizowana zmiana

Na etapie MVP nie potrzeba bazy danych ani snapshotów na dysku. Wdrożono następujący przepływ:

1. przy aktywacji sesji odczytać i zwalidować JSONL raz;
2. utrzymywać odbudowany kontekst w pamięci runtime;
3. najpierw poprawnie dopisać event do JSONL;
4. dopiero po udanym appendzie zastosować event do stanu w pamięci;
5. po restarcie nadal odbudowywać wszystko z JSONL jako źródła prawdy.

Optymalizacja została wdrożona po naprawie modelu eventów, dzięki czemu cache zachowuje atomową semantykę kompletnych batchy tool calli.

## P2 - elementy możliwe do usunięcia

**Status: wykonane 12 lipca 2026.** Usunięto cztery use case'y przekazujące wywołania 1:1,
nieużywane `AgentState.toolResults` i `AgentState.errors` oraz nieużywany `LoadSession` wraz z API
runtime i testami. Definicje narzędzi korzystają bezpośrednio z portów, natomiast
`EditWorkspaceFile` i `ContextBuilder` pozostały, ponieważ zawierają rzeczywistą politykę.

### Delegujące use case'y - stan wykryty

Poniższe klasy miały po 13 linii i wyłącznie przekazywały argument do portu:

- `CreateWorkspaceFile`;
- `ListWorkspaceFiles`;
- `ReadWorkspaceFile`;
- `SearchWorkspaceFiles`.

Nie tworzyły polityki, transakcji ani transformacji. Po wprowadzeniu `ToolRegistry` providerzy korzystają bezpośrednio z odpowiedniego portu. `EditWorkspaceFile` pozostał, ponieważ zawiera prawdziwą logikę: dokładnie jedno dopasowanie i ochronę przed stale write.

### Nieużywany stan - stan wykryty

`AgentState.toolResults` i `AgentState.errors` były budowane przez reducer, ale nie miały produkcyjnych konsumentów. UI odczytuje osobno `ListSessionEvents`, a kontekst modelu korzysta tylko z `messages`.

Pola zostały usunięte. Trwałe eventy wyników i błędów nadal pozostają w JSONL.

### Nieużywany use case - stan wykryty

`LoadSession` był tworzony i eksportowany przez runtime, ale kod produkcyjny go nie wywoływał. Został usunięty; UI nadal korzysta z `listSessionEvents`, a agent loop z `SessionStateCache`.

### ContextBuilder

Podczas audytu `ContextBuilder` był bardzo małą klasą opakowującą konkatenację. Został zachowany,
a po wdrożeniu deterministycznego budżetu kontekstu zawiera już realną politykę i nie jest martwą
warstwą delegującą.

## P2 - podział `RunAgentTurn`

**Status: wykonane 12 lipca 2026.** Wydzielono per-turn `ToolRunner`, który odpowiada za
przygotowanie i identyfikatory calli, approval, wykonanie, deduplikację, invalidację oraz eventy i
wiadomości tool. Pozostała klasa `AgentLoop` obsługuje prompt, rundy modelu, kontekst, streaming i
warunki zakończenia; jest eksportowana także jako `RunAgentTurn`, aby zachować stabilne API runtime.

### Stan wykryty podczas audytu

`RunAgentTurn` odpowiadał za:

- zapis promptu;
- odczyt i redukcję sesji;
- budowanie requestu modelu;
- konsumpcję streamu;
- limit iteracji;
- walidację tool calli;
- approval;
- cache;
- wykonanie batcha;
- tworzenie wszystkich eventów;
- serializację wyników;
- obsługę i klasyfikację błędów.

Nie należy rozbijać tego na wiele drobnych use case'ów. Wystarczą dwie odpowiedzialności:

```text
AgentLoop
  - model rounds
  - context
  - stop conditions
  - final response

ToolRunner
  - registry lookup and parse
  - approval
  - execution
  - cache
  - tool events/results
```

### Zrealizowana zmiana

Podział zatrzymał się na tych dwóch odpowiedzialnościach. Nie dodano ogólnego event busa ani
osobnego `AgentEventWriter`: po przeniesieniu eventów tool pozostałe zapisy w `AgentLoop` dotyczą
wyłącznie promptu, odpowiedzi assistant i błędów samej pętli.

## Co pozostawić bez uproszczeń

### `ModelPort`

Jest prawidłową granicą pomiędzy pętlą agenta i Ollamą. Umożliwia testy skryptowanym modelem i ewentualną późniejszą zmianę providera.

### `SessionStorePort`

Oddziela format trwały od logiki agenta. JSONL nadal jest odpowiedni dla lokalnego MVP: czytelny, append-only i łatwy do diagnozowania.

### `WorkspaceFilePort` i ochrona ścieżek

[`NodeWorkspaceFileSystem.ts`](../../../src/infrastructure/file-system/NodeWorkspaceFileSystem.ts) jest duży, ale większość złożoności wynika z realnych wymagań bezpieczeństwa: `realpath`, symlinki, chronione katalogi, limity rozmiaru, atomic write i stale-write check. Nie upraszczać tego kosztem usunięcia kontroli.

### Clock i generator ID

Są małe i zapewniają deterministyczne testy eventów. Ich usunięcie da niewielką redukcję kodu, a pogorszy testowalność.

### Mapper i parser streamu Ollamy

Rozdzielenie HTTP, mapowania wiadomości i parsowania NDJSON odpowiada rzeczywistym granicom protokołu. Nie scalać ich z agent loopem.

## Docelowy, nadal prosty układ

```text
domain/
  AgentEvent.ts
  ModelMessage.ts
  Tool.ts

application/
  AgentLoop.ts
  ToolRunner.ts
  ContextPolicy.ts
  SessionReducer.ts
  ports/

infrastructure/
  model/ollama/
  persistence/JsonlSessionStore.ts
  file-system/NodeWorkspaceFileSystem.ts
  search/RipgrepSearch.ts
  tools/ToolRegistry.ts
  tools/workspaceTools.ts

composition/
  createRuntime.ts
  config.ts
```

To nie jest nowa architektura. Jest to obecny podział po usunięciu klas przekazujących wywołania i po wydzieleniu dwóch odpowiedzialności z `RunAgentTurn`.

## Rekomendowana kolejność prac

### Etap 1 - zgodność stanu

1. Dodać trwały event kompletnej wiadomości assistant z batchem tool calli.
2. Odtwarzać identyczny kontekst live i resume.
3. Domknąć semantykę odmowy approval i niewykonanych calli w batchu.
4. Dodać test round-trip: live context -> eventy -> reducer -> ten sam context.

**Warunek zakończenia:** żadna poprawnie zakończona tura nie zmienia znaczenia po restarcie CLI.

### Etap 2 - ograniczone zasoby

1. Dodać zakresy linii i twardy limit wyniku `read_file`.
2. Dodać deterministyczny budżet kontekstu bez automatycznego summarizera.
3. Przerobić `RipgrepSearch` na strumieniowy i przerywalny po limicie.
4. Ograniczyć duplikaty wyników cache w kontekście.
5. Dodać metryki: liczba rund, rozmiar requestu, rozmiar tool output i czas toola.

**Warunek zakończenia:** rozmiar requestu i wyników każdego narzędzia mają testowalne górne granice.

### Etap 3 - uproszczenie narzędzi

1. Wprowadzić jeden `ToolRegistry` oparty na jednym schemacie wejścia.
2. Przenieść approval/cache metadata do definicji narzędzia.
3. Usunąć ogólny ręczny walidator z `RunAgentTurn`.
4. Usunąć switch executora i powtarzalne parsery providerów.
5. Usunąć delegujące file-operation use case'y.
6. Usunąć normalizację escaped newline.

**Warunek zakończenia:** nowe narzędzie wymaga jednej definicji, jednego schematu, jednego executora i testów, bez zmian w centralnym switchu.

### Etap 4 - uproszczenie orkiestracji i sesji

1. Wydzielić `ToolRunner` z `RunAgentTurn`.
2. Zmienić pozostałą klasę na mały `AgentLoop`.
3. Usunąć nieużywane pola `AgentState` i nieużywany `LoadSession`.
4. Wczytywać aktywną sesję raz na proces i aktualizować ją po udanym appendzie.

**Warunek zakończenia:** agent loop opisuje wyłącznie przepływ rund modelu, a tool runner wyłącznie lifecycle narzędzi.

## Czego teraz nie dodawać

- DI containera;
- ogólnego event busa;
- repozytorium SQL dla sesji;
- automatycznego summarizera opartego na kolejnym wywołaniu modelu;
- AST indexera dla wielu języków;
- równoległego wykonywania mutujących narzędzi;
- rozbudowanego planera i klasyfikatora intencji;
- abstrakcji wielu providerów wykraczającej poza istniejący `ModelPort`.

Każdy z tych elementów może być kiedyś użyteczny, ale obecnie zwiększyłby powierzchnię awarii przed domknięciem podstawowych kontraktów.

## Release gate po stabilizacji

### Automatycznie

**Status: wykonane 12 lipca 2026.** Dodano jedno polecenie bramki, samodzielny artefakt Linux oraz
izolowany smoke test. Smoke waliduje sygnatury ELF/PE i prawa wykonywania, kopiuje natywną parę
`codesh`/`rg` poza repozytorium, uruchamia tryby nowej i wznawianej sesji oraz wykonuje rzeczywiste
wyszukiwanie przez dołączony ripgrep. Nie wymaga uruchomionej Ollamy.

```bash
bun run release:check
```

### Testy kontraktowe silnika

- live/resume parity dla tekstu i batchy tool calli;
- przerwany stream nie wykonuje toola;
- przerwany zapis nie aktualizuje stanu w pamięci;
- długi kontekst zachowuje kompletne najnowsze tury;
- duży plik jest zwracany fragmentami;
- `search_file` rzeczywiście zatrzymuje proces po limicie;
- literalny `\\n` nie jest zamieniany na newline;
- mutacja czyści zależne cache;
- denial w batchu pozostawia spójny zapis sesji.

### Testy ręczne

- nowa sesja, kilka rund read/search i finalna odpowiedź;
- resume tej samej sesji i pytanie zależne od wcześniejszego tool result;
- batch dwóch read-only tooli;
- batch z approval oraz odmową;
- odczyt dużego pliku w kilku zakresach;
- wyszukiwanie popularnego terminu w dużym repo;
- przerwanie aktywnej odpowiedzi;
- ponowny start po ręcznym ucięciu ostatniej linii JSONL.

## Końcowa rekomendacja

Wszystkie punkty implementacyjne P0-P2 i automatyczna część release gate są wykonane. Przed wydaniem
pozostają scenariusze ręczne z działającą Ollamą, obejmujące pełne resume, abort, duże
pliki/repozytoria i uszkodzoną końcówkę JSONL.

Tymczasowe `OLLAMA_KEEP_ALIVE=0` nadal pozostaje osobnym, świadomie odroczonym problemem zależnym od
ponownego testu na nowszej wersji Ollamy.
