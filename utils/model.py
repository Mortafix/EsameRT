from dataclasses import dataclass
from datetime import datetime, timedelta
from json import load
from random import shuffle
from typing import List

# ---- domande


@dataclass
class Domanda:
    numero: str
    domanda: str
    opzioni: List[str]
    risposta: str


# ---- esame


@dataclass
class Esame:
    def __init__(self, nome, dataset, obiettivo):
        self.nome = nome
        self.domande = {q.numero: q for q in self._load_questions(dataset)}
        self.obiettivo = obiettivo
        self.domande_n: int = 40
        self.ans_correct: int = 1
        self.ans_wrong: int = -0.5
        self.ans_empty: int = 0

    def __repr__(self):
        return self.nome

    def get(self, question_number):
        return self.domande.get(question_number)

    def _load_questions(self, filename):
        data = load(open(f"data/json/{filename}.json"))
        return [
            Domanda(
                entry.get("number"),
                entry.get("question"),
                entry.get("options"),
                entry.get("answer"),
            )
            for entry in data
        ]


ESAMI = [
    Esame("Modulo BASE", "base", 32),
    Esame("Modulo Cat. 1-4-5", "145", 34),
    Esame("Modulo Cat. 8", "8", 34),
    Esame("Modulo Cat. 9", "9", 34),
    Esame("Modulo Cat. 10", "10", 34),
    Esame("Aggiornamento | Modulo BASE", "base", 28),
    Esame("Aggiornamento | Modulo Cat. 1-4-5", "145", 30),
    Esame("Aggiornamento | Modulo Cat. 8", "8", 30),
    Esame("Aggiornamento | Modulo Cat. 9", "9", 30),
    Esame("Aggiornamento | Modulo Cat. 10", "10", 30),
]

# ---- Prova


@dataclass
class Prova:
    def __init__(self, esame):
        self.esame = esame
        for domande in self.esame.domande.values():
            shuffle(domande.opzioni)
        domande_possibili = list(self.esame.domande.values())
        shuffle(domande_possibili)
        self.domande = [q.numero for q in domande_possibili[: self.esame.domande_n]]
        self.risposte = dict()
        self.end_time = datetime.now() + timedelta(hours=1)

    def domanda(self, index):
        return self.esame.domande.get(self.domande[index])

    def aggiungi_risposta(self, numero, risposta=None):
        risultato = risposta == self.esame.get(numero).risposta if risposta else None
        self.risposte[numero] = risultato
        return risultato

    def calcola_punteggio(self):
        punteggi = {
            True: self.esame.ans_correct,
            False: self.esame.ans_wrong,
            None: self.esame.ans_empty,
        }
        return sum(punteggi.get(risposta) for risposta in self.risposte.values())
