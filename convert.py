from json import dump
from os.path import basename, splitext
from re import findall, search, sub
from sys import argv


class Question:
    def __init__(self, number, question, answers):
        self.number = number
        self.question = self.clean_text(question)
        self.build_answers(answers)
        self.auto_check()

    def clean_text(self, text):
        return sub(r"\s{2,}", " ", text.replace("\n", " ")).strip()

    def build_answers(self, answers):
        self.answers = list()
        answers_text = answers + "\n" * 2
        self.correct = None
        for match in findall(
            r"(Esatta|Sbagliata):\s+((?:.|\n)+?)(?:\n-|\n{2,})", answers_text
        ):
            corretta, answer = match
            answer = self.clean_text(answer)
            if search(r"[;.]$", answer):
                answer = answer[:-1]
            self.answers.append(answer)
            if corretta.strip() == "Esatta":
                self.correct = answer

    def auto_check(self):
        if len(self.answers) != 4:
            print("\n\n".join(f"{i}. {ans}" for i, ans in enumerate(self.answers, 1)))
            raise ValueError(f"Le risposte della domanda {self.number} non sono 4.")
        if not self.correct or self.correct not in self.answers:
            raise ValueError(
                "La risposta corretta manca o non è compresa nelle opzioni"
            )

    def __repr__(self):
        return f"[{self.number}] {self.question}\n{self.answers}"

    def to_json(self):
        return {
            "number": self.number,
            "question": self.question,
            "options": self.answers,
            "answer": self.correct,
        }


def main():
    # read file
    filename = argv[-1]
    text = open(filename).read()

    # build questions
    questions = list()
    data = sub(r"Modulo di Partecipazione:(.|\n)+?Pagina \d+ di \d+", "", text)
    data = "\n".join(line for line in data.split("\n") if line.strip())
    data = sub(r"(\w_\d_\d{5})", r"\n\n\g<1>", data)
    for match in findall(r"(\w_\d_\d{5}):\s+((?:.|\n)+?)\n-((?:.|\n)+?)\n{2}", data):
        questions.append(Question(*match))

    if not questions:
        return print(f"No questions found in '{filename}'.")

    # save
    file_name, _ = splitext(basename(filename))
    dump(
        [el.to_json() for el in questions],
        open(f"data/json/{file_name}.json", "w+"),
        indent=2,
        ensure_ascii=False,
    )
    print(f"Complete! {len(questions)} questions saved.")


if __name__ == "__main__":
    main()
