from datetime import datetime, timedelta

import streamlit as st
from utils.helper import local_css
from utils.model import ESAMI, Prova

st.set_page_config(
    page_title="Esame RT", page_icon="📖", layout="centered", menu_items=None
)


@st.fragment(run_every="1s")
def timer(prova):
    now = datetime.now()
    if prova.end_time <= now:
        return st.subheader(f"⏰ Tempo rimanente: :red[SCADUTO!]")
    time_left = prova.end_time - now
    st.subheader(
        f"⏰ Tempo rimanente: :orange[{time_left.seconds//60}m {time_left.seconds%60}s]",
    )


def esame_label(esame):
    return f"{esame.nome} • {esame.obiettivo} punti • {len(esame.domande)} domande"


def main():
    local_css("static/style.css")
    prova = st.session_state.get("prova")
    index = st.session_state.get("index", 0)
    if not st.session_state.get("risposte"):
        st.session_state["risposte"] = dict()
    risposte = st.session_state.get("risposte")

    # module choice
    if not prova:
        st.title("Simulazione Esame RT 👨🏻‍💼")
        with st.form("choice-module"):
            st.subheader("Scegli il modulo")
            f_esame = st.selectbox(
                "Tipo di Esame",
                ESAMI,
                format_func=esame_label,
                label_visibility="collapsed",
            )
            is_aggiornamento = st.checkbox(
                "Stai facendo l'**aggiornamento**?",
                help="L'obiettivo punti dell'aggiornamento è 4 punti in meno",
            )
            if st.form_submit_button("Inizia", use_container_width=True):
                if is_aggiornamento:
                    f_esame.set_aggiornamento()
                st.session_state.prova = Prova(f_esame)
                st.rerun()
        return

    st.header(f"Simulazione: {prova.esame.nome} 📋")
    st.info(
        f"L'obiettivo è **{prova.esame.obiettivo}** punti in un totale di"
        f" **{len(prova.esame.domande)}** domande"
    )

    # is end?
    if st.session_state.get("end"):
        # tempo
        t_elapsed = st.session_state.end_time - (prova.end_time - timedelta(hours=1))
        st.subheader(
            f"⏰ Tempo impiegato: :blue[{t_elapsed.seconds//60}m {t_elapsed.seconds%60}s]"
        )
        # questions
        domanda_show_idx = None
        cols_n = 8
        with st.expander("Domande 🕵🏻‍♂️", expanded=True):
            cols = st.columns(cols_n)
            for i, domanda in enumerate(prova.domande, 1):
                emojis = {True: "✅", False: "⛔️", None: "↪️"}
                text = f"{i} {emojis.get(prova.risposte.get(domanda))}"
                if cols[(i - 1) % cols_n].button(text, use_container_width=True):
                    domanda_show_idx = i - 1
            if domanda_show_idx is not None:
                domanda = prova.domanda(domanda_show_idx)
                st.header(f":gray[Domanda {domanda_show_idx+1} `{domanda.numero}`]")
                st.divider()
                st.subheader(f"{domanda.domanda}")
                for i, opzione in enumerate(domanda.opzioni):
                    color_bg, emoji = None, "⛔️" if opzione != domanda.risposta else "✅"
                    if risposte.get(domanda.numero) == i:
                        bgs = emojis = {True: "green", False: "red", None: "gray"}
                        color_bg = bgs.get(prova.risposte.get(domanda.numero))
                    opt = f"{emoji} | {opzione}"
                    st.write(f":{color_bg}-background[{opt}]" if color_bg else opt)

        # punteggio
        punteggio_finale = prova.calcola_punteggio()
        if punteggio_finale >= prova.esame.obiettivo:
            st.success(f"Hai **superato** l'esame con **{punteggio_finale}** punti!")
            st.balloons()
        else:
            st.error(f"Hai **fallito** l'esame con **{punteggio_finale}** punti..")
        if st.button("Ricomincia 🔄", use_container_width=True):
            st.session_state.clear()
            st.rerun()
        return

    # timer
    timer(prova)

    # questions list
    cols_n = 8
    with st.expander("Domande 🕵🏻‍♂️"):
        cols = st.columns(cols_n)
        for i, domanda in enumerate(prova.domande, 1):
            text = str(i) + (" 📢" if prova.risposte.get(domanda) is not None else "")
            if cols[(i - 1) % cols_n].button(text, use_container_width=True):
                st.session_state.index = i - 1
                st.rerun()

    # question
    question = prova.domanda(index)
    with st.form("question"):
        st.header(f":gray[Domanda {index+1} `{question.numero}`]")
        st.divider()
        st.subheader(f"{question.domanda}")
        answer = st.radio(
            "Risposte",
            question.opzioni,
            risposte.get(question.numero),
            label_visibility="collapsed",
        )
        l_col, r_col = st.columns(2)
        rispondi = l_col.form_submit_button("Rispondi ✅", use_container_width=True)
        salta = r_col.form_submit_button("Salta ↪️", use_container_width=True)
        if rispondi or salta:
            prova.aggiungi_risposta(question.numero, answer if rispondi else None)
            if answer:
                idx = question.opzioni.index(answer)
                st.session_state.risposte[question.numero] = idx
            if index < prova.esame.domande_n - 1:
                st.session_state.index = index + 1
            st.rerun()

    # end
    if st.button("Termina prova 🏁", use_container_width=True):
        st.session_state.end_time = datetime.now()
        st.session_state.end = True
        st.rerun()


if __name__ == "__main__":
    main()
