import PageLink from '../components/PageLink'

const SOURCE_URL = 'https://github.com/bbrxnd/rx-ocr-interaction-scanner'

const SECTIONS = [
  { id: 'using', title: 'Using the checker' },
  { id: 'behind-the-scenes', title: 'Behind the scenes' },
  { id: 'colors', title: 'What the colors mean' },
  { id: 'limits', title: "What it can't tell you" },
  { id: 'privacy', title: 'Privacy' },
  { id: 'sources', title: 'Data sources' },
]

const SOURCES = [
  {
    name: 'RxNorm and RxClass',
    use: 'Drug names, ingredients and drug classes, from the National Library of Medicine',
    url: 'https://lhncbc.nlm.nih.gov/RxNav/',
  },
  { name: 'openFDA', use: 'The FDA drug labels the checker reads', url: 'https://open.fda.gov/apis/drug/label/' },
  { name: 'DailyMed', use: 'The full label behind every "Open on DailyMed" link', url: 'https://dailymed.nlm.nih.gov/dailymed/' },
  { name: 'EasyOCR', use: 'Reads the text in label photos, on our own server', url: 'https://github.com/JaidedAI/EasyOCR' },
  { name: 'Google Gemini', use: 'Writes the optional plain-language summaries', url: 'https://ai.google.dev/gemini-api/docs' },
]

function SectionTitle({ id, children }: { id: string; children: string }) {
  return <h2 id={`${id}-title`}>{children}</h2>
}

