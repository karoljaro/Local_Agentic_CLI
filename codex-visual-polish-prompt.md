# Visual polish i dopracowanie UX warstwy presentation

Obecna przebudowa warstwy `presentation/` jest funkcjonalnie i architektonicznie zakończona. Nie przebudowuj ponownie całej architektury, engine, streamingu, reducerów ani granicy engine–presentation.

Twoim zadaniem jest teraz **dopracowanie wyglądu i interakcji istniejącego UI**, tak aby interfejs nie wyglądał jak techniczny prototyp, lecz jak spójne, minimalistyczne narzędzie agentowe.

Projekt korzysta z:

- TypeScript,
- React,
- Ink 7.1.0,
- Bun,
- obecnej warstwy `presentation/`,
- osobnych ekranów `/model` i `/resume`,
- streamowanych odpowiedzi,
- approval flow,
- obsługi komend po wpisaniu `/`.

## Główny cel

Zachowaj aktualną architekturę i działające zachowanie, ale popraw:

- hierarchię wizualną,
- czytelność elementów interaktywnych,
- wyróżnienie inputów,
- wygląd menu komend,
- wygląd ekranów wyboru,
- wygląd approval,
- spójność odstępów,
- ogólne wrażenie dopracowanego produktu.

UI ma pozostać minimalistyczne. Nie zamieniaj go w ciężki interfejs pełen ramek, dużych paneli i dekoracji.

Potrzebna jest jednak wyraźniejsza hierarchia między:

- historią rozmowy,
- composerem,
- menu komend,
- osobnymi ekranami,
- aktywną operacją narzędzia,
- approval.

## Ograniczenia

Nie zmieniaj bez uzasadnionej potrzeby:

- logiki engine,
- sposobu wykonywania agenta,
- mechanizmu streamowania,
- kontraktów trwałych eventów,
- istniejącej nawigacji ekranów,
- zachowania `/model` i `/resume`,
- obecnego approval flow,
- reducerów i controllerów, jeżeli nie jest to konieczne do poprawy UI.

Nie wykonuj kolejnego dużego refaktoru architektury.

Możesz zmieniać:

- komponenty Ink,
- layout,
- kolory,
- tła,
- paddingi i marginesy,
- markery,
- formatowanie help textów,
- sposób prezentacji focusu,
- lokalizację menu komend względem inputu,
- wizualną strukturę ekranów wyboru,
- wizualną strukturę approval,
- małe komponenty współdzielone pomiędzy elementami interaktywnymi.

Nie dodawaj ciężkiej biblioteki UI ani rozbudowanego design systemu.

## 1. Główny composer

Obecny input jest zbyt słabo wyróżniony i zlewa się z historią rozmowy.

Przebuduj jego wygląd tak, aby użytkownik od razu widział:

- gdzie rozpoczyna się obszar wpisywania,
- czy input ma focus,
- gdzie znajduje się kursor,
- jakie akcje są dostępne,
- gdzie kończy się historia, a zaczyna composer.

Composer powinien:

- mieć subtelnie wyróżnione tło albo inną lekką formę wizualnego kontenera,
- pozostać minimalistyczny,
- nie używać ciężkiej pełnej ramki, jeżeli nie jest potrzebna,
- mieć czytelny aktywny marker promptu,
- mieć lepiej widoczny placeholder,
- zachowywać się dobrze w wąskim terminalu,
- nie zajmować nadmiernie dużo miejsca w pionie.

Stan aktywnego inputu powinien być widoczny, ale nie krzykliwy.

Help text, model, katalog roboczy i session id powinny nadal znajdować się w pobliżu composera, lecz mieć niższy priorytet wizualny niż właściwy input.

Zadbaj o spójne rozdzielenie:

1. właściwego inputu,
2. pomocy klawiaturowej,
3. metadanych modelu, workspace i sesji.

## 2. Menu komend po wpisaniu `/`

Obecna lista komend działa, ale wygląda jak niezależny fragment tekstu nad inputem.

Zmień jej prezentację tak, aby zachowywała się wizualnie jak **dropdown lub autocomplete powiązane z composerem**.

Menu powinno:

- znajdować się bezpośrednio pod właściwym polem inputu,
- być wizualnie zakotwiczone do composera,
- mieć subtelne tło lub wyraźnie odciętą powierzchnię,
- nie wyglądać jak część trwałej historii rozmowy,
- nie zostawiać po zamknięciu elementów w terminalu,
- zachowywać poprawne filtrowanie i sterowanie klawiaturą.

Aktywna pozycja powinna być wyraźniej zaznaczona poprzez sensowne połączenie:

- tła,
- koloru tekstu,
- markera,
- pogrubienia.

Nie opieraj zaznaczenia wyłącznie na kolorze.

Nazwa komendy powinna mieć wyższy priorytet niż jej opis.

Przykładowa hierarchia:

```text
/model [name]    Choose a local model
/resume          Resume or start a session
```

Nie kopiuj tego układu mechanicznie — dopasuj go do szerokości terminala i obecnej estetyki.

