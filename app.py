from pathlib import Path

import streamlit as st
from dotenv import load_dotenv

from services.evidence import COVERAGE_NOTICE, load_data, normalize, parse_names, retrieve
from services.providers import ProviderError, get_provider

load_dotenv(Path(__file__).parent / '.env')
st.set_page_config(page_title='Medication Evidence Explainer', page_icon='💊', layout='centered')
data = load_data()


def clear_result():
    st.session_state.pop('result', None)


def clear_lookup():
    clear_result()
    st.session_state.pop('medications', None)
    st.session_state.pop('unknown', None)
    st.session_state['confirmed'] = False


def sample(text):
    clear_lookup()
    st.session_state['medication_text'] = text


st.title('Medication Evidence Explainer')
st.write('Turn a medication list into a source-backed explanation of selected label warnings.')
st.warning('Educational prototype with limited coverage. Do not change medication based on this tool; discuss concerns with a pharmacist or prescriber.')
with st.expander('What this prototype covers'):
    st.write('Names recognized: ' + ', '.join(m['name'] for m in data['medications']) + '.')
    st.write('Evidence available: warfarin + aspirin; warfarin + ibuprofen. Other pairs are outside coverage, including pairs made from recognized names.')
    st.caption('Ingredient-level lookup only. Strength, formulation, allergies, food interactions, and patient-specific factors are not assessed. No OCR yet.')

left, right = st.columns(2)
left.button('Load supported example', on_click=sample, args=('warfarin\naspirin',), use_container_width=True)
right.button('Load coverage example', on_click=sample, args=('aspirin\nlisinopril',), use_container_width=True)
st.subheader('1. Enter ingredient names')
st.text_area('One ingredient per line', key='medication_text', placeholder='warfarin\naspirin', on_change=clear_lookup, height=120, help='Use generic ingredient names only. Do not enter personal information or prescription photos.')
if st.button('Review medications', type='primary'):
    clear_lookup()
    try:
        names = parse_names(st.session_state.medication_text)
        medications, unknown = normalize(names, data)
        st.session_state['medications'] = medications
        st.session_state['unknown'] = unknown
    except ValueError as exc:
        st.error(str(exc))

if 'medications' in st.session_state:
    st.subheader('2. Confirm the ingredients')
    medications = st.session_state.medications
    for medication in medications:
        st.write(f"• {medication['name'].capitalize()} — RxNorm ingredient {medication['rxcui']}")
    unknown = st.session_state.unknown
    if unknown:
        st.error('Unrecognized names: ' + ', '.join(unknown) + '. Correct the list before continuing; no medication will be silently omitted.')
    st.caption('Matched against the bundled RxNorm ingredient catalog, verified November 19, 2026. This is not a live RxNorm lookup.')
    confirmed = st.checkbox('These ingredient names match my intended example.', key='confirmed', on_change=clear_result, disabled=bool(unknown))
    if st.button('Find evidence and explain', disabled=bool(unknown) or not confirmed or len(medications) < 2):
        records, uncovered = retrieve(medications, data)
        result = {'records': records, 'uncovered': uncovered, 'explanation': None, 'error': None}
        if records:
            with st.spinner('Preparing the evidence explanation…'):
                try:
                    result['explanation'] = get_provider().explain(records)
                except ProviderError as exc:
                    result['error'] = str(exc)
        st.session_state['result'] = result

if 'result' in st.session_state:
    result = st.session_state.result
    st.subheader('3. Evidence and explanation')
    st.caption('Results apply only to the confirmed ingredient list. Retrieval scores are text similarity, not clinical confidence or severity.')
    if result['uncovered']:
        st.warning(COVERAGE_NOTICE)
        for pair in result['uncovered']:
            st.write('• ' + pair)
    if result['error']:
        st.error(result['error'])
    explanation = result['explanation']
    if explanation:
        if explanation.generated:
            st.info('AI-generated explanation. Citation IDs are checked; medical accuracy still requires review.')
        else:
            st.info('Demo mode: prepared summaries from the evidence catalog. No LLM call was made.')
        st.caption(explanation.label)
        for finding in explanation.findings:
            st.write(f"[{finding['evidence_id']}] {finding['explanation']}")
    for record in result['records']:
        source = record['source']
        with st.expander(f"[{record['id']}] {' + '.join(record['names'])} — view evidence", expanded=True):
            st.write(record['finding'])
            st.markdown('> ' + source['quote'])
            st.write('Listed table entry: ' + record['table_entry'])
            st.link_button('Read the DailyMed label', source['url'])
            st.caption(f"{source['title']} · Section {source['section']} · Version {source['version']} · Updated {source['updated']} · Retrieved {source['retrieved']}")
            st.caption(f"TF-IDF cosine similarity: {record['retrieval_score']}")

st.divider()
st.button('Clear this session', on_click=sample, args=('',))
st.caption('Inputs stay in this app session. When a model provider is configured, only matched medication names and retrieved evidence are sent to it.')
