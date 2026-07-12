# Prompt dla Codexa — przebudowa warstwy presentation w agentic CLI

Przygotuj od nowa całą warstwę prezentacyjną mojego agentic CLI, w tym nowy folder `presentation/` oraz nowy plik `App.tsx`.

Projekt korzysta z:

- TypeScript,
- React,
- Ink 7.1.0,
- Bun,
- streamowanych odpowiedzi modelu,
- komend CLI, między innymi `/model` i `/resume`,
- mechanizmu zatwierdzania operacji narzędzi,
- osobnej warstwy engine odpowiedzialnej za działanie agenta.

## Stan początkowy

Cała dotychczasowa implementacja UI została przeniesiona do:

```text
ui_old/
```

Nową implementację przygotuj w:

```text
App.tsx
presentation/
```

Nowy `App.tsx` oraz folder `presentation/` traktuj jako czystą przestrzeń przeznaczoną na nowe rozwiązanie.

Folder `ui_old/` ma służyć jako referencja funkcjonalna. Możesz go przeanalizować, aby zrozumieć:

- dotychczasowe zachowanie CLI,
- sposób integracji z engine,
- przepływ streamingu,
- historię rozmowy,
- obsługę komend,
- wybór modelu,
- wznawianie sesji,
- approval flow,
- istniejące edge case’y,
- dostępne typy, kontrakty i utility.

Nie traktuj jednak struktury `ui_old/`, jego komponentów, hooków, modelu stanu ani starego kleju integracyjnego jako obowiązującego fundamentu nowego UI.

Nie chodzi o zakaz używania starego kodu. Możesz świadomie wykorzystać pojedyncze fragmenty, jeżeli są poprawne, niezależne od starej architektury i pasują do nowego rozwiązania. Nie buduj jednak całej nowej warstwy pod ograniczenia starego kleju tylko dlatego, że część funkcji już działa.

Najpierw zaprojektuj docelową architekturę nowego `presentation/`. Dopiero potem zdecyduj, czy jakiekolwiek elementy z `ui_old/` warto przenieść.

Jeżeli wykorzystujesz fragment starego kodu:

- przenieś go do nowej struktury,
- dostosuj do nowej architektury,
- usuń zależności od starego UI,
- opisz tę decyzję w pliku planu.

Finalne `App.tsx` i `presentation/` nie powinny importować kodu bezpośrednio z `ui_old/`.

## Główne założenie

Nie wykonuj zwykłego refaktoru starego UI.

Zaprojektuj własne rozwiązanie warstwy prezentacyjnej, które spełnia wymagania projektu i pozostaje w dobrej symbiozie z engine CLI.

Stara implementacja może pokazywać, jakie funkcje muszą pozostać dostępne, ale nie powinna narzucać:

- struktury plików,
- sposobu zarządzania stanem,
- sposobu renderowania historii,
- sposobu buforowania streamu,
- nawigacji pomiędzy ekranami,
- obsługi focusu,
- organizacji komponentów,
- podziału odpowiedzialności,
- integracji Reacta z engine.

Jeżeli obecny klej między engine a Ink jest niewydajny, zbyt rozbudowany albo łączy zbyt wiele odpowiedzialności, możesz zaprojektować nową, cienką warstwę integracyjną.

Nie przepisuj bez potrzeby domenowej logiki agenta. Zachowaj odpowiedzialności engine, takie jak:

- cykl wykonania agenta,
- komunikacja z providerem,
- wykonywanie narzędzi,
- domenowa obsługa sesji,
- logika approval,
- wybór i obsługa modelu,
- przechowywanie danych sesji.

Nowa warstwa presentation może natomiast stworzyć własną logikę odpowiedzialną za:

- stan aktywnego ekranu,
- renderowanie historii,
- aktualnie streamowaną odpowiedź,
- buforowanie zmian na potrzeby renderowania,
- focus management,
- obsługę klawiatury,
- menu komend,
- mapowanie eventów engine na stan UI,
- mapowanie akcji użytkownika na API engine,
- loading, error i cancel state,
- prezentację tool calli,
- rendering Markdown.

