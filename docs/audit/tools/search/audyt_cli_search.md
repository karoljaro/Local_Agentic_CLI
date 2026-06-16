# Audyt Local Agentic CLI — narzędzie `search`

**Data analizy:** 16 czerwca 2026  
**Materiał:** 49 niezależnych sesji z logami eventów + repozytorium referencyjne Python  
**Ground truth:** 7 plików Python, 3 moduły testowe, 13 przechodzących testów (`pytest -q`: `13 passed`).

## Werdykt

MVP jest użyteczne dla prostego symbol lookup i lokalnego wyjaśniania kodu. Nie jest jeszcze niezawodne dla pytań wymagających kompletności, enumeracji repozytorium, rozpoznania publicznego API, analizy wielu plików ani negatywnego wyniku „tego elementu nie ma”. Największym problemem nie jest samo rozumienie kodu, lecz planowanie zapytań, odkrywanie ścieżek, kontrola kompletności i zachowanie po błędach/limicie iteracji.

## Wyniki ilościowe

| Poziom | PASS | PARTIAL | FAIL | Sesje |
|---|---:|---:|---:|---:|
| Łatwe | 9 | 0 | 1 | 10 |
| Średnie | 7 | 4 | 4 | 15 |
| Złożone | 2 | 4 | 10 | 16 |
| Kontrolne — halucynacje | 4 | 0 | 4 | 8 |
| **Łącznie** | **22** | **8** | **19** | **49** |

- Pełny sukces: **22/49 = 44.9%**.
- Wynik co najmniej częściowo użyteczny: **30/49 = 61.2%**.
- 126 wywołań narzędzi: 79 × `search_file`, 47 × `read_file`.
- 8 nieudanych wywołań narzędzi w 7 sesjach.
- **7 sesji zakończonych `TOOL_ITERATION_LIMIT_REACHED`**, każda bez końcowej odpowiedzi.
- 5 sesji nie wykonało żadnego narzędzia; dwie zwróciły pustą odpowiedź, trzy odpowiedź całkowicie nieadekwatną.

## Co działa dobrze

1. **Definicje pojedynczych symboli.** `divide`, `normalize_text`, `User`, `find_by_email`, `UserRepository`, `find_keyword` i `list_active` zostały poprawnie znalezione i wyjaśnione.
2. **Czytanie lokalnej implementacji.** Gdy agent odczyta właściwy plik, zwykle poprawnie rozumie warunki, typy zwrotne, mutacje stanu i case-insensitive comparison.
3. **Prosty tracing zagnieżdżonych wywołań.** Trace `main -> count_words -> normalize_text` był kompletny i zakończył się poprawnym wynikiem `4`.
4. **Analiza zachowania metod.** Scenariusz duplicate ID oraz `find_by_email` zostały opisane poprawnie, wraz ze stanem repozytorium i wartością zwracaną.
5. **Część negatywnych kontroli.** Brak `DatabaseUserRepository`, `delete_user`, testu `find_keyword == False` i wersji asynchronicznej został rozpoznany bez wymyślania plików.

## Najważniejsze problemy

### P0 — limit iteracji kończy sesję bez odpowiedzi

Siedem sesji zakończyło się błędem iteracji. Agent często miał już wystarczające dowody, by odpowiedzieć, ale zamiast syntetyzować wynik wykonywał kolejne podobne zapytania. Dotyczyło to m.in. braku endpointów, `app.py`, konfiguracji logging, podklas `UserRepository`, publicznego API i spójności `__all__`.

**Naprawa:** przy limicie lub po 2–3 zapytaniach bez nowych trafień wygenerować odpowiedź z dotychczasowych dowodów. Błąd powinien oznaczać „wynik częściowy”, nie brak odpowiedzi.

### P0 — brak bezpiecznego odkrywania struktury repozytorium

Agent próbuje emulować listowanie plików przez wzorce `.*\.py`, `*.py`, nazwę pliku albo `read_file(".")`. `search_file` nie zachowuje się jak grep/regex ani wyszukiwarka ścieżek, więc te próby zwracają zero lub semantycznie przypadkowe wyniki. To spowodowało fałszywe twierdzenia, że `calculator.py` lub pliki Python nie istnieją.

**Naprawa:** dodać `list_files`/`tree` albo tryb `search_paths`. Agent musi znać kontrakt: `search_file` szuka treści, nie nazw plików i nie obsługuje arbitralnych regexów.

