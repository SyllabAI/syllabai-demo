"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** Markdown renderer for corpus content (SME notes, questions, solutions). */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("prose-sm space-y-3 leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // corpus markdown carries light inline HTML (<sub>/<sup> for chemical
        // formulae, <br/>); content is operator-imported, not user input
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-5 border-b pb-1 text-lg font-bold">{children}</h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 text-base font-semibold">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 text-sm font-semibold">{children}</h4>
          ),
          h4: ({ children }) => (
            <h5 className="mt-2 text-[13px] font-semibold text-muted-foreground">{children}</h5>
          ),
          p: ({ children }) => <p className="text-[13.5px] leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 text-[13.5px]">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5 text-[13.5px]">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => (
            <a href={href} className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            const s = typeof src === "string" ? src : "";
            if (s.startsWith("/content-assets/")) {
              return (
                <span className="block overflow-hidden rounded-md border">
                  <Image
                    src={s}
                    alt={alt ?? ""}
                    width={640}
                    height={400}
                    unoptimized
                    className="h-auto w-full max-w-md"
                  />
                </span>
              );
            }
            return <span className="text-sm italic text-muted-foreground">{alt}</span>;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b bg-muted/50 px-2.5 py-1.5 text-left font-medium">{children}</th>
          ),
          td: ({ children }) => <td className="border-b px-2.5 py-1.5 align-top">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="rounded-r-md border-l-2 border-primary/50 bg-primary/5 px-3 py-1.5 text-[13px]">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{children}</code>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