Jeżeli obecne kontrakty pomiędzy engine a UI utrudniają poprawną implementację, możesz je zmienić w minimalnym potrzebnym zakresie. Każdą taką zmianę opisz w planie i raporcie końcowym.

## Cel

Zaprojektuj i zaimplementuj nową warstwę prezentacyjną, która:

- jest minimalistyczna,
- pozostaje czytelna przy bardzo długiej historii rozmowy,
- wyraźnie odróżnia wiadomości użytkownika od odpowiedzi modelu,
- płynnie wyświetla streamowaną odpowiedź,
- dobrze współpracuje z engine,
- jest wydajna,
- obsługuje osobne ekrany dla komend,
- pozwala rozwijać kolejne funkcje,
- nie opiera się na przypadkowych decyzjach starego UI,
- nie wprowadza niepotrzebnego frameworka wewnątrz projektu.

Możesz inspirować się dobrym UX narzędzi takich jak Codex CLI, ale nie kopiuj ich bezpośrednio.

## Plik z planem

Przed większą implementacją utwórz roboczy plik Markdown, na przykład:

```text
docs/presentation-redesign-plan.md
```

Dokument powinien być aktualizowany przez cały czas realizacji zadania.

Powinien zawierać:

- rozpoznany przepływ pomiędzy engine a presentation,
- opis obecnego sposobu streamowania,
- problemy i ograniczenia starej implementacji,
- docelową architekturę,
- proponowaną strukturę plików,
- etapy implementacji,
- kryteria ukończenia każdego etapu,
- podjęte decyzje architektoniczne,
- elementy z `ui_old/` wykorzystane ponownie,
- elementy z `ui_old/` odrzucone lub zastąpione,
- zmiany kontraktów engine–presentation,
- wyniki testów, typechecku i lintowania,
- znane ograniczenia i elementy pozostałe do wykonania.

Plik planu ma wspierać etapową implementację. Nie może zastępować faktycznych zmian w kodzie.

Po każdym etapie zaktualizuj dokument zgodnie z rzeczywiście wykonanymi zmianami.

## Wymagania wizualne

UI powinno być:

- minimalistyczne,
- spokojne wizualnie,
- czytelne także przy ścianie tekstu,
- pozbawione zbędnych ramek i dużych paneli,
- pozbawione nadmiarowych paddingów,
- wygodne w małym i szerokim terminalu,
- spójne stylistycznie,
- łatwe do obsługi klawiaturą.

Użytkownik musi łatwo rozróżnić:

- swoje wiadomości,
- odpowiedzi modelu,
- komunikaty systemowe,
- działania narzędzi,
- wyniki narzędzi,
- błędy,
- anulowanie,
- prośby o zatwierdzenie.

Nie opieraj tego rozróżnienia wyłącznie na kolorach. Wykorzystaj również układ, prefiksy, znaczniki, odstępy, pogrubienie lub subtelne separatory.

Nie twórz dużych ramek wokół każdego elementu.

## Architektura

`App.tsx` ma być głównym komponentem orkiestrującym, a nie plikiem zawierającym większość logiki UI.

Powinien przede wszystkim:

- łączyć presentation z engine lub adapterem,
- wybierać aktywny widok,
- składać główne elementy aplikacji,
- przekazywać dane do ekranów,
- obsługiwać najważniejsze przejścia pomiędzy ekranami.

Nie umieszczaj w `App.tsx`:

- pełnego renderowania wiadomości,
- całej obsługi klawiatury,
- kompletnej logiki inputu,
- całego systemu komend,
- filtrowania list,
- renderera Markdown,
- pełnej logiki approval,
- niskopoziomowej obsługi streamu,
- dużych transformacji danych,
- całego store lub reducera,
- szczegółowej obsługi eventów engine.

Dopasuj strukturę katalogów do rzeczywistych potrzeb projektu. Może ona przykładowo wyglądać tak:

