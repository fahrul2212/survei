export function QuestionReferences({ validation }: { validation: Record<string, unknown> }) {
  const references = Array.isArray(validation.references)
    ? validation.references.filter(
        (item): item is { label: string; url: string } =>
          item &&
          typeof item.label === "string" &&
          typeof item.url === "string" &&
          /^https:\/\//i.test(item.url),
      )
    : [];
  if (!references.length) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-3 text-sm">
      {references.map((reference) => (
        <li key={reference.url}>
          <a
            href={reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-700 underline underline-offset-2"
          >
            {reference.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
