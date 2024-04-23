from datetime import datetime, timedelta

import streamlit as st
from utils.helper import local_css
from utils.model import ESAMI, Prova

st.set_page_config(
    page_title="Esame RT", page_icon="👨🏻‍💼", layout="centered", menu_items=None
)


@st.experimental_fragment(run_every="1s")
def timer(prova):
    time_remaining = prova.end_time - datetime.now()
    st.code(
        f"{time_remaining.seconds//60}:{time_remaining.seconds%60:02d}",
        language="text",
    )


def main():
    local_css("static/style.css")
    prova = st.session_state.get("prova")
    index = st.session_state.get("index", 0)
    if not st.session_state.get("risposte"):
        st.session_state["risposte"] = dict()
    risposte = st.session_state.get("risposte")

    # module choice
    if not prova:
        st.title("Simulazione esame RT 👨🏻‍💼")
        with st.form("choice-module"):
            st.subheader("Scegli il modulo")
            f_esame = st.selectbox("Tipo di Esame", ESAMI, label_visibility="collapsed")
            if st.form_submit_button("Inizia", use_container_width=True):
                st.session_state.prova = Prova(f_esame)
                st.rerun()
        return

    st.header(f"Simulazione: {prova.esame.nome} 📋")

    # is end?
    if st.session_state.get("end"):
        # tempo
        t_elapsed = st.session_state.end_time - (prova.end_time - timedelta(hours=1))
        st.code(
            f"Tempo impiegato: {t_elapsed.seconds//60}:{t_elapsed.seconds%60:02d}",
            language="text",
        )
        # questions
        domanda_show_idx = None
        cols_n = 8
        with st.expander("Domande 🕵🏻‍♂️", expanded=True):
            cols = st.columns(cols_n)
            for i, domanda in enumerate(prova.domande, 1):
                text = str(i) + (" ✅" if prova.risposte.get(domanda) else " ⛔️")
                if cols[(i - 1) % cols_n].button(text, use_container_width=True):
                    domanda_show_idx = i - 1
            if domanda_show_idx is not None:
                domanda = prova.domanda(domanda_show_idx)
                st.subheader(f"Domanda {domanda_show_idx+1} `{domanda.numero}`")
                st.divider()
                st.subheader(f"{domanda.domanda}")
                for i, opzione in enumerate(domanda.opzioni):
                    emoji = "👉🏻" if risposte.get(domanda.numero) == i else ""
                    emoji += "✅" if opzione == domanda.risposta else "⛔️"
                    st.write(f"{emoji} | {opzione}")
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
        st.title(f"Domanda {index+1} `{question.numero}`")
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