```text
presentation/
├── screens/
├── chat/
├── input/
├── commands/
├── approval/
├── components/
├── hooks/
├── state/
├── adapters/
├── formatters/
└── types/
```

To jedynie propozycja. Nie twórz pustych katalogów, jednoelementowych warstw bez uzasadnienia ani abstrakcji używanych tylko raz.

Nie buduj wewnętrznego frameworka UI, systemu pluginów, rozbudowanego design systemu ani skomplikowanego routera, jeżeli prostsze rozwiązanie wystarczy.

## Symbioza z engine

Nowa warstwa presentation powinna być wyraźnie oddzielona od engine, ale dobrze z nim współpracować.

Preferowany kierunek przepływu:

```text
engine events
    ↓
adapter presentation
    ↓
stan presentation
    ↓
ekrany i komponenty Ink
```

W drugą stronę:

```text
akcja użytkownika
    ↓
akcja presentation
    ↓
publiczne API lub komenda engine
```

Dokładne kontrakty dopasuj do aktualnej architektury projektu.

UI nie powinno bezpośrednio:

- wykonywać narzędzi,
- komunikować się z Ollamą lub innym providerem,
- sterować cyklem agenta,
- zawierać domenowej logiki sesji,
- samodzielnie decydować o skutkach approval,
- duplikować stanu przechowywanego przez engine.

UI może:

- subskrybować eventy engine,
- mapować je na prosty stan prezentacyjny,
- buforować aktualny stream na potrzeby renderowania,
- zarządzać aktywnym ekranem,
- zarządzać focusem,
- reagować na klawiaturę,
- prezentować działania narzędzi,
- przekazywać decyzje użytkownika do engine.

Zadbaj o poprawny cleanup listenerów, subskrypcji, timerów i buforów. Nie dopuszczaj do wielokrotnego rejestrowania tych samych handlerów po renderach.

## Historia i streaming

Odpowiedź modelu musi być wyświetlana w czasie rzeczywistym.

Zaprojektuj przepływ streamingu pod kątem wydajności:

- nie renderuj ponownie całej historii przy każdym tokenie,
- zakończone wpisy historii powinny być możliwie statyczne,
- dynamicznie aktualizowana powinna być głównie bieżąca odpowiedź,
- nie przechowuj tego samego tekstu jednocześnie w historii i aktywnym streamie,
- nie kopiuj całej tablicy historii przy każdym delta evencie,
- ogranicz zakres komponentów reagujących na każdą zmianę streamu,
- rozważ batching lub throttling, jeżeli tokeny napływają bardzo często,
- unikaj migotania, duplikowania wiadomości i ponownego drukowania zakończonych odpowiedzi.

Wykorzystaj mechanizmy Ink 7.1.0, w tym `Static`, hooki Ink i natywne komponenty, jeżeli pasują do zaprojektowanego rozwiązania.

Nie używaj `Static` mechanicznie. Zastosuj go tam, gdzie faktycznie poprawia zachowanie historii.

Po zakończeniu streamu bieżąca odpowiedź powinna zostać jednoznacznie przeniesiona do zakończonej historii bez duplikacji i bez pustych wpisów.

Obsłuż również:

- błąd przed pierwszym tokenem,
- błąd w trakcie streamu,
- anulowanie,
- tool call w trakcie odpowiedzi,
- wiele kolejnych tool calli,
- zakończenie requestu bez zwykłego tekstu.

## Główny ekran czatu

Najpierw przygotuj kompletny główny ekran czatu.

Powinien zawierać:

- statyczną informację o sesji na początku historii,
- historię rozmowy,
- aktualnie streamowaną odpowiedź,
- stan oczekiwania na pierwszy fragment odpowiedzi,
- input użytkownika,
- informację o aktualnym modelu,
- informację o katalogu roboczym,
- podstawowe komunikaty systemowe,
- komunikaty o błędach i anulowaniu.

### Nagłówek sesji

Informacja o sesji ma znajdować się na samej górze historii.

Powinna:

- zostać wyrenderowana tylko raz,
- nie być dynamicznie odświeżana przy każdym tokenie,
- nie przesuwać się,
- nie duplikować się,
- mieć minimalistyczny wygląd.

