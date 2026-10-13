import { escapeMarkdown } from "../utils/markdown";

describe("escapeMarkdown", () => {
  it("neutralizes images, links and table breaks in resource names", () => {
    expect(escapeMarkdown("![x](https://evil.example/p.png)")).toBe("\\!\\[x\\]\\(https://evil.example/p.png\\)");
    expect(escapeMarkdown("a|b")).toBe("a\\|b");
    expect(escapeMarkdown("**bold** _it_ `code` <b>")).toBe("\\*\\*bold\\*\\* \\_it\\_ \\`code\\` \\<b\\>");
  });

  it("keeps plain names and IPs readable and flattens newlines", () => {
    expect(escapeMarkdown("web-01 10.0.0.5")).toBe("web-01 10.0.0.5");
    expect(escapeMarkdown("line1\nline2")).toBe("line1 line2");
  });
});