export default function HowItWorks() {
  return (
    <main className="container page-main">
      <div className="hero">
        <h1 id="page-title" tabIndex={-1}>How it works</h1>
        <p className="lede">
          We read the official FDA label for each medicine and show you every place where one label mentions another
          medicine on your list.
        </p>
        <div className="hero-actions">
          <PageLink to="check" className="button primary">Start a check</PageLink>
          <a className="button plain" href={SOURCE_URL} target="_blank" rel="noreferrer">Source code on GitHub</a>
        </div>
      </div>

      <div className="doc-layout">
        <nav className="doc-toc" aria-label="On this page">
          <p>On this page</p>
          <ul>
            {SECTIONS.map((section) => (
              <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
            ))}
          </ul>
        </nav>

        <div className="doc-body">
          <section id="using" aria-labelledby="using-title">
            <SectionTitle id="using">Using the checker</SectionTitle>
            <p className="doc-intro">Six steps, and most people only need the first four.</p>
            <ol className="steps">
              <li>
                <h3>Add each medicine</h3>
                <p>
                  Type a brand or generic name under Search and pick the right match. Adding the strength, like
                  "lisinopril 10 mg", finds the exact product. You can add up to 10 medicines.
                </p>
              </li>
              <li>
                <h3>Or scan the bottle</h3>
                <p>
                  Choose Camera to take a picture of the pharmacy label, or Upload to use a photo you already have.
                  We read the text and pre-select the line with a dose, which is usually the drug. Pick the right
                  line, fix any misread letters, and search for it.
                </p>
                <p className="hint">The first photo can take up to a minute while the text reader starts.</p>
              </li>
              <li>
                <h3>Check interactions</h3>
                <p>We compare every pair on your list. Five medicines make ten pairs.</p>
              </li>
              <li>
                <h3>Read what the labels say</h3>
                <p>
                  Pairs that need a closer look come first. Each shows the exact sentences from the FDA label, with
                  the words that matched highlighted, and a link to the full label on DailyMed.
                </p>
              </li>
              <li>
                <h3>Ask for a plain-language summary</h3>
                <p>
                  Optional. "Explain in plain language" restates the label text in simpler words. Every point quotes
                  the label, and we check each quote word for word before showing it.
                </p>
              </li>
              <li>
                <h3>Take it to a pharmacist</h3>
                <p>"Print for the pharmacist" makes a clean black-and-white page with the list and the label text.</p>
              </li>
            </ol>
          </section>

          <section id="behind-the-scenes" aria-labelledby="behind-the-scenes-title">
            <SectionTitle id="behind-the-scenes">Behind the scenes</SectionTitle>
            <p className="doc-intro">What happens between selecting Check interactions and seeing the results.</p>
            <ol className="pipeline" aria-label="The steps in order">
              <li><span>Your list</span></li>
              <li><span>RxNorm</span></li>
              <li><span>FDA labels</span></li>
              <li><span>Compare every pair</span></li>
              <li><span>Explain (optional)</span></li>
            </ol>
            <ol className="flow">
              <li>
                <span className="flow-label">01 Identify</span>
                <h3>Find the exact drug</h3>
                <p>
                  RxNorm turns a name into one exact drug and its active ingredients. RxClass adds each ingredient's
                  FDA drug class, such as NSAID or benzodiazepine.
                </p>
              </li>
              <li>
                <span className="flow-label">02 Look up</span>
                <h3>Get the newest label</h3>
                <p>
                  openFDA gives us the most recent label with exactly the same ingredients, preferring forms taken by
                  mouth.
                </p>
              </li>
              <li>
                <span className="flow-label">03 Compare</span>
                <h3>Search both labels</h3>
                <p>
                  The risk sections of each label, like the boxed warning and drug interactions, are searched for the
                  other medicine's ingredient and brand names, and for the words labels use for its drug group (about
                  30 groups, like blood thinners, NSAIDs and opioids). Medicines that share an ingredient or group are
                  flagged too.
                </p>
              </li>
              <li>
                <span className="flow-label">04 Explain</span>
                <h3>Summarize, only if asked</h3>
                <p>
                  Gemini receives only the drug names and label text. Points whose quote isn't in the label are
                  removed, and if nothing can be backed by a quote, it says so instead of guessing.
                </p>
              </li>
            </ol>
            <p className="callout">
              <strong>The comparison uses fixed rules, not AI.</strong> The same list always gives the same results,
              and every result points to real label text you can check.
            </p>
          </section>

          <section id="colors" aria-labelledby="colors-title">
            <SectionTitle id="colors">What the colors mean</SectionTitle>
            <p className="doc-intro">Each pair gets the most serious tag that any of its label passages earns.</p>
            <ul className="meaning">
              <li>
                <span className="dot serious" />
                <strong>Serious</strong>
                <p>A boxed warning, a contraindication (who should not take it), or an over-the-counter "Do not use" section mentions the other medicine.</p>
              </li>
              <li>
                <span className="dot warning" />
                <strong>Warning</strong>
                <p>The drug interactions, warnings and precautions, "Ask a doctor" or other warning sections mention the other medicine.</p>
              </li>
              <li>
                <span className="dot shared" />
                <strong>Same ingredient or type</strong>
                <p>Both contain the same ingredient or belong to the same drug group, which can add up to a double dose.</p>
              </li>
              <li>
                <span className="dot clear" />
                <strong>No label warning found</strong>
                <p>Neither label mentions the other. That does not mean they are safe together.</p>
              </li>
            </ul>
          </section>

          <section id="limits" aria-labelledby="limits-title">
            <SectionTitle id="limits">What it can't tell you</SectionTitle>
            <p className="doc-intro">This is a class project to help you prepare questions, not a medical tool.</p>
            <ul className="plain-list">
              <li><strong>A missing warning isn't proof of safety.</strong> Labels don't list every interaction.</li>
              <li><strong>It doesn't know the person:</strong> their doses, timing, allergies, kidney or liver health, or other conditions.</li>
              <li><strong>It only compares medicines on your list.</strong> Foods, alcohol and supplements aren't checked, though the full label and summary may mention them.</li>
              <li><strong>Photo reading can make mistakes.</strong> Always check the line before you search.</li>
              <li><strong>Some medicines have no label in openFDA.</strong> Pairs that include one are only checked against the other medicine's label.</li>
              <li><strong>Always confirm with a pharmacist or doctor</strong> before starting, stopping or changing any medicine.</li>
            </ul>
          </section>

          <section id="privacy" aria-labelledby="privacy-title">
            <SectionTitle id="privacy">Privacy</SectionTitle>
            <ul className="plain-list">
              <li><strong>No accounts, and nothing you enter is saved.</strong> Closing the tab clears your list. Only your light or dark choice is remembered, in your own browser.</li>
              <li><strong>Photos are read on our own server and then discarded.</strong> The live camera picture stays in your browser until you take a photo.</li>
              <li><strong>Drug names</strong> are sent to RxNorm, RxClass and openFDA, which are public U.S. government services.</li>
              <li><strong>Plain-language summaries</strong> send only the drug names and label text to Google Gemini.</li>
              <li><strong>Please don't enter names or other personal details.</strong></li>
            </ul>
          </section>

          <section id="sources" aria-labelledby="sources-title">
            <SectionTitle id="sources">Data sources</SectionTitle>
            <ul className="sources">
              {SOURCES.map((source) => (
                <li key={source.name}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    <strong>{source.name}</strong>
                    <span>{source.use}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <div className="doc-cta">
            <div>
              <h2>Ready to check a list?</h2>
              <p>Add two or more medicines to get started.</p>
            </div>
            <PageLink to="check" className="button primary">Start a check</PageLink>
          </div>
        </div>
      </div>
    </main>
  )
}