# Podaci: Parlamentarni izbori 2026

Ovaj repozitorijum služi da se na jednom mestu mogu pronaći i preuzeti javno dostupni podaci u vezi sa parlamentarnim izborima u Srbiji 2026. godine.

> [!IMPORTANT]
> **Ovo nisu zvanični podaci.** Zvanični podaci, u drugim formatima, objavljeni su na sajtu Republičke izborne komisije: [www.rik.parlament.gov.rs](https://www.rik.parlament.gov.rs/)

## Upotreba

Upotreba ovih podataka je slobodna, i za organizacije i za pojedince.

## Sadržaj

| Skup podataka | Fajl | Opis |
|---|---|---|
| [Biračka mesta](#biračka-mesta-srbija-2026) | [`biracka_mesta_par_2026.tsv`](biracka_mesta_par_2026.tsv) | Spisak biračkih mesta sa adresama i geografskim koordinatama |
| [Izborne komisije](#lokalne-izborne-komisije-srbija-2026) | [`izborne_komisije_par_2026.tsv`](izborne_komisije_par_2026.tsv) | Spisak lokalnih izbornih komisija sa kontaktima i koordinatama |

## Doprinos

> [!IMPORTANT]
> Ispravke i novi skupovi podataka su dobrodošli. Forkujte repozitorijum, napravite izmene i pošaljite Pull Request. Grešku u podacima možete prijaviti i kroz [Issues](../../issues).

## Alat za konverziju

U repozitorijumu se nalazi [`convert.js`](convert.js) — Node.js skripta bez dodatnih zavisnosti koja interaktivno konvertuje TSV fajlove iz ovog repozitorijuma.

**Zahtev:** Node.js (bilo koja novija verzija)

```bash
node convert.js
```

Skripta kroz meni pita za tri stvari:

1. **Fajl** — automatski pronalazi sve `.tsv` fajlove u direktorijumu
2. **Pismo** — bez promene / ćirilica → latinica / latinica → ćirilica
3. **Format izlaza** — MySQL, CSV, TSV, HTML, Excel (`.xlsx`) ili JSON

Izlazni fajl se kreira u istom direktorijumu, sa sufiksom `_lat` ili `_cir` ako je primenjena transliteracija (npr. `biracka_mesta_par_2026_lat.csv`).

Za MySQL izlaz skripta analizira sadržaj svake kolone i bira najprecizniji tip (`TINYINT`, `VARCHAR`, `DECIMAL` itd.). Za Excel izlaz automatski podešava širinu kolona.

---

## Biračka mesta, Srbija 2026

Spisak biračkih mesta po opštinama i gradovima, sa adresama i geografskim koordinatama.

### Izvor

Podaci su preuzeti sa sajta [izbori26.com](https://izbori26.com/) (sekcija „Biračka mesta“), iz pojedinačnih CSV fajlova po opštinama koje sajt koristi za prikaz na mapi. Kudos [@dacha_0](https://x.com/dacha_0).

> [!NOTE]
> **Nedostaju dve opštine:**
> - **Stari grad** — na sajtu RIK ne postoji odluka o biračkim mestima za ovu opštinu.
> - **Bela Crkva** — odluka postoji, ali se u njoj samo navodi da se „određuju mesta“, bez spiska biračkih mesta.

**Datum preuzimanja:** 29. septembar 2026.

### Fajl

| Svojstvo | Vrednost |
|---|---|
| Naziv | `biracka_mesta_par_2026.tsv` |
| Format | TSV (vrednosti odvojene tabom), UTF-8 sa BOM oznakom (ispravno se otvara u Excelu) |
| Pismo | ćirilica |
| Broj redova | 8.275 biračkih mesta (plus zaglavlje) |
| Obuhvat | 175 opština i gradskih opština (nedostaju Stari grad i Bela Crkva, vidi [Izvor](#izvor)) |
| Sortiranje | po nazivu opštine, zatim po rednom broju biračkog mesta |

### Kolone

| Kolona | Opis |
|---|---|
| `opstina` | Naziv opštine, grada ili gradske opštine |
| `redni_broj` | Redni broj biračkog mesta u okviru opštine |
| `biracko_mesto` | Naziv objekta u kojem je biračko mesto (škola, mesna zajednica i sl.) |
| `adresa` | Puna adresa u obliku „Naselje, Ulica i broj“ |
| `naselje` | Naselje ili mesto |
| `ulica` | Ulica i kućni broj (može biti prazno) |
| `lat` | Geografska širina (WGS84) |
| `lng` | Geografska dužina (WGS84) |
| `geo_tacnost` | Koliko je lokacija precizna (vidi ispod) |

### Tačnost geolokacije (`geo_tacnost`)

| Vrednost | Značenje | Broj |
|---|---|---:|
| `objekat` | Tačna lokacija zgrade | 4.636 |
| `naselje` | Približno, centar naselja | 2.393 |
| `ulica` | Približno, lokacija ulice | 749 |
| `drugo:*` | Poklopljeno sa drugim tipom objekta (reka, pruga, aerodrom i sl.), treba proveriti | 45 |
| `nije_nadjeno` | Lokacija nije pronađena, `lat` i `lng` su prazni | 452 |

### Napomene

- Koordinate su dobijene automatskim geokodiranjem adresa i ne potiču od izborne komisije. Zato lokacije koje nisu tipa `objekat` treba uzeti kao približne.
- Za 28 biračkih mesta izvor nije posebno naveo naselje i ulicu. Kod njih su `naselje` i `ulica` izvučeni iz kolone `adresa`, deljenjem na prvom zarezu.

---

## Lokalne izborne komisije, Srbija 2026

Spisak lokalnih (opštinskih i gradskih) izbornih komisija sa adresama, kontakt telefonima, imejl adresama i geografskim koordinatama.

### Izvor

Podaci potiču sa sajta Republičke izborne komisije [www.rik.parlament.gov.rs](https://www.rik.parlament.gov.rs/) (spisak lokalnih izbornih komisija).

**Datum preuzimanja:** 29. septembar 2026.

### Fajl

| Svojstvo | Vrednost |
|---|---|
| Naziv | `izborne_komisije_par_2026.tsv` |
| Format | TSV (vrednosti odvojene tabom), UTF-8 sa BOM oznakom (ispravno se otvara u Excelu) |
| Pismo | latinica |
| Broj redova | 170 izbornih komisija (plus zaglavlje) |
| Sortiranje | po nazivu izborne komisije |

### Kolone

| Kolona | Opis |
|---|---|
| `id` | Redni broj u fajlu |
| `Izborna_komisija` | Naziv opštine ili grada čija je izborna komisija |
| `adresa` | Puna adresa u obliku „Mesto, Ulica i broj“ |
| `telefon_1` do `telefon_5` | Kontakt telefoni (može biti prazno; do pet brojeva po komisiji) |
| `email` | Imejl adresa komisije |
| `latitude` | Geografska širina (WGS84) |
| `longitude` | Geografska dužina (WGS84) |

### Napomene

- Sve komisije imaju bar jedan telefon i imejl adresu, kao i popunjene koordinate.
- Kolone `telefon_2` do `telefon_5` popunjene su samo kod komisija koje imaju više brojeva; kod ostalih su prazne.
