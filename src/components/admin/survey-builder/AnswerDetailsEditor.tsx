import type { Dispatch, SetStateAction } from "react";
import { answerFields, type AnswerField } from "../../../../shared/survey-answer";
import type { QuestionForm } from "./model";

const inputClass = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export function AnswerDetailsEditor({
  form,
  setForm,
}: {
  form: QuestionForm;
  setForm: Dispatch<SetStateAction<QuestionForm>>;
}) {
  const fields = answerFields(form.validation);
  const matrix = form.validation.presentation === "matrix";
  const comment = form.validation.comment as
    | { label: string; option?: string; required?: boolean }
    | undefined;
  const update = (validation: Record<string, unknown>) =>
    setForm((current) => ({ ...current, validation }));
  const replaceFields = (next: AnswerField[]) => update({ ...form.validation, fields: next });
  if (
    form.type !== "textarea" &&
    !["single_choice", "multiple_choice", "yes_no"].includes(form.type)
  )
    return null;
  return (
    <section className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h2 className="text-sm font-bold">Answer details</h2>
      {form.type === "textarea" ? (
        <>
          <p className="text-xs leading-5 text-slate-600">
            Use separate fields for contact information, supplier tiers, or a list of challenges.
          </p>
          {fields.map((field, index) => (
            <fieldset
              key={field.key}
              className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <legend className="px-1 text-xs font-bold">Field {index + 1}</legend>
              <label className="grid gap-1 text-xs font-medium">
                Label
                <input
                  value={field.label}
                  required
                  className={inputClass}
                  onChange={(event) =>
                    replaceFields(
                      fields.map((item, at) =>
                        at === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium">
                  Answer format
                  <select
                    disabled={matrix}
                    className={inputClass}
                    value={field.type}
                    onChange={(event) =>
                      replaceFields(
                        fields.map((item, at) =>
                          at === index
                            ? { ...item, type: event.target.value as AnswerField["type"] }
                            : item,
                        ),
                      )
                    }
                  >
                    {(["text", "email", "tel", "number", "textarea", "select"] as const).map(
                      (type) => (
                        <option key={type} value={type}>
                          {
                            {
                              text: "Short text",
                              email: "Email",
                              tel: "Phone",
                              number: "Number",
                              textarea: "Long text",
                              select: "Choice list",
                            }[type]
                          }
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(field.required)}
                    onChange={(event) =>
                      replaceFields(
                        fields.map((item, at) =>
                          at === index ? { ...item, required: event.target.checked } : item,
                        ),
                      )
                    }
                  />
                  Required field
                </label>
              </div>
              {field.type === "select" && (!matrix || index === 0) && (
                <label className="grid gap-1 text-xs font-medium">
                  {matrix ? "Choices for every supplier tier" : "Choices (one per line)"}
                  <textarea
                    rows={4}
                    className={inputClass}
                    value={field.options?.join("\n") ?? ""}
                    onChange={(event) =>
                      replaceFields(
                        fields.map((item, at) =>
                          matrix || at === index
                            ? { ...item, options: event.target.value.split("\n") }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              )}
              <button
                type="button"
                className="justify-self-start text-xs font-semibold text-red-700"
                onClick={() => replaceFields(fields.filter((_, at) => at !== index))}
              >
                Remove field
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="justify-self-start text-sm font-semibold text-red-700"
            onClick={() =>
              replaceFields([
                ...fields,
                {
                  key: `field-${crypto.randomUUID()}`,
                  label: `Field ${fields.length + 1}`,
                  type: matrix ? "select" : "text",
                  ...(matrix ? { options: fields[0]?.options ?? [] } : {}),
                },
              ])
            }
          >
            Add field
          </button>
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(comment)}
              onChange={(event) =>
                update({
                  ...form.validation,
                  comment: event.target.checked ? { label: "Please explain" } : undefined,
                })
              }
            />
            Include a written follow-up
          </label>
          {comment && (
            <>
              <label className="grid gap-1 text-xs font-medium">
                Follow-up label
                <input
                  className={inputClass}
                  value={comment.label}
                  onChange={(event) =>
                    update({
                      ...form.validation,
                      comment: { ...comment, label: event.target.value },
                    })
                  }
                />
              </label>
              <label className="grid gap-1 text-xs font-medium">
                Show follow-up
                <select
                  className={inputClass}
                  value={comment.option ?? ""}
                  onChange={(event) =>
                    update({
                      ...form.validation,
                      comment: { ...comment, option: event.target.value || undefined },
                    })
                  }
                >
                  <option value="">For every answer</option>
                  {(form.type === "yes_no"
                    ? ["Yes", "No"]
                    : form.options.split("\n").filter(Boolean)
                  ).map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </>
      )}
    </section>
  );
}
