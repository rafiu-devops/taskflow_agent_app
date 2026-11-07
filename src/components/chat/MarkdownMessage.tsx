"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@/lib/utils";

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-content break-words text-sm leading-6" dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p className="mb-2 whitespace-pre-wrap break-words last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-lg font-semibold text-[var(--ink)] first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-base font-semibold text-[var(--ink)] first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold text-[var(--ink)] first:mt-0">{children}</h3>,
          h4: ({ children }) => <h4 className="mb-1 mt-2 text-sm font-semibold text-[var(--ink)] first:mt-0">{children}</h4>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="break-words">{children}</li>,
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return <code className={cn("block font-mono text-xs text-slate-100", className)}>{children}</code>;
            }
            return <code className="rounded bg-[var(--border)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--ink)]">{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-2xl bg-slate-900 p-3 text-xs leading-5 text-slate-100">{children}</pre>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--brand)] underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-[var(--ink-muted)]">{children}</blockquote>
          ),
          hr: () => <hr className="my-3 border-[var(--border)]" />,
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-[var(--bg)]">{children}</thead>,
          th: ({ children }) => <th className="border-b border-[var(--border)] px-3 py-2 text-left font-semibold text-[var(--ink)]">{children}</th>,
          td: ({ children }) => <td className="border-b border-[var(--border)]/60 px-3 py-2 align-top text-[var(--ink)]">{children}</td>,
          img: () => null,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
