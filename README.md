# Simulatore Esame Responsabile Tecnico di Rifiuti

Il portale è ONLINE e GRATIUTO: [Esame RT](https://rt.moris.dev)

Questo progetto ospita il codice sorgente del portale di simulazione per l'esame di [Responsabile Tecnico di Rifiuti](https://www.albonazionalegestoriambientali.it/rt/login.aspx). Il portale permette agli utenti di prepararsi efficacemente all'esame, fornendo una serie di domande tipo esame per tutti i moduli.

## Moduli
I moduli, aggiornati all'ultimo cambiamento, sono i seguenti
- Modulo base obbligatorio per tutte le categorie
- Modulo specialistico | Categorie 1, 4 e 5
- Modulo specialistico | Categoria 8
- Modulo specialistico | Categoria 9
- Modulo specialistico | Categoria 10

## Origine dei Dati

I dati utilizzati per le domande del simulatore sono derivati principalmente dalla **Normative e Leggi Ufficiali**, in particolare dall'_art. 13 comma 1 D.M. 120/2014; art.2 Delibera del Comitato Nazionale n.6/2017_. Questo approccio garantisce che il simulatore sia uno strumento affidabile per la preparazione all'esame di Responsabile Tecnico di Rifiuti.

I dati sono salvati in locale, ed è possibile visionarli nella cartella [data](data) in modalità PDF, testo e JSON.


## Installazione locale

Per avviare il progetto localmente, seguire questi passi:

1. Scaricare la repo localmente
```bash
git clone https://github.com/Mortafix/EsameRT
cd EsameRT
```
2. Installare i requisiti
> ATTENZIONE: python3 è necessario!
```bash
pip install -r requirements.txt
```
3. Eseguire il portale
```bash
streamlit run app.py
```
4. Visita localhost alla porta 8501
