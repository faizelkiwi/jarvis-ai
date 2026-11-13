"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders agent output as Markdown. Raw HTML is not rendered (XSS-safe). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-jarvis">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