Help text dotyczący klawiszy powinien znajdować się przy dropdownie albo pod nim, ale nie powinien konkurować wizualnie z wynikami.

## 3. Ekran `/model`

Obecny ekran wyboru modelu funkcjonalnie działa, ale pole wyszukiwania nad listą nie wygląda jednoznacznie jak input.

Dopracuj układ ekranu tak, aby miał czytelną strukturę:

1. tytuł ekranu,
2. pole wyszukiwania lub filtrowania,
3. listę wyników,
4. pomoc klawiaturową.

Pole wyszukiwania powinno:

- być wyraźnie rozpoznawalne jako aktywny input,
- mieć subtelny background lub kontener,
- mieć czytelny marker focusu,
- posiadać sensowny placeholder, np. informujący o filtrowaniu modeli,
- być wizualnie oddzielone od listy.

Lista modeli powinna:

- mieć wyraźniejsze zaznaczenie aktywnego elementu,
- nadal pokazywać aktualnie używany model,
- czytelnie prezentować metadane modelu,
- nie wyglądać jak surowy output terminala,
- poprawnie zachowywać się przy małej szerokości terminala.

Informacja `current` powinna pozostać czytelna, ale nie konkurować z nazwą modelu.

## 4. Ekran `/resume`

Zastosuj tę samą hierarchię i język wizualny co w ekranie `/model`.

Ekran powinien posiadać:

- czytelny tytuł,
- jednoznacznie wyglądające pole wyszukiwania,
- wyróżnioną listę sesji,
- wyraźny aktywny element,
- spójną pomoc klawiaturową.

`/model` i `/resume` powinny wyglądać jak elementy tej samej aplikacji i korzystać ze wspólnych komponentów wizualnych tam, gdzie rzeczywiście mają identyczne potrzeby.

Nie duplikuj stylowania obu ekranów, jeżeli można je utrzymać w istniejącym wspólnym `SelectionScreen`.

## 5. Approval

Obecny approval działa poprawnie, ale zbyt słabo odcina się od historii i aktywnego tool flow.

Approval jest stanem wymagającym świadomej decyzji użytkownika, dlatego powinien być bardziej widoczny niż zwykły wpis systemowy.

Przebuduj jego wygląd jako minimalistyczny, wyraźny blok.

Powinien posiadać:

- subtelnie wyróżnione tło,
- czytelny nagłówek,
- nazwę wykonywanej operacji,
- najważniejszą ścieżkę lub zasób,
- wyraźne opcje decyzji,
- dobrze widoczne aktualne zaznaczenie,
- help text o niższym priorytecie wizualnym.

Nie pokazuj domyślnie:

- pełnych diffów,
- całych fragmentów kodu,
- dużego JSON-a,
- wszystkich parametrów narzędzia.

Approval nie powinien być ogromnym modalem. Powinien być kompaktowy, ale jednoznacznie odcinać się od pozostałej treści.

Domyślnie nadal ma być zaznaczone bezpieczniejsze `Reject`, jeżeli takie jest obecne zachowanie.

Zadbaj o poprawny wygląd zarówno przy dwóch krótkich opcjach, jak i w wąskim terminalu.

## 6. Widok aktywnego turnu i tool flow

Obecna prezentacja wykonywania zadania jest ogólnie dobra. Nie przebudowuj jej bez potrzeby.

Zachowaj:

- czytelne rozróżnienie `You`, `Assistant` i `Tool`,
- lekkie markery,
- aktualny streaming,
- status oczekiwania,
- kompaktowe informacje o narzędziach.

Możesz jedynie dopracować:

- odstępy między wpisami,
- subtelne wyróżnienie aktualnego stanu,
- spójność kolorów i markerów z composerem oraz approval,
- relację między `waiting for response` i oczekiwaniem na approval.

Nie dodawaj ramek wokół każdej wiadomości.

## 7. Spójny język wizualny

Przygotuj mały, prosty zestaw współdzielonych zasad wizualnych dla elementów interaktywnych:

- aktywny input,
- nieaktywny input,
- aktywna pozycja listy,
- panel dropdownu,
- ekran wyboru,
- approval,
- help text,
- secondary metadata,
- warning,
- success,
- error.

Nie musi to być osobny rozbudowany system theme. Może być niewielkim zestawem współdzielonych komponentów, propsów lub stałych.

Zadbaj, aby:

- cyan nie był używany do wszystkiego,
- kolory miały spójne znaczenie,
- tło nie było nadużywane,
- ważne stany nie zależały wyłącznie od koloru,
- tekst o niskim priorytecie był czytelny, ale rzeczywiście drugorzędny,
- zaznaczenie działało również w terminalach z ograniczoną paletą kolorów.

Przeanalizuj działanie zarówno na ciemnym, jak i potencjalnie jasnym tle terminala. Nie zakładaj, że terminal zawsze będzie miał dokładnie ten sam motyw co na screenshotach.

## 8. Background i kompatybilność terminala

Możesz użyć właściwości `backgroundColor` Ink do wyróżniania:

- composera,
- menu komend,
- inputu filtrowania,
- aktywnej pozycji,
- approval.

Stosuj jednak background oszczędnie.