### P0 — brak kontroli kompletności dla słów „every”, „all”, „exhaustive”

Najpoważniejszy przypadek: sesja `019ed05c-c06b-7000-9f6b-34786adde075` ogłosiła „exhaustive search”, choć jedno zapytanie z `UserRepository|count_words|find_keyword` zwróciło tylko trzy definicje. Odpowiedź błędnie podała brak wszystkich importów, wywołań i testów.

**Naprawa:** dla każdego symbolu osobne wyszukanie, następnie klasyfikacja trafień: definicja, import/re-export, call/instantiation, test, string/noise. Twierdzenie „kompletne” może zostać użyte dopiero po spełnieniu checklisty i sprawdzeniu `truncated=false`.

### P0 — brak walidacji ścieżek i argumentów

W logach występują: `read_file(".")`, `read_file("calculator.py")` z błędnego katalogu, `src/example/users.py\`` z końcowym backtickiem oraz pusty query dla `search_file`.

**Naprawa:** przed wywołaniem narzędzia normalizować ścieżkę, usuwać markdownowe cudzysłowy/backticki, odrzucać katalogi i puste query, a przy ENOENT szukać basename w znanej liście plików zamiast natychmiast deklarować brak dostępu.

### P1 — mylenie deklarowanego API z dowolnymi importami

W łatwym pytaniu o eksporty agent odczytał `main.py`, nie `src/example/__init__.py`, i błędnie dodał `find_keyword` do publicznego API. Źródłem prawdy powinny być `__init__.py` i `__all__`.

### P1 — brak walidacji odpowiedzi względem własnych danych

Odpowiedź o konstrukcjach `User` twierdziła „6 instances”, ale tabela zawierała 8 poprawnych wierszy. Innym razem definicję lub tekst wyjątku sklasyfikowano jako użycie funkcji. To są błędy syntezy, nie retrievalu.

**Naprawa:** przed wysłaniem odpowiedzi sprawdzać zgodność deklarowanej liczby z liczbą rekordów, odfiltrować definicje/stringi, a każdą tezę wiązać z konkretnym trafieniem.

### P1 — brak sensownego zakończenia negatywnego wyszukiwania

W pytaniach kontrolnych brak elementu często powodował serię coraz gorszych regexów, a następnie limit iteracji. Agent powinien umieć powiedzieć „nie znaleziono” po sprawdzeniu definicji, importów i struktury plików.

### P1 — sporadyczne całkowite pominięcie zadania

Pięć sesji nie uruchomiło narzędzi. Przykłady: ogólne powitanie, prośba o obraz do pytania o `main.py`, prośba o opis projektu mimo dostępnych plików oraz dwie puste odpowiedzi. Należy dodać guard: pytanie o kod + dostępny workspace => przynajmniej jedno narzędzie albo jawny błąd techniczny.

## Powtórzone pytania i stabilność

- **Which functions from calculator.py are exposed through the package root, and which tests cover each function?** — 019ed045-201e-7000-a360-bb6acd029d4d: FAIL, 019ed046-03f9-7000-8b27-4a8e09160638: FAIL, 019ed046-8247-7000-9131-9121f98af945: FAIL.
- **List every source module and its corresponding test module. Identify any source module that has no direct test file.** — 019ed04c-54d2-7000-8272-56b29b85e7e6: FAIL, 019ed04d-0f4e-7000-952c-a2382da89a8e: PASS.
- **Starting from main(), build the complete project-level call graph. Include nested calls such as methods or helper functions, but exclude Python standard-library internals.** — 019ed051-0c0b-7000-92a5-89d9048da0b0: FAIL, 019ed052-43f4-7000-a1e6-b26afd55f7ab: FAIL.

Wnioski:

- Pytanie o eksporty `calculator.py` miało **3 próby i 3 porażki**: no-op, błędne listowanie katalogu, błędna ścieżka.
- Mapowanie modułów do testów: pierwsza próba FAIL, druga PASS. Wynik zależy od losowego wyboru zapytania (`.*\.py` kontra `.`).
- Call graph: pierwsza próba pusta; druga odczytała prawie wszystkie pliki, lecz backtick w ścieżce i limit iteracji zniszczyły wynik.

## Rekomendowany plan napraw