Nie twórz dużego panelu ani rozbudowanego bannera.

### Rozróżnienie wiadomości

Wiadomości użytkownika i modelu muszą być łatwe do rozpoznania także przy długich akapitach, blokach kodu, wielu kolejnych wiadomościach i bardzo wąskim terminalu.

### Informacje pod inputem

Pod inputem pokaż dyskretnie:

- aktualny model,
- katalog roboczy, w którym uruchomiono CLI.

Te informacje nie powinny dominować wizualnie nad inputem.

## Input

Input powinien:

- obsługiwać zwykłe wiadomości i komendy,
- poprawnie działać podczas streamowania,
- reagować na zmianę rozmiaru terminala,
- nie powodować skakania całego layoutu,
- poprawnie oddawać i odzyskiwać focus,
- nie przechwytywać klawiszy, gdy aktywny jest inny ekran lub approval,
- zachowywać wpisaną treść przy powrocie z ekranu, jeżeli użytkownik nie zatwierdził akcji,
- poprawnie czyścić się po wysłaniu wiadomości,
- blokować wysłanie pustej wiadomości,
- unikać przypadkowego wielokrotnego wysłania tej samej treści.

Nie umieszczaj całej logiki inputu bezpośrednio w `App.tsx` lub głównym ekranie.

## Komendy rozpoczynające się od `/`

Po wpisaniu `/` pokaż listę dostępnych komend, między innymi:

- `/model`,
- `/resume`,
- pozostałe komendy istniejące w projekcie.

Lista powinna:

- rozwijać się przy inpucie,
- filtrować się podczas wpisywania,
- obsługiwać klawisze góra i dół,
- obsługiwać zatwierdzenie,
- obsługiwać anulowanie,
- poprawnie oddawać focus,
- nie wypychać trwale historii,
- nie powodować duplikowania inputu,
- zachowywać się poprawnie przy pustym wyniku filtrowania.

Definicje komend powinny mieć jedno źródło danych. Nie duplikuj nazw, opisów i sposobu działania komend w kilku komponentach.

Rozdziel:

- metadane komendy,
- sposób jej prezentacji,
- efekt jej wykonania.

## Osobne widoki

Komendy wymagające dodatkowego wyboru, takie jak `/model` i `/resume`, powinny otwierać osobny ekran.

Nie umieszczaj selektora modelu ani listy sesji bezpośrednio pod historią rozmowy.

Osobny widok powinien:

- zastępować główny ekran lub działać jak pełnoekranowa warstwa TUI,
- mieć prosty tytuł,
- obsługiwać klawiaturę,
- obsługiwać zatwierdzenie,
- obsługiwać powrót bez zmian,
- nie niszczyć historii rozmowy,
- nie resetować przypadkowo inputu,
- nie aktywować skrótów głównego ekranu,
- poprawnie przywracać focus po zamknięciu.

Zaprojektuj prosty wspólny mechanizm obsługi ekranów. Nie twórz osobnej, całkowicie niezależnej logiki nawigacji dla każdej komendy.

### Widok wyboru modelu

Powinien:

- wyświetlać dostępne modele,
- wskazywać aktualnie wybrany model,
- pozwalać na wybór klawiaturą,
- pozwalać na anulowanie,
- aktualizować model poprzez właściwe API engine,
- pokazywać błąd, jeżeli zmiana się nie powiedzie.

Jeżeli lista jest długa, dodaj sensowne filtrowanie.

### Widok wznawiania sesji

Powinien:

- wyświetlać dostępne sesje,
- prezentować najważniejsze informacje o sesji,
- umożliwiać wybór,
- umożliwiać anulowanie,
- poprawnie odtworzyć historię,
- korzystać z tego samego mechanizmu ekranów co widok modelu.

## Approval

Przygotuj nowy, minimalistyczny widok approval.

Powinien być:

- jednoznaczny,
- czytelny,
- obsługiwany klawiaturą,
- spójny z resztą UI,
- prosty wizualnie.

