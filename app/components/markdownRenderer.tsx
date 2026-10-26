'use client';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({
  content,
  className = '',
}: MarkdownRendererProps) {
  if (!content) return null;

  // Split into paragraphs by double newlines
  const paragraphs = content.split(/\n\s*\n/);

  return (
    <div className={`space-y-2 text-sm leading-relaxed ${className}`}>
      {paragraphs.map((paragraph, pIdx) => {
        const lines = paragraph.split('\n');
        return (
          <p key={pIdx}>
            {lines.map((line, lIdx) => {
              // Parse simple bold **text** or *italic*
              const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g);

              return (
                <span key={lIdx}>
                  {parts.map((part, partIdx) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                      return (
                        <strong key={partIdx} className="font-semibold">
                          {part.slice(2, -2)}
                        </strong>
                      );
                    }
                    if (part.startsWith('*') && part.endsWith('*')) {
                      return (
                        <em key={partIdx} className="italic">
                          {part.slice(1, -1)}
                        </em>
                      );
                    }
                    return <span key={partIdx}>{part}</span>;
                  })}
                  {lIdx < lines.length - 1 && <br />}
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