### Etap 1 — niezawodność wykonania

1. Fallback synthesis po `TOOL_ITERATION_LIMIT_REACHED`.
2. Walidator argumentów narzędzi: niepusty query, plik zamiast katalogu, czyszczenie backticków/cudzysłowów.
3. `list_files`/`tree` i wyszukiwanie po ścieżkach.
4. Guard przed pustą/boilerplate odpowiedzią, gdy pytanie dotyczy workspace.

### Etap 2 — jakość wyszukiwania

1. Rozpoznanie intencji: definition, references, instantiation, public API, call graph, tests/coverage, negative existence.
2. Dekompozycja zapytań zamiast regexowych alternatyw w jednym query.
3. Dla referencji: osobne wyszukania symbolu, `Symbol(`, importów i re-exportów; następnie deduplikacja i klasyfikacja AST/tekstowa.
4. Dla public API: najpierw `__init__.py`/`__all__`, potem definicje i użycia.

### Etap 3 — kontrola jakości odpowiedzi

1. Zakaz słów „all/every/exhaustive” bez wypełnionej checklisty kompletności.
2. Sprawdzenie liczników i zgodności tabeli z podsumowaniem.
3. Każdy rekord powinien zawierać ścieżkę, linię i kontekst funkcji/testu.
4. Odróżnianie definicji, importu, re-exportu, call/instantiation, testu i trafienia tekstowego.
5. Testy regresyjne z pytaniami negatywnymi i wielosesyjnymi; wynik powinien być deterministyczny.

## Kryteria akceptacji kolejnej wersji

- 10/10 pytań łatwych PASS.
- Co najmniej 10/12 logicznych pytań średnich PASS, bez fałszywego „brak dostępu”.
- Brak pustych odpowiedzi i brak sesji kończących się bez syntezy po limicie.
- 8/8 pytań kontrolnych kończy się jednoznacznym „nie znaleziono” z opisem sprawdzonych miejsc.
- Pytania `every/all/exhaustive` zwracają dokładną liczbę wystąpień i zero zmyślonych plików.
- Powtórzenie tego samego pytania 5 razy daje semantycznie ten sam wynik.

## Aneks — ocena każdej sesji

