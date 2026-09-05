"""Convert locally captured survey DOM into answer-free, reviewable metadata."""
import json
import re
from pathlib import Path
from lxml import html


def text(node):
    return re.sub(r"\s+", " ", node.text_content()).strip()


def extract(question, page_index, page):
    root = html.fromstring(question["html"])
    title = root.xpath('.//div[starts-with(@id,"question-title-")]')[0]
    number = int(re.match(r"\*?(\d+)", text(title))[1])
    prompt = title.xpath('.//span[contains(@class,"smqr-richText-")]')[0]
    inputs = root.xpath('.//input|.//textarea|.//select')
    labels = {label.get("for"): text(label) for label in root.xpath('.//label[@for]')}
    choices = [i for i in inputs if i.get("type") in ("radio", "checkbox")]
    validation = {"sourceQuestionId": question["id"].removeprefix("question-field-")}
    options = [labels.get(i.get("id"), "") for i in choices]
    kind = "multiple_choice" if any(i.get("type") == "checkbox" for i in choices) else "single_choice"
    rows = root.xpath('.//*[@role="rowheader"]')
    if rows:
        columns = [text(c) for c in root.xpath('.//*[@role="columnheader"]')]
        validation["presentation"] = "matrix"
        validation["fields"] = [dict(key=text(r).rstrip(":"), label=text(r), type="select", options=columns) for r in rows]
        kind, options = "textarea", []
    elif choices:
        comments = [i for i in inputs if i not in choices]
        if comments:
            assert len(comments) == 1, number
            item = comments[0]
            identifier = item.get("id", "")
            comment = {"label": labels.get(identifier) or "Please specify"}
            if "-field-" in identifier:
                choice_id = identifier.replace("-field-", "-input-")
                comment["option"] = labels[choice_id]
                comment["label"] = labels[choice_id]
            validation["comment"] = comment
    elif len(inputs) > 1:
        validation["fields"] = [dict(key=labels[i.get("id")].rstrip(":"), label=labels[i.get("id")],
            type=i.get("type", "text"), required=i.get("aria-required") == "true") for i in inputs]
        kind = "textarea"
    elif inputs and inputs[0].tag == "select":
        options = [text(o) for o in inputs[0].xpath('.//option[@value]') if o.get("value")]
        validation["presentation"] = "dropdown"
    else:
        kind = "textarea" if inputs and inputs[0].tag == "textarea" else "text"
    links = [{"label": text(a), "url": a.get("href")} for a in prompt.xpath('.//a[@href]')]
    if links:
        validation["references"] = links
    return dict(n=number, stableKey=f"CTP25-{number:03}", prompt=text(prompt), type=kind,
        options=options, required="(Required.)" in text(title), validation=validation,
        sectionKey=f"ctp25-page-{page_index:02}", sectionTitle=page["title"],
        category=page["title"].replace(" (cont.)", ""), visibilityRule={})


pages = json.loads(Path("tmp/survey-source/pages.json").read_text(encoding="utf-8"))
questions = [extract(q, index, page) for index, page in enumerate(pages, 1) for q in page["questions"]]
questions[23]["validation"]["sourcePromptAliases"] = ["Are you currently using your transition plan to guide company strategic decisions and actions?"]
assert [q["n"] for q in questions] == list(range(1, 93))
questions[0]["sectionTitle"] = questions[0]["category"] = "Company information"
for question in questions[1:13]:
    question["sectionTitle"] = question["category"] = "Company information"
catalog = dict(source="https://www.surveymonkey.com/r/CTP25-copy", capturedAt="2026-09-05",
    questionCount=92, pageCount=len(pages), questions=questions)
Path("data").mkdir(exist_ok=True)
Path("data/ctp25-catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps([dict(n=q["n"], type=q["type"], options=len(q["options"]), fields=len(q["validation"].get("fields", [])), comment=q["validation"].get("comment")) for q in questions], indent=2))
