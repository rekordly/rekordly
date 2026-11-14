package finance

import (
	"html"
	"net/url"
	"strings"

	xhtml "golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

// maxRichTextBytes caps stored rich text (product long descriptions).
const maxRichTextBytes = 20000

// richTextTags is the full list of tags the rich text editor can produce.
// Everything else is dropped; the text inside unknown tags is kept, except for
// tags whose contents are never text (script, style and similar).
var richTextTags = map[atom.Atom]bool{
	atom.P: true, atom.H2: true, atom.H3: true, atom.Strong: true, atom.B: true,
	atom.Em: true, atom.I: true, atom.U: true, atom.S: true, atom.Blockquote: true,
	atom.Hr: true, atom.Br: true, atom.Ul: true, atom.Ol: true, atom.Li: true, atom.A: true,
}

var richTextVoid = map[atom.Atom]bool{atom.Hr: true, atom.Br: true}

var richTextDropWithContent = map[atom.Atom]bool{
	atom.Script: true, atom.Style: true, atom.Iframe: true, atom.Object: true, atom.Embed: true,
	atom.Noscript: true, atom.Template: true, atom.Svg: true, atom.Math: true, atom.Textarea: true, atom.Select: true,
}

// safeLinkHref returns the link if it is http, https or mailto, otherwise "".
func safeLinkHref(raw string) string {
	value := strings.TrimSpace(raw)
	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}
	switch strings.ToLower(parsed.Scheme) {
	case "http", "https", "mailto":
		return parsed.String()
	}
	return ""
}

// SanitizeRichText keeps only the editor's formatting tags, with no attributes
// except a safe href on links, so stored HTML can be shown on the public store.
func SanitizeRichText(input string) string {
	tokenizer := xhtml.NewTokenizer(strings.NewReader(input))
	var out strings.Builder
	var open []atom.Atom
	skipDepth := 0

	for {
		kind := tokenizer.Next()
		if kind == xhtml.ErrorToken {
			break
		}
		token := tokenizer.Token()
		switch kind {
		case xhtml.TextToken:
			if skipDepth == 0 {
				out.WriteString(html.EscapeString(token.Data))
			}
		case xhtml.StartTagToken, xhtml.SelfClosingTagToken:
			if richTextDropWithContent[token.DataAtom] {
				if kind == xhtml.StartTagToken {
					skipDepth++
				}
				continue
			}
			if skipDepth > 0 || !richTextTags[token.DataAtom] {
				continue
			}
			name := token.DataAtom.String()
			if token.DataAtom == atom.A {
				href := ""
				for _, attr := range token.Attr {
					if attr.Key == "href" {
						href = safeLinkHref(attr.Val)
					}
				}
				if href == "" {
					out.WriteString("<a>")
				} else {
					out.WriteString(`<a href="` + html.EscapeString(href) + `" rel="noopener noreferrer nofollow" target="_blank">`)
				}
			} else {
				out.WriteString("<" + name + ">")
			}
			if richTextVoid[token.DataAtom] {
				continue
			}
			if kind == xhtml.SelfClosingTagToken {
				out.WriteString("</" + name + ">")
				continue
			}
			open = append(open, token.DataAtom)
		case xhtml.EndTagToken:
			if richTextDropWithContent[token.DataAtom] {
				if skipDepth > 0 {
					skipDepth--
				}
				continue
			}
			if skipDepth > 0 || !richTextTags[token.DataAtom] || richTextVoid[token.DataAtom] {
				continue
			}
			// Close up to the matching open tag, so the output is always well nested.
			for i := len(open) - 1; i >= 0; i-- {
				if open[i] == token.DataAtom {
					for j := len(open) - 1; j >= i; j-- {
						out.WriteString("</" + open[j].String() + ">")
					}
					open = open[:i]
					break
				}
			}
		}
	}
	for i := len(open) - 1; i >= 0; i-- {
		out.WriteString("</" + open[i].String() + ">")
	}
	// Editors leave empty paragraphs at the end (and at the start); drop them.
	cleaned := strings.TrimSpace(out.String())
	for strings.HasSuffix(cleaned, "<p></p>") {
		cleaned = strings.TrimSpace(strings.TrimSuffix(cleaned, "<p></p>"))
	}
	for strings.HasPrefix(cleaned, "<p></p>") {
		cleaned = strings.TrimSpace(strings.TrimPrefix(cleaned, "<p></p>"))
	}
	return cleaned
}
