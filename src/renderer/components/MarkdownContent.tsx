import { useMemo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useTheme } from "../hooks/useTheme.js";

interface Props {
  content: string;
  /** Clamp text to N lines (CSS line-clamp). Omit for no clamping. */
  clampLines?: number;
}

export default function MarkdownContent({ content, clampLines }: Props) {
  const { theme } = useTheme();
  const syntaxStyle = theme === "dark" ? oneDark : oneLight;

  const wrapperStyle: React.CSSProperties = useMemo(() => {
    if (!clampLines) return {};
    return {
      display: "-webkit-box",
      WebkitLineClamp: clampLines,
      WebkitBoxOrient: "vertical" as const,
      overflow: "hidden",
    };
  }, [clampLines]);

  return (
    <div className="markdown-prose" style={wrapperStyle}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks with syntax highlighting
          code({ className, children, ...rest }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");

            // Inline code (no language class and single-line)
            if (!match) {
              return (
                <code
                  className="inline-code"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--accent)",
                    padding: "1px 5px",
                    borderRadius: "4px",
                    fontSize: "0.85em",
                    fontFamily:
                      "'SF Mono', 'Fira Code', 'Fira Mono', 'Roboto Mono', monospace",
                  }}
                  {...rest}
                >
                  {children}
                </code>
              );
            }

            // Fenced code block
            return (
              <SyntaxHighlighter
                style={syntaxStyle}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: "8px 0",
                  borderRadius: "8px",
                  fontSize: "13px",
                  border: "1px solid var(--border)",
                }}
              >
                {codeString}
              </SyntaxHighlighter>
            );
          },

          // Links
          a({ children, href, ...rest }) {
            return (
              <a
                href={href}
                style={{ color: "var(--accent)", textDecoration: "underline" }}
                target="_blank"
                rel="noopener noreferrer"
                {...rest}
              >
                {children}
              </a>
            );
          },

          // Tables
          table({ children, ...rest }) {
            return (
              <div style={{ overflowX: "auto", margin: "8px 0" }}>
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    fontSize: "0.9em",
                  }}
                  {...rest}
                >
                  {children}
                </table>
              </div>
            );
          },
          th({ children, ...rest }) {
            return (
              <th
                style={{
                  borderBottom: "2px solid var(--border)",
                  padding: "6px 10px",
                  textAlign: "left",
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                }}
                {...rest}
              >
                {children}
              </th>
            );
          },
          td({ children, ...rest }) {
            return (
              <td
                style={{
                  borderBottom: "1px solid var(--border)",
                  padding: "6px 10px",
                }}
                {...rest}
              >
                {children}
              </td>
            );
          },

          // Blockquotes
          blockquote({ children, ...rest }) {
            return (
              <blockquote
                style={{
                  margin: "8px 0",
                  paddingLeft: "12px",
                  borderLeft: "3px solid var(--accent)",
                  color: "var(--text-secondary)",
                }}
                {...rest}
              >
                {children}
              </blockquote>
            );
          },

          // Images
          img({ src, alt, ...rest }) {
            return (
              <img
                src={src}
                alt={alt}
                style={{
                  maxWidth: "100%",
                  borderRadius: "8px",
                  margin: "8px 0",
                }}
                {...rest}
              />
            );
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