Domyślnie nie pokazuj:

- całych fragmentów kodu,
- pełnych diffów,
- dużego JSON-a,
- wszystkich argumentów narzędzia,
- pełnej zawartości pliku,
- niepotrzebnych danych technicznych.

Podstawowy widok powinien pokazywać:

- nazwę działania,
- krótki opis tego, co zostanie wykonane,
- najważniejszy plik, ścieżkę lub zasób,
- dostępne decyzje,
- aktywnie zaznaczoną decyzję.

Jeżeli potrzebne są szczegóły, mogą być dostępne jako dodatkowa akcja, ale nie powinny być domyślnym głównym widokiem.

Approval powinien poprawnie przejmować focus, blokować skróty głównego ekranu, przekazywać decyzję do engine i zwalniać focus po zakończeniu.

## Narzędzia i komunikaty systemowe

Zaprojektuj oszczędny sposób prezentacji:

- rozpoczęcia narzędzia,
- trwania operacji,
- zakończenia narzędzia,
- sukcesu,
- błędu,
- anulowania,
- oczekiwania na approval.

Domyślnie pokazuj krótką i czytelną informację. Nie wyświetlaj automatycznie wszystkich surowych argumentów ani bardzo długich rezultatów.

## Stan oczekiwania

Pomiędzy wysłaniem wiadomości a rozpoczęciem streamowania pokaż subtelną animację ładowania.

Animacja powinna:

- wskazywać, że request trwa,
- działać wyłącznie przed rozpoczęciem właściwego streamu,
- zatrzymać się po pierwszym delta evencie,
- zatrzymać się po błędzie, anulowaniu lub zakończeniu requestu,
- nie powodować renderowania całej historii,
- nie zostawiać aktywnego timera po odmontowaniu komponentu.

## Markdown

Możesz:

- napisać własny lekki renderer,
- wykorzystać poprawne fragmenty starego renderera,
- uprościć zakres obsługiwanej składni,
- całkowicie zastąpić aktualną implementację.

Nie dopasowuj nowej architektury do starego renderera Markdown, jeżeli ten utrudnia wydajność lub czytelność.

Priorytetem są:

- zwykłe akapity,
- nagłówki,
- listy,
- kod inline,
- bloki kodu,
- czytelne zawijanie tekstu.

Bloki kodu powinny:

- być wygodne do kopiowania,
- nie mieć zbędnego poziomego paddingu,
- nie rozszerzać layoutu poza terminal,
- zachowywać się poprawnie w wąskim terminalu,
- nie renderować zbędnych ramek.

Nie dodawaj ciężkiej biblioteki Markdown bez wyraźnej korzyści.

## Wydajność

Zwróć szczególną uwagę na:

- zakres komponentów renderowanych przy każdym delta evencie,
- lokalizację często zmieniającego się stanu,
- duplikowanie historii,
- kopiowanie dużych tablic,
- duplikowanie subskrypcji,
- wycieki listenerów i timerów,
- niepotrzebne efekty Reacta,
- częstotliwość aktualizacji streamu,
- zachowanie po zakończeniu requestu,
- zachowanie po błędzie i anulowaniu,
- wiele następujących po sobie requestów,
- szybkie przełączanie ekranów,
- zmianę modelu,
- wznowienie dużej sesji.

Nie optymalizuj na ślepo. Stosuj rozwiązania proporcjonalne do skali projektu.

Jeżeli stosujesz throttling lub batching streamu:

- nie gub treści,
- opróżnij pozostały bufor po zakończeniu,
- poprawnie obsłuż anulowanie,
- usuń timer,
- nie opóźniaj zauważalnie finalnej treści.

## DRY i prostota

Stosuj DRY tam, gdzie ogranicza realną duplikację i ryzyko niespójności.

Nie twórz:

- abstrakcji tylko dlatego, że mogą być kiedyś potrzebne,
- generycznych fabryk komponentów używanych raz,
- wielowarstwowych adapterów bez uzasadnienia,
- systemu pluginów,
- rozbudowanego design systemu,
- własnego frameworka TUI,
- nadmiernie złożonego store.