| Poziom | Session ID | Status | Pytanie | Najważniejsza uwaga |
|---|---|---|---|---|
| Łatwe | `019ed033-e7aa-7000-b124-74bcd98fb127` | **PASS** | Where is the divide function defined, and what does it return? | Poprawna definicja, ścieżka, wartość zwracana i warunek ZeroDivisionError. |
| Łatwe | `019ed034-4de7-7000-961c-8e74ce9925ff` | **PASS** | Find the definition of normalize_text and explain what transformations it applies to the input. | Poprawnie opisano strip, redukcję białych znaków i lower(). |
| Łatwe | `019ed034-9cd7-7000-b50d-77eb5be579fd` | **PASS** | Where is the User class defined? List all of its fields and their default values. | Kompletne pola dataclass i poprawne wartości domyślne. |
| Łatwe | `019ed034-ed87-7000-9d37-d9d43644eacb` | **PASS** | Find the find_by_email method and explain whether the email comparison is case-sensitive. | Poprawna lokalizacja i case-insensitive comparison. |
| Łatwe | `019ed035-750c-7000-8342-a14efa54afea` | **PASS** | Where is UserRepository defined, and how does it store users internally? | Poprawna definicja i wewnętrzny dict[int, User]. |
| Łatwe | `019ed035-bcd1-7000-bf4a-6de7c47abedb` | **PASS** | Find the test that verifies division by zero. What exception does it expect? | Poprawny test i oczekiwany ZeroDivisionError. |
| Łatwe | `019ed035-fc52-7000-9183-7e1c26212705` | **FAIL** | Which functions and classes are exported from the example package? | Nie odczytano __init__.py; find_keyword błędnie uznano za eksportowany. Odpowiedź miesza importy z main/testów z deklarowanym API. |
| Łatwe | `019ed036-5167-7000-8507-3302746a6ec3` | **PASS** | Find the project configuration that tells pytest where to look for tests and source files. | Poprawne testpaths i pythonpath z pyproject.toml. |
| Łatwe | `019ed036-983c-7000-b827-1dfa3e20b6a8` | **PASS** | Where is find_keyword defined, and what value does it return? | Poprawna definicja i typ/znaczenie wartości bool. |
| Łatwe | `019ed038-d4c8-7000-83e7-aeefa2ea04d8` | **PASS** | Find the function that returns only active users. | Poprawnie wskazano list_active i implementację. |
| Średnie | `019ed03d-6fa2-7000-a7b0-9bcfd8ce6910` | **PARTIAL** | Find every place where the divide function is imported or called. Separate production code from tests. | Znaleziono wszystkie importy i wywołania, ale dodano definicję, nazwy testów i fałszywy traf w komunikacie ZeroDivisionError, choć pytanie dotyczyło importów/wywołań. |
| Średnie | `019ed03d-dfc8-7000-b442-e0eec3452d35` | **PARTIAL** | Find every place where UserRepository is instantiated. Return exact file paths and surrounding function or test names. | Wszystkie 5 instancjacji znalezione, lecz brak wymaganych nazw otaczających funkcji/testów; podano tylko ogólne „within a test function”. |
| Średnie | `019ed03e-3727-7000-af11-9fde07f57722` | **PASS** | Find all tests related to UserRepository and summarize which repository behaviors are covered. | Kompletne cztery testy i poprawne zachowania repozytorium. |
| Średnie | `019ed044-3f1e-7000-aa1d-046eae01d9e8` | **PASS** | Trace the execution of count_words("Agentic CLI search example") from main.py to the final returned value. Include every project function called along the way. | Poprawny pełny trace main -> count_words -> normalize_text -> 4. |
| Średnie | `019ed044-c21f-7000-97e3-a534a026be48` | **PARTIAL** | Find every place where a User object is created. For each instance, list the provided values and whether active is explicit or uses the default. | Tabela zawiera wszystkie 8 konstrukcji User i poprawne dane, ale nagłówek twierdzi, że znaleziono 6. |
| Średnie | `019ed045-201e-7000-a360-bb6acd029d4d` | **FAIL** | Which functions from calculator.py are exposed through the package root, and which tests cover each function? | Brak wywołań narzędzi; zwrócono ogólne powitanie zamiast odpowiedzi. |
| Średnie | `019ed046-03f9-7000-8b27-4a8e09160638` | **FAIL** | Which functions from calculator.py are exposed through the package root, and which tests cover each function? | Wyszukiwanie nazwy pliku nie znalazło ścieżki, read_file(".") zakończył się błędem; fałszywe stwierdzenie, że calculator.py nie istnieje. |
| Średnie | `019ed046-8247-7000-9131-9121f98af945` | **FAIL** | Which functions from calculator.py are exposed through the package root, and which tests cover each function? That's switched gemma4:12b-it-qat to gemma4:e2e-it-qat (don't use this sentence to query, thats is only log ) | Próba odczytu calculator.py z błędnego katalogu zamiast src/example/calculator.py; fałszywy brak dostępu. |
| Średnie | `019ed048-45cb-7000-8c36-f38007faeb39` | **PASS** | Find all code paths that can raise an exception in this project. State the exception type and triggering condition. | Mimo błędu read_file("."), końcowa lista dwóch jawnych ścieżek wyjątków jest poprawna. |
| Średnie | `019ed048-b26c-7000-8db6-f4cb7321ac36` | **PASS** | Compare normalize_text and find_keyword. Do they implement case-insensitive behavior in the same way? | Poprawnie rozróżniono transformację normalize_text i porównanie w find_keyword. |
| Średnie | `019ed04a-2c80-7000-a0c4-52230e4fea89` | **PARTIAL** | Find all uses of list_active. Which users are expected to be returned in each context? | Poprawne wyniki dla main i testu, ale definicję metody policzono jako trzeci „use context”. |
| Średnie | `019ed04a-ed1a-7000-8b04-96cb6b06b3ee` | **PASS** | Which public function defined in text_utils.py is not exported from example/__init__.py? Is it tested or used elsewhere? | Poprawnie wskazano find_keyword: brak eksportu, test istnieje, brak użycia produkcyjnego. |
| Średnie | `019ed04b-b33a-7000-ba06-ab275665e431` | **PASS** | Find all assertions involving UserRepository methods and map each assertion to the method it verifies. | Kompletne mapowanie czterech asercji/oczekiwań do metod. |
| Średnie | `019ed04c-54d2-7000-8272-56b29b85e7e6` | **FAIL** | List every source module and its corresponding test module. Identify any source module that has no direct test file. | Niepoprawne wzorce regex dla search_file i read_file("."); fałszywy wniosek o braku plików Python. |
| Średnie | `019ed04d-0f4e-7000-952c-a2382da89a8e` | **PASS** | List every source module and its corresponding test module. Identify any source module that has no direct test file. | Druga próba poprawnie mapuje trzy moduły testowane i wskazuje main.py oraz __init__.py bez testów bezpośrednich. |
| Złożone | `019ed051-0c0b-7000-92a5-89d9048da0b0` | **FAIL** | Starting from main(), build the complete project-level call graph. Include nested calls such as methods or helper functions, but exclude Python standard-library internals. | Brak narzędzi i pusta odpowiedź. |
| Złożone | `019ed052-43f4-7000-a1e6-b26afd55f7ab` | **FAIL** | Starting from main(), build the complete project-level call graph. Include nested calls such as methods or helper functions, but exclude Python standard-library internals. | Prawie zebrano potrzebne pliki, ale ścieżka users.py zawierała końcowy backtick; następnie limit iteracji i brak odpowiedzi. |
| Złożone | `019ed052-e505-7000-bc9b-29f53703ef14` | **PARTIAL** | Find every place where UserRepository is instantiated, directly or indirectly. Do not invent files or usages. Return an exhaustive list with evidence. | Wszystkie 5 bezpośrednich instancjacji poprawne; importy błędnie opisano jako „indirect instantiation/usage”, choć nie tworzą obiektu. |
| Złożone | `019ed055-07c1-7000-a4a5-3d2ac29dd678` | **FAIL** | Determine the exact console output produced by running main.py. Explain how each line is computed and note any representation details that depend on dataclasses. | Brak narzędzi; odpowiedź prosi o obraz/kod mimo dostępnego repozytorium. |
| Złożone | `019ed055-6d84-7000-bb0b-021d48cd6fc5` | **PARTIAL** | Perform a test-coverage gap analysis for UserRepository. List all branches and behaviors in the implementation, identify which are tested, and propose only the missing tests. | Analiza w większości trafna, ale niespójnie wskazuje pusty repozytorium find_by_email jako brak i nie proponuje dla niego testu; miesza branch coverage z dodatkowymi zachowaniami. |
| Złożone | `019ed056-5e2e-7000-ac6c-179a96335893` | **FAIL** | Perform a test-coverage gap analysis for text_utils.py. Consider empty strings, whitespace, casing, repeated spaces, keyword absence, and empty keywords. Distinguish tested behavior from inferred behavior. | Brak narzędzi; błędne stwierdzenie o braku informacji o projekcie. |
| Złożone | `019ed057-1c4b-7000-a31b-75d9697f2c98` | **FAIL** | Find all symbols that are part of the package’s declared public API. For each symbol, provide its definition, re-export location, usages, and tests. | Nieodpowiednie, wielojęzykowe wzorce wyszukiwania; limit iteracji i brak odpowiedzi. |
| Złożone | `019ed057-db76-7000-b14a-23e7b4785197` | **FAIL** | Analyze whether all imports in the source and test files are necessary. Identify unused imports only when supported by the code. | Brak narzędzi i pusta odpowiedź. |
| Złożone | `019ed058-8a45-7000-8b03-68ca0dfda9e0` | **PASS** | Trace what happens when repo.add() is called twice with different User objects having the same ID. Include the state of the repository before and after the failed call. | Poprawny stan repozytorium przed i po ValueError; drugi obiekt nie nadpisuje pierwszego. |
| Złożone | `019ed059-53b0-7000-b446-49f19936170e` | **PASS** | Trace repo.find_by_email("anna@example.com") when the stored email is "Anna@Example.com". Describe iteration, normalization, comparison, and return value. | Poprawna iteracja, lower() po obu stronach, porównanie i zwrot User. |
| Złożone | `019ed05a-1978-7000-8377-f53f58436367` | **FAIL** | Identify every function or method that has an untested branch. For each branch, cite the implementation and explain why the existing tests do or do not execute it. | Wyszukanie ".*" zwróciło 0; fałszywe stwierdzenie o braku dostępu do kodu. |
| Złożone | `019ed05a-6492-7000-909a-5767f55a22b9` | **FAIL** | Find all functions and methods that are defined but never called by production code. Separate symbols used only in tests from symbols unused everywhere outside their definition or export. | read_file(".") i nieadekwatne szukanie package.json; fałszywy brak dostępu. |
| Złożone | `019ed05a-fa86-7000-8e48-610ef1c88b07` | **FAIL** | Check whether the package exports are internally consistent: every name in __all__ must be imported and defined. Also identify defined public-looking symbols omitted from __all__. | Zebrano __init__.py, calculator.py i text_utils.py, ale limit iteracji przerwał przed users.py/syntezą; brak odpowiedzi. |
| Złożone | `019ed05c-0186-7000-b99c-ba873c7f7746` | **PARTIAL** | Construct a dependency map showing which files depend on calculator.py, text_utils.py, and users.py. Include imports, calls, tests, and package-level re-exports. | Mapa importów/re-eksportów i testów jest poprawna, ale nie zawiera wymaganych konkretnych wywołań funkcji/metod. |
| Złożone | `019ed05c-c06b-7000-9f6b-34786adde075` | **FAIL** | Review the entire repository for claims that require exhaustive search. List every occurrence of UserRepository, count_words, and find_keyword, grouped by definition, import, call, and test. | Pojedyncze zapytanie z operatorem \| znalazło tylko definicje; mimo to odpowiedź bezpodstawnie ogłosiła wynik „exhaustive” i podała brak importów/wywołań/testów. |
| Złożone | `019ed05e-330f-7000-8719-14e184d9dc5f` | **PARTIAL** | Suppose normalize_text changed to preserve letter casing. Identify every test and runtime behavior that would definitely change, might change, or would remain unchanged. Base the answer only on this repository. | Poprawnie wskazano wpływ na testy i count_words, ale dodano spekulację o niewidocznych modułach mimo wymogu „only on this repository”. |
| Kontrolne — halucynacje | `019ed061-4d9c-7000-8260-c158ad45dd45` | **PASS** | Find the DatabaseUserRepository class and explain how it connects to the database. | Bezpiecznie stwierdzono brak DatabaseUserRepository i poprawnie opisano istniejące repozytorium in-memory. |
| Kontrolne — halucynacje | `019ed061-a442-7000-b3f4-c5e0ae16f0a8` | **PASS** | Where is the delete_user method implemented and tested? | Poprawnie stwierdzono brak implementacji i testu delete_user; bez wymyślania plików. |
| Kontrolne — halucynacje | `019ed061-daa8-7000-82f9-8c575535adc9` | **FAIL** | Find all API endpoints that call UserRepository. | Brak endpointów był możliwy do stwierdzenia, ale agent zapętlił się w kolejnych wzorcach i zakończył limitem iteracji bez odpowiedzi. |
| Kontrolne — halucynacje | `019ed062-849b-7000-9ef4-8d43dd2a0805` | **FAIL** | Find the app.py file and trace its application startup flow. | Nie znalazł nieistniejącego app.py, ale zamiast zakończyć negatywnym wynikiem wykonywał nieskuteczne wzorce aż do limitu iteracji. |
| Kontrolne — halucynacje | `019ed063-0933-7000-8bca-3ec10cd7195e` | **PASS** | Find the test that verifies find_keyword returns False. | Poprawnie stwierdzono, że istniejący test sprawdza wyłącznie True i brak testu False. |
| Kontrolne — halucynacje | `019ed063-51bc-7000-9a3c-fc9e4ec08bbe` | **FAIL** | Where is logging configured for errors raised by divide? | Zebrano dowody braku konfiguracji logging, lecz kolejne zapytania doprowadziły do limitu iteracji i braku odpowiedzi. |
| Kontrolne — halucynacje | `019ed063-d423-7000-8541-e57668fe7cac` | **PASS** | Find the asynchronous version of find_by_email. | Poprawnie stwierdzono brak async def find_by_email i pokazano wersję synchroniczną. |
| Kontrolne — halucynacje | `019ed064-3823-7000-adf9-96d1319a2a21` | **FAIL** | Find every subclass of UserRepository. | Pierwsze wywołanie miało pusty query; następnie agent próbował regexów aż do limitu, zamiast stwierdzić brak podklas. |

Pełne dane operacyjne, liczby wywołań i sekwencje narzędzi znajdują się w dołączonym CSV.
