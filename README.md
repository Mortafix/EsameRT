# RT Lab

RT Lab è un simulatore privato per preparare la verifica di idoneità del
Responsabile Tecnico dell’Albo Nazionale Gestori Ambientali. È un monolite
Next.js con MongoDB: il server decide estrazione, timer, punteggio e visibilità
delle soluzioni.

L’app include:

- prove da 40 domande e 60 minuti per un singolo modulo;
- verifica iniziale o di aggiornamento, con soglie ufficiali dedicate;
- autosalvataggio, navigazione libera, omissione, pausa esplicita e ripresa;
- risultato completo, storico eliminabile e statistiche personali;
- ripasso guidato sugli errori più frequenti;
- accesso con codice personale e sessione rolling di 365 giorni;
- pannello amministrativo per utenti, codici, sessioni e statistiche aggregate;
- import ripetibile e validato delle nove banche ufficiali italiane 2026.

## Regole ufficiali

La configurazione applica la
[Deliberazione n. 6 del 26 novembre 2025](https://www.albonazionalegestoriambientali.it/Download/it/DelibereComitatoNazionale/146-Del6_26.11.2025.pdf):

| Prova | Soglia |
| --- | ---: |
| Iniziale — modulo generale | 32 |
| Iniziale — modulo specialistico | 34 |
| Aggiornamento — modulo specialistico | 28 |

Ogni risposta corretta vale `+1`, ogni errata `-0,5`, ogni omessa `0`. Il
modulo generale non è previsto nella verifica di aggiornamento.

Le fonti delle domande sono l’[area quiz dell’Albo](https://www.albonazionalegestoriambientali.it/RT/Login.aspx)
e l’[avviso per le verifiche da luglio 2026](https://www.albonazionalegestoriambientali.it/Public/News/verifiche_RT).
Il manifest, gli hash delle fonti e gli export normalizzati sono in
[`data/official-2026`](data/official-2026).


## Importer ufficiale

```bash
# Valida e rigenera tutti gli export JSON
npm run questions:import

# Importa e attiva le nove banche in MongoDB
npm run questions:import -- --mongo

# Verifica una cache locale senza rete
npm run questions:import -- --offline --check-only
```

L’import viene bloccato se l’hash del PDF cambia, una domanda non ha materia o
ID ministeriale, non contiene esattamente quattro opzioni e una sola corretta,
oppure se un’intestazione del PDF contamina il testo. Le normalizzazioni sono
solo conservative e ogni versione della banca è immutabile.

Ogni banca viene incrociata anche con l’export tabellare pubblicato nell’avviso
di luglio 2026. Gli export iniziali mantengono l’ordine della fonte con ID;
quelli di aggiornamento raggruppano invece le righe diversamente e vengono
verificati per appartenenza esatta. L’export ufficiale di aggiornamento della
categoria 8 omette cinque ID (`8_4_06179`–`8_4_06183`) presenti nella fonte con
ID: l’eccezione è hash-lockata e dichiarata esplicitamente nel manifest.