Pamiętaj, że tło w terminalu obejmuje tylko wyrenderowane znaki. Jeżeli panel ma wyglądać jak pełny prostokąt, poprawnie wypełnij jego szerokość albo zaprojektuj go tak, aby nie wymagał sztucznego rozciągania pustymi znakami.

Nie twórz dużych powierzchni tła na pełną szerokość terminala bez potrzeby.

Zadbaj o:

- brak wizualnych artefaktów przy resize,
- brak pozostawionego tła po zamknięciu dropdownu,
- brak przesuwania historii,
- brak duplikacji elementów,
- poprawne zachowanie przy 24–30 kolumnach,
- brak regresji na Windows Terminal i terminalach linuksowych.

## 9. Architektura zmian

Preferuj zmiany przede wszystkim w istniejących komponentach:

- `Composer`,
- `CommandMenu`,
- `SelectionScreen`,
- `ModelScreen`,
- `ResumeScreen`,
- `ApprovalView`,
- `ChatScreen`,
- małych współdzielonych komponentach prezentacyjnych.

Nie przenoś całej logiki z powrotem do `App.tsx`.

Nie ingeruj w `PresentationController`, engine ani trwałe eventy, chyba że znajdziesz rzeczywisty problem wymagający takiej zmiany.

Jeżeli potrzebujesz współdzielonego komponentu, może to być na przykład prosty:

- `InteractivePanel`,
- `InputSurface`,
- `KeyHints`,
- `SelectionRow`.

To tylko przykłady. Nie twórz każdego z nich automatycznie. Utwórz wyłącznie abstrakcje, które rzeczywiście eliminują powtarzający się kod.

## Etapy pracy

### Etap 1 — audyt wizualny

Najpierw przeanalizuj aktualne komponenty i screenshoty.

Zapisz krótko:

- które elementy nie mają wystarczającej hierarchii,
- które style można współdzielić,
- jak poprawić UI bez naruszenia aktualnej architektury.

Możesz dopisać krótką sekcję do istniejącego planu przebudowy albo utworzyć niewielki dokument dotyczący visual polish.

Nie kończ na samym audycie.

### Etap 2 — composer i dropdown

Najpierw dopracuj:

- główny input,
- jego help text,
- metadata footer,
- menu komend pod inputem,
- active item highlight.

Sprawdź zwykły input, `/`, filtrowanie, pusty wynik, Escape, Enter, Tab i resize.

### Etap 3 — selection screens

Dopracuj wspólnie:

- `/model`,
- `/resume`,
- search input,
- listę,
- aktywny element,
- loading,
- error,
- empty state,
- help text.

Nie implementuj dwóch różnych języków wizualnych.

### Etap 4 — approval

Dopracuj:

- kontener,
- background,
- nagłówek,
- opis działania,
- decyzje,
- focus,
- help text,
- opcjonalne szczegóły.

### Etap 5 — spójność i testy

Na końcu:

- ujednolić spacing,
- ujednolić kolory i markery,
- sprawdzić długą historię,
- sprawdzić aktywny stream,
- sprawdzić approval podczas tool calla,
- sprawdzić resize,
- sprawdzić wąski terminal,
- uruchomić typecheck, testy, format i build.

## Kryteria odbioru

Zmiany są zakończone, gdy:

1. Composer jest jednoznacznie rozpoznawalny jako aktywny obszar wpisywania.
2. Input nie zlewa się z historią rozmowy.
3. Menu komend znajduje się bezpośrednio pod inputem i wygląda jak dropdown/autocomplete.
4. Aktywna komenda jest wyraźnie zaznaczona.
5. `/model` posiada czytelny tytuł, input wyszukiwania i listę wyników.
6. `/resume` korzysta z tego samego języka wizualnego.
7. Pole filtrowania w osobnych ekranach wygląda jak input, a nie przypadkowa linia tekstu.
8. Approval jest widocznym, ale nadal minimalistycznym blokiem.
9. Aktualnie wybrana decyzja approval jest jednoznaczna.
10. Tool flow oraz streaming nie zostały pogorszone.
11. Historia nie jest duplikowana ani niepotrzebnie przesuwana.
12. UI zachowuje się poprawnie przy zmianie szerokości terminala.
13. Interfejs pozostaje czytelny przy wąskim terminalu.
14. Nie powstał ciężki design system ani niepotrzebny refaktor architektury.
15. `App.tsx` nadal pozostaje komponentem orkiestrującym.
16. Typecheck, testy, format i build przechodzą.

## Raport końcowy

Po zakończeniu przedstaw:

- listę zmienionych komponentów,
- opis zmian composera,
- opis nowego układu dropdownu komend,
- opis zmian `/model` i `/resume`,
- opis zmian approval,
- zastosowane zasady kolorów i backgroundów,
- opis zachowania przy wąskim terminalu,
- wyniki testów, typechecku, formatu i buildu,
- ewentualne ograniczenia zależne od możliwości terminala.

Nie przebudowuj ponownie całej warstwy presentation.

Skup się na domknięciu wizualnym i interakcyjnym istniejącego rozwiązania.