Każda nowa abstrakcja powinna upraszczać kod, poprawiać testowalność, ograniczać sprzężenie albo eliminować realną duplikację.

## Metodyka pracy

Realizuj zadanie etapami. Nie buduj całej warstwy presentation w jednym dużym kroku.

Po każdym etapie:

- zaktualizuj plik planu,
- uruchom odpowiednie testy,
- uruchom typecheck,
- uruchom lint,
- sprawdź działanie ukończonego fragmentu,
- popraw wykryte problemy przed przejściem dalej.

Nie kończ zadania po samym audycie lub przygotowaniu planu.

## Etap 1 — analiza i plan

Przeanalizuj:

- `ui_old/`,
- aktualny engine,
- publiczne API engine,
- eventy,
- historię,
- sesje,
- streaming,
- approval,
- komendy,
- wybór modelu,
- resume,
- testy,
- obecne zależności.

Zidentyfikuj:

- elementy domenowe, które powinny pozostać w engine,
- elementy starego kleju, których nie warto zachowywać,
- potencjalne problemy wydajnościowe,
- miejsca duplikowania stanu,
- miejsca silnego sprzężenia UI z engine.

Następnie:

- utwórz plik planu,
- zaproponuj nową architekturę,
- zaproponuj strukturę katalogów,
- opisz przepływ danych,
- opisz sposób renderowania streamu,
- określ kryteria zakończenia kolejnych etapów.

Po przygotowaniu planu przejdź do implementacji.

## Etap 2 — fundament nowego presentation

Przygotuj od czystej struktury:

- nowy `App.tsx`,
- nowy folder `presentation/`,
- podstawowe typy presentation,
- stan aktywnego ekranu,
- cienką integrację z engine,
- obsługę subskrypcji,
- główny szkielet aplikacji.

Na tym etapie nie kopiuj całego starego UI i nie importuj komponentów z `ui_old/`.

## Etap 3 — główny chat

Zaimplementuj kompletny główny ekran czatu:

- nagłówek sesji,
- historię,
- rozróżnienie użytkownika i modelu,
- aktywny stream,
- loading przed pierwszym tokenem,
- input,
- model i katalog roboczy pod inputem,
- podstawowe błędy,
- anulowanie,
- komunikaty narzędzi.

Doprowadź ten ekran do działającego stanu przed rozpoczęciem systemu komend i dodatkowych ekranów.

Sprawdź:

- kilka kolejnych wiadomości,
- szybki i wolny stream,
- bardzo długą odpowiedź,
- błąd przed pierwszym tokenem,
- błąd podczas streamu,
- anulowanie,
- zmianę rozmiaru terminala.

## Etap 4 — system komend

Zaimplementuj:

- menu po wpisaniu `/`,
- jedno źródło definicji komend,
- filtrowanie,
- nawigację klawiaturą,
- zatwierdzenie,
- anulowanie,
- poprawne zarządzanie focusem,
- przejście do osobnego ekranu.

Najpierw przygotuj wspólny przepływ, a dopiero potem podłącz konkretne ekrany.

## Etap 5 — osobne ekrany

Zaimplementuj:

- ekran wyboru modelu,
- ekran wznawiania sesji,
- wspólny mechanizm przechodzenia pomiędzy ekranami,
- powrót do czatu,
- zachowanie historii,
- zachowanie inputu,
- poprawne zarządzanie focusem.

Sprawdź otwarcie, anulowanie, zatwierdzenie i błędy dla `/model` oraz `/resume`.

## Etap 6 — approval i narzędzia

Zaimplementuj:

- minimalistyczny widok approval,
- obsługę decyzji,
- przejęcie focusu,
- opcjonalne szczegóły,
- status rozpoczęcia narzędzia,
- status zakończenia,
- sukces,
- błąd,
- anulowanie.

Sprawdź sekwencje z jednym i wieloma tool callami.

## Etap 7 — Markdown i wykończenie

Zaimplementuj lub dopracuj:

- renderer tekstu,
- akapity,
- listy,
- nagłówki,
- kod inline,
- bloki kodu,
- zawijanie tekstu,
- zachowanie na małej szerokości,
- odstępy,
- separatory,
- spójność wizualną.

Usuń nieużywane pozostałości nowej implementacji. Nie usuwaj `ui_old/` przed pełnym zakończeniem weryfikacji.

## Etap 8 — optymalizacja i testy

Na końcu:

- przeanalizuj zakres renderowania,
- sprawdź długą historię,
- sprawdź szybki stream,
- sprawdź wiele wiadomości i tool calli,
- sprawdź zmianę modelu,
- sprawdź resume,
- sprawdź approval,
- sprawdź anulowanie i błędy,
- sprawdź zmianę rozmiaru terminala,
- sprawdź cleanup listenerów i timerów,
- uruchom pełny zestaw testów,
- uruchom typecheck,
- uruchom lint.

Jeżeli projekt ma testy renderowania Ink, zaktualizuj je lub dodaj nowe dla najważniejszych przepływów. Preferuj testy zachowania i przepływu stanu zamiast kruchych testów opartych wyłącznie na dokładnym wyglądzie każdego znaku.

## Kryteria odbioru

Zadanie można uznać za zakończone, gdy:

1. Powstał nowy `App.tsx` i nowy folder `presentation/`.
2. Finalne `App.tsx` i `presentation/` nie importują kodu z `ui_old/`.
3. Nowa implementacja nie jest zwykłą kopią starej struktury.
4. `App.tsx` jest niewielkim komponentem orkiestrującym.
5. Engine i presentation mają czytelną granicę odpowiedzialności.
6. Główny chat działa poprawnie i obsługuje streaming.
7. Zakończona historia nie renderuje się ponownie przy każdym tokenie.
8. Nie występuje duplikowanie wiadomości ani nagłówka sesji.
9. Użytkownik i model są jednoznacznie rozróżnialni.
10. Pod inputem widoczny jest aktualny model i katalog roboczy.
11. Po wpisaniu `/` pojawia się obsługiwane klawiaturą menu komend.
12. `/model` i `/resume` otwierają osobne ekrany korzystające ze wspólnego mechanizmu nawigacji.
13. Powrót z ekranu nie niszczy historii ani nie resetuje przypadkowo inputu.
14. Approval jest minimalistyczny i nie pokazuje domyślnie dużych bloków danych.
15. Loading działa wyłącznie przed rozpoczęciem streamu i poprawnie czyści timer.
16. Tool calle są prezentowane czytelnie i oszczędnie.
17. Zmiana rozmiaru terminala nie psuje układu.
18. Nie ma wycieków listenerów, timerów ani subskrypcji.
19. Typecheck, lint i testy przechodzą.
20. Plik planu odpowiada finalnie wykonanej implementacji.
21. Wszystkie zmiany kontraktów poza presentation zostały opisane i uzasadnione.
22. Wykorzystane lub odrzucone fragmenty `ui_old/` zostały krótko opisane.

## Raport końcowy

Po zakończeniu przedstaw:

- podsumowanie wykonanych etapów,
- finalną strukturę `presentation/`,
- rolę nowego `App.tsx`,
- opis granicy engine–presentation,
- opis przepływu eventów i stanu presentation,
- opis renderowania historii i streamingu,
- opis systemu komend,
- opis nawigacji pomiędzy ekranami,
- opis focus managementu,
- opis widoków `/model` i `/resume`,
- opis approval flow,
- opis prezentacji tool calli,
- opis renderera Markdown,
- zastosowane optymalizacje,
- elementy przeniesione z `ui_old/`,
- elementy starego UI zastąpione nowym rozwiązaniem,
- zmiany wykonane poza presentation,
- wyniki testów, typechecku i lintowania,
- znane ograniczenia i elementy pozostawione do dalszej pracy.

Nie kończ zadania po samym audycie lub utworzeniu planu.

Zaimplementuj całą nową warstwę prezentacyjną etapami.
