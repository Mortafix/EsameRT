from os import path

import streamlit as st

# ---- css


def local_css(version):
    with open(path.join(st.secrets.script.folder, "static/style.css")) as f:
        css_contents = f.read()
    st.html(f"<style>{css_contents}</style>")


def remote_css(url):
    st.write(f"<link href='{url}' rel='stylesheet'>", unsafe_allow_html=True)
